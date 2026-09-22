"""Security boundaries for browser-extension pairing credentials."""

import asyncio
import hashlib

import pytest
from aiohttp import WSMsgType, WSServerHandshakeError, web
from aiohttp.test_utils import TestClient, TestServer

from gateway.browser_control_broker import BrowserControlBroker, ControllerUnavailable
from gateway.config import PlatformConfig
from gateway.platforms import api_server_runs
from gateway.platforms.api_server import APIServerAdapter, cors_middleware
from gateway.platforms.api_server_extension_auth import (
    BrowserExtensionAuthError,
    BrowserExtensionAuthStore,
)
from panergos_state import SessionDB
from tools.browser_extension_router import route_browser_tool


API_KEY = "fixture-owner-api-key-123456789"
ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
OTHER_ORIGIN = "chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba"


def _run_id(char: str) -> str:
    return f"run_{char * 32}"


def _app(adapter: APIServerAdapter) -> web.Application:
    app = web.Application(middlewares=[cors_middleware])
    app["api_server_adapter"] = adapter
    app.router.add_post(
        "/v1/browser-extension/pair", adapter._handle_browser_extension_pair)
    app.router.add_post(
        "/v1/browser-extension/pair/exchange", adapter._handle_browser_extension_exchange)
    app.router.add_delete(
        "/v1/browser-extension/token", adapter._handle_browser_extension_revoke)
    app.router.add_get("/v1/capabilities", adapter._handle_capabilities)
    app.router.add_post(
        "/v1/browser-control/register", adapter._handle_browser_control_register)
    app.router.add_get(
        "/v1/browser-control/ws", adapter._handle_browser_control_ws)
    app.router.add_get("/api/sessions", adapter._handle_list_sessions)
    app.router.add_post("/api/sessions", adapter._handle_create_session)
    app.router.add_get("/api/sessions/{session_id}", adapter._handle_get_session)
    app.router.add_get(
        "/api/sessions/{session_id}/messages", adapter._handle_session_messages)
    app.router.add_post(
        "/api/sessions/{session_id}/chat", adapter._handle_session_chat)
    app.router.add_post("/v1/runs", adapter._handle_runs)
    app.router.add_post(
        "/v1/runs/{run_id}/approval", adapter._handle_run_approval)
    app.router.add_get("/api/jobs", adapter._handle_list_jobs)

    async def protected(request):
        auth_err = adapter._check_auth(request)
        return auth_err or web.json_response({"unsafe": True})

    app.router.add_get("/api/config", protected)
    app.router.add_post("/api/admin", protected)
    app.router.add_post("/v1/artifacts/upload", protected)

    async def cleanup_extension_expiry_tasks(_app):
        await adapter._cancel_browser_extension_expiry_tasks()

    app.on_cleanup.append(cleanup_extension_expiry_tasks)
    return app


async def _mint(client: TestClient, *, origin: str = ORIGIN) -> str:
    response = await client.post(
        "/v1/browser-extension/pair",
        json={"origin": origin},
        headers={"Authorization": f"Bearer {API_KEY}"},
    )
    assert response.status == 201, await response.text()
    return (await response.json())["pairing_code"]


async def _exchange(client: TestClient, code: str, *, origin: str = ORIGIN):
    return await client.post(
        "/v1/browser-extension/pair/exchange",
        json={"pairing_code": code},
        headers={"Origin": origin},
    )


