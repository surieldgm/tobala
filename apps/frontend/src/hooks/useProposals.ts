"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ProposalSummary } from "@/lib/types";

/** Full list of pending LLM-proposed edges touching the current user's notes. */
export function useProposals() {
  return useQuery<ProposalSummary[]>({
    queryKey: ["proposals"],
    queryFn: () => api.get<ProposalSummary[]>("/links/proposals/"),
  });
}

/**
 * Cheap badge query — ``?count_only=1`` avoids serializing the full list.
 * ``refetchOnWindowFocus`` is on so a user returning from another tab sees
 * the fresh count if a background tab missed the WS event.
 */
export function useProposalsCount() {
  return useQuery<{ count: number }>({
    queryKey: ["proposals", "count"],
    queryFn: () =>
      api.get<{ count: number }>("/links/proposals/?count_only=1"),
    refetchOnWindowFocus: true,
  });
}
