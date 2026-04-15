# Generated 2026-04-14 — adds tagging_content_hash and linking_content_hash
# so infer_tags / propose_links can skip duplicate LLM calls when content
# hasn't changed since the last successful run (backlog-drain guard).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notes', '0007_note_content_hash'),
    ]

    operations = [
        migrations.AddField(
            model_name='note',
            name='tagging_content_hash',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
        migrations.AddField(
            model_name='note',
            name='linking_content_hash',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
    ]
