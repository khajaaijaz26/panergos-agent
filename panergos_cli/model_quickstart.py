"""Minimal model setup: prefer a ready local runtime, otherwise connect one provider."""

from __future__ import annotations

import os
import re
import sys
from dataclasses import dataclass
from typing import TypeVar


@dataclass(frozen=True)
class LocalRoute:
    name: str
    base_url: str
    models: tuple[str, ...]
    provider: str = "custom"
    key_env: str = ""


@dataclass(frozen=True)
class HardwareInfo:
    backend: str
    ram_bytes: int
    accelerator_bytes: int


def inspect_hardware() -> HardwareInfo:
    """Return the same conservative hardware view used by managed local models."""
    from panergos_cli.local_runtime import binaries, hardware

    ram_total, _ = hardware._ram_bytes()
    nvidia = hardware._nvidia_vram()
    return HardwareInfo(
        backend=binaries.select_backend("nvidia" if nvidia else None),
        ram_bytes=ram_total,
        accelerator_bytes=nvidia[0] if nvidia else 0,
    )


def _is_local(url: str) -> bool:
    from agent.model_metadata import is_local_endpoint

    return is_local_endpoint(url)


def detect_local_routes(timeout: float = 1.0) -> list[LocalRoute]:
    """Find ready managed llama.cpp, Ollama, LM Studio, and llama.cpp routes."""
    from panergos_cli.config import load_config
    from panergos_cli.local_runtime import binaries, bootstrap
    from panergos_cli.local_runtime.detect import detect_server
    from panergos_cli.models import fetch_api_models
    from panergos_cli.models_local import (
        _get_ollama_base_url,
        probe_lmstudio_models,
        probe_ollama_local_models,
    )

    cfg = load_config()
    routes: list[LocalRoute] = []

    if binaries.installed_tags():
        staged = tuple(sorted(bootstrap.staged_model_ids()))
        if staged:
            routes.append(LocalRoute("Panergos managed local", "", staged, provider="llamacpp"))

    ollama_url = _get_ollama_base_url().rstrip("/")
    if _is_local(ollama_url):
        ollama_models = probe_ollama_local_models(ollama_url, timeout=timeout)
        if ollama_models is not None:
            routes.append(LocalRoute("Ollama", ollama_url + "/v1", tuple(ollama_models)))

    model_cfg: dict = {}
    if isinstance(cfg.get("model"), dict):
        model_cfg = cfg["model"]
    lmstudio_url = (
        str(model_cfg.get("base_url") or "").strip()
        if str(model_cfg.get("provider") or "").strip().lower() == "lmstudio"
        else ""
    ) or "http://127.0.0.1:1234/v1"
    if _is_local(lmstudio_url):
        try:
            lmstudio_models = probe_lmstudio_models(
                api_key=os.getenv("LM_API_KEY", ""), base_url=lmstudio_url, timeout=timeout
            )
        except Exception:
            lmstudio_models = None
        if lmstudio_models is not None:
            routes.append(
                LocalRoute(
                    "LM Studio",
                    lmstudio_url,
                    tuple(lmstudio_models),
                    key_env="LM_API_KEY" if os.getenv("LM_API_KEY") else "",
                )
            )

    ports = ((cfg.get("local_runtime") or {}).get("detect_ports") or [])
    hit = detect_server(extra_ports=tuple(int(port) for port in ports))
    if hit and not hit.auth_required:
        models = fetch_api_models("", hit.base_url, timeout=timeout) or []
        routes.append(LocalRoute("llama.cpp", hit.base_url, tuple(models)))

    seen: set[tuple[str, str]] = set()
    unique: list[LocalRoute] = []
    for route in routes:
        identity = (route.provider, route.base_url.rstrip("/").lower())
        if identity not in seen:
            seen.add(identity)
            unique.append(route)
    return unique


def _gib(value: int) -> str:
    return f"{value / (1 << 30):.1f} GiB" if value else "unknown"


def _print_hardware(info: HardwareInfo) -> None:
    accelerator = (
        f", {_gib(info.accelerator_bytes)} accelerator memory"
        if info.accelerator_bytes
        else ""
    )
    print(f"  Hardware: {_gib(info.ram_bytes)} RAM, {info.backend} local backend{accelerator}")
    if info.backend == "cpu":
        print("  CPU-only inference is supported, but larger models can be much slower than cloud or GPU inference.")


