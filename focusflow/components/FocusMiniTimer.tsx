"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Play, Pause, Timer, X } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useTimerStore, TIMER_MODES, isTimerActive } from "@/store/useTimerStore";

const RING = 2 * Math.PI * 13; // small ring, r=13

/**
 * Floating "picture-in-picture" timer. Mirrors the global Pomodoro so an active
 * session stays visible while you work on other screens. Hidden on the Focus
 * screen itself (the full timer is there) and inside the Vault (camouflage).
 */
export function FocusMiniTimer() {
  const { mode, remaining, running, toggle, reset } = useTimerStore();
  const activeScreen = useAppStore((s) => s.activeScreen);
  const isVaultActive = useAppStore((s) => s.isVaultActive);
  const setScreen = useAppStore((s) => s.setScreen);

  const active = isTimerActive({ mode, remaining, running });
  const show = active && activeScreen !== "focus" && !isVaultActive;

  const total = TIMER_MODES[mode].minutes * 60;
  const progress = 1 - remaining / total;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="fixed right-4 top-[4.5rem] z-50 flex items-center gap-3 rounded-full border border-border-ash bg-background-secondary/95 py-2 pl-2 pr-3 shadow-2xl backdrop-blur-sm md:top-4"
        >
          {/* Click the dial/label to jump to the Focus screen */}
          <button
            onClick={() => setScreen("focus")}
            title="Open Focus"
            className="flex items-center gap-2.5"
          >
            <span className="relative grid h-8 w-8 place-items-center">
              <svg width="32" height="32" className="-rotate-90">
                <circle cx="16" cy="16" r="13" fill="none" stroke="#3E3730" strokeWidth="3" />
                <circle
                  cx="16"
                  cy="16"
                  r="13"
                  fill="none"
                  stroke="var(--accent-primary)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={RING}
                  strokeDashoffset={RING * (1 - progress)}
                  className="transition-[stroke-dashoffset] duration-1000 ease-linear"
                />
              </svg>
              <Timer size={13} className="absolute text-accent-primary" strokeWidth={2} />
            </span>
            <span className="flex flex-col items-start leading-none">
              <span className="font-display text-base font-semibold tabular-nums text-text-parchment">
                {mm}:{ss}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-widest text-text-bone">
                {TIMER_MODES[mode].label}
              </span>
            </span>
          </button>

          <div className="flex items-center gap-1 border-l border-border-ash pl-2">
            <button
              onClick={toggle}
              title={running ? "Pause" : "Resume"}
              className="grid h-7 w-7 place-items-center rounded-full text-text-bone transition-colors hover:bg-background-tertiary hover:text-accent-primary"
            >
              {running ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
            </button>
            <button
              onClick={reset}
              title="Dismiss"
              className="grid h-7 w-7 place-items-center rounded-full text-text-bone transition-colors hover:bg-background-tertiary hover:text-accent-terracotta"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
