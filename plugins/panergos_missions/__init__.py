"""Panergos durable missions: Kanban execution plus shared coordination state."""

from __future__ import annotations

import argparse
import json
import os
from contextlib import closing
from dataclasses import asdict
from typing import Any

from plugins.panergos_missions.store import MissionError, MissionStore


_ACTIONS = (
    "create",
    "list",
    "show",
    "set_status",
    "add_task",
    "list_tasks",
    "put_state",
    "get_state",
    "send",
    "inbox",
    "ack",
    "events",
)
_TASK_STATUSES = (
    "triage",
    "todo",
    "scheduled",
    "ready",
    "running",
    "blocked",
    "review",
    "done",
    "archived",
)
_MAX_OUTPUT_BYTES = 524_288


MISSION_SCHEMA: dict[str, Any] = {
    "name": "panergos_mission",
    "description": (
        "Run restart-safe multi-agent missions. Missions use Panergos Kanban for isolated task graphs, "
        "workers, leases, retries, reviews, and artifacts, then add typed compare-and-swap shared state, "
        "addressed peer messages, and a durable audit log. Use create first; add_task assigns existing "
        "agent profiles. Workers finish work through their normal kanban tools."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": list(_ACTIONS)},
            "mission_id": {"type": "string"},
            "goal": {"type": "string"},
            "status": {
                "type": "string",
                "enum": ["active", "paused", "completed", "failed", "cancelled"],
            },
            "task_status": {"type": "string", "enum": list(_TASK_STATUSES)},
            "reason": {"type": "string"},
            "metadata": {"type": "object"},
            "title": {"type": "string"},
            "body": {"type": "string"},
            "assignee": {
                "type": "string",
                "description": "Existing Panergos profile name.",
            },
            "parents": {"type": "array", "items": {"type": "string"}},
            "priority": {"type": "integer", "minimum": -100, "maximum": 100},
            "skills": {"type": "array", "items": {"type": "string"}},
            "max_runtime_seconds": {
                "type": "integer",
                "minimum": 30,
                "maximum": 604800,
            },
            "max_retries": {"type": "integer", "minimum": 0, "maximum": 100},
            "model": {"type": "string"},
            "provider": {"type": "string"},
            "reasoning_effort": {"type": "string"},
            "goal_mode": {"type": "boolean"},
            "goal_max_turns": {"type": "integer", "minimum": 1, "maximum": 100},
            "completion_contract": {"type": "string"},
            "idempotency_key": {"type": "string"},
            "key": {"type": "string"},
            "value": {},
            "expected_version": {"type": "integer", "minimum": 0},
            "replace_type": {"type": "boolean"},
            "recipient": {"type": "string"},
            "message": {},
            "kind": {"type": "string"},
            "message_id": {"type": "integer", "minimum": 1},
            "request_id": {"type": "string"},
            "unread_only": {"type": "boolean"},
            "include_archived": {"type": "boolean"},
            "after": {"type": "integer", "minimum": 0},
            "limit": {"type": "integer", "minimum": 1, "maximum": 500},
        },
        "required": ["action"],
        "additionalProperties": False,
    },
}


def _actor(context: dict[str, Any]) -> str:
    candidates = (
        context.get("actor_override"),
        os.environ.get("PANERGOS_KANBAN_TASK"),
        context.get("profile_name"),
        os.environ.get("PANERGOS_PROFILE"),
        context.get("session_id"),
    )
    for value in candidates:
        if value is None:
            continue
        if not isinstance(value, str):
            raise MissionError("actor identity must be a string")
        if value.strip():
            return value.strip()
    return "agent"


def _required(args: dict[str, Any], name: str) -> Any:
    value = args.get(name)
    if value is None or value == "":
        raise MissionError(f"{name} is required for action={args.get('action')}")
    return value


def _optional_int(
    args: dict[str, Any], name: str, minimum: int, maximum: int
) -> int | None:
    value = args.get(name)
    if value is None:
        return None
    if (
        not isinstance(value, int)
        or isinstance(value, bool)
        or not minimum <= value <= maximum
    ):
        raise MissionError(f"{name} must be an integer from {minimum} to {maximum}")
    return value


