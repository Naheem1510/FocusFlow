"use client";

import { useEffect } from "react";
import { ACCENTS, useSettingsStore } from "@/store/useSettingsStore";

/**
 * Applies the user's chosen surface accent by setting the --surface-accent*
 * CSS variables on <html>. The Vault sets --accent-primary directly, so its
 * teal still overrides these in vault mode.
 */
export function useAccentTheme() {
  const accent = useSettingsStore((s) => s.accent);
  useEffect(() => {
    const a = ACCENTS[accent] ?? ACCENTS.terracotta;
    const root = document.documentElement.style;
    root.setProperty("--surface-accent", a.primary);
    root.setProperty("--surface-accent-hover", a.hover);
    root.setProperty("--surface-accent-soft", a.soft);
  }, [accent]);
}
