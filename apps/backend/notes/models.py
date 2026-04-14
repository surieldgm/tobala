from django.conf import settings
from django.db import models

from agave.models import Edge, GraphModel
from agave.models.fields import VectorField


class Note(GraphModel):
    """Dual-stored: Django row + AGE vertex.

    The ``GraphModelBase`` metaclass auto-attaches ``Note.graph`` (GraphManager)
    and ``Note.vectors`` (VectorManager, because ``VectorField`` is present).
    """

    CATEGORY_CHOICES = [
        ("random", "Random Thoughts"),
        ("school", "School"),
        ("personal", "Personal"),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notes",
    )
    title = models.CharField(max_length=500, blank=True, default="")
    body = models.TextField(blank=True, default="")
    category = models.CharField(
        max_length=20, choices=CATEGORY_CHOICES, default="random"
    )
    embedding = VectorField(dimensions=384, null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    edited = models.DateTimeField(auto_now=True)

    class GraphMeta:
        graph_name = "tobala"
        vertex_label = "Note"
        properties = ["title", "category"]

    class Meta:
        ordering = ["-edited"]

    def __str__(self) -> str:
        return self.title or f"Note #{self.pk}"


class NoteLink(Edge):
    """Typed edge with a dynamic AGE label.

    Overrides ``_sync_edge_to_graph`` / ``_remove_edge_from_graph`` so the
    AGE edge label is drawn from ``self.label`` (a CharField) rather than
    the fixed ``EdgeMeta.edge_label``. This lets a single Django table
    express multiple graph edge types while keeping ForeignKey semantics.
    """

    LABEL_CHOICES = [
        ("REFERENCES", "References"),
        ("SUPPORTS", "Supports"),
        ("CONTRADICTS", "Contradicts"),
        ("EXTENDS", "Extends"),
        ("INSPIRES", "Inspires"),
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
