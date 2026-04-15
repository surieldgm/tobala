"use client";

/**
 * Subscribe to the per-user WS stream and translate each event into
 *   (a) coalesced TanStack Query invalidations and
 *   (b) toasts for the user.
 *
 * Mounted once by the layouts that wrap authenticated routes (notes/ask),
 * so a single subscription covers every route under that shell without
 * remount flicker.
 *
 * ### Coalesced invalidations
 * During a backlog drain the server can emit dozens of events in a short
 * burst. Naively calling `invalidateQueries` per event produces a request
 * storm (7–8 GETs × N events). Instead we collect all pending query keys
 * in a Set and flush them after COALESCE_MS of silence — identical keys
 * deduplicate automatically, collapsing the burst into a single round of
 * refetches.
 *
 * ### No optimistic prepend for proposals
 * The previous code prepended the proposal optimistically into the cache
 * and then also invalidated `["proposals"]`. The subsequent refetch added
 * the same NoteLink (with the same `id`) a second time, causing React
 * duplicate-key warnings. We now rely solely on the refetch.
 */

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/Toasts";
import { ws, type WsEvent } from "@/lib/ws";
import type { EdgeLabel, NoteTag } from "@/lib/types";

interface EmbeddingReadyData {
  note_id: number;
}
interface EmbeddingFailedData {
  note_id: number;
  error?: string;
}
interface TagsUpdatedData {
  note_id: number;
  tags: NoteTag[];
}
interface LinkProposedData {
  link_id: number;
  source_id: number;
  target_id: number;
  label: EdgeLabel;
  confidence: number | null;
}

/**
 * How long (ms) to wait for more events before flushing the accumulated
 * invalidation batch. 150 ms is imperceptible to users but collapses
 * a tight backlog burst into a single round-trip per cache key.
 */
const COALESCE_MS = 150;

export function useNoteEvents() {
  const qc = useQueryClient();

  // Pending invalidation keys — JSON-stringified for Set deduplication.
  const pending = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Accumulate proposal count during a burst for the aggregated toast.
  const pendingLinks = useRef(0);

  const flush = useCallback(() => {
    pending.current.forEach((k) =>
      qc.invalidateQueries({ queryKey: JSON.parse(k) as unknown[] }),
    );
    pending.current.clear();
    timer.current = null;

    if (pendingLinks.current > 0) {
      toast.info(
        pendingLinks.current === 1
          ? "New link proposal in inbox"
          : `${pendingLinks.current} new link proposals in inbox`,
      );
      pendingLinks.current = 0;
    }
  }, [qc]);

  /**
   * Queue one or more query keys for invalidation. Resets the coalescing
   * timer on every call so the flush waits until the burst settles.
   */
  const schedule = useCallback(
    (...keys: unknown[][]) => {
      for (const key of keys) pending.current.add(JSON.stringify(key));
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, COALESCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    const handle = (ev: WsEvent) => {
      switch (ev.event) {
        case "note.embedding.pending": {
          const { note_id } = ev.data as unknown as EmbeddingReadyData;
          schedule(["notes", note_id]);
          break;
        }

        case "note.embedding.ready": {
          const { note_id } = ev.data as unknown as EmbeddingReadyData;
          schedule(["notes", note_id], ["notes", note_id, "suggestions"]);
          toast.success(`Note #${note_id} embedded ✓`);
          break;
        }

        case "note.embedding.failed": {
          const { note_id, error } = ev.data as unknown as EmbeddingFailedData;
          schedule(["notes", note_id]);
          toast.error(
            `Embedding failed for note #${note_id}${error ? `: ${error}` : ""}`,
          );
          break;
        }

        case "note.tags.updated": {
          const { note_id } = ev.data as unknown as TagsUpdatedData;
          // Batch both keys — during a burst all tag-updated events for
          // different notes collapse into a single ["notes"] refetch.
          schedule(["notes"], ["tags"]);
          toast.info(`Tags updated for note #${note_id}`);
          break;
        }

        case "note.link.proposed": {
          const data = ev.data as unknown as LinkProposedData;
          // Count proposals for the aggregated toast (flushed after burst).
          // No optimistic setQueryData — doing so AND invalidating causes the
          // same NoteLink id to appear twice in the list (React key collision).
          pendingLinks.current += 1;
          schedule(
            ["proposals"],
            ["proposals", "count"],
            ["notes", data.source_id, "links"],
            ["notes", data.target_id, "links"],
            ["graph"],
          );
          break;
        }

        default:
          // Unknown event — log but don't surface. Keeps the client
          // forward-compatible with new server event types.
          break;
      }
    };

    const unsubscribe = ws.subscribe(handle);
    return () => {
      unsubscribe();
      // Clear any pending flush so stale invalidations don't fire after
      // the component unmounts (e.g. user logs out).
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [schedule]);
}
