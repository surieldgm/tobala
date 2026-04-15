"use client";

import { useState } from "react";
import Image from "next/image";
import { useAsk } from "@/hooks/useAsk";
import { Answer } from "@/components/Answer";
import { CitedNotes } from "@/components/CitedNotes";
import { InspiredNotes } from "@/components/InspiredNotes";
import { F, C, S } from "@/lib/design";

const SparkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path
      d="M7 1v3M7 10v3M1 7h3M10 7h3M2.8 2.8l2 2M9.2 9.2l2 2M11.2 2.8l-2 2M4.8 9.2l-2 2"
      stroke="currentColor"
      strokeWidth=".9"
      strokeLinecap="round"
    />
  </svg>
);

export default function AskPage() {
  const [draft, setDraft] = useState("");
  const ask = useAsk();
  const payload = ask.data;

  const submit = () => {
    const q = draft.trim();
    if (!q || ask.isPending) return;
    ask.mutate(q);
  };

  return (
    <div
      style={{
        flex: 1, display: "flex", flexDirection: "column",
        padding: "32px 48px", overflow: "auto", maxWidth: 880, width: "100%",
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h1
          style={{
            fontFamily: F.serif, fontSize: 26, fontWeight: 600,
            color: C.text, letterSpacing: -0.5, margin: 0,
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          <span style={{ color: "#6B4AA3" }}>✨</span>
          Ask Tobalá
        </h1>
        <p
          style={{
            fontFamily: F.serif, fontSize: 13, color: C.text3,
            fontStyle: "italic", marginTop: 4, marginBottom: 0,
          }}
        >
          Grounded in your own notes — Tobalá answers from the knowledge graph only.
        </p>
      </div>

      {/* Question input */}
      <div
        style={{
          display: "flex", gap: 8, alignItems: "flex-start",
          padding: 12, background: C.surface,
          border: `1px solid ${C.border}`, borderRadius: 10,
          marginBottom: 20,
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="What have I been thinking about lately?"
          rows={3}
          style={{
            flex: 1,
            border: "none", outline: "none",
            background: "transparent",
            fontFamily: F.serif, fontSize: 15, color: C.text,
            lineHeight: 1.5, resize: "vertical",
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={ask.isPending || !draft.trim()}
          style={{
            ...S.smallBtn,
            padding: "8px 14px",
            fontFamily: F.mono, fontSize: 11, fontWeight: 600,
            letterSpacing: 0.6, textTransform: "uppercase",
            background: ask.isPending ? C.muted : "#6B4AA3",
            color: ask.isPending ? C.text3 : "#FFFDF5",
            border: "none",
            cursor: ask.isPending || !draft.trim() ? "default" : "pointer",
            opacity: ask.isPending || !draft.trim() ? 0.6 : 1,
          }}
        >
          <SparkIcon />
          {ask.isPending ? "Thinking…" : "Ask"}
        </button>
      </div>

      {ask.isError && (
        <div
          style={{
            padding: 12, border: "1px solid #D99570",
            background: "#FAE2D3", borderRadius: 7,
            fontFamily: F.serif, fontSize: 13, color: "#8A3E22",
            marginBottom: 14,
          }}
        >
          Couldn&rsquo;t reach the retrieval service. Double-check the worker logs.
        </div>
      )}

      {ask.isPending && (
        <p
          style={{
            fontFamily: F.mono, fontSize: 11, color: C.text3,
            fontStyle: "italic", letterSpacing: 0.6,
          }}
        >
          walking the graph…
        </p>
      )}

      {/* Idle state — visible before the first question is asked */}
      {!payload && !ask.isPending && !ask.isError && (
        <div
          style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 10, paddingTop: 20,
          }}
        >
          <Image
            src="/tascalate.png"
            width={130}
            height={130}
            alt="A warm cup of tascalate"
            style={{ opacity: 0.88, userSelect: "none" }}
            priority
          />
          <p style={{ fontFamily: F.serif, fontSize: 14, color: C.text3, fontStyle: "italic", textAlign: "center" }}>
            Ask something — I&apos;ll look through your notes.
          </p>
        </div>
      )}

      {/* Results */}
      {payload && (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <Answer answer={payload.answer} citedIds={payload.cited_note_ids} />

          {payload.cited_note_ids.length > 0 && (
            <CitedNotes ids={payload.cited_note_ids} />
          )}

          {payload.missing_knowledge.length > 0 && (
            <div>
              <h3 style={S.panelH}>Missing Knowledge</h3>
              <ul
                style={{
                  listStyle: "disc", paddingLeft: 20, margin: 0,
                  display: "flex", flexDirection: "column", gap: 3,
                }}
              >
                {payload.missing_knowledge.map((m, i) => (
                  <li
                    key={i}
                    style={{
                      fontFamily: F.serif, fontSize: 13, color: C.text2,
                      lineHeight: 1.5,
                    }}
                  >
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <InspiredNotes items={payload.inspired_notes} />
        </div>
      )}
    </div>
  );
}
