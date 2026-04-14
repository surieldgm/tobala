export type Category = "random" | "school" | "personal";

export const CATEGORY_LABELS: Record<Category, string> = {
  random: "Random Thoughts",
  school: "School",
  personal: "Personal",
};

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

export interface Note {
  id: number;
  owner: number;
  title: string;
  body: string;
  category: Category;
  created: string;
  edited: string;
}

export interface NoteLink {
  id: number;
  source: number;
  target: number;
  label: EdgeLabel;
  context: string;
  created: string;
}

export interface Suggestion {
  id: number;
  title: string;
  category: Category;
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