@pytest.mark.asyncio
async def test_pairing_is_origin_bound_single_use_scoped_and_revocable():
    adapter = APIServerAdapter(PlatformConfig(enabled=True, extra={"key": API_KEY}))
    async with TestClient(TestServer(_app(adapter))) as client:
        code = await _mint(client)

        wrong_origin = await _exchange(client, code, origin=OTHER_ORIGIN)
        assert wrong_origin.status == 403

        exchanged = await _exchange(client, code)
        assert exchanged.status == 200, await exchanged.text()
        credential = await exchanged.json()
        token = credential["access_token"]
        assert token.startswith("pxe_")
        assert credential["token_type"] == "Bearer"
        assert credential["session_id"].startswith("extension_")
        assert credential["scope"] == [
            "capabilities:read", "session:own", "runs:control", "browser-control:connect"]

        reused = await _exchange(client, code)
        assert reused.status == 401

        headers = {"Authorization": f"Bearer {token}", "Origin": ORIGIN}
        allowed = await client.get("/v1/capabilities", headers=headers)
        assert allowed.status == 200
        extension_control = (await allowed.json())["features"]["browser_extension_control"]
        assert set(extension_control["capabilities"]) == {
            "controller.noop", "browser_back", "browser_click", "browser_navigate",
            "browser_press", "browser_screenshot", "browser_scroll", "browser_snapshot",
            "browser_type"}
        assert extension_control["artifact_capabilities"] == []
        assert extension_control["developer_capabilities"] == []
        assert extension_control["developer_mode"] is False

        for method, path in (
            (client.get, "/api/jobs"),
            (client.get, "/api/config"),
            (client.post, "/api/admin"),
            (client.post, "/v1/artifacts/upload"),
        ):
            forbidden = await method(path, headers=headers)
            assert forbidden.status == 403
            assert (await forbidden.json())["error"]["code"] == "extension_scope_forbidden"

        wrong_origin_token = await client.get(
            "/v1/capabilities",
            headers={"Authorization": f"Bearer {token}", "Origin": OTHER_ORIGIN},
        )
        assert wrong_origin_token.status == 401

        revoked = await client.delete("/v1/browser-extension/token", headers=headers)
        assert revoked.status == 200
        assert await revoked.json() == {"revoked": True}
        after_revoke = await client.get("/v1/capabilities", headers=headers)
        assert after_revoke.status == 401


@pytest.mark.asyncio
async def test_restricted_token_accepts_explicit_origin_only_on_loopback():
    adapter = APIServerAdapter(PlatformConfig(enabled=True, extra={"key": API_KEY}))
    async with TestClient(TestServer(_app(adapter))) as client:
        credential = await (await _exchange(client, await _mint(client))).json()
        authorization = {"Authorization": f"Bearer {credential['access_token']}"}

        missing = await client.get("/v1/capabilities", headers=authorization)
        assert missing.status == 401

        correct = await client.get(
            "/v1/capabilities",
            headers={**authorization, "X-Panergos-Extension-Origin": ORIGIN},
        )
        assert correct.status == 200

        wrong = await client.get(
            "/v1/capabilities",
            headers={**authorization, "X-Panergos-Extension-Origin": OTHER_ORIGIN},
        )
        assert wrong.status == 401

        existing_origin = await client.get(
            "/v1/capabilities", headers={**authorization, "Origin": ORIGIN})
        assert existing_origin.status == 200

        conflicting_origin = await client.get(
            "/v1/capabilities",
            headers={
                **authorization,
                "Origin": OTHER_ORIGIN,
                "X-Panergos-Extension-Origin": ORIGIN,
            },
        )
        assert conflicting_origin.status == 401

        non_loopback = await client.get(
            "/v1/capabilities",
            headers={
                **authorization,
                "Host": "attacker.example",
                "X-Panergos-Extension-Origin": ORIGIN,
            },
        )
        assert non_loopback.status == 401

        owner_token = await client.get(
            "/v1/capabilities",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "X-Panergos-Extension-Origin": ORIGIN,
            },
        )
        assert owner_token.status == 401


