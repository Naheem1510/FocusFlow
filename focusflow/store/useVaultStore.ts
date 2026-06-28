import { create } from "zustand";
import {
  VaultConnection,
  createRoom,
  joinViaInvite,
  type LiveMessage,
  type PeerHint,
  type PeerIdentity,
  type ConnectionCallbacks,
} from "@/lib/vault/connection";
import type { SocketState } from "@/lib/vault/socket";
import { loadVaultIdentity, type VaultIdentity } from "@/lib/vault/identity";
import { ensurePreKeysPublished } from "@/lib/vault/prekeys";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useContactsStore } from "@/store/useContactsStore";
import { useAppStore } from "@/store/useAppStore";

/**
 * The Vault is real-only and now MULTI-ROOM: several encrypted rooms can stay
 * connected at once (one per saved contact). Each is its own RoomSession with
 * its own connection, messages, presence and unread count. The UI shows one
 * "active" room at a time, while the others receive in the background — so a
 * message from any contact reaches you (and bumps unread) even while you're
 * looking at someone else or sitting on the productivity screens.
 */

/** A real participant we've established an encrypted channel with. */
export interface VaultPeer extends PeerIdentity {
  online: boolean;
}

export interface RoomSession {
  roomId: string;
  token: string | null;
  connectionState: SocketState;
  fingerprint: string | null;
  peerCount: number;
  peers: Record<string, VaultPeer>;
  peerTyping: boolean;
  typingPeerId: string | null;
  messages: LiveMessage[];
  roomNotice: "expiring" | "destroyed" | null;
  /** Non-self messages received while this room wasn't being viewed. */
  unread: number;
  /** True for group rooms (multi-member, multi-recipient encryption). */
  isGroup: boolean;
}

// ─── Live connections (held outside React state — not serialisable) ────────────

const connections = new Map<string, VaultConnection>();

interface VaultState {
  sessions: Record<string, RoomSession>;
  activeRoomId: string | null;
  /** Whether a foreground connect (create/join) is in flight. */
  connecting: boolean;
  error: string | null;
  burnArmed: boolean;

  // ── selectors ──
  active: () => RoomSession | null;
  inRoom: () => boolean;
  totalUnread: () => number;
  peerName: (senderId: string) => string;

  // ── actions ──
  toggleBurn: () => void;
  expireMessage: (id: string) => void;
  startLiveRoom: () => Promise<void>;
  /** Creates a named GROUP room and brings it to the foreground. */
  startGroup: (name: string) => Promise<void>;
  /** Joins a room and brings it to the foreground (the active view). */
  joinLiveRoom: (token: string, password?: string) => Promise<void>;
  /** Connects a room in the background (no view change) — returns its roomId. */
  connectBackground: (token: string) => Promise<string | null>;
  /** Brings a contact's room to the foreground, reusing a live session if any. */
  openContact: (token: string) => Promise<void>;
  setActiveRoom: (roomId: string) => void;
  /** Marks the active room read (called when the Vault is on screen). */
  markActiveRead: () => void;
  sendLive: (body: string) => void;
  notifyTyping: () => void;
  reactTo: (messageId: string, emoji: string) => void;
  /** Leaves & disconnects the active room. */
  leaveActive: () => void;
  /** Disconnects every room (e.g. when turning Zero-Trace back on). */
  leaveAll: () => void;
  clearError: () => void;
}

function emptySession(roomId: string, token: string | null, isGroup = false): RoomSession {
  return {
    roomId,
    token,
    connectionState: "connecting",
    fingerprint: null,
    peerCount: 0,
    peers: {},
    peerTyping: false,
    typingPeerId: null,
    messages: [],
    roomNotice: null,
    unread: 0,
    isGroup,
  };
}

