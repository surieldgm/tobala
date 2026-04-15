"use client";

/**
 * Minimal toast stack — no external library. Surfaces pipeline WS events
 * ("Embedded ✓", "2 proposals", "Tags updated") without yanking the user's
 * cursor out of whatever they're typing.
 *
 * The store is module-scoped so WS handlers outside React components can
 * still push a toast via ``toast.info(...)``.
 */

import { useEffect, useState } from "react";
import { F, C } from "@/lib/design";

type Tone = "info" | "success" | "error";

interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

type Listener = (toasts: Toast[]) => void;

const AUTO_DISMISS_MS = 4000;
const MAX_VISIBLE = 4;

class ToastStore {
  private items: Toast[] = [];
  private listeners = new Set<Listener>();
  private seq = 0;

  push(message: string, tone: Tone = "info"): number {
    const id = ++this.seq;
    this.items = [{ id, message, tone }, ...this.items].slice(0, MAX_VISIBLE);
    this.emit();
    setTimeout(() => this.dismiss(id), AUTO_DISMISS_MS);
    return id;
  }

  dismiss(id: number) {
    const before = this.items.length;
    this.items = this.items.filter(t => t.id !== id);
    if (this.items.length !== before) this.emit();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l(this.items);
    return () => {
      this.listeners.delete(l);
    };
  }

  private emit() {
    this.listeners.forEach(l => l(this.items));
  }
}

const store = new ToastStore();

export const toast = {
  info: (m: string) => store.push(m, "info"),
  success: (m: string) => store.push(m, "success"),
  error: (m: string) => store.push(m, "error"),
  dismiss: (id: number) => store.dismiss(id),
};

const TONE_STYLE: Record<Tone, { border: string; accent: string }> = {
  info:    { border: "#D4C5A9", accent: C.text3 },
  success: { border: "#A8C5A0", accent: "#5C8A4F" },
  error:   { border: "#D99570", accent: "#B3472A" },
};

export function Toasts() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => store.subscribe(setItems), []);

  if (items.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 18,
        left: 18,
        zIndex: 50,
        display: "flex",
        flexDirection: "column-reverse",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {items.map(t => {
        const tone = TONE_STYLE[t.tone];
        return (
          <div
            key={t.id}
            onClick={() => store.dismiss(t.id)}
            style={{
              pointerEvents: "auto",
              padding: "8px 14px",
              background: C.surface,
              border: `1px solid ${tone.border}`,
              borderLeft: `3px solid ${tone.accent}`,
              borderRadius: 6,
              fontFamily: F.mono,
              fontSize: 11.5,
              color: C.text,
              boxShadow: "0 2px 6px rgba(0,0,0,.08)",
              cursor: "pointer",
              maxWidth: 320,
              lineHeight: 1.4,
            }}
          >
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
