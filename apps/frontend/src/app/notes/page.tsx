"use client";

import { Suspense, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useClientSearchParams } from "@/hooks/useClientSearchParams";
import { useCreateNote, useNotes } from "@/hooks/useNotes";
import { useContexts } from "@/hooks/useContexts";
import { useGraph } from "@/hooks/useGraph";
import { getContextColors, EDGE_META, F, C, S } from "@/lib/design";
import { GraphViewSVG } from "@/components/GraphViewSVG";

const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <path d="M6.5 2v9M2 6.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);
const CardsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.1"/>
    <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.1"/>
    <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.1"/>
    <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.1"/>
  </svg>
);
const GraphIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="3" cy="4" r="1.7" stroke="currentColor" strokeWidth="1.1"/>
    <circle cx="11" cy="3.5" r="1.7" stroke="currentColor" strokeWidth="1.1"/>
    <circle cx="7" cy="11.5" r="1.7" stroke="currentColor" strokeWidth="1.1"/>
    <path d="M4.5 5l2 5M9.5 5l-1.5 5" stroke="currentColor" strokeWidth=".9" opacity=".45"/>
  </svg>
);
const LinkIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path d="M4.5 6.5a2 2 0 003 0l1.2-1.2A2 2 0 005.9 2.2L5 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    <path d="M6.5 4.5a2 2 0 00-3 0L2.3 5.8A2 2 0 005.1 8.8L6 8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
  </svg>
);

function fmtDate(iso: string) {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}


