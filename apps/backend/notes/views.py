from django.db import models as db_models
from django.db.models import Count
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Context, Note, NoteLink, NoteTag, Tag, normalize_tag_name
from .providers import ProviderError
from .serializers import (
    AnswerSerializer,
    AskRequestSerializer,
    ContextSerializer,
    NoteLinkSerializer,
    NoteSerializer,
    ProposalSummarySerializer,
    SuggestionSerializer,
    TagSerializer,
)


class ContextViewSet(viewsets.ModelViewSet):
    """User-managed folders for notes. CRUD under ``/api/contexts/``."""

    serializer_class = ContextSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            Context.objects.filter(owner=self.request.user)
            .annotate(note_count=Count("notes"))
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def destroy(self, request, *args, **kwargs):
        """Guard against deleting a context that still owns notes.

        Returns 400 ``{detail, note_count}`` so the UI can offer the
        reassign-first flow described in the R2 plan.
        """
        instance = self.get_object()
        note_count = instance.notes.count()
        if note_count:
            return Response(
                {
                    "detail": (
                        "reassign or delete the notes in this context first"
                    ),
                    "note_count": note_count,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class TagViewSet(viewsets.ModelViewSet):
    """Tag namespace per user. CRUD under ``/api/tags/``.

    ``list?q=<prefix>`` powers the inline typeahead when a user manually adds
    a tag chip to a note.
    """

    serializer_class = TagSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = (
            Tag.objects.filter(owner=self.request.user)
            .annotate(note_count=Count("notes"))
        )
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(name__startswith=normalize_tag_name(q))
        order = self.request.query_params.get("order")
        if order == "count":
            qs = qs.order_by("-note_count", "name")
        return qs

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class NoteViewSet(viewsets.ModelViewSet):
    serializer_class = NoteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = (
            Note.objects.filter(owner=self.request.user)
            .select_related("context")
            .prefetch_related("note_tags__tag")
        )
        # ?ctx=<id> filters by context FK. Accept "none" to show unsorted.
        ctx_id = self.request.query_params.get("ctx")
        if ctx_id:
            if ctx_id == "none":
                qs = qs.filter(context__isnull=True)
            else:
                qs = qs.filter(context_id=ctx_id)
        # ?tag=<name> filters by a single normalized tag name.
        tag_name = self.request.query_params.get("tag")
        if tag_name:
            qs = qs.filter(tags__name=normalize_tag_name(tag_name))
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(
                db_models.Q(title__icontains=q) | db_models.Q(body__icontains=q)
            )
        return qs.distinct()

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=["get"])
    def neighbors(self, request, pk=None):
        """``Note.graph.neighbors(instance, edge_label, depth)``."""
        note = self.get_object()
        qs = Note.graph.neighbors(
            instance=note,
            edge_label=request.query_params.get("label") or None,
            depth=int(request.query_params.get("depth", 1)),
        )
        return Response(NoteSerializer(qs, many=True, context={"request": request}).data)

    @action(detail=True, methods=["get"])
    def links(self, request, pk=None):
        """All non-rejected edges touching this note, with counterparty titles.

        Replaces the neighbor-traversal rendering in ``NoteEditor`` because
        the editor needs ``status``/``label``/``confidence`` per edge to split
        Confirmed vs Proposed groups and render accept/reject controls. The
        Cypher-backed ``neighbors`` action above is kept for future multi-hop
        traversal.
        """
        note = self.get_object()
        qs = (
            NoteLink.objects.filter(
                db_models.Q(source=note) | db_models.Q(target=note)
            )
            .exclude(status="rejected")
            .select_related("source", "target")
            .order_by("-created")
        )
        return Response(ProposalSummarySerializer(qs, many=True).data)

    @action(detail=True, methods=["get"])
    def suggestions(self, request, pk=None):
        """Vector-nearest notes for this owner (``with_distance``), minus linked."""
        note = self.get_object()
        if note.embedding is None:
            return Response([])

        top_k = int(request.query_params.get("top_k", 4))
        # ``similar_to`` applies LIMIT internally; filter/order/slice after
        # ``with_distance`` so we only rank this user's notes.
        similar = (
            Note.vectors.with_distance(
                vector=note.embedding,
                vector_field="embedding",
                distance_fn="cosine",
            )
            .filter(owner=request.user)
            .exclude(embedding__isnull=True)
            .select_related("context")
            .order_by("distance")[: top_k + 10]
        )

        linked_pks: set[int] = set()
        for s, t in NoteLink.objects.filter(
            db_models.Q(source=note) | db_models.Q(target=note)
        ).values_list("source_id", "target_id"):
            linked_pks.update([s, t])
        linked_pks.discard(note.pk)

        results = [
            {
                "id": c.pk,
                "title": c.title,
                "context": ContextSerializer(c.context).data if c.context_id else None,
                "score": float(c.distance),
            }
            for c in similar
            if c.pk not in linked_pks and c.pk != note.pk
        ][:top_k]
        return Response(SuggestionSerializer(results, many=True).data)

    @action(detail=False, methods=["get"])
    def graph_data(self, request):
        notes = (
            Note.objects.filter(owner=request.user)
            .select_related("context")
            .prefetch_related("note_tags__tag")
        )
        # Hide rejected proposals from the graph view entirely — the AGE edge
        # is already gone (see NoteLinkViewSet.reject) but the SQL row is kept
        # so a re-proposal doesn't race with the user's earlier "no".
        edges = (
            NoteLink.objects.filter(source__owner=request.user)
            .exclude(status="rejected")
            .select_related("source", "target")
        )
        return Response(
            {
                "nodes": NoteSerializer(notes, many=True, context={"request": request}).data,
                "edges": NoteLinkSerializer(edges, many=True).data,
            }
        )

    @action(
        detail=True,
        methods=["post", "delete"],
        url_path=r"tags/(?P<tag_name>[^/.]+)",
    )
    def tag(self, request, pk=None, tag_name: str | None = None):
        """Manually add/remove a tag from a note.

        POST creates a user-source NoteTag (upserting a Tag in the owner's
        namespace if it doesn't exist). DELETE removes any NoteTag row
        regardless of source, so the user can also remove system-suggested
        tags they don't want.
        """
        note = self.get_object()
        name = normalize_tag_name(tag_name or "")
        if not name:
            raise ValidationError({"tag_name": "invalid tag name"})

        if request.method == "POST":
            tag, _ = Tag.objects.get_or_create(owner=request.user, name=name)
            NoteTag.objects.update_or_create(
                note=note,
                tag=tag,
                defaults={"source": "user", "confidence": None},
            )
            return Response(
                NoteSerializer(note, context={"request": request}).data,
                status=status.HTTP_201_CREATED,
            )

        # DELETE
        try:
            tag = Tag.objects.get(owner=request.user, name=name)
        except Tag.DoesNotExist:
            return Response(status=status.HTTP_204_NO_CONTENT)
        NoteTag.objects.filter(note=note, tag=tag).delete()
        # Garbage-collect tags with no remaining notes (keeps /tags clean).
        if not tag.notes.exists():
            tag.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class NoteLinkViewSet(viewsets.ModelViewSet):
    serializer_class = NoteLinkSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Either endpoint owned by the user — matches how the pipeline writes
        # proposals (source=anchor, target=candidate) but also lets the user
        # inspect links on notes where they're the target.
        return NoteLink.objects.filter(
            db_models.Q(source__owner=self.request.user)
            | db_models.Q(target__owner=self.request.user)
        ).select_related("source", "target")

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        """Confirm a proposed edge — it becomes a regular edge.

        Idempotent: accepting an already-confirmed link is a no-op. Rejecting
        one that was already rejected does nothing to the graph (the AGE edge
        is long gone) but leaves the SQL row as-is for audit.
        """
        link = self.get_object()
        if link.status != "proposed":
            return Response(
                NoteLinkSerializer(link).data, status=status.HTTP_200_OK
            )
        link.status = "confirmed"
        link.save(update_fields=["status"])
        # The AGE edge is written at original create time (Edge base class), so
        # the accept path does NOT need to re-sync the graph.
        return Response(NoteLinkSerializer(link).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """Reject a proposed edge — AGE edge removed, SQL row kept.

        Keeping the row (rather than deleting it) prevents the LLM from
        re-proposing the same pair on the next pipeline run: the dedup in
        ``propose_links`` checks membership regardless of status.
        """
        link = self.get_object()
        if link.status == "rejected":
            return Response(NoteLinkSerializer(link).data)
        # Strip the AGE edge first so the graph view is instantly consistent.
        try:
            link._remove_edge_from_graph()
        except Exception:  # pragma: no cover — defensive
            # If the edge is already missing (e.g., stale proposal after a
            # graph rebuild), proceed with the status flip so the user's
            # intent sticks.
            pass
        link.status = "rejected"
        link.save(update_fields=["status"])
        return Response(NoteLinkSerializer(link).data)

    @action(detail=False, methods=["get"])
    def proposals(self, request):
        """Inbox feed — every pending proposal touching the user's notes.

        ``?count_only=1`` short-circuits to ``{"count": N}`` for the badge on
        the collapsed ProposalsInbox; full list otherwise, newest first.
        """
        qs = (
            NoteLink.objects.filter(source__owner=request.user, status="proposed")
            .select_related("source", "target")
            .order_by("-created")
        )
        if request.query_params.get("count_only"):
            return Response({"count": qs.count()})
        return Response(ProposalSummarySerializer(qs, many=True).data)

    def perform_create(self, serializer):
        # Manual POST /api/links/ continues to default to a user-confirmed
        # edge — serializer fields are read-only, so we set them here.
        serializer.save(status="confirmed", created_by="user")


class RetrievalView(APIView):
    """Ask Tobalá — grounded Q&A over the user's Zettelkasten.

    POST ``{question: str}`` → :class:`AnswerSerializer` payload. Synchronous
    (the user is waiting for the answer) but the retrieval context is bounded
    by ``top_k_retrieval`` + 1-hop expansion, so single-note calls stay snappy.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        req = AskRequestSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        question = req.validated_data["question"]

        # Lazy import — retrieval pulls in the provider registry and we don't
        # want the module to fail at import time if OPENAI_API_KEY is unset.
        from .retrieval import answer as run_ask

        try:
            payload = run_ask(request.user, question)
        except ProviderError as exc:
            return Response(
                {"detail": "retrieval LLM unavailable", "error": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(AnswerSerializer(payload).data)
