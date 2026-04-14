"use client";

import { useState } from "react";
import { EDGE_META, F, C, S } from "@/lib/design";
import { useCreateLink } from "@/hooks/useEdges";
import type { EdgeLabel, Note } from "@/lib/types";

const LinkIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path d="M4.5 6.5a2 2 0 003 0l1.2-1.2A2 2 0 005.9 2.2L5 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    <path d="M6.5 4.5a2 2 0 00-3 0L2.3 5.8A2 2 0 005.1 8.8L6 8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
  </svg>
);

interface Props {
  sourceId: number;
  notes: Note[];
  existingTargetIds: Set<number>;
}

export function EdgeCreator({ sourceId, notes, existingTargetIds }: Props) {
  const [open, setOpen] = useState(false);
  const [tgt, setTgt] = useState("");
  const [label, setLabel] = useState<EdgeLabel>("REFERENCES");
  const [ctx, setCtx] = useState("");
  const createLink = useCreateLink();

  const available = notes.filter(n => n.id !== sourceId && !existingTargetIds.has(n.id));

  const submit = () => {
    if (!tgt) return;
    createLink.mutate(
      { source: sourceId, target: Number(tgt), label, context: ctx },
      { onSuccess: () => { setTgt(""); setCtx(""); setOpen(false); } }
    );
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={S.smallBtn}>
        <LinkIcon /> Create edge
      </button>
    );
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, marginTop: 4 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <select value={label} onChange={e => setLabel(e.target.value as EdgeLabel)} style={S.sel}>
          {(Object.entries(EDGE_META) as [EdgeLabel, typeof EDGE_META[EdgeLabel]][]).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>
        <select value={tgt} onChange={e => setTgt(e.target.value)} style={{ ...S.sel, flex: 2 }}>
          <option value="">Target…</option>
          {available.map(n => (
            <option key={n.id} value={n.id}>{n.title || "Untitled"}</option>
          ))}
        </select>
      </div>
      <input
        placeholder="Context (optional)"
        value={ctx}
        onChange={e => setCtx(e.target.value)}
        style={{
          ...S.sel, width: "100%", marginBottom: 6, flex: "none",
          boxSizing: "border-box" as const,
          fontFamily: F.serif, fontSize: 12,
        }}
      />
      {createLink.isError && (
        <p style={{ color: "#C45B4A", fontSize: 11, marginBottom: 6 }}>
          {(createLink.error as Error)?.message || "Failed"}
        </p>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={submit}
          disabled={!tgt || createLink.isPending}
          style={{ ...S.smallBtn, background: C.text2, color: C.bg, border: "none" }}
        >
          {createLink.isPending ? "Adding…" : "Create"}
        </button>
        <button type="button" onClick={() => setOpen(false)} style={S.smallBtn}>Cancel</button>
      </div>
    </div>
  );
}
