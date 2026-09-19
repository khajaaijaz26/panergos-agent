"""Focused contracts for the digital-marketing optional skill."""

import re
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
SKILL = REPO / "optional-skills" / "productivity" / "digital-marketing" / "SKILL.md"


def _frontmatter_and_body():
    content = SKILL.read_text(encoding="utf-8")
    match = re.search(r"\n---\s*\n", content[3:])
    assert content.startswith("---") and match
    return yaml.safe_load(content[3 : match.start() + 3]), content[match.end() + 3 :]


def test_campaign_flow_requires_approval_before_publish_and_readback():
    frontmatter, body = _frontmatter_and_body()
    assert frontmatter["name"] == "digital-marketing"
    assert len(frontmatter["description"]) <= 60
    stages = [
        "### 5. Produce channel-ready assets",
        "### 6. Review brand, facts, rights, and risk",
        "### 7. Approve the exact execution batch",
        "### 8. Publish through the connected route",
        "### 9. Read back and prove publication",
        "### 10. Measure and improve",
    ]
    positions = [body.index(stage) for stage in stages]
    assert positions == sorted(positions)


def test_unsupported_channels_are_never_claimed_as_published():
    _, body = _frontmatter_and_body()
    assert "mark it `handed_off`, not `published`" in body
    assert "provider-read-back evidence" in body
    assert "never ask for a password, token, or recovery code in chat" in body
    assert "A connected account is not proof that a campaign is approved" in body
