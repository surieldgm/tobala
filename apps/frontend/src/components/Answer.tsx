"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { F, C } from "@/lib/design";

interface Props {
  answer: string;
  citedIds: number[];
}

/** Regex that captures the ``[N:<id>]`` citation token so we can splice chips in. */
const CITE_RE = /\[N:(\d+)\]/g;

/**
 * Renders the LLM's grounded answer with any ``[N:<id>]`` token replaced
 * by a clickable chip that navigates to the note detail page.
 *
 * Unknown ids (not present in ``citedIds``) still render, but in a muted
 * tone — useful to debug prompt drift without throwing on mismatch.
 */
export function Answer({ answer, citedIds }: Props) {
  const known = useMemo(() => new Set(citedIds), [citedIds]);
  const router = useRouter();

  if (!answer.trim()) {
    return (
      <p style={{ fontFamily: F.serif, fontSize: 14, color: C.text3, fontStyle: "italic" }}>
        Your notes don&rsquo;t cover this question yet.
      </p>
    );
  }

  // Split the answer into alternating (text, match) pieces so we keep the
  // original whitespace and newlines intact.
  const pieces: { kind: "text" | "cite"; value: string; id?: number }[] = [];
  let lastIdx = 0;
  for (const m of answer.matchAll(CITE_RE)) {
    const start = m.index ?? 0;
    if (start > lastIdx) {
      pieces.push({ kind: "text", value: answer.slice(lastIdx, start) });
    }
    pieces.push({ kind: "cite", value: m[0], id: Number(m[1]) });
    lastIdx = start + m[0].length;
  }
  if (lastIdx < answer.length) {
    pieces.push({ kind: "text", value: answer.slice(lastIdx) });
  }

  return (
    <div
      style={{
        fontFamily: F.serif, fontSize: 15, lineHeight: 1.65,
        color: C.text, whiteSpace: "pre-wrap",
      }}
    >
      {pieces.map((p, i) => {
        if (p.kind === "text") return <span key={i}>{p.value}</span>;
        const isKnown = p.id != null && known.has(p.id);
        return (
          <button
            key={i}
            type="button"
            onClick={() => p.id != null && router.push(`/notes/${p.id}`)}
            title={isKnown ? `Open note #${p.id}` : `Note #${p.id} (unrecognized)`}
            style={{
              display: "inline-flex", alignItems: "center",
              padding: "0 6px", margin: "0 2px",
              background: isKnown ? "#F2ECF7" : C.muted,
              color: isKnown ? "#6B4AA3" : C.text3,
              border: `1px solid ${isKnown ? "#B9A0D4" : C.border}`,
              borderRadius: 10,
              fontFamily: F.mono, fontSize: 10.5,
              cursor: "pointer",
              verticalAlign: "baseline",
            }}
          >
            N:{p.id}
          </button>
        );
      })}
    </div>
  );
}
