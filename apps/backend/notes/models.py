import hashlib
import re

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from agave.models import Edge, GraphModel
from agave.models.fields import VectorField


# Kebab-case tag name: 2-40 chars, lower-case letters/digits/hyphens, no leading/trailing '-'.
_TAG_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{0,38}[a-z0-9]$|^[a-z0-9]$")


def content_hash(title: str, body: str) -> str:
    """sha1 of the canonical text that gets embedded.

    Stored on the ``Note`` row so the pipeline can skip re-embedding when the
    content hasn't changed since the last successful embed — e.g. context-only
    saves, undo-redo, or repeated auto-saves of identical text.
    """
    canonical = f"{title or ''}\n{body or ''}"
    return hashlib.sha1(canonical.encode("utf-8")).hexdigest()


def normalize_tag_name(raw: str) -> str:
    """Lowercase, collapse whitespace/underscores to hyphens, strip edges.

    Used by the tagging LLM pipeline + user-added tags to keep the namespace
    flat. See :func:`validate_tag_name` for the shape constraint.
    """
    s = (raw or "").strip().lower()
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")


def validate_tag_name(value: str) -> None:
    if not _TAG_RE.match(value):
        raise ValidationError(
            "tag name must be lower-kebab-case (2-40 chars, letters/digits/hyphens)"
        )


class Context(models.Model):
    """User-curated folder a note lives in. Replaces the fixed category enum.

    One-per-note. Users CRUD these freely (name + color). ``color`` is a
    palette key from ``CONTEXT_PALETTE`` on the frontend, stored here as a
    short string (e.g. ``"ochre"``); rendering is the frontend's concern.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="contexts",
    )
    name = models.CharField(max_length=40)
    color = models.CharField(max_length=20, default="ochre")
    description = models.TextField(blank=True, default="")
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("owner", "name")]
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Tag(models.Model):
    """LLM-inferred (or user-added) topic marker. Many-per-note.

    Flat namespace per owner. Name is lower-kebab-case (see
    :func:`normalize_tag_name`).
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tags",
    )
    name = models.CharField(max_length=60, db_index=True, validators=[validate_tag_name])
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("owner", "name")]
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Note(GraphModel):
    """Dual-stored: Django row + AGE vertex.

    The ``GraphModelBase`` metaclass auto-attaches ``Note.graph`` (GraphManager)
    and ``Note.vectors`` (VectorManager, because ``VectorField`` is present).
    """

    EMBEDDING_STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("ready", "Ready"),
        ("failed", "Failed"),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notes",
    )
    title = models.CharField(max_length=500, blank=True, default="")
    body = models.TextField(blank=True, default="")
    # Replaces the fixed-enum `category` field. Nullable so a note can live in
    # the "Unsorted" bucket while the user decides; PROTECT prevents deleting
    # a context that still has notes (the viewset returns a 400 with note_count
    # for the frontend's reassign-first flow).
    context = models.ForeignKey(
        Context,
        on_delete=models.PROTECT,
        related_name="notes",
        null=True,
        blank=True,
    )
    tags = models.ManyToManyField(
        Tag,
        through="NoteTag",
        related_name="notes",
        blank=True,
    )
    # 1536 = OpenAI text-embedding-3-small native dim. Migration 0003 rebuilt
    # the HNSW index at this size and nulled legacy 384-dim values.
    embedding = VectorField(dimensions=1536, null=True, blank=True)
    embedding_status = models.CharField(
        max_length=16,
        choices=EMBEDDING_STATUS_CHOICES,
        default="pending",
        db_index=True,
    )
    embedding_error = models.TextField(blank=True, default="")
    # sha1 of the title+body text that produced the current embedding.
    # Empty string means the note has never been successfully embedded yet.
    # The signal uses this to skip re-enqueuing when the content hasn't
    # changed (e.g. context-only saves, auto-saves during rapid typing).
    embedding_content_hash = models.CharField(max_length=40, blank=True, default="")
    # sha1 of the content that was tagged by the LLM. Guards infer_tags so
    # backlogged duplicate tasks skip the LLM call when tagging already ran
    # for this exact content.
    tagging_content_hash = models.CharField(max_length=40, blank=True, default="")
    # sha1 of the content for which link proposals were generated. Guards
    # propose_links the same way — prevents N duplicate classify_edge() calls
    # from a queue backlog.
    linking_content_hash = models.CharField(max_length=40, blank=True, default="")
    created = models.DateTimeField(auto_now_add=True)
    edited = models.DateTimeField(auto_now=True)

    class GraphMeta:
        graph_name = "tobala"
        vertex_label = "Note"
        # `context_id` is carried on the vertex so future Cypher queries can
        # filter graph traversals by folder without hitting SQL.
        properties = ["title", "context_id"]

    class Meta:
        ordering = ["-edited"]

    def __str__(self) -> str:
        return self.title or f"Note #{self.pk}"


class NoteTag(models.Model):
    """Through-table for Note <-> Tag with provenance + confidence.

    ``source="system"`` rows are written by the tagging LLM; the user can
    "endorse" one by clicking its chip, which flips the source to ``"user"``.
    The :data:`propose_links` pipeline uses anchor + candidate tags as a
    signal when asking the linking LLM to pick an edge label.
    """

    SOURCE_CHOICES = [
        ("user", "User"),
        ("system", "System"),
    ]

    note = models.ForeignKey(
        Note, on_delete=models.CASCADE, related_name="note_tags"
    )
    tag = models.ForeignKey(
        Tag, on_delete=models.CASCADE, related_name="note_tags"
    )
    source = models.CharField(
        max_length=8, choices=SOURCE_CHOICES, default="user"
    )
    confidence = models.FloatField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("note", "tag")]
        ordering = ["-created"]

    def __str__(self) -> str:
        return f"{self.note_id}:{self.tag_id} ({self.source})"


