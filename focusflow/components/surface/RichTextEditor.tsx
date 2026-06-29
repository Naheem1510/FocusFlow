"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Highlighter,
  Eraser,
  Type,
  ChevronDown,
  Table as TableIcon,
  Rows3,
  Columns3,
  Trash2,
} from "lucide-react";
import type { NoteFont, NoteSize } from "@/store/useNotesStore";
import { cn } from "@/lib/cn";

const FONT_CLASS: Record<NoteFont, string> = {
  sans: "font-sans",
  serif: "font-display",
  mono: "font-mono",
};
const FONT_LABEL: Record<NoteFont, string> = { sans: "DM Sans", serif: "Fraunces", mono: "JetBrains Mono" };

const SIZE_CLASS: Record<NoteSize, string> = {
  sm: "text-sm leading-relaxed",
  md: "text-[17px] leading-relaxed",
  lg: "text-xl leading-relaxed",
  xl: "text-2xl leading-relaxed",
};
const SIZE_LABEL: Record<NoteSize, string> = { sm: "Small", md: "Normal", lg: "Large", xl: "Huge" };

const TEXT_COLORS = ["#EDE6DB", "#C4654A", "#7A9E7E", "#D4A843", "#38BEC9"];

export function RichTextEditor({
  noteId,
  html,
  font,
  size,
  onChange,
  onFontChange,
  onSizeChange,
}: {
  noteId: string;
  html: string;
  font: NoteFont;
  size: NoteSize;
  onChange: (html: string) => void;
  onFontChange: (f: NoteFont) => void;
  onSizeChange: (s: NoteSize) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // True while the caret sits inside a table — reveals the row/column controls.
  const [inTable, setInTable] = useState(false);

  // Load content only when the note changes — never on each keystroke, or the
  // caret would jump to the start.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // Reveal the table controls only when the selection is inside a table cell.
  useEffect(() => {
    const onSel = () => {
      const node = window.getSelection()?.anchorNode;
      const el = node ? (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement) : null;
      setInTable(!!el?.closest("td,th") && !!ref.current?.contains(el));
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  const save = () => onChange(ref.current?.innerHTML ?? "");

  /** The table cell the caret is currently in, if any (within this editor). */
  const currentCell = (): HTMLTableCellElement | null => {
    const node = window.getSelection()?.anchorNode;
    const el = node ? (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement) : null;
    const cell = el?.closest("td,th") as HTMLTableCellElement | null;
    return cell && ref.current?.contains(cell) ? cell : null;
  };

  // ── Table row/column editing — operate on the cell the caret is in ──────────
  const addRow = () => {
    const cell = currentCell();
    if (!cell) return;
    const row = cell.closest("tr")!;
    const table = cell.closest("table")!;
    const cols = Math.max(...Array.from(table.rows, (r) => r.cells.length));
    const tr = document.createElement("tr");
    for (let i = 0; i < cols; i++) {
      const td = document.createElement("td");
      td.innerHTML = "<br>";
      tr.appendChild(td);
    }
    // A header row inserts a body row just beneath the header; otherwise after the row.
    if (row.parentElement?.tagName === "THEAD") {
      const tbody = table.tBodies[0] ?? table;
      tbody.insertBefore(tr, tbody.firstChild);
    } else {
      row.parentElement!.insertBefore(tr, row.nextSibling);
    }
    placeCaret(tr.firstElementChild as HTMLElement);
    save();
  };

  const addColumn = () => {
    const cell = currentCell();
    if (!cell) return;
    const table = cell.closest("table")!;
    const at = cell.cellIndex;
    for (const row of Array.from(table.rows)) {
      const isHead = row.parentElement?.tagName === "THEAD";
      const nu = document.createElement(isHead ? "th" : "td");
      nu.innerHTML = isHead ? "Column" : "<br>";
      const refCell = row.cells[at];
      row.insertBefore(nu, refCell ? refCell.nextSibling : null);
    }
    save();
  };

  const deleteRow = () => {
    const cell = currentCell();
    if (!cell) return;
    const table = cell.closest("table")!;
    cell.closest("tr")!.remove();
    if (table.rows.length === 0) table.remove();
    save();
  };

  const deleteColumn = () => {
    const cell = currentCell();
    if (!cell) return;
    const table = cell.closest("table")!;
    const at = cell.cellIndex;
    for (const row of Array.from(table.rows)) if (row.cells[at]) row.deleteCell(at);
    if (!table.rows[0] || table.rows[0].cells.length === 0) table.remove();
    save();
  };

  const deleteTable = () => {
    currentCell()?.closest("table")?.remove();
    setInTable(false);
    save();
  };

  // Run a formatting command without letting the toolbar steal the selection.
  const exec = (cmd: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, value);
    save();
  };

  // Insert an editable table (rows × cols) at the caret. Cells are contentEditable
  // by virtue of living inside the editor, so you can click any cell and type.
  const insertTable = (rows = 3, cols = 3) => {
    ref.current?.focus();
    const head =
      "<tr>" + Array.from({ length: cols }, (_, i) => `<th>Column ${i + 1}</th>`).join("") + "</tr>";
    const bodyRow = "<tr>" + "<td><br></td>".repeat(cols) + "</tr>";
    const html =
      `<table><thead>${head}</thead><tbody>${bodyRow.repeat(rows - 1)}</tbody></table><p><br></p>`;
    document.execCommand("insertHTML", false, html);
    save();
  };

  // Tab navigation inside tables: move to the next cell, and append a new row when
  // tabbing out of the last cell — so a table is quick to fill in from the keyboard.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const sel = window.getSelection();
    const node = sel?.anchorNode as HTMLElement | null;
    const cell = (node?.nodeType === 1 ? node : node?.parentElement)?.closest("td,th") as
      | HTMLTableCellElement
      | null;
    if (!cell) return; // not in a table — let Tab behave normally
    e.preventDefault();

    const cells = Array.from(cell.closest("table")!.querySelectorAll("td,th"));
    const idx = cells.indexOf(cell);
    const next = cells[idx + (e.shiftKey ? -1 : 1)] as HTMLElement | undefined;

    if (next) {
      placeCaret(next);
    } else if (!e.shiftKey) {
      // Past the last cell → append a fresh row and jump into its first cell.
      const tbody = cell.closest("table")!.querySelector("tbody") ?? cell.closest("table")!;
      const colCount = cell.closest("tr")!.children.length;
      const tr = document.createElement("tr");
      tr.innerHTML = "<td><br></td>".repeat(colCount);
      tbody.appendChild(tr);
      placeCaret(tr.firstElementChild as HTMLElement);
      save();
    }
  };

  return (
    <div>
      <Toolbar
        font={font}
        size={size}
        onFontChange={onFontChange}
        onSizeChange={onSizeChange}
        exec={exec}
        onInsertTable={insertTable}
        inTable={inTable}
        tableOps={{ addRow, addColumn, deleteRow, deleteColumn, deleteTable }}
      />
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={save}
        onKeyDown={onKeyDown}
        data-placeholder="Start writing…"
        className={cn(
          "rte custom-scrollbar mt-5 min-h-[45vh] w-full bg-transparent text-text-parchment/90 outline-none",
          FONT_CLASS[font],
          SIZE_CLASS[size],
        )}
      />
    </div>
  );
}

/** Places the caret at the start of a cell's content. */
function placeCaret(cell: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  (cell.closest("[contenteditable]") as HTMLElement | null)?.focus();
}

interface TableOps {
  addRow: () => void;
  addColumn: () => void;
  deleteRow: () => void;
  deleteColumn: () => void;
  deleteTable: () => void;
}

function Toolbar({
  font,
  size,
  onFontChange,
  onSizeChange,
  exec,
  onInsertTable,
  inTable,
  tableOps,
}: {
  font: NoteFont;
  size: NoteSize;
  onFontChange: (f: NoteFont) => void;
  onSizeChange: (s: NoteSize) => void;
  exec: (cmd: string, value?: string) => void;
  onInsertTable: (rows?: number, cols?: number) => void;
  inTable: boolean;
  tableOps: TableOps;
}) {
  // preventDefault on mousedown keeps the editor's text selection alive.
  const hold = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="sticky top-0 z-10 -mx-2 flex flex-wrap items-center gap-1 rounded-xl border border-border-ash bg-background-secondary/95 px-2 py-1.5 backdrop-blur-sm">
      <Btn onMouseDown={hold} onClick={() => exec("bold")} title="Bold"><Bold size={15} /></Btn>
      <Btn onMouseDown={hold} onClick={() => exec("italic")} title="Italic"><Italic size={15} /></Btn>
      <Btn onMouseDown={hold} onClick={() => exec("underline")} title="Underline"><Underline size={15} /></Btn>
      <Btn onMouseDown={hold} onClick={() => exec("strikeThrough")} title="Strikethrough"><Strikethrough size={15} /></Btn>

      <Divider />
      <Btn onMouseDown={hold} onClick={() => exec("formatBlock", "h1")} title="Heading 1"><Heading1 size={15} /></Btn>
      <Btn onMouseDown={hold} onClick={() => exec("formatBlock", "h2")} title="Heading 2"><Heading2 size={15} /></Btn>
      <Btn onMouseDown={hold} onClick={() => exec("formatBlock", "blockquote")} title="Quote"><Quote size={15} /></Btn>

      <Divider />
      <Btn onMouseDown={hold} onClick={() => exec("insertUnorderedList")} title="Bullet list"><List size={15} /></Btn>
      <Btn onMouseDown={hold} onClick={() => exec("insertOrderedList")} title="Numbered list"><ListOrdered size={15} /></Btn>
      <Btn onMouseDown={hold} onClick={() => onInsertTable(3, 3)} title="Insert table (Tab to move / add rows)"><TableIcon size={15} /></Btn>

      <Divider />
      <Btn onMouseDown={hold} onClick={() => exec("hiliteColor", "rgba(212,168,67,0.35)")} title="Highlight"><Highlighter size={15} /></Btn>
      <ColorMenu hold={hold} onPick={(c) => exec("foreColor", c)} />
      <Btn onMouseDown={hold} onClick={() => exec("removeFormat")} title="Clear formatting"><Eraser size={15} /></Btn>

      <Divider />
      <FontMenu font={font} onFontChange={onFontChange} />
      <SizeMenu size={size} onSizeChange={onSizeChange} />

      {/* Table controls — only while the caret is inside a table. */}
      {inTable && (
        <>
          <Divider />
          <TableBtn onMouseDown={hold} onClick={tableOps.addRow} title="Add row below"><Rows3 size={14} /><span className="text-accent-primary">+</span></TableBtn>
          <TableBtn onMouseDown={hold} onClick={tableOps.deleteRow} title="Delete row"><Rows3 size={14} /><span className="text-accent-terracotta">−</span></TableBtn>
          <TableBtn onMouseDown={hold} onClick={tableOps.addColumn} title="Add column right"><Columns3 size={14} /><span className="text-accent-primary">+</span></TableBtn>
          <TableBtn onMouseDown={hold} onClick={tableOps.deleteColumn} title="Delete column"><Columns3 size={14} /><span className="text-accent-terracotta">−</span></TableBtn>
          <Btn onMouseDown={hold} onClick={tableOps.deleteTable} title="Delete table"><Trash2 size={15} /></Btn>
        </>
      )}
    </div>
  );
}

/** A table control: an icon paired with a +/− affordance. */
function TableBtn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="flex h-8 items-center gap-0.5 rounded-DEFAULT px-1.5 text-text-bone transition-colors hover:bg-background-tertiary hover:text-accent-primary"
    >
      {children}
    </button>
  );
}

