from django.db import models as db_models
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Note, NoteLink
from .serializers import NoteLinkSerializer, NoteSerializer, SuggestionSerializer


class NoteViewSet(viewsets.ModelViewSet):
    serializer_class = NoteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Note.objects.filter(owner=self.request.user)
        cat = self.request.query_params.get("category")
        if cat and cat != "all":
            qs = qs.filter(category=cat)
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(
                db_models.Q(title__icontains=q) | db_models.Q(body__icontains=q)
            )
        return qs

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
        return Response(NoteSerializer(qs, many=True).data)

    @action(detail=True, methods=["get"])
    def suggestions(self, request, pk=None):
        """``Note.vectors.similar_to(...)`` minus already-linked notes."""
        note = self.get_object()
        if note.embedding is None:
            return Response([])

        top_k = int(request.query_params.get("top_k", 4))
        similar = Note.vectors.similar_to(
            vector=note.embedding,
            vector_field="embedding",
            top_k=top_k + 10,
            distance_fn="cosine",
        ).filter(owner=request.user)

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
                "category": c.category,
                "score": float(c.distance),
            }
            for c in similar
            if c.pk not in linked_pks and c.pk != note.pk
        ][:top_k]
        return Response(SuggestionSerializer(results, many=True).data)

    @action(detail=False, methods=["get"])
    def graph_data(self, request):
        notes = Note.objects.filter(owner=request.user)
        edges = NoteLink.objects.filter(source__owner=request.user).select_related(
            "source", "target"
        )
        return Response(
            {
                "nodes": NoteSerializer(notes, many=True).data,
                "edges": NoteLinkSerializer(edges, many=True).data,
            }
        )


class NoteLinkViewSet(viewsets.ModelViewSet):
    serializer_class = NoteLinkSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return NoteLink.objects.filter(
            source__owner=self.request.user
        ).select_related("source", "target")
