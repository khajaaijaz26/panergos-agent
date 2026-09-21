#!/usr/bin/env python3
"""Durable, token-efficient project recall backed by a local SQLite FTS5 index.

The index is incremental: a sync stats every eligible file, reads only files whose
metadata changed, and rebuilds chunks only when their content digest changed.  Each
canonical project root gets a private database under the active profile state.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import stat
import subprocess
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, cast

from panergos_constants import get_panergos_home
from panergos_cli._subprocess_compat import (
    noninteractive_git_env, noninteractive_git_env_with_text_normalization,
)
from tools.registry import registry, tool_error, tool_result
from tools.spill_safety import ensure_spill_dir

_MAX_FILES = 20_000
_MAX_CANDIDATES = 50_000
_MAX_FILE_BYTES = 512 * 1024
_MAX_PROJECT_BYTES = 128 * 1024 * 1024
_MAX_CHUNK_LINES = 80
_MAX_CHUNK_CHARS = 6_000
_MAX_QUERY_CHARS = 500
_MAX_NOTE_CHARS = 6_000
_MAX_RESULTS = 10
_MAX_GRAPH_BYTES = 64 * 1024 * 1024
_MAX_GRAPH_IMPORTS = 64
_MAX_GRAPH_NODES = 100_000
_MAX_GRAPH_LINKS = 500_000
_MAX_GRAPH_HYPEREDGES = 100_000
_MAX_GRAPH_INDEX_CHARS = 64 * 1024 * 1024
_MAX_GRAPH_FIELD_CHARS = 2_000
_GIT_TIMEOUT_SECONDS = 15

_EXCLUDED_DIRS = frozenset({
    ".git", ".hg", ".svn", ".idea", ".next", ".nuxt", ".pytest_cache",
    ".mypy_cache", ".ruff_cache", ".tox", ".venv", "__pycache__", "build",
    "coverage", "dist", "env", "node_modules", "target", "vendor", "venv",
})
_SECRET_DIRS = frozenset({".aws", ".gnupg", ".ssh", "credentials", "keys", "secrets"})
_SECRET_NAMES = frozenset({
    ".git-credentials", ".netrc", ".npmrc", ".pypirc", "auth.json", "credentials.json",
    "secrets.json", "token.json", "tokens.json", "id_dsa", "id_ecdsa", "id_ed25519", "id_rsa",
})
_SECRET_SUFFIXES = frozenset({".key", ".kdbx", ".p12", ".pem", ".pfx"})
_BINARY_SUFFIXES = frozenset({
    ".7z", ".a", ".avi", ".bin", ".bmp", ".class", ".db", ".dll", ".dylib",
    ".eot", ".exe", ".gif", ".gz", ".ico", ".jar", ".jpeg", ".jpg", ".lockb",
    ".mov", ".mp3", ".mp4", ".o", ".otf", ".pdf", ".png", ".pyc", ".rar",
    ".so", ".sqlite", ".sqlite3", ".tar", ".ttf", ".wav", ".webm", ".webp",
    ".woff", ".woff2", ".xz", ".zip",
})
_ACTIONS = frozenset({"import_graph", "remember", "remove_graph", "search", "status", "sync"})
_ACTION_ARGS = {
    "sync": frozenset({"action", "root"}),
    "search": frozenset({"action", "root", "query", "limit"}),
    "status": frozenset({"action", "root"}),
    "remember": frozenset({"action", "root", "note"}),
    "import_graph": frozenset({"action", "root", "path"}),
    "remove_graph": frozenset({"action", "root", "digest"}),
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _inside(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _run_git(root: Path, *args: str) -> tuple[int, str]:
    proc = subprocess.run(
        ["git", "-c", "core.quotePath=false", *args], cwd=root,
        stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding="utf-8",
        errors="surrogateescape", timeout=_GIT_TIMEOUT_SECONDS,
        env=(noninteractive_git_env_with_text_normalization(root)
             if args and args[0] == "status" else noninteractive_git_env()),
    )
    return proc.returncode, proc.stdout


def _canonical_root(value: object = None) -> tuple[Path, bool]:
    if value is not None and (not isinstance(value, str) or not value.strip() or "\0" in value):
        raise ValueError("root must be a non-empty directory path")
    candidate = Path(value.strip() if isinstance(value, str) else os.getcwd()).expanduser().resolve(strict=True)
    if not candidate.is_dir():
        raise ValueError(f"project root is not a directory: {candidate}")
    # Do not silently expand a requested subdirectory to an ancestor repository (a
    # home-directory .git can otherwise turn a tiny project sync into a home scan).
    if not (candidate / ".git").exists():
        return candidate, False
    try:
        code, output = _run_git(candidate, "rev-parse", "--show-toplevel")
    except (OSError, subprocess.TimeoutExpired):
        return candidate, False
    if code != 0 or not output.strip():
        return candidate, False
    git_root = Path(output.strip()).resolve(strict=True)
    if not git_root.is_dir() or os.path.normcase(str(git_root)) != os.path.normcase(str(candidate)):
        raise ValueError("git returned an invalid project root")
    return candidate, True


def _database_candidate(root: Path) -> Path:
    state_dir = get_panergos_home().expanduser().resolve(strict=False) / "project-memory"
    if state_dir == root or _inside(state_dir, root):
        raise ValueError("profile state must be outside the indexed project")
    key = hashlib.sha256(os.path.normcase(str(root)).encode("utf-8", "surrogatepass")).hexdigest()[:32]
    return state_dir / f"{key}.sqlite3"


def _database_path(root: Path) -> Path:
    path = _database_candidate(root)
    ensure_spill_dir(path.parent, private=True)
    try:
        current = os.lstat(path)
    except FileNotFoundError:
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(path, flags, 0o600)
        os.close(fd)
    else:
        if not stat.S_ISREG(current.st_mode):
            raise OSError(f"project-memory database is not a regular file: {path}")
        if stat.S_IMODE(current.st_mode) != 0o600:
            os.chmod(path, 0o600)
    return path


def latest_handoff(root: str | Path) -> dict[str, str] | None:
    """Latest bounded handoff, without creating project-memory state or an index."""
    try:
        project_root, _ = _canonical_root(str(root))
        path = _database_candidate(project_root)
        info = os.lstat(path)
        if not stat.S_ISREG(info.st_mode):
            return None
        conn = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True, timeout=1)
        try:
            stored = conn.execute("SELECT value FROM metadata WHERE key='project_root'").fetchone()
            if not stored or os.path.normcase(str(stored[0])) != os.path.normcase(str(project_root)):
                return None
            row = conn.execute(
                "SELECT note, created_at FROM handoffs ORDER BY id DESC LIMIT 1"
            ).fetchone()
            return {
                "note": str(row[0])[:_MAX_NOTE_CHARS], "created_at": str(row[1])[:128],
            } if row else None
        finally:
            conn.close()
    except (OSError, RuntimeError, sqlite3.Error, subprocess.TimeoutExpired, ValueError):
        return None


def _connect(root: Path) -> tuple[sqlite3.Connection, Path]:
    path = _database_path(root)
    conn = sqlite3.connect(path, timeout=5)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS files (
                path TEXT PRIMARY KEY,
                size INTEGER NOT NULL,
                mtime_ns INTEGER NOT NULL,
                digest TEXT NOT NULL
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
                path,
                start_line UNINDEXED,
                end_line UNINDEXED,
                content,
                tokenize='unicode61 remove_diacritics 2'
            );
            CREATE TABLE IF NOT EXISTS handoffs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS graph_imports (
                digest TEXT PRIMARY KEY,
                source_path TEXT NOT NULL,
                source_size INTEGER NOT NULL,
                imported_at TEXT NOT NULL,
                nodes INTEGER NOT NULL,
                links INTEGER NOT NULL,
                hyperedges INTEGER NOT NULL,
                chunks INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS graph_sources (
                source_path TEXT PRIMARY KEY,
                digest TEXT NOT NULL
            );
            """
        )
        stored = conn.execute("SELECT value FROM metadata WHERE key='project_root'").fetchone()
        if stored and os.path.normcase(stored[0]) != os.path.normcase(str(root)):
            raise RuntimeError("project-memory database key collision")
        conn.execute(
            "INSERT OR IGNORE INTO metadata(key, value) VALUES('project_root', ?)",
            (str(root),),
        )
        conn.execute(
            "INSERT OR IGNORE INTO metadata(key, value) VALUES('schema_version', '2')"
        )
        conn.execute("UPDATE metadata SET value='2' WHERE key='schema_version' AND value='1'")
        conn.execute(
            "INSERT OR IGNORE INTO graph_sources(source_path, digest) "
            "SELECT source_path, digest FROM graph_imports"
        )
        conn.commit()
        return conn, path
    except Exception:
        conn.close()
        raise


