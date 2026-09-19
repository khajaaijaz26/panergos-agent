"""Session-owned connector inventory and setup-guide RPCs.

These methods expose the local messaging catalog. They do not mint credentials,
start OAuth, or invoke the interactive CLI wizard from the gateway's JSON pipe.
"""

from __future__ import annotations

import contextvars
import re

from .method_ctx import HandlerRegistry, bind_module

_registry = HandlerRegistry()
method = _registry.method

_CONNECTOR_RPC_METHODS = frozenset({"connectors.list", "connectors.connect"})
_connector_rpc_origin: contextvars.ContextVar[tuple | None] = contextvars.ContextVar(
    "connector_rpc_origin", default=None)
_CONNECTOR_SLUG = re.compile(r"[a-z0-9][a-z0-9_-]*")


def _capture_connector_rpc_owner(params):
    """Pin the session generation before a long RPC enters the worker queue."""
    sid = params.get("session_id")
    _, owner = _current_session_steer_authority(sid if isinstance(sid, str) else "")
    _connector_rpc_origin.set((owner, owner.get("profile_home") if owner is not None else None))


def _connector_rpc_error(rid, code, reason, message):
    return _err(rid, code, message, data={"reason": reason})


def _connector_owner_matches(sid, owner, profile_home):
    _, current = _current_session_steer_authority(sid)
    return (
        current is owner
        and not owner.get("_finalized")
        and owner.get("profile_home") == profile_home
    )


def _connector_ui_rows(rows):
    projected = []
    for row in rows:
        readiness = row.get("readiness")
        projected.append({
            "connector": row["id"],
            "connected": readiness == "ready",
            "enabled": True,
            "connectionStatus": {
                "ready": "active",
                "disabled": "disabled",
            }.get(readiness, "not_configured"),
            "name": row.get("name") or row["id"],
            "description": row.get("description") or "",
            "missing": list(row.get("missing") or ()),
            "runtime": row.get("runtime") or "",
        })
    return projected


def _connector_setup_result(row, *, reconnect):
    connector = row["connector"]
    if row["connected"]:
        return {"connector": connector, "status": "active"}

    from panergos_cli import __distribution_docs_url__

    action = "Reconfigure" if reconnect else "Configure"
    return {
        "connector": connector,
        "status": "setup_required",
        "setup_url": f"{__distribution_docs_url__.rstrip('/')}/user-guide/messaging/",
        "instruction": (
            f"{action} {row['name']} in Panergos Desktop's Messaging page, "
            f"or run `panergos connect {connector}` in a terminal."
        ),
    }


def _dispatch_connector_rpc(rid, params, *, connect):
    from panergos_cli.connectors import connector_snapshot

    rows, _gateway_running = connector_snapshot()
    projected = _connector_ui_rows(rows)
    if not connect:
        return _ok(rid, {"available": True, "connectors": projected})

    slugs = params.get("connectors")
    reconnect = params.get("reconnect", False)
    if (
        not isinstance(slugs, list)
        or not slugs
        or any(not isinstance(slug, str) or _CONNECTOR_SLUG.fullmatch(slug) is None for slug in slugs)
        or len(slugs) != len(set(slugs))
        or not isinstance(reconnect, bool)
    ):
        return _connector_rpc_error(
            rid, 4000, "INVALID_PARAMS",
            "connectors must be unique, nonempty slugs; reconnect must be boolean",
        )

    by_connector = {row["connector"]: row for row in projected}
    if unknown := [slug for slug in slugs if slug not in by_connector]:
        return _connector_rpc_error(
            rid, 4040, "UNKNOWN_CONNECTOR", f"Unknown connector: {unknown[0]}")

    results = [_connector_setup_result(by_connector[slug], reconnect=reconnect) for slug in slugs]
    return _ok(rid, {
        "results": results,
        "summary": {
            "requested": len(results),
            "active": sum(result["status"] == "active" for result in results),
            "setup_required": sum(result["status"] == "setup_required" for result in results),
        },
    })


def _connector_rpc(rid, params, *, connect):
    sid = params.get("session_id")
    if not isinstance(sid, str) or not sid.strip():
        return _connector_rpc_error(rid, 4000, "INVALID_PARAMS", "session_id required")

    _, owner = _current_session_steer_authority(sid)
    origin = _connector_rpc_origin.get()
    if (
        owner is None
        or owner.get("_finalized")
        or origin is not None
        and (origin[0] is not owner or origin[1] != owner.get("profile_home"))
    ):
        return _connector_rpc_error(
            rid, 4001, "NOT_OWNER", "session not found or not owned by this transport")

    profile_home = owner.get("profile_home")
    runtime_token = _current_runtime_session_record.set(owner)
    try:
        with _session_profile_runtime_scope(owner):
            tokens = _set_session_context(
                owner["session_key"], cwd=_session_cwd(owner), ui_session_id=sid)
            try:
                result = _dispatch_connector_rpc(rid, params, connect=connect)
            finally:
                _clear_session_context(tokens)
        if not _connector_owner_matches(sid, owner, profile_home):
            return _connector_rpc_error(rid, 4001, "NOT_OWNER", "session ownership changed")
        return result
    except Exception:
        logger.debug("connector RPC failed", exc_info=True)
        return _connector_rpc_error(
            rid, 5034, "CONNECTOR_REQUEST_FAILED",
            "Connector request failed. Try again explicitly.",
        )
    finally:
        _current_runtime_session_record.reset(runtime_token)


@method("connectors.list")
def _(rid, params):
    return _connector_rpc(rid, params, connect=False)


@method("connectors.connect")
def _(rid, params):
    return _connector_rpc(rid, params, connect=True)


def register(server):
    bind_module(globals(), server, skip=("_",))
    server._LONG_HANDLERS = server._LONG_HANDLERS | _CONNECTOR_RPC_METHODS
