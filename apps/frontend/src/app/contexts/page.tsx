"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  useContexts,
  useCreateContext,
  useDeleteContext,
  useUpdateContext,
} from "@/hooks/useContexts";
import { useNotes } from "@/hooks/useNotes";
import { CONTEXT_PALETTE, ContextColor, PaletteEntry, F, C, S } from "@/lib/design";
import { api, ApiError } from "@/lib/api";
import type { Context } from "@/lib/types";

/* ── Palette swatch picker ── */
function ColorSwatches({
  value,
  onChange,
}: {
  value: ContextColor;
  onChange: (c: ContextColor) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {(Object.entries(CONTEXT_PALETTE) as [ContextColor, typeof CONTEXT_PALETTE[ContextColor]][]).map(
        ([k, v]) => (
          <button
            key={k}
            type="button"
            title={v.label}
            onClick={() => onChange(k)}
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: v.dot,
              border: value === k ? `2px solid ${C.text2}` : `1px solid ${C.border}`,
              cursor: "pointer",
              padding: 0,
            }}
          />
        )
      )}
    </div>
  );
}

/* ── Reassign-before-delete modal ── */
function ReassignModal({
  context,
  allContexts,
  onClose,
  onDone,
}: {
  context: Context;
  allContexts: Context[];
  onClose: () => void;
  onDone: () => void;
}) {
  /* Pull the notes inside this context so we can patch each one. */
  const notes = useNotes({ ctx: String(context.id) });
  const deleteCtx = useDeleteContext();
  const qc = useQueryClient();

  const [target, setTarget] = useState<number | "none">("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = allContexts.filter((c) => c.id !== context.id);
  const count = context.note_count ?? notes.data?.length ?? 0;

  /* Iterate through notes → PATCH each → invalidate → retry DELETE. */
  const reassignAndDelete = async () => {
    if (!notes.data) return;
    setBusy(true);
    setError(null);
    try {
      const body = { context_id: target === "none" ? null : target };
      await Promise.all(
        notes.data.map((n) => api.patch(`/notes/${n.id}/`, body))
      );
      /* Freshen the caches before the delete call so the contexts view
         reflects the just-moved notes. */
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["contexts"] });
      qc.invalidateQueries({ queryKey: ["graph"] });
      await deleteCtx.mutateAsync(context.id);
      onDone();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? typeof e.data === "object" && e.data && "detail" in e.data
            ? String((e.data as { detail: string }).detail)
            : `API error ${e.status}`
          : "Reassignment failed.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(61,53,39,.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: 20,
          boxShadow: "0 8px 24px rgba(0,0,0,.12)",
        }}
      >
        <h2
          style={{
            fontFamily: F.serif,
            fontSize: 17,
            fontWeight: 600,
            color: C.text,
            margin: 0,
            marginBottom: 4,
          }}
        >
          Reassign notes before deleting
        </h2>
        <p
          style={{
            fontFamily: F.serif,
            fontSize: 12.5,
            color: C.text3,
            margin: 0,
            marginBottom: 14,
            fontStyle: "italic",
          }}
        >
          <strong>{context.name}</strong> still holds {count} note{count === 1 ? "" : "s"}.
          Pick where they should go.
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            maxHeight: 220,
            overflow: "auto",
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: 4,
            marginBottom: 14,
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 4,
              cursor: "pointer",
              background: target === "none" ? C.muted : "transparent",
              fontFamily: F.serif,
              fontSize: 13,
              color: C.text2,
            }}
          >
            <input
              type="radio"
              checked={target === "none"}
              onChange={() => setTarget("none")}
            />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#B8B0A3" }} />
            <span style={{ fontStyle: "italic" }}>Unsorted</span>
          </label>

          {candidates.map((c) => (
            <label
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 4,
                cursor: "pointer",
                background: target === c.id ? C.muted : "transparent",
                fontFamily: F.serif,
                fontSize: 13,
                color: C.text2,
              }}
            >
              <input
                type="radio"
                checked={target === c.id}
                onChange={() => setTarget(c.id)}
              />
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background:
                    (CONTEXT_PALETTE as Record<string, PaletteEntry>)[c.color]?.dot ??
                    CONTEXT_PALETTE.stone.dot,
                }}
              />
              {c.name}
            </label>
          ))}
        </div>

        {error && (
          <p style={{ fontSize: 11, color: "#C45B4A", marginBottom: 8 }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{ ...S.smallBtn, opacity: busy ? 0.5 : 1 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={reassignAndDelete}
            disabled={busy || notes.isLoading}
            style={{
              ...S.smallBtn,
              background: C.text2,
              color: C.bg,
              border: "none",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Moving…" : `Move ${count} note${count === 1 ? "" : "s"} & delete`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Individual context row ── */
function ContextRow({
  ctx,
  onRequestReassign,
}: {
  ctx: Context;
  onRequestReassign: (c: Context) => void;
}) {
  const update = useUpdateContext(ctx.id);
  const del = useDeleteContext();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(ctx.name);
  const [color, setColor] = useState<ContextColor>((ctx.color as ContextColor) ?? "stone");
  const [pickerOpen, setPickerOpen] = useState(false);

  const palette =
    (CONTEXT_PALETTE as Record<string, PaletteEntry>)[ctx.color] ??
    CONTEXT_PALETTE.stone;

  const save = () => {
    if (!name.trim() || (name === ctx.name && color === ctx.color)) {
      setEditing(false);
      return;
    }
    update.mutate(
      { name: name.trim(), color },
      { onSuccess: () => setEditing(false) }
    );
  };

  const handleDelete = () => {
    if ((ctx.note_count ?? 0) > 0) {
      onRequestReassign(ctx);
      return;
    }
    if (!confirm(`Delete the "${ctx.name}" context?`)) return;
    del.mutate(ctx.id);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 8,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
      }}
    >
      <button
        type="button"
        onClick={() => setPickerOpen((p) => !p)}
        title="Change color"
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: palette.dot,
          border: `1.5px solid ${C.surface}`,
          boxShadow: `0 0 0 1px ${palette.border}`,
          cursor: "pointer",
          padding: 0,
          flexShrink: 0,
        }}
      />

      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setEditing(false);
              setName(ctx.name);
            }
          }}
          style={{
            flex: 1,
            border: `1px solid ${C.border}`,
            background: C.surface,
            borderRadius: 5,
            padding: "4px 8px",
            fontFamily: F.serif,
            fontSize: 14,
            color: C.text,
            outline: "none",
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{
            flex: 1,
            textAlign: "left",
            border: "none",
            background: "transparent",
            fontFamily: F.serif,
            fontSize: 14,
            fontWeight: 600,
            color: C.text,
            cursor: "text",
            padding: 0,
          }}
        >
          {ctx.name}
        </button>
      )}

      <span
        style={{
          fontFamily: F.mono,
          fontSize: 10,
          color: C.text3,
          opacity: 0.6,
        }}
      >
        {ctx.note_count ?? 0} note{(ctx.note_count ?? 0) === 1 ? "" : "s"}
      </span>

      {editing ? (
        <>
          <button type="button" onClick={save} disabled={update.isPending} style={S.smallBtn}>
            {update.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName(ctx.name);
              setColor((ctx.color as ContextColor) ?? "stone");
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
            onClick={handleDelete}
            disabled={del.isPending}
            style={{ ...S.smallBtn, color: "#C45B4A" }}
          >
            {del.isPending ? "…" : "Delete"}
          </button>
        </>
      )}

      {pickerOpen && (
        <div
          style={{
            position: "absolute",
            transform: "translate(0, 40px)",
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 10,
            boxShadow: "0 4px 14px rgba(0,0,0,.08)",
            zIndex: 20,
          }}
        >
          <p style={{ fontSize: 10, color: C.text3, marginBottom: 6, fontFamily: F.mono }}>
            Pick a color
          </p>
          <ColorSwatches
            value={color}
            onChange={(c) => {
              setColor(c);
              update.mutate({ color: c }, { onSuccess: () => setPickerOpen(false) });
            }}
          />
        </div>
      )}
      {/* overlay to close the picker on outside click */}
      {pickerOpen && (
        <div
          onClick={() => setPickerOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 15 }}
        />
      )}
    </div>
  );
}

