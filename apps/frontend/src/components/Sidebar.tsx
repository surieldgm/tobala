"use client";

import { useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useClientSearchParams } from "@/hooks/useClientSearchParams";
import { getContextColors, EDGE_META, F, C, TAGLINE } from "@/lib/design";
import { useNotes } from "@/hooks/useNotes";
import { useContexts } from "@/hooks/useContexts";
import { useTags } from "@/hooks/useTags";
import { useGraph } from "@/hooks/useGraph";
import { useLogout } from "@/hooks/useAuth";

const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <circle cx="5.5" cy="5.5" r="3.8" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M8.5 8.5L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useClientSearchParams();
  const filterCtx = sp.get("ctx") ?? "";
  const filterTag = sp.get("tag") ?? "";
  const query = sp.get("q") ?? "";
  const logout = useLogout();

  const notes = useNotes();
  const graph = useGraph();
  const contexts = useContexts();
  const topTags = useTags({ order: "count" });

  const notesCount = notes.data?.length ?? 0;
  const edgesCount = graph.data?.edges.length ?? 0;

  const pushParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(sp.toString());
      if (value) params.set(key, value); else params.delete(key);
      // Always land on /notes when filtering so the grid is visible.
      router.push(`/notes?${params.toString()}`);
    },
    [router, sp]
  );

  const isNotesList = pathname === "/notes";
  const isAsk = pathname === "/ask";

  return (
    <div style={{
      width: 210, minWidth: 210,
      background: C.bg, borderRight: `1px solid ${C.border}`,
      padding: "18px 14px", display: "flex", flexDirection: "column",
      overflow: "auto",
    }}>
      {/* Brand */}
      <div style={{ fontFamily: F.serif, fontSize: 18, fontWeight: 600, color: C.text2, fontStyle: "italic", letterSpacing: -.5, display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <Image
          src="/tobala.jpeg"
          width={32}
          height={32}
          alt="Tobalá agave mascot"
          style={{ borderRadius: 7, objectFit: "cover", flexShrink: 0 }}
        />
        Tobalá
      </div>
      {/* Motto — the UX hypothesis in four words. */}
      <p style={{ fontFamily: F.serif, fontStyle: "italic", fontSize: 10.5, color: C.text3, opacity: .8, marginTop: 1, marginBottom: 14, letterSpacing: .1 }}>
        {TAGLINE}
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

      {/* Ask Tobalá */}
      <Link
        href="/ask"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "7px 10px", borderRadius: 7, marginBottom: 14,
          background: isAsk ? "#F2ECF7" : "transparent",
          border: `1px solid ${isAsk ? "#B9A0D4" : C.border}`,
          color: isAsk ? "#6B4AA3" : C.text2,
          fontFamily: F.serif, fontSize: 13, fontWeight: 500,
          textDecoration: "none",
        }}
      >
        <span style={{ fontSize: 13 }}>✨</span> Ask Tobalá
      </Link>

      {/* Contexts */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h4 style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, color: C.text3, opacity: .6 }}>
            Contexts
          </h4>
          <Link
            href="/contexts"
            style={{ fontFamily: F.mono, fontSize: 9, color: C.text3, opacity: .5, textDecoration: "none" }}
          >
            edit
          </Link>
        </div>

        <div
          onClick={() => pushParam("ctx", "")}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 8px", borderRadius: 5, fontSize: 12.5,
            cursor: "pointer", color: C.text2,
            background: isNotesList && !filterCtx ? C.muted : "transparent",
            fontWeight: isNotesList && !filterCtx ? 600 : 400,
          }}
        >
          All Notes
          <span style={{ marginLeft: "auto", fontFamily: F.mono, fontSize: 10, color: C.text3, opacity: .5 }}>
            {notesCount}
          </span>
        </div>

        {(contexts.data ?? []).map((c) => {
          const col = getContextColors(c);
          const active = isNotesList && filterCtx === String(c.id);
          return (
            <div
              key={c.id}
              onClick={() => pushParam("ctx", String(c.id))}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 8px", borderRadius: 5, fontSize: 12.5,
                cursor: "pointer", color: C.text2,
                background: active ? C.muted : "transparent",
                fontWeight: active ? 600 : 400,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: col.dot, flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              <span style={{ marginLeft: "auto", fontFamily: F.mono, fontSize: 10, color: C.text3, opacity: .5 }}>
                {c.note_count ?? 0}
              </span>
            </div>
          );
        })}

        <div
          onClick={() => pushParam("ctx", "none")}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 8px", borderRadius: 5, fontSize: 12,
            cursor: "pointer", color: C.text3, fontStyle: "italic",
            background: isNotesList && filterCtx === "none" ? C.muted : "transparent",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#B8B0A3", flexShrink: 0 }} />
          Unsorted
        </div>
      </div>

      {/* Tags */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h4 style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, color: C.text3, opacity: .6 }}>
            Tags
          </h4>
          <Link
            href="/tags"
            style={{ fontFamily: F.mono, fontSize: 9, color: C.text3, opacity: .5, textDecoration: "none" }}
          >
            see all
          </Link>
        </div>
        {(topTags.data ?? []).slice(0, 20).map((t) => {
          const active = isNotesList && filterTag === t.name;
          return (
            <div
              key={t.id}
              onClick={() => pushParam("tag", active ? "" : t.name)}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "3px 8px", borderRadius: 5, fontSize: 11.5,
                cursor: "pointer",
                background: active ? C.muted : "transparent",
                color: active ? C.text : C.text2,
                fontWeight: active ? 600 : 400,
                fontFamily: F.mono,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
              <span style={{ marginLeft: "auto", fontSize: 9.5, color: C.text3, opacity: .5 }}>
                {t.note_count ?? 0}
              </span>
            </div>
          );
        })}
        {!(topTags.data?.length) && (
          <p style={{ fontSize: 10.5, color: C.text3, opacity: .45, fontStyle: "italic", padding: "3px 8px" }}>
            Save a note — the LLM tags it for you.
          </p>
        )}
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
