from __future__ import annotations

import argparse
import json
import sys
from types import ModuleType, SimpleNamespace

from gateway.config import GatewayConfig, Platform, PlatformConfig
from panergos_cli.connectors import _connect_account, _connector_rows, _read_state, _setup_connector
from panergos_cli.subcommands.gateway import build_gateway_parser
from panergos_cli.web_server_messaging import _build_catalog_entry, _messaging_requirement_state


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


def test_connector_rows_accept_legacy_runtime_status():
    config = GatewayConfig(platforms={
        Platform.TELEGRAM: PlatformConfig(enabled=True, token="configured"),
    })
    rows = _connector_rows(
        ({"id": "telegram", "name": "Telegram", "required_env": ()},),
        config, {"platforms": {"telegram": {"status": "RUNNING"}}}, True,
        lambda _key: None,
    )

    assert rows[0]["runtime"] == "running"


def test_connector_catalog_reports_all_runtime_credentials():
    plugin = SimpleNamespace(required_env=[], label="Test", install_hint="")

    sms = _build_catalog_entry("sms", plugin)
    wecom = _build_catalog_entry("wecom", plugin)

    assert "TWILIO_PHONE_NUMBER" in sms["required_env"]
    assert {"WECOM_BOT_ID", "WECOM_SECRET"} <= set(wecom["required_env"])


def test_connector_requirements_accept_either_google_chat_inbound_mode():
    entry = {
        "required_env": ("GOOGLE_CHAT_SERVICE_ACCOUNT_JSON",),
        "required_env_alternatives": (
            ("GOOGLE_CHAT_HTTP_EVENTS_URL",),
            ("GOOGLE_CHAT_PROJECT_ID", "GOOGLE_CHAT_SUBSCRIPTION_NAME"),
        ),
    }

    auth_only = {"GOOGLE_CHAT_SERVICE_ACCOUNT_JSON": "key"}
    configured, missing = _messaging_requirement_state(entry, auth_only.get)
    assert configured is False
    assert missing == [
        "GOOGLE_CHAT_HTTP_EVENTS_URL or GOOGLE_CHAT_PROJECT_ID + GOOGLE_CHAT_SUBSCRIPTION_NAME"]
    row = _connector_rows(
        ({"id": "google_chat", "name": "Google Chat", **entry},),
        GatewayConfig(), {}, True, auth_only.get,
    )[0]
    assert row["missing"] == missing

    for inbound in (
        {"GOOGLE_CHAT_HTTP_EVENTS_URL": "https://example.invalid/events"},
        {"GOOGLE_CHAT_PROJECT_ID": "project", "GOOGLE_CHAT_SUBSCRIPTION_NAME": "subscription"},
    ):
        configured, missing = _messaging_requirement_state(
            entry, ({"GOOGLE_CHAT_SERVICE_ACCOUNT_JSON": "key"} | inbound).get)
        assert configured is True
        assert missing == []


def test_read_state_projects_platforms_for_profile_served_by_multiplexer(monkeypatch, tmp_path):
    from gateway import config as gateway_config
    from gateway import status as gateway_status

    profile_home = tmp_path / "profiles" / "school"
    profile_home.mkdir(parents=True)
    multiplexer_runtime = {
        "gateway_state": "running",
        "platforms": {
            "school:telegram": {"state": "connected"},
            "other:telegram": {"state": "retrying"},
        },
    }
    expected_config = GatewayConfig()
    monkeypatch.setenv("PANERGOS_HOME", str(profile_home))
    monkeypatch.setattr(gateway_config, "load_gateway_config", lambda: expected_config)
    monkeypatch.setattr(gateway_status, "read_runtime_status", lambda: None)
    monkeypatch.setattr(gateway_status, "get_running_pid_cached", lambda: None)
    monkeypatch.setattr(gateway_status, "get_runtime_status_running_pid", lambda _runtime: None)
    monkeypatch.setattr(
        gateway_status,
        "multiplexer_liveness_for_profile",
        lambda home: (321, multiplexer_runtime) if home == profile_home else None,
    )

    config, runtime, running = _read_state()

    assert config is expected_config
    assert running is True
    assert runtime["platforms"] == {"telegram": {"state": "connected"}}


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
