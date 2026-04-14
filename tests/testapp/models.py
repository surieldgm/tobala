"""
Test models for integration tests.
"""

from django.db import models

from agave.models import Edge, GraphModel
from agave.models.fields import VectorField


class Author(GraphModel):
    name = models.CharField(max_length=255)
    affiliation = models.CharField(max_length=255, blank=True, default="")

    class GraphMeta:
        vertex_label = "Author"
        properties = ["name", "affiliation"]

    class Meta:
        app_label = "testapp"

    def __str__(self):
        return self.name


class Paper(GraphModel):
    title = models.CharField(max_length=255)
    year = models.IntegerField(default=2024)
    abstract = models.TextField(blank=True, default="")
    embedding = VectorField(dimensions=3, null=True, blank=True)

    class GraphMeta:
        vertex_label = "Paper"
        properties = ["title", "year"]

    class Meta:
        app_label = "testapp"

    def __str__(self):
        return self.title


class Cites(Edge):
    source = models.ForeignKey(
        Paper, on_delete=models.CASCADE, related_name="citations_out"
    )
    target = models.ForeignKey(
        Paper, on_delete=models.CASCADE, related_name="citations_in"
    )
    weight = models.FloatField(default=1.0)

    class EdgeMeta:
        edge_label = "CITES"
        properties = ["weight"]

    class Meta:
        app_label = "testapp"


class AuthoredBy(Edge):
    source = models.ForeignKey(
        Paper, on_delete=models.CASCADE, related_name="authorships"
    )
    target = models.ForeignKey(
        Author, on_delete=models.CASCADE, related_name="papers"
    )

    class EdgeMeta:
        edge_label = "AUTHORED_BY"

    class Meta:
        app_label = "testapp"
