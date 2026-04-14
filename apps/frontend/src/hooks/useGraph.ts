"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { GraphData } from "@/lib/types";

export function useGraph() {
  return useQuery<GraphData>({
    queryKey: ["graph"],
    queryFn: () => api.get<GraphData>("/notes/graph_data/"),
  });
}
