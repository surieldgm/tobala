"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Note } from "@/lib/types";

export function useNotes(params?: { category?: string; q?: string }) {
  const qs = new URLSearchParams();
  if (params?.category && params.category !== "all") qs.set("category", params.category);
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

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Note>) => api.post<Note>("/notes/", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["graph"] });
    },
  });
}

export function useUpdateNote(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Note>) =>
      api.patch<Note>(`/notes/${id}/`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["graph"] });
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
