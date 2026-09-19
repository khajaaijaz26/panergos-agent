import json
import os
import sqlite3
import subprocess
from pathlib import Path

import pytest

from tools.project_memory_tool import PROJECT_MEMORY_SCHEMA, latest_handoff
from tools.registry import registry


def _dispatch(**args):
    raw = registry.dispatch("project_memory", args)
    assert isinstance(raw, str)
    return json.loads(raw)


def _git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", *args], cwd=repo, check=True, capture_output=True,
        stdin=subprocess.DEVNULL,
    )


@pytest.fixture
def repo(tmp_path, monkeypatch):
    project = tmp_path / "repo"
    project.mkdir()
    monkeypatch.setenv("PANERGOS_HOME", str(tmp_path / "profile-state"))
    _git(project, "init", "-q")
    (project / ".gitignore").write_text("ignored.txt\n", encoding="utf-8")
    (project / "src").mkdir()
    (project / "src" / "app.py").write_text(
        "def ultraviolet_engine():\n    return 'indexed code'\n",
        encoding="utf-8",
    )
    (project / "notes.md").write_text("untracked nebula handoff\n", encoding="utf-8")
    (project / "ignored.txt").write_text("ignored_quasar\n", encoding="utf-8")
    (project / ".env").write_text("API_KEY=do_not_index_secret\n", encoding="utf-8")
    (project / "vendor").mkdir()
    (project / "vendor" / "copy.py").write_text("vendor_blackhole\n", encoding="utf-8")
    _git(project, "add", ".gitignore", "src/app.py")
    return project


def test_incremental_git_index_search_and_secret_exclusion(repo):
    first = _dispatch(action="sync", root=str(repo))
    assert first["success"] is True
    assert first["source"] == "git"
    assert first["changed_files"] >= 3

    hit = _dispatch(action="search", root=str(repo), query="ultraviolet")
    assert hit["results"][0]["path"] == "src/app.py"
    assert "ultraviolet" in hit["results"][0]["snippet"]
    for forbidden in ("do_not_index_secret", "ignored_quasar", "vendor_blackhole"):
        assert _dispatch(action="search", root=str(repo), query=forbidden)["count"] == 0

    second = _dispatch(action="sync", root=str(repo))
    assert second["changed_files"] == 0
    assert second["unchanged_files"] == first["indexed_files"]

    app = repo / "src" / "app.py"
    before = app.stat()
    os.utime(app, ns=(before.st_atime_ns, before.st_mtime_ns + 1_000_000_000))
    touched = _dispatch(action="sync", root=str(repo))
    assert touched["digest_reused_files"] == 1
    assert touched["changed_files"] == 0

    app.write_text("\n".join(["ordinary"] * 89 + ["resume_beacon = True"]), encoding="utf-8")
    changed = _dispatch(action="sync", root=str(repo))
    assert changed["changed_files"] == 1
    result = _dispatch(action="search", root=str(repo), query="resume_beacon")
    assert result["results"][0]["start_line"] <= 90 <= result["results"][0]["end_line"]

    (repo / "notes.md").unlink()
    removed = _dispatch(action="sync", root=str(repo))
    assert removed["removed_files"] == 1
    assert _dispatch(action="search", root=str(repo), query="nebula")["count"] == 0


def test_handoff_is_durable_and_database_is_profile_scoped(repo):
    state_dir = Path(os.environ["PANERGOS_HOME"]) / "project-memory"
    assert latest_handoff(repo) is None
    assert not state_dir.exists()

    saved = _dispatch(
        action="remember", root=str(repo),
        note="Completed parser tests. Next: benchmark incremental refresh.",
    )
    assert saved["success"] is True

    status = _dispatch(action="status", root=str(repo))
    assert status["handoff"]["note"].startswith("Completed parser tests")
    assert latest_handoff(repo) == status["handoff"]
    database = Path(status["database"])
    assert database.parent.name == "project-memory"
    assert repo.resolve() not in database.resolve().parents
    assert repo.name not in database.name

    with sqlite3.connect(database) as conn:
        assert conn.execute("SELECT value FROM metadata WHERE key='project_root'").fetchone()[0] == str(repo.resolve())


def test_clean_git_head_uses_fast_path_and_dirty_file_bypasses_it(repo):
    (repo / ".gitignore").write_text("ignored.txt\n.env\nvendor/\n", encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "-c", "user.name=Test", "-c", "user.email=test@invalid", "commit", "-qm", "seed")
    porcelain = subprocess.run(
        ["git", "status", "--porcelain=v1", "--untracked-files=normal"],
        cwd=repo, check=True, capture_output=True, text=True,
    ).stdout
    assert porcelain == "", porcelain

    assert _dispatch(action="sync", root=str(repo))["fast_path"] is False
    warm = _dispatch(action="sync", root=str(repo))
    assert warm["fast_path"] is True
    assert warm["unchanged_files"] == warm["indexed_files"]

    (repo / "src" / "app.py").write_text("dirty_incremental = True\n", encoding="utf-8")
    dirty = _dispatch(action="sync", root=str(repo))
    assert dirty["fast_path"] is False
    assert dirty["changed_files"] == 1


def test_registry_handler_strictly_validates_action_arguments(repo):
    assert PROJECT_MEMORY_SCHEMA["parameters"]["additionalProperties"] is False
    assert _dispatch(action="sync", root=str(repo), query="not valid here")["success"] is False
    assert _dispatch(action="search", root=str(repo), query="x", limit=True)["success"] is False
    assert _dispatch(action="remember", root=str(repo), note="x" * 6_001)["success"] is False
    assert _dispatch(action="explode", root=str(repo))["success"] is False


def test_filesystem_fallback_is_bounded_and_skips_symlinks_and_secrets(tmp_path, monkeypatch):
    project = tmp_path / "plain-project"
    project.mkdir()
    monkeypatch.setenv("PANERGOS_HOME", str(tmp_path / "profile-state"))
    (project / "main.txt").write_text("fallback_celestial\n", encoding="utf-8")
    (project / ".env.local").write_text("SECRET=fallback_secret\n", encoding="utf-8")
    (project / "node_modules").mkdir()
    (project / "node_modules" / "package.js").write_text("dependency_noise\n", encoding="utf-8")
    outside = tmp_path / "outside.txt"
    outside.write_text("outside_singularity\n", encoding="utf-8")
    try:
        (project / "linked.txt").symlink_to(outside)
    except OSError:
        pass

    synced = _dispatch(action="sync", root=str(project))
    assert synced["success"] is True, synced
    assert synced["source"] == "filesystem"
    assert _dispatch(action="search", root=str(project), query="fallback_celestial")["count"] == 1
    for forbidden in ("fallback_secret", "dependency_noise", "outside_singularity"):
        assert _dispatch(action="search", root=str(project), query=forbidden)["count"] == 0


def test_refuses_profile_state_inside_project(tmp_path, monkeypatch):
    project = tmp_path / "project"
    project.mkdir()
    monkeypatch.setenv("PANERGOS_HOME", str(project / ".state"))
    result = _dispatch(action="status", root=str(project))
    assert result["success"] is False
    assert "outside the indexed project" in result["error"]
