"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CAT_META, EDGE_META, F, C } from "@/lib/design";
import { useNotes } from "@/hooks/useNotes";
import { useGraph } from "@/hooks/useGraph";
import { useLogout } from "@/hooks/useAuth";
import type { Category } from "@/lib/types";

const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <circle cx="5.5" cy="5.5" r="3.8" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M8.5 8.5L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const filterCat = (sp.get("cat") ?? "all") as "all" | Category;
  const query = sp.get("q") ?? "";
  const logout = useLogout();

  const notes = useNotes();
  const graph = useGraph();

  const notesCount = notes.data?.length ?? 0;
  const edgesCount = graph.data?.edges.length ?? 0;

  const catCounts = (notes.data ?? []).reduce<Record<string, number>>(
    (acc, n) => { acc[n.category] = (acc[n.category] ?? 0) + 1; return acc; },
    {}
  );

  const pushParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(sp.toString());
      if (value) params.set(key, value); else params.delete(key);
      // Always navigate to /notes when filtering
      router.push(`/notes?${params.toString()}`);
    },
    [router, sp]
  );

  const isNotesList = pathname === "/notes";

  return (
    <div style={{
      width: 200, minWidth: 200,
      background: C.bg, borderRight: `1px solid ${C.border}`,
      padding: "18px 14px", display: "flex", flexDirection: "column",
      overflow: "auto",
    }}>
      {/* Brand */}
      <div style={{ fontFamily: F.serif, fontSize: 18, fontWeight: 600, color: C.text2, fontStyle: "italic", letterSpacing: -.5, display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
        <span style={{ fontSize: 20 }}>🌵</span> Tobalá
      </div>
      <p style={{ fontFamily: F.mono, fontSize: 8, color: C.text3, opacity: .5, marginBottom: 14, letterSpacing: .4 }}>
        zettelkasten · powered by agave
      </p>

      {/* Search */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", background: C.muted, borderRadius: 7, marginBottom: 14, color: C.text3 }}>
        <SearchIcon />
        <input
          placeholder="Search…"
          value={query}
          onChange={e => pushParam("q", e.target.value)}
          style={{ border: "none", background: "transparent", outline: "none", width: "100%", fontFamily: F.serif, fontSize: 12.5, color: C.text }}
        />
      </div>

      {/* Categories */}
      <div style={{ marginBottom: 14 }}>
        <h4 style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, color: C.text3, marginBottom: 4, opacity: .6 }}>
          All Categories
        </h4>

        {/* All */}
        <div
          onClick={() => pushParam("cat", "")}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 8px", borderRadius: 5, fontSize: 12.5,
            cursor: "pointer", color: C.text2,
            background: isNotesList && filterCat === "all" ? C.muted : "transparent",
            fontWeight: isNotesList && filterCat === "all" ? 600 : 400,
          }}
        >
          All Notes
          <span style={{ marginLeft: "auto", fontFamily: F.mono, fontSize: 10, color: C.text3, opacity: .5 }}>
            {notesCount}
          </span>
        </div>

        {/* Per-category */}
        {(Object.entries(CAT_META) as [Category, typeof CAT_META[Category]][]).map(([k, v]) => (
          <div
            key={k}
            onClick={() => pushParam("cat", k)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 8px", borderRadius: 5, fontSize: 12.5,
              cursor: "pointer", color: C.text2,
              background: isNotesList && filterCat === k ? C.muted : "transparent",
              fontWeight: isNotesList && filterCat === k ? 600 : 400,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: v.dot, flexShrink: 0 }} />
            {v.label}
            <span style={{ marginLeft: "auto", fontFamily: F.mono, fontSize: 10, color: C.text3, opacity: .5 }}>
              {catCounts[k] ?? 0}
            </span>
          </div>
        ))}
      </div>

      {/* Edge legend */}
      <div style={{ marginTop: "auto", paddingTop: 10, borderTop: `1px solid ${C.border}`, marginBottom: 6 }}>
        <h4 style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, color: C.text3, marginBottom: 6, opacity: .6 }}>
          Edge Types
        </h4>
        {(Object.entries(EDGE_META) as [string, typeof EDGE_META[keyof typeof EDGE_META]][]).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 0", fontSize: 11 }}>
            <span style={{ color: v.color, fontWeight: 700, width: 13, textAlign: "center", fontSize: 12 }}>{v.icon}</span>
            <span style={{ color: C.text2 }}>{v.label}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <p style={{ fontFamily: F.mono, fontSize: 9, color: C.text3, opacity: .4, textAlign: "center" }}>
          {notesCount} notes · {edgesCount} edges
        </p>
        <button
          type="button"
          onClick={logout}
          style={{ fontFamily: F.mono, fontSize: 9, color: C.text3, background: "none", border: "none", cursor: "pointer", opacity: .5 }}
        >
          sign out
        </button>
      </div>
    </div>
  );
}
