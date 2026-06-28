"use client";

import { useEffect } from "react";
import { useVaultStore } from "@/store/useVaultStore";
import { useContactsStore } from "@/store/useContactsStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useAccountStore } from "@/store/useAccountStore";
import { useHydrated } from "./useHydrated";

/**
 * Keeps the secure relay connected in the BACKGROUND so messages arrive (and the
 * favicon can alert you) even while you're on the normal productivity screens —
 * not only while the Vault is open.
 *
 * The live socket persists across surface navigation within a session, but a page
 * reload drops it. So on load we reconnect to EVERY saved contact in the
 * background — each flushes its offline mailbox and resumes live delivery, so a
 * message from any of them reaches you (and bumps unread / the favicon) even
 * while you're on the productivity screens. The most-recent contact becomes the
 * default active view. Gated on "receive offline messages" (Zero-Trace = silent).
 */
export function useVaultBackgroundConnection(): void {
  const hydrated = useHydrated();
  const receiveOffline = useSettingsStore((s) => s.receiveOfflineMessages);
  // Only after the account is unlocked (so contacts are the signed-in user's,
  // and the effect re-runs once a sign-in restores them).
  const signedIn = useAccountStore((s) => s.status === "unlocked" || s.status === "syncing");

  useEffect(() => {
    if (!hydrated || !receiveOffline || !signedIn) return;

    // An invite link drives its own (foreground) join — don't race it.
    if (new URLSearchParams(window.location.search).get("vault")) return;

    const contacts = useContactsStore.getState().contacts;
    if (contacts.length === 0) return;

    // Most-recent first → becomes the default active room.
    const sorted = [...contacts].sort(
      (a, b) => (b.lastConnectedAt ?? b.createdAt) - (a.lastConnectedAt ?? a.createdAt),
    );

    void (async () => {
      const roomIds = await Promise.all(
        sorted.map((c) => useVaultStore.getState().connectBackground(c.token)),
      );
      const vault = useVaultStore.getState();
      const firstRoom = roomIds.find((id): id is string => !!id);
      if (firstRoom && !vault.activeRoomId) vault.setActiveRoom(firstRoom);
    })();
  }, [hydrated, receiveOffline, signedIn]);
}
