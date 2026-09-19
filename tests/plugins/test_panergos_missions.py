"""Behavior and adversarial boundaries for the Panergos missions plugin."""

from __future__ import annotations

import argparse
import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path

import pytest
import yaml

from panergos_cli import kanban_db as kb
from panergos_cli.plugins import PluginManager
from plugins.panergos_missions import _cli, _slash, handle_mission
from plugins.panergos_missions.store import MissionError, MissionStore


def test_bundled_plugin_requires_explicit_opt_in():
    manager = PluginManager()
    manager.discover_and_load()
    loaded = manager._plugins["panergos_missions"]
    assert loaded.manifest.source == "bundled"
    assert loaded.manifest.kind == "standalone"
    assert loaded.enabled is False
    assert loaded.error and "not enabled" in loaded.error

    config = Path(os.environ["PANERGOS_HOME"]) / "config.yaml"
    config.write_text(
        yaml.safe_dump({"plugins": {"enabled": ["panergos_missions"]}}),
        encoding="utf-8",
    )
    manager = PluginManager()
    manager.discover_and_load()
    loaded = manager._plugins["panergos_missions"]
    assert loaded.enabled is True, loaded.error
    assert "panergos_mission" in loaded.tools_registered
    assert manager._cli_commands["missions"]["plugin"] == "panergos_missions"
    assert manager._plugin_commands["panergos-mission"]["plugin"] == "panergos_missions"


def test_store_authorizes_members_and_scopes_idempotency(tmp_path):
    path = tmp_path / "kanban.db"
    store = MissionStore(path)
    mission = store.create(
        "Research, implement, and verify a release",
        "planner",
        idempotency_key="release-1",
    )
    assert (
        store.create("ignored on retry", "planner", idempotency_key="release-1")["id"]
        == mission["id"]
    )
    other = store.create("Independent release", "attacker", idempotency_key="release-1")
    assert other["id"] != mission["id"]
    assert (
        store.create("ignored on retry", "attacker", idempotency_key="release-1")[
            "id"
        ]
        == other["id"]
    )

    with ThreadPoolExecutor(max_workers=2) as pool:
        concurrent = list(
            pool.map(
                lambda actor: store.create(
                    f"Concurrent mission for {actor}",
                    actor,
                    idempotency_key="shared-concurrent-key",
                ),
                ("creator-a", "creator-b"),
            )
        )
    assert {item["created_by"] for item in concurrent} == {"creator-a", "creator-b"}
    assert len({item["id"] for item in concurrent}) == 2

    with store.write() as conn:
        task_id = kb.create_task(
            conn,
            title="Build release",
            assignee="builder",
            created_by="planner",
            tenant=mission["id"],
            initial_status="running",
            idempotency_key=f"{mission['id']}:build",
        )

    first = store.put_state(
        mission["id"], "release.plan", {"phase": 1}, "planner", expected_version=0
    )
    assert first["version"] == 1
    second = store.put_state(
        mission["id"], "release.plan", {"phase": 2}, "builder", expected_version=1
    )
    assert second["version"] == 2
    with pytest.raises(MissionError, match="version conflict"):
        store.put_state(
            mission["id"], "release.plan", {"phase": 3}, "builder", expected_version=1
        )
    with pytest.raises(MissionError, match="NaN"):
        store.put_state(mission["id"], "bad", float("nan"), "planner")

    message = store.send(
        mission["id"], "planner", "builder", {"task": "ship"}, request_id="handoff-1"
    )
    assert (
        store.send(
            mission["id"],
            "planner",
            "builder",
            {"task": "ship"},
            request_id="handoff-1",
        )["id"]
        == message["id"]
    )
    with pytest.raises(MissionError, match="different payload"):
        store.send(
            mission["id"],
            "planner",
            "builder",
            {"task": "changed"},
            request_id="handoff-1",
        )
    reverse = store.send(
        mission["id"], "builder", "planner", {"ok": True}, request_id="handoff-1"
    )
    assert reverse["id"] != message["id"]
    with pytest.raises(MissionError, match="intended recipient"):
        store.acknowledge(message["id"], "planner", mission_id=mission["id"])
    assert (
        store.acknowledge(message["id"], "builder", mission_id=mission["id"])[
            "acknowledged_by"
        ]
        == "builder"
    )

    with pytest.raises(MissionError, match="not authorized"):
        store.get(mission["id"], "attacker")
    with pytest.raises(MissionError, match="not authorized"):
        store.get_state(mission["id"], "attacker")
    with pytest.raises(MissionError, match="not authorized"):
        store.events(mission["id"], "attacker")
    assert [item["id"] for item in store.list_missions("attacker")] == [other["id"]]
    assert store.list_missions("builder")[0]["id"] == mission["id"]
    assert store.get(mission["id"], task_id)["id"] == mission["id"]

    reopened = MissionStore(path)
    assert reopened.get(mission["id"], "planner")["goal"].startswith("Research")
    assert reopened.get_state(mission["id"], "builder", key="release.plan")[0][
        "value"
    ] == {"phase": 2}
    assert (
        reopened.inbox("builder", mission_id=mission["id"], unread_only=False)[0]["id"]
        == message["id"]
    )
    events = reopened.events(mission["id"], "planner")
    assert any(
        event["kind"] == "task.created"
        and event["task_id"] == task_id
        and event["actor"] == "planner"
        for event in events
    )