@pytest.mark.asyncio
async def test_pairing_rejects_owner_key_from_extension_and_query_secrets():
    adapter = APIServerAdapter(PlatformConfig(enabled=True, extra={"key": API_KEY}))
    async with TestClient(TestServer(_app(adapter))) as client:
        owner_headers = {"Authorization": f"Bearer {API_KEY}", "Origin": ORIGIN}
        owner_from_extension = await client.get("/v1/capabilities", headers=owner_headers)
        assert owner_from_extension.status == 401
        owner_pair_from_extension = await client.post(
            "/v1/browser-extension/pair", json={"origin": ORIGIN}, headers=owner_headers)
        assert owner_pair_from_extension.status == 401

        query_secret = await client.post(
            "/v1/browser-extension/pair/exchange?pairing_code=secret",
            json={"pairing_code": "secret"},
            headers={"Origin": ORIGIN},
        )
        assert query_secret.status == 400

        rebound_host = await client.post(
            "/v1/browser-extension/pair",
            json={"origin": ORIGIN},
            headers={"Authorization": f"Bearer {API_KEY}", "Host": "attacker.example"},
        )
        assert rebound_host.status == 403
        assert (await rebound_host.json())["error"]["code"] == "extension_pairing_loopback_only"

        preflight = await client.options(
            "/v1/capabilities",
            headers={
                "Origin": ORIGIN,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization",
            },
        )
        assert preflight.status == 200
        assert preflight.headers["Access-Control-Allow-Origin"] == ORIGIN
        assert "X-Panergos-Extension-Origin" in preflight.headers["Access-Control-Allow-Headers"]
        malformed_origin = await client.options(
            "/v1/capabilities", headers={"Origin": f"{ORIGIN}/"})
        assert malformed_origin.status == 403


@pytest.mark.asyncio
async def test_extension_registration_uses_the_grant_principal(monkeypatch):
    adapter = APIServerAdapter(PlatformConfig(enabled=True, extra={"key": API_KEY}))
    monkeypatch.setattr(adapter, "_browser_control_enabled", lambda: True)
    monkeypatch.setattr(adapter, "_browser_control_developer_mode", lambda: True)

    class StubSessionDB:
        @staticmethod
        def get_session(session_id):
            return {"id": session_id, "source": "api_server"}

    adapter._session_db = StubSessionDB()
    async with TestClient(TestServer(_app(adapter))) as client:
        code = await _mint(client)
        exchanged = await _exchange(client, code)
        credential = await exchanged.json()
        token = credential["access_token"]
        second_exchange = await _exchange(client, await _mint(client))
        assert second_exchange.status == 200
        assert (await second_exchange.json())["session_id"] == credential["session_id"]
        registration_body = {
            "protocol_version": 1,
            "controller_id": "extension-controller",
            "browser_profile_id": "browser-profile",
            "session_id": "extension_" + "f" * 32,
            "capabilities": [
                "controller.noop", "browser_tabs", "browser_tab_activate",
                "browser_artifact_download", "browser_cdp", "browser_evaluate"],
        }
        wrong_session = await client.post(
            "/v1/browser-control/register",
            json=registration_body,
            headers={"Authorization": f"Bearer {token}", "Origin": ORIGIN},
        )
        assert wrong_session.status == 403
        registration_body["session_id"] = credential["session_id"]
        registration = await client.post(
            "/v1/browser-control/register",
            json=registration_body,
            headers={"Authorization": f"Bearer {token}", "Origin": ORIGIN},
        )
        assert registration.status == 201, await registration.text()
        registration_payload = await registration.json()
        principal = registration_payload["scope"]["principal_id"]
        assert principal.startswith("principal:browser-extension:")
        assert registration_payload["scope"]["capabilities"] == ["controller.noop"]
        with pytest.raises(WSServerHandshakeError) as wrong_ws_origin:
            await client.ws_connect(
                "/v1/browser-control/ws",
                headers={"Origin": OTHER_ORIGIN},
                protocols=[
                    "panergos-browser-control-v1",
                    "panergos-browser-control-ticket."
                    + registration_payload["ticket"],
                ],
            )
        assert wrong_ws_origin.value.status == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("end_grant", ["revoke", "expire"])
