"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Lock,
  Plus,
  Search,
  Send,
  Flame,
  ShieldCheck,
  Paperclip,
  Wifi,
  WifiOff,
  Loader2,
  Copy,
  Check,
  LogOut,
  KeyRound,
  Users,
  SmilePlus,
  Smile,
  UserPlus,
  Bookmark,
  Pencil,
  Trash2,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useVaultStore } from "@/store/useVaultStore";
import { useContactsStore, type SavedContact } from "@/store/useContactsStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { PinGate } from "./PinGate";
import { cn } from "@/lib/cn";

/** Opens a saved contact's room (reusing a live background session) + stamps it. */
function useConnectContact() {
  const openContact = useVaultStore((s) => s.openContact);
  const clearError = useVaultStore((s) => s.clearError);
  const markConnected = useContactsStore((s) => s.markConnected);
  return async (c: SavedContact) => {
    clearError();
    await openContact(c.token);
    if (!useVaultStore.getState().error) markConnected(c.token);
  };
}

const REACTIONS = ["👍", "❤️", "🔥", "😂", "✊"];

// Curated emoji palette for the composer picker (inserted into the message text).
const EMOJI_GROUPS: { label: string; emoji: string[] }[] = [
  {
    label: "Smileys",
    emoji: ["😀", "😄", "😁", "😅", "😂", "🙂", "😉", "😍", "😘", "😎", "🤔", "😴", "😇", "🥳", "😭", "😡", "😱", "🤯", "🤗", "🤫", "🙄", "😬"],
  },
  {
    label: "Gestures",
    emoji: ["👍", "👎", "👌", "✌️", "🤞", "🙏", "👏", "🙌", "🤝", "💪", "✊", "👋", "🫶", "🤙", "👀"],
  },
  {
    label: "Hearts",
    emoji: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❤️‍🔥", "💯", "✨", "⭐", "🔥", "🎉", "🎊"],
  },
  {
    label: "Objects",
    emoji: ["☕", "🍕", "🍻", "🎁", "📌", "💡", "📎", "🔒", "🗝️", "📞", "💬", "✅", "❌", "⚠️", "⏰", "🚀"],
  },
];

// Larger one-tap "stickers" — sent immediately and rendered jumbo (no attachment
// pipeline needed; they ride the existing encrypted text channel as emoji).
const STICKERS = ["🎉", "🥳", "🔥", "❤️", "😂", "😎", "👍", "🙌", "🤝", "✨", "💯", "🙏", "😭", "😍", "🤔", "👀", "🚀", "💀"];

// Built via `new RegExp` so the Unicode (`u`) flag isn't a compile-time literal
// (the tsconfig target predates it); modern browsers support it at runtime.
const RE_HAS_PICTOGRAPH = new RegExp("\\p{Extended_Pictographic}", "u");
const RE_ONLY_EMOJI = new RegExp(
  "^(?:\\p{Extended_Pictographic}|\\uFE0F|\\u200D|[\\u{1F3FB}-\\u{1F3FF}]|\\s)+$",
  "u",
);
const RE_EMOJI_CLUSTER = new RegExp(
  "\\p{Extended_Pictographic}(?:\\u200D\\p{Extended_Pictographic})*[\\u{1F3FB}-\\u{1F3FF}]?\\uFE0F?",
  "gu",
);

/** True when a message is just a few emoji → render it large, sticker-style. */
function isJumboEmoji(body: string): boolean {
  const t = body.trim();
  if (!t || !RE_HAS_PICTOGRAPH.test(t) || !RE_ONLY_EMOJI.test(t)) return false;
  const clusters = t.match(RE_EMOJI_CLUSTER);
  return !!clusters && clusters.length > 0 && clusters.length <= 6;
}

