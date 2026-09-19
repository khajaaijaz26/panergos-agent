"""Invariants for scripts/build_skills_index.py's health-check guard.

Regression context (June 2026): a GitHub API rate limit zeroed every
api.github.com-backed source (github / well-known) at
once during the docs deploy crawl. The build's health check fired and exited
non-zero — but it had ALREADY written the degenerate index to disk, and
deploy-site.yml swallowed the exit code with ``|| echo non-fatal``. The
partial index (missing the OpenAI/Anthropic/HuggingFace/NVIDIA tabs) shipped
to the live Skills Hub.

These tests pin the contracts that prevent a recurrence:
  1. A degenerate crawl exits non-zero AND does NOT write the output file
     (so extract-skills.py falls back instead of reading a broken index).
  2. A healthy crawl exits zero AND writes the file with every source present.
  3. A bounded ClawHub refresh retains the prior full snapshot; without one,
     only a completed bootstrap crawl can publish.
"""

import json
import os
import sys
import types

import pytest

import scripts.build_skills_index as build_mod


def _meta(name, src):
    return build_mod.SkillMeta(
        name=name, description="d", source=src,
        identifier=f"{src}/{name}", trust_level="community",
    )


class _FakeSource:
    def __init__(self, src, n, rate_limited=False, stop_reason=None):
        self._src = src
        self._n = n
        self.is_rate_limited = rate_limited
        self._stop_reason = stop_reason

    def search(self, query, limit=10):
        count = min(self._n, limit) if limit > 0 else self._n
        if self._src == "clawhub":
            self.catalog_walk_complete = self._stop_reason is None and count == self._n
            self.catalog_walk_stop_reason = (
                self._stop_reason
                or (None if self.catalog_walk_complete else "item_limit")
            )
        return [_meta(f"{self._src}-{i}", self._src) for i in range(count)]

    def enrich_owners(self, skills, max_workers=30, budget_seconds=None):
        # No-op: fake source doesn't need owner enrichment.
        return 0


def _install_fake_sources(monkeypatch, *, github_count,
                          well_known_count=10, github_rate_limited=False,
                          clawhub_count=69000, clawhub_stop_reason=None):
    monkeypatch.setattr(build_mod, "SkillsShSource", lambda auth: _FakeSource("skills.sh", 15000))
    monkeypatch.setattr(build_mod, "OptionalSkillSource", lambda: _FakeSource("official", 95))
    monkeypatch.setattr(build_mod, "WellKnownSkillSource", lambda: _FakeSource("well-known", well_known_count))
    monkeypatch.setattr(
        build_mod, "GitHubSource",
        lambda auth: _FakeSource("github", github_count, rate_limited=github_rate_limited),
    )
    monkeypatch.setattr(
        build_mod,
        "ClawHubSource",
        lambda: _FakeSource("clawhub", clawhub_count, stop_reason=clawhub_stop_reason),
    )
    monkeypatch.setattr(build_mod, "LobeHubSource", lambda: _FakeSource("lobehub", 500))
    monkeypatch.setattr(build_mod, "BrowseShSource", lambda: _FakeSource("browse-sh", 380))
    monkeypatch.setattr(
        build_mod, "crawl_skills_sh",
        lambda source: [build_mod._meta_to_dict(m) for m in source.search("", 0)],
    )
    monkeypatch.setattr(
        build_mod,
        "batch_resolve_paths",
        lambda skills, auth: pytest.fail("bulk GitHub path resolution must stay off the bootstrap path"),
    )
    monkeypatch.setattr(
        build_mod, "GitHubAuth",
        lambda: types.SimpleNamespace(auth_method=lambda: "token"),
    )


def test_degenerate_crawl_exits_nonzero_and_writes_no_file(tmp_path, monkeypatch):
    """A collapsed GitHub crawl must fail loud and leave OUTPUT_PATH unwritten."""
    out = tmp_path / "skills-index.json"
    monkeypatch.setattr(build_mod, "OUTPUT_PATH", str(out))
    _install_fake_sources(monkeypatch, github_count=0,
                          well_known_count=0, github_rate_limited=True)

    with pytest.raises(SystemExit) as exc:
        build_mod.main()

    assert exc.value.code != 0
    # The degenerate index must NOT have been written — extract-skills.py
    # relies on the file's absence to fall back instead of reading garbage.
    assert not out.exists()


def test_healthy_crawl_writes_index_with_all_sources(tmp_path, monkeypatch):
    out = tmp_path / "skills-index.json"
    monkeypatch.setattr(build_mod, "OUTPUT_PATH", str(out))
    _install_fake_sources(monkeypatch, github_count=200)

    build_mod.main()  # exit 0 (no SystemExit)

    assert out.exists()
    data = json.loads(out.read_text())
    sources = {s["source"] for s in data["skills"]}
    # Every GitHub-API-backed source that vanished in the regression is present.
    assert {"github", "well-known"} <= sources
    assert data["skill_count"] == len(data["skills"])
    clawhub_status = data["source_status"]["clawhub"]
    assert clawhub_status["catalog_complete"] is True
    assert clawhub_status["coverage"] == "complete"
    assert clawhub_status["returned"] == clawhub_status["published"]


def test_bounded_clawhub_refresh_preserves_prior_snapshot(tmp_path, monkeypatch):
    out = tmp_path / "skills-index.json"
    monkeypatch.setattr(build_mod, "OUTPUT_PATH", str(out))
    monkeypatch.setattr(build_mod, "CLAWHUB_FULL_FLOOR", 5)
    monkeypatch.setattr(build_mod, "CLAWHUB_INDEX_LIMIT", 3)
    monkeypatch.setattr(build_mod, "CLAWHUB_BOUNDED_FLOOR", 3)
    previous = [
        build_mod._meta_to_dict(_meta(f"clawhub-{i}", "clawhub"))
        for i in range(5)
    ]
    out.write_text(json.dumps({"skills": previous}), encoding="utf-8")
    _install_fake_sources(monkeypatch, github_count=200, clawhub_count=8)

    build_mod.main()

    data = json.loads(out.read_text(encoding="utf-8"))
    published = {
        skill["identifier"]
        for skill in data["skills"]
        if skill["source"] == "clawhub"
    }
    assert {skill["identifier"] for skill in previous} <= published
    assert data["source_status"]["clawhub"] == {
        "catalog_complete": False,
        "coverage": "merged_snapshot",
        "stop_reason": "item_limit",
        "item_limit": 3,
        "returned": 3,
        "published": 5,
        "retained_from_previous": 2,
        "owner_enrichment": "omitted",
    }


def test_time_limited_clawhub_snapshot_is_not_accepted_as_bounded(tmp_path, monkeypatch):
    out = tmp_path / "skills-index.json"
    monkeypatch.setattr(build_mod, "OUTPUT_PATH", str(out))
    _install_fake_sources(
        monkeypatch,
        github_count=200,
        clawhub_count=build_mod.CLAWHUB_FULL_FLOOR + 1,
        clawhub_stop_reason="time_budget",
    )

    with pytest.raises(SystemExit):
        build_mod.main()

    assert not out.exists()


def test_retired_identity_entries_are_excluded_without_substring_false_positives():
    retired_product = "her" + "mes"
    retired_vendor = "no" + "us"

    assert build_mod._contains_legacy_identity({"name": retired_product + " helper"})
    assert build_mod._contains_legacy_identity({"repo": retired_vendor + "research/model"})
    assert not build_mod._contains_legacy_identity({"description": "asynchronous workflows"})
