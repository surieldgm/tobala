"use client";

/**
 * Shared layout chrome for every authenticated route: sidebar, proposals
 * tray, toast stack, and the live WS subscription. Auth guard redirects to
 * ``/login`` if the JWT is missing. Pulled out so the ``/notes``,
 * ``/contexts``, ``/tags``, and (future) ``/ask`` layouts stay DRY.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProposalsInbox } from "@/components/ProposalsInbox";
import { Sidebar } from "@/components/Sidebar";
import { Toasts } from "@/components/Toasts";
import { useHasToken } from "@/hooks/useAuth";
import { useNoteEvents } from "@/hooks/useNoteEvents";
import { C } from "@/lib/design";

export function AuthShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasToken = useHasToken();
  // One WS subscription per shell mount — it spans every route that uses
  // AuthShell without remount flicker.
  useNoteEvents();

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
  }, [hasToken, router]);

  if (hasToken !== true) {
    return (
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontSize: 13, color: C.text3, fontStyle: "italic" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", width: "100%", minHeight: "100vh", background: C.bg }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {children}
      </div>
      <ProposalsInbox />
      <Toasts />
    </div>
  );
}