def _optional_bool(args: dict[str, Any], name: str, default: bool) -> bool:
    value = args.get(name, default)
    if not isinstance(value, bool):
        raise MissionError(f"{name} must be a boolean")
    return value


def _optional_text(
    args: dict[str, Any], name: str, maximum: int, *, allow_empty: bool = False
) -> str | None:
    value = args.get(name)
    if value is None:
        return None
    if not isinstance(value, str):
        raise MissionError(f"{name} must be a string")
    value = value.strip()
    if not value and not allow_empty:
        raise MissionError(f"{name} must not be empty")
    if len(value) > maximum:
        raise MissionError(f"{name} must be at most {maximum} characters")
    return value


def _string_list(
    args: dict[str, Any], name: str, *, maximum: int = 100, item_maximum: int = 200
) -> list[str]:
    value = args.get(name, [])
    if (
        not isinstance(value, list)
        or len(value) > maximum
        or any(
            not isinstance(item, str)
            or not item.strip()
            or len(item.strip()) > item_maximum
            for item in value
        )
    ):
        raise MissionError(
            f"{name} must be a list of at most {maximum} non-empty strings "
            f"of at most {item_maximum} characters"
        )
    return list(dict.fromkeys(item.strip() for item in value))


def _response(success: bool, *, data: Any = None, error: str | None = None) -> str:
    payload = (
        {"success": success, "data": data}
        if success
        else {"success": False, "error": error}
    )
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) <= _MAX_OUTPUT_BYTES:
        return encoded
    return json.dumps(
        {
            "success": False,
            "error": "mission result exceeds 524288 UTF-8 bytes; request a smaller limit",
        },
        separators=(",", ":"),
    )


def _task_view(task: Any) -> dict[str, Any]:
    raw = asdict(task)
    fields = (
        "id",
        "title",
        "body",
        "assignee",
        "status",
        "priority",
        "created_by",
        "created_at",
        "started_at",
        "completed_at",
        "result",
        "current_run_id",
        "max_runtime_seconds",
        "last_heartbeat_at",
        "skills",
        "model_override",
        "provider_override",
        "reasoning_effort",
        "goal_mode",
        "goal_max_turns",
        "block_kind",
        "last_failure_error",
    )
    return {name: raw.get(name) for name in fields}


def _mission_tasks(
    store: MissionStore, mission_id: Any, actor: str, args: dict[str, Any]
) -> list[dict[str, Any]]:
    from panergos_cli import kanban_db as kb

    limit = _optional_int(args, "limit", 1, 500) or 100
    assignee = _optional_text(args, "assignee", 200)
    task_status = _optional_text(args, "task_status", 20)
    if task_status is not None and task_status not in _TASK_STATUSES:
        raise MissionError(f"task_status must be one of {list(_TASK_STATUSES)}")
    include_archived = _optional_bool(args, "include_archived", False)
    with closing(store.connect()) as conn:
        mission = store.require_mission(conn, mission_id, actor)
        tasks = kb.list_tasks(
            conn,
            assignee=assignee,
            status=task_status,
            tenant=mission["id"],
            include_archived=include_archived,
            limit=limit,
        )
    return [_task_view(task) for task in tasks]


