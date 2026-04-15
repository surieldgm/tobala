"use client";

import { AuthShell } from "@/components/AuthShell";

export default function AskLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
