"""Mission coordination layered on Panergos's durable Kanban database."""

from __future__ import annotations

import json
import math
import re
import sqlite3
import time
import uuid
from contextlib import closing, contextmanager
from pathlib import Path
from typing import Any, Iterator


BOARD = "panergos-missions"


class MissionError(ValueError):
    """A caller-visible mission contract violation."""


_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$")
_STATUSES = {"active", "paused", "completed", "failed", "cancelled"}
_TRANSITIONS = {
    "active": {"paused", "completed", "failed", "cancelled"},
    "paused": {"active", "failed", "cancelled"},
    "failed": {"active", "cancelled"},
    "completed": set(),
    "cancelled": set(),
}
_PARKABLE_TASK_STATUSES = ("triage", "todo", "scheduled", "ready", "review")
_SCHEMA = """
CREATE TABLE IF NOT EXISTS panergos_missions (
    id TEXT PRIMARY KEY,
    goal TEXT NOT NULL CHECK(length(trim(goal)) > 0),
    status TEXT NOT NULL CHECK(status IN ('active','paused','completed','failed','cancelled')),
    created_by TEXT NOT NULL CHECK(length(trim(created_by)) > 0),
    metadata_json TEXT NOT NULL,
    idempotency_key TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(created_by, idempotency_key)
);
CREATE TABLE IF NOT EXISTS panergos_state (
    mission_id TEXT NOT NULL REFERENCES panergos_missions(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value_type TEXT NOT NULL,
    value_json TEXT NOT NULL,
    version INTEGER NOT NULL CHECK(version > 0),
    updated_by TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (mission_id, key)
);
CREATE TABLE IF NOT EXISTS panergos_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL REFERENCES panergos_missions(id) ON DELETE CASCADE,
    sender TEXT NOT NULL,
    recipient TEXT NOT NULL,
    kind TEXT NOT NULL,
    body_json TEXT NOT NULL,
    request_id TEXT,
    created_at INTEGER NOT NULL,
    acknowledged_at INTEGER,
    acknowledged_by TEXT,
    UNIQUE(mission_id, sender, request_id),
    CHECK (
        (acknowledged_at IS NULL AND acknowledged_by IS NULL) OR
        (acknowledged_at IS NOT NULL AND acknowledged_by IS NOT NULL)
    )
);
CREATE TABLE IF NOT EXISTS panergos_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL REFERENCES panergos_missions(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK(source IN ('mission','task')),
    source_event_id INTEGER,
    task_id TEXT,
    kind TEXT NOT NULL,
    actor TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(source, source_event_id),
    CHECK (
        (source='mission' AND source_event_id IS NULL AND task_id IS NULL) OR
        (source='task' AND source_event_id IS NOT NULL AND task_id IS NOT NULL)
    )
);
CREATE TABLE IF NOT EXISTS panergos_parked_tasks (
    mission_id TEXT NOT NULL REFERENCES panergos_missions(id) ON DELETE CASCADE,
    task_id TEXT PRIMARY KEY,
    prior_status TEXT NOT NULL,
    prior_block_kind TEXT,
    prior_block_recurrences INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS panergos_stop_fences (
    mission_id TEXT PRIMARY KEY REFERENCES panergos_missions(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    target_status TEXT NOT NULL CHECK(target_status IN ('failed','cancelled')),
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_panergos_missions_status
    ON panergos_missions(status, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_panergos_messages_inbox
    ON panergos_messages(mission_id, recipient, acknowledged_at, id);
CREATE INDEX IF NOT EXISTS idx_panergos_events_stream
    ON panergos_events(mission_id, id);
CREATE TRIGGER IF NOT EXISTS panergos_mirror_task_event
AFTER INSERT ON task_events
WHEN EXISTS (
    SELECT 1 FROM tasks t JOIN panergos_missions m ON m.id=t.tenant
    WHERE t.id=NEW.task_id
)
BEGIN
    INSERT OR IGNORE INTO panergos_events(
        mission_id,source,source_event_id,task_id,kind,actor,payload_json,created_at
    )
    SELECT t.tenant,'task',NEW.id,NEW.task_id,'task.' || NEW.kind,
           CASE
               WHEN NEW.kind='created' AND t.created_by IS NOT NULL
               THEN t.created_by
               WHEN json_valid(COALESCE(NEW.payload,'{}'))
                AND typeof(json_extract(COALESCE(NEW.payload,'{}'),'$.actor'))='text'
               THEN json_extract(NEW.payload,'$.actor')
               ELSE 'kanban'
           END,
           COALESCE(NEW.payload,'{}'),NEW.created_at
    FROM tasks t WHERE t.id=NEW.task_id;
    UPDATE panergos_missions
       SET updated_at=MAX(updated_at,NEW.created_at)
     WHERE id=(SELECT tenant FROM tasks WHERE id=NEW.task_id);
END;
"""


