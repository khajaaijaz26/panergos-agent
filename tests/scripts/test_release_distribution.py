from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "release_distribution.py"
LEGACY_SCRIPT = SCRIPT.with_name("release.py")


def _load():
    spec = importlib.util.spec_from_file_location("release_distribution", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


release = _load()


def _metadata(tmp_path: Path, *, version: str = "1.2.3") -> Path:
    path = tmp_path / "__init__.py"
    path.write_text(
        f'__distribution_name__ = "Atlas Agent"\n'
        f'__distribution_version__ = "{version}"\n'
        '__distribution_repo_slug__ = "example/atlas-agent"\n'
        '__distribution_default_branch__ = "atlas-main"\n',
        encoding="utf-8",
    )
    return path


def _distribution() -> dict[str, str]:
    return {
        "name": "Atlas Agent",
        "version": "1.2.3",
        "repo": "example/atlas-agent",
        "branch": "atlas-main",
    }


def _successful_git(monkeypatch, tmp_path: Path):
    notes = tmp_path / "release-notes"
    notes.mkdir()
    (notes / "v1.2.3.md").write_text("# Atlas Agent v1.2.3\n", encoding="utf-8")
    responses = {
        ("rev-parse", "--show-toplevel"): (0, str(tmp_path), ""),
        ("remote", "get-url", "origin"): (
            0,
            "git@github.com:example/atlas-agent.git\n",
            "",
        ),
        ("symbolic-ref", "--quiet", "--short", "HEAD"): (0, "atlas-main\n", ""),
        ("status", "--porcelain"): (0, "", ""),
        ("show-ref", "--verify", "--quiet", "refs/tags/v1.2.3"): (1, "", ""),
        ("rev-parse", "HEAD"): (0, "abc123def456\n", ""),
        ("rev-parse", "--verify", "refs/remotes/origin/atlas-main"): (
            0,
            "abc123def456\n",
            "",
        ),
        ("ls-files", "--error-unmatch", "--", "release-notes/v1.2.3.md"): (
            0,
            "release-notes/v1.2.3.md\n",
            "",
        ),
    }
    calls = []

    def fake_git(*args):
        calls.append(args)
        code, stdout, stderr = responses[args]
        return subprocess.CompletedProcess(["git", *args], code, stdout, stderr)

    monkeypatch.setattr(release, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(release, "_git", fake_git)
    return calls


def test_load_distribution_validates_semver(tmp_path):
    assert release.load_distribution(_metadata(tmp_path))["version"] == "1.2.3"

    with pytest.raises(release.ReleaseError, match="valid SemVer"):
        release.load_distribution(_metadata(tmp_path, version="2026.09"))


@pytest.mark.parametrize(
    "url",
    [
        "https://github.com/example/atlas-agent.git",
        "ssh://git@github.com/example/atlas-agent.git",
        "git@github.com:example/atlas-agent.git",
    ],
)
def test_origin_slug_accepts_common_github_urls(url):
    assert release._origin_slug(url) == "example/atlas-agent"


def test_check_is_offline_and_non_mutating(tmp_path, monkeypatch, capsys):
    calls = _successful_git(monkeypatch, tmp_path)
    monkeypatch.setattr(release, "load_distribution", _distribution)
    monkeypatch.setattr(
        release.subprocess,
        "run",
        lambda *args, **kwargs: pytest.fail("check unexpectedly launched a process"),
    )

    assert release.main(["--check"]) == 0
    assert "OK: Atlas Agent v1.2.3" in capsys.readouterr().out
    assert all(args[0] not in {"fetch", "push", "tag"} for args in calls)


def test_publish_preflight_checks_live_branch_default_tag_and_release(monkeypatch):
    git_calls = []
    process_calls = []

    def fake_git(*args):
        git_calls.append(args)
        stdout = (
            "abc123def456\trefs/heads/atlas-main\n"
            if args[1] == "--heads"
            else ""
        )
        return subprocess.CompletedProcess(["git", *args], 0, stdout, "")

    def fake_run(command, **kwargs):
        process_calls.append(command)
        stdout = "atlas-main\n" if command[-1] == ".default_branch" else "v1.2.2\n"
        return subprocess.CompletedProcess(command, 0, stdout, "")

    monkeypatch.setattr(release, "_git", fake_git)
    monkeypatch.setattr(release.subprocess, "run", fake_run)

    release.publish_preflight(_distribution(), "v1.2.3", "abc123def456")

    assert git_calls == [
        ("ls-remote", "--heads", "origin", "refs/heads/atlas-main"),
        ("ls-remote", "--tags", "origin", "refs/tags/v1.2.3", "refs/tags/v1.2.3^{}"),
    ]
    assert process_calls[0] == [
        "gh", "api", "repos/example/atlas-agent", "--jq", ".default_branch",
    ]
    assert process_calls[1][:3] == ["gh", "api", "--paginate"]


def test_publish_preflight_rejects_live_state_mismatches(monkeypatch):
    monkeypatch.setattr(
        release,
        "_git",
        lambda *args: subprocess.CompletedProcess(
            ["git", *args], 0, "different\trefs/heads/atlas-main\n", ""
        ),
    )
    with pytest.raises(release.ReleaseError, match="live origin branch"):
        release.publish_preflight(_distribution(), "v1.2.3", "abc123def456")


def test_dry_run_prints_distribution_release_command(tmp_path, monkeypatch, capsys):
    _successful_git(monkeypatch, tmp_path)
    monkeypatch.setattr(release, "load_distribution", _distribution)

    assert release.main(["--dry-run"]) == 0

    output = capsys.readouterr().out
    assert "gh release create v1.2.3" in output
    assert "--repo example/atlas-agent" in output
    assert "--target abc123def456" in output
    assert "Atlas Agent v1.2.3" in output


def test_check_rejects_uncommitted_release_notes(tmp_path, monkeypatch, capsys):
    _successful_git(monkeypatch, tmp_path)
    base_git = release._git
    monkeypatch.setattr(release, "load_distribution", _distribution)

    def fake_git(*args):
        if args and args[0] == "ls-files":
            return subprocess.CompletedProcess(["git", *args], 1, "", "not tracked")
        return base_git(*args)

    monkeypatch.setattr(release, "_git", fake_git)
    assert release.main(["--check"]) == 1
    assert "release notes must be committed" in capsys.readouterr().err


def test_preflight_rejects_mismatched_tag_before_git(monkeypatch):
    monkeypatch.setattr(
        release,
        "_git",
        lambda *args: pytest.fail("invalid tag should fail before Git is called"),
    )

    with pytest.raises(release.ReleaseError, match="exactly match"):
        release.preflight(_distribution(), "v1.2.4")


def test_preflight_rejects_wrong_origin(tmp_path, monkeypatch):
    monkeypatch.setattr(release, "REPO_ROOT", tmp_path)

    def fake_git(*args):
        value = (
            str(tmp_path)
            if args == ("rev-parse", "--show-toplevel")
            else "https://github.com/example/another-agent.git"
        )
        return subprocess.CompletedProcess(["git", *args], 0, value, "")

    monkeypatch.setattr(release, "_git", fake_git)
    with pytest.raises(release.ReleaseError, match="does not match"):
        release.preflight(_distribution(), "v1.2.3")


def test_prerelease_is_marked_without_upstream_release_links():
    distribution = _distribution() | {"version": "1.2.3-rc.1"}
    command = release.release_command(distribution, "v1.2.3-rc.1", "abc123")

    assert command[-1] == "--prerelease"
    assert "--notes-file" in command
    assert all("exampleorg" not in value.lower() for value in command)


def test_legacy_upstream_publisher_is_disabled():
    result = subprocess.run(
        [sys.executable, str(LEGACY_SCRIPT), "--publish"],
        cwd=SCRIPT.parents[1],
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode != 0
    assert "release_distribution.py --publish" in result.stderr
