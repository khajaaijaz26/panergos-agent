"""Release-update sampling must never choose the release under test as OLD."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

PICKER = (
    Path(__file__).resolve().parents[2] / "scripts" / "sandbox" / "pick-release-tags.sh"
)
BASH = (
    str(Path(os.environ.get("ProgramFiles", "")) / "Git" / "bin" / "bash.exe")
    if os.name == "nt"
    else shutil.which("bash")
)
if BASH and not Path(BASH).is_file():
    BASH = None

pytestmark = pytest.mark.skipif(
    shutil.which("git") is None or BASH is None,
    reason="needs git and bash",
)


def _git(repo: Path, *args: str) -> None:
    subprocess.run(
        [
            "git",
            "-c",
            "user.email=test@example.invalid",
            "-c",
            "user.name=test",
            *args,
        ],
        cwd=repo,
        check=True,
        capture_output=True,
    )


def _commit(repo: Path, value: str, tag: str) -> None:
    (repo / "version.txt").write_text(value, encoding="utf-8")
    _git(repo, "add", "version.txt")
    _git(repo, "commit", "-m", value)
    _git(repo, "tag", tag)


def _pick(repo: Path, count: int = 3) -> list[str]:
    result = subprocess.run(
        [
            str(BASH),
            PICKER.as_posix(),
            "--count",
            str(count),
            "--repo",
            repo.as_posix(),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_picker_excludes_the_release_at_head(tmp_path: Path) -> None:
    _git(tmp_path, "init")
    _commit(tmp_path, "v0.1.0", "v0.1.0")
    assert _pick(tmp_path) == []

    _commit(tmp_path, "v0.2.0", "v0.2.0")
    _commit(tmp_path, "v0.3.0", "v0.3.0")
    assert _pick(tmp_path, 2) == ["v0.1.0", "v0.2.0"]
