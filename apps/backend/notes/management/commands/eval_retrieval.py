"""``python manage.py eval_retrieval``

Runs the retrieval pipeline against the ``eval/golden_questions.yaml`` set
and reports recall@K for each question plus the aggregate. Dumps a CSV to
``eval/results/<timestamp>.csv`` so consecutive runs with different
``--model`` or ``--provider`` values can be diffed.

The command does NOT modify the DB — it reads the configured retrieval
model, runs ``notes.retrieval.answer``, and compares ``cited_note_ids``
against each row's ``expected_note_ids``.
"""
from __future__ import annotations

import csv
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from notes.retrieval import answer


GOLDEN_PATH = Path(settings.BASE_DIR) / "eval" / "golden_questions.yaml"
RESULTS_DIR = Path(settings.BASE_DIR) / "eval" / "results"


def _recall_at_k(expected: set[int], returned: list[int]) -> float:
    if not expected:
        return 0.0
    hit = expected.intersection(returned)
    return len(hit) / len(expected)


class Command(BaseCommand):
    help = "Evaluate retrieval (recall@K) against the golden question set."

    def add_arguments(self, parser):
        parser.add_argument(
            "--model",
            help="Override TOBALA_LLM['retrieval_model'] for this run.",
        )
        parser.add_argument(
            "--provider",
            help="Override TOBALA_LLM['retrieval_provider'] for this run.",
        )
        parser.add_argument(
            "--golden",
            default=str(GOLDEN_PATH),
            help=f"Path to the golden YAML (default: {GOLDEN_PATH}).",
        )
        parser.add_argument(
            "--owner",
            help="Username to run as (overrides the per-row owner).",
        )
        parser.add_argument(
            "--no-csv",
            action="store_true",
            help="Skip writing a CSV results file.",
        )

    def handle(self, *args: Any, **opts: Any) -> None:
        golden_path = Path(opts["golden"])
        if not golden_path.exists():
            raise CommandError(f"golden set not found: {golden_path}")

        # Mutate the runtime config dict — the retrieval module reads it on
        # every call, so this flips the model/provider without a restart.
        if opts.get("model"):
            settings.TOBALA_LLM["retrieval_model"] = opts["model"]
        if opts.get("provider"):
            settings.TOBALA_LLM["retrieval_provider"] = opts["provider"]
        model = settings.TOBALA_LLM.get("retrieval_model", "?")
        provider = settings.TOBALA_LLM.get("retrieval_provider", "?")

        rows = yaml.safe_load(golden_path.read_text()) or []
        if not isinstance(rows, list):
            raise CommandError("golden YAML must be a list")

        User = get_user_model()
        default_owner_name = opts.get("owner")
        fallback_user = (
            User.objects.filter(username=default_owner_name).first()
            if default_owner_name
            else User.objects.order_by("id").first()
        )
        if fallback_user is None:
            raise CommandError("no user found to run retrieval against")

        out_rows = []
        recalls: list[float] = []
        self.stdout.write(
            self.style.HTTP_INFO(
                f"eval_retrieval · provider={provider} model={model} "
                f"questions={len(rows)}"
            )
        )

        for row in rows:
            qid = row.get("id", "?")
            q = row.get("question") or ""
            expected = set(int(i) for i in (row.get("expected_note_ids") or []))
            owner_name = opts.get("owner") or row.get("owner") or ""
            owner = (
                User.objects.filter(username=owner_name).first()
                if owner_name
                else fallback_user
            )
            if owner is None:
                self.stdout.write(
                    self.style.WARNING(f"  [{qid}] skipping — unknown owner {owner_name!r}")
                )
                continue

            t0 = time.perf_counter()
            try:
                payload = answer(owner, q)
            except Exception as exc:  # pragma: no cover — defensive
                self.stdout.write(self.style.ERROR(f"  [{qid}] ERROR: {exc}"))
                out_rows.append(
                    {
                        "id": qid,
                        "question": q,
                        "expected": sorted(expected),
                        "returned": [],
                        "recall": 0.0,
                        "latency_ms": int((time.perf_counter() - t0) * 1000),
                        "error": str(exc),
                    }
                )
                continue
            latency_ms = int((time.perf_counter() - t0) * 1000)
            returned = list(payload.get("cited_note_ids") or [])
            recall = _recall_at_k(expected, returned)
            recalls.append(recall)
            self.stdout.write(
                f"  [{qid}] recall={recall:.2f} latency={latency_ms}ms "
                f"expected={sorted(expected)} cited={returned}"
            )
            out_rows.append(
                {
                    "id": qid,
                    "question": q,
                    "expected": sorted(expected),
                    "returned": returned,
                    "recall": recall,
                    "latency_ms": latency_ms,
                    "error": "",
                }
            )

        avg = sum(recalls) / len(recalls) if recalls else 0.0
        self.stdout.write(
            self.style.SUCCESS(
                f"average recall@cited = {avg:.3f} over {len(recalls)} evaluated"
            )
        )

        if not opts["no_csv"] and out_rows:
            RESULTS_DIR.mkdir(parents=True, exist_ok=True)
            ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            csv_path = RESULTS_DIR / f"retrieval_{provider}_{model}_{ts}.csv"
            with csv_path.open("w", newline="") as fp:
                w = csv.DictWriter(
                    fp,
                    fieldnames=list(out_rows[0].keys()),
                )
                w.writeheader()
                for r in out_rows:
                    w.writerow({**r, "expected": "|".join(str(i) for i in r["expected"]), "returned": "|".join(str(i) for i in r["returned"])})
            self.stdout.write(self.style.HTTP_INFO(f"wrote {csv_path}"))
