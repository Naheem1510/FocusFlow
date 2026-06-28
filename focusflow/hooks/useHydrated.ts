"use client";

import { useEffect, useState } from "react";

/**
 * Returns true only after the component has mounted on the client. Used to gate
 * rendering of persisted (localStorage-backed) state so the server-rendered HTML
 * and the first client render match — avoiding hydration mismatches.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
