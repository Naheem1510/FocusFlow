"use client";

import { useEffect } from "react";
import { useVaultStore } from "@/store/useVaultStore";
import { FAVICON_ALERT, FAVICON_IDLE, setFavicon } from "@/lib/favicon";

/**
 * Recolours the favicon when there are unread Vault messages in ANY room. The
 * store only counts a message as unread when you weren't viewing that room (or
 * the Vault was closed), so this naturally reflects "you have something waiting"
 * across every background contact, and clears the moment you read it.
 */
export function useVaultFavicon(): void {
  const totalUnread = useVaultStore((s) =>
    Object.values(s.sessions).reduce((n, x) => n + x.unread, 0),
  );

  useEffect(() => {
    setFavicon(totalUnread > 0 ? FAVICON_ALERT : FAVICON_IDLE);
  }, [totalUnread]);
}
