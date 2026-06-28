"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";

/**
 * Global keyboard gestures for the covert layer:
 *  - Esc            → Panic Exit (instant hard-cut back to Surface)
 *  - Ctrl/Cmd+Shift+K → toggle the Vault open
 */
export function useVaultGestures() {
  const isVaultActive = useAppStore((s) => s.isVaultActive);
  const enterVault = useAppStore((s) => s.enterVault);
  const exitVault = useAppStore((s) => s.exitVault);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isVaultActive) {
        e.preventDefault();
        exitVault();
        return;
      }
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === "k") {
        e.preventDefault();
        if (isVaultActive) exitVault();
        else enterVault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isVaultActive, enterVault, exitVault]);
}

/**
 * Reflects vault state onto <html data-vault>, so the CSS-variable theme
 * swap (terracotta → teal, charcoal → obsidian) crossfades globally.
 */
export function useVaultTheme(isVaultActive: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    if (isVaultActive) root.setAttribute("data-vault", "true");
    else root.removeAttribute("data-vault");
  }, [isVaultActive]);
}