export const useVaultStore = create<VaultState>((set, get) => {
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const ownDisplayName = () =>
    useSettingsStore.getState().profileName?.trim() || "You";

  const hintForToken = (token: string): PeerHint | null => {
    const c = useContactsStore.getState().findByToken(token);
    return c?.peerUserId && c?.peerKey
      ? { userId: c.peerUserId, publicKeyB64: c.peerKey }
      : null;
  };

  const isGroupToken = (token: string | null): boolean =>
    !!(token && useContactsStore.getState().findByToken(token)?.isGroup);

  /** Cached member identities for a group room → pre-derivable pairwise keys. */
  const rosterForToken = (token: string | null): PeerHint[] => {
    if (!token) return [];
    const c = useContactsStore.getState().findByToken(token);
    return (c?.members ?? []).map((m) => ({ userId: m.userId, publicKeyB64: m.key }));
  };

  const openConnection = (
    roomId: string,
    token: string | null,
    identity: VaultIdentity,
  ) => {
    if (connections.has(roomId)) return;
    const group = isGroupToken(token);
    const conn = new VaultConnection(
      roomId,
      identity,
      ownDisplayName(),
      makeCallbacks(set, get, roomId, token),
      group
        ? { roster: rosterForToken(token), isGroup: true }
        : { peerHint: token ? hintForToken(token) : null },
    );
    connections.set(roomId, conn);
    conn.connect();
  };

  const closeConnection = (roomId: string) => {
    connections.get(roomId)?.disconnect();
    connections.delete(roomId);
    const t = typingTimers.get(roomId);
    if (t) clearTimeout(t);
    typingTimers.delete(roomId);
  };

  return {
    sessions: {},
    activeRoomId: null,
    connecting: false,
    error: null,
    burnArmed: false,

    active: () => {
      const { sessions, activeRoomId } = get();
      return activeRoomId ? sessions[activeRoomId] ?? null : null;
    },
    inRoom: () => get().activeRoomId !== null,
    totalUnread: () =>
      Object.values(get().sessions).reduce((n, s) => n + s.unread, 0),
    peerName: (senderId) => {
      const sess = get().active();
      return sess?.peers[senderId]?.name ?? `Contact ${senderId.slice(0, 4)}`;
    },

    toggleBurn: () => set((s) => ({ burnArmed: !s.burnArmed })),

    expireMessage: (id) =>
      set((s) => {
        const next: Record<string, RoomSession> = {};
        for (const [rid, sess] of Object.entries(s.sessions)) {
          next[rid] = { ...sess, messages: sess.messages.filter((m) => m.id !== id) };
        }
        return { sessions: next };
      }),

    startLiveRoom: async () => {
      set({ connecting: true, error: null });
      try {
        const identity = await currentIdentity();
        const { roomId, token } = await createRoom(identity.userId);
        set((s) => ({
          connecting: false,
          activeRoomId: roomId,
          sessions: { ...s.sessions, [roomId]: emptySession(roomId, token) },
        }));
        openConnection(roomId, token, identity);
      } catch {
        set({
          connecting: false,
          error:
            "Couldn't reach the secure relay. Is the secure-workspace worker running? (npm run dev:worker)",
        });
      }
    },

    startGroup: async (name) => {
      set({ connecting: true, error: null });
      try {
        const identity = await currentIdentity();
        const { roomId, token } = await createRoom(identity.userId);
        // Save it as a group BEFORE connecting so openConnection sees isGroup.
        useContactsStore.getState().saveContact({ name, token, roomId, isGroup: true });
        set((s) => ({
          connecting: false,
          activeRoomId: roomId,
          sessions: { ...s.sessions, [roomId]: emptySession(roomId, token, true) },
        }));
        openConnection(roomId, token, identity);
      } catch {
        set({
          connecting: false,
          error:
            "Couldn't reach the secure relay. Is the secure-workspace worker running? (npm run dev:worker)",
        });
      }
    },

    joinLiveRoom: async (token, password) => {
      set({ connecting: true, error: null });
      try {
        const identity = await currentIdentity();
        const { roomId } = await joinViaInvite(identity.userId, token, password);
        const group = isGroupToken(token);
        set((s) => ({
          connecting: false,
          activeRoomId: roomId,
          sessions: s.sessions[roomId]
            ? { ...s.sessions, [roomId]: { ...s.sessions[roomId], unread: 0 } }
            : { ...s.sessions, [roomId]: emptySession(roomId, token, group) },
        }));
        openConnection(roomId, token, identity);
      } catch (e) {
        set({ connecting: false, error: describeJoinError(e) });
      }
    },

    connectBackground: async (token) => {
      try {
        const identity = await currentIdentity();
        const { roomId } = await joinViaInvite(identity.userId, token);
        if (!connections.has(roomId)) {
          set((s) => ({
            sessions: s.sessions[roomId]
              ? s.sessions
              : { ...s.sessions, [roomId]: emptySession(roomId, token, isGroupToken(token)) },
          }));
          openConnection(roomId, token, identity);
        }
        return roomId;
      } catch {
        return null; // background — stay quiet on failure
      }
    },

    openContact: async (token) => {
      // Reuse a session already connected for this contact's room.
      for (const [rid, sess] of Object.entries(get().sessions)) {
        if (sess.token === token) {
          get().setActiveRoom(rid);
          return;
        }
      }
      await get().joinLiveRoom(token); // not connected yet → join in foreground
    },

    setActiveRoom: (roomId) =>
      set((s) => {
        const sess = s.sessions[roomId];
        if (!sess) return { activeRoomId: roomId };
        return {
          activeRoomId: roomId,
          sessions: { ...s.sessions, [roomId]: { ...sess, unread: 0 } },
        };
      }),

    markActiveRead: () => {
      // Guard BEFORE calling set — a no-op set still notifies subscribers, which
      // would loop if a render effect depends on store state.
      const { activeRoomId, sessions } = get();
      if (!activeRoomId) return;
      const sess = sessions[activeRoomId];
      if (!sess || sess.unread === 0) return;
      set({ sessions: { ...sessions, [activeRoomId]: { ...sess, unread: 0 } } });
    },

    sendLive: (body) => {
      const id = get().activeRoomId;
      if (!id) return;
      const { burnArmed } = get();
      void connections.get(id)?.sendMessage(body, burnArmed ? 30 : null);
    },

    notifyTyping: () => {
      const id = get().activeRoomId;
      if (!id) return;
      const conn = connections.get(id);
      if (!conn) return;
      conn.sendTyping(true);
      const existing = typingTimers.get(id);
      if (existing) clearTimeout(existing);
      typingTimers.set(
        id,
        setTimeout(() => connections.get(id)?.sendTyping(false), 3000),
      );
    },

    reactTo: (messageId, emoji) => {
      const id = get().activeRoomId;
      if (!id) return;
      connections.get(id)?.sendReaction(messageId, emoji);
      applyReaction(set, id, messageId, emoji);
    },

    leaveActive: () =>
      set((s) => {
        const id = s.activeRoomId;
        if (!id) return {};
        closeConnection(id);
        const { [id]: _gone, ...rest } = s.sessions;
        return { sessions: rest, activeRoomId: null };
      }),

    leaveAll: () => {
      for (const roomId of Array.from(connections.keys())) closeConnection(roomId);
      set({ sessions: {}, activeRoomId: null });
    },

    clearError: () => set({ error: null }),
  };
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** userIds we've already published prekeys for this session (publish is idempotent). */
const prekeysPublishedFor = new Set<string>();

/** Loads the identity matching the current offline-delivery preference. */
async function currentIdentity(): Promise<VaultIdentity> {
  const persistent = useSettingsStore.getState().receiveOfflineMessages;
  const identity = await loadVaultIdentity(persistent);
  // Publish one-time prekeys so others can start a forward-secret offline chat.
  if (persistent && !prekeysPublishedFor.has(identity.userId)) {
    prekeysPublishedFor.add(identity.userId);
    void ensurePreKeysPublished(identity.userId, identity.publicKeyB64);
  }
  return identity;
}

function describeJoinError(e: unknown): string {
  const msg = e instanceof Error ? e.message : "Join failed";
  if (msg === "WORKER_UNREACHABLE")
    return "Couldn't reach the secure relay. Is the secure-workspace worker running? (npm run dev:worker)";
  if (msg === "WRONG_PASSWORD") return "Incorrect room password.";
  if (msg === "NEEDS_PASSWORD") return "This room requires a password.";
  return "Invalid or expired invite link.";
}

type SetFn = (partial: Partial<VaultState> | ((s: VaultState) => Partial<VaultState>)) => void;
type GetFn = () => VaultState;

/** Immutably patch a single room session by id. */
function patchSession(
  set: SetFn,
  roomId: string,
  patch: Partial<RoomSession> | ((s: RoomSession) => Partial<RoomSession>),
) {
  set((s) => {
    const sess = s.sessions[roomId];
    if (!sess) return {};
    const next = typeof patch === "function" ? patch(sess) : patch;
    return { sessions: { ...s.sessions, [roomId]: { ...sess, ...next } } };
  });
}

function makeCallbacks(
  set: SetFn,
  get: GetFn,
  roomId: string,
  token: string | null,
): ConnectionCallbacks {
  return {
    onState: (state) => patchSession(set, roomId, { connectionState: state }),

    onMessage: (msg) =>
      set((s) => {
        const sess = s.sessions[roomId];
        if (!sess) return {};
        if (sess.messages.some((m) => m.id === msg.id)) return {}; // de-dup
        const viewing =
          useAppStore.getState().isVaultActive && s.activeRoomId === roomId;
        const unread = sess.unread + (!msg.self && !viewing ? 1 : 0);
        return {
          sessions: {
            ...s.sessions,
            [roomId]: { ...sess, messages: [...sess.messages, msg], unread },
          },
        };
      }),

    onFingerprint: (fp) => patchSession(set, roomId, { fingerprint: fp }),

    onPeer: (peer) => {
      patchSession(set, roomId, (sess) => ({
        peers: { ...sess.peers, [peer.id]: { ...peer, online: true } },
      }));
      if (!token) return;
      const contacts = useContactsStore.getState();
      if (contacts.findByToken(token)?.isGroup) {
        // Group: remember every member's identity so we can reach them offline.
        contacts.addGroupMember(token, {
          userId: peer.id,
          name: peer.name,
          key: peer.publicKeyB64,
        });
      } else {
        contacts.cachePeerIdentity(token, peer.id, peer.publicKeyB64);
      }
    },

    onPresence: (peerCount) =>
      patchSession(set, roomId, (sess) => {
        const count = Math.max(0, peerCount);
        // For groups keep the roster visible even as presence fluctuates; for
        // 1:1, clear the (single) peer when they drop so the UI reflects it.
        if (count === 0 && !sess.isGroup) return { peerCount: 0, peers: {} };
        return { peerCount: count };
      }),

    onTyping: (senderId, isTyping) =>
      patchSession(set, roomId, {
        peerTyping: isTyping,
        typingPeerId: isTyping ? senderId : null,
      }),

    onReaction: (targetMessageId, emoji) => applyReaction(set, roomId, targetMessageId, emoji),

    onRoomEvent: (event) => patchSession(set, roomId, { roomNotice: event }),
  };
}

function applyReaction(set: SetFn, roomId: string, messageId: string, emoji: string) {
  patchSession(set, roomId, (sess) => ({
    messages: sess.messages.map((m) => {
      if (m.id !== messageId) return m;
      const reactions = { ...(m.reactions ?? {}) };
      reactions[emoji] = (reactions[emoji] ?? 0) + 1;
      return { ...m, reactions };
    }),
  }));
}
