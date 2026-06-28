import { create } from "zustand";
import { useFocusStore } from "./useFocusStore";

export type TimerMode = "focus" | "short" | "long";

export const TIMER_MODES: Record<TimerMode, { label: string; minutes: number }> = {
  focus: { label: "Deep Work", minutes: 25 },
  short: { label: "Short Break", minutes: 5 },
  long: { label: "Long Break", minutes: 15 },
};

const seconds = (m: TimerMode) => TIMER_MODES[m].minutes * 60;

interface TimerState {
  mode: TimerMode;
  remaining: number; // seconds left
  running: boolean;

  start: () => void;
  pause: () => void;
  toggle: () => void;
  reset: () => void;
  setMode: (m: TimerMode) => void;
  /** Called once per second by the global ticker in AppShell. */
  tick: () => void;
}

/**
 * Global Pomodoro timer. Lives outside any screen so it keeps counting while you
 * navigate around the app — and a floating mini-widget can mirror it. In-memory
 * only (a half-finished timer surviving a refresh would be odd).
 */
export const useTimerStore = create<TimerState>((set, get) => ({
  mode: "focus",
  remaining: seconds("focus"),
  running: false,

  start: () =>
    set((s) => ({ running: true, remaining: s.remaining <= 0 ? seconds(s.mode) : s.remaining })),
  pause: () => set({ running: false }),
  toggle: () => (get().running ? get().pause() : get().start()),
  reset: () => set((s) => ({ running: false, remaining: seconds(s.mode) })),
  setMode: (mode) => set({ mode, remaining: seconds(mode), running: false }),

  tick: () => {
    const { running, remaining, mode } = get();
    if (!running) return;
    if (remaining <= 1) {
      // Session finished: log a completed deep-work block, then reset to ready.
      if (mode === "focus") useFocusStore.getState().logSession(TIMER_MODES.focus.minutes);
      set({ running: false, remaining: seconds(mode) });
      return;
    }
    set({ remaining: remaining - 1 });
  },
}));

/** A timer is "active" (worth showing in the mini-widget) once it's been started. */
export function isTimerActive(s: Pick<TimerState, "running" | "remaining" | "mode">) {
  return s.running || s.remaining < seconds(s.mode);
}
