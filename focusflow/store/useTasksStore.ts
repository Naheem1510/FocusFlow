import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid } from "@/lib/id";

export type ColId = "todo" | "doing" | "done";
export type Priority = "high" | "med" | "low";

export interface Task {
  id: string;
  title: string;
  project: string;
  priority: Priority;
  due: string; // free-text or ISO
  progress: number;
  column: ColId;
  createdAt: number;
}

interface TasksState {
  tasks: Task[];
  createTask: (input: Partial<Task> & { title: string }) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  moveTask: (id: string, column: ColId) => void;
}

const now = Date.now();

const seed: Task[] = [
  { id: "t-s1", title: "Finalize Q3 Marketing Strategy Draft", project: "Project Alpha", priority: "high", due: "Oct 8", progress: 0, column: "todo", createdAt: now - 5000 },
  { id: "t-s2", title: "Source imagery for landing hero", project: "Website", priority: "low", due: "Oct 12", progress: 0, column: "todo", createdAt: now - 4000 },
  { id: "t-s3", title: "Refine Vault crossfade timing", project: "FocusFlow", priority: "high", due: "Oct 6", progress: 60, column: "doing", createdAt: now - 3000 },
  { id: "t-s4", title: "Review Design System Updates", project: "Internal Ops", priority: "med", due: "Oct 7", progress: 35, column: "doing", createdAt: now - 2000 },
  { id: "t-s5", title: "Ship Desert Dusk tokens", project: "FocusFlow", priority: "med", due: "Oct 2", progress: 100, column: "done", createdAt: now - 1000 },
];

export const useTasksStore = create<TasksState>()(
  persist(
    (set) => ({
      tasks: seed,

      createTask: (input) => {
        const id = uid("t-");
        const task: Task = {
          id,
          title: input.title,
          project: input.project ?? "Inbox",
          priority: input.priority ?? "med",
          due: input.due ?? "",
          progress: input.progress ?? 0,
          column: input.column ?? "todo",
          createdAt: Date.now(),
        };
        set((s) => ({ tasks: [task, ...s.tasks] }));
        return id;
      },

      updateTask: (id, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),

      deleteTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

      moveTask: (id, column) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? { ...t, column, progress: column === "done" ? 100 : t.progress }
              : t,
          ),
        })),
    }),
    { name: "focusflow-tasks" },
  ),
);
