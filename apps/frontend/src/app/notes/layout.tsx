"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { useHasToken } from "@/hooks/useAuth";
import { C } from "@/lib/design";

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasToken = useHasToken();

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
      {/* Sidebar uses useSearchParams so must be wrapped in Suspense */}
      <Suspense>
        <Sidebar />
      </Suspense>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
