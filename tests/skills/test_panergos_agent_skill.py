"""The `panergos-agent` skill is Panergos' self-knowledge.

`website/` is never packaged, so an installed Panergos has no local copy of the
user guide; skills ARE synced into `$PANERGOS_HOME/skills/`. The skill therefore
does not try to restate the product — it routes to the published `llms.txt`,
which is generated from the docs tree on every build and so can never be behind
the feature set. These tests keep that routing honest: the index has to be where
the skill says it is, and every reference has to be reachable, otherwise a
shipped feature is invisible and the agent answers "Panergos can't do that."
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SKILL_DIR = REPO / "skills" / "autonomous-ai-agents" / "panergos-agent"
SKILL_MD = SKILL_DIR / "SKILL.md"
GENERATOR = REPO / "website" / "scripts" / "generate-llms-txt.py"
PANERGOS_ROUTED_FILES = tuple(
    sorted(
        path
        for root in (SKILL_DIR / "references", SKILL_DIR / "templates")
        for path in root.rglob("*")
        if path.suffix.lower() in {".md", ".yaml", ".yml"}
    )
)


@pytest.fixture(scope="module")
def skill_text() -> str:
    return SKILL_MD.read_text(encoding="utf-8")


def test_every_referenced_file_exists(skill_text):
    """Routing a question to a file that isn't there is a dead end."""
    targets = set(re.findall(r"`((?:references|templates)/[^`]+)`", skill_text))

    assert targets, "the skill's routing table no longer references any files"
    for target in sorted(targets):
        assert (SKILL_DIR / target).exists(), f"SKILL.md routes to missing {target}"


def test_every_reference_is_reachable_from_the_skill(skill_text):
    """An unrouted reference is one the agent will never think to open.

    This is the failure that produced the original complaint: content can exist
    and still be invisible because nothing points at it.
    """
    on_disk = {f"references/{path.name}" for path in (SKILL_DIR / "references").glob("*.md")}
    routed = set(re.findall(r"`(references/[^`]+)`", skill_text))

    assert not (on_disk - routed), (
        f"reference files no reader will ever reach: {sorted(on_disk - routed)} — "
        "add a routing-table row in SKILL.md"
    )


def test_unknown_features_route_to_the_published_index(skill_text):
    """The catch-all is what makes coverage of the whole product possible."""
    assert "/docs/llms.txt" in skill_text
    # web_extract can be disabled; terminal is the fallback.
    assert "curl" in skill_text, "no way to reach the index without web tools"


def test_the_index_is_published_where_the_skill_says_it_is(skill_text):
    """A skill pointing at a URL nobody generates is worse than no routing."""
    spec = importlib.util.spec_from_file_location("generate_llms_txt", GENERATOR)
    assert spec is not None and spec.loader is not None
    gen = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gen)

    assert f"{gen.SITE_BASE}/llms.txt" in skill_text

    index = gen.emit_llms_index()
    assert index.startswith("# Panergos Agent\n")
    install_url = (
        "https://raw.githubusercontent.com/khajaaijaz26/"
        "panergos-agent/main/scripts/install.sh"
    )
    assert install_url in index
    assert "Repo: https://github.com/khajaaijaz26/panergos-agent" in index


def test_public_identity_and_routes_are_panergos_first(skill_text):
    assert re.search(r"^# Panergos Agent$", skill_text, re.MULTILINE)
    assert "`panergos --help`" in skill_text
    assert "https://github.com/khajaaijaz26/panergos-agent" in skill_text
    assert "https://khajaaijaz26.github.io/panergos-agent/docs/" in skill_text
    assert (
        "raw.githubusercontent.com/khajaaijaz26/"
        "panergos-agent/main/scripts/install.sh"
    ) in skill_text
    assert "retired-service.example" not in skill_text


def test_skill_and_storage_names_use_panergos_identity(skill_text):
    assert SKILL_DIR.name == "panergos-agent"
    assert re.search(r"^name: panergos-agent$", skill_text, re.MULTILINE)
    assert "$PANERGOS_HOME" in skill_text
    assert "~/.panergos" in skill_text


def test_routed_public_instructions_are_panergos_first():
    assert PANERGOS_ROUTED_FILES
    for path in PANERGOS_ROUTED_FILES:
        text = path.read_text(encoding="utf-8")
        assert "retired-service.example" not in text, path

    skin = (SKILL_DIR / "templates" / "skin.yaml").read_text(encoding="utf-8")
    assert "agent_name: Panergos Agent" in skin


def test_routed_panergos_identifiers_are_documented():
    routed_text = "\n".join(
        path.read_text(encoding="utf-8") for path in PANERGOS_ROUTED_FILES
    )

    assert "$PANERGOS_HOME" in routed_text
    assert "~/.panergos" in routed_text
    assert "panergos_cli/" in routed_text
    assert "@panergos/plugin-sdk" in routed_text
    assert "panergos://" in routed_text