def _add_task(
    store: MissionStore,
    mission_id: Any,
    args: dict[str, Any],
    actor: str,
    context: dict[str, Any],
) -> dict[str, Any]:
    from panergos_cli import kanban_db as kb

    title = _optional_text(args, "title", 500)
    assignee = _optional_text(args, "assignee", 200)
    if title is None or assignee is None:
        raise MissionError("title and assignee are required for action=add_task")
    body = _optional_text(args, "body", 65_536, allow_empty=True)
    parents = _string_list(args, "parents")
    skills = _string_list(args, "skills", maximum=50)
    priority = args.get("priority", 0)
    if (
        not isinstance(priority, int)
        or isinstance(priority, bool)
        or not -100 <= priority <= 100
    ):
        raise MissionError("priority must be an integer from -100 to 100")
    max_runtime = _optional_int(args, "max_runtime_seconds", 30, 604_800)
    max_retries = _optional_int(args, "max_retries", 0, 100)
    goal_turns = _optional_int(args, "goal_max_turns", 1, 100)
    model = _optional_text(args, "model", 200)
    provider = _optional_text(args, "provider", 200)
    reasoning = _optional_text(args, "reasoning_effort", 32)
    contract = _optional_text(args, "completion_contract", 16_000)
    session_id = context.get("session_id")
    if session_id is not None and (
        not isinstance(session_id, str) or len(session_id.strip()) > 500
    ):
        raise MissionError("session_id must be a string of at most 500 characters")
    idempotency = _optional_text(args, "idempotency_key", 200)
    with store.write() as conn:
        mission = store.require_mission(conn, mission_id, actor)
        if mission["status"] != "active":
            raise MissionError(
                f"mission must be active to add tasks (current: {mission['status']})"
            )
        if parents:
            placeholders = ",".join("?" for _ in parents)
            rows = conn.execute(
                f"SELECT id,tenant FROM tasks WHERE id IN ({placeholders})", parents
            ).fetchall()
            found = {str(row["id"]): row["tenant"] for row in rows}
            missing = [parent for parent in parents if parent not in found]
            foreign = [
                parent for parent in parents if found.get(parent) != mission["id"]
            ]
            if missing:
                raise MissionError(f"parent tasks not found: {', '.join(missing)}")
            if foreign:
                raise MissionError(
                    f"parent tasks belong to another mission: {', '.join(foreign)}"
                )
        task_id = kb.create_task(
            conn,
            title=title,
            body=body,
            assignee=assignee,
            created_by=actor,
            workspace_kind="scratch",
            tenant=mission["id"],
            priority=priority,
            parents=parents,
            idempotency_key=(f"{mission['id']}:{idempotency}" if idempotency else None),
            max_runtime_seconds=max_runtime,
            skills=skills or None,
            max_retries=max_retries,
            model_override=model,
            provider_override=provider,
            reasoning_effort=reasoning,
            goal_mode=_optional_bool(args, "goal_mode", True),
            goal_max_turns=goal_turns,
            initial_status="running",
            session_id=session_id.strip() if isinstance(session_id, str) else None,
            board=mission["board"] if "board" in mission.keys() else "panergos-missions",
            completion_contract=contract,
        )
        task = kb.get_task(conn, task_id)
        if task is None:  # pragma: no cover - same-transaction task INSERT contract
            raise RuntimeError("task insert was not visible")
        if task.tenant != mission["id"]:
            raise MissionError(
                "idempotency key resolved to a task outside this mission"
            )
        return _task_view(task)


def handle_mission(args: dict[str, Any], **context: Any) -> str:
    if not isinstance(args, dict):
        return _response(False, error="tool input must be an object")
    try:
        allowed = MISSION_SCHEMA["parameters"]["properties"]
        unknown = sorted(str(key) for key in args if key not in allowed)
        if unknown:
            raise MissionError(f"unsupported argument(s): {', '.join(unknown)}")
        action_value = args.get("action")
        if not isinstance(action_value, str):
            raise MissionError("action must be a string")
        action = action_value.strip().lower()
        if action not in _ACTIONS:
            raise MissionError(f"action must be one of {list(_ACTIONS)}")
        actor = _actor(context)
        store = MissionStore()
        if action == "create":
            metadata = args.get("metadata")
            if metadata is not None and not isinstance(metadata, dict):
                raise MissionError("metadata must be an object")
            data: Any = store.create(
                _required(args, "goal"),
                actor,
                metadata=metadata,
                idempotency_key=args.get("idempotency_key"),
            )
        elif action == "list":
            data = store.list_missions(
                actor, status=args.get("status"), limit=args.get("limit", 50)
            )
        else:
            mission_id = _required(args, "mission_id")
            mission = store.get(mission_id, actor)
            if action == "show":
                limit = _optional_int(args, "limit", 1, 500) or 100
                data = {
                    "mission": mission,
                    "tasks": _mission_tasks(store, mission_id, actor, {"limit": limit}),
                    "state": store.get_state(mission_id, actor),
                    "inbox": store.inbox(
                        actor, mission_id=mission_id, limit=min(limit, 100)
                    ),
                }
            elif action == "set_status":
                data = store.transition(
                    mission_id,
                    _required(args, "status"),
                    actor,
                    reason=args.get("reason", ""),
                )
            elif action == "add_task":
                data = _add_task(store, mission_id, args, actor, context)
            elif action == "list_tasks":
                data = _mission_tasks(store, mission_id, actor, args)
            elif action == "put_state":
                data = store.put_state(
                    mission_id,
                    _required(args, "key"),
                    args.get("value"),
                    actor,
                    expected_version=args.get("expected_version"),
                    replace_type=_optional_bool(args, "replace_type", False),
                )
            elif action == "get_state":
                data = store.get_state(mission_id, actor, key=args.get("key"))
            elif action == "send":
                data = store.send(
                    mission_id,
                    actor,
                    _required(args, "recipient"),
                    args.get("message"),
                    kind=args.get("kind", "message"),
                    request_id=args.get("request_id"),
                )
            elif action == "inbox":
                data = store.inbox(
                    actor,
                    mission_id=mission_id,
                    unread_only=_optional_bool(args, "unread_only", True),
                    limit=args.get("limit", 100),
                )
            elif action == "ack":
                data = store.acknowledge(
                    _required(args, "message_id"), actor, mission_id=mission_id
                )
            else:
                data = store.events(
                    mission_id,
                    actor,
                    after=args.get("after", 0),
                    limit=args.get("limit", 200),
                )
        return _response(True, data=data)
    except RecursionError:
        return _response(False, error="mission input contains excessively deep JSON")
    except (MissionError, ValueError, RuntimeError) as exc:
        return _response(False, error=str(exc))