def test_task_creation_is_atomic_and_lifecycle_is_safe(monkeypatch):
    created = json.loads(
        handle_mission(
            {
                "action": "create",
                "goal": "Build a tested artifact",
                "idempotency_key": "tool-flow",
            },
            actor_override="planner",
        )
    )
    assert created["success"] is True
    mission_id = created["data"]["id"]

    added = json.loads(
        handle_mission(
            {
                "action": "add_task",
                "mission_id": mission_id,
                "title": "Implement artifact",
                "assignee": "builder",
                "goal_mode": True,
                "goal_max_turns": 4,
                "idempotency_key": "implement",
            },
            actor_override="planner",
            session_id="session-1",
        )
    )
    assert added["success"] is True, added
    task_id = added["data"]["id"]

    monkeypatch.setenv("PANERGOS_KANBAN_TASK", task_id)
    worker_view = json.loads(
        handle_mission(
            {"action": "show", "mission_id": mission_id},
            task_id="forged-context-task",
            session_id="unrelated-session",
        )
    )
    assert worker_view["success"] is True
    override_denied = json.loads(
        handle_mission(
            {"action": "show", "mission_id": mission_id},
            actor_override="attacker",
            session_id="session-1",
        )
    )
    assert override_denied["success"] is False

    filtered = json.loads(
        handle_mission(
            {
                "action": "list_tasks",
                "mission_id": mission_id,
                "task_status": added["data"]["status"],
                "include_archived": False,
            },
            actor_override="planner",
        )
    )
    assert [task["id"] for task in filtered["data"]] == [task_id]
    bad_bool = json.loads(
        handle_mission(
            {
                "action": "list_tasks",
                "mission_id": mission_id,
                "include_archived": "false",
            },
            actor_override="planner",
        )
    )
    assert bad_bool == {"success": False, "error": "include_archived must be a boolean"}

    paused = json.loads(
        handle_mission(
            {"action": "set_status", "mission_id": mission_id, "status": "paused"},
            actor_override="planner",
        )
    )
    assert paused["data"]["status"] == "paused"
    rejected = json.loads(
        handle_mission(
            {
                "action": "add_task",
                "mission_id": mission_id,
                "title": "Late task",
                "assignee": "builder",
            },
            actor_override="planner",
        )
    )
    assert rejected["success"] is False
    assert "must be active" in rejected["error"]

    resumed = json.loads(
        handle_mission(
            {"action": "set_status", "mission_id": mission_id, "status": "active"},
            actor_override="planner",
        )
    )
    assert resumed["data"]["status"] == "active"
    premature = json.loads(
        handle_mission(
            {
                "action": "set_status",
                "mission_id": mission_id,
                "status": "completed",
            },
            actor_override="planner",
        )
    )
    assert premature["success"] is False
    assert "tasks are outstanding" in premature["error"]

    store = MissionStore()
    with closing(store.connect()) as conn:
        assert kb.complete_task(conn, task_id, result="done") is True
    complete = json.loads(
        handle_mission(
            {
                "action": "set_status",
                "mission_id": mission_id,
                "status": "completed",
            },
            actor_override="planner",
        )
    )
    assert complete["data"]["status"] == "completed"


