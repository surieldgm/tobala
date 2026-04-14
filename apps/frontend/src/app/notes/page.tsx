"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCreateNote, useNotes } from "@/hooks/useNotes";
import { useGraph } from "@/hooks/useGraph";
import { CAT_META, EDGE_META, F, C } from "@/lib/design";
import { GraphViewSVG } from "@/components/GraphViewSVG";
import type { Category } from "@/lib/types";

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

function BubbleTea() {
  return (
    <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
      <rect x="25" y="22" width="50" height="60" rx="10" fill="#E8C88A" stroke="#C4A265" strokeWidth="1.5"/>
      <rect x="30" y="27" width="40" height="46" rx="7" fill="#F5E6C8"/>
      <circle cx="38" cy="46" r="2.5" fill="#8B7355"/>
      <circle cx="48" cy="52" r="2.5" fill="#8B7355"/>
      <circle cx="58" cy="46" r="2.5" fill="#8B7355"/>
      <circle cx="43" cy="58" r="2.5" fill="#8B7355"/>
      <path d="M41 37c0 0 3-2.5 6 0s6 0 6 0" stroke="#8B7355" strokeWidth="1.2" strokeLinecap="round"/>
      <ellipse cx="44" cy="39.5" rx="1.2" ry="1.6" fill="#8B7355"/>
      <ellipse cx="55" cy="39.5" rx="1.2" ry="1.6" fill="#8B7355"/>
      <rect x="47" y="8" width="3" height="18" rx="1.5" fill="#8B7355"/>
      <path d="M43 16Q50 12 57 16" stroke="#8B7355" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

function NotesDashboard() {
  const router = useRouter();
  const sp = useSearchParams();
  const filterCat = (sp.get("cat") ?? "all") as "all" | Category;
  const query = sp.get("q") ?? "";
  const view = sp.get("view") ?? "cards";

  const notes = useNotes({ category: filterCat !== "all" ? filterCat : undefined, q: query || undefined });
  const graph = useGraph();
  const createNote = useCreateNote();

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
        <div style={{ display: "flex", gap: 2, background: C.muted, borderRadius: 6, padding: 2 }}>
          {(["cards", "graph"] as const).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setView(k)}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "5px 12px", borderRadius: 5, border: "none",
                background: view === k ? C.bg : "transparent",
                fontFamily: F.serif, fontSize: 12.5,
                color: view === k ? C.text2 : C.text3,
                cursor: "pointer", fontWeight: view === k ? 600 : 400,
                boxShadow: view === k ? "0 1px 2px rgba(0,0,0,.06)" : "none",
              }}
            >
              {k === "cards" ? <CardsIcon /> : <GraphIcon />}
              {k === "cards" ? "Cards" : "Graph"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            createNote.mutate(
              { title: "", body: "", category: "random" },
              { onSuccess: n => router.push(`/notes/${n.id}`) }
            )
          }
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
                {(Object.entries(CAT_META) as [string, typeof CAT_META[keyof typeof CAT_META]][]).map(([k, v]) => (
                  <span key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: F.mono, fontSize: 10, color: C.text3 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: v.dot }} /> {v.label}
                  </span>
                ))}
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <BubbleTea />
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
            const cat = CAT_META[n.category as keyof typeof CAT_META] ?? CAT_META.random;
            const deg = graph.data
              ? graph.data.edges.filter(e => e.source === n.id || e.target === n.id).length
              : 0;
            return (
              <div
                key={n.id}
                onClick={() => router.push(`/notes/${n.id}`)}
                style={{
                  padding: 16, borderRadius: 8,
                  border: `1.5px solid ${cat.border}`,
                  background: cat.bg, cursor: "pointer",
                  display: "flex", flexDirection: "column", gap: 5,
                  minHeight: 130,
                  transition: "transform .15s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: F.mono, fontSize: 10, color: C.text3, opacity: .65 }}>
                    {fmtDate(n.edited)}
                  </span>
                  <span style={{ fontFamily: F.mono, fontSize: 9, color: C.text3, opacity: .5 }}>
                    {cat.label}
                  </span>
                </div>
                <h3 style={{ fontFamily: F.serif, fontSize: 15.5, fontWeight: 600, color: C.text, margin: 0, lineHeight: 1.3 }}>
                  {n.title || "Untitled"}
                </h3>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, color: C.text2, opacity: .75, flex: 1, overflow: "hidden" }}>
                  {n.body.slice(0, 120)}{n.body.length > 120 ? "…" : ""}
                </p>
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