async def test_extension_grant_lifetime_owns_the_controller_socket(monkeypatch, end_grant):
    adapter = APIServerAdapter(PlatformConfig(enabled=True, extra={"key": API_KEY}))
    adapter._browser_control_broker = BrowserControlBroker()
    monkeypatch.setattr(adapter, "_browser_control_enabled", lambda: True)
    expiry_gate = asyncio.Event()

    async def wait_for_expiry(_grant):
        await expiry_gate.wait()

    monkeypatch.setattr(
        adapter, "_wait_for_browser_extension_grant_expiry", wait_for_expiry)

    class StubSessionDB:
        @staticmethod
        def get_session(session_id):
            return {"id": session_id, "source": "browser_extension"}

    adapter._session_db = StubSessionDB()
    async with TestClient(TestServer(_app(adapter))) as client:
        credential = await (await _exchange(client, await _mint(client))).json()
        headers = {
            "Authorization": f"Bearer {credential['access_token']}", "Origin": ORIGIN}
        registered = await client.post(
            "/v1/browser-control/register",
            json={
                "protocol_version": 1,
                "controller_id": "extension-controller",
                "browser_profile_id": "browser-profile",
                "session_id": credential["session_id"],
                "capabilities": ["controller.noop"],
            },
            headers=headers,
        )
        assert registered.status == 201, await registered.text()
        registration = await registered.json()
        ws = await client.ws_connect(
            "/v1/browser-control/ws",
            headers={"Origin": ORIGIN},
            protocols=[
                "panergos-browser-control-v1",
                f"panergos-browser-control-ticket.{registration['ticket']}",
            ],
        )
        assert await ws.receive_json(timeout=2.0) == {
            "method": "browser.controller.ready",
            "params": {"protocol_version": 1},
        }
        scope = adapter._browser_control_broker.scope_for_session(
            session_id=credential["session_id"],
            principal_id=registration["scope"]["principal_id"],
            transport_family="local-api",
        )
        assert scope is not None
        assert scope.extension_grant_id
        assert scope.extension_grant_expires_at
        expiry_task = adapter._browser_extension_expiry_tasks[scope.extension_grant_id]

        if end_grant == "revoke":
            ending = asyncio.create_task(
                client.delete("/v1/browser-extension/token", headers=headers))
        else:
            expiry_gate.set()
            ending = expiry_task
        message = await ws.receive(timeout=2.0)
        assert message.type in {WSMsgType.CLOSE, WSMsgType.CLOSED}
        if end_grant == "revoke":
            response = await asyncio.wait_for(ending, timeout=2.0)
            assert response.status == 200
            assert await response.json() == {"revoked": True}
        else:
            await asyncio.wait_for(ending, timeout=2.0)
        assert adapter._browser_control_broker.scope_for_session(
            session_id=credential["session_id"],
            principal_id=registration["scope"]["principal_id"],
            transport_family="local-api",
        ) is None
        fallbacks = []
        with pytest.raises(ControllerUnavailable):
            route_browser_tool(
                "browser_snapshot", {},
                fallback=lambda: fallbacks.append(True) or "unsafe-legacy-browser",
                broker=adapter._browser_control_broker,
                enabled=True,
                session_id=credential["session_id"],
                principal_id=registration["scope"]["principal_id"],
                transport_family="local-api",
            )
        assert fallbacks == []


