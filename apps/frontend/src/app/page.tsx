"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHasToken } from "@/hooks/useAuth";

export default function Home() {
  const router = useRouter();
  const hasToken = useHasToken();

  useEffect(() => {
    if (hasToken === null) return;
    router.replace(hasToken ? "/notes" : "/login");
  }, [hasToken, router]);

  return (
    <main className="flex flex-1 items-center justify-center">
      <p className="text-sm text-neutral-500">Loading…</p>
    </main>
  );
}
