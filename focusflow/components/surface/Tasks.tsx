"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Calendar, Flag, Trash2, X } from "lucide-react";
import {
  useTasksStore,
  type Task,
  type ColId,
  type Priority,
} from "@/store/useTasksStore";
import { cn } from "@/lib/cn";

const COLUMNS: { id: ColId; label: string; accent: string; dot: string }[] = [
  { id: "todo", label: "To Do", accent: "text-accent-ochre", dot: "bg-accent-ochre" },
  { id: "doing", label: "In Progress", accent: "text-accent-terracotta", dot: "bg-accent-terracotta" },
  { id: "done", label: "Done", accent: "text-accent-sage", dot: "bg-accent-sage" },
];

const PRIORITY: Record<Priority, { label: string; cls: string }> = {
  high: { label: "High", cls: "border-accent-terracotta/40 bg-accent-terracotta/10 text-accent-terracotta" },
  med: { label: "Medium", cls: "border-accent-ochre/40 bg-accent-ochre/10 text-accent-ochre" },
  low: { label: "Low", cls: "border-accent-sage/40 bg-accent-sage/10 text-accent-sage" },
};

type Editing = { task?: Task; column: ColId } | null;

export function Tasks() {
  const { tasks, moveTask, deleteTask } = useTasksStore();
  const [dragging, setDragging] = useState<{ id: string; from: ColId } | null>(null);
  const [editing, setEditing] = useState<Editing>(null);

  const drop = (to: ColId) => {
    if (dragging && dragging.from !== to) moveTask(dragging.id, to);
    setDragging(null);
  };

  return (
    <div className="flex h-full flex-col px-4 py-6 md:px-12 md:py-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text-parchment md:text-4xl">
            Task Board
          </h1>
          <p className="mt-1 text-text-bone">Drag cards between columns to update status.</p>
        </div>
        <button
          onClick={() => setEditing({ column: "todo" })}
          className="flex flex-shrink-0 items-center gap-2 rounded-DEFAULT bg-accent-primary px-3 py-2 text-sm font-medium text-text-parchment transition-colors hover:bg-accent-hover active:scale-[0.97] md:px-4 md:py-2.5"
        >
          <Plus size={18} strokeWidth={1.75} /> <span className="hidden sm:inline">New Task</span>
        </button>
      </div>

      <div className="custom-scrollbar grid flex-1 grid-cols-1 gap-5 overflow-y-auto md:grid-cols-3">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.column === col.id);
          return (
            <div
              key={col.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(col.id)}
              className={cn(
                "flex flex-col rounded-xl border bg-background-secondary/40 p-3 transition-colors",
                dragging && dragging.from !== col.id ? "border-accent-primary/50" : "border-border-ash",
              )}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", col.dot)} />
                  <h2 className={cn("text-sm font-semibold", col.accent)}>{col.label}</h2>
                  <span className="rounded-full bg-background-tertiary px-2 py-0.5 font-mono text-[10px] text-text-bone">
                    {colTasks.length}
                  </span>
                </div>
                <button
                  onClick={() => setEditing({ column: col.id })}
                  className="text-text-bone transition-colors hover:text-accent-primary"
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="flex-1 space-y-3">
                {colTasks.map((task) => (
                  <motion.div
                    layout
                    key={task.id}
                    draggable
                    onDragStart={() => setDragging({ id: task.id, from: col.id })}
                    onDragEnd={() => setDragging(null)}
                    onClick={() => setEditing({ task, column: task.column })}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "group cursor-grab rounded-xl border border-border-ash bg-background-secondary p-4 transition-all hover:border-accent-primary/40 hover:shadow-xl active:cursor-grabbing",
                      dragging?.id === task.id && "opacity-50",
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className={cn("flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-medium", PRIORITY[task.priority].cls)}>
                        <Flag size={10} /> {PRIORITY[task.priority].label}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTask(task.id);
                        }}
                        className="text-text-stone opacity-0 transition-opacity hover:text-accent-terracotta group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="text-sm font-medium leading-snug text-text-parchment">{task.title}</p>
                    {task.project && (
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-stone">
                        {task.project}
                      </p>
                    )}

                    {task.progress > 0 && task.progress < 100 && (
                      <div className="mt-3">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-background-tertiary">
                          <div className="h-full rounded-full bg-accent-primary" style={{ width: `${task.progress}%` }} />
                        </div>
                        <span className="mt-1 block font-mono text-[10px] text-text-bone">{task.progress}%</span>
                      </div>
                    )}

                    {task.due && (
                      <div className="mt-3 flex items-center gap-1 border-t border-border-ash pt-3 font-mono text-[10px] text-text-bone">
                        <Calendar size={12} /> {task.due}
                      </div>
                    )}
                  </motion.div>
                ))}

                {colTasks.length === 0 && (
                  <button
                    onClick={() => setEditing({ column: col.id })}
                    className="w-full rounded-xl border border-dashed border-border-ash py-6 font-mono text-[11px] text-text-stone transition-colors hover:border-accent-primary hover:text-accent-primary"
                  >
                    + Add a task
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && <TaskEditor editing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TaskEditor({ editing, onClose }: { editing: NonNullable<Editing>; onClose: () => void }) {
  const { createTask, updateTask } = useTasksStore();
  const existing = editing.task;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [project, setProject] = useState(existing?.project ?? "");
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? "med");
  const [due, setDue] = useState(existing?.due ?? "");
  const [progress, setProgress] = useState(existing?.progress ?? 0);

  const save = () => {
    if (!title.trim()) return;
    if (existing) updateTask(existing.id, { title: title.trim(), project, priority, due, progress });
    else createTask({ title: title.trim(), project, priority, due, progress, column: editing.column });
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
            {existing ? "Edit task" : "New task"}
          </h2>
          <button onClick={onClose} className="text-text-bone hover:text-text-parchment">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <Field label="Title">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="What needs doing?"
              className="w-full rounded-DEFAULT border border-border-ash bg-background-tertiary px-3 py-2 text-sm text-text-parchment placeholder:text-text-stone outline-none focus:border-accent-primary"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Project">
              <input
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="Inbox"
                className="w-full rounded-DEFAULT border border-border-ash bg-background-tertiary px-3 py-2 text-sm text-text-parchment placeholder:text-text-stone outline-none focus:border-accent-primary"
              />
            </Field>
            <Field label="Due">
              <input
                value={due}
                onChange={(e) => setDue(e.target.value)}
                placeholder="e.g. Fri, Oct 8"
                className="w-full rounded-DEFAULT border border-border-ash bg-background-tertiary px-3 py-2 text-sm text-text-parchment placeholder:text-text-stone outline-none focus:border-accent-primary"
              />
            </Field>
          </div>

          <Field label="Priority">
            <div className="flex gap-2">
              {(Object.keys(PRIORITY) as Priority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    "flex-1 rounded-DEFAULT border px-3 py-2 text-xs font-medium capitalize transition-colors",
                    priority === p ? PRIORITY[p].cls : "border-border-ash text-text-bone hover:text-text-parchment",
                  )}
                >
                  {PRIORITY[p].label}
                </button>
              ))}
            </div>
          </Field>

          <Field label={`Progress — ${progress}%`}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-full accent-accent-primary"
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-DEFAULT px-4 py-2 text-sm text-text-bone hover:text-text-parchment">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!title.trim()}
            className="rounded-DEFAULT bg-accent-primary px-5 py-2 text-sm font-medium text-text-parchment transition-colors hover:bg-accent-hover active:scale-[0.97] disabled:opacity-50"
          >
            {existing ? "Save" : "Create task"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-stone">
        {label}
      </label>
      {children}
    </div>
  );
}
