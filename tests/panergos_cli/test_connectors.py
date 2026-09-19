from __future__ import annotations

import argparse
import json
import sys
from types import ModuleType, SimpleNamespace

from gateway.config import GatewayConfig, Platform, PlatformConfig
from panergos_cli.connectors import _connect_account, _connector_rows, _setup_connector
from panergos_cli.subcommands.gateway import build_gateway_parser


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="panergos")
    subparsers = parser.add_subparsers(dest="command")
    build_gateway_parser(
        subparsers,
        cmd_gateway=lambda args: None,
        cmd_proxy=lambda args: None,
        cmd_gateway_enroll=lambda args: None,
    )
    return parser


def test_connect_parser_supports_status_setup_and_account_routes():
    parser = _parser()

    status = parser.parse_args(["connect", "status", "whatsapp-cloud", "--json"])
    assert (status.command, status.connect_action, status.connector, status.json) == (
        "connect", "status", "whatsapp-cloud", True)

    account = parser.parse_args(["connect", "auth", "anthropic", "--type", "oauth"])
    assert (account.connect_action, account.connector, account.auth_type) == (
        "auth", "anthropic", "oauth")


def test_connector_rows_are_complete_enough_to_act_on_and_never_include_secret_values():
    config = GatewayConfig(platforms={
        Platform.TELEGRAM: PlatformConfig(enabled=True, token="top-secret-token"),
    })
    catalog = ({
        "id": "telegram", "name": "Telegram", "required_env": ("TELEGRAM_BOT_TOKEN",),
    }, {
        "id": "signal", "name": "Signal", "required_env": ("SIGNAL_HTTP_URL", "SIGNAL_ACCOUNT"),
    })
    rows = _connector_rows(
        catalog, config, {"platforms": {"telegram": {"state": "connected"}}}, True,
        lambda key: "top-secret-token" if key == "TELEGRAM_BOT_TOKEN" else None,
    )

    assert rows[0] == {
        "id": "telegram", "name": "Telegram", "readiness": "ready", "missing": [],
        "runtime": "connected",
    }
    assert rows[1]["readiness"] == "needs setup"
    assert rows[1]["missing"] == ["SIGNAL_HTTP_URL", "SIGNAL_ACCOUNT"]
    assert "top-secret-token" not in json.dumps(rows)


def test_named_setup_delegates_to_existing_platform_handler(monkeypatch):
    configured: list[dict[str, str]] = []
    gateway = ModuleType("panergos_cli.gateway")
    gateway._all_platforms = lambda: [{"key": "telegram", "label": "Telegram"}]
    gateway._configure_platform = configured.append
    monkeypatch.setitem(sys.modules, "panergos_cli.gateway", gateway)

    _setup_connector("telegram")

    assert configured == [{"key": "telegram", "label": "Telegram"}]


def test_whatsapp_cloud_and_provider_accounts_keep_their_existing_handlers(monkeypatch):
    calls: list[object] = []
    cloud = ModuleType("panergos_cli.setup_whatsapp_cloud")
    cloud.run_whatsapp_cloud_setup = lambda: calls.append("whatsapp_cloud")
    auth = ModuleType("panergos_cli.auth_commands")
    auth.auth_command = calls.append
    monkeypatch.setitem(sys.modules, "panergos_cli.setup_whatsapp_cloud", cloud)
    monkeypatch.setitem(sys.modules, "panergos_cli.auth_commands", auth)

    _setup_connector("whatsapp-cloud")
    _connect_account(SimpleNamespace(
        connector="anthropic", auth_type="oauth", label=None, no_browser=True,
    ))

    assert calls[0] == "whatsapp_cloud"
    account_args = calls[1]
    assert account_args.auth_action == "add"
    assert account_args.provider == "anthropic"
    assert account_args.auth_type == "oauth"
