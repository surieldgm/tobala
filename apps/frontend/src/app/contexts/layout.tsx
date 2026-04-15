"use client";

import { AuthShell } from "@/components/AuthShell";

export default function ContextsLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