def _path_allowed(relative: str) -> bool:
    path = PurePosixPath(relative.replace("\\", "/"))
    if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
        return False
    lowered = tuple(part.casefold() for part in path.parts)
    name = lowered[-1]
    if any(part in _EXCLUDED_DIRS or part in _SECRET_DIRS for part in lowered[:-1]):
        return False
    secret_prefixes = ("client_secret.", "credential.", "credentials.", "private_key.", "secrets.", "tokens.")
    if name == ".env" or name.startswith(".env.") or name in _SECRET_NAMES or name.startswith(secret_prefixes):
        return False
    suffix = Path(name).suffix
    return suffix not in _SECRET_SUFFIXES and suffix not in _BINARY_SUFFIXES


def _candidate_paths(root: Path, is_git: bool) -> tuple[list[str], bool]:
    if is_git:
        code, output = _run_git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard")
        if code != 0:
            raise OSError("git ls-files failed")
        paths = sorted(item for item in output.split("\0") if item)
        return paths[:_MAX_CANDIDATES], len(paths) > _MAX_CANDIDATES

    paths: list[str] = []
    truncated = False

    def _ignore_walk_error(_error: OSError) -> None:
        return None

    for dirpath, dirnames, filenames in os.walk(root, topdown=True, onerror=_ignore_walk_error, followlinks=False):
        dirnames[:] = sorted(
            name for name in dirnames
            if name.casefold() not in _EXCLUDED_DIRS
            and name.casefold() not in _SECRET_DIRS
            and not (Path(dirpath) / name).is_symlink()
        )
        for name in sorted(filenames):
            paths.append((Path(dirpath) / name).relative_to(root).as_posix())
            if len(paths) >= _MAX_CANDIDATES:
                truncated = True
                return paths, truncated
    return paths, truncated


