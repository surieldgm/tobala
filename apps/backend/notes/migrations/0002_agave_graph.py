"""Create the AGE graph, vertex/edge labels, and HNSW vector index for notes."""
from django.db import migrations

from agave.migrations import (
    CreateEdgeLabel,
    CreateGraph,
    CreateVectorIndex,
    CreateVertexLabel,
)

GRAPH_NAME = "tobala"


class Migration(migrations.Migration):

    dependencies = [
        ("notes", "0001_initial"),
    ]

    operations = [
        CreateGraph(GRAPH_NAME),
        CreateVertexLabel(GRAPH_NAME, "Note"),
        CreateEdgeLabel(GRAPH_NAME, "REFERENCES", source_label="Note", target_label="Note"),
        CreateEdgeLabel(GRAPH_NAME, "SUPPORTS", source_label="Note", target_label="Note"),
        CreateEdgeLabel(GRAPH_NAME, "CONTRADICTS", source_label="Note", target_label="Note"),
        CreateEdgeLabel(GRAPH_NAME, "EXTENDS", source_label="Note", target_label="Note"),
        CreateEdgeLabel(GRAPH_NAME, "INSPIRES", source_label="Note", target_label="Note"),
        CreateVectorIndex(
            model_name="note",
            field_name="embedding",
            index_type="hnsw",
            distance_fn="cosine",
            m=16,
            ef_construction=200,
        ),
    ]
