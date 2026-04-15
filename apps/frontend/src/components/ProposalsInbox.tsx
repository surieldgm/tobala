"use client";

/**
 * Right-edge tray that lists every LLM-proposed edge touching the user's
 * notes. Mounted by the ``/notes`` and ``/ask`` layouts so it persists
 * across route changes without remount flicker.
 *
 * Session-durability heuristic:
 *   • ``proposals_seen_at`` in ``localStorage`` tracks the last time the
 *     user explicitly interacted with the inbox (accept, reject, or manual
 *     collapse after at least one item became visible).
 *   • On mount, if there are pending proposals AND ``proposals_seen_at`` is
 *     older than the newest proposal's ``created`` timestamp, the tray
 *     auto-expands once. Otherwise it stays in the user's last manual state.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAcceptLink, useRejectLink } from "@/hooks/useEdges";
import { useProposals } from "@/hooks/useProposals";
import { EDGE_META, C, F } from "@/lib/design";
import type { ProposalSummary } from "@/lib/types";

const SEEN_KEY = "tobala.proposals_seen_at";

function readSeenAt(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(SEEN_KEY);
  return raw ? Number(raw) || 0 : 0;
}

function writeSeenAt(ts: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SEEN_KEY, String(ts));
}

export function ProposalsInbox() {
  const router = useRouter();
  const proposals = useProposals();
  const acceptLink = useAcceptLink();
  const rejectLink = useRejectLink();
  // ``null`` = haven't run the auto-expand heuristic yet. Avoids a flash of
  // expanded-state on first render when there are no proposals.
  const [expanded, setExpanded] = useState<boolean | null>(null);

  const items = proposals.data ?? [];
  const count = items.length;

  useEffect(() => {
    if (expanded !== null) return;
    if (proposals.isLoading) return;
    if (count === 0) {
      setExpanded(false);
      return;
    }
    const newest = items.reduce(
      (acc, p) => Math.max(acc, new Date(p.created).getTime()),
      0,
    );
    setExpanded(newest > readSeenAt());
  }, [proposals.isLoading, count, items, expanded]);

  const markSeen = () => writeSeenAt(Date.now());

  const handleCollapse = () => {
    markSeen();
    setExpanded(false);
  };

  const handleExpand = () => setExpanded(true);

  // Collapsed rail — bottom-right, clickable.
  if (expanded === false || expanded === null) {
    return (
      <button
        type="button"
        onClick={handleExpand}
        aria-label={`Open proposals inbox (${count})`}
        style={{
          position: "fixed",
          bottom: 14,
          right: 14,
          zIndex: 40,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 10px",
          background: count > 0 ? "#F5EEF9" : C.bg,
          border: `1px solid ${count > 0 ? "#9B6BC4" : C.border}`,
          borderRadius: 8,
          cursor: "pointer",
          fontFamily: F.mono,
          fontSize: 11,
          color: count > 0 ? "#6B4A9B" : C.text3,
          boxShadow: "0 1px 3px rgba(0,0,0,.06)",
        }}
      >
        <span>✦ Proposals</span>
        <span
          style={{
            minWidth: 18,
            height: 18,
            padding: "0 5px",
            borderRadius: 9,
            background: count > 0 ? "#9B6BC4" : C.border,
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {count}
        </span>
      </button>
    );
  }

  return (
    <aside
      style={{
        position: "fixed",
        top: 14,
        right: 14,
        bottom: 14,
        width: 340,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        boxShadow: "0 4px 20px rgba(0,0,0,.08)",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: F.serif, fontSize: 14, fontWeight: 700, color: C.text }}>
            ✦ Proposals
          </span>
          <span
            style={{
              fontFamily: F.mono, fontSize: 10, color: C.text3,
              padding: "1px 6px", background: C.muted, borderRadius: 4,
            }}
          >
            {count}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCollapse}
          aria-label="Collapse proposals"
          title="Collapse"
          style={{
            border: "none", background: "transparent",
            color: C.text3, cursor: "pointer", fontSize: 16, lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
        {proposals.isLoading && (
          <p style={{ fontSize: 12, color: C.text3, fontStyle: "italic" }}>Loading…</p>
        )}
        {!proposals.isLoading && count === 0 && (
          <p style={{ fontSize: 12, color: C.text3, fontStyle: "italic", lineHeight: 1.55 }}>
            No pending proposals. Write a note — Tobalá will suggest links while you work.
          </p>
        )}
        {items.map(p => (
          <ProposalRow
            key={p.id}
            proposal={p}
            onOpen={id => router.push(`/notes/${id}`)}
            onAccept={() => {
              acceptLink.mutate(p.id, { onSuccess: markSeen });
            }}
            onReject={() => {
              rejectLink.mutate(p.id, { onSuccess: markSeen });
            }}
            pending={
              (acceptLink.isPending && acceptLink.variables === p.id) ||
              (rejectLink.isPending && rejectLink.variables === p.id)
            }
          />
        ))}
      </div>
    </aside>
  );
}

function ProposalRow({
  proposal,
  onOpen,
  onAccept,
  onReject,
  pending,
}: {
  proposal: ProposalSummary;
  onOpen: (id: number) => void;
  onAccept: () => void;
  onReject: () => void;
  pending: boolean;
}) {
  const meta = EDGE_META[proposal.label];
  const conf = proposal.confidence == null ? null : Math.round(proposal.confidence * 100);
  return (
    <div
      style={{
        padding: "9px 10px",
        marginBottom: 7,
        borderRadius: 6,
        background: "#F5EEF9",
        border: "1px solid #E0D2F0",
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span
          onClick={() => onOpen(proposal.source)}
          style={{
            fontFamily: F.serif, fontSize: 13, fontWeight: 600,
            color: C.text, cursor: "pointer",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            maxWidth: "45%",
          }}
        >
          {proposal.source_title || "Untitled"}
        </span>
        <span style={{ fontFamily: F.mono, fontSize: 10, color: meta.color }}>
          {meta.label}
        </span>
        <span
          onClick={() => onOpen(proposal.target)}
          style={{
            fontFamily: F.serif, fontSize: 13, fontWeight: 600,
            color: C.text, cursor: "pointer",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            maxWidth: "45%",
          }}
        >
          {proposal.target_title || "Untitled"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {conf != null && (
          <span style={{
            fontFamily: F.mono, fontSize: 9,
            background: "#E0D2F0", color: "#6B4A9B",
            padding: "1px 5px", borderRadius: 3,
          }}>
            {conf}%
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onAccept}
          disabled={pending}
          style={{
            fontSize: 10, padding: "3px 10px",
            background: "#6B9A5B", color: "#fff",
            border: "none", borderRadius: 4, cursor: pending ? "default" : "pointer",
            opacity: pending ? .6 : 1,
          }}
        >
          Keep ✓
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={pending}
          style={{
            fontSize: 10, padding: "3px 10px",
            background: "transparent", color: "#C45B4A",
            border: "1px solid #C45B4A", borderRadius: 4, cursor: pending ? "default" : "pointer",
            opacity: pending ? .6 : 1,
          }}
        >
          Reject ✗
        </button>
      </div>
    </div>
  );
}
