"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AnswerPayload } from "@/lib/types";

/**
 * Grounded Q&A over the user's Zettelkasten.
 *
 * The mutation shape (rather than a query) matches how the UI is meant to
 * feel: the user types, hits Ask, and we surface the answer + inspired-notes
 * side channel. Nothing is cached — each question is its own event.
 */
export function useAsk() {
  return useMutation<AnswerPayload, Error, string>({
    mutationFn: (question: string) =>
      api.post<AnswerPayload>("/retrieval/ask/", { question }),
  });
}