def _setup_cli(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("action", choices=_ACTIONS)
    parser.add_argument(
        "--data", default="{}", help="JSON object containing action arguments"
    )


def _cli(args: argparse.Namespace, *, profile_name: str | None = None) -> int:
    try:
        if not isinstance(args.data, str) or len(args.data.encode("utf-8")) > 262_144:
            raise ValueError(
                "--data must be a JSON object of at most 262144 UTF-8 bytes"
            )
        payload = json.loads(args.data)
        if not isinstance(payload, dict):
            raise ValueError("--data must decode to a JSON object")
    except RecursionError:
        print(_response(False, error="arguments contain excessively deep JSON"))
        return 2
    except (json.JSONDecodeError, ValueError) as exc:
        print(_response(False, error=str(exc)))
        return 2
    payload["action"] = args.action
    result = handle_mission(payload, profile_name=profile_name)
    print(result)
    return 0 if json.loads(result).get("success") else 1


def _slash(raw_args: str, *, profile_name: str | None = None) -> str:
    if not isinstance(raw_args, str):
        return _response(False, error="arguments must be at most 262144 UTF-8 bytes")
    try:
        if len(raw_args.encode("utf-8")) > 262_144:
            return _response(False, error="arguments must be at most 262144 UTF-8 bytes")
    except UnicodeError as exc:
        return _response(False, error=str(exc))
    action, _, raw = raw_args.strip().partition(" ")
    if not action:
        return "Usage: /panergos-mission <action> [JSON object]"
    try:
        payload = json.loads(raw) if raw else {}
        if not isinstance(payload, dict):
            raise ValueError("arguments must be a JSON object")
    except RecursionError:
        return _response(False, error="arguments contain excessively deep JSON")
    except (json.JSONDecodeError, ValueError) as exc:
        return _response(False, error=str(exc))
    payload["action"] = action
    return handle_mission(payload, profile_name=profile_name)


def register(ctx) -> None:
    def tool_handler(args: dict[str, Any], **context: Any) -> str:
        context.setdefault("profile_name", ctx.profile_name)
        return handle_mission(args, **context)

    ctx.register_tool(
        name="panergos_mission",
        toolset="panergos_missions",
        schema=MISSION_SCHEMA,
        handler=tool_handler,
        description="Durable multi-agent missions with shared state and peer messaging",
        emoji="🧭",
    )
    ctx.register_cli_command(
        name="missions",
        help="Operate Panergos durable multi-agent missions",
        setup_fn=_setup_cli,
        handler_fn=lambda args: _cli(args, profile_name=ctx.profile_name),
        description="Create and inspect Panergos missions backed by the Panergos Kanban runtime",
    )
    ctx.register_command(
        name="panergos-mission",
        handler=lambda raw: _slash(raw, profile_name=ctx.profile_name),
        description="Operate a Panergos mission with an action and JSON arguments",
        args_hint="<action> [JSON]",
        argument_mode="text",
    )
