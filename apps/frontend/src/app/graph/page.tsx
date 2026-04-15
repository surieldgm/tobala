"use client";

import { useRouter } from "next/navigation";
import { useGraph } from "@/hooks/useGraph";
import { useContexts } from "@/hooks/useContexts";
import { GraphViewSVG } from "@/components/GraphViewSVG";
import { getContextColors, EDGE_META, F, C } from "@/lib/design";

export default function GraphPage() {
  const router = useRouter();
  const graph = useGraph();
  const contexts = useContexts();

  return (
    <main style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, padding: "24px 32px", background: C.bg }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontFamily: F.serif, fontSize: 22, fontWeight: 600, color: C.text2, fontStyle: "italic", margin: 0 }}>
            Graph
          </h1>
          <p style={{ fontFamily: F.mono, fontSize: 10, color: C.text3, opacity: .6, margin: 0 }}>
            Click a node to open the note
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/notes")}
          style={{
            fontFamily: F.mono, fontSize: 11, color: C.text3,
            background: "none", border: `1px solid ${C.border}`,
            borderRadius: 6, padding: "5px 12px", cursor: "pointer",
          }}
        >
          ← Notes
        </button>
      </header>

      {graph.isLoading && <p style={{ fontFamily: F.serif, fontSize: 13, color: C.text3, fontStyle: "italic" }}>Loading…</p>}
      {graph.isError && <p style={{ fontSize: 13, color: "#C45B4A" }}>Failed to load graph</p>}

      {graph.data && (
        <>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.bg }}>
            <GraphViewSVG
              data={graph.data}
              onSelect={id => router.push(`/notes/${id}`)}
              activeId={null}
            />
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {(contexts.data ?? []).map((c) => {
              const col = getContextColors(c);
              return (
                <span key={c.id} style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: F.mono, fontSize: 10, color: C.text3 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: col.dot }} /> {c.name}
                </span>
              );
            })}
            <span style={{ color: "#D4C5A9" }}>|</span>
            {(Object.entries(EDGE_META) as [string, typeof EDGE_META[keyof typeof EDGE_META]][]).map(([k, v]) => (
              <span key={k} style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: F.mono, fontSize: 10, color: v.color }}>
                {v.icon} {v.label}
              </span>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
