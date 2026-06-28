"use client";

import { useEffect, useRef } from "react";
import { ZoomIn, ZoomOut, Maximize2, Share2 } from "lucide-react";
import { useNotesStore } from "@/store/useNotesStore";
import { ACCENTS, useSettingsStore } from "@/store/useSettingsStore";
import { cn } from "@/lib/cn";

/**
 * Obsidian-style force-directed graph of the notes.
 *
 * Nodes are notes; edges are parent→child links from `note.parentId`. A tiny
 * custom physics simulation (repulsion + link springs + center gravity) lays the
 * graph out on a <canvas> with pan / zoom / node-drag, hover highlighting and
 * click-to-open. No graph/d3 dependency — the simulation is a few dozen lines.
 *
 * The edge model is intentionally simple (hierarchy only). When cross-note
 * links land later, push them into `edgesRef` the same way and the rest works.
 */

interface SimNode {
  id: string;
  title: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  degree: number;
}

interface Edge {
  a: SimNode;
  b: SimNode;
}

interface Camera {
  zoom: number;
  x: number; // screen px of world origin
  y: number;
}

// --- simulation tuning -------------------------------------------------------
const REPULSION = 5200; // node-node push (inverse square)
const LINK_DISTANCE = 78; // spring rest length
const LINK_STRENGTH = 0.05;
const GRAVITY = 0.02; // pull toward origin so the graph stays on screen
const DAMPING = 0.85; // velocity decay per tick
const ALPHA_DECAY = 0.02;
const ALPHA_MIN = 0.02;
const MAX_VELOCITY = 30;

// --- palette (Desert Dusk) ---------------------------------------------------
const NODE = "#A89F93"; // text-bone
const NODE_HOVER = "#EDE6DB"; // text-parchment
const LABEL = "#EDE6DB";
const LABEL_DIM = "#A89F93"; // text-bone (readable over the label pill)
const EDGE = "130, 118, 108"; // soft warm grey rgb
const PILL = "rgba(20, 18, 16, 0.72)"; // label backdrop (bg-vault-ish)

