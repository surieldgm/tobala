"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDeleteNote, useUpdateNote } from "@/hooks/useNotes";
import { getContextColors, EDGE_META, F, C, S } from "@/lib/design";
import { ContextDropdown } from "@/components/ContextDropdown";
import { TagChips } from "@/components/TagChips";
import { EdgeCreator } from "@/components/EdgeCreator";
import {
  useAcceptLink,
  useCreateLink,
  useNoteLinks,
  useRejectLink,
  useSuggestions,
} from "@/hooks/useEdges";
import type { Context, Note, ProposalSummary } from "@/lib/types";

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

/* ── Auto-save delay ──
 * 3 s is imperceptible during writing but cuts PATCH calls ~73% vs 800 ms.
 * Flush-on-unmount (line ~140) guarantees the last keystroke is always
 * persisted when the user navigates away. */
const DEBOUNCE_MS = 3000;

interface Props {
  note: Note;
  allNotes: Note[];
}

/** Map backend embedding status to a human badge label + color. */
function embeddingBadge(note: Note) {
  switch (note.embedding_status) {
    case "pending":
      return { label: "Queued…", color: C.text3 };
    case "processing":
      return { label: "Embedding…", color: "#9B6BC4" };
    case "ready":
      return { label: "Embedded ✓", color: "#6B9A5B" };
    case "failed":
      return { label: "Embedding failed", color: "#C45B4A" };
    default:
      return null;
  }
}

