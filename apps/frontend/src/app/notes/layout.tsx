"use client";

import { AuthShell } from "@/components/AuthShell";

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
