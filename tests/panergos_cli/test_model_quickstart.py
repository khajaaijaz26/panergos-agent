from __future__ import annotations

import argparse
from types import SimpleNamespace

import pytest

from panergos_cli.model_quickstart import HardwareInfo, LocalRoute


@pytest.fixture
def isolated_home(tmp_path, monkeypatch):
    home = tmp_path / ".panergos"
    monkeypatch.setenv("PANERGOS_HOME", str(home))
    return home


def _args(**overrides):
    values = {
        "quick_provider": "auto",
        "base_url": None,
        "model": None,
        "key_env": None,
        "yes": True,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_model_parser_exposes_quickstart_flags():
    from panergos_cli.subcommands.model import build_model_parser

    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command")
    build_model_parser(subparsers, cmd_model=lambda _args: None)

    args = parser.parse_args(
        [
            "model",
            "--quick",
            "--provider",
            "openai-compatible",
            "--base-url",
            "http://127.0.0.1:9000/v1",
            "--model",
            "test-model",
            "--key-env",
            "MODEL_KEY",
            "--yes",
        ]
    )
    assert args.quick is True
    assert args.quick_provider == "openai-compatible"
    assert args.model == "test-model"
    assert args.key_env == "MODEL_KEY"


def test_detection_reuses_all_existing_local_runtime_probes(monkeypatch):
    import panergos_cli.model_quickstart as quick

    monkeypatch.setattr("panergos_cli.config.load_config", lambda: {})
    monkeypatch.setattr("panergos_cli.local_runtime.binaries.installed_tags", lambda: ["tag"])
    monkeypatch.setattr(
        "panergos_cli.local_runtime.bootstrap.staged_model_ids", lambda: {"managed-model"}
    )
    monkeypatch.setattr(quick, "_is_local", lambda _url: True)
    monkeypatch.setattr(
        "panergos_cli.models_local._get_ollama_base_url", lambda: "http://127.0.0.1:11434"
    )
    monkeypatch.setattr(
        "panergos_cli.models_local.probe_ollama_local_models", lambda *args, **kwargs: ["ollama-model"]
    )
    monkeypatch.setattr(
        "panergos_cli.models_local.probe_lmstudio_models", lambda *args, **kwargs: ["lm-model"]
    )
    monkeypatch.setattr(
        "panergos_cli.local_runtime.detect.detect_server",
        lambda **kwargs: SimpleNamespace(
            base_url="http://127.0.0.1:8080/v1", auth_required=False
        ),
    )
    monkeypatch.setattr(
        "panergos_cli.models.fetch_api_models", lambda *args, **kwargs: ["llama-model"]
    )

    routes = quick.detect_local_routes()
    assert [(route.name, route.models) for route in routes] == [
        ("Panergos managed local", ("managed-model",)),
        ("Ollama", ("ollama-model",)),
        ("LM Studio", ("lm-model",)),
        ("llama.cpp", ("llama-model",)),
    ]


def test_quickstart_activates_detected_ollama_model(isolated_home, monkeypatch):
    import panergos_cli.model_quickstart as quick
    from panergos_cli.config import load_config

    monkeypatch.setattr(quick, "inspect_hardware", lambda: HardwareInfo("cpu", 16 << 30, 0))
    monkeypatch.setattr(
        quick,
        "detect_local_routes",
        lambda: [LocalRoute("Ollama", "http://127.0.0.1:11434/v1", ("qwen3:8b",))],
    )

    assert quick.run_model_quickstart(_args(quick_provider="local")) is True
    cfg = load_config()
    assert cfg["model"]["default"] == "qwen3:8b"
    assert cfg["model"]["provider"].startswith("custom:")
    saved = next(item for item in cfg["custom_providers"] if item["name"] == "Ollama")
    assert saved["base_url"] == "http://127.0.0.1:11434/v1"
    assert saved["model"] == "qwen3:8b"


def test_managed_local_activation_enables_runtime(isolated_home, monkeypatch):
    import panergos_cli.model_quickstart as quick
    from panergos_cli.config import load_config

    monkeypatch.setattr(quick, "inspect_hardware", lambda: HardwareInfo("cpu", 16 << 30, 0))
    monkeypatch.setattr(
        quick,
        "detect_local_routes",
        lambda: [LocalRoute("Panergos managed local", "", ("local-model",), provider="llamacpp")],
    )

    quick.run_model_quickstart(_args(quick_provider="local"))
    cfg = load_config()
    assert cfg["model"]["provider"] == "llamacpp"
    assert cfg["model"]["default"] == "local-model"
    assert cfg["local_runtime"]["enabled"] is True


def test_openai_compatible_saves_key_reference_not_secret(isolated_home, monkeypatch):
    import panergos_cli.model_quickstart as quick
    from panergos_cli.config import load_config

    monkeypatch.setenv("PRIVATE_MODEL_KEY", "super-secret-value")
    monkeypatch.setattr(
        "panergos_cli.models.fetch_api_models",
        lambda *args, **kwargs: ["owner/tool-model"],
    )

    quick.run_model_quickstart(
        _args(
            quick_provider="openai-compatible",
            base_url="https://models.example.test/v1",
            model="owner/tool-model",
            key_env="PRIVATE_MODEL_KEY",
        )
    )

    cfg = load_config()
    saved = next(
        item
        for item in cfg["custom_providers"]
        if item["base_url"] == "https://models.example.test/v1"
    )
    assert saved["key_env"] == "PRIVATE_MODEL_KEY"
    assert "api_key" not in saved
    assert "super-secret-value" not in (isolated_home / "config.yaml").read_text(encoding="utf-8")


def test_anthropic_quickstart_uses_existing_credentials_without_prompt(isolated_home, monkeypatch):
    import panergos_cli.model_quickstart as quick
    from panergos_cli.config import load_config

    monkeypatch.setattr(quick, "_anthropic_ready", lambda: True)
    quick.run_model_quickstart(
        _args(quick_provider="anthropic", model="claude-test-model")
    )

    model = load_config()["model"]
    assert model["default"] == "claude-test-model"
    assert model["provider"] == "anthropic"


def test_openai_compatible_rejects_key_over_remote_http(isolated_home, monkeypatch):
    import panergos_cli.model_quickstart as quick

    monkeypatch.setenv("REMOTE_MODEL_KEY", "secret")
    with pytest.raises(RuntimeError, match="must use https"):
        quick.run_model_quickstart(
            _args(
                quick_provider="openai-compatible",
                base_url="http://models.example.test/v1",
                model="model",
                key_env="REMOTE_MODEL_KEY",
            )
        )


@pytest.mark.parametrize(
    "base_url,key_env,message",
    [
        ("models.example.test/v1", "", "absolute http"),
        ("https://user:secret@models.example.test/v1", "", "credentials"),
        ("https://models.example.test/v1", "not-a-name", "environment variable name"),
    ],
)
def test_openai_compatible_rejects_unsafe_inputs(
    isolated_home, monkeypatch, base_url, key_env, message
):
    import panergos_cli.model_quickstart as quick

    with pytest.raises(RuntimeError, match=message):
        quick.run_model_quickstart(
            _args(
                quick_provider="openai-compatible",
                base_url=base_url,
                model="model",
                key_env=key_env,
            )
        )


def test_noninteractive_multiple_local_models_require_explicit_choice(monkeypatch):
    import panergos_cli.model_quickstart as quick

    monkeypatch.setattr(quick.sys.stdin, "isatty", lambda: False)
    routes = [LocalRoute("Ollama", "http://127.0.0.1:11434/v1", ("one", "two"))]
    with pytest.raises(RuntimeError, match="multiple local models"):
        quick._pick_local(routes, "", False)