export function NotesGraph({
  className,
  onOpenNote,
}: {
  className?: string;
  onOpenNote: (id: string) => void;
}) {
  const notes = useNotesStore((s) => s.notes);
  const activeId = useNotesStore((s) => s.activeId);
  const accentKey = useSettingsStore((s) => s.accent);
  const accent = ACCENTS[accentKey]?.primary ?? ACCENTS.terracotta.primary;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Mutable simulation state (kept out of React to avoid per-frame re-renders).
  const nodesRef = useRef<SimNode[]>([]);
  const nodeMapRef = useRef<Map<string, SimNode>>(new Map());
  const edgesRef = useRef<Edge[]>([]);
  const adjRef = useRef<Map<string, Set<string>>>(new Map());
  const camRef = useRef<Camera>({ zoom: 1, x: 0, y: 0 });
  const alphaRef = useRef(1);
  const sizeRef = useRef({ w: 0, h: 0 });

  const hoverRef = useRef<string | null>(null);
  const activeRef = useRef<string | null>(activeId);
  const accentRef = useRef(accent);
  const onOpenRef = useRef(onOpenNote);
  const reducedRef = useRef(false);

  const runningRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const interactedRef = useRef(false);
  const didFitRef = useRef(false);

  // Imperative bridges to the loop closure (declared before the effects that
  // close over them so there's no temporal-dead-zone hazard).
  const dragRef = useRef<SimNode | null>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const downRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const startRef = useRef<(() => void) | null>(null);
  const renderOnceRef = useRef<(() => void) | null>(null);
  const fitRef = useRef<(() => void) | null>(null);

  function kick(a = 0.6) {
    alphaRef.current = Math.max(alphaRef.current, a);
    startRef.current?.();
  }

  // Keep latest props/derived values reachable from the persistent loop.
  activeRef.current = activeId;
  accentRef.current = accent;
  onOpenRef.current = onOpenNote;

  // ---- build / sync the graph from notes ----------------------------------
  useEffect(() => {
    const prev = nodeMapRef.current;
    const next = new Map<string, SimNode>();

    notes.forEach((n, i) => {
      const existing = prev.get(n.id);
      if (existing) {
        existing.title = n.title || "Untitled note";
        next.set(n.id, existing);
      } else {
        // Seed new nodes on a golden-angle spiral near the origin.
        const angle = i * 2.399963229728653;
        const rad = 24 + i * 1.8;
        next.set(n.id, {
          id: n.id,
          title: n.title || "Untitled note",
          x: Math.cos(angle) * rad + (Math.random() - 0.5) * 8,
          y: Math.sin(angle) * rad + (Math.random() - 0.5) * 8,
          vx: 0,
          vy: 0,
          r: 6,
          degree: 0,
        });
      }
    });

    const edges: Edge[] = [];
    const adj = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      if (!adj.has(a)) adj.set(a, new Set());
      adj.get(a)!.add(b);
    };
    notes.forEach((n) => {
      if (n.parentId && next.has(n.parentId)) {
        const a = next.get(n.parentId)!;
        const b = next.get(n.id)!;
        edges.push({ a, b });
        link(a.id, b.id);
        link(b.id, a.id);
      }
    });

    next.forEach((node) => {
      const deg = adj.get(node.id)?.size ?? 0;
      node.degree = deg;
      node.r = 5 + Math.sqrt(deg) * 3;
    });

    nodeMapRef.current = next;
    nodesRef.current = Array.from(next.values());
    edgesRef.current = edges;
    adjRef.current = adj;
    didFitRef.current = false;
    kick(0.9);
  }, [notes]);

  // ---- canvas setup + render/physics loop ---------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mql.matches;
    const onMql = () => (reducedRef.current = mql.matches);
    mql.addEventListener?.("change", onMql);

    let dpr = Math.max(1, window.devicePixelRatio || 1);

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      sizeRef.current = { w, h };
      dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!initializedRef.current && w > 0) {
        camRef.current = { zoom: 1, x: w / 2, y: h / 2 };
        initializedRef.current = true;
      }
      renderOnceRef.current?.();
    };

    // ---- physics ----
    const tick = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const alpha = alphaRef.current;
      const n = nodes.length;

      // Pairwise repulsion.
      for (let i = 0; i < n; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < n; j++) {
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) {
            dx = (Math.random() - 0.5) * 1;
            dy = (Math.random() - 0.5) * 1;
            d2 = dx * dx + dy * dy + 0.01;
          }
          const d = Math.sqrt(d2);
          const f = (REPULSION / d2) * alpha;
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      }

      // Link springs.
      for (const { a, b } of edges) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - LINK_DISTANCE) * LINK_STRENGTH * alpha;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      // Center gravity + integrate.
      const dragId = dragRef.current?.id;
      for (const node of nodes) {
        if (node.id === dragId) {
          node.vx = 0;
          node.vy = 0;
          continue;
        }
        node.vx -= node.x * GRAVITY * alpha;
        node.vy -= node.y * GRAVITY * alpha;
        node.vx *= DAMPING;
        node.vy *= DAMPING;
        node.vx = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, node.vx));
        node.vy = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, node.vy));
        node.x += node.vx;
        node.y += node.vy;
      }

      alphaRef.current = Math.max(0, alpha - ALPHA_DECAY * alpha);
    };

    const screen = (node: SimNode) => {
      const cam = camRef.current;
      return { x: node.x * cam.zoom + cam.x, y: node.y * cam.zoom + cam.y };
    };

    const render = () => {
      const { w, h } = sizeRef.current;
      const cam = camRef.current;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const adj = adjRef.current;
      const acc = accentRef.current;
      const accRGB = hexToRgb(acc);
      ctx.clearRect(0, 0, w, h);

      // Backdrop — soft vignette + a faint dot grid that drifts with the camera.
      drawBackdrop(ctx, w, h, cam);

      const focus = hoverRef.current ?? activeRef.current;
      let near: Set<string> | null = null;
      if (focus && nodeMapRef.current.has(focus)) {
        near = new Set(adj.get(focus) ?? []);
        near.add(focus);
      }
      const dim = (id: string) => (near ? !near.has(id) : false);

      // Edges — gentle curves; the focused cluster lights up in the accent.
      ctx.lineCap = "round";
      for (const { a, b } of edges) {
        const sa = screen(a);
        const sb = screen(b);
        const hot = focus != null && (a.id === focus || b.id === focus);
        const dx = sb.x - sa.x;
        const dy = sb.y - sa.y;
        const cx = (sa.x + sb.x) / 2 - dy * 0.08;
        const cy = (sa.y + sb.y) / 2 + dx * 0.08;
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.quadraticCurveTo(cx, cy, sb.x, sb.y);
        if (hot) {
          ctx.strokeStyle = acc;
          ctx.lineWidth = 1.8;
          ctx.globalAlpha = 0.85;
        } else {
          ctx.strokeStyle = `rgb(${EDGE})`;
          ctx.lineWidth = 1.1;
          ctx.globalAlpha = near ? 0.06 : 0.2;
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Nodes — soft glow for the focused node, a shaded core + rim for all.
      for (const node of nodes) {
        const s = screen(node);
        const r = Math.max(3, node.r * cam.zoom);
        const isActive = node.id === activeRef.current;
        const isHover = node.id === hoverRef.current;
        const dimmed = dim(node.id);
        const baseAlpha = dimmed ? 0.25 : 1;

        if ((isActive || isHover) && !dimmed) {
          const c = isActive ? accRGB : "237, 230, 219";
          const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 4);
          glow.addColorStop(0, `rgba(${c}, 0.35)`);
          glow.addColorStop(1, `rgba(${c}, 0)`);
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(s.x, s.y, r * 4, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = baseAlpha;
        const fill = isActive ? acc : isHover ? NODE_HOVER : NODE;
        const core = ctx.createRadialGradient(
          s.x - r * 0.35,
          s.y - r * 0.35,
          r * 0.2,
          s.x,
          s.y,
          r,
        );
        core.addColorStop(0, lighten(fill, 0.35));
        core.addColorStop(1, fill);
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();

        // Subtle rim for definition.
        ctx.lineWidth = 1;
        ctx.strokeStyle = isActive ? acc : "rgba(237, 230, 219, 0.28)";
        ctx.globalAlpha = baseAlpha * (isActive ? 0.9 : 0.5);
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.stroke();

        // Accent halo ring on the active node.
        if (isActive && !dimmed) {
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = acc;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(s.x, s.y, r + 5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Labels — fade in with zoom; a translucent pill keeps them legible.
      const zoomAlpha = Math.max(0, Math.min(1, (cam.zoom - 0.45) / 0.45));
      ctx.font = "500 12px ui-sans-serif, system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const node of nodes) {
        const dimmed = dim(node.id);
        const focused =
          node.id === hoverRef.current || node.id === activeRef.current;
        const a = focused ? 1 : dimmed ? 0 : zoomAlpha;
        if (a <= 0.01) continue;
        const s = screen(node);
        const r = Math.max(3, node.r * cam.zoom);
        const label =
          node.title.length > 24 ? node.title.slice(0, 23) + "…" : node.title;
        const tw = ctx.measureText(label).width;
        const ly = s.y + r + 12;

        ctx.globalAlpha = a * (focused ? 0.92 : 0.5);
        roundRectPath(ctx, s.x - tw / 2 - 6, ly - 9, tw + 12, 18, 6);
        ctx.fillStyle = PILL;
        ctx.fill();

        ctx.globalAlpha = a;
        ctx.fillStyle = focused ? LABEL : LABEL_DIM;
        ctx.fillText(label, s.x, ly);
      }
      ctx.globalAlpha = 1;
    };

    const renderOnce = () => render();

    const loop = () => {
      tick();
      render();
      if (
        alphaRef.current > ALPHA_MIN ||
        dragRef.current ||
        panRef.current
      ) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        runningRef.current = false;
        rafRef.current = null;
      }
    };

    const start = () => {
      if (runningRef.current) return;
      if (reducedRef.current) {
        // Settle synchronously, then render a static frame (no animation).
        for (let i = 0; i < 240 && alphaRef.current > ALPHA_MIN; i++) tick();
        render();
        return;
      }
      runningRef.current = true;
      rafRef.current = requestAnimationFrame(loop);
    };
    startRef.current = start;
    renderOnceRef.current = renderOnce;
    fitRef.current = fit;

    // Auto-fit once the first layout settles (unless the user took over).
    const settleWatch = window.setInterval(() => {
      if (didFitRef.current || interactedRef.current) return;
      if (nodesRef.current.length > 0 && alphaRef.current <= 0.08) {
        fit();
        didFitRef.current = true;
      }
    }, 150);

    // ---- pointer interaction ----
    const pointerPos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const worldOf = (px: number, py: number) => {
      const cam = camRef.current;
      return { x: (px - cam.x) / cam.zoom, y: (py - cam.y) / cam.zoom };
    };
    const hitTest = (px: number, py: number): SimNode | null => {
      const cam = camRef.current;
      const nodes = nodesRef.current;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const s = { x: n.x * cam.zoom + cam.x, y: n.y * cam.zoom + cam.y };
        const r = Math.max(6, n.r * cam.zoom) + 4;
        if ((px - s.x) ** 2 + (py - s.y) ** 2 <= r * r) return n;
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      const p = pointerPos(e);
      downRef.current = { x: p.x, y: p.y, moved: false };
      const node = hitTest(p.x, p.y);
      canvas.setPointerCapture(e.pointerId);
      if (node) {
        dragRef.current = node;
      } else {
        panRef.current = { x: p.x, y: p.y };
      }
      interactedRef.current = true;
    };

    const onPointerMove = (e: PointerEvent) => {
      const p = pointerPos(e);
      const down = downRef.current;
      if (down && !down.moved) {
        if ((p.x - down.x) ** 2 + (p.y - down.y) ** 2 > 16) down.moved = true;
      }
      if (dragRef.current) {
        const w = worldOf(p.x, p.y);
        dragRef.current.x = w.x;
        dragRef.current.y = w.y;
        dragRef.current.vx = 0;
        dragRef.current.vy = 0;
        kick(0.3);
      } else if (panRef.current) {
        const cam = camRef.current;
        cam.x += p.x - panRef.current.x;
        cam.y += p.y - panRef.current.y;
        panRef.current = { x: p.x, y: p.y };
        renderOnceRef.current?.();
      } else {
        const hit = hitTest(p.x, p.y);
        const id = hit?.id ?? null;
        canvas.style.cursor = hit ? "pointer" : "grab";
        if (id !== hoverRef.current) {
          hoverRef.current = id;
          if (!runningRef.current) renderOnceRef.current?.();
        }
      }
    };

    const endPointer = (e: PointerEvent) => {
      const down = downRef.current;
      const wasNode = dragRef.current;
      if (down && !down.moved) {
        const node = hitTest(down.x, down.y);
        if (node) onOpenRef.current(node.id);
      }
      if (wasNode) kick(0.2);
      dragRef.current = null;
      panRef.current = null;
      downRef.current = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    };

    const onPointerLeave = () => {
      if (hoverRef.current) {
        hoverRef.current = null;
        if (!runningRef.current) renderOnceRef.current?.();
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      interactedRef.current = true;
      const p = pointerPos(e as unknown as PointerEvent);
      const cam = camRef.current;
      const wx = (p.x - cam.x) / cam.zoom;
      const wy = (p.y - cam.y) / cam.zoom;
      const factor = Math.exp(-e.deltaY * 0.0015);
      cam.zoom = Math.max(0.2, Math.min(4, cam.zoom * factor));
      cam.x = p.x - wx * cam.zoom;
      cam.y = p.y - wy * cam.zoom;
      renderOnceRef.current?.();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.style.cursor = "grab";

    function fit() {
      const nodes = nodesRef.current;
      const { w, h } = sizeRef.current;
      if (nodes.length === 0 || w === 0) return;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const n of nodes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x);
        maxY = Math.max(maxY, n.y);
      }
      const pad = 80;
      const bw = Math.max(1, maxX - minX);
      const bh = Math.max(1, maxY - minY);
      const zoom = Math.max(
        0.2,
        Math.min(2, Math.min((w - pad) / bw, (h - pad) / bh)),
      );
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      camRef.current = { zoom, x: w / 2 - cx * zoom, y: h / 2 - cy * zoom };
      renderOnceRef.current?.();
    }

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    start();

    return () => {
      mql.removeEventListener?.("change", onMql);
      ro.disconnect();
      window.clearInterval(settleWatch);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endPointer);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Repaint when the highlighted/active note changes while settled.
  useEffect(() => {
    if (!runningRef.current) renderOnceRef.current?.();
  }, [activeId, accent]);

  const zoomBy = (factor: number) => {
    const { w, h } = sizeRef.current;
    const cam = camRef.current;
    const wx = (w / 2 - cam.x) / cam.zoom;
    const wy = (h / 2 - cam.y) / cam.zoom;
    cam.zoom = Math.max(0.2, Math.min(4, cam.zoom * factor));
    cam.x = w / 2 - wx * cam.zoom;
    cam.y = h / 2 - wy * cam.zoom;
    renderOnceRef.current?.();
  };

  const hasNotes = notes.length > 0;
  const linkCount = notes.filter(
    (n) => n.parentId && notes.some((p) => p.id === n.parentId),
  ).length;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden rounded-xl bg-background-vault/40",
        className,
      )}
    >
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />

      {!hasNotes && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-background-tertiary text-text-stone">
              <Share2 size={20} />
            </div>
            <p className="text-sm text-text-bone">Your notes graph is empty</p>
            <p className="mt-1 font-mono text-[11px] text-text-stone">
              Create a few notes and nest them to see the connections.
            </p>
          </div>
        </div>
      )}

      {/* Info chip */}
      {hasNotes && (
        <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-border-ash bg-background-secondary/70 px-3 py-2 shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-parchment">
            <Share2 size={13} className="text-accent-primary" /> Notes graph
          </div>
          <div className="mt-1 flex items-center gap-3 font-mono text-[10px] text-text-stone">
            <span>{notes.length} note{notes.length === 1 ? "" : "s"}</span>
            <span>·</span>
            <span>{linkCount} link{linkCount === 1 ? "" : "s"}</span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-0.5 rounded-xl border border-border-ash bg-background-secondary/70 p-1 shadow-xl backdrop-blur-md">
        <GraphButton label="Zoom in" onClick={() => zoomBy(1.25)}>
          <ZoomIn size={16} />
        </GraphButton>
        <GraphButton label="Zoom out" onClick={() => zoomBy(0.8)}>
          <ZoomOut size={16} />
        </GraphButton>
        <div className="mx-1.5 my-0.5 h-px bg-border-ash" />
        <GraphButton label="Fit to view" onClick={() => fitRef.current?.()}>
          <Maximize2 size={16} />
        </GraphButton>
      </div>

      {/* Legend hint */}
      {hasNotes && (
        <div className="pointer-events-none absolute bottom-4 left-4 hidden items-center gap-2 rounded-full border border-border-ash bg-background-secondary/70 px-3 py-1.5 font-mono text-[10px] text-text-stone shadow-lg backdrop-blur-md sm:flex">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: accent }}
          />
          active · drag to move · scroll to zoom · click to open
        </div>
      )}
    </div>
  );
}

function GraphButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-DEFAULT text-text-bone transition-colors hover:bg-background-tertiary hover:text-accent-primary active:scale-95"
    >
      {children}
    </button>
  );
}

// --- canvas drawing helpers --------------------------------------------------

/** Parses "#rrggbb" → "r, g, b" (falls back to a neutral grey). */
function hexToRgb(hex: string): string {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  if (!m) return "196, 101, 74";
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
}

/** Mixes a hex colour toward white by `amt` (0–1) → "rgb(...)". */
function lighten(hex: string, amt: number): string {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  return `rgb(${mix(parseInt(m[1], 16))}, ${mix(parseInt(m[2], 16))}, ${mix(parseInt(m[3], 16))})`;
}

/** Soft radial vignette + a faint dot grid that pans/zooms with the camera. */
function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cam: Camera,
) {
  const vignette = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.25,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75,
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.28)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  const spacing = 34 * cam.zoom; // 34 world px between dots
  if (spacing > 12) {
    const ox = ((cam.x % spacing) + spacing) % spacing;
    const oy = ((cam.y % spacing) + spacing) % spacing;
    ctx.fillStyle = "rgba(237, 230, 219, 0.045)";
    for (let x = ox; x < w; x += spacing) {
      for (let y = oy; y < h; y += spacing) {
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }
  }
}

/** Traces a rounded-rectangle path (caller fills/strokes). */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