function ContextsDashboard() {
  const router = useRouter();
  const contexts = useContexts();
  const createCtx = useCreateContext();

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<ContextColor>("ochre");
  const [reassignFor, setReassignFor] = useState<Context | null>(null);

  const allContexts = useMemo(() => contexts.data ?? [], [contexts.data]);

  const submit = () => {
    if (!newName.trim()) return;
    createCtx.mutate(
      { name: newName.trim(), color: newColor },
      {
        onSuccess: () => {
          setNewName("");
          setNewColor("ochre");
        },
      }
    );
  };

  return (
    <main
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 18,
        padding: "24px 32px",
        overflow: "auto",
      }}
    >
      {/* Header */}
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
            Contexts
          </h1>
          <p style={{ fontFamily: F.mono, fontSize: 10, color: C.text3, opacity: 0.6, margin: 0 }}>
            Folders for your notes — one per note, renameable at any time
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

      {/* New context form */}
      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 14,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
        }}
      >
        <label
          style={{
            fontFamily: F.mono,
            fontSize: 9,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 1.2,
            color: C.text3,
          }}
        >
          New Context
        </label>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            placeholder="e.g. Research"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            style={{
              flex: 1,
              padding: "6px 10px",
              border: `1px solid ${C.border}`,
              background: C.bg,
              borderRadius: 5,
              fontFamily: F.serif,
              fontSize: 13,
              color: C.text,
              outline: "none",
            }}
          />
          <ColorSwatches value={newColor} onChange={setNewColor} />
          <button
            type="button"
            onClick={submit}
            disabled={!newName.trim() || createCtx.isPending}
            style={{
              padding: "6px 14px",
              background: C.text2,
              color: C.bg,
              border: "none",
              borderRadius: 5,
              fontFamily: F.mono,
              fontSize: 11,
              cursor: "pointer",
              opacity: createCtx.isPending || !newName.trim() ? 0.5 : 1,
            }}
          >
            Create
          </button>
        </div>
      </section>

      {/* List */}
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {contexts.isLoading && (
          <p style={{ fontSize: 13, color: C.text3, fontStyle: "italic" }}>Loading…</p>
        )}
        {contexts.isError && (
          <p style={{ fontSize: 13, color: "#C45B4A" }}>Failed to load contexts</p>
        )}
        {contexts.data && contexts.data.length === 0 && (
          <p style={{ fontSize: 13, color: C.text3, fontStyle: "italic" }}>
            No contexts yet — create one above to start organising.
          </p>
        )}
        {allContexts.map((c) => (
          <div key={c.id} style={{ position: "relative" }}>
            <ContextRow ctx={c} onRequestReassign={setReassignFor} />
          </div>
        ))}
      </section>

      {reassignFor && (
        <ReassignModal
          context={reassignFor}
          allContexts={allContexts}
          onClose={() => setReassignFor(null)}
          onDone={() => setReassignFor(null)}
        />
      )}
    </main>
  );
}

export default function ContextsPage() {
  return (
    <Suspense>
      <ContextsDashboard />
    </Suspense>
  );
}
