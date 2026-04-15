"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { useTags, useRenameTag, useDeleteTag } from "@/hooks/useTags";
import { F, C, S } from "@/lib/design";
import type { Tag } from "@/lib/types";

/* ── Individual tag row ── */
function TagRow({ tag }: { tag: Tag }) {
  const router = useRouter();
  const rename = useRenameTag(tag.id);
  const del = useDeleteTag();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);

  const save = () => {
    if (!name.trim() || name === tag.name) {
      setEditing(false);
      setName(tag.name);
      return;
    }
    rename.mutate(
      { name: name.trim() },
      {
        onSuccess: () => setEditing(false),
        /* Backend normalizes kebab-case → if it renames to something
           already taken, it'll 400. Surface via alert for the MVP. */
        onError: () => {
          alert(
            "Rename failed — that tag name may already exist or be invalid (use lower-kebab-case, 2–40 chars)."
          );
          setName(tag.name);
        },
      }
    );
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 14px",
        borderRadius: 8,
        border: `1px solid ${C.border}`,
        background: C.surface,
      }}
    >
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setEditing(false);
              setName(tag.name);
            }
          }}
          style={{
            flex: 1,
            border: `1px solid ${C.border}`,
            background: C.bg,
            borderRadius: 5,
            padding: "4px 8px",
            fontFamily: F.mono,
            fontSize: 12.5,
            color: C.text,
            outline: "none",
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => router.push(`/notes?tag=${encodeURIComponent(tag.name)}`)}
          title="Filter notes by this tag"
          style={{
            flex: 1,
            textAlign: "left",
            border: "none",
            background: "transparent",
            fontFamily: F.mono,
            fontSize: 12.5,
            fontWeight: 600,
            color: C.text,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {tag.name}
        </button>
      )}

      <span
        style={{
          fontFamily: F.mono,
          fontSize: 10,
          color: C.text3,
          opacity: 0.55,
        }}
      >
        {tag.note_count ?? 0} note{(tag.note_count ?? 0) === 1 ? "" : "s"}
      </span>

      {editing ? (
        <>
          <button
            type="button"
            onClick={save}
            disabled={rename.isPending}
            style={S.smallBtn}
          >
            {rename.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName(tag.name);
            }}
            style={S.smallBtn}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => setEditing(true)} style={S.smallBtn}>
            Rename
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                !confirm(
                  `Delete the tag "${tag.name}" from all ${tag.note_count ?? 0} note${
                    (tag.note_count ?? 0) === 1 ? "" : "s"
                  }?`
                )
              )
                return;
              del.mutate(tag.id);
            }}
            disabled={del.isPending}
            style={{ ...S.smallBtn, color: "#C45B4A" }}
          >
            {del.isPending ? "…" : "Delete"}
          </button>
        </>
      )}
    </div>
  );
}

function TagsDashboard() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState<"count" | "name">("count");

  /* Search uses prefix match on the backend — if the user types something
     non-kebab, the backend normalizes it server-side. */
  const tags = useTags({
    q: search.trim() || undefined,
    order,
  });

  return (
    <main
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: "24px 32px",
        overflow: "auto",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: F.serif,
              fontSize: 22,
              fontWeight: 600,
              color: C.text2,
              fontStyle: "italic",
              margin: 0,
            }}
          >
            Tags
          </h1>
          <p style={{ fontFamily: F.mono, fontSize: 10, color: C.text3, opacity: 0.6, margin: 0 }}>
            Topics across your notes — suggested by Tobalá, editable by you
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/notes")}
          style={{
            fontFamily: F.mono,
            fontSize: 11,
            color: C.text3,
            background: "none",
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: "5px 12px",
            cursor: "pointer",
          }}
        >
          ← Notes
        </button>
      </header>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          placeholder="Search tags…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: "6px 10px",
            border: `1px solid ${C.border}`,
            background: C.surface,
            borderRadius: 5,
            fontFamily: F.mono,
            fontSize: 12,
            color: C.text,
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 2, background: C.muted, borderRadius: 6, padding: 2 }}>
          {(["count", "name"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setOrder(k)}
              style={{
                padding: "4px 10px",
                borderRadius: 5,
                border: "none",
                background: order === k ? C.surface : "transparent",
                fontFamily: F.mono,
                fontSize: 11,
                color: order === k ? C.text2 : C.text3,
                cursor: "pointer",
                fontWeight: order === k ? 600 : 400,
                boxShadow: order === k ? "0 1px 2px rgba(0,0,0,.06)" : "none",
              }}
            >
              {k === "count" ? "By count" : "A–Z"}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tags.isLoading && (
          <p style={{ fontSize: 13, color: C.text3, fontStyle: "italic" }}>Loading…</p>
        )}
        {tags.isError && (
          <p style={{ fontSize: 13, color: "#C45B4A" }}>Failed to load tags</p>
        )}
        {tags.data && tags.data.length === 0 && !tags.isLoading && (
          <p style={{ fontSize: 13, color: C.text3, fontStyle: "italic" }}>
            {search
              ? `No tags match "${search}".`
              : "No tags yet — save a note and Tobalá will suggest some."}
          </p>
        )}
        {(tags.data ?? []).map((t) => (
          <TagRow key={t.id} tag={t} />
        ))}
      </section>
    </main>
  );
}

export default function TagsPage() {
  return (
    <Suspense>
      <TagsDashboard />
    </Suspense>
  );
}
