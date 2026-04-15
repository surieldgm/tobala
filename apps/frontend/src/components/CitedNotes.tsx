"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useNotes } from "@/hooks/useNotes";
import { getContextColors, F, C, S } from "@/lib/design";
import type { Note } from "@/lib/types";

interface Props {
  ids: number[];
}

/**
 * Cited-notes rail shown under the Answer.
 *
 * We read the user's full notes list (already cached by every other view)
 * and filter client-side — one fewer endpoint than a ``?ids=`` query.
 */
export function CitedNotes({ ids }: Props) {
  const notes = useNotes();
  const byId = useMemo(() => {
    const m = new Map<number, Note>();
    for (const n of notes.data ?? []) m.set(n.id, n);
    return m;
  }, [notes.data]);

  if (!ids.length) return null;

  return (
    <div>
      <h3 style={S.panelH}>Cited Notes</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {ids.map((id) => {
          const n = byId.get(id);
          if (!n) {
            return (
              <div
                key={id}
                style={{
                  ...S.edgeCard,
                  fontFamily: F.mono, color: C.text3, opacity: 0.6,
                }}
              >
                N:{id} <span style={{ fontStyle: "italic" }}>(not in cache)</span>
              </div>
            );
          }
          const col = getContextColors(n.context);
          return (
            <Link
              key={id}
              href={`/notes/${id}`}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 10px",
                background: col.bg,
                border: `1px solid ${col.border}`,
                borderRadius: 7,
                textDecoration: "none",
                color: C.text,
              }}
            >
              <span
                style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: col.dot, flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: F.serif, fontSize: 13, fontWeight: 500,
                  flex: 1, overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {n.title || <em style={{ color: C.text3 }}>(untitled)</em>}
              </span>
              <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                {n.tags.slice(0, 2).map((t) => (
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
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
