"use client";

import { AuthShell } from "@/components/AuthShell";

export default function TagsLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
