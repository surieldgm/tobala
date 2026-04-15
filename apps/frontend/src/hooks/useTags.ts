"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Note, Tag } from "@/lib/types";

export function useTags(params?: { q?: string; order?: "count" | "name" }) {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.order) qs.set("order", params.order);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery<Tag[]>({
    queryKey: ["tags", params],
    queryFn: () => api.get<Tag[]>(`/tags/${suffix}`),
  });
}

export function useRenameTag(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string }) =>
      api.patch<Tag>(`/tags/${id}/`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/tags/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

/**
 * Add a user-source tag to a note by name (upserts the Tag if new).
 * Backend guarantees the normalized kebab-case form; we send raw input.
 */
export function useAddNoteTag(noteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.post<Note>(`/notes/${noteId}/tags/${encodeURIComponent(name)}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes", noteId] });
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}

export function useRemoveNoteTag(noteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.delete<void>(`/notes/${noteId}/tags/${encodeURIComponent(name)}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes", noteId] });
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}
