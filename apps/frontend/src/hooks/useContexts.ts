"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useClientSearchParams } from "@/hooks/useClientSearchParams";
import { api } from "@/lib/api";
import type { Context } from "@/lib/types";

export function useContexts() {
  return useQuery<Context[]>({
    queryKey: ["contexts"],
    queryFn: () => api.get<Context[]>("/contexts/"),
  });
}

export function useCreateContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Context>) =>
      api.post<Context>("/contexts/", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contexts"] });
    },
  });
}

export function useUpdateContext(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Context>) =>
      api.patch<Context>(`/contexts/${id}/`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contexts"] });
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["graph"] });
    },
  });
}

export function useDeleteContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/contexts/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contexts"] });
    },
  });
}

/** Read the active context id from ``?ctx=<id>``; returns null when absent. */
export function useActiveContextId(): number | "none" | null {
  const sp = useClientSearchParams();
  const raw = sp.get("ctx");
  if (!raw) return null;
  if (raw === "none") return "none";
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