def _safe_path(root: Path, relative: str) -> Path | None:
    candidate = root.joinpath(*PurePosixPath(relative.replace("\\", "/")).parts)
    try:
        if candidate.is_symlink() or not _inside(candidate.resolve(strict=True), root):
            return None
        info = candidate.stat(follow_symlinks=False)
    except (OSError, ValueError):
        return None
    return candidate if stat.S_ISREG(info.st_mode) else None


def _read_stable(path: Path, max_bytes: int = _MAX_FILE_BYTES) -> tuple[bytes, os.stat_result]:
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size > max_bytes:
            raise ValueError("file is not eligible text")
        chunks: list[bytes] = []
        remaining = max_bytes + 1
        while remaining:
            block = os.read(fd, min(64 * 1024, remaining))
            if not block:
                break
            chunks.append(block)
            remaining -= len(block)
        data = b"".join(chunks)
        after = os.fstat(fd)
        if len(data) > max_bytes or (before.st_size, before.st_mtime_ns) != (
            after.st_size,
            after.st_mtime_ns,
        ):
            raise ValueError("file changed during indexing")
        return data, after
    finally:
        os.close(fd)


def _looks_binary(data: bytes) -> bool:
    sample = data[:8192]
    if b"\0" in sample:
        return True
    controls = sum(byte < 9 or 13 < byte < 32 for byte in sample)
    return bool(sample) and controls / len(sample) > 0.05


def _text_chunks(text: str) -> list[tuple[int, int, str]]:
    lines = text.splitlines()
    if not lines and text:
        lines = [text]
    result: list[tuple[int, int, str]] = []
    start = 0
    current: list[str] = []
    chars = 0
    for line_no, line in enumerate(lines, 1):
        if len(line) > _MAX_CHUNK_CHARS:
            if current:
                result.append((start, line_no - 1, "\n".join(current)))
                current, chars = [], 0
            result.extend(
                (line_no, line_no, line[offset:offset + _MAX_CHUNK_CHARS])
                for offset in range(0, len(line), _MAX_CHUNK_CHARS)
            )
            continue
        added = len(line) + bool(current)
        if current and (len(current) >= _MAX_CHUNK_LINES or chars + added > _MAX_CHUNK_CHARS):
            result.append((start, line_no - 1, "\n".join(current)))
            current, chars = [], 0
        if not current:
            start = line_no
        current.append(line)
        chars += added
    if current:
        result.append((start, start + len(current) - 1, "\n".join(current)))
    return result


