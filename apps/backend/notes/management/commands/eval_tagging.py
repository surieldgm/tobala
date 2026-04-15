"""``python manage.py eval_tagging``

Runs ``notes.tagging.infer_tags`` against the golden tag set and reports
Jaccard overlap + count-drift per row, plus aggregates. Useful when
switching tagging models (``--model gpt-4o-mini`` vs ``--model gpt-4o``)
or experimenting with the prompt.
"""
from __future__ import annotations

import csv
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from notes.models import normalize_tag_name
from notes.tagging import infer_tags


GOLDEN_PATH = Path(settings.BASE_DIR) / "eval" / "golden_tags.yaml"
RESULTS_DIR = Path(settings.BASE_DIR) / "eval" / "results"


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    union = a | b
    if not union:
        return 0.0
    return len(a & b) / len(union)


def _in_range(n: int, lo: int, hi: int) -> int:
    """0 if n is inside [lo, hi]; otherwise the distance to the nearest bound."""
    if n < lo:
        return lo - n
    if n > hi:
        return n - hi
    return 0


class Command(BaseCommand):
    help = "Evaluate the tagging LLM (Jaccard + count-drift) against golden_tags.yaml."

    def add_arguments(self, parser):
        parser.add_argument(
            "--model",
            help="Override TOBALA_LLM['tagging_model'] for this run.",
        )
        parser.add_argument(
            "--provider",
            help="Override TOBALA_LLM['tagging_provider'] for this run.",
        )
        parser.add_argument(
            "--golden",
            default=str(GOLDEN_PATH),
            help=f"Path to the golden YAML (default: {GOLDEN_PATH}).",
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

        if opts.get("model"):
            settings.TOBALA_LLM["tagging_model"] = opts["model"]
        if opts.get("provider"):
            settings.TOBALA_LLM["tagging_provider"] = opts["provider"]

        model = settings.TOBALA_LLM.get("tagging_model", "?")
        provider = settings.TOBALA_LLM.get("tagging_provider", "?")
        tag_min = settings.TOBALA_LLM.get("tag_min", 3)
        tag_max = settings.TOBALA_LLM.get("tag_max", 7)

        rows = yaml.safe_load(golden_path.read_text()) or []
        if not isinstance(rows, list):
            raise CommandError("golden YAML must be a list")

        self.stdout.write(
            self.style.HTTP_INFO(
                f"eval_tagging · provider={provider} model={model} "
                f"samples={len(rows)} bounds=[{tag_min},{tag_max}]"
            )
        )

        out_rows = []
        jaccards: list[float] = []
        drifts: list[int] = []

        for row in rows:
            rid = row.get("id", "?")
            body = row.get("body") or ""
            expected = {normalize_tag_name(t) for t in (row.get("expected_tags") or []) if t}
            try:
                pairs = infer_tags(body)
            except Exception as exc:  # pragma: no cover — defensive
                self.stdout.write(self.style.ERROR(f"  [{rid}] ERROR: {exc}"))
                out_rows.append(
                    {
                        "id": rid,
                        "expected": sorted(expected),
                        "returned": [],
                        "jaccard": 0.0,
                        "count_drift": _in_range(0, tag_min, tag_max),
                        "error": str(exc),
                    }
                )
                continue
            returned = {name for name, _ in pairs}
            j = _jaccard(expected, returned)
            drift = _in_range(len(pairs), tag_min, tag_max)
            jaccards.append(j)
            drifts.append(drift)
            self.stdout.write(
                f"  [{rid}] jaccard={j:.2f} n={len(pairs)} (drift={drift}) "
                f"expected={sorted(expected)} returned={sorted(returned)}"
            )
            out_rows.append(
                {
                    "id": rid,
                    "expected": sorted(expected),
                    "returned": sorted(returned),
                    "jaccard": j,
                    "count_drift": drift,
                    "error": "",
                }
            )

        if jaccards:
            avg_j = sum(jaccards) / len(jaccards)
            avg_d = sum(drifts) / len(drifts)
            self.stdout.write(
                self.style.SUCCESS(
                    f"average jaccard = {avg_j:.3f} · average count-drift = {avg_d:.2f}"
                )
            )
        else:
            self.stdout.write(self.style.WARNING("no rows evaluated"))

        if not opts["no_csv"] and out_rows:
            RESULTS_DIR.mkdir(parents=True, exist_ok=True)
            ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            csv_path = RESULTS_DIR / f"tagging_{provider}_{model}_{ts}.csv"
            with csv_path.open("w", newline="") as fp:
                w = csv.DictWriter(
                    fp,
                    fieldnames=list(out_rows[0].keys()),
                )
                w.writeheader()
                for r in out_rows:
                    w.writerow(
                        {
                            **r,
                            "expected": "|".join(r["expected"]),
                            "returned": "|".join(r["returned"]),
                        }
                    )
            self.stdout.write(self.style.HTTP_INFO(f"wrote {csv_path}"))