function timeLabel(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Subscribes to the currently-active room session (or null). */
function useActiveSession() {
  return useVaultStore((s) =>
    s.activeRoomId ? s.sessions[s.activeRoomId] ?? null : null,
  );
}

export function Vault() {
  return (
    <PinGate>
      <VaultInner />
    </PinGate>
  );
}

function VaultInner() {
  const exitVault = useAppStore((s) => s.exitVault);
  const s = useVaultStore();
  const active = s.active();
  const contacts = useContactsStore((st) => st.contacts);

  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const inRoom = active !== null;
  const liveMessages = active?.messages ?? [];
  const activeContact = active?.token ? contacts.find((c) => c.token === active.token) : undefined;
  const roomTitle = active
    ? active.isGroup
      ? activeContact?.name ?? `Group ${active.roomId.slice(0, 6)}`
      : Object.values(active.peers)[0]?.name ?? `Room ${active.roomId.slice(0, 6)}`
    : "";

  // Auto-join when arriving via an invite link (?vault=<token>).
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("vault");
    if (token && useVaultStore.getState().activeRoomId === null && !s.connecting) {
      void s.openContact(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Viewing the Vault clears the active room's unread badge. Depends only on the
  // active room + its unread count (not the whole store) to avoid a render loop.
  useEffect(() => {
    useVaultStore.getState().markActiveRead();
  }, [active?.roomId, active?.unread]);

  const messages = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? liveMessages.filter((m) => m.body.toLowerCase().includes(q))
      : liveMessages;
    // Sort by timestamp so messages buffered while offline (older) slot into
    // their real chronological place rather than appending at the bottom.
    return [...list].sort((a, b) => a.ts - b.ts);
  }, [liveMessages, search]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, active?.peerTyping]);

  const handleSend = () => {
    if (!draft.trim()) return;
    s.sendLive(draft);
    setDraft("");
  };

  const handleSendSticker = (sticker: string) => s.sendLive(sticker);

  return (
    <div className="vault-glass flex h-full flex-col bg-background-base text-text-parchment">
      <VaultHeader search={search} setSearch={setSearch} searchable={inRoom} />
      <OfflineNotice />

      {!inRoom ? (
        <NoRoomState onJoin={() => setLobbyOpen(true)} />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Room list */}
          <aside className="hidden w-60 flex-col border-r border-border-ash bg-background-vault md:flex">
            <div className="flex items-center justify-between border-b border-border-ash px-5 py-4">
              <h2 className="font-mono text-[11px] uppercase tracking-widest text-text-bone">
                Secure Room
              </h2>
              <button
                onClick={() => setLobbyOpen(true)}
                title="New secure room"
                className="text-text-bone transition-colors hover:text-accent-primary"
              >
                <Plus size={16} strokeWidth={1.75} />
              </button>
            </div>

            <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto p-3">
              <LiveRoomEntry />

              <div>
                <h3 className="mb-2 px-2 font-mono text-[10px] uppercase tracking-widest text-text-stone">
                  Contacts
                </h3>
                <SavedContactList />
              </div>

              <button
                onClick={() => setLobbyOpen(true)}
                className="mt-2 flex w-full items-center gap-2 rounded-DEFAULT border border-dashed border-accent-primary/40 px-3 py-2.5 text-sm text-accent-primary transition-colors hover:bg-accent-soft"
              >
                <KeyRound size={15} /> New / switch room
              </button>
            </div>

            <div className="border-t border-border-ash p-3 font-mono text-[10px] leading-relaxed text-text-stone">
              <ShieldCheck size={13} className="mb-1 inline text-accent-sage" /> E2E
              encrypted · keys never leave this device.
            </div>
          </aside>

          {/* Message stream */}
          <section className="flex flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-border-ash px-4 py-3 md:px-6">
              <div className="flex items-center gap-2">
                {active.isGroup ? (
                  <Users size={16} className="text-accent-primary" />
                ) : (
                  <Lock size={16} className="text-accent-primary" />
                )}
                <span className="font-medium text-text-parchment">{roomTitle}</span>
                <PeerBadge isGroup={active.isGroup} />
              </div>
              <span className="hidden font-mono text-[11px] text-text-stone md:inline">
                Press Esc to exit
              </span>
            </div>

            {active.roomNotice && (
              <div className="border-b border-accent-ochre/30 bg-accent-ochre/10 px-6 py-2 font-mono text-[11px] text-accent-ochre">
                {active.roomNotice === "expiring"
                  ? "This room will close soon due to inactivity."
                  : "This room has been closed."}
              </div>
            )}

            <div
              ref={scrollRef}
              className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-4 md:p-6"
            >
              {liveMessages.length === 0 && !active.fingerprint && <WaitingForPeer />}
              {liveMessages.length > 0 && messages.length === 0 && (
                <p className="pt-8 text-center font-mono text-[11px] text-text-stone">
                  No messages match “{search.trim()}”.
                </p>
              )}
              {messages.map((m, i) => (
                <Fragment key={m.id}>
                  {m.buffered && !messages[i - 1]?.buffered && <AwayDivider />}
                  <Bubble
                    id={m.id}
                    self={m.self}
                    authorName={m.self ? "You" : s.peerName(m.senderId)}
                    body={m.body}
                    ts={m.ts}
                    burnIn={m.burnIn}
                    index={i}
                    reactions={m.reactions}
                    delivered={m.self && active.peerCount > 0}
                    onReact={(emoji) => s.reactTo(m.id, emoji)}
                  />
                </Fragment>
              ))}
              {active.peerTyping && (
                <p className="px-1 font-mono text-[11px] text-text-bone">
                  {active.typingPeerId ? s.peerName(active.typingPeerId) : "A contact"} is
                  composing…
                </p>
              )}
            </div>

            <Composer
              draft={draft}
              setDraft={setDraft}
              onSend={handleSend}
              onSendSticker={handleSendSticker}
              placeholderName={roomTitle}
              onType={s.notifyTyping}
            />
          </section>

          {/* Room info + real participants */}
          <aside className="hidden w-56 flex-col border-l border-border-ash bg-background-vault lg:flex">
            <RoomInfoPanel />
            <button
              onClick={exitVault}
              className="m-3 rounded-DEFAULT border border-border-ash py-2 font-mono text-[11px] text-text-bone transition-colors hover:border-accent-primary hover:text-accent-primary"
            >
              Exit Vault (Esc)
            </button>
          </aside>
        </div>
      )}

      {lobbyOpen && <Lobby onClose={() => setLobbyOpen(false)} />}
    </div>
  );
}

