"use client";

import { useState } from "react";
import { CONTEXT_PALETTE, ContextColor, getContextColors, F, C } from "@/lib/design";
import { useContexts, useCreateContext } from "@/hooks/useContexts";
import type { Context } from "@/lib/types";

const ChevIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M2.5 3.5L5 6.5l2.5-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

interface Props {
  value: Context | null;
  onChange: (ctx: Context | null) => void;
}

export function ContextDropdown({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<ContextColor>("ochre");

  const contexts = useContexts();
  const createCtx = useCreateContext();

  const colors = getContextColors(value);
  const label = value?.name ?? "Unsorted";

  const submitCreate = () => {
    if (!newName.trim()) return;
    createCtx.mutate(
      { name: newName.trim(), color: newColor },
      {
        onSuccess: (ctx) => {
          onChange(ctx);
          setCreating(false);
          setNewName("");
          setOpen(false);
        },
      }
    );
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "5px 12px", borderRadius: 16,
          border: `1.5px solid ${colors.border}`, background: colors.bg,
          fontFamily: F.serif, fontSize: 12.5, color: C.text2,
          cursor: "pointer", fontWeight: 500,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: colors.dot }} />
        {label}
        <ChevIcon />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "110%", left: 0,
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: 4, zIndex: 10,
          boxShadow: "0 4px 14px rgba(0,0,0,.08)", minWidth: 200,
        }}>
          <div
            onClick={() => { onChange(null); setOpen(false); }}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 10px", borderRadius: 4,
              cursor: "pointer", fontSize: 12.5, color: C.text3,
              fontStyle: "italic",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#B8B0A3" }} />
            Unsorted
          </div>

          {(contexts.data ?? [])
            .filter((c) => c.id !== value?.id)
            .map((c) => {
              const col = getContextColors(c);
              return (
                <div
                  key={c.id}
                  onClick={() => { onChange(c); setOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 10px", borderRadius: 4,
                    cursor: "pointer", fontSize: 12.5, color: C.text2,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: col.dot }} />
                  {c.name}
                </div>
              );
            })}

          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 4 }}>
            {!creating ? (
              <div
                onClick={() => setCreating(true)}
                style={{
                  padding: "6px 10px", borderRadius: 4,
                  cursor: "pointer", fontSize: 12, color: C.text3,
                  fontFamily: F.mono,
                }}
              >
                + new context
              </div>
            ) : (
              <div style={{ padding: "6px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                <input
                  autoFocus
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitCreate()}
                  style={{
                    padding: "5px 8px", border: `1px solid ${C.border}`,
                    borderRadius: 4, fontSize: 12, fontFamily: F.serif,
                    background: C.bg, color: C.text, outline: "none",
                  }}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(Object.entries(CONTEXT_PALETTE) as [ContextColor, typeof CONTEXT_PALETTE[ContextColor]][]).map(([k, v]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setNewColor(k)}
                      title={v.label}
                      style={{
                        width: 20, height: 20, borderRadius: "50%",
                        background: v.dot,
                        border: newColor === k ? `2px solid ${C.text2}` : `1px solid ${C.border}`,
                        cursor: "pointer", padding: 0,
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => { setCreating(false); setNewName(""); }}
                    style={{
                      fontSize: 11, padding: "3px 8px", background: "transparent",
                      border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer",
                      color: C.text3, fontFamily: F.mono,
                    }}
                  >
                    cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitCreate}
                    disabled={!newName.trim() || createCtx.isPending}
                    style={{
                      fontSize: 11, padding: "3px 10px", background: C.text2,
                      border: "none", borderRadius: 4, cursor: "pointer",
                      color: C.bg, fontFamily: F.mono,
                      opacity: createCtx.isPending ? 0.6 : 1,
                    }}
                  >
                    create
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
