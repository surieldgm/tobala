"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Note } from "@/lib/types";

export function useNotes(params?: { ctx?: string; tag?: string; q?: string }) {
  const qs = new URLSearchParams();
  if (params?.ctx) qs.set("ctx", params.ctx);
  if (params?.tag) qs.set("tag", params.tag);
  if (params?.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery<Note[]>({
    queryKey: ["notes", params],
    queryFn: () => api.get<Note[]>(`/notes/${suffix}`),
  });
}

export function useNote(id: number | null) {
  return useQuery<Note>({
    queryKey: ["notes", id],
    enabled: id != null,
    queryFn: () => api.get<Note>(`/notes/${id}/`),
  });
}

/** Payload the write-side accepts: `context_id` is the FK, `tags` is read-only. */
export type NoteWritePayload = {
  title?: string;
  body?: string;
  context_id?: number | null;
};

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NoteWritePayload) => api.post<Note>("/notes/", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["graph"] });
      qc.invalidateQueries({ queryKey: ["contexts"] });
    },
  });
}

export function useUpdateNote(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NoteWritePayload) =>
      api.patch<Note>(`/notes/${id}/`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["graph"] });
      qc.invalidateQueries({ queryKey: ["contexts"] });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/notes/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["graph"] });
    },
  });
}
