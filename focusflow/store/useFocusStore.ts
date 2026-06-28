import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toISODate, todayISO } from "@/lib/date";

export interface FocusSession {
  ts: number;
  minutes: number;
}

interface FocusState {
  sessions: FocusSession[];
  logSession: (minutes: number) => void;
}

export const useFocusStore = create<FocusState>()(
  persist(
    (set) => ({
      sessions: [],
      logSession: (minutes) =>
        set((s) => ({ sessions: [...s.sessions, { ts: Date.now(), minutes }] })),
    }),
    { name: "focusflow-focus" },
  ),
);

export function sessionsToday(sessions: FocusSession[]): number {
  const t = todayISO();
  return sessions.filter((s) => toISODate(new Date(s.ts)) === t).length;
}

export function minutesToday(sessions: FocusSession[]): number {
  const t = todayISO();
  return sessions
    .filter((s) => toISODate(new Date(s.ts)) === t)
    .reduce((sum, s) => sum + s.minutes, 0);
}

/** Total focus minutes per day for the Mon–Sun week containing today. */
export function weeklyMinutes(sessions: FocusSession[], weekISO: string[]): number[] {
  return weekISO.map((iso) =>
    sessions
      .filter((s) => toISODate(new Date(s.ts)) === iso)
      .reduce((sum, s) => sum + s.minutes, 0),
  );
}