@pytest.mark.asyncio
async def test_grant_expiry_stops_its_run_after_controller_socket_closed(monkeypatch):
    adapter = APIServerAdapter(PlatformConfig(enabled=True, extra={"key": API_KEY}))
    adapter._browser_control_broker = BrowserControlBroker()
    monkeypatch.setattr(adapter, "_browser_control_enabled", lambda: True)
    expiry_gate = asyncio.Event()

    async def wait_for_expiry(_grant):
        await expiry_gate.wait()

    monkeypatch.setattr(
        adapter, "_wait_for_browser_extension_grant_expiry", wait_for_expiry)

    class StubSessionDB:
        @staticmethod
        def get_session(session_id):
            return {"id": session_id, "source": "browser_extension"}

    adapter._session_db = StubSessionDB()
    async with TestClient(TestServer(_app(adapter))) as client:
        credential = await (await _exchange(client, await _mint(client))).json()
        headers = {
            "Authorization": f"Bearer {credential['access_token']}", "Origin": ORIGIN}
        registered = await client.post(
            "/v1/browser-control/register",
            json={
                "protocol_version": 1,
                "controller_id": "expiry-controller",
                "browser_profile_id": "expiry-browser-profile",
                "session_id": credential["session_id"],
                "capabilities": ["controller.noop"],
            },
            headers=headers,
        )
        assert registered.status == 201, await registered.text()
        registration = await registered.json()
        ws = await client.ws_connect(
            "/v1/browser-control/ws",
            headers={"Origin": ORIGIN},
            protocols=[
                "panergos-browser-control-v1",
                f"panergos-browser-control-ticket.{registration['ticket']}",
            ],
        )
        assert (await ws.receive_json(timeout=2.0))["method"] == "browser.controller.ready"
        scope = adapter._browser_control_broker.scope_for_session(
            session_id=credential["session_id"],
            principal_id=registration["scope"]["principal_id"],
            transport_family="local-api",
        )
        assert scope is not None and scope.extension_grant_id

        run_id = _run_id("1")
        owner_scope = api_server_runs._extension_owner_scope(
            scope.profile_id, scope.principal_id)
        adapter._run_owners[run_id] = owner_scope
        adapter._run_extension_grants[run_id] = scope.extension_grant_id
        adapter._run_statuses[run_id] = {"run_id": run_id, "status": "running"}
        adapter._active_run_tasks[run_id] = object()
        expiry_task = adapter._browser_extension_expiry_tasks[scope.extension_grant_id]

        await ws.close()
        expiry_gate.set()
        await asyncio.wait_for(expiry_task, timeout=2.0)
        assert adapter._browser_control_broker.select(scope, "controller.noop") is None
        assert adapter._run_statuses[run_id]["status"] == "stopping"
        assert run_id in adapter._stopping_run_ids
        denied = await client.get("/v1/capabilities", headers=headers)
        assert denied.status == 401

        adapter._active_run_tasks.pop(run_id, None)


@pytest.mark.asyncio
@pytest.mark.parametrize("end_old_grant", ["revoke", "expire"])
async def test_old_grant_end_does_not_stop_new_repair_run(monkeypatch, end_old_grant):
    adapter = APIServerAdapter(PlatformConfig(enabled=True, extra={"key": API_KEY}))
    expiry_gates = {}

    async def wait_for_expiry(grant):
        await expiry_gates.setdefault(grant.grant_id, asyncio.Event()).wait()

    monkeypatch.setattr(
        adapter, "_wait_for_browser_extension_grant_expiry", wait_for_expiry)
    async with TestClient(TestServer(_app(adapter))) as client:
        old_credential = await (await _exchange(client, await _mint(client))).json()
        new_credential = await (await _exchange(client, await _mint(client))).json()
        assert old_credential["session_id"] == new_credential["session_id"]

        old_token = old_credential["access_token"]
        new_token = new_credential["access_token"]
        old_grant_id = hashlib.sha256(old_token.encode()).hexdigest()
        new_grant_id = hashlib.sha256(new_token.encode()).hexdigest()
        new_grant = adapter._browser_extension_auth.authenticate(
            token=new_token,
            origin=ORIGIN,
            profile="default",
            method="GET",
            path="/v1/capabilities",
        )
        run_id = _run_id("2")
        adapter._run_owners[run_id] = api_server_runs._extension_owner_scope(
            new_grant.profile, new_grant.principal)
        adapter._run_extension_grants[run_id] = new_grant_id
        adapter._run_statuses[run_id] = {"run_id": run_id, "status": "running"}
        adapter._active_run_tasks[run_id] = object()

        old_task = adapter._browser_extension_expiry_tasks[old_grant_id]
        if end_old_grant == "revoke":
            response = await client.delete(
                "/v1/browser-extension/token",
                headers={"Authorization": f"Bearer {old_token}", "Origin": ORIGIN},
            )
            assert response.status == 200
            assert await response.json() == {"revoked": True}
        else:
            expiry_gates.setdefault(old_grant_id, asyncio.Event()).set()
            await asyncio.wait_for(old_task, timeout=2.0)

        assert adapter._run_statuses[run_id]["status"] == "running"
        assert run_id not in adapter._stopping_run_ids
        allowed = await client.get(
            "/v1/capabilities",
            headers={"Authorization": f"Bearer {new_token}", "Origin": ORIGIN},
        )
        assert allowed.status == 200

        adapter._active_run_tasks.pop(run_id, None)


