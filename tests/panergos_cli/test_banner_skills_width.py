"""Tests for the compact banner's skills capability signal."""

import os
from unittest.mock import patch

from rich.console import Console

import panergos_cli.banner as banner


def _build_banner_with_skills(skills_by_category, term_width=160, enabled_toolsets=None):
    with (
        patch.object(banner, "get_available_skills", return_value=skills_by_category),
        patch.object(banner, "_mcp_configured", return_value=False),
        patch.object(banner, "get_update_result", return_value=None),
        patch("shutil.get_terminal_size", return_value=os.terminal_size((term_width, 50))),
    ):
        console = Console(
            record=True, force_terminal=False, color_system=None, width=term_width
        )
        banner.build_welcome_banner(
            console=console,
            model="anthropic/test-model",
            cwd="/tmp/project",
            tools=[],
            enabled_toolsets=enabled_toolsets,
        )
        return console.export_text()


def test_banner_reports_skill_count_without_expanding_the_catalog():
    skills = {"research": [f"skill-{i:02d}" for i in range(15)]}
    text = _build_banner_with_skills(skills, term_width=200)

    assert "15 skills" in text
    assert "skill-00" not in text
    assert "Available Skills" not in text


def test_disabled_skills_toolset_is_not_advertised_as_reachable():
    skills = {"security": ["auth", "vault"]}
    text = _build_banner_with_skills(skills, term_width=80, enabled_toolsets=["file"])

    assert "0 skills" in text
    assert "auth" not in text
    assert "vault" not in text