def _text(value: Any, name: str, *, maximum: int, required: bool = True) -> str:
    if value is None and not required:
        return ""
    if not isinstance(value, str):
        raise MissionError(f"{name} must be a string")
    value = value.strip()
    if required and not value:
        raise MissionError(f"{name} is required")
    if len(value) > maximum:
        raise MissionError(f"{name} must be at most {maximum} characters")
    return value


def _identifier(value: Any, name: str) -> str:
    value = _text(value, name, maximum=200)
    if not _ID_RE.fullmatch(value):
        raise MissionError(f"{name} contains unsupported characters")
    return value


def _json(value: Any, name: str, *, maximum: int = 262_144) -> str:
    def reject_non_finite(item: Any) -> None:
        if isinstance(item, float) and not math.isfinite(item):
            raise MissionError(f"{name} cannot contain NaN or Infinity")
        if isinstance(item, list):
            for child in item:
                reject_non_finite(child)
        elif isinstance(item, dict):
            for child in item.values():
                reject_non_finite(child)

    reject_non_finite(value)
    try:
        encoded = json.dumps(
            value, ensure_ascii=False, separators=(",", ":"), allow_nan=False
        )
    except (TypeError, ValueError) as exc:
        raise MissionError(f"{name} must be valid JSON: {exc}") from exc
    if len(encoded.encode("utf-8")) > maximum:
        raise MissionError(f"{name} is too large (maximum {maximum} UTF-8 bytes)")
    return encoded