@pytest.mark.asyncio
async def test_extension_approval_requires_one_request_scoped_decision(monkeypatch):
    adapter = APIServerAdapter(PlatformConfig(enabled=True, extra={"key": API_KEY}))
    run_id = "run_extension_approval"
    request_id = "approval-extension-owned"
    adapter._run_statuses[run_id] = {
        "run_id": run_id,
        "status": "waiting_for_approval",
        "approval": {"request_id": request_id},
    }
    adapter._run_approval_sessions[run_id] = "approval-session-extension"
    monkeypatch.setattr(
        adapter, "_request_owns_run", lambda request, candidate: candidate == run_id)
    resolved = []

    def resolve(session_key, choice, *, resolve_all=False, request_id=None, **_kwargs):
        resolved.append((session_key, choice, resolve_all, request_id))
        return 1

    monkeypatch.setattr("tools.approval.resolve_gateway_approval", resolve)
    async with TestClient(TestServer(_app(adapter))) as client:
        credential = await (await _exchange(client, await _mint(client))).json()
        headers = {
            "Authorization": f"Bearer {credential['access_token']}", "Origin": ORIGIN}
        for payload in (
            {"choice": "always", "request_id": request_id},
            {"choice": "approve", "request_id": request_id},
            {"choice": "once", "request_id": "another-request"},
            {"choice": "once", "request_id": request_id, "resolve_all": True},
            {"choice": "deny"},
        ):
            denied = await client.post(
                f"/v1/runs/{run_id}/approval", json=payload, headers=headers)
            assert denied.status == 400
            assert (await denied.json())["error"]["code"] == (
                "extension_approval_payload_invalid")
        assert resolved == []

        allowed = await client.post(
            f"/v1/runs/{run_id}/approval",
            json={"choice": "once", "request_id": request_id},
            headers=headers,
        )
        assert allowed.status == 200, await allowed.text()
        assert resolved == [
            ("approval-session-extension", "once", False, request_id)]


