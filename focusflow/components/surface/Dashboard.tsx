"use client";

import { motion } from "framer-motion";
import { MoreHorizontal, Plus, Check, ChevronRight, Play } from "lucide-react";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { useAppStore } from "@/store/useAppStore";
import { useTasksStore, type Priority } from "@/store/useTasksStore";
import { useNotesStore } from "@/store/useNotesStore";
import { useHabitsStore, streakOf } from "@/store/useHabitsStore";
import { useCalendarStore } from "@/store/useCalendarStore";
import { useFocusStore, weeklyMinutes, minutesToday } from "@/store/useFocusStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import {
  MONTH_NAMES,
  daysInMonth,
  mondayIndex,
  toISODate,
  todayISO,
  weekDays,
  relativeTime,
} from "@/lib/date";
import { htmlToText } from "@/lib/text";
import { cn } from "@/lib/cn";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const PRIORITY_DOT: Record<Priority, string> = {
  high: "bg-accent-terracotta",
  med: "bg-accent-ochre",
  low: "bg-accent-sage",
};

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <motion.section
      variants={item}
      className={cn(
        "rounded-xl border border-border-ash bg-background-secondary p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent-primary/40 hover:shadow-2xl",
        className,
      )}
    >
      {children}
    </motion.section>
  );
}

