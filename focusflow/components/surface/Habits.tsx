"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Flame,
  Plus,
  Brain,
  Dumbbell,
  BookOpen,
  Droplets,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  useHabitsStore,
  streakOf,
  type HabitIcon,
} from "@/store/useHabitsStore";
import { weekDays, fromISODate, todayISO } from "@/lib/date";
import { cn } from "@/lib/cn";

const ICONS: Record<HabitIcon, typeof Brain> = {
  brain: Brain,
  dumbbell: Dumbbell,
  book: BookOpen,
  droplets: Droplets,
  sparkles: Sparkles,
};
const DOW = ["M", "T", "W", "T", "F", "S", "S"];

export function Habits() {
  const { habits, toggle, createHabit, deleteHabit } = useHabitsStore();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<HabitIcon>("sparkles");
  const week = weekDays();
  const today = todayISO();

  const completionRate =
    habits.length === 0
      ? 0
      : Math.round(
          (habits.reduce(
            (sum, h) => sum + week.filter((d) => h.history[d]).length,
            0,
          ) /
            (habits.length * 7)) *
            100,
        );
  const bestStreak = habits.length ? Math.max(...habits.map(streakOf)) : 0;

  const submit = () => {
    if (!name.trim()) return;
    createHabit(name, icon);
    setName("");
    setIcon("sparkles");
    setAdding(false);
  };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col px-4 py-6 md:px-12 md:py-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text-parchment md:text-4xl">Habits</h1>
          <p className="mt-1 text-text-bone">Quiet consistency over loud streaks.</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="hidden items-center gap-2 rounded-DEFAULT bg-accent-primary px-4 py-2.5 text-sm font-medium text-text-parchment transition-colors hover:bg-accent-hover active:scale-[0.97] md:flex"
        >
          <Plus size={18} strokeWidth={1.75} /> New Habit
        </button>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Stat label="This week" value={`${completionRate}%`} tone="text-accent-sage" />
        <Stat label="Active habits" value={String(habits.length)} tone="text-text-parchment" />
        <Stat label="Best streak" value={String(bestStreak)} tone="text-accent-ochre" icon />
      </div>

      <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto">
        {habits.length === 0 && (
          <button
            onClick={() => setAdding(true)}
            className="w-full rounded-xl border border-dashed border-border-ash py-10 font-mono text-xs text-text-stone transition-colors hover:border-accent-primary hover:text-accent-primary"
          >
            + Add your first habit
          </button>
        )}
        {habits.map((habit) => {
          const Icon = ICONS[habit.icon];
          const streak = streakOf(habit);
          return (
            <div key={habit.id} className="group flex items-center justify-between rounded-xl border border-border-ash bg-background-secondary p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-DEFAULT bg-background-tertiary text-accent-primary">
                  <Icon size={20} strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-parchment">{habit.name}</p>
                  <p className="flex items-center gap-1 font-mono text-[11px] text-accent-sage">
                    <Flame size={11} /> {streak} day streak
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {week.map((iso, day) => {
                  const done = !!habit.history[iso];
                  const isFuture = fromISODate(iso) > new Date() && iso !== today;
                  return (
                    <div key={iso} className="flex flex-col items-center gap-1">
                      <span className="font-mono text-[9px] text-text-stone">{DOW[day]}</span>
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        disabled={isFuture}
                        onClick={() => toggle(habit.id, iso)}
                        className={cn(
                          "grid h-8 w-8 place-items-center rounded-full border text-[10px] transition-colors",
                          done
                            ? "border-accent-sage bg-accent-sage/90 text-background-primary"
                            : isFuture
                              ? "border-border-ash/50 text-text-stone/40"
                              : "border-dashed border-border-ash text-text-stone hover:border-accent-sage",
                          iso === today && !done && "ring-1 ring-accent-primary/40",
                        )}
                      >
                        {done && <Check size={14} strokeWidth={2.5} />}
                      </motion.button>
                    </div>
                  );
                })}
                <button
                  onClick={() => deleteHabit(habit.id)}
                  className="ml-2 text-text-stone opacity-0 transition-opacity hover:text-accent-terracotta group-hover:opacity-100"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {adding && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setAdding(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border-ash bg-background-secondary p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-text-parchment">New habit</h2>
              <button onClick={() => setAdding(false)} className="text-text-bone hover:text-text-parchment">
                <X size={20} />
              </button>
            </div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="e.g. Morning walk"
              className="w-full rounded-DEFAULT border border-border-ash bg-background-tertiary px-3 py-2 text-sm text-text-parchment placeholder:text-text-stone outline-none focus:border-accent-primary"
            />
            <div className="mt-4 flex gap-2">
              {(Object.keys(ICONS) as HabitIcon[]).map((k) => {
                const Ic = ICONS[k];
                return (
                  <button
                    key={k}
                    onClick={() => setIcon(k)}
                    className={cn(
                      "grid h-10 flex-1 place-items-center rounded-DEFAULT border transition-colors",
                      icon === k ? "border-accent-primary bg-accent-soft text-accent-primary" : "border-border-ash text-text-bone hover:text-text-parchment",
                    )}
                  >
                    <Ic size={18} strokeWidth={1.75} />
                  </button>
                );
              })}
            </div>
            <button
              onClick={submit}
              disabled={!name.trim()}
              className="mt-6 w-full rounded-DEFAULT bg-accent-primary py-2.5 text-sm font-medium text-text-parchment transition-colors hover:bg-accent-hover active:scale-[0.97] disabled:opacity-50"
            >
              Create habit
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, icon }: { label: string; value: string; tone: string; icon?: boolean }) {
  return (
    <div className="rounded-xl border border-border-ash bg-background-secondary p-5">
      <p className="font-mono text-[11px] uppercase tracking-wider text-text-bone">{label}</p>
      <p className={cn("mt-1 flex items-center gap-1 font-display text-3xl font-semibold", tone)}>
        {icon && <Flame size={24} />}
        {value}
      </p>
    </div>
  );
}
