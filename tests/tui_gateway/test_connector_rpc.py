from __future__ import annotations

import contextlib

import pytest

from tui_gateway import server
from tui_gateway.transport import bind_transport, reset_transport


class _Transport:
    def write(self, _obj):
        return True

    def close(self):
        return None


@pytest.fixture
def owned_session(monkeypatch, tmp_path):
    sid = "connector-session"
    transport = _Transport()
    session = {
        "session_key": "connector-task",
        "transport": transport,
        "profile_home": None,
        "cwd": str(tmp_path),
    }
    server._sessions[sid] = session
    monkeypatch.setattr(server, "_session_profile_runtime_scope", lambda _owner: contextlib.nullcontext())
    monkeypatch.setattr(server, "_set_session_context", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(server, "_clear_session_context", lambda _tokens: None)
    server._connector_rpc_origin.set(None)
    try:
        yield sid, transport, session
    finally:
        server._connector_rpc_origin.set(None)
        server._sessions.pop(sid, None)


def _request(method, params, transport):
    token = bind_transport(transport)
    try:
        return server.handle_request({"jsonrpc": "2.0", "id": "rpc", "method": method, "params": params})
    finally:
        reset_transport(token)


def _snapshot():
    return ([
        {
            "id": "telegram",
            "name": "Telegram",
            "readiness": "ready",
            "missing": [],
            "runtime": "connected",
        },
        {
            "id": "discord",
            "name": "Discord",
            "readiness": "needs setup",
            "missing": ["DISCORD_BOT_TOKEN"],
            "runtime": "not started",
        },
    ], True)


def test_list_projects_local_inventory_for_the_owned_session(monkeypatch, owned_session):
    sid, transport, _session = owned_session
    monkeypatch.setattr("panergos_cli.connectors.connector_snapshot", _snapshot)

    response = _request("connectors.list", {"session_id": sid}, transport)

    assert response["result"] == {
        "available": True,
        "connectors": [
            {
                "connector": "telegram",
                "connected": True,
                "enabled": True,
                "connectionStatus": "active",
                "name": "Telegram",
                "description": "",
                "missing": [],
                "runtime": "connected",
            },
            {
                "connector": "discord",
                "connected": False,
                "enabled": True,
                "connectionStatus": "not_configured",
                "name": "Discord",
                "description": "",
                "missing": ["DISCORD_BOT_TOKEN"],
                "runtime": "not started",
            },
        ],
    }


def test_connect_returns_truthful_local_state_or_official_setup_guide(monkeypatch, owned_session):
    sid, transport, _session = owned_session
    monkeypatch.setattr("panergos_cli.connectors.connector_snapshot", _snapshot)

    response = _request(
        "connectors.connect",
        {"session_id": sid, "connectors": ["telegram", "discord"]},
        transport,
    )

    active, setup = response["result"]["results"]
    assert active == {"connector": "telegram", "status": "active"}
    assert setup["connector"] == "discord"
    assert setup["status"] == "setup_required"
    assert setup["setup_url"].startswith(
        "https://khajaaijaz26.github.io/panergos-agent/docs/user-guide/messaging/")
    assert "connect_url" not in setup
    assert response["result"]["summary"] == {
        "requested": 2,
        "active": 1,
        "setup_required": 1,
    }


def test_connector_rpc_rejects_an_unattached_transport(monkeypatch, owned_session):
    sid, _transport, _session = owned_session
    called = False

    def fail_if_called():
        nonlocal called
        called = True
        return _snapshot()

    monkeypatch.setattr("panergos_cli.connectors.connector_snapshot", fail_if_called)
    response = _request("connectors.list", {"session_id": sid}, _Transport())

    assert response["error"]["code"] == 4001
    assert response["error"]["data"]["reason"] == "NOT_OWNER"
    assert not called


def test_queued_connector_rpc_rejects_session_generation_reuse(monkeypatch, owned_session):
    sid, transport, old_session = owned_session
    monkeypatch.setattr("panergos_cli.connectors.connector_snapshot", _snapshot)
    token = bind_transport(transport)
    try:
        server._capture_connector_rpc_owner({"session_id": sid})
        server._sessions[sid] = {**old_session}
        response = server.handle_request({
            "jsonrpc": "2.0",
            "id": "rpc",
            "method": "connectors.list",
            "params": {"session_id": sid},
        })
    finally:
        reset_transport(token)

    assert response["error"]["code"] == 4001
    assert response["error"]["data"]["reason"] == "NOT_OWNER"
