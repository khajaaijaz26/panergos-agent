"""Tests for banner toolset name normalization and skin color usage."""

from unittest.mock import patch

from rich.console import Console

import panergos_cli.banner as banner
import model_tools
import tools.mcp_tool_discovery


def test_default_mark_is_compact_and_uses_all_three_panergos_colours():
    from rich.markup import render

    assert render(banner.PANERGOS_MARK).plain == "━━━╲\n━━━━▶\n━━━╱"
    assert "#FF6B5E" in banner.PANERGOS_MARK
    assert "#F7C453" in banner.PANERGOS_MARK
    assert "#2EE6A6" in banner.PANERGOS_MARK


def test_cprint_falls_back_to_plain_print_when_prompt_toolkit_has_no_console(capsys):
    with patch(
        "prompt_toolkit.print_formatted_text",
        side_effect=RuntimeError("no console screen buffer"),
    ):
        banner.cprint("fallback text")

    assert capsys.readouterr().out == "fallback text\n"








def test_build_welcome_banner_version_falls_back_when_no_tag():
    """Without a resolvable tag, the workstream header is plain text (no hyperlink escape)."""
    import io
    from unittest.mock import patch as _patch
    import panergos_cli.banner as _banner
    import model_tools as _mt
    import tools.mcp_tool as _mcp
    from tools import mcp_tool_discovery as _mcp_discovery

    _banner._latest_release_cache = None
    buf = io.StringIO()
    with (
        _patch.object(_mt, "check_tool_availability", return_value=(["web"], [])),
        _patch.object(_banner, "get_available_skills", return_value={}),
        _patch.object(_banner, "get_update_result", return_value=None),
        _patch.object(_mcp_discovery, "get_mcp_status", return_value=[]),
        _patch.object(_banner, "get_latest_release_tag", return_value=None),
    ):
        console = Console(file=buf, force_terminal=True, color_system="truecolor", width=160)
        _banner.build_welcome_banner(
            console=console, model="x", cwd="/tmp",
            session_id="abc123",
            tools=[{"function": {"name": "read_file"}}],
            get_toolset_for_tool=lambda n: "file",
        )

    raw = buf.getvalue()
    assert "Panergos Agent v" in raw, "Version label missing from workstream header"
    assert "\x1b]8;" not in raw, "OSC-8 hyperlink should not be emitted without a tag"


def test_default_banner_is_a_compact_continuity_lane():
    import io

    buf = io.StringIO()
    with (
        patch.object(banner, "get_available_skills", return_value={"work": ["plan", "ship"]}),
        patch.object(banner, "_mcp_configured", return_value=False),
        patch.object(banner, "get_update_result", return_value=None),
        patch.object(banner, "get_latest_release_tag", return_value=None),
    ):
        console = Console(file=buf, force_terminal=False, color_system=None, width=100)
        banner.build_welcome_banner(
            console=console,
            model="provider/fast-model",
            provider="provider",
            cwd="/tmp/project",
            session_id="abc123",
            tools=[{"function": {"name": "read_file"}}],
        )

    output = buf.getvalue()
    assert "PANERGOS" in output and "WORK CONTINUITY" in output
    assert "context stays · work moves" in output
    assert "MODEL" in output and "ROUTE" in output and "WORKSPACE" in output and "MEMORY" in output
    assert all(f"{n:02d} /" in output for n in range(1, 5))
    assert "1 tool · 2 skills · 0 MCP live" in output
    assert all(command in output for command in ("/model", "/resume", "/tools", "/skills", "/help"))
    assert "Available Tools" not in output
    assert "Available Skills" not in output
    assert "██████" not in output
    assert "╭" not in output and "╮" not in output






def test_build_welcome_banner_non_moa_unchanged(tmp_path, monkeypatch):
    """A normal provider still renders the bare model slug, no MoA prefix."""
    monkeypatch.setenv("PANERGOS_HOME", str(tmp_path / ".panergos"))
    (tmp_path / ".panergos").mkdir()

    with (
        patch.object(model_tools, "check_tool_availability", return_value=([], [])),
        patch.object(banner, "get_available_skills", return_value={}),
        patch.object(banner, "get_update_result", return_value=None),
        patch.object(tools.mcp_tool_discovery, "get_mcp_status", return_value=[]),
    ):
        console = Console(record=True, force_terminal=False, color_system=None, width=160)
        banner.build_welcome_banner(
            console=console,
            model="anthropic/claude-opus-4.8",
            cwd="/tmp/project",
            tools=[],
            enabled_toolsets=[],
            provider="openrouter",
        )

    out = console.export_text()
    assert "claude-opus-4.8" in out
    assert "MoA:" not in out


def test_build_welcome_banner_does_not_center_pad_hero_art():
    """A braille hero relies on its own U+2800 padding for symmetry; Rich centering inserts
    ASCII spaces around the left column and distorts the silhouette (#9879). The hero line
    must start flush at the column start."""
    import io
    from types import SimpleNamespace
    from tools import mcp_tool_discovery as _mcp_discovery

    skin = SimpleNamespace(banner_hero="[green]\u2800X[/]", banner_logo="")
    buf = io.StringIO()
    with (
        patch.object(model_tools, "check_tool_availability", return_value=([], [])),
        patch.object(banner, "get_available_skills", return_value={}),
        patch.object(banner, "get_update_result", return_value=None),
        patch.object(banner, "get_latest_release_tag", return_value=None),
        patch.object(_mcp_discovery, "get_mcp_status", return_value=[]),
        patch.object(banner, "_active_skin", return_value=skin),
    ):
        console = Console(file=buf, force_terminal=False, color_system=None, width=80)
        banner.build_welcome_banner(console=console, model="m", cwd="/tmp", tools=[],
                                    get_toolset_for_tool=lambda _: None)

    hero_line = next(line for line in buf.getvalue().splitlines() if "\u2800X" in line)
    assert hero_line.startswith("\u2800X"), repr(hero_line)
