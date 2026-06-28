"use client";

import { useEffect } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { screenTransition } from "@/lib/motion";
import { Sidebar } from "./Sidebar";
import { MobileTopBar } from "./MobileTopBar";
import { Dashboard } from "@/components/surface/Dashboard";
import { Notes } from "@/components/surface/Notes";
import { Tasks } from "@/components/surface/Tasks";
import { CalendarView } from "@/components/surface/CalendarView";
import { Focus } from "@/components/surface/Focus";
import { Habits } from "@/components/surface/Habits";
import { Settings } from "@/components/surface/Settings";
import { Support } from "@/components/surface/Support";
import { Vault } from "@/components/vault/Vault";
import { FocusMiniTimer } from "@/components/FocusMiniTimer";
import { useAppStore } from "@/store/useAppStore";
import { useTimerStore } from "@/store/useTimerStore";
import { useAccountStore } from "@/store/useAccountStore";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { RecoveryKeyModal } from "@/components/auth/RecoveryKeyModal";
import { useVaultGestures, useVaultTheme } from "@/hooks/useVaultGestures";
import { useAccentTheme } from "@/hooks/useAccentTheme";
import { useVaultFavicon } from "@/hooks/useVaultFavicon";
import { useVaultBackgroundConnection } from "@/hooks/useVaultBackgroundConnection";
import { useHydrated } from "@/hooks/useHydrated";

function SurfaceRouter() {
  const screen = useAppStore((s) => s.activeScreen);
  switch (screen) {
    case "dashboard":
      return <Dashboard />;
    case "notes":
      return <Notes />;
    case "tasks":
      return <Tasks />;
    case "calendar":
      return <CalendarView />;
    case "focus":
      return <Focus />;
    case "habits":
      return <Habits />;
    case "settings":
      return <Settings />;
    case "support":
      return <Support />;
  }
}

export function AppShell() {
  const isVaultActive = useAppStore((s) => s.isVaultActive);
  const activeScreen = useAppStore((s) => s.activeScreen);
  const enterVault = useAppStore((s) => s.enterVault);

  const hydrated = useHydrated();
  const timerRunning = useTimerStore((s) => s.running);
  // Account-first: the app stays gated behind sign-in until an account is unlocked.
  const signedIn = useAccountStore((s) => s.status === "unlocked" || s.status === "syncing");
  const restoring = useAccountStore((s) => s.restoring);

  // After hydration, try to auto-restore a "remembered" session on this device.
  useEffect(() => {
    if (!hydrated) return;
    if (useAccountStore.getState().status !== "off") {
      useAccountStore.setState({ restoring: false });
      return;
    }
    void useAccountStore.getState().restoreSession();
  }, [hydrated]);

  useVaultGestures();
  useVaultTheme(isVaultActive);
  useAccentTheme();
  useVaultFavicon();
  useVaultBackgroundConnection();

  // Global Pomodoro ticker — drives the timer app-wide (not tied to the Focus
  // screen), so it keeps counting and the mini-widget stays live everywhere.
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => useTimerStore.getState().tick(), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  // Arriving via an invite link (?vault=<token>) opens the Vault directly,
  // which then auto-joins the encrypted room.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("vault")) enterVault();
  }, [enterVault]);

  // Gate on client hydration (and the one-shot remember-me restore) so
  // localStorage-backed screens don't mismatch SSR and we don't flash sign-in.
  if (!hydrated || restoring) {
    return (
      <div className="grid min-h-screen place-items-center bg-background-base">
        <div className="flex items-center gap-2 font-display text-lg font-semibold text-accent-primary">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-accent-primary/15 ring-1 ring-accent-primary/30">
            F
          </span>
          <span className="text-text-parchment">ocusFlow</span>
        </div>
      </div>
    );
  }

  // Require an unlocked account before anything else renders.
  if (!signedIn) {
    return <AuthScreen />;
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-background-base text-text-parchment">
        {/* Surface (productivity) layer — always mounted underneath. */}
        <Sidebar />
        <MobileTopBar />
        <main className="custom-scrollbar surface-content h-screen overflow-y-auto pt-14 md:ml-[260px] md:pt-0">
          {/* Keyed remount fades the incoming screen in. No AnimatePresence /
              mode="wait" here: that could stall the swap (esp. with reduced
              motion) and leave the screen blank after a nav click. */}
          <motion.div
            key={activeScreen}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={screenTransition}
            className="h-full"
          >
            <SurfaceRouter />
          </motion.div>
        </main>

        {/* Floating Pomodoro that follows you across screens. */}
        <FocusMiniTimer />

        {/* One-time "save your recovery key" overlay (sign-up / regenerate). */}
        <RecoveryKeyModal />

        {/* Covert Vault layer — fixed full-screen takeover.
            Enter: 600ms crossfade. Panic Exit (Esc): instant hard-cut. */}
        <AnimatePresence>
          {isVaultActive && (
            <motion.div
              key="vault"
              className="vault-content f-23 fixed inset-0 z-[60]"
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                opacity: { duration: 0.6, ease: [0.4, 0, 0.2, 1] },
                scale: { duration: 0.6, ease: [0.4, 0, 0.2, 1] },
              }}
              // Panic exit must be instant — collapse exit timing on unmount.
              style={{ transitionDuration: "0ms" }}
            >
              <Vault />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