function Btn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="grid h-8 w-8 place-items-center rounded-DEFAULT text-text-bone transition-colors hover:bg-background-tertiary hover:text-accent-primary"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-border-ash" />;
}

function ColorMenu({ hold, onPick }: { hold: (e: React.MouseEvent) => void; onPick: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Btn onMouseDown={hold} onClick={() => setOpen((o) => !o)} title="Text color">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-accent-terracotta via-accent-ochre to-accent-teal" />
      </Btn>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 flex gap-1.5 rounded-DEFAULT border border-border-ash bg-background-secondary p-2 shadow-xl">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                onMouseDown={hold}
                onClick={() => {
                  onPick(c);
                  setOpen(false);
                }}
                className="h-5 w-5 rounded-full ring-1 ring-border-ash transition-transform hover:scale-110"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FontMenu({ font, onFontChange }: { font: NoteFont; onFontChange: (f: NoteFont) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1.5 rounded-DEFAULT px-2 text-text-bone transition-colors hover:bg-background-tertiary hover:text-text-parchment"
        title="Font"
      >
        <Type size={15} />
        <span className="hidden text-xs sm:inline">{FONT_LABEL[font]}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-DEFAULT border border-border-ash bg-background-secondary p-1 shadow-xl">
            {(["sans", "serif", "mono"] as NoteFont[]).map((f) => (
              <button
                key={f}
                onClick={() => {
                  onFontChange(f);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-background-tertiary",
                  FONT_CLASS[f],
                  font === f ? "text-accent-primary" : "text-text-parchment",
                )}
              >
                {FONT_LABEL[f]}
                <span className="font-sans text-[10px] text-text-stone">Aa</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SizeMenu({ size, onSizeChange }: { size: NoteSize; onSizeChange: (s: NoteSize) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1 rounded-DEFAULT px-2 text-xs text-text-bone transition-colors hover:bg-background-tertiary hover:text-text-parchment"
        title="Text size"
      >
        {SIZE_LABEL[size]}
        <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-DEFAULT border border-border-ash bg-background-secondary p-1 shadow-xl">
            {(["sm", "md", "lg", "xl"] as NoteSize[]).map((s) => (
              <button
                key={s}
                onClick={() => {
                  onSizeChange(s);
                  setOpen(false);
                }}
                className={cn(
                  "block w-full rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-background-tertiary",
                  size === s ? "text-accent-primary" : "text-text-parchment",
                )}
              >
                {SIZE_LABEL[s]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
