"""One entry point for messaging connectors and provider accounts."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any, Callable, Iterable


def _normalise_name(value: str | None) -> str:
    return (value or "").strip().lower().replace("-", "_")


def _catalog() -> tuple[dict[str, Any], ...]:
    # The dashboard catalog is already the complete built-in + plugin inventory.
    from panergos_cli.web_server_messaging import _messaging_platform_catalog

    return _messaging_platform_catalog()


def _read_state() -> tuple[Any, dict[str, Any], bool]:
    from gateway.config import load_gateway_config
    from gateway.status import (
        profile_platforms_from_multiplexer,
        read_runtime_status,
        resolve_gateway_liveness,
    )
    from panergos_constants import get_process_panergos_home, profile_name_for_home

    runtime = read_runtime_status() or {}
    liveness = resolve_gateway_liveness(runtime=runtime)
    if liveness.runtime is not None:
        profile = profile_name_for_home(get_process_panergos_home()) or ""
        runtime = {
            **liveness.runtime,
            "platforms": profile_platforms_from_multiplexer(liveness.runtime, profile),
        }
    return load_gateway_config(), runtime, liveness.running


def _connector_rows(
    catalog: Iterable[dict[str, Any]], config: Any, runtime: dict[str, Any], gateway_running: bool,
    env_value: Callable[[str], str | None],
) -> list[dict[str, Any]]:
    """Return a secret-free connector snapshot from the shared catalog and gateway config."""
    from gateway.config import Platform
    from panergos_cli.web_server_messaging import _messaging_requirement_state

    runtime_platforms = runtime.get("platforms") if gateway_running else {}
    runtime_platforms = runtime_platforms if isinstance(runtime_platforms, dict) else {}
    rows: list[dict[str, Any]] = []
    for entry in catalog:
        connector_id = entry["id"]
        try:
            platform = Platform(connector_id)
        except ValueError:
            platform = None
        platform_config = config.platforms.get(platform) if platform is not None else None
        enabled = bool(platform_config and platform_config.enabled)
        try:
            configured = bool(
                platform_config and config._is_platform_connected(platform, platform_config)
            )
        except Exception:
            configured = False

        _, missing = _messaging_requirement_state(entry, env_value)
        if configured:
            missing = []
        if not configured and not missing:
            missing = ["guided setup"]

        runtime_entry = runtime_platforms.get(connector_id, {})
        runtime_state = (
            runtime_entry.get("state") or runtime_entry.get("status")
            if isinstance(runtime_entry, dict) else None
        )
        runtime_state = str(runtime_state).strip().lower() if runtime_state else None
        readiness = "ready" if enabled and configured else "disabled" if configured else "needs setup"
        rows.append({
            "id": connector_id,
            "name": entry["name"],
            "readiness": readiness,
            "missing": missing,
            "runtime": runtime_state or ("gateway stopped" if not gateway_running else "not started"),
        })
    return rows


def connector_snapshot() -> tuple[list[dict[str, Any]], bool]:
    from panergos_cli.config import get_env_value

    config, runtime, gateway_running = _read_state()
    return _connector_rows(_catalog(), config, runtime, gateway_running, get_env_value), gateway_running


def _select(rows: list[dict[str, Any]], name: str | None) -> list[dict[str, Any]]:
    wanted = _normalise_name(name)
    if not wanted:
        return rows
    selected = [row for row in rows if row["id"] == wanted]
    if not selected:
        available = ", ".join(row["id"] for row in rows)
        raise SystemExit(f"Unknown connector '{name}'. Available: {available}")
    return selected


def _print_rows(rows: list[dict[str, Any]], *, show_runtime: bool, gateway_running: bool) -> None:
    columns = [("CONNECTOR", "name"), ("READINESS", "readiness"), ("MISSING", "missing")]
    if show_runtime:
        columns.append(("RUNTIME", "runtime"))
        print(f"Gateway: {'running' if gateway_running else 'stopped'}")
    rendered = [
        {**row, "missing": ", ".join(row["missing"]) or "-"}
        for row in rows
    ]
    widths = {
        key: max(len(title), *(len(str(row[key])) for row in rendered))
        for title, key in columns
    }
    print("  ".join(title.ljust(widths[key]) for title, key in columns))
    print("  ".join("-" * widths[key] for _, key in columns))
    for row in rendered:
        print("  ".join(str(row[key]).ljust(widths[key]) for _, key in columns))


def _show_connectors(name: str | None, *, show_runtime: bool, as_json: bool) -> None:
    rows, gateway_running = connector_snapshot()
    rows = _select(rows, name)
    if as_json:
        print(json.dumps({"gateway_running": gateway_running, "connectors": rows}, indent=2))
        return
    _print_rows(rows, show_runtime=show_runtime, gateway_running=gateway_running)
    if not name:
        print("\nSet up one: panergos connect <connector>  |  All: panergos connect setup")


def _setup_connector(name: str | None) -> None:
    if not name:
        from panergos_cli.gateway import gateway_setup

        gateway_setup()
        return

    wanted = _normalise_name(name)
    if wanted == "whatsapp_cloud":
        from panergos_cli.setup_whatsapp_cloud import run_whatsapp_cloud_setup

        run_whatsapp_cloud_setup()
        return
    if wanted == "webhook":
        from panergos_cli.setup_platforms import _setup_webhooks

        _setup_webhooks()
        return
    if wanted == "relay":
        print("Relay enrollment uses: panergos gateway enroll --token <token> --connector-url <url>")
        return

    from panergos_cli.gateway import _all_platforms, _configure_platform

    platform = next((item for item in _all_platforms() if item["key"] == wanted), None)
    if platform is None:
        _select([{"id": entry["id"]} for entry in _catalog()], wanted)
        print(f"{wanted} uses configuration fields; inspect them with: panergos connect status {wanted}")
        return
    _configure_platform(platform)


def _connect_account(args: Any) -> None:
    """Route account onboarding through the existing credential-pool handler."""
    from panergos_cli.auth_commands import auth_command

    provider = getattr(args, "connector", None)
    if not provider:
        auth_command(SimpleNamespace(auth_action=""))
        return
    auth_command(SimpleNamespace(
        auth_action="add", provider=provider, auth_type=getattr(args, "auth_type", None),
        label=getattr(args, "label", None), no_browser=getattr(args, "no_browser", False),
        priority=None, api_key=None, timeout=None,
    ))


def connect_command(args: Any) -> None:
    """Dispatch ``panergos connect`` without owning platform or account credentials."""
    action = _normalise_name(getattr(args, "connect_action", None)) or "list"
    connector = getattr(args, "connector", None)
    if action in {"list", "ls"}:
        _show_connectors(connector, show_runtime=False, as_json=bool(getattr(args, "json", False)))
    elif action in {"status", "health"}:
        _show_connectors(connector, show_runtime=True, as_json=bool(getattr(args, "json", False)))
    elif action in {"setup", "add"}:
        _setup_connector(connector)
    elif action in {"auth", "account"}:
        _connect_account(args)
    else:
        # ``panergos connect telegram`` is the shortest setup path.
        _setup_connector(action)
