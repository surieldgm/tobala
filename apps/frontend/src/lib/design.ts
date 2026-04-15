/** Design tokens for the Tobalá warm agave palette. */

import type { Context } from "./types";

/**
 * Tobalá's motto. The whole UX hypothesis condensed into four words:
 * the user writes, the pipeline (embedding, tagging, link proposal) takes
 * care of everything else. Shown on the auth pages, in the sidebar, and
 * echoed in the README.
 */
export const TAGLINE = "write first, organise never";

/**
 * Named palette a user picks from when creating a Context. Stored on the
 * backend as the string key (e.g. "ochre"). Each entry carries three related
 * tones so cards, borders, and dots all agree.
 */
export const CONTEXT_PALETTE = {
  ochre:      { bg: "#F5E6DB", border: "#D4A88C", dot: "#B8806A", label: "Ochre" },
  sunflower:  { bg: "#FDF6E3", border: "#E8C07D", dot: "#D4A54A", label: "Sunflower" },
  sage:       { bg: "#E2EDDF", border: "#A8C5A0", dot: "#7BA672", label: "Sage" },
  terracotta: { bg: "#FAE2D3", border: "#D99570", dot: "#C4684A", label: "Terracotta" },
  dusk:       { bg: "#E4E3F0", border: "#9A9BC0", dot: "#6D6EA3", label: "Dusk" },
  rose:       { bg: "#F5E0E4", border: "#D49BA5", dot: "#B36374", label: "Rose" },
  moss:       { bg: "#E6ECE0", border: "#9DB08B", dot: "#6A7D57", label: "Moss" },
  stone:      { bg: "#ECE9E2", border: "#B8B0A3", dot: "#7D7568", label: "Stone" },
} as const;

export type ContextColor = keyof typeof CONTEXT_PALETTE;

/** Broad shape for a palette entry — decouples callers from literal types. */
export type PaletteEntry = {
  readonly bg: string;
  readonly border: string;
  readonly dot: string;
  readonly label: string;
};

const FALLBACK_COLORS: PaletteEntry = CONTEXT_PALETTE.stone;

/**
 * Return the tonal triple (bg/border/dot) for a Context (or ``null`` →
 * stone). Safely handles unknown legacy color keys by falling back.
 */
export function getContextColors(context: Context | null | undefined): PaletteEntry {
  if (!context) return FALLBACK_COLORS;
  const entry = (CONTEXT_PALETTE as Record<string, PaletteEntry>)[context.color];
  return entry ?? FALLBACK_COLORS;
}

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
  tagChip: {
    display: "inline-flex", alignItems: "center", gap: 3,
    padding: "2px 8px", borderRadius: 10,
    fontFamily: F.mono, fontSize: 10,
    background: "rgba(139,115,85,.08)", color: "#5C4A32",
    border: "1px solid rgba(139,115,85,.15)",
    cursor: "pointer",
  },
  tagChipSystem: {
    // System-source chips get a purple accent so the user can tell at a glance
    // which tags the LLM suggested vs. which they added themselves.
    background: "#F2ECF7", color: "#6B4AA3",
    border: "1px dashed #B9A0D4",
  },
} as const;
