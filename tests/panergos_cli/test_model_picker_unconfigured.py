"""Behavior of unconfigured providers in the classic ``/model`` picker."""

from types import SimpleNamespace

from cli import PanergosCLI
from panergos_cli.cli_model_switch_mixin import _show_model_picker


def test_model_picker_requests_unconfigured_catalog(monkeypatch):
    providers = [{"slug": "gemini", "name": "Google AI Studio", "authenticated": False}]
    captured = {}

    def build(_ctx, **kwargs):
        captured.update(kwargs)
        return {"providers": providers}

    monkeypatch.setattr("panergos_cli.inventory.build_models_payload", build)
    monkeypatch.setattr("panergos_cli.providers.get_label", lambda value: value)
    cli = SimpleNamespace(
        model="current-model", provider="openrouter",
        _open_model_picker=lambda rows, *_args, **_kwargs: captured.setdefault("rows", rows),
    )

    _show_model_picker(
        cli, SimpleNamespace(user_providers={}, custom_providers=[]), force_refresh=False,
    )

    assert captured["include_unconfigured"] is True
    assert captured["picker_hints"] is True
    assert captured["rows"] == providers


def test_unconfigured_provider_is_connect_only(monkeypatch):
    cli = object.__new__(PanergosCLI)
    cli._model_picker_state = {
        "stage": "provider",
        "providers": [
            {
                "slug": "openrouter",
                "name": "OpenRouter",
                "models": ["ready-model"],
                "total_models": 1,
                "authenticated": True,
            },
            {
                "slug": "gemini",
                "name": "Google AI Studio",
                "models": ["must-not-run"],
                "total_models": 1,
                "authenticated": False,
                "auth_type": "api_key",
            },
        ],
        "selected": 0,
        "current_model": "current-model",
        "current_provider": "Current Provider",
        "filter": "studio",
    }

    rendered = {}
    cli._render_scroll_list_panel = lambda _state, _title, _hint, labels, **_kwargs: rendered.setdefault(
        "labels", labels
    )
    assert cli._get_model_picker_display_fragments() == rendered["labels"]
    assert rendered["labels"][0] == "Connect — Google AI Studio (API key)"

    output = []
    monkeypatch.setattr("cli._cprint", output.append)
    monkeypatch.setattr(
        "panergos_cli.models.provider_model_ids",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("must not expose models")),
    )
    cli._close_model_picker = lambda: setattr(cli, "_model_picker_state", None)

    cli._handle_model_picker_selection()

    assert cli._model_picker_state is None
    assert output == ["  Connect Google AI Studio: run `panergos model`, then reopen /model."]


def test_authenticated_provider_keeps_curated_model_fallback(monkeypatch):
    cli = object.__new__(PanergosCLI)
    cli._model_picker_state = {
        "stage": "provider", "selected": 0, "filter": "",
        "providers": [{"slug": "ready", "name": "Ready", "models": [], "authenticated": True}],
    }
    cli._invalidate = lambda **_kwargs: None
    monkeypatch.setattr("panergos_cli.models.provider_model_ids", lambda _slug: ["ready-model"])

    cli._handle_model_picker_selection()

    assert cli._model_picker_state["stage"] == "model"
    assert cli._model_picker_state["model_list"] == ["ready-model"]
