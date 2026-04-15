"use client";

import { useState } from "react";
import { F, C, S } from "@/lib/design";
import { useAddNoteTag, useRemoveNoteTag, useTags } from "@/hooks/useTags";
import type { Note, NoteTag } from "@/lib/types";

const SparkIcon = () => (
  <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
    <path d="M4.5 1v2M4.5 6v2M1 4.5h2M6 4.5h2M2.3 2.3l1.2 1.2M5.5 5.5l1.2 1.2M6.7 2.3L5.5 3.5M3.5 5.5L2.3 6.7"
      stroke="currentColor" strokeWidth=".8" strokeLinecap="round"/>
  </svg>
);

interface Props {
  note: Note;
}

/**
 * Inline tag editor below the note body.
 *
 * - System-source chips render with a dashed purple border; clicking
 *   "endorses" them (converts source to user on the backend).
 * - Users can add tags via the typeahead against their existing tag
 *   namespace.
 * - Clicking × on any chip removes that tag from this note.
 */
export function TagChips({ note }: Props) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const add = useAddNoteTag(note.id);
  const remove = useRemoveNoteTag(note.id);

  const suggestions = useTags(
    input.trim() ? { q: input.trim() } : undefined
  );

  const existingNames = new Set(note.tags.map((t) => t.name));
  const filteredSuggestions = (suggestions.data ?? [])
    .filter((t) => !existingNames.has(t.name))
    .slice(0, 6);

  const submit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    add.mutate(trimmed);
    setInput("");
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", marginTop: 6 }}>
      {note.tags.map((t: NoteTag) => {
        const isSystem = t.source === "system";
        const chipStyle = isSystem
          ? { ...S.tagChip, ...S.tagChipSystem }
          : S.tagChip;
        return (
          <span
            key={t.id}
            style={chipStyle}
            title={
              isSystem
                ? `suggested by LLM · ${(t.confidence ?? 0).toFixed(2)} — click to endorse`
                : "click × to remove"
            }
          >
            {isSystem && (
              <span
                onClick={(e) => { e.stopPropagation(); add.mutate(t.name); }}
                style={{ cursor: "pointer", display: "inline-flex" }}
              >
                <SparkIcon />
              </span>
            )}
            {t.name}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove.mutate(t.name); }}
              style={{
                border: "none", background: "transparent",
                color: "inherit", cursor: "pointer",
                padding: 0, marginLeft: 2, fontSize: 11, lineHeight: 1,
              }}
              aria-label={`remove tag ${t.name}`}
            >
              ×
            </button>
          </span>
        );
      })}

      <div style={{ position: "relative" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // small delay so click on suggestion registers before we hide it
            setTimeout(() => setFocused(false), 120);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit(input);
            }
          }}
          placeholder={note.tags.length ? "+ tag" : "+ add tag"}
          style={{
            padding: "2px 8px", border: `1px dashed ${C.border}`, borderRadius: 10,
            fontFamily: F.mono, fontSize: 10,
            background: "transparent", color: C.text3,
            outline: "none", width: 90,
          }}
        />
        {focused && input.trim() && filteredSuggestions.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, marginTop: 4,
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: 3, zIndex: 10,
            boxShadow: "0 2px 8px rgba(0,0,0,.06)", minWidth: 140,
          }}>
            {filteredSuggestions.map((s) => (
              <div
                key={s.id}
                onMouseDown={() => submit(s.name)}
                style={{
                  padding: "4px 8px", fontFamily: F.mono, fontSize: 10,
                  color: C.text2, cursor: "pointer", borderRadius: 3,
                  display: "flex", justifyContent: "space-between",
                }}
              >
                <span>{s.name}</span>
                {typeof s.note_count === "number" && (
                  <span style={{ color: C.text3, opacity: .6 }}>{s.note_count}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
