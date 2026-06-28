import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid } from "@/lib/id";
import { todayISO, toISODate, weekDays } from "@/lib/date";

export type HabitIcon = "brain" | "dumbbell" | "book" | "droplets" | "sparkles";

export interface Habit {
  id: string;
  name: string;
  icon: HabitIcon;
  /** ISO day → completed. Sparse map. */
  history: Record<string, boolean>;
}

interface HabitsState {
  habits: Habit[];
  createHabit: (name: string, icon?: HabitIcon) => void;
  deleteHabit: (id: string) => void;
  toggle: (id: string, iso: string) => void;
}

/** Trailing streak counted backwards from today across consecutive done days. */
export function streakOf(habit: Habit): number {
  let streak = 0;
  const d = new Date();
  // Allow today to be incomplete without breaking the streak.
  if (!habit.history[todayISO()]) d.setDate(d.getDate() - 1);
  for (;;) {
    if (habit.history[toISODate(d)]) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

function seedHabits(): Habit[] {
  const week = weekDays();
  const mk = (
    id: string,
    name: string,
    icon: HabitIcon,
    doneIdx: number[],
  ): Habit => ({
    id,
    name,
    icon,
    history: Object.fromEntries(doneIdx.map((i) => [week[i], true])),
  });
  return [
    mk("h-s1", "Meditation", "brain", [0, 1, 2]),
    mk("h-s2", "Exercise", "dumbbell", [0, 2, 3]),
    mk("h-s3", "Read 20 pages", "book", [0, 1, 2, 3, 4]),
    mk("h-s4", "Hydrate (2L)", "droplets", [0, 1, 3]),
  ];
}

export const useHabitsStore = create<HabitsState>()(
  persist(
    (set) => ({
      habits: seedHabits(),

      createHabit: (name, icon = "sparkles") => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set((s) => ({
          habits: [...s.habits, { id: uid("h-"), name: trimmed, icon, history: {} }],
        }));
      },

      deleteHabit: (id) =>
        set((s) => ({ habits: s.habits.filter((h) => h.id !== id) })),

      toggle: (id, iso) =>
        set((s) => ({
          habits: s.habits.map((h) => {
            if (h.id !== id) return h;
            const history = { ...h.history };
            if (history[iso]) delete history[iso];
            else history[iso] = true;
            return { ...h, history };
          }),
        })),
    }),
    { name: "focusflow-habits" },
  ),
);
