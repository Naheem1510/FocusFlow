import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid } from "@/lib/id";

export type TagTone = "design" | "dev" | "ops" | "personal";

export interface Tag {
  label: string;
  tone: TagTone;
}

/** Per-note editor preferences. */
export type NoteFont = "sans" | "serif" | "mono";
export type NoteSize = "sm" | "md" | "lg" | "xl";

export interface Note {
  id: string;
  title: string;
  body: string; // rich HTML
  folder: string;
  tags: Tag[];
  /** Parent note id for nesting, or null for a top-level note. */
  parentId: string | null;
  font?: NoteFont;
  size?: NoteSize;
  createdAt: number;
  updatedAt: number;
}

interface NotesState {
  notes: Note[];
  folders: string[];
  activeId: string | null;
  /** Create a note, optionally nested under a parent. */
  createNote: (folder?: string, parentId?: string | null) => string;
  updateNote: (
    id: string,
    patch: Partial<Pick<Note, "title" | "body" | "folder" | "font" | "size">>,
  ) => void;
  /** Delete a note and all of its descendants. */
  deleteNote: (id: string) => void;
  /** Re-parent a note (null = move to top level). Rejects cycles. */
  moveNote: (id: string, parentId: string | null) => void;
  setActive: (id: string) => void;
  addTag: (id: string, tag: Tag) => void;
  removeTag: (id: string, label: string) => void;
  addFolder: (name: string) => void;
  /** Create a note with a given title (used by [[wiki-links]]); returns its id.
   *  Unlike createNote it does NOT change the active note. */
  createNamedNote: (title: string, folder?: string) => string;
}

// ─── Wiki-links ────────────────────────────────────────────────────────────
//
// A link is an anchor embedded in a note's HTML body:
//   <a data-note="<id>" class="note-link">Title</a>
// These helpers read those links back out to power backlinks + the graph.

/** The HTML for an inline note link. */
export function noteLinkHtml(id: string, title: string): string {
  const safe = (title || "Untitled note").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<a data-note="${id}" class="note-link" contenteditable="false">${safe}</a>`;
}

/** Note ids referenced from a body's `data-note` anchors (deduped). */
export function extractLinkIds(html: string): string[] {
  const out = new Set<string>();
  const re = /data-note="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.add(m[1]);
  return Array.from(out);
}

/** Notes that `id`'s body links out to (existing targets only). */
export function outgoingLinks(notes: Note[], id: string): Note[] {
  const note = notes.find((n) => n.id === id);
  if (!note) return [];
  const byId = new Map(notes.map((n) => [n.id, n]));
  return extractLinkIds(note.body)
    .filter((t) => t !== id && byId.has(t))
    .map((t) => byId.get(t)!);
}

/** Notes whose body links TO `id` (backlinks / linked references). */
export function backlinks(notes: Note[], id: string): Note[] {
  return notes.filter((n) => n.id !== id && extractLinkIds(n.body).includes(id));
}

/** Returns the id set of a note plus every descendant beneath it. */
export function descendantIds(notes: Note[], rootId: string): Set<string> {
  const out = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const n of notes) {
      if (n.parentId && out.has(n.parentId) && !out.has(n.id)) {
        out.add(n.id);
        added = true;
      }
    }
  }
  return out;
}

/** Root → … → note path, used for breadcrumbs. */
export function notePath(notes: Note[], id: string): Note[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const path: Note[] = [];
  let cur = byId.get(id);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

const now = Date.now();

const seed: Note[] = [
  {
    id: "n-seed-1",
    title: "Workshop Insights",
    body: "Key takeaways from the tactile UI workshop.\n\nImplement deeper tones in the secondary backgrounds and refine the border contrast to mimic joinery. Depth comes from tonal layering, not shadows.",
    folder: "Workshop",
    tags: [
      { label: "Design", tone: "design" },
      { label: "Research", tone: "ops" },
    ],
    parentId: null,
    createdAt: now - 7200_000,
    updatedAt: now - 7200_000,
  },
  {
    id: "n-seed-1a",
    title: "Border & joinery details",
    body: "1px ash borders everywhere; avoid drop-shadows. Corners stay soft.",
    folder: "Workshop",
    tags: [],
    parentId: "n-seed-1", // nested under Workshop Insights
    createdAt: now - 7000_000,
    updatedAt: now - 7000_000,
  },
  {
    id: "n-seed-2",
    title: "Habit Tracking Ideas",
    body: "Use muted sage for positive streaks.\n\nVisual feedback should feel permanent, not fleeting. Avoid overly bright gamification — the reward is quiet consistency.",
    folder: "Product",
    tags: [{ label: "Product", tone: "dev" }],
    parentId: null,
    createdAt: now - 86_400_000,
    updatedAt: now - 86_400_000,
  },
];

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      notes: seed,
      folders: ["Workshop", "Product", "Personal"],
      activeId: seed[0].id,

      createNote: (folder = "Workshop", parentId = null) => {
        const id = uid("n-");
        const ts = Date.now();
        // A child inherits its parent's folder for consistent grouping.
        const parent = parentId ? get().notes.find((n) => n.id === parentId) : null;
        const note: Note = {
          id,
          title: "Untitled note",
          body: "",
          folder: parent?.folder ?? folder,
          tags: [],
          parentId: parentId ?? null,
          font: "sans",
          size: "md",
          createdAt: ts,
          updatedAt: ts,
        };
        set((s) => ({ notes: [note, ...s.notes], activeId: id }));
        return id;
      },

      updateNote: (id, patch) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n,
          ),
        })),

      deleteNote: (id) =>
        set((s) => {
          const doomed = descendantIds(s.notes, id);
          const notes = s.notes.filter((n) => !doomed.has(n.id));
          const activeId =
            s.activeId && doomed.has(s.activeId) ? (notes[0]?.id ?? null) : s.activeId;
          return { notes, activeId };
        }),

      moveNote: (id, parentId) =>
        set((s) => {
          // Prevent moving a note into itself or one of its own descendants.
          if (parentId && descendantIds(s.notes, id).has(parentId)) return s;
          return {
            notes: s.notes.map((n) =>
              n.id === id ? { ...n, parentId, updatedAt: Date.now() } : n,
            ),
          };
        }),

      setActive: (id) => set({ activeId: id }),

      addTag: (id, tag) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id && !n.tags.some((t) => t.label.toLowerCase() === tag.label.toLowerCase())
              ? { ...n, tags: [...n.tags, tag], updatedAt: Date.now() }
              : n,
          ),
        })),

      removeTag: (id, label) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id
              ? { ...n, tags: n.tags.filter((t) => t.label !== label), updatedAt: Date.now() }
              : n,
          ),
        })),

      addFolder: (name) => {
        const trimmed = name.trim();
        if (!trimmed || get().folders.includes(trimmed)) return;
        set((s) => ({ folders: [...s.folders, trimmed] }));
      },

      createNamedNote: (title, folder = "Workshop") => {
        const id = uid("n-");
        const ts = Date.now();
        const note: Note = {
          id,
          title: title.trim() || "Untitled note",
          body: "",
          folder,
          tags: [],
          parentId: null,
          font: "sans",
          size: "md",
          createdAt: ts,
          updatedAt: ts,
        };
        // Prepend without stealing focus from the note being edited.
        set((s) => ({ notes: [note, ...s.notes] }));
        return id;
      },
    }),
    { name: "focusflow-notes" },
  ),
);
