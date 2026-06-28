"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  Calendar,
  Timer,
  Activity,
  Settings,
  LifeBuoy,
  Plus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/Logo";
import { useAppStore, type SurfaceScreen } from "@/store/useAppStore";
import { useNotesStore } from "@/store/useNotesStore";
import { useTasksStore } from "@/store/useTasksStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { cn } from "@/lib/cn";

const NAV: { id: SurfaceScreen; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "notes", label: "Notes", icon: FileText },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "focus", label: "Focus", icon: Timer },
  { id: "habits", label: "Habits", icon: Activity },
];

const FOOTER_NAV: { id: SurfaceScreen; label: string; icon: typeof Settings }[] = [
  { id: "settings", label: "Settings", icon: Settings },
  { id: "support", label: "Support", icon: LifeBuoy },
];

/** Shared nav body used by both the desktop sidebar and the mobile drawer. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const activeScreen = useAppStore((s) => s.activeScreen);
  const isVaultActive = useAppStore((s) => s.isVaultActive);
  const setScreen = useAppStore((s) => s.setScreen);
  const createNote = useNotesStore((s) => s.createNote);
  const createTask = useTasksStore((s) => s.createTask);
  const { profileName, plan } = useSettingsStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (id: SurfaceScreen) => {
    setScreen(id);
    onNavigate?.();
  };

  const quickActions = [
    { label: "New Note", icon: FileText, run: () => { createNote(); go("notes"); } },
    { label: "New Task", icon: CheckSquare, run: () => { createTask({ title: "New task", column: "todo" }); go("tasks"); } },
    { label: "New Event", icon: Calendar, run: () => go("calendar") },
    { label: "New Habit", icon: Activity, run: () => go("habits") },
  ];

  return (
    <>
      <div className="mb-8 px-2">
        <Logo />
      </div>

      <div className="mb-6 flex items-center gap-3 border-b border-border-ash px-2 pb-6">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-background-tertiary ring-1 ring-border-ash">
          <span className="font-display text-sm text-text-parchment">
            {(profileName || "You").charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-text-parchment">
            {profileName || "Set your name"}
          </div>
          <div className="font-mono text-[11px] tracking-wide text-text-bone">{plan}</div>
        </div>
      </div>

      <div className="relative mb-6">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex w-full items-center justify-center gap-2 rounded-DEFAULT bg-accent-primary px-4 py-2.5 text-sm font-medium text-text-parchment transition-colors hover:bg-accent-hover active:scale-[0.97]"
        >
          <Plus size={18} strokeWidth={1.75} /> New Entry
        </button>
        <AnimatePresence>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-DEFAULT border border-border-ash bg-background-secondary p-1 shadow-2xl"
              >
                {quickActions.map(({ label, icon: Icon, run }) => (
                  <button
                    key={label}
                    onClick={() => { run(); setMenuOpen(false); }}
                    className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm text-text-bone transition-colors hover:bg-background-tertiary hover:text-text-parchment"
                  >
                    <Icon size={16} strokeWidth={1.75} /> {label}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = !isVaultActive && activeScreen === id;
          return (
            <button
              key={id}
              onClick={() => go(id)}
              className={cn(
                "group relative flex w-full items-center gap-3 rounded-DEFAULT px-4 py-2.5 text-sm transition-colors",
                active ? "bg-accent-soft text-text-parchment" : "text-text-bone hover:bg-background-tertiary hover:text-text-parchment",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute right-0 top-1/2 h-6 -translate-y-1/2 rounded-full bg-accent-primary"
                  style={{ width: 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <Icon size={20} strokeWidth={1.75} className={active ? "text-accent-primary" : ""} />
              <span className="font-medium">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto space-y-1 border-t border-border-ash pt-4">
        {FOOTER_NAV.map(({ id, label, icon: Icon }) => {
          const active = !isVaultActive && activeScreen === id;
          return (
            <button
              key={id}
              onClick={() => go(id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-DEFAULT px-4 py-2.5 text-sm transition-colors",
                active ? "bg-accent-soft text-text-parchment" : "text-text-bone hover:bg-background-tertiary hover:text-text-parchment",
              )}
            >
              <Icon size={20} strokeWidth={1.75} className={active ? "text-accent-primary" : ""} />
              <span className="font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function Sidebar() {
  return (
    <nav className="fixed left-0 top-0 z-40 hidden h-full w-[260px] flex-col border-r border-border-ash bg-background-secondary px-4 py-6 md:flex">
      <SidebarContent />
    </nav>
  );
}
