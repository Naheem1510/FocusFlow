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

  // Load content only when the note changes — never on each keystroke, or the
  // caret would jump to the start.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const save = () => onChange(ref.current?.innerHTML ?? "");

  // Run a formatting command without letting the toolbar steal the selection.
  const exec = (cmd: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, value);
    save();
  };

  return (
    <div>
      <Toolbar
        font={font}
        size={size}
        onFontChange={onFontChange}
        onSizeChange={onSizeChange}
        exec={exec}
      />
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={save}
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

function Toolbar({
  font,
  size,
  onFontChange,
  onSizeChange,
  exec,
}: {
  font: NoteFont;
  size: NoteSize;
  onFontChange: (f: NoteFont) => void;
  onSizeChange: (s: NoteSize) => void;
  exec: (cmd: string, value?: string) => void;
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

      <Divider />
      <Btn onMouseDown={hold} onClick={() => exec("hiliteColor", "rgba(212,168,67,0.35)")} title="Highlight"><Highlighter size={15} /></Btn>
      <ColorMenu hold={hold} onPick={(c) => exec("foreColor", c)} />
      <Btn onMouseDown={hold} onClick={() => exec("removeFormat")} title="Clear formatting"><Eraser size={15} /></Btn>

      <Divider />
      <FontMenu font={font} onFontChange={onFontChange} />
      <SizeMenu size={size} onSizeChange={onSizeChange} />
    </div>
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
