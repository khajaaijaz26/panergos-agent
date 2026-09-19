"""Tests for website/scripts/extract-skills.py helpers.

Covers the two behavioral contracts added when the Skills Hub page gained
per-skill source links and a cleaned-up category sidebar:

1. ``_source_url`` — every community skill must resolve to a clickable
   origin URL (explicit ``extra`` URL preferred, else synthesized from the
   identifier shape). Built-in/optional skills intentionally return "" —
   they have a generated docs page (docsPath) instead.

2. ``_guess_category`` — tags only map to a curated category bucket;
   unknown tags fall to ``uncategorized`` (folded into "Other" later) so the
   sidebar doesn't fill with one-off junk like version strings or brand
   names.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
EXTRACT = REPO_ROOT / "website" / "scripts" / "extract-skills.py"


@pytest.fixture(scope="module")
def mod():
    spec = importlib.util.spec_from_file_location("extract_skills", EXTRACT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# --------------------------------------------------------------------------
# _install_command
# --------------------------------------------------------------------------

def test_install_command_uses_primary_cli(mod):
    assert mod._install_command("official", "official/security/1password", "1password") == (
        "panergos skills install official/security/1password"
    )
    assert mod._install_command("clawhub", "example", "Example") == (
        "panergos skills install clawhub/example"
    )


# --------------------------------------------------------------------------
# _source_url
# --------------------------------------------------------------------------

def test_source_url_prefers_explicit_detail_url(mod):
    extra = {"detail_url": "https://skills.sh/owner/repo/skill"}
    assert (
        mod._source_url("skills.sh", "skills-sh/owner/repo/skill", extra)
        == "https://skills.sh/owner/repo/skill"
    )


def test_source_url_prefers_browse_sh_source_url(mod):
    # browse.sh adapter carries its origin under extra["source_url"].
    extra = {"source_url": "https://airbnb.com/host"}
    assert (
        mod._source_url("browse-sh", "browse-sh/airbnb.com/login-abc", extra)
        == "https://airbnb.com/host"
    )


def test_source_url_synthesizes_github_tree_url(mod):
    url = mod._source_url("github", "anthropics/skills/skills/algorithmic-art", {})
    assert url == "https://github.com/anthropics/skills/tree/main/skills/algorithmic-art"


def test_source_url_synthesizes_github_root_when_no_subpath(mod):
    assert mod._source_url("github", "owner/repo", {}) == "https://github.com/owner/repo"


def test_source_url_synthesizes_clawhub(mod):
    # ClawHub URLs require the owner handle; without it we cannot build a
    # valid URL, so the result is "" (better than a broken 404 link).
    assert mod._source_url("clawhub", "go-music-skill", {}) == ""


def test_source_url_synthesizes_clawhub_strips_prefix(mod):
    # identifier may arrive already prefixed; we must not double-prefix.
    assert (
        mod._source_url("clawhub", "clawhub/go-music-skill", {})
        == ""
    )


def test_source_url_synthesizes_clawhub_with_owner(mod):
    # When the owner handle is available in extra, the URL includes it.
    assert (
        mod._source_url("clawhub", "go-music-skill", {"owner": "somepublisher"})
        == "https://clawhub.ai/somepublisher/skills/go-music-skill"
    )


def test_source_url_synthesizes_clawhub_with_owner_strips_prefix(mod):
    # Owner + prefixed identifier: prefix is stripped, owner is used.
    assert (
        mod._source_url("clawhub", "clawhub/go-music-skill", {"owner": "somepublisher"})
        == "https://clawhub.ai/somepublisher/skills/go-music-skill"
    )


def test_source_url_synthesizes_lobehub(mod):
    assert mod._source_url("lobehub", "lobehub/chinese-paper", {}) == "https://lobehub.com/agent/chinese-paper"


def test_source_url_empty_for_unknown_source_without_identifier(mod):
    assert mod._source_url("mystery", "", {}) == ""


# --------------------------------------------------------------------------
# _guess_category
# --------------------------------------------------------------------------

def test_guess_category_maps_known_tag(mod):
    assert mod._guess_category(["security"]) == "security"
    assert mod._guess_category(["machine-learning"]) == "mlops"
    assert mod._guess_category(["crypto"]) == "blockchain"


def test_guess_category_accepts_literal_curated_key(mod):
    # A skill tagged literally with a curated category key should route there.
    assert mod._guess_category(["devops"]) == "devops"


def test_guess_category_rejects_junk_tag(mod):
    # This is the whole point: version strings / brand names must NOT become
    # their own sidebar category. They land in "uncategorized" → "Other".
    assert mod._guess_category(["0.10.7 Dev"]) == "uncategorized"
    assert mod._guess_category(["Doramagic Crystal"]) == "uncategorized"
    assert mod._guess_category(["Ap2"]) == "uncategorized"


def test_guess_category_empty_tags(mod):
    assert mod._guess_category([]) == "uncategorized"


def test_guess_category_skips_first_junk_tag_for_later_known_tag(mod):
    # First tag is junk, second is curated — we should still find the curated one.
    assert mod._guess_category(["Some Brand", "security"]) == "security"


def test_local_only_main_does_not_require_generated_index(mod, tmp_path, monkeypatch):
    output = tmp_path / "skills.json"
    meta_output = tmp_path / "skills-meta.json"
    monkeypatch.setattr(mod, "OUTPUT", str(output))
    monkeypatch.setattr(mod, "META_OUTPUT", str(meta_output))
    monkeypatch.setattr(mod, "extract_local_skills", lambda: [])
    monkeypatch.setattr(
        mod,
        "extract_unified_index_skills",
        lambda: pytest.fail("local-only validation must not read the generated index"),
    )

    mod.main(["--local-only"])

    assert json.loads(output.read_text(encoding="utf-8")) == []
    assert json.loads(meta_output.read_text(encoding="utf-8"))["externalSource"] == (
        "local-only validation"
    )


def test_missing_unified_index_remains_fatal_by_default(mod, tmp_path, monkeypatch):
    monkeypatch.setattr(mod, "OUTPUT", str(tmp_path / "skills.json"))
    monkeypatch.setattr(mod, "META_OUTPUT", str(tmp_path / "skills-meta.json"))
    monkeypatch.setattr(mod, "extract_local_skills", lambda: [])
    monkeypatch.setattr(mod, "extract_unified_index_skills", lambda: (None, None))

    with pytest.raises(SystemExit, match="Unified skills index not found"):
        mod.main([])
