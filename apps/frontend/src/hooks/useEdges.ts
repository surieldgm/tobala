"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EdgeLabel, Note, NoteLink, Suggestion } from "@/lib/types";

export function useNeighbors(noteId: number | null, depth: number = 1) {
  return useQuery<Note[]>({
    queryKey: ["notes", noteId, "neighbors", depth],
    enabled: noteId != null,
    queryFn: () => api.get<Note[]>(`/notes/${noteId}/neighbors/?depth=${depth}`),
  });
}

export function useSuggestions(noteId: number | null, topK: number = 4) {
  return useQuery<Suggestion[]>({
    queryKey: ["notes", noteId, "suggestions", topK],
    enabled: noteId != null,
    queryFn: () =>
      api.get<Suggestion[]>(`/notes/${noteId}/suggestions/?top_k=${topK}`),
  });
}

export function useCreateLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      source: number;
      target: number;
      label: EdgeLabel;
      context?: string;
    }) => api.post<NoteLink>("/links/", payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["notes", vars.source, "neighbors"] });
      qc.invalidateQueries({ queryKey: ["notes", vars.source, "suggestions"] });
      qc.invalidateQueries({ queryKey: ["graph"] });
    },
  });
}

export function useDeleteLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/links/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["graph"] });
    },
  });
}
