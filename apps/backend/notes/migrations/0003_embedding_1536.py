"""Bump the note embedding dim from 384 → 1536 for OpenAI text-embedding-3-small.

pgvector indexes are type-checked against the column's declared dimension, so
we have to drop the HNSW index, null legacy values, alter the column, and
recreate the index. Existing notes lose their old embeddings — they'll be
re-embedded on next save (or via a one-off `manage.py reembed_all` if we add
that later).
"""
from django.db import migrations, models

from agave.migrations import CreateVectorIndex
from agave.models.fields import VectorField


def _clear_legacy_embeddings(apps, schema_editor):
    Note = apps.get_model("notes", "Note")
    Note.objects.update(embedding=None, embedding_status="pending", embedding_error="")


def _noop(apps, schema_editor):
    # Reverse = no-op: we don't have the old vectors to put back.
    pass


# Must match agave.migrations._operations.CreateVectorIndex._get_index_name
# for the 0002 migration (app_label="notes", model_name="note", field_name="embedding", index_type="hnsw").
LEGACY_INDEX_NAME = "idx_notes_note_embedding_hnsw"


class Migration(migrations.Migration):

    dependencies = [
        ("notes", "0002_agave_graph"),
    ]

    operations = [
        # Add status fields first so _clear_legacy_embeddings can reset them.
        migrations.AddField(
            model_name="note",
            name="embedding_status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("processing", "Processing"),
                    ("ready", "Ready"),
                    ("failed", "Failed"),
                ],
                db_index=True,
                default="pending",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="note",
            name="embedding_error",
            field=models.TextField(blank=True, default=""),
        ),
        # Drop the HNSW index by its deterministic name (agave's CreateVectorIndex
        # uses `idx_{app_label}_{model}_{field}_{index_type}`).
        migrations.RunSQL(
            sql=f"DROP INDEX IF EXISTS {LEGACY_INDEX_NAME}",
            reverse_sql=migrations.RunSQL.noop,
        ),
        # Null legacy 384-dim vectors so the column can be altered cleanly.
        migrations.RunPython(_clear_legacy_embeddings, reverse_code=_noop),
        # Column dim bump.
        migrations.AlterField(
            model_name="note",
            name="embedding",
            field=VectorField(blank=True, dimensions=1536, null=True),
        ),
        # Recreate the HNSW index at the new dim.
        CreateVectorIndex(
            model_name="note",
            field_name="embedding",
            index_type="hnsw",
            distance_fn="cosine",
            m=16,
            ef_construction=200,
        ),
    ]
