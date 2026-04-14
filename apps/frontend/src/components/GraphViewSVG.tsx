"use client";

import { useEffect, useRef, useState } from "react";
import { CAT_META, EDGE_META, F, C } from "@/lib/design";
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

export function GraphViewSVG({ data, onSelect, activeId }: Props) {
  const [pos, setPos] = useState<Pos>({});
  const [hov, setHov] = useState<number | null>(null);
  const velRef = useRef<Record<number, { vx: number; vy: number }>>({});
  const rafRef = useRef<number>(0);

  // Re-initialise positions when node count changes
  useEffect(() => {
    const p: Pos = {};
    data.nodes.forEach((n, i) => {
      const a = (i / Math.max(data.nodes.length, 1)) * Math.PI * 2;
      const r = 100 + Math.random() * 55;
      p[n.id] = { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r };
      velRef.current[n.id] = { vx: 0, vy: 0 };
    });
    setPos(p);
  }, [data.nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Force simulation
  useEffect(() => {
    let alive = true;

    const tick = () => {
      if (!alive) return;
      setPos(prev => {
        const ids = Object.keys(prev).map(Number);
        if (!ids.length) return prev;
        const nxt: Pos = {};
        ids.forEach(id => {
          const p = prev[id];
          if (!p) return;
          let fx = 0, fy = 0;

          // Repulsion
          ids.forEach(o => {
            if (o === id || !prev[o]) return;
            const dx = p.x - prev[o].x, dy = p.y - prev[o].y;
            const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            fx += (dx / d) * (900 / (d * d));
            fy += (dy / d) * (900 / (d * d));
          });

          // Attraction along edges
          data.edges.forEach(e => {
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
  }, [data.nodes.length, data.edges.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const degree = (id: number) =>
    data.edges.filter(e => e.source === id || e.target === id).length;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      style={{ background: "transparent", display: "block" }}
    >
      <defs>
        <marker id="arw" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="7" markerHeight="5" orient="auto">
          <path d="M0 0L10 3.5L0 7z" fill={C.accent} opacity=".45" />
        </marker>
      </defs>

      {/* Edges */}
      {data.edges.map((e: NoteLink) => {
        const a = pos[e.source], b = pos[e.target];
        if (!a || !b) return null;
        const meta = EDGE_META[e.label as keyof typeof EDGE_META];
        const hot = hov === e.source || hov === e.target;
        return (
          <g key={e.id}>
            <line
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={hot ? (meta?.color ?? C.accent) : "#D4C5A9"}
              strokeWidth={hot ? 2 : 1}
              opacity={hot ? .8 : .3}
              markerEnd="url(#arw)"
            />
            {hot && meta && (
              <text
                x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 7}
                textAnchor="middle"
                style={{ fontSize: 9, fontFamily: F.mono, fill: meta.color, opacity: .85 }}
              >
                {meta.label}
              </text>
            )}
          </g>
        );
      })}

      {/* Nodes */}
      {data.nodes.map((n: Note) => {
        const p = pos[n.id];
        if (!p) return null;
        const cat = CAT_META[n.category as keyof typeof CAT_META] ?? CAT_META.random;
        const deg = degree(n.id);
        const active = activeId === n.id;
        const hover = hov === n.id;
        const r = active ? 16 : hover ? 14 : Math.min(10 + deg * 1.5, 18);
        return (
          <g
            key={n.id}
            style={{ cursor: "pointer" }}
            onClick={() => onSelect?.(n.id)}
            onMouseEnter={() => setHov(n.id)}
            onMouseLeave={() => setHov(null)}
          >
            <circle cx={p.x} cy={p.y} r={r + 3} fill={cat.bg} opacity={active ? .85 : .35} />
            <circle
              cx={p.x} cy={p.y} r={r}
              fill={cat.dot}
              stroke={active ? C.text : cat.border}
              strokeWidth={active ? 2.5 : 1.2}
            />
            {deg > 2 && (
              <text x={p.x} y={p.y + 3.5} textAnchor="middle"
                style={{ fontSize: 8, fontFamily: F.mono, fill: "#fff", fontWeight: 700 }}
              >
                {deg}
              </text>
            )}
            {(hover || active) && (
              <text x={p.x} y={p.y - r - 9} textAnchor="middle"
                style={{ fontSize: 11, fontFamily: F.serif, fill: C.text, fontWeight: 600 }}
              >
                {n.title.length > 28 ? n.title.slice(0, 28) + "…" : n.title || "Untitled"}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
