"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Plus,
  Folder,
  FileText,
  Tag as TagIcon,
  X,
  Trash2,
  ChevronRight,
  ChevronLeft,
  CornerDownRight,
  FilePlus,
  List,
  Waypoints,
  Clock,
  PencilLine,
} from "lucide-react";
import {
  useNotesStore,
  notePath,
  type TagTone,
  type Note,
} from "@/store/useNotesStore";
import { RichTextEditor } from "./RichTextEditor";
import { NotesGraph } from "./NotesGraph";
import { htmlToText } from "@/lib/text";
import { formatDateTime } from "@/lib/date";
import { cn } from "@/lib/cn";

type NotesView = "list" | "graph";

/** Segmented List ⇄ Graph switch shown in the Notes header. */
function ViewToggle({
  value,
  onChange,
}: {
  value: NotesView;
  onChange: (v: NotesView) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-DEFAULT border border-border-ash bg-background-tertiary p-0.5">
      {(
        [
          { key: "list", icon: List, label: "List" },
          { key: "graph", icon: Waypoints, label: "Graph" },
        ] as const
      ).map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          title={`${label} view`}
          aria-pressed={value === key}
          className={cn(
            "flex items-center gap-1.5 rounded-sm px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors",
            value === key
              ? "bg-accent-primary text-text-parchment"
              : "text-text-bone hover:text-text-parchment",
          )}
        >
          <Icon size={13} /> {label}
        </button>
      ))}
    </div>
  );
}

const TAG_TONE: Record<TagTone, string> = {
  design: "border-accent-terracotta/40 bg-accent-terracotta/10 text-accent-terracotta",
  dev: "border-accent-teal/40 bg-accent-teal/10 text-accent-teal",
  ops: "border-accent-ochre/40 bg-accent-ochre/10 text-accent-ochre",
  personal: "border-accent-sage/40 bg-accent-sage/10 text-accent-sage",
};
const TONE_CYCLE: TagTone[] = ["design", "dev", "ops", "personal"];

