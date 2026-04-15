export type EdgeLabel =
  | "REFERENCES"
  | "SUPPORTS"
  | "CONTRADICTS"
  | "EXTENDS"
  | "INSPIRES";

export const EDGE_LABELS: { value: EdgeLabel; display: string }[] = [
  { value: "REFERENCES", display: "References" },
  { value: "SUPPORTS", display: "Supports" },
  { value: "CONTRADICTS", display: "Contradicts" },
  { value: "EXTENDS", display: "Extends" },
  { value: "INSPIRES", display: "Inspires" },
];

export type EmbeddingStatus = "pending" | "processing" | "ready" | "failed";

export interface Context {
  id: number;
  name: string;
  /** Palette key into ``CONTEXT_PALETTE`` in design.ts (e.g. "ochre"). */
  color: string;
  description: string;
  created: string;
  note_count?: number;
}

export interface Tag {
  id: number;
  name: string;
  created: string;
  note_count?: number;
}

/** Tag-on-note representation — includes source + confidence. */
export interface NoteTag {
  id: number;
  name: string;
  source: "user" | "system";
  confidence: number | null;
}

export interface Note {
  id: number;
  owner: number;
  title: string;
  body: string;
  /** Nested on reads. Write via ``context_id`` (nullable). */
  context: Context | null;
  tags: NoteTag[];
  created: string;
  edited: string;
  embedding_status: EmbeddingStatus;
  embedding_error: string;
}

export type LinkStatus = "proposed" | "confirmed" | "rejected";
export type LinkCreatedBy = "user" | "system";

export interface NoteLink {
  id: number;
  source: number;
  target: number;
  label: EdgeLabel;
  context: string;
  status: LinkStatus;
  created_by: LinkCreatedBy;
  /** LLM confidence at creation time for ``created_by="system"`` rows. */
  confidence: number | null;
  created: string;
}

/**
 * Flat row served by ``/api/links/proposals/`` — embeds note titles so the
 * ProposalsInbox can render without a second query per edge.
 */
export interface ProposalSummary {
  id: number;
  source: number;
  target: number;
  source_title: string;
  target_title: string;
  label: EdgeLabel;
  status: LinkStatus;
  created_by: LinkCreatedBy;
  confidence: number | null;
  created: string;
}

export interface Suggestion {
  id: number;
  title: string;
  context: Context | null;
  score: number;
}

export interface GraphData {
  nodes: Note[];
  edges: NoteLink[];
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
}

export interface InspiredNote {
  title: string;
  why: string;
  suggested_tags: string[];
}

/** Response from ``/api/retrieval/ask/``. */
export interface AnswerPayload {
  answer: string;
  cited_note_ids: number[];
  missing_knowledge: string[];
  inspired_notes: InspiredNote[];
}
