import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Saved Vault contacts. A contact is just a friendly name pointing at a
 * reusable, non-expiring room invite — so you can reconnect to the same person
 * without swapping a link every time.
 *
 * Deliberately the ONLY thing the Vault persists to disk: a display name and a
 * room token. No messages, no encryption keys, no fingerprints are stored —
 * those stay memory-only (Zero Trace). Keys are re-negotiated on each connect.
 */
/** A cached group member (their persistent identity), so we can reach them offline. */
export interface GroupMember {
  userId: string;
  name: string;
  key: string; // base64 SPKI of their identity public key
}

export interface SavedContact {
  id: string;
  name: string;
  /** Reusable room invite token — the durable pointer to the conversation. */
  token: string;
  roomId?: string;
  createdAt: number;
  lastConnectedAt?: number;
  /**
   * The peer's persistent identity, learned during a live handshake. Caching it
   * lets us derive the shared key — and therefore send to them — even while
   * they're offline (and decrypt what they sent us while WE were offline).
   */
  peerUserId?: string;
  peerKey?: string; // base64 SPKI of the peer's identity public key
  /** Group chat: a named room with a roster of multiple members. */
  isGroup?: boolean;
  members?: GroupMember[];
}

interface ContactsState {
  contacts: SavedContact[];
  /** Adds (or updates, deduped by token) a saved contact; returns it. */
  saveContact: (input: {
    name: string;
    token: string;
    roomId?: string;
    isGroup?: boolean;
  }) => SavedContact;
  renameContact: (id: string, name: string) => void;
  removeContact: (id: string) => void;
  /** Stamps when we last reconnected — used to sort most-recent first. */
  markConnected: (token: string) => void;
  /** Records the peer's identity for a room so we can reach them offline. */
  cachePeerIdentity: (token: string, peerUserId: string, peerKey: string) => void;
  /** Adds/updates a group member's cached identity (for offline group delivery). */
  addGroupMember: (token: string, member: GroupMember) => void;
  findByToken: (token: string | null) => SavedContact | undefined;
}

export const useContactsStore = create<ContactsState>()(
  persist(
    (set, get) => ({
      contacts: [],

      saveContact: ({ name, token, roomId, isGroup }) => {
        const clean = name.trim() || (isGroup ? "Unnamed group" : "Unnamed contact");
        const existing = get().contacts.find((c) => c.token === token);
        if (existing) {
          const updated: SavedContact = {
            ...existing,
            name: clean,
            roomId: roomId ?? existing.roomId,
            ...(isGroup !== undefined ? { isGroup } : {}),
          };
          set((s) => ({
            contacts: s.contacts.map((c) => (c.id === existing.id ? updated : c)),
          }));
          return updated;
        }
        const contact: SavedContact = {
          id: crypto.randomUUID(),
          name: clean,
          token,
          roomId,
          createdAt: Date.now(),
          ...(isGroup ? { isGroup: true, members: [] } : {}),
        };
        set((s) => ({ contacts: [...s.contacts, contact] }));
        return contact;
      },

      renameContact: (id, name) =>
        set((s) => ({
          contacts: s.contacts.map((c) =>
            c.id === id ? { ...c, name: name.trim() || c.name } : c,
          ),
        })),

      removeContact: (id) =>
        set((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) })),

      markConnected: (token) =>
        set((s) => ({
          contacts: s.contacts.map((c) =>
            c.token === token ? { ...c, lastConnectedAt: Date.now() } : c,
          ),
        })),

      cachePeerIdentity: (token, peerUserId, peerKey) =>
        set((s) => ({
          contacts: s.contacts.map((c) =>
            c.token === token ? { ...c, peerUserId, peerKey } : c,
          ),
        })),

      addGroupMember: (token, member) =>
        set((s) => ({
          contacts: s.contacts.map((c) => {
            if (c.token !== token) return c;
            const members = c.members ? [...c.members] : [];
            const i = members.findIndex((m) => m.userId === member.userId);
            if (i >= 0) members[i] = member;
            else members.push(member);
            return { ...c, isGroup: true, members };
          }),
        })),

      findByToken: (token) =>
        token ? get().contacts.find((c) => c.token === token) : undefined,
    }),
    { name: "focusflow-vault-contacts" },
  ),
);