def test_cross_mission_parent_is_rejected_and_cancel_archives_tasks():
    first = json.loads(
        handle_mission(
            {"action": "create", "goal": "First", "idempotency_key": "first"},
            actor_override="owner",
        )
    )["data"]
    second = json.loads(
        handle_mission(
            {"action": "create", "goal": "Second", "idempotency_key": "second"},
            actor_override="owner",
        )
    )["data"]
    parent = json.loads(
        handle_mission(
            {
                "action": "add_task",
                "mission_id": first["id"],
                "title": "Parent",
                "assignee": "worker",
            },
            actor_override="owner",
        )
    )["data"]
    foreign = json.loads(
        handle_mission(
            {
                "action": "add_task",
                "mission_id": second["id"],
                "title": "Child",
                "assignee": "worker",
                "parents": [parent["id"]],
            },
            actor_override="owner",
        )
    )
    assert foreign["success"] is False
    assert "another mission" in foreign["error"]

    cancelled = json.loads(
        handle_mission(
            {
                "action": "set_status",
                "mission_id": first["id"],
                "status": "cancelled",
            },
            actor_override="owner",
        )
    )
    assert cancelled["data"]["status"] == "cancelled"
    store = MissionStore()
    with closing(store.connect()) as conn:
        parent_task = kb.get_task(conn, parent["id"])
        assert parent_task is not None
        assert parent_task.status == "archived"


def test_dedicated_board_ignores_worker_db_pin(tmp_path, monkeypatch):
    from panergos_cli.kanban_db_connect import connect

    foreign_path = tmp_path / "project-board" / "kanban.db"
    with closing(connect(db_path=foreign_path)):
        pass
    monkeypatch.setenv("PANERGOS_KANBAN_DB", str(foreign_path))

    store = MissionStore()
    mission = store.create("Pinned mission", "owner")
    expected = (kb.board_dir("panergos-missions") / "kanban.db").resolve()
    with closing(store.connect()) as conn:
        actual = Path(str(conn.execute("PRAGMA database_list").fetchone()[2])).resolve()
        assert actual == expected
        assert conn.execute(
            "SELECT 1 FROM panergos_missions WHERE id=?", (mission["id"],)
        ).fetchone()
    with closing(connect(db_path=foreign_path)) as conn:
        assert (
            conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='panergos_missions'"
            ).fetchone()
            is None
        )


def test_terminal_archive_failure_leaves_no_runnable_terminal_mission(
    tmp_path, monkeypatch
):
    store = MissionStore(tmp_path / "kanban.db")
    mission = store.create("Stop safely", "owner")
    with store.write() as conn:
        task_ids = []
        for title in ("one", "two"):
            task_ids.append(
                kb.create_task(
                conn,
                title=title,
                assignee="worker",
                created_by="owner",
                tenant=mission["id"],
                initial_status="running",
            )
            )
        conn.execute("UPDATE tasks SET status='running' WHERE id=?", (task_ids[0],))

    real_archive = kb.archive_task
    def flaky_archive(conn, task_id):
        if task_id == task_ids[0]:
            raise RuntimeError("injected archive failure")
        return real_archive(conn, task_id)

    monkeypatch.setattr(kb, "archive_task", flaky_archive)
    with pytest.raises(MissionError, match="remains paused"):
        store.transition(mission["id"], "cancelled", "owner")

    assert store.get(mission["id"], "owner")["status"] == "paused"
    with closing(store.connect()) as conn:
        statuses = {
            str(row["status"])
            for row in conn.execute(
                "SELECT status FROM tasks WHERE tenant=?", (mission["id"],)
            ).fetchall()
        }
    assert statuses <= {"blocked", "archived", "done"}
    with pytest.raises(MissionError, match="pending terminal stop"):
        store.transition(mission["id"], "active", "owner")
    monkeypatch.setattr(kb, "archive_task", real_archive)
    assert store.transition(mission["id"], "cancelled", "owner")["status"] == "cancelled"
    with closing(store.connect()) as conn:
        assert conn.execute(
            "SELECT 1 FROM panergos_stop_fences WHERE mission_id=?", (mission["id"],)
        ).fetchone() is None
        assert {
            str(row["status"])
            for row in conn.execute(
                "SELECT status FROM tasks WHERE tenant=?", (mission["id"],)
            ).fetchall()
        } <= {"done", "archived"}


