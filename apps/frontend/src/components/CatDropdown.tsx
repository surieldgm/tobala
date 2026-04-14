"use client";

import { useState } from "react";
import { CAT_META, F, C } from "@/lib/design";
import type { Category } from "@/lib/types";

const ChevIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M2.5 3.5L5 6.5l2.5-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

interface Props {
  value: Category;
  onChange: (cat: Category) => void;
}

export function CatDropdown({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const meta = CAT_META[value] ?? CAT_META.random;
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "5px 12px", borderRadius: 16,
          border: `1.5px solid ${meta.border}`, background: meta.bg,
          fontFamily: F.serif, fontSize: 12.5, color: C.text2,
          cursor: "pointer", fontWeight: 500,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.dot }} />
        {meta.label}
        <ChevIcon />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "110%", left: 0,
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: 3, zIndex: 10,
          boxShadow: "0 4px 12px rgba(0,0,0,.07)", minWidth: 150,
        }}>
          {(Object.entries(CAT_META) as [Category, typeof CAT_META[Category]][])
            .filter(([k]) => k !== value)
            .map(([k, v]) => (
              <div
                key={k}
                onClick={() => { onChange(k); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 10px", borderRadius: 4,
                  cursor: "pointer", fontSize: 12.5, color: C.text2,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: v.dot }} />
                {v.label}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
