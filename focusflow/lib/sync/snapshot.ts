/**
 * sync/snapshot.ts — Serialise / restore all of a user's data across the domain
 * stores. This plaintext snapshot is encrypted before it ever leaves the device,
 * so signing in on a new device restores everything.
 *
 * Included: notes, tasks, calendar, habits, focus history, settings, and saved
 * Vault contacts. NOT included by design: live Vault message history — the Vault
 * is Zero-Trace (memory-only), so messages are never persisted or synced. Your
 * contact list transfers, and reconnecting on the new device re-establishes the
 * encrypted session.
 */

import { useNotesStore } from "@/store/useNotesStore";
import { useTasksStore } from "@/store/useTasksStore";
import { useCalendarStore } from "@/store/useCalendarStore";
import { useHabitsStore } from "@/store/useHabitsStore";
import { useFocusStore } from "@/store/useFocusStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useContactsStore } from "@/store/useContactsStore";

export interface Snapshot {
  v: 1 | 2;
  notes: { notes: unknown[]; folders: string[]; activeId: string | null };
  tasks: { tasks: unknown[] };
  calendar: { events: unknown[] };
  habits: { habits: unknown[] };
  focus: { sessions: unknown[] };
  settings: {
    profileName: string;
    plan: string;
    accent: string;
    requireVaultPin: boolean;
    receiveOfflineMessages?: boolean;
    offlineNoticeAck?: boolean;
  };
  /** Saved Vault contacts (added in v2). */
  contacts?: { contacts: unknown[] };
}

export function collectSnapshot(): Snapshot {
  const n = useNotesStore.getState();
  const t = useTasksStore.getState();
  const c = useCalendarStore.getState();
  const h = useHabitsStore.getState();
  const f = useFocusStore.getState();
  const s = useSettingsStore.getState();
  const ct = useContactsStore.getState();
  return {
    v: 2,
    notes: { notes: n.notes, folders: n.folders, activeId: n.activeId },
    tasks: { tasks: t.tasks },
    calendar: { events: c.events },
    habits: { habits: h.habits },
    focus: { sessions: f.sessions },
    settings: {
      profileName: s.profileName,
      plan: s.plan,
      accent: s.accent,
      requireVaultPin: s.requireVaultPin,
      receiveOfflineMessages: s.receiveOfflineMessages,
      offlineNoticeAck: s.offlineNoticeAck,
    },
    contacts: { contacts: ct.contacts },
  };
}

/** Replaces local data with a decrypted snapshot (remote-wins on unlock). */
export function applySnapshot(snap: Snapshot) {
  if (!snap || (snap.v !== 1 && snap.v !== 2)) return;
  // setState merges shallowly, so actions on each store are preserved.
  useNotesStore.setState({
    notes: snap.notes.notes as never,
    folders: snap.notes.folders,
    activeId: snap.notes.activeId,
  });
  useTasksStore.setState({ tasks: snap.tasks.tasks as never });
  useCalendarStore.setState({ events: snap.calendar.events as never });
  useHabitsStore.setState({ habits: snap.habits.habits as never });
  useFocusStore.setState({ sessions: snap.focus.sessions as never });

  const set = snap.settings;
  useSettingsStore.setState({
    profileName: set.profileName,
    plan: set.plan,
    accent: set.accent as never,
    requireVaultPin: set.requireVaultPin,
    // Newer fields — only override when present so older snapshots keep defaults.
    ...(set.receiveOfflineMessages !== undefined
      ? { receiveOfflineMessages: set.receiveOfflineMessages }
      : {}),
    ...(set.offlineNoticeAck !== undefined ? { offlineNoticeAck: set.offlineNoticeAck } : {}),
  });

  if (snap.contacts) {
    useContactsStore.setState({ contacts: snap.contacts.contacts as never });
  }
}

/** Subscribes to every domain store; calls `cb` (debounced by the caller) on change. */
export function subscribeAll(cb: () => void): () => void {
  const unsubs = [
    useNotesStore.subscribe(cb),
    useTasksStore.subscribe(cb),
    useCalendarStore.subscribe(cb),
    useHabitsStore.subscribe(cb),
    useFocusStore.subscribe(cb),
    useSettingsStore.subscribe(cb),
    useContactsStore.subscribe(cb),
  ];
  return () => unsubs.forEach((u) => u());
}