// ─── Header with live connection status + message search ────────────────────────

function VaultHeader({
  search,
  setSearch,
  searchable,
}: {
  search: string;
  setSearch: (v: string) => void;
  searchable: boolean;
}) {
  const active = useActiveSession();
  const inRoom = active !== null;
  const connectionState = active?.connectionState ?? "disconnected";

  const status = (() => {
    if (!inRoom) return { label: "No active room", icon: ShieldCheck, cls: "text-text-bone" };
    switch (connectionState) {
      case "connected":
        return { label: "Secure Connection", icon: Wifi, cls: "text-accent-primary" };
      case "connecting":
        return { label: "Connecting…", icon: Loader2, cls: "text-accent-ochre", spin: true };
      case "reconnecting":
        return { label: "Reconnecting…", icon: Loader2, cls: "text-accent-ochre", spin: true };
      default:
        return { label: "Offline", icon: WifiOff, cls: "text-text-stone" };
    }
  })();
  const Icon = status.icon;

  return (
    <header className="flex items-center justify-between border-b border-border-ash bg-background-vault px-4 py-3 md:px-8">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-accent-primary">
          <Lock size={20} strokeWidth={1.75} />
          FocusFlow Vault
        </div>
        {searchable && (
          <div className="ml-4 hidden items-center gap-2 rounded-DEFAULT border border-border-ash bg-background-tertiary px-3 py-1.5 md:flex">
            <Search size={15} strokeWidth={1.75} className="text-text-stone" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages…"
              className="w-48 bg-transparent font-mono text-xs text-text-parchment placeholder:text-text-stone outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-text-stone transition-colors hover:text-accent-primary"
                aria-label="Clear search"
              >
                <span className="text-xs">✕</span>
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className={cn("flex items-center gap-1.5 font-mono text-[11px] tracking-wide", status.cls)}>
          <Icon size={14} className={status.spin ? "animate-spin" : ""} />
          {status.label}
        </div>
      </div>
    </header>
  );
}

function PeerBadge({ isGroup }: { isGroup?: boolean }) {
  const active = useActiveSession();
  if (!active) return null;
  if (isGroup) {
    return (
      <span className="flex items-center gap-1 font-mono text-[11px] text-accent-sage">
        <Users size={11} /> {active.peerCount} online
      </span>
    );
  }
  if (!active.fingerprint)
    return <span className="font-mono text-[11px] text-accent-ochre">· awaiting contact</span>;
  return (
    <span className="flex items-center gap-1 font-mono text-[11px] text-accent-sage">
      <Users size={11} /> {active.peerCount} online · verified
    </span>
  );
}

// ─── Offline delivery notice + divider ──────────────────────────────────────────

/** One-time banner letting the user know offline delivery is on (and how to change it). */
function OfflineNotice() {
  const on = useSettingsStore((s) => s.receiveOfflineMessages);
  const acked = useSettingsStore((s) => s.offlineNoticeAck);
  const ack = useSettingsStore((s) => s.ackOfflineNotice);
  const setScreen = useAppStore((s) => s.setScreen);
  if (!on || acked) return null;

  return (
    <div className="flex items-start gap-3 border-b border-accent-ochre/30 bg-accent-ochre/10 px-4 py-2.5 md:px-8">
      <ShieldCheck size={15} className="mt-0.5 flex-shrink-0 text-accent-ochre" />
      <p className="flex-1 text-[12px] leading-relaxed text-text-bone">
        <span className="text-text-parchment">Offline delivery is on.</span> Messages
        sent while you&apos;re away are held encrypted until you reconnect — this keeps
        a long-term key on this device.{" "}
        <button
          onClick={() => setScreen("settings")}
          className="underline transition-colors hover:text-accent-primary"
        >
          Change in Settings
        </button>{" "}
        any time.
      </p>
      <button
        onClick={ack}
        className="flex-shrink-0 rounded-DEFAULT px-2 py-0.5 font-mono text-[10px] text-text-stone transition-colors hover:text-accent-primary"
      >
        Got it
      </button>
    </div>
  );
}

/** Divider marking messages that arrived while the user was offline. */
function AwayDivider() {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-border-ash" />
      <span className="font-mono text-[10px] uppercase tracking-widest text-text-stone">
        Delivered while you were away
      </span>
      <span className="h-px flex-1 bg-border-ash" />
    </div>
  );
}

// ─── Saved contacts ─────────────────────────────────────────────────────────────

/** List of saved contacts — click to open (reusing a live background session). */
function SavedContactList() {
  const contacts = useContactsStore((s) => s.contacts);
  const removeContact = useContactsStore((s) => s.removeContact);
  const sessions = useVaultStore((s) => s.sessions);
  const activeRoomId = useVaultStore((s) => s.activeRoomId);
  const connect = useConnectContact();

  // Per-contact connection state + unread, keyed by invite token.
  const byToken = useMemo(() => {
    const m: Record<string, { unread: number; connected: boolean; active: boolean }> = {};
    for (const sess of Object.values(sessions)) {
      if (sess.token) {
        m[sess.token] = {
          unread: sess.unread,
          connected: sess.connectionState === "connected",
          active: sess.roomId === activeRoomId,
        };
      }
    }
    return m;
  }, [sessions, activeRoomId]);

  const sorted = useMemo(
    () =>
      [...contacts].sort(
        (a, b) => (b.lastConnectedAt ?? b.createdAt) - (a.lastConnectedAt ?? a.createdAt),
      ),
    [contacts],
  );
  if (sorted.length === 0) return null;

  return (
    <ul className="space-y-1">
      {sorted.map((c) => {
        const meta = byToken[c.token];
        const active = meta?.active ?? false;
        const unread = meta?.unread ?? 0;
        return (
          <li key={c.id} className="group/contact flex items-center gap-1">
            <button
              disabled={active}
              onClick={() => void connect(c)}
              title={active ? "Current room" : `Open chat with ${c.name}`}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-DEFAULT border-l-2 px-2 py-2 text-sm transition-colors disabled:cursor-default",
                active
                  ? "border-accent-primary bg-background-tertiary font-medium text-accent-primary"
                  : "border-transparent text-text-bone hover:bg-background-tertiary hover:text-text-parchment",
              )}
            >
              <span className="relative grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-background-tertiary font-display text-[11px] text-text-parchment">
                {c.isGroup ? <Users size={13} /> : c.name[0]?.toUpperCase()}
                {meta?.connected && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent-sage ring-2 ring-background-vault" />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{c.name}</span>
                {c.isGroup && (c.members?.length ?? 0) > 0 && (
                  <span className="truncate font-mono text-[9px] text-text-stone">
                    {c.members!.length + 1} members
                  </span>
                )}
              </span>
              {unread > 0 && !active ? (
                <span className="ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-accent-primary px-1 font-mono text-[10px] font-semibold text-background-vault">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : (
                active && <span className="ml-auto h-2 w-2 rounded-full bg-accent-primary" />
              )}
            </button>
            <button
              onClick={() => removeContact(c.id)}
              title="Remove contact"
              className="flex-shrink-0 p-1 text-text-stone opacity-0 transition-opacity hover:text-accent-terracotta group-hover/contact:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Save the current room as a reusable contact (or manage an existing save). */
function SaveContactControl() {
  const active = useActiveSession();
  const inviteToken = active?.token ?? null;
  const roomId = active?.roomId ?? null;
  const { contacts, saveContact, removeContact } = useContactsStore();

  const existing = contacts.find((c) => c.token === inviteToken);
  const firstPeer = active ? Object.values(active.peers)[0] : undefined;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  // Prefill with the contact's announced name once a peer is known.
  useEffect(() => {
    if (!editing) setName(existing?.name ?? firstPeer?.name ?? "");
  }, [editing, existing, firstPeer]);

  if (!inviteToken) return null;

  const save = () => {
    saveContact({
      name: name || firstPeer?.name || "Unnamed contact",
      token: inviteToken,
      roomId: roomId ?? undefined,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="mb-4">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-text-stone">
          {existing ? "Rename contact" : "Save as contact"}
        </p>
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="Contact name"
            className="min-w-0 flex-1 rounded-DEFAULT border border-border-ash bg-background-tertiary px-2 py-1.5 text-sm text-text-parchment placeholder:text-text-stone outline-none focus:border-accent-primary"
          />
          <button
            onClick={save}
            className="flex-shrink-0 rounded-DEFAULT bg-accent-primary px-3 py-1.5 text-xs font-medium text-text-parchment transition-colors hover:bg-accent-hover"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  if (existing) {
    return (
      <div className="mb-4">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-text-stone">
          Saved contact
        </p>
        <div className="flex items-center gap-2 rounded-DEFAULT border border-accent-sage/30 bg-accent-sage/5 px-2 py-2">
          <Bookmark size={14} className="flex-shrink-0 text-accent-sage" />
          <span className="min-w-0 flex-1 truncate text-sm text-text-parchment">
            {existing.name}
          </span>
          <button
            onClick={() => {
              setName(existing.name);
              setEditing(true);
            }}
            title="Rename"
            className="flex-shrink-0 text-text-stone transition-colors hover:text-accent-primary"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => removeContact(existing.id)}
            title="Remove contact"
            className="flex-shrink-0 text-text-stone transition-colors hover:text-accent-terracotta"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="mb-4 flex w-full items-center justify-center gap-2 rounded-DEFAULT border border-border-ash px-2 py-2 text-sm text-text-bone transition-colors hover:border-accent-primary hover:text-accent-primary"
    >
      <UserPlus size={14} /> Save as contact
    </button>
  );
}

// ─── No room yet ────────────────────────────────────────────────────────────────

function NoRoomState({ onJoin }: { onJoin: () => void }) {
  const { startLiveRoom, connecting, error, clearError } = useVaultStore();
  const hasContacts = useContactsStore((s) => s.contacts.length > 0);

  return (
    <div className="grid flex-1 place-items-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm text-center"
      >
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-accent-primary/15 text-accent-primary ring-1 ring-accent-primary/30">
          <KeyRound size={26} strokeWidth={1.75} />
        </div>
        <h1 className="font-display text-2xl font-semibold text-text-parchment">
          No secure room yet
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-text-bone">
          The Vault only ever shows real, end-to-end encrypted conversations.
          Start a room and share its invite, or join one you were sent.
        </p>

        {error && (
          <p className="mx-auto mt-4 max-w-xs rounded-DEFAULT border border-accent-terracotta/30 bg-accent-terracotta/10 px-3 py-2 text-xs text-accent-terracotta">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            disabled={connecting}
            onClick={() => {
              clearError();
              void startLiveRoom();
            }}
            className="flex w-full max-w-xs items-center justify-center gap-2 rounded-DEFAULT bg-accent-primary px-5 py-2.5 text-sm font-medium text-text-parchment transition-colors hover:bg-accent-hover active:scale-[0.98] disabled:opacity-50"
          >
            {connecting ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
            Create a secure room
          </button>
          <button
            onClick={() => {
              clearError();
              onJoin();
            }}
            className="flex w-full max-w-xs items-center justify-center gap-2 rounded-DEFAULT border border-border-ash px-5 py-2.5 text-sm text-text-bone transition-colors hover:border-accent-primary hover:text-accent-primary"
          >
            <KeyRound size={15} /> Join with an invite link
          </button>
        </div>

        {hasContacts && (
          <div className="mx-auto mt-8 max-w-xs text-left">
            <p className="mb-2 text-center font-mono text-[10px] uppercase tracking-widest text-text-stone">
              Saved contacts
            </p>
            <SavedContactList />
            <p className="mt-2 text-center font-mono text-[10px] text-text-stone">
              Tap a contact to reconnect — no link needed.
            </p>
          </div>
        )}

        <p className="mt-7 flex items-center justify-center gap-1.5 font-mono text-[10px] text-text-stone">
          <ShieldCheck size={12} className="text-accent-sage" /> Keys are generated
          on-device · the relay only sees ciphertext.
        </p>
      </motion.div>
    </div>
  );
}

// ─── Live room helpers ──────────────────────────────────────────────────────────

function LiveRoomEntry() {
  const active = useActiveSession();
  if (!active) return null;
  const peerName = Object.values(active.peers)[0]?.name;
  return (
    <div>
      <h3 className="mb-2 px-2 font-mono text-[10px] uppercase tracking-widest text-text-stone">
        Active
      </h3>
      <div className="flex w-full items-center gap-2 rounded-DEFAULT border-l-2 border-accent-primary bg-background-tertiary px-2 py-2 text-sm font-medium text-accent-primary">
        <Lock size={16} className="opacity-70" />
        <span className="truncate">{peerName ?? `Room ${active.roomId.slice(0, 6)}`}</span>
        <span
          className={cn(
            "ml-auto h-2 w-2 rounded-full",
            active.connectionState === "connected" ? "bg-accent-primary" : "bg-text-stone",
          )}
        />
      </div>
    </div>
  );
}

function WaitingForPeer() {
  return (
    <div className="grid h-full place-items-center">
      <div className="max-w-xs text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent-primary">
          <KeyRound size={22} />
        </div>
        <p className="text-sm text-text-parchment">Waiting for a contact</p>
        <p className="mt-1 font-mono text-[11px] leading-relaxed text-text-stone">
          Share the invite link (right panel). Key exchange completes
          automatically when they join.
        </p>
      </div>
    </div>
  );
}

function RoomInfoPanel() {
  const active = useActiveSession();
  const fingerprint = active?.fingerprint ?? null;
  const inviteToken = active?.token ?? null;
  const peerCount = active?.peerCount ?? 0;
  const [copied, setCopied] = useState(false);
  const participants = active ? Object.values(active.peers) : [];

  const inviteLink =
    typeof window !== "undefined" && inviteToken
      ? `${window.location.origin}/?vault=${inviteToken}`
      : "";

  const copy = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h2 className="mb-4 font-mono text-[11px] uppercase tracking-widest text-text-bone">
        Room Security
      </h2>

      <div className="mb-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-text-stone">
          Presence
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-text-parchment">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              peerCount > 0 ? "bg-accent-primary" : "bg-text-stone",
            )}
          />{" "}
          {peerCount} contact{peerCount === 1 ? "" : "s"} online
        </p>
      </div>

      {/* Real participants — each one completed a live key exchange. */}
      <div className="mb-4">
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-stone">
          Participants
        </p>
        {participants.length === 0 ? (
          <p className="font-mono text-[11px] text-text-stone">
            No contacts have joined yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {participants.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="grid h-7 w-7 place-items-center rounded-full bg-background-tertiary font-display text-[11px] text-text-parchment">
                    {p.name[0]?.toUpperCase()}
                  </div>
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-background-vault",
                      p.online ? "bg-accent-primary" : "bg-text-stone",
                    )}
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm text-text-parchment">{p.name}</p>
                  <p className="font-mono text-[9px] text-text-stone">{p.fingerprint}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-text-stone">
          Session fingerprint
        </p>
        <p className="mt-1 font-mono text-sm text-accent-primary">
          {fingerprint ?? "— pending key exchange —"}
        </p>
        <p className="mt-1 font-mono text-[10px] leading-relaxed text-text-stone">
          Verify this matches your contact&apos;s out-of-band.
        </p>
      </div>

      <div className="mb-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-text-stone">
          Invite link
        </p>
        <button
          onClick={copy}
          className="mt-1 flex w-full items-center gap-2 rounded-DEFAULT border border-border-ash bg-background-tertiary px-2 py-2 text-left transition-colors hover:border-accent-primary"
        >
          <span className="flex-1 truncate font-mono text-[10px] text-text-bone">
            {inviteToken ? inviteLink : "—"}
          </span>
          {copied ? (
            <Check size={14} className="text-accent-sage" />
          ) : (
            <Copy size={14} className="text-text-bone" />
          )}
        </button>
        <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-text-stone">
          This link is reusable — save the person as a contact to skip sharing it
          next time.
        </p>
      </div>

      {/* Save this room as a reusable contact. */}
      <SaveContactControl />
    </div>
  );
}

// ─── Lobby (create / join) ──────────────────────────────────────────────────────

function Lobby({ onClose }: { onClose: () => void }) {
  const { startLiveRoom, startGroup, joinLiveRoom, connecting, error, clearError, leaveActive } =
    useVaultStore();
  const activeRoomId = useVaultStore((s) => s.activeRoomId);
  const [tab, setTab] = useState<"create" | "group" | "join">("create");
  const [token, setToken] = useState("");
  const [groupName, setGroupName] = useState("");

  const tokenFromLink = (v: string) => {
    const m = v.match(/[?&]vault=([^&\s]+)/);
    return m ? decodeURIComponent(m[1]) : v.trim();
  };

  const submit = async () => {
    if (tab === "create") await startLiveRoom();
    else if (tab === "group") await startGroup(groupName);
    else await joinLiveRoom(tokenFromLink(token));
    if (!useVaultStore.getState().error) onClose();
  };

  const TABS: { id: typeof tab; label: string }[] = [
    { id: "create", label: "1:1 room" },
    { id: "group", label: "Group" },
    { id: "join", label: "Join" },
  ];

  return (
    <div
      className="absolute inset-0 z-10 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border-ash bg-background-secondary p-6"
      >
        <div className="mb-1 flex items-center gap-2 font-display text-xl font-semibold text-accent-primary">
          <Lock size={20} /> Secure Room
        </div>
        <p className="mb-5 text-sm text-text-bone">
          Real end-to-end encrypted channel over the secure-workspace relay.
        </p>

        <div className="mb-5 inline-flex rounded-DEFAULT border border-border-ash p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                clearError();
              }}
              className={cn(
                "rounded-sm px-4 py-1.5 text-sm font-medium transition-colors",
                tab === t.id ? "bg-accent-primary text-text-parchment" : "text-text-bone",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "create" && (
          <p className="mb-4 text-sm leading-relaxed text-text-bone">
            Creates a fresh 1:1 room and an invite link. Open the link in another
            tab/device to complete the encrypted handshake.
          </p>
        )}

        {tab === "group" && (
          <div className="mb-4">
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-stone">
              Group name
            </label>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && groupName.trim() && submit()}
              placeholder="e.g. Field Team"
              className="w-full rounded-DEFAULT border border-border-ash bg-background-tertiary px-3 py-2 text-sm text-text-parchment placeholder:text-text-stone outline-none focus:border-accent-primary"
            />
            <p className="mt-2 flex items-start gap-1.5 font-mono text-[10px] leading-relaxed text-text-stone">
              <Users size={12} className="mt-0.5 flex-shrink-0" />
              Creates a group room. Share its invite link with everyone you want in
              — each message is encrypted for every member.
            </p>
          </div>
        )}

        {tab === "join" && (
          <div className="mb-4">
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-stone">
              Invite link or token
            </label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="https://…/?vault=…  or  raw token"
              className="w-full rounded-DEFAULT border border-border-ash bg-background-tertiary px-3 py-2 font-mono text-xs text-text-parchment placeholder:text-text-stone outline-none focus:border-accent-primary"
            />
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-DEFAULT border border-accent-terracotta/30 bg-accent-terracotta/10 px-3 py-2 text-xs text-accent-terracotta">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          {activeRoomId !== null ? (
            <button
              onClick={() => {
                leaveActive();
                onClose();
              }}
              className="flex items-center gap-1.5 text-xs text-text-bone hover:text-accent-primary"
            >
              <LogOut size={14} /> Leave current room
            </button>
          ) : (
            <span />
          )}
          <button
            disabled={
              connecting ||
              (tab === "join" && !token.trim()) ||
              (tab === "group" && !groupName.trim())
            }
            onClick={submit}
            className="flex items-center gap-2 rounded-DEFAULT bg-accent-primary px-5 py-2.5 text-sm font-medium text-text-parchment transition-colors hover:bg-accent-hover active:scale-[0.97] disabled:opacity-50"
          >
            {connecting && <Loader2 size={15} className="animate-spin" />}
            {tab === "create" ? "Create & connect" : tab === "group" ? "Create group" : "Join room"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Emoji & sticker picker ──────────────────────────────────────────────────────

function EmojiStickerPicker({
  onPickEmoji,
  onPickSticker,
  onClose,
}: {
  onPickEmoji: (emoji: string) => void;
  onPickSticker: (sticker: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"emoji" | "stickers">("emoji");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-full left-3 right-3 z-20 mb-2 rounded-2xl border border-border-ash bg-background-secondary shadow-2xl md:left-4 md:right-auto md:w-80"
    >
      <div className="flex items-center justify-between border-b border-border-ash px-3 py-2">
        <div className="inline-flex rounded-DEFAULT border border-border-ash p-0.5">
          {(["emoji", "stickers"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-sm px-3 py-1 text-xs font-medium capitalize transition-colors",
                tab === t ? "bg-accent-primary text-text-parchment" : "text-text-bone",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="font-mono text-[11px] text-text-stone transition-colors hover:text-accent-primary"
        >
          ✕
        </button>
      </div>

      <div className="custom-scrollbar max-h-60 overflow-y-auto p-3">
        {tab === "emoji" ? (
          <div className="space-y-3">
            {EMOJI_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-text-stone">
                  {group.label}
                </p>
                <div className="grid grid-cols-8 gap-1">
                  {group.emoji.map((e, i) => (
                    <button
                      key={`${e}-${i}`}
                      onClick={() => onPickEmoji(e)}
                      className="grid h-8 place-items-center rounded-DEFAULT text-lg transition-transform hover:scale-125 hover:bg-background-tertiary"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {STICKERS.map((stk, i) => (
              <button
                key={`${stk}-${i}`}
                onClick={() => onPickSticker(stk)}
                title="Send sticker"
                className="grid aspect-square place-items-center rounded-xl border border-border-ash bg-background-tertiary text-3xl transition-transform hover:scale-105 hover:border-accent-primary active:scale-95"
              >
                {stk}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Shared pieces ──────────────────────────────────────────────────────────────

function Composer({
  draft,
  setDraft,
  onSend,
  onSendSticker,
  placeholderName,
  onType,
}: {
  draft: string;
  setDraft: (v: string) => void;
  onSend: () => void;
  onSendSticker: (sticker: string) => void;
  placeholderName: string;
  onType?: () => void;
}) {
  const burnArmed = useVaultStore((st) => st.burnArmed);
  const toggleBurn = useVaultStore((st) => st.toggleBurn);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="relative border-t border-border-ash p-3 md:p-4">
      {pickerOpen && (
        <EmojiStickerPicker
          onPickEmoji={(e) => setDraft(draft + e)}
          onPickSticker={(s) => {
            onSendSticker(s);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      <div className="flex items-end gap-2 rounded-xl border border-border-ash bg-background-tertiary p-2 focus-within:border-accent-primary">
        <button
          onClick={toggleBurn}
          title="Self-destruct message"
          className={cn(
            "grid h-9 w-9 flex-shrink-0 place-items-center rounded-DEFAULT transition-colors",
            burnArmed
              ? "bg-accent-primary/20 text-accent-primary"
              : "text-text-stone hover:text-accent-primary",
          )}
        >
          <Flame size={18} strokeWidth={1.75} />
        </button>
        <button
          onClick={() => setPickerOpen((p) => !p)}
          title="Emoji & stickers"
          className={cn(
            "grid h-9 w-9 flex-shrink-0 place-items-center rounded-DEFAULT transition-colors",
            pickerOpen
              ? "bg-accent-primary/20 text-accent-primary"
              : "text-text-stone hover:text-accent-primary",
          )}
        >
          <Smile size={18} strokeWidth={1.75} />
        </button>
        <button
          title="Attach a file (coming soon)"
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-DEFAULT text-text-stone transition-colors hover:text-accent-primary"
        >
          <Paperclip size={18} strokeWidth={1.75} />
        </button>
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onType?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={1}
          placeholder={burnArmed ? "Burn-on-read message…" : `Message ${placeholderName}`}
          className="max-h-32 flex-1 resize-none bg-transparent py-2 text-sm text-text-parchment placeholder:text-text-stone outline-none"
        />
        <button
          onClick={onSend}
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-DEFAULT bg-accent-primary text-background-vault transition-colors hover:bg-accent-hover active:scale-95"
        >
          <Send size={16} strokeWidth={2} />
        </button>
      </div>
      {burnArmed && (
        <p className="mt-1.5 flex items-center gap-1 px-1 font-mono text-[10px] text-accent-primary">
          <Flame size={11} /> This message will self-destruct 30s after being read.
        </p>
      )}
    </div>
  );
}

function Bubble({
  id,
  self,
  authorName,
  body,
  ts,
  burnIn,
  index,
  reactions,
  delivered,
  onReact,
}: {
  id: string;
  self: boolean;
  authorName: string;
  body: string;
  ts: number;
  burnIn: number | null;
  index: number;
  reactions?: Record<string, number>;
  delivered?: boolean;
  onReact?: (emoji: string) => void;
}) {
  const [picker, setPicker] = useState(false);
  const reactionEntries = Object.entries(reactions ?? {});
  const jumbo = isJumboEmoji(body);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.2) }}
      onMouseLeave={() => setPicker(false)}
      className={cn("group flex flex-col gap-1", self ? "items-end" : "items-start")}
    >
      <div className="flex items-baseline gap-2 px-1">
        <span className="text-xs font-medium text-text-bone">{authorName}</span>
        <span className="font-mono text-[10px] text-text-stone">{timeLabel(ts)}</span>
      </div>

      <div className={cn("relative flex items-center gap-2", self && "flex-row-reverse")}>
        <div
          className={cn(
            jumbo
              ? "px-1 py-0.5 text-5xl leading-tight"
              : cn(
                  "max-w-md rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed",
                  self
                    ? "border-accent-primary/30 bg-accent-primary/10 text-text-parchment"
                    : "border-border-ash bg-background-secondary text-text-parchment",
                ),
          )}
        >
          {body}
          {burnIn !== null && <BurnTimer id={id} seconds={burnIn} />}
        </div>

        {onReact && (
          <div className="relative">
            <button
              onClick={() => setPicker((p) => !p)}
              className="opacity-0 transition-opacity hover:text-accent-primary group-hover:opacity-100"
            >
              <SmilePlus size={15} className="text-text-stone hover:text-accent-primary" />
            </button>
            {picker && (
              <div className="absolute bottom-full z-10 mb-1 flex gap-1 rounded-full border border-border-ash bg-background-secondary px-2 py-1 shadow-xl">
                {REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      onReact(emoji);
                      setPicker(false);
                    }}
                    className="text-base transition-transform hover:scale-125"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={cn("flex items-center gap-2 px-1", self && "flex-row-reverse")}>
        {reactionEntries.length > 0 && (
          <div className="flex gap-1">
            {reactionEntries.map(([emoji, count]) => (
              <span
                key={emoji}
                className="flex items-center gap-0.5 rounded-full border border-border-ash bg-background-tertiary px-1.5 py-0.5 text-[11px]"
              >
                {emoji} <span className="font-mono text-[9px] text-text-bone">{count}</span>
              </span>
            ))}
          </div>
        )}
        {self && delivered !== undefined && (
          <span className="font-mono text-[9px] text-text-stone">
            {delivered ? "delivered" : "sent"}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function BurnTimer({ id, seconds }: { id: string; seconds: number }) {
  const expireMessage = useVaultStore((st) => st.expireMessage);
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    if (left <= 0) {
      expireMessage(id);
      return;
    }
    const t = setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [left, id, expireMessage]);

  return (
    <span className="mt-1.5 flex items-center gap-1 font-mono text-[10px] text-accent-primary">
      <Flame size={11} /> burns in {left}s
    </span>
  );
}
