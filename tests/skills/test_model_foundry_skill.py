"""Focused contract tests for the Model Foundry optional skill."""

import json
import re
import subprocess
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
SKILL = REPO / "optional-skills" / "mlops" / "model-foundry" / "SKILL.md"
SCRIPT = SKILL.parent / "scripts" / "tiny_model_smoke.py"


def _frontmatter_and_body():
    content = SKILL.read_text(encoding="utf-8")
    match = re.search(r"\n---\s*\n", content[3:])
    assert content.startswith("---") and match
    return yaml.safe_load(content[3 : match.start() + 3]), content[match.end() + 3 :]


def test_model_foundry_routes_full_lifecycle():
    frontmatter, body = _frontmatter_and_body()
    assert frontmatter["name"] == "model-foundry"
    assert len(frontmatter["description"]) <= 60
    assert (
        "`data rights -> clean split -> baseline -> smoke run -> budgeted training -> "
        "checkpoints -> held-out evaluation -> safety review -> package -> serve -> "
        "Panergos connection -> monitored rollout`"
    ) in body
    assert "Seconds to minutes on a CPU" in body
    assert "Days to months" in body


def test_tiny_model_smoke_is_deterministic_and_reloadable(tmp_path):
    first = tmp_path / "first"
    second = tmp_path / "second"
    for destination in (first, second):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--output", str(destination), "--seed", "19"],
            check=False,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stderr

    first_model = json.loads((first / "model.json").read_text(encoding="utf-8"))
    first_metrics = json.loads((first / "metrics.json").read_text(encoding="utf-8"))
    assert first_model == json.loads(
        (second / "model.json").read_text(encoding="utf-8")
    )
    assert first_metrics == json.loads(
        (second / "metrics.json").read_text(encoding="utf-8")
    )
    assert first_model["model_type"] == "character_bigram"
    assert first_model["transitions"]
    assert first_metrics["train_pairs"] > first_metrics["validation_pairs"] > 0
    assert first_metrics["validation_perplexity"] > 1
    assert len(first_metrics["sample"]) == 160
