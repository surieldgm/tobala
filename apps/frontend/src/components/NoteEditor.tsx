"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDeleteNote, useUpdateNote } from "@/hooks/useNotes";
import { CAT_META, F, C, S } from "@/lib/design";
import { CatDropdown } from "@/components/CatDropdown";
import { EdgeCreator } from "@/components/EdgeCreator";
import { useNeighbors, useSuggestions, useCreateLink } from "@/hooks/useEdges";
import type { Category, Note } from "@/lib/types";

/* ── Icons ── */
const LinkIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path d="M4.5 6.5a2 2 0 003 0l1.2-1.2A2 2 0 005.9 2.2L5 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    <path d="M6.5 4.5a2 2 0 00-3 0L2.3 5.8A2 2 0 005.1 8.8L6 8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
  </svg>
);
const BackIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path d="M7.5 5.5H3.5M3.5 5.5L5.5 3.5M3.5 5.5l2 2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x=".8" y=".8" width="9.4" height="9.4" rx="2.2" stroke="currentColor" strokeWidth=".9"/>
  </svg>
);
const SparkIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M6 1v3.5M6 7.5V11M1 6h3.5M7.5 6H11M2.8 2.8l2 2M7.2 7.2l2 2M9.2 2.8l-2 2M4.8 7.2l-2 2" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
  </svg>
);

