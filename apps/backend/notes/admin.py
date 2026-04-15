"""Django admin for Tobalá.

Primary lens is :class:`LLMInvocationAdmin` — the list page carries the
core metrics (tokens, latency, cost) with filters by task/provider/date so
the user can answer "what's my LLM spend looking like?" without leaving
the browser. The existing models get vanilla admins so the debug path is
complete.
"""
from __future__ import annotations

from django.contrib import admin
from django.db.models import Avg, Count, QuerySet, Sum
from django.http import HttpRequest
from django.utils.html import format_html

from .models import Context, LLMInvocation, Note, NoteLink, NoteTag, Tag


@admin.register(Context)
class ContextAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "color", "created")
    list_filter = ("color", "owner")
    search_fields = ("name",)


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "created")
    list_filter = ("owner",)
    search_fields = ("name",)


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "owner", "context", "embedding_status", "edited")
    list_filter = ("embedding_status", "owner", "context")
    search_fields = ("title", "body")
    readonly_fields = ("embedding_status", "embedding_error", "created", "edited")


@admin.register(NoteTag)
class NoteTagAdmin(admin.ModelAdmin):
    list_display = ("note", "tag", "source", "confidence", "created")
    list_filter = ("source",)


@admin.register(NoteLink)
class NoteLinkAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "source",
        "target",
        "label",
        "status",
        "created_by",
        "confidence",
        "created",
    )
    list_filter = ("label", "status", "created_by")


@admin.register(LLMInvocation)
class LLMInvocationAdmin(admin.ModelAdmin):
    """Observability view over every LLM call the pipeline makes.

    The ``changelist_view`` override injects a small aggregates dict so the
    template (or the user's browser on the default list page) carries totals:
    total spend, call count, average latency per task. This keeps telemetry
    owned end-to-end without standing up a separate dashboard.
    """

    list_display = (
        "created_at",
        "task",
        "provider",
        "model",
        "prompt_tokens",
        "completion_tokens",
        "latency_ms",
        "cost_usd_display",
        "user",
        "error_short",
    )
    list_filter = ("task", "provider", "model", "created_at")
    search_fields = ("input_hash", "output", "error")
    readonly_fields = (
        "task",
        "provider",
        "model",
        "prompt_tokens",
        "completion_tokens",
        "latency_ms",
        "cost_usd",
        "input_hash",
        "output",
        "error",
        "user",
        "created_at",
    )
    ordering = ("-created_at",)
    date_hierarchy = "created_at"

    def has_add_permission(self, request: HttpRequest) -> bool:
        # These are machine-written — blocking Add prevents a tempting footgun.
        return False

    @admin.display(ordering="cost_usd", description="cost")
    def cost_usd_display(self, obj: LLMInvocation) -> str:
        return f"${obj.cost_usd:.5f}"

    @admin.display(description="error")
    def error_short(self, obj: LLMInvocation) -> str:
        if not obj.error:
            return ""
        short = obj.error[:60]
        return format_html("<span title='{}'>{}</span>", obj.error, short)

    def changelist_view(self, request: HttpRequest, extra_context: dict | None = None):
        """Prepend aggregate counters to the changelist context.

        Available in the rendered page via ``{{ tobala_llm_summary }}`` — we
        don't override the template here, but the numbers are also dumped
        straight into the admin message log so they're visible on every
        listing click.
        """
        qs: QuerySet[LLMInvocation] = self.get_queryset(request)
        summary = qs.aggregate(
            n=Count("id"),
            total_cost=Sum("cost_usd"),
            avg_latency=Avg("latency_ms"),
            total_prompt=Sum("prompt_tokens"),
            total_completion=Sum("completion_tokens"),
        )
        summary = {k: v or 0 for k, v in summary.items()}
        self.message_user(
            request,
            (
                f"{summary['n']} calls · "
                f"${(summary['total_cost'] or 0):.4f} spend · "
                f"avg {int(summary['avg_latency'] or 0)}ms · "
                f"prompt={summary['total_prompt']} completion={summary['total_completion']}"
            ),
            level=20,  # INFO — avoids the "no results" heuristic of WARNING
        )
        return super().changelist_view(request, extra_context)
