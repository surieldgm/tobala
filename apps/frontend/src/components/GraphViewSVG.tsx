"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getContextColors, EDGE_META, F, C } from "@/lib/design";
import type { GraphData, Note, NoteLink } from "@/lib/types";

interface Props {
  data: GraphData;
  onSelect?: (noteId: number) => void;
  activeId?: number | null;
}

type Pos = Record<number, { x: number; y: number }>;

const W = 680;
const H = 400;
const PAD = 50;

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 4.5;
const ZOOM_BTN = 1.18;

const CARD_W = 220;
const CARD_H = 112;

/** Coulomb-style ``k / d²`` repulsion; scales with node count to use the viewBox. */
function repelStrengthForCount(nodeCount: number): number {
  const n = Math.max(nodeCount, 1);
  const area = (W - 2 * PAD) * (H - 2 * PAD);
  // Softer when almost empty; stronger as N grows (many pairwise pushes).
  const densityTerm = (area / (n + 4)) * 0.032;
  const bodyTerm = 260 * Math.sqrt(Math.max(n, 2));
  const linearCrowd = 48 * Math.max(0, n - 1);
  const base = Math.min(16_500, Math.max(600, densityTerm + bodyTerm + linearCrowd));
  // Two +300% boosts vs raw formula → 16× repulsion (4× then 4×).
  return Math.min(264_000, Math.max(9_600, base * 16));
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

const CHIP_W = 22;
const CHIP_H = 18;

/** Hub + three neighbors: slash = hide neighbors; plus = show neighbors again. */
function NeighborToggleIcon({ mode }: { mode: "hide" | "show" }) {
  const ink = C.text2;
  return (
    <g transform={`translate(${CHIP_W / 2}, ${CHIP_H / 2}) scale(0.58) translate(-12,-12)`} style={{ pointerEvents: "none" }}>
      <line x1="12" y1="12" x2="12" y2="5" stroke={ink} strokeWidth="1.65" strokeLinecap="round" />
      <line x1="12" y1="12" x2="5" y2="18" stroke={ink} strokeWidth="1.65" strokeLinecap="round" />
      <line x1="12" y1="12" x2="19" y2="18" stroke={ink} strokeWidth="1.65" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.35" fill={ink} />
      <circle cx="12" cy="5" r="1.95" fill={ink} />
      <circle cx="5" cy="18" r="1.95" fill={ink} />
      <circle cx="19" cy="18" r="1.95" fill={ink} />
      {mode === "hide" && (
        <line x1="4.2" y1="4.2" x2="19.8" y2="19.8" stroke={ink} strokeWidth="2.05" strokeLinecap="round" />
      )}
      {mode === "show" && (
        <g transform="translate(18.5, 5.5)">
          <line x1="0" y1="-2.2" x2="0" y2="2.2" stroke={ink} strokeWidth="1.75" strokeLinecap="round" />
          <line x1="-2.2" y1="0" x2="2.2" y2="0" stroke={ink} strokeWidth="1.75" strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

function previewLines(text: string, lineLen: number, maxLines: number): string[] {
  const t = text.trim() || "—";
  const lines: string[] = [];
  for (let i = 0; i < maxLines; i++) {
    const start = i * lineLen;
    if (start >= t.length) break;
    const isLastRow = i === maxLines - 1;
    const remaining = t.length - start;
    if (isLastRow && remaining > lineLen) {
      lines.push(`${t.slice(start, start + lineLen - 1)}…`);
      break;
    }
    lines.push(t.slice(start, start + lineLen));
  }
  return lines;
}

export function GraphViewSVG({ data, onSelect, activeId }: Props) {
  const markerId = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [pos, setPos] = useState<Pos>({});
  const [hov, setHov] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewCx, setViewCx] = useState(W / 2);
  const [viewCy, setViewCy] = useState(H / 2);
  const [dragging, setDragging] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  /** When set, those direct neighbors are hidden and frozen out of the force model. */
  const [neighborCollapseCenter, setNeighborCollapseCenter] = useState<number | null>(null);
  const dragRef = useRef<null | {
    startCx: number;
    startCy: number;
    startX: number;
    startY: number;
    vw0: number;
    vh0: number;
  }>(null);
  const velRef = useRef<Record<number, { vx: number; vy: number }>>({});
  const rafRef = useRef<number>(0);
  const neighborCollapseRef = useRef<number | null>(null);
  const edgesRef = useRef(data.edges);
  useLayoutEffect(() => {
    neighborCollapseRef.current = neighborCollapseCenter;
  }, [neighborCollapseCenter]);
  useLayoutEffect(() => {
    edgesRef.current = data.edges;
  }, [data.edges]);

  const vw = W / zoom;
  const vh = H / zoom;
  const vx = viewCx - vw / 2;
  const vy = viewCy - vh / 2;
  const viewBoxStr = `${vx} ${vy} ${vw} ${vh}`;

  const viewRef = useRef({ zoom: 1, vx: 0, vy: 0, vw: W, vh: H });
  useLayoutEffect(() => {
    viewRef.current = { zoom, vx, vy, vw, vh };
  }, [zoom, vx, vy, vw, vh]);

  const hiddenNeighborIds = useMemo(() => {
    const out = new Set<number>();
    if (neighborCollapseCenter == null) return out;
    for (const e of data.edges) {
      if (e.source === neighborCollapseCenter) out.add(e.target);
      if (e.target === neighborCollapseCenter) out.add(e.source);
    }
    return out;
  }, [neighborCollapseCenter, data.edges]);

  const resetView = useCallback(() => {
    setZoom(1);
    setViewCx(W / 2);
    setViewCy(H / 2);
    setNeighborCollapseCenter(null);
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- reset camera + layout when graph size changes */
  useEffect(() => {
    setZoom(1);
    setViewCx(W / 2);
    setViewCy(H / 2);
    const p: Pos = {};
    data.nodes.forEach((n, i) => {
      const a = (i / Math.max(data.nodes.length, 1)) * Math.PI * 2;
      const r = 100 + Math.random() * 55;
      p[n.id] = { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r };
      velRef.current[n.id] = { vx: 0, vy: 0 };
    });
    setPos(p);
    setExpandedId(null);
    setNeighborCollapseCenter(null);
  }, [data.nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  // Force simulation
  useEffect(() => {
    let alive = true;

    const hiddenNeighbors = (): Set<number> => {
      const c = neighborCollapseRef.current;
      const out = new Set<number>();
      if (c == null) return out;
      for (const e of edgesRef.current) {
        if (e.source === c) out.add(e.target);
        if (e.target === c) out.add(e.source);
      }
      return out;
    };

    const tick = () => {
      if (!alive) return;
      setPos(prev => {
        const hidden = hiddenNeighbors();
        const ids = Object.keys(prev).map(Number);
        if (!ids.length) return prev;
        const visibleCount = ids.filter(i => !hidden.has(i)).length;
        const repelK = repelStrengthForCount(Math.max(visibleCount, 1));
        const nxt: Pos = {};
        ids.forEach(id => {
          const p = prev[id];
          if (!p) return;
          if (hidden.has(id)) {
            nxt[id] = { x: p.x, y: p.y };
            velRef.current[id] = { vx: 0, vy: 0 };
            return;
          }

          let fx = 0, fy = 0;

          // Repulsion (only among nodes that are not hidden-neighborhood ghosts)
          ids.forEach(o => {
            if (o === id || !prev[o]) return;
            if (hidden.has(o)) return;
            const dx = p.x - prev[o].x, dy = p.y - prev[o].y;
            const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            fx += (dx / d) * (repelK / (d * d));
            fy += (dy / d) * (repelK / (d * d));
          });

          // Attraction along edges (skip if either end is a hidden neighbor)
          edgesRef.current.forEach(e => {
            if (hidden.has(e.source) || hidden.has(e.target)) return;
            const oth = e.source === id ? e.target : e.target === id ? e.source : null;
            if (oth == null || !prev[oth]) return;
            const dx = prev[oth].x - p.x, dy = prev[oth].y - p.y;
            const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            fx += (dx / d) * d * 0.012;
            fy += (dy / d) * d * 0.012;
          });

          // Centre pull
          fx += (W / 2 - p.x) * 0.004;
          fy += (H / 2 - p.y) * 0.004;

          const v = velRef.current[id] ?? { vx: 0, vy: 0 };
          v.vx = (v.vx + fx) * 0.55;
          v.vy = (v.vy + fy) * 0.55;
          velRef.current[id] = v;

          nxt[id] = {
            x: Math.max(PAD, Math.min(W - PAD, p.x + v.vx)),
            y: Math.max(PAD, Math.min(H - PAD, p.y + v.vy)),
          };
        });
        return Object.keys(nxt).length ? nxt : prev;
      });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
  }, [data.nodes.length, data.edges.length]);

  const degree = (id: number) =>
    data.edges.filter(e => e.source === id || e.target === id).length;

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const { zoom: z0, vx: vx0, vy: vy0, vw: vw0, vh: vh0 } = viewRef.current;
      const rect = el.getBoundingClientRect();
      const sx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const sy = clamp((e.clientY - rect.top) / rect.height, 0, 1);
      const wx = vx0 + sx * vw0;
      const wy = vy0 + sy * vh0;
      const factor = Math.exp(-e.deltaY * 0.0012);
      const z2 = clamp(z0 * factor, ZOOM_MIN, ZOOM_MAX);
      if (z2 === z0) return;
      const vw2 = W / z2;
      const vh2 = H / z2;
      const vx2 = wx - sx * vw2;
      const vy2 = wy - sy * vh2;
      setZoom(z2);
      setViewCx(vx2 + vw2 / 2);
      setViewCy(vy2 + vh2 / 2);
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, []);

  const zoomInBtn = () => {
    setZoom(z => clamp(z * ZOOM_BTN, ZOOM_MIN, ZOOM_MAX));
  };
  const zoomOutBtn = () => {
    setZoom(z => clamp(z / ZOOM_BTN, ZOOM_MIN, ZOOM_MAX));
  };

  const onBgPointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.button !== 0) return;
    setExpandedId(null);
    setNeighborCollapseCenter(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startCx: viewCx,
      startCy: viewCy,
      startX: e.clientX,
      startY: e.clientY,
      vw0: vw,
      vh0: vh,
    };
    setDragging(true);
  };
  const onBgPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!dragRef.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const dcx = -(dx / rect.width) * dragRef.current.vw0;
    const dcy = -(dy / rect.height) * dragRef.current.vh0;
    setViewCx(dragRef.current.startCx + dcx);
    setViewCy(dragRef.current.startCy + dcy);
  };
  const endPan = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const btnStyle: React.CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: "#FFFCF5",
    color: C.text2,
    fontFamily: F.mono,
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    boxShadow: "0 1px 2px rgba(0,0,0,.06)",
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={viewBoxStr}
        style={{ background: "transparent", display: "block", touchAction: "none" }}
      >
      <defs>
        <marker id={markerId} viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="7" markerHeight="5" orient="auto">
          <path d="M0 0L10 3.5L0 7z" fill={C.accent} opacity=".45" />
        </marker>
      </defs>

      <rect
        x={0}
        y={0}
        width={W}
        height={H}
        fill="transparent"
        style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
        onPointerDown={onBgPointerDown}
        onPointerMove={onBgPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      />

      {/* Edges — dashed + faded for LLM proposals awaiting triage. */}
      {data.edges.map((e: NoteLink) => {
        if (hiddenNeighborIds.has(e.source) || hiddenNeighborIds.has(e.target)) return null;
        const a = pos[e.source], b = pos[e.target];
        if (!a || !b) return null;
        const meta = EDGE_META[e.label as keyof typeof EDGE_META];
        const hot = hov === e.source || hov === e.target;
        const proposed = e.status === "proposed";
        return (
          <g key={e.id}>
            <line
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={hot ? (meta?.color ?? C.accent) : "#D4C5A9"}
              strokeWidth={hot ? 2 : 1}
              opacity={proposed ? (hot ? .55 : .2) : (hot ? .8 : .3)}
              strokeDasharray={proposed ? "4 3" : undefined}
              markerEnd={`url(#${markerId})`}
            />
            {hot && meta && (
              <text
                x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 7}
                textAnchor="middle"
                style={{
                  fontSize: 9,
                  fontFamily: F.mono,
                  fill: meta.color,
                  opacity: proposed ? .6 : .85,
                  fontStyle: proposed ? "italic" : "normal",
                }}
              >
                {proposed ? `${meta.label}?` : meta.label}
              </text>
            )}
          </g>
        );
      })}

      {/* Nodes */}
      {data.nodes.map((n: Note) => {
        if (hiddenNeighborIds.has(n.id)) return null;
        const p = pos[n.id];
        if (!p) return null;
        const colors = getContextColors(n.context);
        const deg = degree(n.id);
        const active = activeId === n.id;
        const hover = hov === n.id;
        const expanded = expandedId === n.id;
        const baseR = active ? 16 : hover ? 14 : Math.min(10 + deg * 1.5, 18);
        const r = expanded ? Math.min(baseR + 6, 24) : baseR;
        return (
          <g
            key={n.id}
            style={{ cursor: "pointer" }}
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            aria-label={`${(n.title || "Untitled").slice(0, 48)}. Click to expand or collapse; double-click to open.`}
            onClick={e => {
              e.stopPropagation();
              if (e.detail === 2) {
                setExpandedId(null);
                onSelect?.(n.id);
                return;
              }
              if (expandedId === n.id) {
                setExpandedId(null);
                return;
              }
              setExpandedId(n.id);
            }}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (expandedId === n.id) setExpandedId(null);
                else setExpandedId(n.id);
              }
            }}
            onMouseEnter={() => setHov(n.id)}
            onMouseLeave={() => setHov(null)}
          >
            <circle cx={p.x} cy={p.y} r={r + 3} fill={colors.bg} opacity={active ? .85 : .35} />
            <circle
              cx={p.x} cy={p.y} r={r}
              fill={colors.dot}
              stroke={active ? C.text : colors.border}
              strokeWidth={active ? 2.5 : 1.2}
            />
            {deg > 2 && (
              <g transform={`translate(${p.x + r * 0.52} ${p.y - r * 0.52})`}>
                <circle r={6} fill="#FFFCF5" stroke={colors.border} strokeWidth={1} />
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fontSize: 7,
                    fontFamily: F.mono,
                    fill: colors.dot,
                    fontWeight: 700,
                    pointerEvents: "none",
                  }}
                >
                  {deg}
                </text>
              </g>
            )}
            {hover && deg > 0 && (
              <g
                transform={`translate(${p.x + r + 4}, ${p.y - 9})`}
                style={{ cursor: "pointer" }}
                onClick={e => {
                  e.stopPropagation();
                  setNeighborCollapseCenter(prev => (prev === n.id ? null : n.id));
                }}
              >
                <title>
                  {neighborCollapseCenter === n.id
                    ? "Mostrar vecinos directos"
                    : "Ocultar vecinos directos"}
                </title>
                <rect
                  x={0}
                  y={0}
                  width={CHIP_W}
                  height={CHIP_H}
                  rx={5}
                  fill="#FFFCF5"
                  stroke={C.border}
                  strokeWidth={1}
                  style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,.08))" }}
                />
                <NeighborToggleIcon mode={neighborCollapseCenter === n.id ? "show" : "hide"} />
              </g>
            )}
          </g>
        );
      })}

      {/* Hovered node title — skip when that node is expanded (card shows title). */}
      {hov != null && expandedId !== hov &&
        (() => {
          const n = data.nodes.find(nn => nn.id === hov);
          const p = pos[hov];
          if (!n || !p) return null;
          const active = activeId === n.id;
          const r = active ? 16 : 14;
          const raw = ((n.title || "").trim() || "Untitled");
          const line = raw.length > 52 ? `${raw.slice(0, 51)}…` : raw;
          return (
            <g style={{ pointerEvents: "none" }}>
              <text
                x={p.x}
                y={p.y - r - 10}
                textAnchor="middle"
                style={{
                  fontSize: 11,
                  fontFamily: F.serif,
                  fontWeight: 600,
                  fill: C.text,
                  stroke: "#FFFCF5",
                  strokeWidth: 3.5,
                  paintOrder: "stroke fill",
                }}
              >
                {line}
              </text>
            </g>
          );
        })()}

      {/* Expanded node card */}
      {expandedId != null && !hiddenNeighborIds.has(expandedId) &&
        (() => {
          const n = data.nodes.find(nn => nn.id === expandedId);
          const p = pos[expandedId];
          if (!n || !p) return null;
          const colors = getContextColors(n.context);
          const deg = degree(n.id);
          const active = activeId === n.id;
          const baseR = active ? 16 : hov === n.id ? 14 : Math.min(10 + deg * 1.5, 18);
          const r = Math.min(baseR + 6, 24);
          let cardX = p.x - CARD_W / 2;
          cardX = clamp(cardX, PAD, W - PAD - CARD_W);
          const gap = 10;
          let cardY = p.y - r - gap - CARD_H;
          if (cardY < PAD) cardY = p.y + r + gap;
          cardY = clamp(cardY, PAD, H - PAD - CARD_H);
          const rawTitle = ((n.title || "").trim() || "Untitled");
          const bodyOneLine = (n.body || "").replace(/\s+/g, " ").trim();
          const preview =
            bodyOneLine.length > 200 ? `${bodyOneLine.slice(0, 197)}…` : bodyOneLine || "—";
          const titleDisp = rawTitle.length > 32 ? `${rawTitle.slice(0, 31)}…` : rawTitle;
          const bodyDisp = previewLines(preview, 34, 3);
          const collapseX = cardX + CARD_W - 30;
          const collapseY = cardY + 6;
          return (
            <g key={`card-${n.id}`}>
              <line
                x1={p.x}
                y1={p.y - r - 2}
                x2={cardX + CARD_W / 2}
                y2={cardY + CARD_H / 2}
                stroke={colors.border}
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.45}
                style={{ pointerEvents: "none" }}
              />
              <rect
                x={cardX}
                y={cardY}
                width={CARD_W}
                height={CARD_H}
                rx={10}
                ry={10}
                fill="#FFFCF5"
                stroke={colors.border}
                strokeWidth={1.5}
                style={{ filter: "drop-shadow(0 3px 8px rgba(0,0,0,.1))" }}
                onClick={e => e.stopPropagation()}
              />
              <text
                x={cardX + 10}
                y={cardY + 22}
                style={{
                  fontSize: 12.5,
                  fontFamily: F.serif,
                  fontWeight: 600,
                  fill: C.text,
                  pointerEvents: "none",
                }}
              >
                {titleDisp}
              </text>
              {bodyDisp.map((line, i) => (
                <text
                  key={i}
                  x={cardX + 10}
                  y={cardY + 40 + i * 13}
                  style={{
                    fontSize: 9.5,
                    fontFamily: F.serif,
                    fill: C.text2,
                    opacity: 0.92,
                    pointerEvents: "none",
                  }}
                >
                  {line}
                </text>
              ))}
              <g
                style={{ cursor: "pointer" }}
                onClick={e => {
                  e.stopPropagation();
                  setExpandedId(null);
                }}
              >
                <title>Collapse</title>
                <rect
                  x={collapseX}
                  y={collapseY}
                  width={24}
                  height={22}
                  rx={5}
                  fill={C.muted}
                  stroke={C.border}
                  strokeWidth={1}
                />
                <text
                  x={collapseX + 12}
                  y={collapseY + 12}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ fontSize: 15, fontFamily: F.mono, fill: C.text2, pointerEvents: "none" }}
                >
                  −
                </text>
              </g>
            </g>
          );
        })()}
    </svg>

      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          zIndex: 2,
          userSelect: "none",
        }}
      >
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={zoomInBtn} style={btnStyle}>
          +
        </button>
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={zoomOutBtn} style={btnStyle}>
          −
        </button>
        <button type="button" aria-label="Reset zoom" title="Fit graph" onClick={resetView} style={{ ...btnStyle, fontSize: 13 }}>
          ⊙
        </button>
      </div>
    </div>
  );
}
