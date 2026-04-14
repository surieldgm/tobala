"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useNote, useNotes } from "@/hooks/useNotes";
import { useGraph } from "@/hooks/useGraph";
import { NoteEditor } from "@/components/NoteEditor";
import { GraphViewSVG } from "@/components/GraphViewSVG";
import { F, C } from "@/lib/design";
import { useRouter } from "next/navigation";

export default function NoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const noteId = Number(params.id);

  const note = useNote(Number.isFinite(noteId) ? noteId : null);
  const allNotes = useNotes();
  const graph = useGraph();

  const otherNotes = useMemo(
    () => (allNotes.data ?? []).filter(n => n.id !== noteId),
    [allNotes.data, noteId]
  );

  if (note.isLoading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontSize: 13, color: C.text3, fontStyle: "italic" }}>Loading note…</p>
      </div>
    );
  }

  if (note.isError || !note.data) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <p style={{ fontSize: 14, color: "#C45B4A" }}>
          {(note.error as Error)?.message || "Note not found"}
        </p>
        <button
          type="button"
          onClick={() => router.push("/notes")}
          style={{ fontFamily: F.mono, fontSize: 12, color: C.text3, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
        >
          ← Back to notes
        </button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Topbar row is inside NoteEditor via its own header */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <NoteEditor note={note.data} allNotes={otherNotes} />
      </div>

      {/* Inline mini-graph at the bottom */}
      {graph.data && graph.data.nodes.length > 1 && (
        <div style={{ borderTop: `1px solid ${C.border}`, background: C.bg }}>
          <GraphViewSVG
            data={graph.data}
            onSelect={id => router.push(`/notes/${id}`)}
            activeId={noteId}
          />
        </div>
      )}
    </div>
  );
}
