"""Replace Note.category (fixed enum) with user-owned Context FK and Tag M2M.

For each existing ``(owner, category)`` pair we create a Context named after
the legacy label and assign every matching note to it. A small seed palette
translates the three legacy categories to nicer color tokens; anything else
defaults to ``ochre`` (the neutral earthy tone).
"""
import re

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


_LEGACY_CATEGORY_TO_CONTEXT = {
    "random": ("Random Thoughts", "ochre"),
    "school": ("School", "sage"),
    "personal": ("Personal", "terracotta"),
}


def _backfill_contexts(apps, schema_editor):
    Note = apps.get_model("notes", "Note")
    Context = apps.get_model("notes", "Context")

    # Collect every (owner_id, category) pair currently in use.
    pairs = set(Note.objects.values_list("owner_id", "category"))
    for owner_id, category in pairs:
        name, color = _LEGACY_CATEGORY_TO_CONTEXT.get(
            category, (category.title() if category else "Unsorted", "ochre")
        )
        ctx, _ = Context.objects.get_or_create(
            owner_id=owner_id,
            name=name,
            defaults={"color": color},
        )
        Note.objects.filter(owner_id=owner_id, category=category).update(
            context_id=ctx.pk
        )


def _unbackfill_contexts(apps, schema_editor):
    # Reverse: null out the FK but leave Context rows — user may have edited
    # them. The category column re-added by the reverse of RemoveField will
    # default to 'random'.
    Note = apps.get_model("notes", "Note")
    Note.objects.all().update(context=None)


class Migration(migrations.Migration):

    dependencies = [
        ("notes", "0003_embedding_1536"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Context",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=40)),
                ("color", models.CharField(default="ochre", max_length=20)),
                ("description", models.TextField(blank=True, default="")),
                ("created", models.DateTimeField(auto_now_add=True)),
                (
                    "owner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="contexts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["name"],
                "unique_together": {("owner", "name")},
            },
        ),
        migrations.CreateModel(
            name="Tag",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(db_index=True, max_length=60)),
                ("created", models.DateTimeField(auto_now_add=True)),
                (
                    "owner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="tags",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["name"],
                "unique_together": {("owner", "name")},
            },
        ),
        migrations.AddField(
            model_name="note",
            name="context",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="notes",
                to="notes.context",
            ),
        ),
        migrations.CreateModel(
            name="NoteTag",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "source",
                    models.CharField(
                        choices=[("user", "User"), ("system", "System")],
                        default="user",
                        max_length=8,
                    ),
                ),
                ("confidence", models.FloatField(blank=True, null=True)),
                ("created", models.DateTimeField(auto_now_add=True)),
                (
                    "note",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="note_tags",
                        to="notes.note",
                    ),
                ),
                (
                    "tag",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="note_tags",
                        to="notes.tag",
                    ),
                ),
            ],
            options={
                "ordering": ["-created"],
                "unique_together": {("note", "tag")},
            },
        ),
        migrations.AddField(
            model_name="note",
            name="tags",
            field=models.ManyToManyField(
                blank=True,
                related_name="notes",
                through="notes.NoteTag",
                to="notes.tag",
            ),
        ),
        # Backfill: seed Context rows from legacy category values and point
        # each Note at the right one.
        migrations.RunPython(_backfill_contexts, reverse_code=_unbackfill_contexts),
        # Now that every note has a Context, drop the legacy column.
        migrations.RemoveField(
            model_name="note",
            name="category",
        ),
    ]
