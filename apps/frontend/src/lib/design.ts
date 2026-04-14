/** Design tokens for the Tobalá warm agave palette. */

export const CAT_META = {
  random:   { label: "Random Thoughts", bg: "#F5E6DB", border: "#D4A88C", dot: "#B8806A" },
  school:   { label: "School",          bg: "#FDF6E3", border: "#E8C07D", dot: "#D4A54A" },
  personal: { label: "Personal",        bg: "#E2EDDF", border: "#A8C5A0", dot: "#7BA672" },
} as const;

export const EDGE_META = {
  REFERENCES:  { label: "References",  color: "#8B7355", icon: "→" },
  SUPPORTS:    { label: "Supports",    color: "#6B9A5B", icon: "✓" },
  CONTRADICTS: { label: "Contradicts", color: "#C45B4A", icon: "✗" },
  EXTENDS:     { label: "Extends",     color: "#4A7EC4", icon: "⊕" },
  INSPIRES:    { label: "Inspires",    color: "#9B6BC4", icon: "✦" },
} as const;

export const F = {
  serif: "'Newsreader', Georgia, serif",
  mono:  "'DM Mono', monospace",
} as const;

export const C = {
  bg:      "#FBF6ED",
  surface: "#FFFDF5",
  muted:   "#F0E6D4",
  border:  "#E8DFCC",
  text:    "#3D3527",
  text2:   "#5C4A32",
  text3:   "#8B7355",
  accent:  "#C4A265",
} as const;

/** Shared inline-style primitives (mirrors mock's S object). */
export const S = {
  smallBtn: {
    display: "flex", alignItems: "center", gap: 4,
    padding: "4px 10px",
    background: "rgba(139,115,85,.08)", border: "1px solid #E8DFCC",
    borderRadius: 6,
    fontFamily: F.mono, fontSize: 10.5, color: C.text2, cursor: "pointer",
  },
  sel: {
    padding: "5px 8px", border: "1px solid #D4C5A9", borderRadius: 5,
    background: C.surface, fontFamily: F.serif, fontSize: 12, color: C.text, outline: "none", flex: 1,
  },
  iconBtn: {
    background: "none", border: "none", cursor: "pointer",
    color: C.text3, padding: 3, display: "flex", alignItems: "center",
  },
  panelH: {
    fontFamily: F.mono, fontSize: 9, fontWeight: 600,
    textTransform: "uppercase" as const, letterSpacing: 1.2,
    color: C.text3, marginBottom: 6,
    display: "flex", alignItems: "center", gap: 4,
  },
  panelEmpty: { fontSize: 11.5, color: C.text3, opacity: .45, fontStyle: "italic" as const },
  edgeCard: {
    display: "flex", alignItems: "center", gap: 6,
    padding: "5px 8px", background: "#F5EDE0",
    borderRadius: 5, marginBottom: 3, fontSize: 12,
  },
} as const;
