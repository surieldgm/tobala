"""Add status / created_by / confidence to NoteLink for the R2 auto-linking loop.

New rows default to ``status="confirmed"`` + ``created_by="user"`` so existing
user-created edges keep their semantics without a data-migration pass. LLM
proposals write ``status="proposed"`` + ``created_by="system"`` + a confidence
score; the ProposalsInbox reads exactly those rows.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notes", "0004_contexts_tags"),
    ]

    operations = [
        migrations.AddField(
            model_name="notelink",
            name="status",
            field=models.CharField(
                choices=[
                    ("proposed", "Proposed"),
                    ("confirmed", "Confirmed"),
                    ("rejected", "Rejected"),
                ],
                db_index=True,
                default="confirmed",
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="notelink",
            name="created_by",
            field=models.CharField(
                choices=[("user", "User"), ("system", "System")],
                default="user",
                max_length=8,
            ),
        ),
        migrations.AddField(
            model_name="notelink",
            name="confidence",
            field=models.FloatField(blank=True, null=True),
        ),
    ]