def _graph_path(root: Path, value: object) -> tuple[Path, str]:
    if not isinstance(value, str) or not value.strip() or "\0" in value:
        raise ValueError("import_graph requires a non-empty path")
    candidate = Path(value.strip()).expanduser()
    if not candidate.is_absolute():
        candidate = root / candidate
    if candidate.is_symlink():
        raise ValueError("graph path must not be a symlink")
    resolved = candidate.resolve(strict=True)
    if not _inside(resolved, root):
        raise ValueError("graph path must be inside the project root")
    info = resolved.stat(follow_symlinks=False)
    if not stat.S_ISREG(info.st_mode) or info.st_size > _MAX_GRAPH_BYTES:
        raise ValueError(f"graph must be a regular file no larger than {_MAX_GRAPH_BYTES} bytes")
    relative = resolved.relative_to(root).as_posix()
    if not _path_allowed(relative):
        raise ValueError("graph path is excluded from project memory")
    return resolved, relative


def _graph_value(value: object) -> str:
    if isinstance(value, (str, int, float, bool)):
        text = str(value)
    elif isinstance(value, list):
        text = ", ".join(
            str(item) for item in value[:100]
            if isinstance(item, (str, int, float, bool))
        )
    else:
        return ""
    text = " ".join(re.sub(r"[\x00-\x1f\x7f]+", " ", text).split())
    return text[:_MAX_GRAPH_FIELD_CHARS]


def _graph_source_allowed(value: object) -> bool:
    if not isinstance(value, str):
        return False
    source = value.strip().replace("\\", "/")
    if PurePosixPath(source).is_absolute() or re.match(r"^[A-Za-z]:/", source):
        return False
    source = re.sub(r"(?:#L\d+|:\d+(?::\d+)?)$", "", source)
    return _path_allowed(source)


def _graph_records(
    document: object,
) -> tuple[dict[str, list[str]], int]:
    if not isinstance(document, dict):
        raise ValueError("graph JSON root must be an object")
    links = document.get("links", document.get("edges", []))
    groups = {
        "nodes": (
            document.get("nodes", []),
            _MAX_GRAPH_NODES,
            (
                "id", "label", "name", "type", "community", "community_name",
                "file_type", "source_file", "source_location", "description",
            ),
        ),
        "links": (
            links,
            _MAX_GRAPH_LINKS,
            (
                "source", "target", "relation", "label", "confidence",
                "confidence_score", "context", "source_file", "source_location",
            ),
        ),
        "hyperedges": (
            document.get("hyperedges", []),
            _MAX_GRAPH_HYPEREDGES,
            (
                "id", "label", "relation", "type", "nodes", "members", "confidence",
                "confidence_score", "context", "source_file", "source_location",
            ),
        ),
    }
    result: dict[str, list[str]] = {}
    skipped = 0
    indexed_chars = 0
    for kind, (records, maximum, fields) in groups.items():
        if not isinstance(records, list):
            raise ValueError(f"graph {kind} must be an array")
        if len(records) > maximum:
            raise ValueError(f"graph {kind} exceeds the {maximum} record limit")
        lines: list[str] = []
        for record in records:
            if not isinstance(record, dict):
                raise ValueError(f"graph {kind} entries must be objects")
            source_ref = record.get("source_file")
            if source_ref in (None, ""):
                source_ref = record.get("source_location")
            if source_ref is not None and (
                not isinstance(source_ref, str)
                or (source_ref.strip() and not _graph_source_allowed(source_ref))
            ):
                skipped += 1
                continue
            values = [
                f"{field}={value}"
                for field in fields
                if (value := _graph_value(record.get(field)))
            ]
            if not values:
                skipped += 1
                continue
            line = f"{kind[:-1]} " + " ".join(values)
            indexed_chars += len(line) + 1
            if indexed_chars > _MAX_GRAPH_INDEX_CHARS:
                raise ValueError("normalized graph exceeds the index size limit")
            lines.append(line)
        result[kind] = lines
    if not any(result.values()):
        raise ValueError("graph contains no safe searchable records")
    return result, skipped