/* ── Helpers ── */
function fmtTime(iso: string) {
  return (
    new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) +
    " at " +
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

type SaveState = "saved" | "pending" | "saving" | "error";

/* ── Auto-save delay ── */
const DEBOUNCE_MS = 800;

interface Props {
  note: Note;
  allNotes: Note[];
}

export function NoteEditor({ note, allNotes }: Props) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement | null>(null);
  const update = useUpdateNote(note.id);
  const del = useDeleteNote();
  const createLink = useCreateLink();
  const neighbors = useNeighbors(note.id, 1);
  const suggestions = useSuggestions(note.id, 4);

  /* ── Local state ── */
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [category, setCategory] = useState<Category>(note.category);
  const [localEdited, setLocalEdited] = useState(note.edited); // updates on each keystroke
  const [saveState, setSaveState] = useState<SaveState>("saved");

  // Keep refs to always-fresh values so debounced flush sees latest content
  const latestTitle = useRef(title);
  const latestBody = useRef(body);
  const latestCategory = useRef(category);
  latestTitle.current = title;
  latestBody.current = body;
  latestCategory.current = category;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Sync when navigating to a different note */
  useEffect(() => {
    setTitle(note.title);
    setBody(note.body);
    setCategory(note.category);
    setLocalEdited(note.edited);
    setSaveState("saved");
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Auto-focus title on brand-new (empty) note */
  useEffect(() => {
    if (!note.title) titleRef.current?.focus();
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Flush pending changes to the server */
  const flush = useCallback(() => {
    setSaveState("saving");
    update.mutate(
      { title: latestTitle.current, body: latestBody.current, category: latestCategory.current },
      {
        onSuccess: () => setSaveState("saved"),
        onError: () => setSaveState("error"),
      }
    );
  }, [update]);

  /* Schedule a debounced save and update the local timestamp immediately */
  const scheduleAutoSave = useCallback(() => {
    setLocalEdited(new Date().toISOString()); // real-time timestamp update
    setSaveState("pending");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, DEBOUNCE_MS);
  }, [flush]);

  /* Flush on unmount if changes are still pending */
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        if (saveState === "pending") flush();
      }
    };
  }, [flush, saveState]);

  const cat = CAT_META[category] ?? CAT_META.random;
  const neighborIds = new Set((neighbors.data ?? []).map(n => n.id));

  /* Category changes save immediately (no debounce needed for a select) */
  const handleCategoryChange = (c: Category) => {
    setCategory(c);
    latestCategory.current = c;
    setLocalEdited(new Date().toISOString());
    update.mutate(
      { title: latestTitle.current, body: latestBody.current, category: c },
      { onSuccess: () => setSaveState("saved"), onError: () => setSaveState("error") }
    );
  };

  const saveLabel =
    saveState === "saving"  ? "Saving…"  :
    saveState === "pending" ? "Unsaved…" :
    saveState === "error"   ? "Error ✕"  :
                              "Saved ✓";

  const saveLabelColor =
    saveState === "error"   ? "#C45B4A" :
    saveState === "saved"   ? "#6B9A5B" :
                              C.text3;

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

      {/* ── Editor pane ── */}
      <div style={{
        flex: 1, margin: 14, marginRight: 0,
        padding: 20, borderRadius: 10,
        border: `1.5px solid ${cat.border}`,
        background: cat.bg,
        display: "flex", flexDirection: "column", overflow: "auto",
      }}>
        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CatDropdown value={category} onChange={handleCategoryChange} />
            <span style={{ fontFamily: F.mono, fontSize: 11, color: C.text3, opacity: .45 }}>
              #{note.id}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Dynamic "Last edited" — updates immediately on every keystroke */}
            <span style={{ fontFamily: F.mono, fontSize: 10, color: C.text3, opacity: .5 }}>
              Last edited: {fmtTime(localEdited)}
            </span>
            {/* Auto-save status badge */}
            <span style={{ fontFamily: F.mono, fontSize: 10, color: saveLabelColor, opacity: .85 }}>
              {saveLabel}
            </span>
            {/* Close → back to notes list */}
            <button
              type="button"
              onClick={() => router.push("/notes")}
              style={S.iconBtn}
              title="Back to notes"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Title */}
        <input
          ref={titleRef}
          placeholder="Note Title"
          value={title}
          onChange={e => { setTitle(e.target.value); scheduleAutoSave(); }}
          style={{
            border: "none", background: "transparent",
            fontFamily: F.serif, fontSize: 21, fontWeight: 700, color: C.text,
            outline: "none", marginBottom: 8, width: "100%",
          }}
        />

        {/* Body */}
        <textarea
          placeholder="Pour your heart out…"
          value={body}
          onChange={e => { setBody(e.target.value); scheduleAutoSave(); }}
          style={{
            border: "none", background: "transparent",
            fontFamily: F.serif, fontSize: 14, color: C.text,
            outline: "none", flex: 1, lineHeight: 1.7, minHeight: 160, width: "100%",
          }}
        />

        {/* Footer */}
        <div style={{
          display: "flex", gap: 6, marginTop: 8, paddingTop: 8,
          borderTop: "1px solid rgba(139,115,85,.12)",
        }}>
          <EdgeCreator sourceId={note.id} notes={allNotes} existingTargetIds={neighborIds} />
          <button
            type="button"
            onClick={() => {
              if (!confirm("Delete this note and all its links?")) return;
              del.mutate(note.id, { onSuccess: () => router.push("/notes") });
            }}
            disabled={del.isPending}
            style={{ ...S.smallBtn, color: "#C45B4A", marginLeft: "auto" }}
          >
            {del.isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{
        width: 250, minWidth: 250,
        padding: "14px 12px", overflow: "auto",
        borderLeft: `1px solid ${C.border}`,
      }}>
        {/* Neighbors */}
        <h4 style={S.panelH}>
          <LinkIcon /> Neighbors ({neighbors.data?.length ?? 0})
        </h4>
        {neighbors.isLoading && <p style={S.panelEmpty}>Loading…</p>}
        {!neighbors.isLoading && !neighbors.data?.length && (
          <p style={S.panelEmpty}>No linked notes yet</p>
        )}
        {neighbors.data?.map(n => (
          <div
            key={n.id}
            onClick={() => router.push(`/notes/${n.id}`)}
            style={{ ...S.edgeCard, cursor: "pointer" }}
          >
            <span style={{
              fontSize: 12.5, fontWeight: 600, color: C.text,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {n.title || "Untitled"}
            </span>
          </div>
        ))}

        {/* Backlinks */}
        <h4 style={{ ...S.panelH, marginTop: 14 }}>
          <BackIcon /> Backlinks
        </h4>
        <p style={S.panelEmpty}>Link in from another note to see backlinks here.</p>

        {/* Suggestions */}
        {(suggestions.data?.length ?? 0) > 0 && (
          <>
            <h4 style={{ ...S.panelH, marginTop: 14, color: "#9B6BC4" }}>
              <SparkIcon /> Suggestions ({suggestions.data!.length})
            </h4>
            <p style={{ fontSize: 9.5, color: C.text3, fontStyle: "italic", marginBottom: 5 }}>
              Similar but not linked
            </p>
            {suggestions.data!.map(s => (
              <div key={s.id} style={{ ...S.edgeCard, background: "#F5EEF9" }}>
                <span
                  onClick={() => router.push(`/notes/${s.id}`)}
                  style={{
                    fontSize: 12.5, fontWeight: 500, color: C.text, flex: 1,
                    cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {s.title || "Untitled"}
                </span>
                <span style={{ fontFamily: F.mono, fontSize: 9, color: "#9B6BC4", flexShrink: 0 }}>
                  {(s.score * 100).toFixed(0)}%
                </span>
                <button
                  type="button"
                  onClick={() => createLink.mutate({ source: note.id, target: s.id, label: "REFERENCES" })}
                  style={{
                    fontSize: 8, padding: "2px 7px",
                    background: "#9B6BC4", color: "#fff",
                    border: "none", borderRadius: 4, cursor: "pointer", flexShrink: 0,
                  }}
                >
                  Link
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