function NotesDashboard() {
  const [hoverView, setHoverView] = useState<"cards" | "graph" | null>(null);
  const router = useRouter();
  const sp = useClientSearchParams();
  const filterCtx = sp.get("ctx") ?? "";
  const filterTag = sp.get("tag") ?? "";
  const query = sp.get("q") ?? "";
  const view = sp.get("view") ?? "cards";

  const notes = useNotes({
    ctx: filterCtx || undefined,
    tag: filterTag || undefined,
    q: query || undefined,
  });
  const graph = useGraph();
  const createNote = useCreateNote();
  const contexts = useContexts();

  const sorted = useMemo(
    () => [...(notes.data ?? [])].sort((a, b) => new Date(b.edited).getTime() - new Date(a.edited).getTime()),
    [notes.data]
  );

  const setView = (v: string) => {
    const params = new URLSearchParams(sp.toString());
    params.set("view", v);
    router.replace(`/notes?${params.toString()}`);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Topbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", gap: 6, background: C.muted, borderRadius: 999, padding: 4 }}>
          {(["cards", "graph"] as const).map(k => {
            const active = view === k;
            const hovered = hoverView === k;
            return (
              <button
                key={k}
                type="button"
                aria-label={k === "cards" ? "Cards view" : "Graph view"}
                title={k === "cards" ? "Cards" : "Graph"}
                onClick={() => setView(k)}
                onMouseEnter={() => setHoverView(k)}
                onMouseLeave={() => setHoverView(null)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  border: active ? `1px solid ${C.border}` : "1px solid transparent",
                  background: active
                    ? C.bg
                    : hovered
                      ? "rgba(61, 53, 39, 0.07)"
                      : "transparent",
                  color: active ? C.text2 : C.text3,
                  cursor: "pointer",
                  boxShadow: active ? "0 1px 3px rgba(0,0,0,.08)" : "none",
                  transition: "background-color 0.18s ease, box-shadow 0.18s ease, color 0.18s ease, border-color 0.18s ease",
                }}
              >
                {k === "cards" ? <CardsIcon /> : <GraphIcon />}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            // If filtering by a context, pre-assign new note to that context.
            const ctxId =
              filterCtx && filterCtx !== "none"
                ? Number(filterCtx)
                : null;
            createNote.mutate(
              { title: "", body: "", context_id: ctxId },
              { onSuccess: n => router.push(`/notes/${n.id}`) }
            );
          }}
          disabled={createNote.isPending}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "6px 15px", background: "transparent",
            border: `1.5px solid ${C.accent}`, borderRadius: 16,
            fontFamily: F.serif, fontSize: 13, color: C.text2,
            cursor: "pointer", fontWeight: 500,
            opacity: createNote.isPending ? .6 : 1,
          }}
        >
          <PlusIcon /> New Note
        </button>
      </div>

      {/* Body */}
      {view === "graph" ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
          {graph.data ? (
            <>
              <GraphViewSVG
                data={graph.data}
                onSelect={id => router.push(`/notes/${id}`)}
                activeId={null}
              />
              <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }}>
                {(contexts.data ?? []).map((c) => {
                  const col = getContextColors(c);
                  return (
                    <span key={c.id} style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: F.mono, fontSize: 10, color: C.text3 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: col.dot }} /> {c.name}
                    </span>
                  );
                })}
                <span style={{ color: "#D4C5A9" }}>|</span>
                {(Object.entries(EDGE_META) as [string, typeof EDGE_META[keyof typeof EDGE_META]][]).map(([k, v]) => (
                  <span key={k} style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: F.mono, fontSize: 10, color: v.color }}>
                    {v.icon} {v.label}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13, color: C.text3, fontStyle: "italic" }}>Loading graph…</p>
          )}
        </div>
      ) : sorted.length === 0 && !notes.isLoading ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <Image
            src="/michi.png"
            width={140}
            height={105}
            alt="Sleeping cat waiting for notes"
            style={{ opacity: 0.88, userSelect: "none" }}
            priority
          />
          <p style={{ fontFamily: F.serif, fontSize: 15, color: C.text3, fontStyle: "italic" }}>
            I&apos;m just here waiting for your charming notes…
          </p>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 12, padding: 20, overflow: "auto", flex: 1,
          alignContent: "start",
        }}>
          {notes.isLoading && (
            <p style={{ gridColumn: "1/-1", fontSize: 13, color: C.text3, fontStyle: "italic" }}>Loading…</p>
          )}
          {sorted.map(n => {
            const colors = getContextColors(n.context);
            const deg = graph.data
              ? graph.data.edges.filter(e => e.source === n.id || e.target === n.id).length
              : 0;
            const visibleTags = n.tags.slice(0, 3);
            return (
              <div
                key={n.id}
                onClick={() => router.push(`/notes/${n.id}`)}
                style={{
                  padding: 16, borderRadius: 8,
                  border: `1.5px solid ${colors.border}`,
                  background: colors.bg, cursor: "pointer",
                  display: "flex", flexDirection: "column", gap: 5,
                  minHeight: 130,
                  transition: "transform .15s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: F.mono, fontSize: 10, color: C.text3, opacity: .65 }}>
                    {fmtDate(n.edited)}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: F.mono, fontSize: 9, color: C.text3, opacity: .6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: colors.dot }} />
                    {n.context?.name ?? "Unsorted"}
                  </span>
                </div>
                <h3 style={{ fontFamily: F.serif, fontSize: 15.5, fontWeight: 600, color: C.text, margin: 0, lineHeight: 1.3 }}>
                  {n.title || "Untitled"}
                </h3>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, color: C.text2, opacity: .75, flex: 1, overflow: "hidden" }}>
                  {n.body.slice(0, 120)}{n.body.length > 120 ? "…" : ""}
                </p>
                {visibleTags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {visibleTags.map((t) => (
                      <span
                        key={t.id}
                        style={{
                          ...S.tagChip,
                          cursor: "default",
                          ...(t.source === "system" ? S.tagChipSystem : {}),
                        }}
                      >
                        {t.name}
                      </span>
                    ))}
                    {n.tags.length > visibleTags.length && (
                      <span style={{ fontFamily: F.mono, fontSize: 10, color: C.text3, opacity: .6 }}>
                        +{n.tags.length - visibleTags.length}
                      </span>
                    )}
                  </div>
                )}
                {deg > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: F.mono, fontSize: 9.5, color: C.text3 }}>
                    <LinkIcon /> {deg}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function NotesPage() {
  return (
    <Suspense>
      <NotesDashboard />
    </Suspense>
  );
}