_Choice = TypeVar("_Choice")


def _choose(items: list[tuple[str, _Choice]], prompt: str) -> _Choice | None:
    for index, (label, _) in enumerate(items, 1):
        print(f"    {index}. {label}")
    try:
        raw = input(f"  {prompt} [1-{len(items)}]: ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        return None
    if not raw.isdigit() or not 1 <= int(raw) <= len(items):
        return None
    return items[int(raw) - 1][1]


def _current_model() -> tuple[str, str, str]:
    from panergos_cli.config import load_config

    model = load_config().get("model") or {}
    if not isinstance(model, dict):
        return "", str(model or ""), ""
    return (
        str(model.get("provider") or "").strip(),
        str(model.get("default") or "").strip(),
        str(model.get("base_url") or "").strip(),
    )


def _activate_local(route: LocalRoute, model: str) -> None:
    from panergos_cli.model_setup_flows_common import _persist_model

    if route.provider == "llamacpp":
        def enable_runtime(cfg: dict, _model: dict) -> None:
            section = cfg.get("local_runtime")
            if not isinstance(section, dict):
                section = {}
                cfg["local_runtime"] = section
            section["enabled"] = True

        _persist_model(
            model,
            "llamacpp",
            drop_base_url=True,
            drop_api_mode=True,
            finish=enable_runtime,
        )
    else:
        from panergos_cli.main_provider_setup import _save_custom_provider
        from panergos_cli.providers import custom_provider_slug

        _save_custom_provider(
            route.base_url,
            model=model,
            name=route.name,
            api_mode="chat_completions",
            key_env=route.key_env,
        )
        _persist_model(
            model,
            custom_provider_slug(route.name, ""),
            drop_base_url=True,
            drop_api_mode=True,
        )
    print(f"  Ready: {model} via {route.name}")


def _pick_local(routes: list[LocalRoute], requested_model: str, assume_yes: bool) -> bool:
    ready = [(f"{route.name} - {model}", (route, model)) for route in routes for model in route.models]
    if requested_model:
        matches = [pair for _, pair in ready if pair[1] == requested_model]
        if not matches:
            available = ", ".join(model for _, (_, model) in ready) or "none"
            raise RuntimeError(f"local model {requested_model!r} was not detected (available: {available})")
        route, model = matches[0]
    elif len(ready) == 1:
        route, model = ready[0][1]
    elif not ready:
        detected = ", ".join(route.name for route in routes) or "no local runtime"
        raise RuntimeError(
            f"{detected} was detected, but no ready model was found. "
            "Download a model first or open `panergos desktop --local`."
        )
    elif assume_yes:
        provider, current, base_url = _current_model()
        route, model = next(
            (
                pair
                for _, pair in ready
                if pair[1] == current
                and (pair[0].provider == provider or pair[0].base_url.rstrip("/") == base_url.rstrip("/"))
            ),
            ready[0][1],
        )
    elif sys.stdin.isatty():
        selected = _choose(ready, "Use local model")
        if selected is None:
            print("  No change.")
            return True
        route, model = selected
    else:
        raise RuntimeError("multiple local models were detected; pass `--model MODEL` or `--yes`")

    _activate_local(route, model)
    return True


def _anthropic_ready() -> bool:
    from panergos_cli.auth import get_anthropic_key

    if get_anthropic_key():
        return True
    try:
        from agent.anthropic_credentials import is_claude_code_token_valid, read_claude_code_credentials

        credentials = read_claude_code_credentials()
        return bool(credentials and is_claude_code_token_valid(credentials))
    except Exception:
        return False


def _configure_anthropic(requested_model: str, assume_yes: bool) -> bool:
    if not _anthropic_ready():
        if assume_yes or not sys.stdin.isatty():
            raise RuntimeError(
                "Anthropic credentials were not found. Run `panergos model --quick --provider anthropic` "
                "in a terminal to sign in, or set ANTHROPIC_API_KEY."
            )
        from panergos_cli.model_setup_flows import _anthropic_authenticate

        if not _anthropic_authenticate():
            print("  No change.")
            return True

    from panergos_cli.models import get_default_model_for_provider
    from panergos_cli.model_setup_flows_common import _persist_model

    provider, current, _ = _current_model()
    model = requested_model or (current if provider == "anthropic" else "") or get_default_model_for_provider("anthropic")
    if not model:
        raise RuntimeError("no Anthropic model is available; pass `--model MODEL`")
    _persist_model(model, "anthropic", drop_base_url=True, drop_api_mode=True)
    print(f"  Ready: {model} via Anthropic")
    return True


_ENV_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _configure_openai_compatible(args) -> bool:
    base_url = str(getattr(args, "base_url", "") or "").strip()
    if not base_url and sys.stdin.isatty() and not getattr(args, "yes", False):
        base_url = input("  OpenAI-compatible base URL (include /v1): ").strip()
    if not base_url:
        raise RuntimeError("--base-url is required for an OpenAI-compatible endpoint")

    key_env = str(getattr(args, "key_env", "") or "").strip()
    if key_env and not _ENV_NAME.fullmatch(key_env):
        raise RuntimeError("--key-env must be an environment variable name, not a secret value")
    api_key = os.getenv(key_env, "") if key_env else ""
    if key_env and not api_key:
        raise RuntimeError(f"{key_env} is not set")
    from panergos_cli.model_setup_flows_common import _require_safe_authenticated_endpoint

    base_url = _require_safe_authenticated_endpoint(base_url, api_key)

    from panergos_cli.models import fetch_api_models, pick_silent_default_model

    visible = fetch_api_models(
        api_key,
        base_url,
        timeout=3.0,
        api_mode="chat_completions",
    ) or []
    model = str(getattr(args, "model", "") or "").strip()
    if not model and len(visible) == 1:
        model = visible[0]
    elif not model and visible and (getattr(args, "yes", False) or not sys.stdin.isatty()):
        model = pick_silent_default_model(visible, provider="custom")
    elif not model and visible:
        picked = _choose([(item, item) for item in visible], "Use model")
        model = str(picked or "")
    if not model:
        raise RuntimeError("the endpoint exposed no model; pass `--model MODEL`")
    if visible and model not in visible:
        print(f"  Warning: {model!r} was not listed by {base_url}/models; saving the explicit model anyway.")
    elif not visible:
        print("  Warning: the endpoint could not be verified; saving the explicit route.")

    from panergos_cli.main_provider_setup import _auto_provider_name, _save_custom_provider
    from panergos_cli.model_setup_flows_common import _persist_model
    from panergos_cli.providers import custom_provider_slug

    name = _auto_provider_name(base_url)
    _save_custom_provider(
        base_url,
        model=model,
        name=name,
        api_mode="chat_completions",
        key_env=key_env,
    )
    _persist_model(
        model,
        custom_provider_slug(name, ""),
        drop_base_url=True,
        drop_api_mode=True,
    )
    print(f"  Ready: {model} via {name}")
    return True


def run_model_quickstart(args) -> bool:
    """Run ``panergos model --quick``. False asks the caller to open the full picker."""
    mode = str(getattr(args, "quick_provider", "auto") or "auto").lower()
    if getattr(args, "base_url", None) and mode == "auto":
        mode = "openai-compatible"
    if mode == "anthropic":
        return _configure_anthropic(
            str(getattr(args, "model", "") or "").strip(), bool(getattr(args, "yes", False))
        )
    if mode == "openai-compatible":
        return _configure_openai_compatible(args)

    _print_hardware(inspect_hardware())
    routes = detect_local_routes()
    if any(route.models for route in routes):
        return _pick_local(
            routes,
            str(getattr(args, "model", "") or "").strip(),
            bool(getattr(args, "yes", False)),
        )
    if mode == "local":
        return _pick_local(routes, str(getattr(args, "model", "") or "").strip(), False)
    if not sys.stdin.isatty() or getattr(args, "yes", False):
        raise RuntimeError(
            "no ready local model was detected. Use `panergos desktop --local`, "
            "`--provider anthropic`, or `--provider openai-compatible --base-url URL`."
        )

    print("  No ready local model detected. Connect instead:")
    choice = _choose(
        [
            ("Claude / Anthropic", "anthropic"),
            ("OpenAI-compatible endpoint", "openai-compatible"),
            ("Open the full provider picker", "full"),
        ],
        "Choice",
    )
    if choice == "anthropic":
        return _configure_anthropic(str(getattr(args, "model", "") or "").strip(), False)
    if choice == "openai-compatible":
        return _configure_openai_compatible(args)
    return choice is None