export function Dashboard() {
  const setScreen = useAppStore((s) => s.setScreen);
  const { tasks, moveTask, createTask } = useTasksStore();
  const { notes, setActive } = useNotesStore();
  const profileName = useSettingsStore((s) => s.profileName);

  const focusTasks = tasks.filter((t) => t.column !== "done").slice(0, 4);
  const recentNotes = [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 2);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-12 md:py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8 flex flex-col gap-4 pt-2 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text-parchment md:text-5xl">
            {greeting}, {profileName || "there"}
          </h1>
          <p className="mt-2 text-text-bone md:text-lg">Let&apos;s set your intentions for today.</p>
        </div>
        <GlobalSearch />
      </motion.div>

      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          <Card>
            <div className="mb-4 flex items-center justify-between border-b border-border-ash pb-3">
              <h2 className="font-display text-xl font-medium text-accent-primary">Focus for Today</h2>
              <button onClick={() => setScreen("tasks")} className="text-text-bone transition-colors hover:text-accent-primary">
                <MoreHorizontal size={20} strokeWidth={1.75} />
              </button>
            </div>
            <ul>
              {focusTasks.length === 0 && (
                <li className="py-6 text-center font-mono text-xs text-text-stone">
                  Nothing queued. Add a task to get started.
                </li>
              )}
              {focusTasks.map((task, i) => (
                <li
                  key={task.id}
                  className={cn(
                    "group flex items-start gap-3 border-l-2 border-l-transparent py-3.5 pl-3 transition-colors hover:border-l-accent-primary",
                    i < focusTasks.length - 1 && "border-b border-b-border-ash",
                  )}
                >
                  <button
                    onClick={() => moveTask(task.id, "done")}
                    title="Mark complete"
                    className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border border-text-stone text-transparent transition-colors hover:border-accent-primary hover:text-accent-primary"
                  >
                    <Check size={12} strokeWidth={2.5} />
                  </button>
                  <div className="flex-1 cursor-pointer" onClick={() => setScreen("tasks")}>
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[task.priority])} />
                      <p className="text-text-parchment transition-colors group-hover:text-accent-primary">{task.title}</p>
                    </div>
                    <p className="mt-1 font-mono text-[11px] tracking-wide text-text-bone">
                      {task.project}
                      {task.due ? ` • ${task.due}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <button
              onClick={() => createTask({ title: "New task", column: "todo" })}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-DEFAULT border border-border-ash py-2.5 text-sm font-medium text-text-bone transition-colors hover:bg-background-tertiary active:scale-[0.98]"
            >
              <Plus size={18} strokeWidth={1.75} /> Add Task
            </button>
          </Card>

          <motion.div variants={item}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-medium text-text-parchment">Recent Notes</h2>
              <button onClick={() => setScreen("notes")} className="flex items-center gap-1 font-mono text-[11px] text-text-bone hover:text-accent-primary">
                All notes <ChevronRight size={13} />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {recentNotes.length === 0 && (
                <p className="font-mono text-xs text-text-stone">No notes yet.</p>
              )}
              {recentNotes.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    setActive(n.id);
                    setScreen("notes");
                  }}
                  className="cursor-pointer rounded-xl border border-border-ash bg-background-secondary p-5 transition-all duration-300 hover:-translate-y-1 hover:border-accent-primary hover:shadow-2xl"
                >
                  <h3 className="mb-1.5 text-sm font-semibold text-accent-primary">{n.title || "Untitled note"}</h3>
                  <p className="line-clamp-3 text-sm leading-relaxed text-text-bone">{htmlToText(n.body) || "No additional text"}</p>
                  <p className="mt-3 font-mono text-[11px] tracking-wide text-text-stone">{relativeTime(n.updatedAt)}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <div className="grid grid-cols-2 gap-4">
            <MiniCalendar />
            <HabitStreak />
          </div>
          <FocusHours />
        </div>
      </motion.div>
    </div>
  );
}

function MiniCalendar() {
  const setScreen = useAppStore((s) => s.setScreen);
  const events = useCalendarStore((s) => s.events);
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const lead = mondayIndex(new Date(year, month, 1));
  const total = daysInMonth(year, month);
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  const hasEvent = (day: number) => events.some((e) => e.date === toISODate(new Date(year, month, day)));

  return (
    <Card className="col-span-2 lg:col-span-2">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-xl font-medium text-text-parchment">{MONTH_NAMES[month]}</h3>
        <button onClick={() => setScreen("calendar")} className="font-mono text-[11px] text-text-bone hover:text-accent-primary">
          Open
        </button>
      </div>
      <div className="mb-2 grid grid-cols-7 gap-1 text-center font-mono text-[11px] text-text-bone">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm text-text-parchment">
        {cells.map((day, i) => {
          if (day === null) return <div key={`b${i}`} />;
          const isToday = day === today.getDate();
          return (
            <button
              key={day}
              onClick={() => setScreen("calendar")}
              className={cn("relative rounded py-1", isToday && "border border-accent-primary bg-accent-soft font-semibold text-accent-primary")}
            >
              {day}
              {hasEvent(day) && <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent-terracotta" />}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function HabitStreak() {
  const setScreen = useAppStore((s) => s.setScreen);
  const habits = useHabitsStore((s) => s.habits);
  const top = habits.length ? [...habits].sort((a, b) => streakOf(b) - streakOf(a))[0] : null;
  const week = weekDays();
  const today = todayISO();

  return (
    <Card className="col-span-2 flex cursor-pointer flex-col justify-center lg:col-span-2" >
      <button onClick={() => setScreen("habits")} className="text-left">
        <h3 className="mb-4 text-sm font-medium text-text-parchment">
          {top ? `${top.name} Streak` : "Habits"}
        </h3>
        {top ? (
          <>
            <div className="flex items-center justify-between">
              {week.map((iso, i) => {
                const done = !!top.history[iso];
                return (
                  <div
                    key={iso}
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded-full border text-[10px] font-mono",
                      done
                        ? "border-accent-sage bg-accent-sage/90 text-background-primary"
                        : iso === today
                          ? "border-border-ash bg-background-tertiary text-text-bone"
                          : "border-dashed border-border-ash text-text-stone",
                    )}
                  >
                    {done ? <Check size={14} strokeWidth={2.5} /> : ["M", "T", "W", "T", "F", "S", "S"][i]}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-center font-mono text-[11px] text-accent-sage">{streakOf(top)} Day Streak</p>
          </>
        ) : (
          <p className="font-mono text-xs text-text-stone">No habits yet.</p>
        )}
      </button>
    </Card>
  );
}

function FocusHours() {
  const setScreen = useAppStore((s) => s.setScreen);
  const sessions = useFocusStore((s) => s.sessions);
  const week = weekDays();
  const perDay = weeklyMinutes(sessions, week); // minutes
  const max = Math.max(60, ...perDay); // at least 1h scale
  const todayMin = minutesToday(sessions);
  const weekTotal = perDay.reduce((a, b) => a + b, 0);

  return (
    <Card>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-xl font-medium text-text-parchment">Focus Hours</h2>
        <span className="font-mono text-[11px] tracking-wide text-text-bone">This Week</span>
      </div>
      <div className="flex h-40 items-end justify-between gap-2 border-b border-border-ash pb-2">
        {perDay.map((m, i) => {
          const pct = Math.max(4, Math.round((m / max) * 100));
          const filled = m > 0;
          return (
            <div key={i} className="group relative flex-1" style={{ height: "100%" }}>
              <div
                className={cn(
                  "absolute bottom-0 w-full overflow-hidden rounded-t-DEFAULT transition-colors",
                  filled ? "bg-accent-primary/80 group-hover:bg-accent-primary" : "border-x border-t border-border-ash bg-background-tertiary",
                )}
                style={{ height: `${pct}%` }}
              >
                {filled && <div className="shimmer-bar h-full w-full animate-shimmer" />}
              </div>
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-[10px] text-accent-primary opacity-0 transition-opacity group-hover:opacity-100">
                {(m / 60).toFixed(1)}h
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between px-1 font-mono text-[10px] text-text-bone">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-border-ash pt-4">
        <div>
          <p className="text-sm text-text-bone">{todayMin > 0 ? "Today" : "This week"}</p>
          <p className="font-display text-2xl font-medium text-accent-primary">
            {((todayMin > 0 ? todayMin : weekTotal) / 60).toFixed(1)}h
          </p>
        </div>
        <button
          onClick={() => setScreen("focus")}
          className="grid h-10 w-10 place-items-center rounded-DEFAULT bg-accent-primary text-text-parchment transition-colors hover:bg-accent-hover active:scale-95"
        >
          <Play size={18} strokeWidth={1.75} fill="currentColor" />
        </button>
      </div>
    </Card>
  );
}
