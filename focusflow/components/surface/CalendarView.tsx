"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus, X, Trash2 } from "lucide-react";
import {
  useCalendarStore,
  type EventCategory,
  type CalEvent,
} from "@/store/useCalendarStore";
import {
  MONTH_NAMES,
  daysInMonth,
  mondayIndex,
  toISODate,
  todayISO,
} from "@/lib/date";
import { cn } from "@/lib/cn";

const CATEGORY: Record<EventCategory, { label: string; cls: string; dot: string }> = {
  work: { label: "Work", cls: "bg-accent-terracotta/15 text-accent-terracotta border-l-accent-terracotta", dot: "bg-accent-terracotta" },
  personal: { label: "Personal", cls: "bg-accent-teal/15 text-accent-teal border-l-accent-teal", dot: "bg-accent-teal" },
  health: { label: "Health", cls: "bg-accent-sage/15 text-accent-sage border-l-accent-sage", dot: "bg-accent-sage" },
};
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Editing = { event?: CalEvent; date: string } | null;

export function CalendarView() {
  const { events, deleteEvent } = useCalendarStore();
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState(todayISO());
  const [editing, setEditing] = useState<Editing>(null);

  const lead = mondayIndex(new Date(cursor.year, cursor.month, 1));
  const total = daysInMonth(cursor.year, cursor.month);
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => toISODate(new Date(cursor.year, cursor.month, i + 1))),
  ];

  const eventsOn = (iso: string) => events.filter((e) => e.date === iso).sort((a, b) => a.time.localeCompare(b.time));
  const selectedEvents = eventsOn(selected);

  const shift = (delta: number) => {
    const m = cursor.month + delta;
    setCursor({ year: cursor.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 });
  };

  return (
    <div className="flex h-full flex-col px-4 py-6 md:px-12 md:py-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text-parchment md:text-4xl">
            {MONTH_NAMES[cursor.month]} {cursor.year}
          </h1>
          <p className="mt-1 text-text-bone">Your month at a glance.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 md:flex">
            {(Object.keys(CATEGORY) as EventCategory[]).map((c) => (
              <span key={c} className="flex items-center gap-1.5 font-mono text-[11px] text-text-bone">
                <span className={cn("h-2 w-2 rounded-full", CATEGORY[c].dot)} />
                {CATEGORY[c].label}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-DEFAULT border border-border-ash">
            <button onClick={() => shift(-1)} className="grid h-9 w-9 place-items-center text-text-bone hover:text-accent-primary">
              <ChevronLeft size={18} />
            </button>
            <button onClick={() => shift(1)} className="grid h-9 w-9 place-items-center text-text-bone hover:text-accent-primary">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="flex flex-col rounded-xl border border-border-ash bg-background-secondary/40 p-3 lg:flex-1">
          <div className="grid grid-cols-7 border-b border-border-ash pb-2">
            {DOW.map((d) => (
              <div key={d} className="text-center font-mono text-[11px] uppercase tracking-wider text-text-bone">{d}</div>
            ))}
          </div>
          <div className="custom-scrollbar grid grid-cols-7 gap-px lg:flex-1 lg:overflow-y-auto">
            {cells.map((iso, i) => {
              if (iso === null) return <div key={`b${i}`} />;
              const dayEvents = eventsOn(iso);
              const isToday = iso === todayISO();
              const isSelected = iso === selected;
              const dayNum = Number(iso.split("-")[2]);
              return (
                <button
                  key={iso}
                  onClick={() => setSelected(iso)}
                  onDoubleClick={() => setEditing({ date: iso })}
                  className={cn(
                    "flex min-h-[64px] flex-col gap-1 rounded p-1.5 text-left transition-colors md:min-h-[84px]",
                    isSelected ? "bg-background-tertiary ring-1 ring-accent-primary" : "hover:bg-background-tertiary/50",
                  )}
                >
                  <span className={cn("grid h-6 w-6 place-items-center rounded-full text-xs", isToday ? "bg-accent-primary font-semibold text-text-parchment" : "text-text-parchment")}>
                    {dayNum}
                  </span>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map((e) => (
                      <div key={e.id} className={cn("truncate rounded-sm border-l-2 px-1 py-0.5 text-[10px] font-medium", CATEGORY[e.category].cls)}>
                        {e.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="px-1 font-mono text-[9px] text-text-stone">+{dayEvents.length - 2} more</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Agenda */}
        <motion.aside
          key={selected}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
          className="flex w-full flex-shrink-0 flex-col rounded-xl border border-border-ash bg-background-secondary p-5 lg:w-72"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-medium text-text-parchment">
              {new Date(selected + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </h2>
            <button
              onClick={() => setEditing({ date: selected })}
              className="grid h-8 w-8 place-items-center rounded-DEFAULT bg-accent-primary text-text-parchment hover:bg-accent-hover active:scale-95"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="custom-scrollbar space-y-3 lg:flex-1 lg:overflow-y-auto">
            {selectedEvents.length === 0 && (
              <p className="font-mono text-xs text-text-stone">No events. Tap + or double-click a day.</p>
            )}
            {selectedEvents.map((e) => (
              <div
                key={e.id}
                onClick={() => setEditing({ event: e, date: e.date })}
                className={cn("group cursor-pointer rounded-DEFAULT border-l-2 bg-background-tertiary p-3", CATEGORY[e.category].cls)}
              >
                <div className="flex items-start justify-between">
                  <p className="text-sm font-medium text-text-parchment">{e.title}</p>
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      deleteEvent(e.id);
                    }}
                    className="text-text-stone opacity-0 transition-opacity hover:text-accent-terracotta group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-text-bone">{e.time} · {CATEGORY[e.category].label}</p>
              </div>
            ))}
          </div>
        </motion.aside>
      </div>

      {editing && <EventEditor editing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EventEditor({ editing, onClose }: { editing: NonNullable<Editing>; onClose: () => void }) {
  const { createEvent, updateEvent } = useCalendarStore();
  const existing = editing.event;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [time, setTime] = useState(existing?.time ?? "09:00");
  const [category, setCategory] = useState<EventCategory>(existing?.category ?? "work");
  const [date, setDate] = useState(existing?.date ?? editing.date);

  const save = () => {
    if (!title.trim()) return;
    if (existing) updateEvent(existing.id, { title: title.trim(), time, category, date });
    else createEvent({ title: title.trim(), time, category, date });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border-ash bg-background-secondary p-6"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-text-parchment">
            {existing ? "Edit event" : "New event"}
          </h2>
          <button onClick={onClose} className="text-text-bone hover:text-text-parchment">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="Event title"
            className="w-full rounded-DEFAULT border border-border-ash bg-background-tertiary px-3 py-2 text-sm text-text-parchment placeholder:text-text-stone outline-none focus:border-accent-primary"
          />
          <div className="grid grid-cols-2 gap-4">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-DEFAULT border border-border-ash bg-background-tertiary px-3 py-2 text-sm text-text-parchment outline-none focus:border-accent-primary"
            />
            <input
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="10:00"
              className="w-full rounded-DEFAULT border border-border-ash bg-background-tertiary px-3 py-2 text-sm text-text-parchment placeholder:text-text-stone outline-none focus:border-accent-primary"
            />
          </div>
          <div className="flex gap-2">
            {(Object.keys(CATEGORY) as EventCategory[]).map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "flex-1 rounded-DEFAULT border px-3 py-2 text-xs font-medium transition-colors",
                  category === c ? CATEGORY[c].cls.replace("border-l-", "border-") : "border-border-ash text-text-bone hover:text-text-parchment",
                )}
              >
                {CATEGORY[c].label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-DEFAULT px-4 py-2 text-sm text-text-bone hover:text-text-parchment">Cancel</button>
          <button
            onClick={save}
            disabled={!title.trim()}
            className="rounded-DEFAULT bg-accent-primary px-5 py-2 text-sm font-medium text-text-parchment transition-colors hover:bg-accent-hover active:scale-[0.97] disabled:opacity-50"
          >
            {existing ? "Save" : "Create event"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
