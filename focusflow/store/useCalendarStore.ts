import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid } from "@/lib/id";
import { todayISO, toISODate } from "@/lib/date";

export type EventCategory = "work" | "personal" | "health";

export interface CalEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  time: string;
  category: EventCategory;
}

interface CalendarState {
  events: CalEvent[];
  createEvent: (input: Omit<CalEvent, "id">) => string;
  updateEvent: (id: string, patch: Partial<Omit<CalEvent, "id">>) => void;
  deleteEvent: (id: string) => void;
}

// Seed a few events relative to today so the calendar always looks alive.
function seedEvents(): CalEvent[] {
  const base = new Date();
  const at = (offset: number) => {
    const d = new Date(base);
    d.setDate(base.getDate() + offset);
    return toISODate(d);
  };
  return [
    { id: "e-s1", date: todayISO(), title: "Design review", time: "10:00", category: "work" },
    { id: "e-s2", date: todayISO(), title: "Yoga", time: "18:00", category: "health" },
    { id: "e-s3", date: at(2), title: "1:1 with Mara", time: "14:30", category: "work" },
    { id: "e-s4", date: at(4), title: "Dentist", time: "09:00", category: "health" },
    { id: "e-s5", date: at(5), title: "Dinner w/ Sol", time: "20:00", category: "personal" },
    { id: "e-s6", date: at(9), title: "Ship FocusFlow v1", time: "All day", category: "work" },
  ];
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set) => ({
      events: seedEvents(),

      createEvent: (input) => {
        const id = uid("e-");
        set((s) => ({ events: [...s.events, { id, ...input }] }));
        return id;
      },

      updateEvent: (id, patch) =>
        set((s) => ({
          events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),

      deleteEvent: (id) =>
        set((s) => ({ events: s.events.filter((e) => e.id !== id) })),
    }),
    { name: "focusflow-calendar" },
  ),
);