class NoteLink(Edge):
    """Typed edge with a dynamic AGE label.

    Overrides ``_sync_edge_to_graph`` / ``_remove_edge_from_graph`` so the
    AGE edge label is drawn from ``self.label`` (a CharField) rather than
    the fixed ``EdgeMeta.edge_label``. This lets a single Django table
    express multiple graph edge types while keeping ForeignKey semantics.

    ``status`` and ``created_by`` distinguish LLM-proposed edges from
    user-confirmed ones — Phase 5's ProposalsInbox reads edges in state
    ``proposed`` and lets the user ``accept`` (→ ``confirmed``) or
    ``reject`` (→ ``rejected``, with the AGE edge removed from the graph).
    """

    LABEL_CHOICES = [
        ("REFERENCES", "References"),
        ("SUPPORTS", "Supports"),
        ("CONTRADICTS", "Contradicts"),
        ("EXTENDS", "Extends"),
        ("INSPIRES", "Inspires"),
    ]

    STATUS_CHOICES = [
        ("proposed", "Proposed"),
        ("confirmed", "Confirmed"),
        ("rejected", "Rejected"),
    ]
    CREATED_BY_CHOICES = [
        ("user", "User"),
        ("system", "System"),
    ]

    source = models.ForeignKey(
        Note, on_delete=models.CASCADE, related_name="outgoing_edges"
    )
    target = models.ForeignKey(
        Note, on_delete=models.CASCADE, related_name="incoming_edges"
    )
    label = models.CharField(
        max_length=20, choices=LABEL_CHOICES, default="REFERENCES"
    )
    context = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=12,
        choices=STATUS_CHOICES,
        default="confirmed",
        db_index=True,
    )
    created_by = models.CharField(
        max_length=8, choices=CREATED_BY_CHOICES, default="user"
    )
    # LLM confidence at creation time, for ``created_by="system"`` rows. Kept
    # immutable (the user's accept/reject doesn't edit it) so the inbox can
    # show the original signal.
    confidence = models.FloatField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)

    class EdgeMeta:
        graph_name = "tobala"
        # Placeholder — the override below uses self.label instead.
        edge_label = "LINKS"
        properties = ["context"]

    class Meta:
        unique_together = ["source", "target", "label"]

    def _sync_edge_to_graph(self) -> None:
        from agave.db.backends.postgresql.operations import upsert_edge

        upsert_edge(
            graph_name=self._edge_meta.graph_name,
            label=self.label,  # dynamic
            source_label=self._get_source_meta().vertex_label,
            source_pk=self.source_id,
            target_label=self._get_target_meta().vertex_label,
            target_pk=self.target_id,
            properties=self._get_edge_properties(),
        )

    def _remove_edge_from_graph(self) -> None:
        from agave.db.backends.postgresql.operations import delete_edge

        delete_edge(
            graph_name=self._edge_meta.graph_name,
            label=self.label,  # dynamic
            source_label=self._get_source_meta().vertex_label,
            source_pk=self.source_id,
            target_label=self._get_target_meta().vertex_label,
            target_pk=self.target_id,
        )

    def __str__(self) -> str:
        return f"{self.source_id} -[{self.label}]-> {self.target_id}"


class LLMInvocation(models.Model):
    """One row per LLM call — the owned substrate for Phase-8 monitoring.

    Written by the :func:`notes.observability.log_llm_call` decorator around
    provider methods. We keep this internal (own model + Django admin view)
    rather than wiring Langfuse/similar; a single-user deploy doesn't need
    the extra infra yet, and ``admin.LLMInvocationAdmin`` already groups by
    task with p50/p95 latency + spend summaries.
    """

    TASK_CHOICES = [
        ("embedding", "Embedding"),
        ("tagging", "Tagging"),
        ("linking", "Linking"),
        ("retrieval", "Retrieval"),
    ]

    task = models.CharField(max_length=16, choices=TASK_CHOICES, db_index=True)
    provider = models.CharField(max_length=32)
    model = models.CharField(max_length=64)
    prompt_tokens = models.PositiveIntegerField(default=0)
    completion_tokens = models.PositiveIntegerField(default=0)
    latency_ms = models.PositiveIntegerField(default=0)
    # USD price according to the provider's static rate table at call time.
    # Stored as a float (not Decimal) — we're tracking rough spend, not
    # invoicing. Precision to 1e-6 is plenty.
    cost_usd = models.FloatField(default=0.0)
    # sha1 of the concatenated (system + user) prompt — lets the admin detect
    # duplicate work across sessions without us storing raw prompts.
    input_hash = models.CharField(max_length=40, db_index=True, blank=True, default="")
    # Compact representation of the model's return — JSON-encoded for
    # structured-output calls, raw string otherwise. Truncated at 2KB to keep
    # admin rows cheap to list.
    output = models.TextField(blank=True, default="")
    error = models.TextField(blank=True, default="")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="llm_invocations",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.task}/{self.model} @ {self.created_at:%Y-%m-%d %H:%M:%S}"

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens
