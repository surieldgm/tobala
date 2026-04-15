"""Telemetry wrapper for LLM provider calls.

Every call to an embedding or LLM provider we care about is wrapped with
:func:`log_llm_call` so an ``LLMInvocation`` row lands in the DB. The admin
view then groups them by ``task`` with p50/p95 latency and total spend so
the user can tell at a glance where the bills are coming from.

The wrapper is forgiving: a DB failure during telemetry never masks the
original return value (or exception). We log but swallow — missing a single
metric row is strictly better than failing the pipeline step it wrapped.
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from functools import wraps
from typing import Any, Callable, TypeVar

from .models import LLMInvocation
from .providers.base import LLMResponse, ProviderError

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])


# Outputs over this size are truncated before hitting the DB — we keep an
# ellipsis marker so the admin can tell when the row is a shortened view.
_MAX_OUTPUT_CHARS = 2048


def _hash_prompt(system: str, user: str) -> str:
    h = hashlib.sha1()
    h.update((system or "").encode("utf-8"))
    h.update(b"\x1e")  # ASCII record separator between parts
    h.update((user or "").encode("utf-8"))
    return h.hexdigest()


def _serialize_output(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, (dict, list)):
        try:
            s = json.dumps(content, ensure_ascii=False, sort_keys=True)
        except (TypeError, ValueError):
            s = str(content)
    else:
        s = str(content)
    if len(s) > _MAX_OUTPUT_CHARS:
        s = s[:_MAX_OUTPUT_CHARS] + "…"
    return s


def _record(**fields: Any) -> None:
    try:
        LLMInvocation.objects.create(**fields)
    except Exception as exc:  # pragma: no cover — defensive
        logger.warning("llm invocation log insert failed: %s", exc)


_TASK_SENTINEL = "__pertask__"


def log_llm_call(task: str, *, user_field: str = "user_id") -> Callable[[F], F]:
    """Decorate a provider method with ``LLMInvocation`` telemetry.

    The wrapped method's first positional argument (``self``) is expected
    to expose ``provider_name`` and ``model`` attributes. Callers can pass
    ``user_id=`` as a kwarg to attribute the call; absent, the row lands
    with ``user=None`` (useful for embedding sanity calls from the shell).

    Pass ``task="__pertask__"`` when the same provider method serves
    multiple task types (e.g. OpenAI's ``complete`` is used for tagging,
    linking, and retrieval). In that case the factory must set
    ``instance._task`` before the call.
    """

    def decorator(fn: F) -> F:
        @wraps(fn)
        def wrapper(self: Any, *args: Any, **kwargs: Any) -> Any:
            actual_task = (
                getattr(self, "_task", "unknown") if task == _TASK_SENTINEL else task
            )
            user_id = kwargs.pop(user_field, None)
            system_prompt = kwargs.get("system", "")
            user_prompt = kwargs.get("user", "") if "user" in kwargs else (
                args[0] if args else ""  # embed(text) — text is args[0]
            )
            start = time.perf_counter()
            error_msg = ""
            output_str = ""
            prompt_tokens = completion_tokens = 0
            latency_ms = 0
            cost_usd = 0.0
            result: Any = None

            try:
                result = fn(self, *args, **kwargs)
            except ProviderError as exc:
                error_msg = str(exc)
                raise
            except Exception as exc:  # pragma: no cover — defensive
                error_msg = repr(exc)
                raise
            finally:
                latency_ms = int((time.perf_counter() - start) * 1000)
                if isinstance(result, LLMResponse):
                    usage = result.usage
                    prompt_tokens = usage.prompt_tokens
                    completion_tokens = usage.completion_tokens
                    cost_usd = usage.cost_usd
                    # Prefer the provider-reported latency when available; it
                    # excludes our Python overhead.
                    if usage.latency_ms:
                        latency_ms = usage.latency_ms
                    output_str = _serialize_output(result.content)
                elif isinstance(result, list):
                    # Embedding result — store dim only, never the vector.
                    output_str = f"<vector dim={len(result)}>"
                else:
                    output_str = _serialize_output(result)

                _record(
                    task=actual_task,
                    provider=getattr(self, "provider_name", "unknown"),
                    model=getattr(self, "model", ""),
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    latency_ms=latency_ms,
                    cost_usd=cost_usd,
                    input_hash=_hash_prompt(system_prompt, str(user_prompt)),
                    output=output_str,
                    error=error_msg,
                    user_id=user_id,
                )

            return result

        return wrapper  # type: ignore[return-value]

    return decorator