def test_terminal_stop_fence_rejects_concurrent_resume(tmp_path, monkeypatch):
    store = MissionStore(tmp_path / "kanban.db")
    mission = store.create("Stop without a resume race", "owner")
    with store.write() as conn:
        task_id = kb.create_task(
            conn,
            title="one",
            assignee="worker",
            created_by="owner",
            tenant=mission["id"],
            initial_status="running",
        )

    real_archive = kb.archive_task
    archive_entered = threading.Event()
    release_archive = threading.Event()

    def paused_archive(conn, current_task_id):
        archive_entered.set()
        assert release_archive.wait(10)
        return real_archive(conn, current_task_id)

    monkeypatch.setattr(kb, "archive_task", paused_archive)
    result = {}

    def stop():
        try:
            result["mission"] = store.transition(
                mission["id"], "cancelled", "owner"
            )
        except Exception as exc:  # surfaced in the main test thread below
            result["error"] = exc

    thread = threading.Thread(target=stop)
    thread.start()
    assert archive_entered.wait(10)
    try:
        with pytest.raises(MissionError, match="pending terminal stop"):
            store.transition(mission["id"], "active", "owner")
    finally:
        release_archive.set()
        thread.join(10)

    assert not thread.is_alive()
    assert "error" not in result
    assert result["mission"]["status"] == "cancelled"
    with closing(store.connect()) as conn:
        task = kb.get_task(conn, task_id)
        assert task is not None
        assert task.status == "archived"


def test_profile_identity_survives_session_rollover():
    created = json.loads(
        handle_mission(
            {
                "action": "create",
                "goal": "Survive a new chat session",
                "idempotency_key": "profile-owner",
            },
            profile_name="planner-profile",
            session_id="old-session",
        )
    )
    reopened = json.loads(
        handle_mission(
            {"action": "show", "mission_id": created["data"]["id"]},
            profile_name="planner-profile",
            session_id="new-session",
        )
    )
    assert reopened["success"] is True
    assert reopened["data"]["mission"]["created_by"] == "planner-profile"


def test_cli_profile_identity_and_surface_validation(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("PANERGOS_KANBAN_HOME", str(tmp_path))
    monkeypatch.delenv("PANERGOS_KANBAN_DB", raising=False)
    monkeypatch.delenv("PANERGOS_KANBAN_TASK", raising=False)
    monkeypatch.delenv("PANERGOS_PROFILE", raising=False)

    create_args = argparse.Namespace(
        action="create",
        data=json.dumps(
            {"goal": "CLI profile isolation", "idempotency_key": "cli-profile"}
        ),
    )
    assert _cli(create_args, profile_name="cli-alice") == 0
    created = json.loads(capsys.readouterr().out)
    assert created["data"]["created_by"] == "cli-alice"

    list_args = argparse.Namespace(action="list", data="{}")
    assert _cli(list_args, profile_name="cli-bob") == 0
    assert json.loads(capsys.readouterr().out)["data"] == []
    assert _cli(list_args, profile_name="cli-alice") == 0
    assert [item["id"] for item in json.loads(capsys.readouterr().out)["data"]] == [
        created["data"]["id"]
    ]

    unknown_args = argparse.Namespace(
        action="create", data='{"goal":"must not exist","bogus":true}'
    )
    assert _cli(unknown_args, profile_name="cli-alice") == 1
    cli_unknown = json.loads(capsys.readouterr().out)
    assert cli_unknown == {
        "success": False,
        "error": "unsupported argument(s): bogus",
    }
    slash_unknown = json.loads(
        _slash('create {"goal":"must not exist","bogus":true}', profile_name="slash")
    )
    assert slash_unknown == cli_unknown


def test_cli_and_slash_reject_excessively_deep_json(capsys):
    deep = "[" * 1_100 + "0" + "]" * 1_100
    args = argparse.Namespace(
        action="put_state",
        data='{"mission_id":"x","key":"x","value":' + deep + "}",
    )
    assert _cli(args, profile_name="cli-profile") == 2
    assert json.loads(capsys.readouterr().out) == {
        "success": False,
        "error": "arguments contain excessively deep JSON",
    }
    assert json.loads(
        _slash(
            'put_state {"mission_id":"x","key":"x","value":' + deep + "}",
            profile_name="slash-profile",
        )
    ) == {
        "success": False,
        "error": "arguments contain excessively deep JSON",
    }
