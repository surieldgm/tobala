"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDeleteNote, useUpdateNote } from "@/hooks/useNotes";
import { CAT_META, EDGE_META, F, C, S } from "@/lib/design";
import { CatDropdown } from "@/components/CatDropdown";
import { EdgeCreator } from "@/components/EdgeCreator";
import { useNeighbors, useDeleteLink } from "@/hooks/useEdges";
import { useSuggestions } from "@/hooks/useEdges";
import { useCreateLink } from "@/hooks/useEdges";
import type { Category, EdgeLabel, Note, NoteLink } from "@/lib/types";

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

function fmtTime(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    + " at " + new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

interface Props {
  note: Note;
  allNotes: Note[];
}

export function NoteEditor({ note, allNotes }: Props) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement | null>(null);
  const update = useUpdateNote(note.id);
  const del = useDeleteNote();
  const deleteLink = useDeleteLink();
  const createLink = useCreateLink();

  const neighbors = useNeighbors(note.id, 1);
  const suggestions = useSuggestions(note.id, 4);

  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [category, setCategory] = useState<Category>(note.category);

  useEffect(() => {
    setTitle(note.title);
    setBody(note.body);
    setCategory(note.category);
  }, [note.id, note.title, note.body, note.category]);

  // focus title on new (empty title) note
  useEffect(() => {
    if (!note.title) titleRef.current?.focus();
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cat = CAT_META[category] ?? CAT_META.random;

  const neighborIds = new Set((neighbors.data ?? []).map(n => n.id));
  const outEdges = (neighbors.data ?? [])
    .map(n => {
      // match back to edge metadata — we only have flat neighbor list, so we display them
      return { note: n };
    });

  const dirty = title !== note.title || body !== note.body || category !== note.category;

  const save = () => update.mutate({ title, body, category });

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
        {/* Topbar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CatDropdown
              value={category}
              onChange={c => { setCategory(c); update.mutate({ title, body, category: c }); }}
            />
            <span style={{ fontFamily: F.mono, fontSize: 11, color: C.text3, opacity: .45 }}>
              #{note.id}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: F.mono, fontSize: 10, color: C.text3, opacity: .5 }}>
              Last edited: {fmtTime(note.edited)}
            </span>
            <button
              type="button"
              onClick={() => router.push("/notes")}
              style={S.iconBtn}
              title="Close"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <input
          ref={titleRef}
          placeholder="Note Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          style={{
            border: "none", background: "transparent",
            fontFamily: F.serif, fontSize: 21, fontWeight: 700, color: C.text,
            outline: "none", marginBottom: 8, width: "100%",
          }}
        />
        <textarea
          placeholder="Pour your heart out…"
          value={body}
          onChange={e => setBody(e.target.value)}
          style={{
            border: "none", background: "transparent",
            fontFamily: F.serif, fontSize: 14, color: C.text,
            outline: "none", flex: 1, lineHeight: 1.7, minHeight: 160, width: "100%",
          }}
        />

        {/* Footer bar */}
        <div style={{ display: "flex", gap: 6, marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(139,115,85,.12)" }}>
          <button
            type="button"
            disabled={!dirty || update.isPending}
            onClick={save}
            style={{ ...S.smallBtn, opacity: !dirty || update.isPending ? .5 : 1 }}
          >
            {update.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
          <EdgeCreator
            sourceId={note.id}
            notes={allNotes}
            existingTargetIds={neighborIds}
          />
          <button
            type="button"
            onClick={() => {
              if (!confirm("Delete this note and all its links?")) return;
              del.mutate(note.id, { onSuccess: () => router.push("/notes") });
            }}
            disabled={del.isPending}
            style={{ ...S.smallBtn, color: "#C45B4A", marginLeft: "auto" }}
          >
            Delete
          </button>
        </div>
        {update.isError && (
          <p style={{ color: "#C45B4A", fontSize: 11, marginTop: 4 }}>
            {(update.error as Error)?.message || "Save failed"}
          </p>
        )}
      </div>

      {/* ── Right panel ── */}
      <div style={{
        width: 250, minWidth: 250,
        padding: "14px 12px", overflow: "auto",
        borderLeft: `1px solid ${C.border}`,
      }}>
        {/* Neighbors (outgoing) */}
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
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {n.title || "Untitled"}
            </span>
          </div>
        ))}

        {/* Backlinks (incoming) */}
        <h4 style={{ ...S.panelH, marginTop: 14 }}>
          <BackIcon /> Backlinks
        </h4>
        {/* We only have neighbors from depth-1 which mixes in/out; show a note about the API */}
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
                  style={{ fontSize: 12.5, fontWeight: 500, color: C.text, flex: 1, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {s.title || "Untitled"}
                </span>
                <span style={{ fontFamily: F.mono, fontSize: 9, color: "#9B6BC4", flexShrink: 0 }}>
                  {(s.score * 100).toFixed(0)}%
                </span>
                <button
                  type="button"
                  onClick={() => createLink.mutate({ source: note.id, target: s.id, label: "REFERENCES" })}
                  style={{ fontSize: 8, padding: "2px 7px", background: "#9B6BC4", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", flexShrink: 0 }}
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