export function Notes() {
  const { notes, folders, activeId, createNote, updateNote, deleteNote, setActive, addTag, removeTag } =
    useNotesStore();

  const [folder, setFolder] = useState("All Notes");
  const [query, setQuery] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [view, setView] = useState<NotesView>("list");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["n-seed-1"]));
  // On phones the list and editor are separate panes; this tracks which is shown.
  const [mobilePane, setMobilePane] = useState<"list" | "editor">("list");

  const active = notes.find((n) => n.id === activeId) ?? null;
  const isSearching = query.trim().length > 0;
  // Either searching or a tag filter collapses the tree into a flat result list.
  const isFiltering = isSearching || activeTag !== null;

  // Every distinct tag in use, with its tone and how many notes carry it — the
  // backbone of the tag filter bar. Sorted most-used first.
  const allTags = (() => {
    const map = new Map<string, { tone: TagTone; count: number }>();
    for (const n of notes)
      for (const t of n.tags) {
        const e = map.get(t.label);
        if (e) e.count++;
        else map.set(t.label, { tone: t.tone, count: 1 });
      }
    return Array.from(map.entries())
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.count - a.count);
  })();

  // Open a note and, on mobile, switch to the editor pane.
  const openNote = (id: string) => {
    setActive(id);
    setMobilePane("editor");
  };

  // Click a tag anywhere → filter the list by it (and jump back to the list on mobile).
  const filterByTag = (label: string) => {
    setActiveTag((cur) => (cur === label ? null : label));
    setQuery("");
    setMobilePane("list");
  };

  const inFolder = (n: Note) => folder === "All Notes" || n.folder === folder;
  const matchesQuery = (n: Note) =>
    n.title.toLowerCase().includes(query.toLowerCase()) ||
    htmlToText(n.body).toLowerCase().includes(query.toLowerCase());
  const hasTag = (n: Note) => activeTag === null || n.tags.some((t) => t.label === activeTag);

  const childrenOf = (parentId: string | null) =>
    notes.filter((n) => n.parentId === parentId).sort((a, b) => b.updatedAt - a.updatedAt);

  const searchResults = notes
    .filter(inFolder)
    .filter(matchesQuery)
    .filter(hasTag)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const addSubNote = (parentId: string) => {
    createNote(undefined, parentId);
    setExpanded((prev) => new Set(prev).add(parentId));
    setMobilePane("editor");
  };

  const handleDelete = (note: Note) => {
    const hasChildren = notes.some((n) => n.parentId === note.id);
    if (hasChildren && !window.confirm("Delete this note and all of its sub-notes?")) return;
    deleteNote(note.id);
  };

  const commitTag = () => {
    if (!active || !tagInput.trim()) return;
    const tone = TONE_CYCLE[active.tags.length % TONE_CYCLE.length];
    addTag(active.id, { label: tagInput.trim(), tone });
    setTagInput("");
  };

  if (view === "graph") {
    const edgeCount = notes.filter(
      (n) => n.parentId && notes.some((p) => p.id === n.parentId),
    ).length;
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border-ash p-4 md:p-5">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold text-text-parchment">Notes</h1>
            <ViewToggle value={view} onChange={setView} />
          </div>
          <p className="hidden font-mono text-[11px] text-text-stone sm:block">
            {notes.length} {notes.length === 1 ? "note" : "notes"} · {edgeCount}{" "}
            {edgeCount === 1 ? "link" : "links"}
          </p>
        </div>
        <NotesGraph
          className="min-h-0 flex-1"
          onOpenNote={(id) => {
            openNote(id);
            setView("list");
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* List pane — full width on mobile; hidden there once a note is open. */}
      <div
        className={cn(
          "w-full flex-col border-r border-border-ash md:flex md:w-[320px] md:flex-shrink-0",
          mobilePane === "editor" ? "hidden md:flex" : "flex",
        )}
      >
        <div className="border-b border-border-ash p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h1 className="font-display text-2xl font-semibold text-text-parchment">Notes</h1>
            <div className="flex items-center gap-2">
              <ViewToggle value={view} onChange={setView} />
              <button
                onClick={() => {
                  createNote(folder === "All Notes" ? "Workshop" : folder);
                  setMobilePane("editor");
                }}
                className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-DEFAULT bg-accent-primary text-text-parchment transition-colors hover:bg-accent-hover active:scale-95"
                title="New note"
              >
                <Plus size={18} strokeWidth={1.75} />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-stone" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
              className="w-full rounded-DEFAULT border border-border-ash bg-background-tertiary py-2 pl-9 pr-3 text-sm text-text-parchment placeholder:text-text-stone outline-none focus:border-accent-primary"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["All Notes", ...folders].map((f) => (
              <button
                key={f}
                onClick={() => setFolder(f)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
                  folder === f
                    ? "border-accent-primary bg-accent-soft text-accent-primary"
                    : "border-border-ash text-text-bone hover:text-text-parchment",
                )}
              >
                <Folder size={11} /> {f}
              </button>
            ))}
          </div>

          {/* Tag filter — click a tag to show only notes carrying it. */}
          {allTags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <TagIcon size={11} className="text-text-stone" />
              {allTags.map((t) => (
                <button
                  key={t.label}
                  onClick={() => filterByTag(t.label)}
                  className={cn(
                    "flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] transition-colors",
                    activeTag === t.label
                      ? TAG_TONE[t.tone] + " ring-1 ring-inset ring-current"
                      : "border-border-ash text-text-bone hover:text-text-parchment",
                  )}
                >
                  {t.label}
                  <span className="font-mono text-[9px] opacity-60">{t.count}</span>
                </button>
              ))}
              {activeTag && (
                <button
                  onClick={() => setActiveTag(null)}
                  className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-text-stone hover:text-accent-terracotta"
                  title="Clear tag filter"
                >
                  <X size={11} /> Clear
                </button>
              )}
            </div>
          )}
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto py-1">
          {isFiltering ? (
            // Flat results while searching or filtering by a tag.
            <>
              {searchResults.length === 0 && (
                <p className="p-6 text-center font-mono text-xs text-text-stone">No matches.</p>
              )}
              {searchResults.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openNote(n.id)}
                  className={cn(
                    "block w-full border-b border-border-ash border-l-2 px-4 py-3 text-left transition-colors",
                    n.id === activeId
                      ? "border-l-accent-primary bg-background-secondary"
                      : "border-l-transparent hover:bg-background-secondary/50",
                  )}
                >
                  <h3 className={cn("truncate text-sm font-semibold", n.id === activeId ? "text-accent-primary" : "text-text-parchment")}>
                    {n.title || "Untitled note"}
                  </h3>
                  <p className="line-clamp-1 text-xs text-text-bone">{htmlToText(n.body) || "No additional text"}</p>
                </button>
              ))}
            </>
          ) : (
            // Nested tree.
            <>
              {childrenOf(null).filter(inFolder).length === 0 && (
                <p className="p-6 text-center font-mono text-xs text-text-stone">
                  No notes here yet. Tap + to create one.
                </p>
              )}
              {childrenOf(null)
                .filter(inFolder)
                .map((n) => (
                  <NoteTree
                    key={n.id}
                    note={n}
                    depth={0}
                    notes={notes}
                    activeId={activeId}
                    expanded={expanded}
                    onSelect={openNote}
                    onToggle={toggleExpand}
                    onAddChild={addSubNote}
                  />
                ))}
            </>
          )}
        </div>
      </div>

      {/* Editor */}
      {active ? (
        <motion.div
          key={active.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className={cn(
            "custom-scrollbar flex-1 overflow-y-auto md:block",
            mobilePane === "editor" ? "block" : "hidden md:block",
          )}
        >
          {/* Mobile-only back to the note list */}
          <button
            onClick={() => setMobilePane("list")}
            className="flex items-center gap-1 px-4 pt-4 text-sm text-text-bone transition-colors hover:text-accent-primary md:hidden"
          >
            <ChevronLeft size={16} /> Notes
          </button>
          <div className="mx-auto max-w-3xl px-5 py-6 md:px-10 md:py-10">
            {/* Breadcrumb path through the nesting */}
            {notePath(notes, active.id).length > 1 && (
              <div className="mb-3 flex flex-wrap items-center gap-1 font-mono text-[11px] text-text-bone">
                {notePath(notes, active.id).map((p, i, arr) => (
                  <span key={p.id} className="flex items-center gap-1">
                    <button
                      onClick={() => setActive(p.id)}
                      className={cn(
                        "max-w-[160px] truncate hover:text-accent-primary",
                        i === arr.length - 1 && "text-text-parchment",
                      )}
                    >
                      {p.title || "Untitled"}
                    </button>
                    {i < arr.length - 1 && <ChevronRight size={12} className="text-text-stone" />}
                  </span>
                ))}
              </div>
            )}

            <div className="mb-2 flex items-center justify-between">
              <select
                value={active.folder}
                onChange={(e) => updateNote(active.id, { folder: e.target.value })}
                className="cursor-pointer rounded-sm border border-border-ash bg-background-tertiary px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-text-bone outline-none focus:border-accent-primary"
              >
                {folders.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <button
                onClick={() => handleDelete(active)}
                className="flex items-center gap-1 rounded-DEFAULT px-2 py-1 text-text-bone transition-colors hover:bg-accent-terracotta/10 hover:text-accent-terracotta"
                title="Delete note"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <input
              value={active.title}
              onChange={(e) => updateNote(active.id, { title: e.target.value })}
              placeholder="Untitled note"
              className="w-full bg-transparent font-display text-4xl font-semibold leading-tight text-text-parchment placeholder:text-text-stone/50 outline-none"
            />

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {active.tags.map((t) => (
                <span key={t.label} className={cn("flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs", TAG_TONE[t.tone])}>
                  <button
                    onClick={() => filterByTag(t.label)}
                    className="flex items-center gap-1 hover:underline"
                    title={`Show all notes tagged "${t.label}"`}
                  >
                    <TagIcon size={11} /> {t.label}
                  </button>
                  <button onClick={() => removeTag(active.id, t.label)} title="Remove tag">
                    <X size={11} className="cursor-pointer opacity-60 hover:opacity-100" />
                  </button>
                </span>
              ))}
              <span className="flex items-center gap-1 rounded-sm border border-dashed border-border-ash px-2 py-0.5">
                <Plus size={11} className="text-text-stone" />
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && commitTag()}
                  onBlur={commitTag}
                  placeholder="Tag"
                  className="w-12 bg-transparent text-xs text-text-parchment placeholder:text-text-stone outline-none"
                />
              </span>
            </div>

            <div className="mt-6">
              <RichTextEditor
                noteId={active.id}
                html={active.body}
                font={active.font ?? "sans"}
                size={active.size ?? "md"}
                onChange={(body) => updateNote(active.id, { body })}
                onFontChange={(font) => updateNote(active.id, { font })}
                onSizeChange={(size) => updateNote(active.id, { size })}
              />
            </div>

            {/* Sub-notes (nested pages) */}
            <div className="mt-10 border-t border-border-ash pt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-text-bone">
                  <CornerDownRight size={13} /> Sub-notes
                </h3>
                <button
                  onClick={() => addSubNote(active.id)}
                  className="flex items-center gap-1.5 rounded-DEFAULT border border-border-ash px-2.5 py-1 text-xs text-text-bone transition-colors hover:border-accent-primary hover:text-accent-primary"
                >
                  <FilePlus size={13} /> Add sub-note
                </button>
              </div>
              <div className="space-y-1.5">
                {childrenOf(active.id).length === 0 && (
                  <p className="font-mono text-[11px] text-text-stone">
                    No sub-notes yet. Nest a page inside this one.
                  </p>
                )}
                {childrenOf(active.id).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActive(c.id)}
                    className="flex w-full items-center gap-2 rounded-DEFAULT border border-border-ash bg-background-secondary px-3 py-2.5 text-left transition-colors hover:border-accent-primary/50"
                  >
                    <FileText size={15} className="flex-shrink-0 text-accent-primary" />
                    <span className="flex-1 truncate text-sm text-text-parchment">
                      {c.title || "Untitled note"}
                    </span>
                    {notes.some((n) => n.parentId === c.id) && (
                      <span className="font-mono text-[10px] text-text-stone">
                        {notes.filter((n) => n.parentId === c.id).length} nested
                      </span>
                    )}
                    <ChevronRight size={14} className="text-text-stone" />
                  </button>
                ))}
              </div>
            </div>

            {/* Created / last-edited metadata */}
            <div className="mt-8 flex flex-col gap-1 border-t border-border-ash pt-4 font-mono text-[11px] text-text-stone">
              <span className="flex items-center gap-1.5">
                <Clock size={11} /> Created {formatDateTime(active.createdAt)}
              </span>
              <span className="flex items-center gap-1.5">
                <PencilLine size={11} /> Last edited {formatDateTime(active.updatedAt)}
              </span>
            </div>
          </div>
        </motion.div>
      ) : (
        <div className="hidden flex-1 place-items-center md:grid">
          <div className="text-center">
            <FileText className="mx-auto mb-3 text-text-stone" />
            <p className="font-mono text-xs text-text-stone">Select or create a note.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function NoteTree({
  note,
  depth,
  notes,
  activeId,
  expanded,
  onSelect,
  onToggle,
  onAddChild,
}: {
  note: Note;
  depth: number;
  notes: Note[];
  activeId: string | null;
  expanded: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onAddChild: (id: string) => void;
}) {
  const children = notes
    .filter((n) => n.parentId === note.id)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const hasChildren = children.length > 0;
  const open = expanded.has(note.id);
  const isActive = note.id === activeId;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-0.5 border-l-2 pr-2 transition-colors",
          isActive
            ? "border-l-accent-primary bg-background-secondary"
            : "border-l-transparent hover:bg-background-secondary/50",
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <button
          onClick={() => hasChildren && onToggle(note.id)}
          className={cn(
            "grid h-5 w-5 flex-shrink-0 place-items-center rounded text-text-stone",
            hasChildren ? "hover:text-accent-primary" : "pointer-events-none opacity-0",
          )}
          aria-label={open ? "Collapse" : "Expand"}
        >
          <ChevronRight size={13} className={cn("transition-transform", open && "rotate-90")} />
        </button>
        <button
          onClick={() => onSelect(note.id)}
          className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
        >
          <FileText
            size={14}
            className={cn("flex-shrink-0", isActive ? "text-accent-primary" : "text-text-bone")}
          />
          <span
            className={cn(
              "truncate text-sm",
              isActive ? "font-medium text-accent-primary" : "text-text-parchment",
            )}
          >
            {note.title || "Untitled note"}
          </span>
        </button>
        <button
          onClick={() => onAddChild(note.id)}
          title="Add sub-note"
          className="grid h-6 w-6 flex-shrink-0 place-items-center rounded text-text-stone opacity-0 transition-opacity hover:text-accent-primary group-hover:opacity-100"
        >
          <Plus size={14} />
        </button>
      </div>
      {open &&
        children.map((c) => (
          <NoteTree
            key={c.id}
            note={c}
            depth={depth + 1}
            notes={notes}
            activeId={activeId}
            expanded={expanded}
            onSelect={onSelect}
            onToggle={onToggle}
            onAddChild={onAddChild}
          />
        ))}
    </div>
  );
}