def _clean_git_fast_sync(conn: sqlite3.Connection, root: Path, path: Path) -> dict | None:
    metadata = {row["key"]: row["value"] for row in conn.execute("SELECT key, value FROM metadata")}
    if metadata.get("source") != "git" or metadata.get("truncated") != "false" or not metadata.get("git_head"):
        return None
    code, head = _run_git(root, "rev-parse", "--verify", "HEAD")
    if code != 0 or head.strip() != metadata["git_head"]:
        return None
    code, status = _run_git(root, "status", "--porcelain=v1", "-z", "--untracked-files=normal")
    if code != 0 or status:
        return None
    totals = conn.execute(
        "SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS bytes FROM files"
    ).fetchone()
    return {
        "success": True, "action": "sync", "project_root": str(root),
        "database": str(path), "source": "git", "indexed_files": totals["files"],
        "indexed_bytes": totals["bytes"],
        "chunks": conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0],
        "truncated": False, "fast_path": True, "changed_files": 0,
        "unchanged_files": totals["files"], "digest_reused_files": 0,
        "removed_files": 0, "skipped_files": 0, "stale_files": 0,
    }


def _sync(root: Path, is_git: bool) -> dict:
    conn, path = _connect(root)
    counters = {
        "changed_files": 0, "unchanged_files": 0, "digest_reused_files": 0,
        "removed_files": 0, "skipped_files": 0, "stale_files": 0,
    }
    kept: set[str] = set()
    indexed_bytes = 0
    accepted = 0
    try:
        if is_git and (cached := _clean_git_fast_sync(conn, root, path)) is not None:
            return cached
        candidates, truncated = _candidate_paths(root, is_git)
        existing = {
            row["path"]: (row["size"], row["mtime_ns"], row["digest"])
            for row in conn.execute("SELECT path, size, mtime_ns, digest FROM files")
        }
        imported_sources = {
            row["source_path"]
            for row in conn.execute("SELECT source_path FROM graph_sources")
        }
        conn.execute("BEGIN IMMEDIATE")
        for relative in candidates:
            if relative in imported_sources:
                counters["skipped_files"] += 1
                continue
            if not _path_allowed(relative):
                counters["skipped_files"] += 1
                continue
            file_path = _safe_path(root, relative)
            if file_path is None:
                counters["skipped_files"] += 1
                continue
            try:
                info = file_path.stat(follow_symlinks=False)
            except OSError:
                counters["skipped_files"] += 1
                continue
            if info.st_size > _MAX_FILE_BYTES:
                counters["skipped_files"] += 1
                continue
            if accepted >= _MAX_FILES or indexed_bytes + info.st_size > _MAX_PROJECT_BYTES:
                truncated = True
                counters["skipped_files"] += 1
                continue
            accepted += 1
            indexed_bytes += info.st_size
            old = existing.get(relative)
            if old and old[:2] == (info.st_size, info.st_mtime_ns):
                kept.add(relative)
                counters["unchanged_files"] += 1
                continue
            try:
                data, stable_info = _read_stable(file_path)
            except (OSError, ValueError):
                counters["stale_files" if old else "skipped_files"] += 1
                if old:
                    kept.add(relative)
                continue
            if _looks_binary(data):
                counters["skipped_files"] += 1
                continue
            digest = hashlib.sha256(data).hexdigest()
            if old and old[2] == digest:
                conn.execute(
                    "UPDATE files SET size=?, mtime_ns=? WHERE path=?",
                    (stable_info.st_size, stable_info.st_mtime_ns, relative),
                )
                kept.add(relative)
                counters["digest_reused_files"] += 1
                continue
            text = data.decode("utf-8-sig", errors="replace")
            conn.execute("DELETE FROM chunks WHERE path=?", (relative,))
            conn.execute(
                "INSERT INTO files(path, size, mtime_ns, digest) VALUES(?, ?, ?, ?) "
                "ON CONFLICT(path) DO UPDATE SET size=excluded.size, "
                "mtime_ns=excluded.mtime_ns, digest=excluded.digest",
                (relative, stable_info.st_size, stable_info.st_mtime_ns, digest),
            )
            conn.executemany(
                "INSERT INTO chunks(path, start_line, end_line, content) VALUES(?, ?, ?, ?)",
                ((relative, start, end, content) for start, end, content in _text_chunks(text)),
            )
            kept.add(relative)
            counters["changed_files"] += 1

        removed = set(existing) - kept
        for relative in removed:
            conn.execute("DELETE FROM chunks WHERE path=?", (relative,))
            conn.execute("DELETE FROM files WHERE path=?", (relative,))
        counters["removed_files"] = len(removed)
        now = _utc_now()
        metadata = {
            "last_sync": now,
            "source": "git" if is_git else "filesystem",
            "truncated": json.dumps(truncated),
        }
        if is_git:
            try:
                code, head = _run_git(root, "rev-parse", "--verify", "HEAD")
            except (OSError, subprocess.TimeoutExpired):
                code, head = 1, ""
            metadata["git_head"] = head.strip() if code == 0 else ""
        conn.executemany(
            "INSERT INTO metadata(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            metadata.items(),
        )
        conn.commit()
        totals = conn.execute(
            "SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS bytes FROM files"
        ).fetchone()
        chunk_count = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        return {
            "success": True, "action": "sync", "project_root": str(root),
            "database": str(path), "source": metadata["source"],
            "indexed_files": totals["files"], "indexed_bytes": totals["bytes"],
            "chunks": chunk_count, "truncated": truncated, "fast_path": False, **counters,
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _fts_query(query: object) -> str:
    if not isinstance(query, str) or not query.strip():
        raise ValueError("search requires a non-empty query")
    if len(query) > _MAX_QUERY_CHARS:
        raise ValueError(f"query exceeds {_MAX_QUERY_CHARS} characters")
    tokens = list(dict.fromkeys(re.findall(r"\w+", query, flags=re.UNICODE)))[:24]
    if not tokens:
        raise ValueError("query must contain searchable words")
    return " OR ".join(f'"{token.replace(chr(34), chr(34) * 2)}"' for token in tokens)


def _limit(value: object) -> int:
    if value is None:
        return 5
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= _MAX_RESULTS:
        raise ValueError(f"limit must be an integer from 1 to {_MAX_RESULTS}")
    return value


def _search(root: Path, query: object, limit: object) -> dict:
    conn, _ = _connect(root)
    try:
        fts_query = _fts_query(query)
        assert isinstance(query, str)  # validated by _fts_query
        rows = conn.execute(
            "SELECT path, CAST(start_line AS INTEGER) AS start_line, "
            "CAST(end_line AS INTEGER) AS end_line, "
            "snippet(chunks, 3, '<<', '>>', ' … ', 48) AS snippet, "
            "bm25(chunks, 5.0, 0.0, 0.0, 1.0) AS score "
            "FROM chunks WHERE chunks MATCH ? ORDER BY score LIMIT ?",
            (fts_query, _limit(limit)),
        ).fetchall()
        return {
            "success": True, "action": "search", "project_root": str(root),
            "query": query.strip(), "count": len(rows),
            "results": [
                {
                    "path": row["path"], "start_line": row["start_line"],
                    "end_line": row["end_line"], "snippet": row["snippet"][:1_200],
                }
                for row in rows
            ],
            **({"message": "No indexed match. Run action='sync' if the project changed."} if not rows else {}),
        }
    finally:
        conn.close()


def _graph_import_summary(conn: sqlite3.Connection) -> dict:
    totals = conn.execute(
        "SELECT COUNT(*) AS count, COALESCE(SUM(source_size), 0) AS source_bytes, "
        "COALESCE(SUM(nodes), 0) AS nodes, COALESCE(SUM(links), 0) AS links, "
        "COALESCE(SUM(hyperedges), 0) AS hyperedges, COALESCE(SUM(chunks), 0) AS chunks "
        "FROM graph_imports"
    ).fetchone()
    items = conn.execute(
        "SELECT digest, source_path, source_size, imported_at, nodes, links, hyperedges, chunks "
        "FROM graph_imports ORDER BY imported_at DESC, digest LIMIT 20"
    ).fetchall()
    return {**dict(totals), "items": [dict(row) for row in items]}


def _import_graph(root: Path, value: object) -> dict:
    graph_path, relative = _graph_path(root, value)
    data, _ = _read_stable(graph_path, _MAX_GRAPH_BYTES)
    digest = hashlib.sha256(data).hexdigest()
    conn, database = _connect(root)
    try:
        existing = conn.execute(
            "SELECT digest, source_path, source_size, imported_at, nodes, links, "
            "hyperedges, chunks FROM graph_imports WHERE digest=?",
            (digest,),
        ).fetchone()
        if existing:
            with conn:
                conn.execute(
                    "INSERT INTO graph_sources(source_path, digest) VALUES(?, ?) "
                    "ON CONFLICT(source_path) DO UPDATE SET digest=excluded.digest",
                    (relative, digest),
                )
                conn.execute("DELETE FROM chunks WHERE path=?", (relative,))
                conn.execute("DELETE FROM files WHERE path=?", (relative,))
                conn.execute("DELETE FROM metadata WHERE key='git_head'")
            return {
                "success": True,
                "action": "import_graph",
                "project_root": str(root),
                "database": str(database),
                "deduplicated": True,
                **dict(existing),
            }
        if conn.execute("SELECT COUNT(*) FROM graph_imports").fetchone()[0] >= _MAX_GRAPH_IMPORTS:
            raise ValueError(f"project already has the {_MAX_GRAPH_IMPORTS} graph import limit")
        try:
            document = json.loads(data.decode("utf-8-sig"))
        except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as exc:
            raise ValueError("graph must be valid UTF-8 JSON") from exc
        records, skipped = _graph_records(document)
        prefix = f"@graph/{digest}"
        imported_at = _utc_now()
        chunk_count = 0
        with conn:
            for kind, lines in records.items():
                chunks = _text_chunks("\n".join(lines))
                conn.executemany(
                    "INSERT INTO chunks(path, start_line, end_line, content) "
                    "VALUES(?, ?, ?, ?)",
                    (
                        (f"{prefix}/{kind}.txt", start, end, content)
                        for start, end, content in chunks
                    ),
                )
                chunk_count += len(chunks)
            counts = {kind: len(lines) for kind, lines in records.items()}
            conn.execute(
                "INSERT INTO graph_imports(digest, source_path, source_size, imported_at, "
                "nodes, links, hyperedges, chunks) VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    digest,
                    relative,
                    len(data),
                    imported_at,
                    counts["nodes"],
                    counts["links"],
                    counts["hyperedges"],
                    chunk_count,
                ),
            )
            conn.execute(
                "INSERT INTO graph_sources(source_path, digest) VALUES(?, ?) "
                "ON CONFLICT(source_path) DO UPDATE SET digest=excluded.digest",
                (relative, digest),
            )
            conn.execute("DELETE FROM chunks WHERE path=?", (relative,))
            conn.execute("DELETE FROM files WHERE path=?", (relative,))
            conn.execute("DELETE FROM metadata WHERE key='git_head'")
        return {
            "success": True,
            "action": "import_graph",
            "project_root": str(root),
            "database": str(database),
            "source_path": relative,
            "source_size": len(data),
            "digest": digest,
            "imported_at": imported_at,
            **counts,
            "chunks": chunk_count,
            "skipped_records": skipped,
            "deduplicated": False,
        }
    finally:
        conn.close()