def _value_type(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    raise MissionError("value must be JSON-compatible")


class MissionStore:
    def __init__(self, db_path: str | Path | None = None):
        self.db_path = Path(db_path) if db_path is not None else None
        if self.db_path is None:
            from panergos_cli import kanban_db as kb

            if not kb.board_exists(BOARD):
                kb.write_board_metadata(
                    BOARD,
                    name="Panergos Missions",
                    description="Durable multi-agent missions",
                    icon="🧭",
                )
        with closing(self.connect()) as conn:
            conn.executescript(_SCHEMA)

    def connect(self) -> sqlite3.Connection:
        from panergos_cli import kanban_db as kb
        from panergos_cli.kanban_db_connect import connect

        path = self.db_path or (kb.board_dir(BOARD) / "kanban.db")
        return connect(db_path=path)

    @contextmanager
    def write(self) -> Iterator[sqlite3.Connection]:
        from panergos_cli.kanban_db_connect import write_txn

        with closing(self.connect()) as conn:
            with write_txn(conn):
                yield conn

    @staticmethod
    def _event(
        conn: sqlite3.Connection, mission_id: str, actor: str, kind: str, payload: Any
    ) -> None:
        conn.execute(
            """INSERT INTO panergos_events(
                   mission_id,source,source_event_id,task_id,kind,actor,payload_json,created_at
               ) VALUES(?,'mission',NULL,NULL,?,?,?,?)""",
            (
                mission_id,
                kind,
                actor,
                _json(payload, "event payload"),
                int(time.time()),
            ),
        )

    @staticmethod
    def _mission(row: sqlite3.Row) -> dict[str, Any]:
        item = dict(row)
        item["metadata"] = json.loads(str(item.pop("metadata_json")))
        item["board"] = BOARD
        return item

    @staticmethod
    def _state(row: sqlite3.Row) -> dict[str, Any]:
        item = dict(row)
        item["value"] = json.loads(str(item.pop("value_json")))
        return item

    @staticmethod
    def _authorized(conn: sqlite3.Connection, mission_id: str, actor: str) -> bool:
        return (
            conn.execute(
                """SELECT 1
                     FROM panergos_missions m
                    WHERE m.id=?
                      AND (
                          m.created_by=? OR EXISTS (
                              SELECT 1 FROM tasks t
                               WHERE t.tenant=m.id AND (t.id=? OR t.assignee=?)
                          )
                      )""",
                (mission_id, actor, actor, actor),
            ).fetchone()
            is not None
        )

    def require_mission(
        self, conn: sqlite3.Connection, mission_id: Any, actor: Any
    ) -> sqlite3.Row:
        mission_id = _identifier(mission_id, "mission_id")
        actor = _text(actor, "actor", maximum=200)
        row = conn.execute(
            "SELECT * FROM panergos_missions WHERE id=?", (mission_id,)
        ).fetchone()
        if row is None or not self._authorized(conn, mission_id, actor):
            raise MissionError("mission not found or actor is not authorized")
        return row

    def create(
        self,
        goal: Any,
        actor: Any,
        *,
        metadata: Any = None,
        idempotency_key: Any = None,
    ) -> dict[str, Any]:
        goal = _text(goal, "goal", maximum=16_000)
        actor = _text(actor, "actor", maximum=200)
        metadata_json = _json(
            {} if metadata is None else metadata, "metadata", maximum=65_536
        )
        if idempotency_key is not None:
            idempotency_key = _identifier(idempotency_key, "idempotency_key")
        mission_id, now = f"m_{uuid.uuid4().hex[:16]}", int(time.time())
        with self.write() as conn:
            if idempotency_key:
                row = conn.execute(
                    """SELECT * FROM panergos_missions
                         WHERE created_by=? AND idempotency_key=?""",
                    (actor, idempotency_key),
                ).fetchone()
                if row is not None:
                    return self._mission(row)
            conn.execute(
                """INSERT INTO panergos_missions(
                       id,goal,status,created_by,metadata_json,idempotency_key,created_at,updated_at
                   ) VALUES(?,?,'active',?,?,?,?,?)""",
                (
                    mission_id,
                    goal,
                    actor,
                    metadata_json,
                    idempotency_key,
                    now,
                    now,
                ),
            )
            self._event(conn, mission_id, actor, "mission.created", {"goal": goal})
            row = conn.execute(
                "SELECT * FROM panergos_missions WHERE id=?", (mission_id,)
            ).fetchone()
            if row is None:  # pragma: no cover - same-transaction INSERT contract
                raise RuntimeError("mission insert was not visible")
            return self._mission(row)

    def get(self, mission_id: Any, actor: Any) -> dict[str, Any]:
        with closing(self.connect()) as conn:
            return self._mission(self.require_mission(conn, mission_id, actor))

    def list_missions(
        self, actor: Any, *, status: Any = None, limit: Any = 50
    ) -> list[dict[str, Any]]:
        actor = _text(actor, "actor", maximum=200)
        if (
            not isinstance(limit, int)
            or isinstance(limit, bool)
            or not 1 <= limit <= 200
        ):
            raise MissionError("limit must be an integer from 1 to 200")
        status_clause, params = "", [actor, actor, actor]
        if status is not None:
            status = _text(status, "status", maximum=20).lower()
            if status not in _STATUSES:
                raise MissionError(f"status must be one of {sorted(_STATUSES)}")
            status_clause = " AND m.status=?"
            params.append(status)
        with closing(self.connect()) as conn:
            rows = conn.execute(
                f"""SELECT m.* FROM panergos_missions m
                     WHERE (
                         m.created_by=? OR EXISTS (
                             SELECT 1 FROM tasks t
                              WHERE t.tenant=m.id AND (t.id=? OR t.assignee=?)
                         )
                     ){status_clause}
                     ORDER BY m.updated_at DESC,m.id LIMIT ?""",
                (*params, limit),
            ).fetchall()
        return [self._mission(row) for row in rows]

    @staticmethod
    def _park_pending_tasks(
        conn: sqlite3.Connection, mission_id: str, actor: str, reason: str
    ) -> None:
        placeholders = ",".join("?" for _ in _PARKABLE_TASK_STATUSES)
        rows = conn.execute(
            f"""SELECT id,status,block_kind,block_recurrences FROM tasks
                  WHERE tenant=? AND status IN ({placeholders})""",
            (mission_id, *_PARKABLE_TASK_STATUSES),
        ).fetchall()
        now = int(time.time())
        payload = _json(
            {
                "reason": reason or "mission paused",
                "kind": "needs_input",
                "actor": actor,
            },
            "task event",
        )
        for row in rows:
            conn.execute(
                """INSERT OR IGNORE INTO panergos_parked_tasks(
                       mission_id,task_id,prior_status,prior_block_kind,prior_block_recurrences
                   ) VALUES(?,?,?,?,?)""",
                (
                    mission_id,
                    row["id"],
                    row["status"],
                    row["block_kind"],
                    int(row["block_recurrences"] or 0),
                ),
            )
            if conn.execute(
                """UPDATE tasks SET status='blocked',block_kind='needs_input'
                     WHERE id=? AND status=?""",
                (row["id"], row["status"]),
            ).rowcount:
                conn.execute(
                    """INSERT INTO task_events(task_id,run_id,kind,payload,created_at)
                       VALUES(?,NULL,'blocked',?,?)""",
                    (row["id"], payload, now),
                )

    @classmethod
    def _park_tasks(
        cls, conn: sqlite3.Connection, mission_id: str, actor: str, reason: str
    ) -> None:
        if conn.execute(
            "SELECT 1 FROM tasks WHERE tenant=? AND status='running' LIMIT 1",
            (mission_id,),
        ).fetchone():
            raise MissionError(
                "cannot pause while a mission task is running; complete, block, or cancel it first"
            )
        cls._park_pending_tasks(conn, mission_id, actor, reason)

    @staticmethod
    def _unpark_tasks(conn: sqlite3.Connection, mission_id: str, actor: str) -> None:
        rows = conn.execute(
            """SELECT p.*,t.status FROM panergos_parked_tasks p
                 JOIN tasks t ON t.id=p.task_id WHERE p.mission_id=?""",
            (mission_id,),
        ).fetchall()
        now = int(time.time())
        for row in rows:
            if (
                row["status"] == "blocked"
                and conn.execute(
                    """UPDATE tasks SET status=?,block_kind=?,block_recurrences=?
                     WHERE id=? AND status='blocked' AND block_kind='needs_input'""",
                    (
                        row["prior_status"],
                        row["prior_block_kind"],
                        row["prior_block_recurrences"],
                        row["task_id"],
                    ),
                ).rowcount
            ):
                conn.execute(
                    """INSERT INTO task_events(task_id,run_id,kind,payload,created_at)
                       VALUES(?,NULL,'unblocked',?,?)""",
                    (
                        row["task_id"],
                        _json(
                            {"reason": "mission resumed", "actor": actor}, "task event"
                        ),
                        now,
                    ),
                )
        conn.execute("DELETE FROM panergos_parked_tasks WHERE mission_id=?", (mission_id,))

    @staticmethod
    def _quarantine_tasks(
        conn: sqlite3.Connection, mission_id: str, actor: str, reason: str
    ) -> None:
        """Make every unarchived task non-runnable after a failed terminal stop."""
        from panergos_cli import kanban_db as kb

        rows = conn.execute(
            """SELECT id,status,block_kind,block_recurrences FROM tasks
                 WHERE tenant=? AND status NOT IN ('done','archived')""",
            (mission_id,),
        ).fetchall()
        now = int(time.time())
        for row in rows:
            task_id, source = str(row["id"]), str(row["status"])
            prior = "ready" if source == "running" else source
            conn.execute(
                """INSERT OR IGNORE INTO panergos_parked_tasks(
                       mission_id,task_id,prior_status,prior_block_kind,prior_block_recurrences
                   ) VALUES(?,?,?,?,?)""",
                (
                    mission_id,
                    task_id,
                    prior,
                    row["block_kind"],
                    int(row["block_recurrences"] or 0),
                ),
            )
            run_id = kb._end_run(
                conn,
                task_id,
                outcome="blocked",
                status="blocked",
                summary=reason or "mission stop incomplete",
            )
            if conn.execute(
                """UPDATE tasks
                      SET status='blocked',claim_lock=NULL,claim_expires=NULL,
                          worker_pid=NULL,block_kind='needs_input'
                    WHERE id=? AND status NOT IN ('done','archived')""",
                (task_id,),
            ).rowcount:
                conn.execute(
                    """INSERT INTO task_events(task_id,run_id,kind,payload,created_at)
                       VALUES(?,?,'blocked',?,?)""",
                    (
                        task_id,
                        run_id,
                        _json(
                            {
                                "reason": reason or "mission stop incomplete",
                                "kind": "needs_input",
                                "source_status": source,
                                "actor": actor,
                            },
                            "task event",
                        ),
                        now,
                    ),
                )

    def transition(
        self, mission_id: Any, status: Any, actor: Any, *, reason: Any = ""
    ) -> dict[str, Any]:
        mission_id = _identifier(mission_id, "mission_id")
        status = _text(status, "status", maximum=20).lower()
        actor = _text(actor, "actor", maximum=200)
        reason = _text(reason, "reason", maximum=4_000, required=False)
        if status not in _STATUSES:
            raise MissionError(f"status must be one of {sorted(_STATUSES)}")
        terminal = status in {"failed", "cancelled"}
        stop_token = uuid.uuid4().hex if terminal else None
        with self.write() as conn:
            row = self.require_mission(conn, mission_id, actor)
            current = str(row["status"])
            if status != current and status not in _TRANSITIONS[current]:
                raise MissionError(
                    f"mission cannot transition from {current} to {status}"
                )
            if (
                status == "active"
                and conn.execute(
                    "SELECT 1 FROM panergos_stop_fences WHERE mission_id=?",
                    (mission_id,),
                ).fetchone()
            ):
                raise MissionError(
                    "mission has a pending terminal stop; retry the terminal transition"
                )
            if terminal:
                self._park_pending_tasks(conn, mission_id, actor, reason)
                if current == "active":
                    conn.execute(
                        "UPDATE panergos_missions SET status='paused',updated_at=? WHERE id=?",
                        (int(time.time()), mission_id),
                    )
                    self._event(
                        conn,
                        mission_id,
                        actor,
                        "mission.stopping",
                        {"from": current, "to": status, "reason": reason},
                    )
                conn.execute(
                    """INSERT INTO panergos_stop_fences(
                           mission_id,token,target_status,created_at
                       ) VALUES(?,?,?,?)
                       ON CONFLICT(mission_id) DO UPDATE SET
                           token=excluded.token,target_status=excluded.target_status,
                           created_at=excluded.created_at""",
                    (mission_id, stop_token, status, int(time.time())),
                )
                archive_ids = [
                    str(task["id"])
                    for task in conn.execute(
                        """SELECT id FROM tasks
                             WHERE tenant=? AND status NOT IN ('done','archived')
                             ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END,id""",
                        (mission_id,),
                    ).fetchall()
                ]
            else:
                archive_ids = []
            if (
                status == "completed"
                and conn.execute(
                    """SELECT 1 FROM tasks
                     WHERE tenant=? AND status NOT IN ('done','archived') LIMIT 1""",
                    (mission_id,),
                ).fetchone()
            ):
                raise MissionError(
                    "mission cannot complete while tasks are outstanding"
                )
            if status != current and not terminal:
                if status == "paused":
                    self._park_tasks(conn, mission_id, actor, reason)
                elif current == "paused" and status == "active":
                    self._unpark_tasks(conn, mission_id, actor)
                now = int(time.time())
                conn.execute(
                    "UPDATE panergos_missions SET status=?,updated_at=? WHERE id=?",
                    (status, now, mission_id),
                )
                self._event(
                    conn,
                    mission_id,
                    actor,
                    "mission.status",
                    {"from": current, "to": status, "reason": reason},
                )
            if not terminal:
                result = conn.execute(
                    "SELECT * FROM panergos_missions WHERE id=?", (mission_id,)
                ).fetchone()
                if (
                    result is None
                ):  # pragma: no cover - same-transaction SELECT contract
                    raise RuntimeError("mission transition lost its row")
                return self._mission(result)
        if archive_ids:
            from panergos_cli import kanban_db as kb

            errors: list[str] = []
            with closing(self.connect()) as conn:
                for task_id in archive_ids:
                    try:
                        kb.archive_task(conn, task_id)
                    except (
                        Exception
                    ) as exc:  # best-effort stop every task before reporting
                        errors.append(f"{task_id}: {exc}")
            if errors:
                with self.write() as conn:
                    self.require_mission(conn, mission_id, actor)
                    self._quarantine_tasks(conn, mission_id, actor, reason)
                raise MissionError(
                    "mission stop incomplete; it remains paused: " + "; ".join(errors)
                )
        with self.write() as conn:
            row = self.require_mission(conn, mission_id, actor)
            fence = conn.execute(
                "SELECT token FROM panergos_stop_fences WHERE mission_id=?",
                (mission_id,),
            ).fetchone()
            if fence is None or fence["token"] != stop_token:
                raise MissionError("mission terminal stop was superseded")
            staged = str(row["status"])
            if staged not in {"paused", "failed", status}:
                raise MissionError(
                    f"mission changed to {staged} while it was stopping; terminal transition aborted"
                )
            if conn.execute(
                """SELECT 1 FROM tasks
                     WHERE tenant=? AND status NOT IN ('done','archived') LIMIT 1""",
                (mission_id,),
            ).fetchone():
                raise MissionError("mission stop incomplete; outstanding tasks remain")
            conn.execute(
                "DELETE FROM panergos_parked_tasks WHERE mission_id=?", (mission_id,)
            )
            conn.execute(
                "DELETE FROM panergos_stop_fences WHERE mission_id=? AND token=?",
                (mission_id, stop_token),
            )
            if staged != status:
                conn.execute(
                    "UPDATE panergos_missions SET status=?,updated_at=? WHERE id=?",
                    (status, int(time.time()), mission_id),
                )
                self._event(
                    conn,
                    mission_id,
                    actor,
                    "mission.status",
                    {"from": current, "to": status, "reason": reason},
                )
            result = conn.execute(
                "SELECT * FROM panergos_missions WHERE id=?", (mission_id,)
            ).fetchone()
            if result is None:  # pragma: no cover - same-transaction SELECT contract
                raise RuntimeError("mission terminal transition lost its row")
            return self._mission(result)

    def put_state(
        self,
        mission_id: Any,
        key: Any,
        value: Any,
        actor: Any,
        *,
        expected_version: Any = None,
        replace_type: bool = False,
    ) -> dict[str, Any]:
        mission_id = _identifier(mission_id, "mission_id")
        key = _identifier(key, "key")
        actor = _text(actor, "actor", maximum=200)
        encoded, value_type = _json(value, "value"), _value_type(value)
        if not isinstance(replace_type, bool):
            raise MissionError("replace_type must be a boolean")
        if expected_version is not None and (
            not isinstance(expected_version, int)
            or isinstance(expected_version, bool)
            or expected_version < 0
        ):
            raise MissionError("expected_version must be a non-negative integer")
        with self.write() as conn:
            self.require_mission(conn, mission_id, actor)
            row = conn.execute(
                "SELECT value_type,version FROM panergos_state WHERE mission_id=? AND key=?",
                (mission_id, key),
            ).fetchone()
            current = int(row["version"]) if row else 0
            if expected_version is not None and expected_version != current:
                raise MissionError(
                    f"state version conflict for {key}: expected {expected_version}, current {current}"
                )
            if row and row["value_type"] != value_type and not replace_type:
                raise MissionError(
                    f"state type conflict for {key}: {row['value_type']} cannot become {value_type} without replace_type"
                )
            version, now = current + 1, int(time.time())
            conn.execute(
                """INSERT INTO panergos_state VALUES(?,?,?,?,?,?,?)
                   ON CONFLICT(mission_id,key) DO UPDATE SET
                     value_type=excluded.value_type,value_json=excluded.value_json,
                     version=excluded.version,updated_by=excluded.updated_by,updated_at=excluded.updated_at""",
                (mission_id, key, value_type, encoded, version, actor, now),
            )
            self._event(
                conn,
                mission_id,
                actor,
                "state.changed",
                {"key": key, "version": version, "type": value_type},
            )
            result = conn.execute(
                "SELECT * FROM panergos_state WHERE mission_id=? AND key=?",
                (mission_id, key),
            ).fetchone()
            if result is None:  # pragma: no cover - same-transaction UPSERT contract
                raise RuntimeError("state upsert was not visible")
            return self._state(result)

    def get_state(
        self, mission_id: Any, actor: Any, *, key: Any = None
    ) -> list[dict[str, Any]]:
        mission_id = _identifier(mission_id, "mission_id")
        actor = _text(actor, "actor", maximum=200)
        where, params = "", [mission_id]
        if key is not None:
            where, params = " AND key=?", [mission_id, _identifier(key, "key")]
        with closing(self.connect()) as conn:
            self.require_mission(conn, mission_id, actor)
            rows = conn.execute(
                f"SELECT * FROM panergos_state WHERE mission_id=?{where} ORDER BY key",
                params,
            ).fetchall()
        return [self._state(row) for row in rows]

    def send(
        self,
        mission_id: Any,
        sender: Any,
        recipient: Any,
        body: Any,
        *,
        kind: Any = "message",
        request_id: Any = None,
    ) -> dict[str, Any]:
        mission_id = _identifier(mission_id, "mission_id")
        sender = _text(sender, "sender", maximum=200)
        recipient = _text(recipient, "recipient", maximum=200)
        kind = _identifier(kind, "kind")
        body_json = _json(body, "message", maximum=65_536)
        if request_id is not None:
            request_id = _identifier(request_id, "request_id")
        with self.write() as conn:
            self.require_mission(conn, mission_id, sender)
            if not self._authorized(conn, mission_id, recipient):
                raise MissionError("recipient is not a mission member")
            if request_id:
                row = conn.execute(
                    """SELECT * FROM panergos_messages
                        WHERE mission_id=? AND sender=? AND request_id=?""",
                    (mission_id, sender, request_id),
                ).fetchone()
                if row is not None:
                    if (
                        row["recipient"] != recipient
                        or row["kind"] != kind
                        or json.loads(str(row["body_json"])) != body
                    ):
                        raise MissionError(
                            "request_id was already used by this sender with a different payload"
                        )
                    return self._message(row)
            cur = conn.execute(
                """INSERT INTO panergos_messages(
                       mission_id,sender,recipient,kind,body_json,request_id,created_at
                   ) VALUES(?,?,?,?,?,?,?)""",
                (
                    mission_id,
                    sender,
                    recipient,
                    kind,
                    body_json,
                    request_id,
                    int(time.time()),
                ),
            )
            if cur.lastrowid is None:  # pragma: no cover - SQLite INSERT contract
                raise RuntimeError("SQLite did not return a message id")
            message_id = cur.lastrowid
            self._event(
                conn,
                mission_id,
                sender,
                "message.sent",
                {"message_id": message_id, "recipient": recipient, "kind": kind},
            )
            row = conn.execute(
                "SELECT * FROM panergos_messages WHERE id=?", (message_id,)
            ).fetchone()
            if row is None:  # pragma: no cover - same-transaction INSERT contract
                raise RuntimeError("message insert was not visible")
            return self._message(row)

    @staticmethod
    def _message(row: sqlite3.Row) -> dict[str, Any]:
        item = dict(row)
        item["body"] = json.loads(str(item.pop("body_json")))
        return item

    def inbox(
        self,
        recipient: Any,
        *,
        mission_id: Any,
        unread_only: bool = True,
        limit: Any = 100,
    ) -> list[dict[str, Any]]:
        recipient = _text(recipient, "recipient", maximum=200)
        mission_id = _identifier(mission_id, "mission_id")
        if not isinstance(unread_only, bool):
            raise MissionError("unread_only must be a boolean")
        if (
            not isinstance(limit, int)
            or isinstance(limit, bool)
            or not 1 <= limit <= 500
        ):
            raise MissionError("limit must be an integer from 1 to 500")
        query = "SELECT * FROM panergos_messages WHERE recipient=? AND mission_id=?"
        params: list[Any] = [recipient, mission_id]
        if unread_only:
            query += " AND acknowledged_at IS NULL"
        query += " ORDER BY id LIMIT ?"
        params.append(limit)
        with closing(self.connect()) as conn:
            self.require_mission(conn, mission_id, recipient)
            rows = conn.execute(query, params).fetchall()
        return [self._message(row) for row in rows]

    def acknowledge(
        self, message_id: Any, recipient: Any, *, mission_id: Any
    ) -> dict[str, Any]:
        if (
            not isinstance(message_id, int)
            or isinstance(message_id, bool)
            or message_id < 1
        ):
            raise MissionError("message_id must be a positive integer")
        recipient = _text(recipient, "recipient", maximum=200)
        mission_id = _identifier(mission_id, "mission_id")
        with self.write() as conn:
            self.require_mission(conn, mission_id, recipient)
            row = conn.execute(
                "SELECT * FROM panergos_messages WHERE id=? AND mission_id=?",
                (message_id, mission_id),
            ).fetchone()
            if row is None:
                raise MissionError(f"message not found: {message_id}")
            if row["recipient"] != recipient:
                raise MissionError(
                    "only the intended recipient can acknowledge this message"
                )
            if row["acknowledged_at"] is None:
                now = int(time.time())
                conn.execute(
                    "UPDATE panergos_messages SET acknowledged_at=?,acknowledged_by=? WHERE id=?",
                    (now, recipient, message_id),
                )
                self._event(
                    conn,
                    mission_id,
                    recipient,
                    "message.acknowledged",
                    {"message_id": message_id},
                )
                row = conn.execute(
                    "SELECT * FROM panergos_messages WHERE id=?", (message_id,)
                ).fetchone()
                if row is None:  # pragma: no cover - same-transaction UPDATE contract
                    raise RuntimeError("message acknowledgement lost its row")
            return self._message(row)

    def events(
        self, mission_id: Any, actor: Any, *, after: Any = 0, limit: Any = 200
    ) -> list[dict[str, Any]]:
        mission_id = _identifier(mission_id, "mission_id")
        actor = _text(actor, "actor", maximum=200)
        if not isinstance(after, int) or isinstance(after, bool) or after < 0:
            raise MissionError("after must be a non-negative integer")
        if (
            not isinstance(limit, int)
            or isinstance(limit, bool)
            or not 1 <= limit <= 500
        ):
            raise MissionError("limit must be an integer from 1 to 500")
        with closing(self.connect()) as conn:
            self.require_mission(conn, mission_id, actor)
            rows = conn.execute(
                "SELECT * FROM panergos_events WHERE mission_id=? AND id>? ORDER BY id LIMIT ?",
                (mission_id, after, limit),
            ).fetchall()
        items = []
        for row in rows:
            item = dict(row)
            item["payload"] = json.loads(str(item.pop("payload_json")))
            items.append(item)
        return items