@pytest.mark.asyncio
async def test_extension_is_confined_to_one_session_and_minimal_run_shape(tmp_path):
    adapter = APIServerAdapter(PlatformConfig(enabled=True, extra={"key": API_KEY}))
    adapter._session_db = SessionDB(tmp_path / "state.db")
    try:
        async with TestClient(TestServer(_app(adapter))) as client:
            credential_response = await _exchange(client, await _mint(client))
            credential = await credential_response.json()
            session_id = credential["session_id"]
            headers = {
                "Authorization": f"Bearer {credential['access_token']}", "Origin": ORIGIN}

            created = await client.post(
                "/api/sessions",
                json={"id": session_id, "source": "browser_extension"},
                headers=headers,
            )
            assert created.status == 201, await created.text()
            own_session = await client.get(f"/api/sessions/{session_id}", headers=headers)
            assert own_session.status == 200

            for method, path, body in (
                (client.get, "/api/sessions", None),
                (client.get, f"/api/sessions/{session_id}/messages", None),
                (client.post, f"/api/sessions/{session_id}/chat", {"message": "no"}),
            ):
                response = await method(path, headers=headers, **({"json": body} if body else {}))
                assert response.status == 403
                assert (await response.json())["error"]["code"] == "extension_scope_forbidden"

            arbitrary = "extension_" + "f" * 32
            wrong_get = await client.get(f"/api/sessions/{arbitrary}", headers=headers)
            assert wrong_get.status == 403
            wrong_create = await client.post(
                "/api/sessions",
                json={"id": arbitrary, "source": "browser_extension"},
                headers=headers,
            )
            assert wrong_create.status == 403
            extra_create = await client.post(
                "/api/sessions",
                json={"id": session_id, "source": "browser_extension", "title": "override"},
                headers=headers,
            )
            assert extra_create.status == 400
            source_override = await client.post(
                "/api/sessions",
                json={"id": session_id, "source": "api_server"},
                headers=headers,
            )
            assert source_override.status == 400

            wrong_run = await client.post(
                "/v1/runs",
                json={"input": "hello", "session_id": arbitrary, "run_id": _run_id("a")},
                headers=headers)
            assert wrong_run.status == 403
            for override in (
                {"previous_response_id": "resp_other"},
                {"conversation_history": [{"role": "system", "content": "override"}]},
                {"model": "other-provider/model"},
            ):
                denied = await client.post(
                    "/v1/runs",
                    json={"input": "hello", "session_id": session_id, "run_id": _run_id("b"), **override},
                    headers=headers,
                )
                assert denied.status == 400
                assert (await denied.json())["error"]["code"] == "extension_run_payload_invalid"
            header_override = await client.post(
                "/v1/runs",
                json={"input": "hello", "session_id": session_id, "run_id": _run_id("c")},
                headers={**headers, "X-Panergos-Session-Key": "other-conversation"},
            )
            assert header_override.status == 400
    finally:
        adapter._session_db.close()


@pytest.mark.asyncio
async def test_extension_allows_one_active_run_and_replays_lost_acceptance(
    monkeypatch, tmp_path
):
    release = asyncio.Event()
    started = asyncio.Event()
    launched_sessions = []

    async def hold_run(owner, launch, *, _api_server):
        launched_sessions.append(launch.session_id)
        owner._set_run_status(launch.run_id, "running")
        started.set()
        try:
            await release.wait()
            owner._set_run_status(launch.run_id, "completed")
        finally:
            api_server_runs._retire_live_run(owner, launch.run_id)

    async def resolve_rotated_session(_owner, _session_id):
        return "extension_rotated_live_tip"

    monkeypatch.setattr(api_server_runs, "_execute_run", hold_run)
    monkeypatch.setattr(api_server_runs, "_resolve_live_session_id", resolve_rotated_session)
    adapter = APIServerAdapter(PlatformConfig(enabled=True, extra={"key": API_KEY}))
    adapter._session_db = SessionDB(tmp_path / "state.db")
    try:
        async with TestClient(TestServer(_app(adapter))) as client:
            credential = await (await _exchange(client, await _mint(client))).json()
            session_id = credential["session_id"]
            headers = {
                "Authorization": f"Bearer {credential['access_token']}",
                "Origin": ORIGIN,
            }
            created = await client.post(
                "/api/sessions",
                json={"id": session_id, "source": "browser_extension"},
                headers=headers,
            )
            assert created.status == 201, await created.text()
            body = {"input": "inspect this page", "session_id": session_id, "run_id": _run_id("d")}

            first = await client.post(
                "/v1/runs",
                json=body,
                headers={**headers, "Idempotency-Key": "extension-run-one"},
            )
            assert first.status == 202, await first.text()
            first_payload = await first.json()
            run_id = first_payload["run_id"]
            await started.wait()
            assert set(adapter._run_statuses) == {run_id}
            assert adapter._run_statuses[run_id]["session_id"] == session_id
            assert adapter._run_extension_grants[run_id] == hashlib.sha256(
                credential["access_token"].encode()).hexdigest()
            assert launched_sessions == ["extension_rotated_live_tip"]

            replay = await client.post(
                "/v1/runs",
                json=body,
                headers={**headers, "Idempotency-Key": "extension-run-one"},
            )
            assert replay.status == 202, await replay.text()
            assert replay.headers["Idempotency-Replayed"] == "true"
            assert (await replay.json())["run_id"] == run_id

            second = await client.post(
                "/v1/runs",
                json={"input": "do something else", "session_id": session_id, "run_id": _run_id("e")},
                headers={**headers, "Idempotency-Key": "extension-run-two"},
            )
            assert second.status == 409, await second.text()
            assert (await second.json())["error"]["code"] == "extension_run_in_progress"
            assert set(adapter._run_statuses) == {run_id}
            assert set(adapter._run_owners) == {run_id}
            assert set(adapter._active_run_tasks) == {run_id}

            first_task = adapter._active_run_tasks[run_id]
            release.set()
            await first_task
            release.clear()

            after_completion = await client.post(
                "/v1/runs",
                json={"input": "continue", "session_id": session_id, "run_id": _run_id("f")},
                headers={**headers, "Idempotency-Key": "extension-run-three"},
            )
            assert after_completion.status == 202, await after_completion.text()
            next_run_id = (await after_completion.json())["run_id"]
            next_task = adapter._active_run_tasks[next_run_id]
            release.set()
            await next_task
    finally:
        release.set()
        await asyncio.gather(*adapter._active_run_tasks.values(), return_exceptions=True)
        adapter._session_db.close()