def _remove_graph(root: Path, value: object) -> dict:
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", value.strip()):
        raise ValueError("remove_graph requires a full SHA-256 digest")
    digest = value.strip().lower()
    conn, _ = _connect(root)
    try:
        row = conn.execute(
            "SELECT source_path, nodes, links, hyperedges, chunks FROM graph_imports "
            "WHERE digest=?",
            (digest,),
        ).fetchone()
        if not row:
            return {
                "success": True,
                "action": "remove_graph",
                "project_root": str(root),
                "digest": digest,
                "removed": False,
            }
        with conn:
            conn.execute("DELETE FROM chunks WHERE path LIKE ?", (f"@graph/{digest}/%",))
            conn.execute("DELETE FROM graph_imports WHERE digest=?", (digest,))
            conn.execute("DELETE FROM metadata WHERE key='git_head'")
        return {
            "success": True,
            "action": "remove_graph",
            "project_root": str(root),
            "digest": digest,
            "removed": True,
            **dict(row),
        }
    finally:
        conn.close()


def _status(root: Path) -> dict:
    conn, path = _connect(root)
    try:
        metadata = {row["key"]: row["value"] for row in conn.execute("SELECT key, value FROM metadata")}
        totals = conn.execute(
            "SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS bytes FROM files"
        ).fetchone()
        chunk_count = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        handoff = conn.execute(
            "SELECT note, created_at FROM handoffs ORDER BY id DESC LIMIT 1"
        ).fetchone()
        return {
            "success": True, "action": "status", "project_root": str(root),
            "database": str(path), "indexed_files": totals["files"],
            "indexed_bytes": totals["bytes"], "chunks": chunk_count,
            "last_sync": metadata.get("last_sync"), "source": metadata.get("source"),
            "git_head": metadata.get("git_head") or None,
            "truncated": json.loads(metadata.get("truncated", "false")),
            "handoff": dict(handoff) if handoff else None,
            "graph_imports": _graph_import_summary(conn),
        }
    finally:
        conn.close()


