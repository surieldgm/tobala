"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateNote } from "@/hooks/useNotes";
import { api } from "@/lib/api";
import { toast } from "@/components/Toasts";
import { F, C, S } from "@/lib/design";
import type { InspiredNote, Note } from "@/lib/types";

interface Props {
  items: InspiredNote[];
}

const Sparkle = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
    <path
      d="M5.5 1v2.2M5.5 7.8V10M1 5.5h2.2M7.8 5.5H10M2.4 2.4l1.6 1.6M7 7l1.6 1.6M8.6 2.4L7 4M4 7L2.4 8.6"
      stroke="currentColor"
      strokeWidth=".9"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * "Write this" card — one per inspired-note suggestion from the retrieval LLM.
 *
 * We defer tag application until after the Note is created so we can scope
 * them to the owner's Tag namespace (backend handles the get-or-create).
 * Tag mutations fire in parallel; failures are logged via toast but don't
 * block navigation to the new note.
 */
function InspiredCard({ item }: { item: InspiredNote }) {
  const router = useRouter();
  const create = useCreateNote();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const write = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const note = await create.mutateAsync({
        title: item.title,
        body: item.why,
        context_id: null,
      });
      // Pre-apply suggested tags as user-source by hitting the backend
      // directly — we can't use the parameterized ``useAddNoteTag`` hook
      // here because React closure semantics would freeze noteId=0 on the
      // render where we kicked off the mutation. After all tag calls
      // resolve we invalidate the relevant query keys once.
      await Promise.all(
        item.suggested_tags.map((name) =>
          api
            .post<Note>(
              `/notes/${note.id}/tags/${encodeURIComponent(name)}/`
            )
            .catch(() => {
              // Non-fatal — user can add the tag manually from the editor.
              toast.error(`Couldn't pre-apply tag "${name}"`);
            })
        )
      );
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      router.push(`/notes/${note.id}`);
    } catch {
      toast.error("Couldn't create note");
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        padding: 12,
        background: "#F2ECF7",
        border: "1px dashed #B9A0D4",
        borderRadius: 8,
        display: "flex", flexDirection: "column", gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#6B4AA3" }}>
        <Sparkle />
        <span
          style={{
            fontFamily: F.mono, fontSize: 9, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: 1.2, opacity: 0.75,
          }}
        >
          Write this
        </span>
      </div>
      <p
        style={{
          fontFamily: F.serif, fontSize: 14, fontWeight: 600,
          color: C.text, margin: 0,
        }}
      >
        {item.title}
      </p>
      <p
        style={{
          fontFamily: F.serif, fontSize: 12.5, lineHeight: 1.5,
          color: C.text2, margin: 0, fontStyle: "italic",
        }}
      >
        {item.why}
      </p>

      {item.suggested_tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {item.suggested_tags.map((t) => (
            <span key={t} style={{ ...S.tagChip, cursor: "default" }}>
              {t}
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={write}
        disabled={busy}
        style={{
          alignSelf: "flex-start",
          padding: "6px 12px",
          background: busy ? C.muted : "#6B4AA3",
          color: busy ? C.text3 : "#FFFDF5",
          border: "none",
          borderRadius: 6,
          fontFamily: F.mono, fontSize: 10.5, fontWeight: 600,
          textTransform: "uppercase", letterSpacing: 0.6,
          cursor: busy ? "default" : "pointer",
          marginTop: 4,
        }}
      >
        {busy ? "Creating…" : "Write this"}
      </button>
    </div>
  );
}

export function InspiredNotes({ items }: Props) {
  if (!items.length) return null;
  return (
    <div>
      <h3 style={S.panelH}>Inspired Notes</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((it, i) => (
          <InspiredCard key={`${it.title}-${i}`} item={it} />
        ))}
      </div>
    </div>
  );
}
