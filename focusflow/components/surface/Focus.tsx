"use client";

import { Play, Pause, RotateCcw, Coffee, Brain } from "lucide-react";
import { useFocusStore, sessionsToday } from "@/store/useFocusStore";
import { useTimerStore, TIMER_MODES, type TimerMode } from "@/store/useTimerStore";
import { cn } from "@/lib/cn";

const ICONS: Record<TimerMode, typeof Brain> = { focus: Brain, short: Coffee, long: Coffee };
const RING = 2 * Math.PI * 130; // circumference for r=130

export function Focus() {
  const completed = sessionsToday(useFocusStore((s) => s.sessions));
  const { mode, remaining, running, toggle, reset, setMode } = useTimerStore();

  const total = TIMER_MODES[mode].minutes * 60;
  const progress = 1 - remaining / total;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-text-parchment md:text-4xl">
          Deep Work Hub
        </h1>
        <p className="mt-1 text-text-bone">Single-task. Protect the flow.</p>
      </div>

      {/* Mode switch */}
      <div className="mb-10 inline-flex rounded-full border border-border-ash bg-background-secondary p-1">
        {(Object.keys(TIMER_MODES) as TimerMode[]).map((m) => {
          const Icon = ICONS[m];
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                mode === m ? "bg-accent-primary text-text-parchment" : "text-text-bone hover:text-text-parchment",
              )}
            >
              <Icon size={16} strokeWidth={1.75} />
              {TIMER_MODES[m].label}
            </button>
          );
        })}
      </div>

      {/* Timer ring */}
      <div className="relative grid place-items-center">
        <svg width="300" height="300" className="-rotate-90">
          <circle cx="150" cy="150" r="130" fill="none" stroke="#3E3730" strokeWidth="6" />
          <circle
            cx="150"
            cy="150"
            r="130"
            fill="none"
            stroke="var(--accent-primary)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="font-display text-7xl font-semibold tabular-nums tracking-tight text-text-parchment">
            {mm}:{ss}
          </span>
          <span className="mt-2 font-mono text-[11px] uppercase tracking-widest text-text-bone">
            {running ? "In session" : "Ready"}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-10 flex items-center gap-4">
        <button
          onClick={reset}
          className="grid h-12 w-12 place-items-center rounded-full border border-border-ash text-text-bone transition-colors hover:border-accent-primary hover:text-accent-primary"
        >
          <RotateCcw size={20} strokeWidth={1.75} />
        </button>
        <button
          onClick={toggle}
          className="grid h-16 w-16 place-items-center rounded-full bg-accent-primary text-text-parchment transition-colors hover:bg-accent-hover active:scale-95"
        >
          {running ? (
            <Pause size={26} strokeWidth={2} fill="currentColor" />
          ) : (
            <Play size={26} strokeWidth={2} fill="currentColor" className="ml-1" />
          )}
        </button>
        <div className="grid h-12 w-12 place-items-center rounded-full border border-border-ash font-mono text-xs text-text-bone">
          {completed}×
        </div>
      </div>

      <p className="mt-6 font-mono text-[11px] tracking-wide text-text-stone">
        {completed} focus sessions completed today
      </p>
    </div>
  );
}