def test_repairing_same_extension_keeps_its_session_and_run_owner_identity():
    store = BrowserExtensionAuthStore()
    first_code, _ = store.mint_pairing_code(origin=ORIGIN, profile="default", actor="owner")
    _, first = store.exchange(pairing_code=first_code, origin=ORIGIN, actor="extension")
    second_code, _ = store.mint_pairing_code(origin=ORIGIN, profile="default", actor="owner")
    _, second = store.exchange(pairing_code=second_code, origin=ORIGIN, actor="extension")

    assert first.grant_id != second.grant_id
    assert first.session_id == second.session_id
    assert first.principal == second.principal


def test_pairing_store_enforces_expiry_attempt_and_rate_limits():
    now = [100.0]
    store = BrowserExtensionAuthStore(
        clock=lambda: now[0], pairing_ttl_seconds=2, token_ttl_seconds=3)

    expired_code, _ = store.mint_pairing_code(origin=ORIGIN, profile="default", actor="expiry")
    now[0] += 3
    with pytest.raises(BrowserExtensionAuthError) as expired:
        store.exchange(pairing_code=expired_code, origin=ORIGIN, actor="expiry")
    assert expired.value.code == "invalid_pairing_code"

    now[0] += 1
    code, _ = store.mint_pairing_code(origin=ORIGIN, profile="default", actor="attempts")
    pairing_id = code.split("-", 1)[0]
    for _ in range(5):
        with pytest.raises(BrowserExtensionAuthError):
            store.exchange(
                pairing_code=f"{pairing_id}-AAAAAAAA", origin=ORIGIN, actor="attempts")
    with pytest.raises(BrowserExtensionAuthError):
        store.exchange(pairing_code=code, origin=ORIGIN, actor="attempts")

    for _ in range(5):
        store.mint_pairing_code(origin=ORIGIN, profile="default", actor="rate")
    with pytest.raises(BrowserExtensionAuthError) as limited:
        store.mint_pairing_code(origin=ORIGIN, profile="default", actor="rate")
    assert limited.value.status == 429

    token_code, _ = store.mint_pairing_code(
        origin=ORIGIN, profile="default", actor="token-expiry")
    token, _ = store.exchange(
        pairing_code=token_code, origin=ORIGIN, actor="token-expiry")
    now[0] += 4
    with pytest.raises(BrowserExtensionAuthError):
        store.authenticate(
            token=token,
            origin=ORIGIN,
            profile="default",
            method="GET",
            path="/v1/capabilities",
        )
