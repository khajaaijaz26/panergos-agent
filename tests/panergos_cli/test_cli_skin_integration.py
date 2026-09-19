from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from cli import PanergosCLI, _build_compact_banner, _rich_text_from_ansi
from panergos_cli.skin_engine import get_active_skin, set_active_skin


def _make_cli_stub():
    cli = PanergosCLI.__new__(PanergosCLI)
    cli._sudo_state = None
    cli._secret_state = None
    cli._approval_state = None
    cli._clarify_state = None
    cli._clarify_freetext = False
    cli._command_running = False
    cli._agent_running = False
    cli._voice_recording = False
    cli._voice_processing = False
    cli._voice_mode = False
    cli._command_spinner_frame = lambda: "⟳"
    cli._tui_style_base = {
        "prompt": "#fff",
        "input-area": "#fff",
        "input-rule": "#aaa",
        "prompt-working": "#888 italic",
    }
    cli._app = SimpleNamespace(style=None)
    cli._invalidate = MagicMock()
    return cli


class TestCliSkinPromptIntegration:

    def test_crimson_prompt_fragments_keep_panergos_symbol(self):
        cli = _make_cli_stub()

        set_active_skin("crimson")
        assert cli._get_tui_prompt_fragments() == [("class:prompt", "❯ ")]

    def test_secret_prompt_fragments_preserve_secret_state(self):
        cli = _make_cli_stub()
        cli._secret_state = {"response_queue": object()}

        set_active_skin("crimson")
        assert cli._get_tui_prompt_fragments() == [("class:sudo-prompt", "🔑 ❯ ")]


    def test_narrow_terminals_compact_voice_recording_prompt_fragments(self):
        cli = _make_cli_stub()
        cli._voice_recording = True
        cli._voice_recorder = SimpleNamespace(current_rms=3000)

        with patch.object(PanergosCLI, "_get_tui_terminal_width", return_value=50):
            frags = cli._get_tui_prompt_fragments()

        assert frags[0][0] == "class:voice-recording"
        assert frags[0][1].startswith("●")
        assert "❯" not in frags[0][1]



    def test_build_tui_style_dict_uses_skin_overrides(self):
        cli = _make_cli_stub()

        set_active_skin("crimson")
        skin = get_active_skin()
        style_dict = cli._build_tui_style_dict()

        assert style_dict["prompt"] == skin.get_color("prompt")
        assert style_dict["input-rule"] == skin.get_color("input_rule")
        assert style_dict["prompt-working"] == f"{skin.get_color('banner_dim')} italic"
        assert style_dict["status-bar"] == (
            f"bg:{skin.get_color('status_bar_bg')} {skin.get_color('status_bar_text')}"
        )
        assert style_dict["approval-title"] == f"{skin.get_color('ui_warn')} bold"

    def test_apply_tui_skin_style_updates_running_app(self):
        cli = _make_cli_stub()

        set_active_skin("crimson")
        assert cli._apply_tui_skin_style() is True
        assert cli._app.style is not None
        cli._invalidate.assert_called_once_with(min_interval=0.0)

    def test_handle_skin_command_refreshes_live_tui(self, capsys):
        cli = _make_cli_stub()

        with patch("cli.save_config_value", return_value=True) as save:
            cli._handle_skin_command("/skin ares")

        output = capsys.readouterr().out
        assert "Skin set to: crimson (saved)" in output
        assert "Prompt + TUI colors updated." in output
        assert cli._app.style is not None
        save.assert_called_once_with("display.skin", "crimson")


class TestCompactBannerSkinIntegration:

    def test_default_compact_banner_uses_panergos_brand(self):
        set_active_skin("default")

        with patch("cli.shutil.get_terminal_size", return_value=SimpleNamespace(columns=90)), \
             patch.dict(_build_compact_banner.__globals__, {"format_banner_version_label": lambda: "Panergos Agent v0.1.0 (test)"}):
            banner = _build_compact_banner()

        assert "PANERGOS AGENT" in banner
        assert "example PANERGOS" not in banner



    def test_tide_compact_banner_uses_skin_colors(self):
        set_active_skin("tide")
        skin = get_active_skin()

        with patch("cli.shutil.get_terminal_size", return_value=SimpleNamespace(columns=90)), \
             patch.dict(_build_compact_banner.__globals__, {"format_banner_version_label": lambda: "Panergos Agent v0.1.0 (test)"}):
            banner = _build_compact_banner()

        assert skin.get_color("banner_border") in banner
        assert skin.get_color("banner_title") in banner
        assert skin.get_color("banner_dim") in banner



class TestAnsiRichTextHelper:
    def test_preserves_literal_brackets(self):
        text = _rich_text_from_ansi("[notatag] literal")
        assert text.plain == "[notatag] literal"

    def test_strips_ansi_but_keeps_plain_text(self):
        text = _rich_text_from_ansi("\x1b[31mred\x1b[0m")
        assert text.plain == "red"