def _remember(root: Path, note: object) -> dict:
    if not isinstance(note, str) or not note.strip():
        raise ValueError("remember requires a non-empty note")
    note = note.strip()
    if len(note) > _MAX_NOTE_CHARS:
        raise ValueError(f"note exceeds {_MAX_NOTE_CHARS} characters")
    conn, _ = _connect(root)
    try:
        created_at = _utc_now()
        with conn:
            conn.execute("INSERT INTO handoffs(note, created_at) VALUES(?, ?)", (note, created_at))
            conn.execute(
                "DELETE FROM handoffs WHERE id NOT IN "
                "(SELECT id FROM handoffs ORDER BY id DESC LIMIT 50)"
            )
        return {
            "success": True, "action": "remember", "project_root": str(root),
            "created_at": created_at, "characters": len(note),
        }
    finally:
        conn.close()


def project_memory(
    action: object,
    root: object = None,
    query: object = None,
    limit: object = None,
    note: object = None,
    path: object = None,
    digest: object = None,
) -> str:
    """Dispatch a project-memory action and return a bounded JSON result."""
    try:
        if not isinstance(action, str) or action not in _ACTIONS:
            raise ValueError(f"action must be one of: {', '.join(sorted(_ACTIONS))}")
        project_root, is_git = _canonical_root(root)
        handlers = {
            "sync": lambda: _sync(project_root, is_git),
            "search": lambda: _search(project_root, query, limit),
            "status": lambda: _status(project_root),
            "remember": lambda: _remember(project_root, note),
            "import_graph": lambda: _import_graph(project_root, path),
            "remove_graph": lambda: _remove_graph(project_root, digest),
        }
        return tool_result(handlers[action]())
    except (
        OSError,
        RecursionError,
        RuntimeError,
        sqlite3.Error,
        subprocess.TimeoutExpired,
        ValueError,
    ) as exc:
        return tool_error(f"project_memory failed: {exc}", success=False)