export function NoteEditor({ note, allNotes }: Props) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement | null>(null);
  const update = useUpdateNote(note.id);
  const del = useDeleteNote();
  const createLink = useCreateLink();
  const acceptLink = useAcceptLink();
  const rejectLink = useRejectLink();
  const links = useNoteLinks(note.id);
  const suggestions = useSuggestions(note.id, 4);

  /* ── Local state ── */
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [context, setContext] = useState<Context | null>(note.context);
  const [localEdited, setLocalEdited] = useState(note.edited); // updates on each keystroke
  const [saveState, setSaveState] = useState<SaveState>("saved");

  // Keep refs to always-fresh values so debounced flush sees latest content
  const latestTitle = useRef(title);
  const latestBody = useRef(body);
  const latestContext = useRef(context);
  latestTitle.current = title;
  latestBody.current = body;
  latestContext.current = context;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Sync when navigating to a different note */
  useEffect(() => {
    setTitle(note.title);
    setBody(note.body);
    setContext(note.context);
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
      {
        title: latestTitle.current,
        body: latestBody.current,
        context_id: latestContext.current?.id ?? null,
      },
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

  const colors = getContextColors(context);
  // The counterparty note id for any non-rejected edge on this note — used by
  // EdgeCreator to filter notes you can still link to.
  const linkedIds = new Set<number>();
  for (const l of links.data ?? []) {
    linkedIds.add(l.source === note.id ? l.target : l.source);
  }
  const confirmed = (links.data ?? []).filter(l => l.status === "confirmed");
  const proposed = (links.data ?? []).filter(l => l.status === "proposed");

  /* Context changes save immediately (no debounce needed for a select) */
  const handleContextChange = (c: Context | null) => {
    setContext(c);
    latestContext.current = c;
    setLocalEdited(new Date().toISOString());
    update.mutate(
      {
        title: latestTitle.current,
        body: latestBody.current,
        context_id: c?.id ?? null,
      },
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

  const embedBadge = embeddingBadge(note);

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

      {/* ── Editor pane ── */}
      <div style={{
        flex: 1, margin: 14, marginRight: 0,
        padding: 20, borderRadius: 10,
        border: `1.5px solid ${colors.border}`,
        background: colors.bg,
        display: "flex", flexDirection: "column", overflow: "auto",
      }}>
        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ContextDropdown value={context} onChange={handleContextChange} />
            <span style={{ fontFamily: F.mono, fontSize: 11, color: C.text3, opacity: .45 }}>
              #{note.id}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {embedBadge && (
              <span style={{ fontFamily: F.mono, fontSize: 9.5, color: embedBadge.color, opacity: .85 }}>
                {embedBadge.label}
              </span>
            )}
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

        {/* Tag chips — LLM-suggested + user-added, inline editable */}
        <TagChips note={note} />

        {/* Footer */}
        <div style={{
          display: "flex", gap: 6, marginTop: 8, paddingTop: 8,
          borderTop: "1px solid rgba(139,115,85,.12)",
        }}>
          <EdgeCreator sourceId={note.id} notes={allNotes} existingTargetIds={linkedIds} />
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
        width: 260, minWidth: 260,
        padding: "14px 12px", overflow: "auto",
        borderLeft: `1px solid ${C.border}`,
      }}>
        {/* Confirmed links */}
        <h4 style={S.panelH}>
          <LinkIcon /> Linked ({confirmed.length})
        </h4>
        {links.isLoading && <p style={S.panelEmpty}>Loading…</p>}
        {!links.isLoading && !confirmed.length && (
          <p style={S.panelEmpty}>No linked notes yet</p>
        )}
        {confirmed.map(l => {
          const otherId = l.source === note.id ? l.target : l.source;
          const otherTitle = l.source === note.id ? l.target_title : l.source_title;
          const meta = EDGE_META[l.label];
          const outgoing = l.source === note.id;
          return (
            <div
              key={l.id}
              onClick={() => router.push(`/notes/${otherId}`)}
              style={{ ...S.edgeCard, cursor: "pointer", flexDirection: "column", alignItems: "stretch", gap: 3 }}
            >
              <span style={{
                fontSize: 12.5, fontWeight: 600, color: C.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {otherTitle || "Untitled"}
              </span>
              <span style={{ fontFamily: F.mono, fontSize: 9, color: meta.color }}>
                {outgoing ? "→" : "←"} {meta.label}
              </span>
            </div>
          );
        })}

        {/* LLM-proposed links — inline accept/reject triage. */}
        {proposed.length > 0 && (
          <>
            <h4 style={{ ...S.panelH, marginTop: 14, color: "#9B6BC4" }}>
              <SparkIcon /> Proposed ({proposed.length})
            </h4>
            <p style={{ fontSize: 9.5, color: C.text3, fontStyle: "italic", marginBottom: 5 }}>
              Tobalá thinks these fit — keep or reject.
            </p>
            {proposed.map(l => (
              <ProposedEdgeCard
                key={l.id}
                link={l}
                anchorId={note.id}
                onOpen={otherId => router.push(`/notes/${otherId}`)}
                onAccept={() => acceptLink.mutate(l.id)}
                onReject={() => rejectLink.mutate(l.id)}
                pending={
                  (acceptLink.isPending && acceptLink.variables === l.id) ||
                  (rejectLink.isPending && rejectLink.variables === l.id)
                }
              />
            ))}
          </>
        )}

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

/* ── Proposed edge card ── Shown in the right panel for each LLM proposal
 * involving this note. Accept flips the edge to confirmed (no graph change
 * needed — the AGE edge was written at create time). Reject removes the
 * AGE edge and parks the SQL row as ``status="rejected"``.
 */
function ProposedEdgeCard({
  link,
  anchorId,
  onOpen,
  onAccept,
  onReject,
  pending,
}: {
  link: ProposalSummary;
  anchorId: number;
  onOpen: (otherId: number) => void;
  onAccept: () => void;
  onReject: () => void;
  pending: boolean;
}) {
  const outgoing = link.source === anchorId;
  const otherId = outgoing ? link.target : link.source;
  const otherTitle = outgoing ? link.target_title : link.source_title;
  const meta = EDGE_META[link.label];
  const conf = link.confidence == null ? null : Math.round(link.confidence * 100);
  return (
    <div style={{
      ...S.edgeCard, background: "#F5EEF9",
      flexDirection: "column", alignItems: "stretch", gap: 5,
    }}>
      <span
        onClick={() => onOpen(otherId)}
        style={{
          fontSize: 12.5, fontWeight: 600, color: C.text, cursor: "pointer",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {otherTitle || "Untitled"}
      </span>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontFamily: F.mono, fontSize: 9, color: meta.color }}>
          {outgoing ? "→" : "←"} {meta.label}
        </span>
        {conf != null && (
          <span style={{
            fontFamily: F.mono, fontSize: 8.5,
            background: "#E0D2F0", color: "#6B4A9B",
            padding: "1px 5px", borderRadius: 3,
          }}>
            {conf}%
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onAccept}
          disabled={pending}
          title="Keep this link"
          style={{
            fontSize: 10, padding: "2px 7px",
            background: "#6B9A5B", color: "#fff",
            border: "none", borderRadius: 4, cursor: pending ? "default" : "pointer",
            opacity: pending ? .6 : 1,
          }}
        >
          ✓
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={pending}
          title="Reject this link"
          style={{
            fontSize: 10, padding: "2px 7px",
            background: "transparent", color: "#C45B4A",
            border: "1px solid #C45B4A", borderRadius: 4, cursor: pending ? "default" : "pointer",
            opacity: pending ? .6 : 1,
          }}
        >
          ✗
        </button>
      </div>
    </div>
  );
}