def _handle(args: object, **_kwargs) -> str:
    if not isinstance(args, dict):
        return tool_error("project_memory arguments must be an object", success=False)
    arguments = cast(dict[str, object], args)
    action = arguments.get("action")
    if not isinstance(action, str) or action not in _ACTIONS:
        return project_memory(action)
    unexpected = set(arguments) - _ACTION_ARGS[action]
    if unexpected:
        return tool_error(
            f"unexpected arguments for {action}: {', '.join(sorted(unexpected))}",
            success=False,
        )
    return project_memory(
        action=action, root=arguments.get("root"), query=arguments.get("query"),
        limit=arguments.get("limit"), note=arguments.get("note"),
        path=arguments.get("path"), digest=arguments.get("digest"),
    )


PROJECT_MEMORY_SCHEMA: dict[str, Any] = {
    "name": "project_memory",
    "description": (
        "Durable project recall without rereading the repository. Use action='sync' to "
        "incrementally index changed text files, action='search' for compact BM25-ranked "
        "code/document snippets, action='remember' to save a session handoff, and "
        "action='import_graph' to privately absorb a bounded node-link JSON export. Use "
        "action='status' to resume from the latest handoff and inspect index freshness. "
        "Indexes are private to the active profile and skip ignored, binary, vendor, cache, "
        "oversized, credential, key, and environment files."
    ),
    "parameters": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "action": {"type": "string", "enum": sorted(_ACTIONS)},
            "root": {
                "type": "string",
                "description": "Canonical project root; defaults to cwd. Pass the repository root for Git-aware indexing.",
            },
            "query": {
                "type": "string",
                "description": "Search words for action='search' (max 500 characters).",
            },
            "limit": {
                "type": "integer", "minimum": 1, "maximum": _MAX_RESULTS, "default": 5,
                "description": "Maximum compact search results.",
            },
            "note": {
                "type": "string",
                "description": "Concise completed/pending/next-step handoff for action='remember'.",
            },
            "path": {
                "type": "string",
                "description": "Project-local node-link JSON file for action='import_graph'.",
            },
            "digest": {
                "type": "string",
                "pattern": "^[0-9a-fA-F]{64}$",
                "description": "Full imported graph SHA-256 for action='remove_graph'.",
            },
        },
        "required": ["action"],
    },
}


registry.register(
    name="project_memory",
    toolset="project_memory",
    schema=PROJECT_MEMORY_SCHEMA,
    handler=_handle,
    emoji="🧠",
    max_result_size_chars=16_000,
)
