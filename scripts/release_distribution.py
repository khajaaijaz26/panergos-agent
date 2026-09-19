#!/usr/bin/env python3
"""Publish the Panergos Agent SemVer distribution.

Set the distribution metadata in ``panergos_cli/__init__.py``, commit and push the
configured default branch, then run ``--check`` or ``--dry-run`` before
``--publish``.  Check and dry-run use local Git state only.
"""

from __future__ import annotations

import argparse
import ast
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
IDENTITY_FILE = REPO_ROOT / "panergos_cli" / "__init__.py"
FIELDS = {
    "__distribution_name__": "name",
    "__distribution_version__": "version",
    "__distribution_repo_slug__": "repo",
    "__distribution_default_branch__": "branch",
}
SEMVER_RE = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-(?P<prerelease>(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)"
    r"(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)
REPO_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9._-]+$")
BRANCH_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")


class ReleaseError(RuntimeError):
    """A release precondition was not met."""


def load_distribution(path: Path = IDENTITY_FILE) -> dict[str, str]:
    """Read the four distribution literals without importing the package."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    values: dict[str, str] = {}
    for node in tree.body:
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        target = node.targets[0]
        if not isinstance(target, ast.Name) or target.id not in FIELDS:
            continue
        value = ast.literal_eval(node.value)
        if not isinstance(value, str):
            raise ReleaseError(f"{target.id} must be a string literal")
        values[FIELDS[target.id]] = value

    missing = sorted(set(FIELDS.values()) - values.keys())
    if missing:
        raise ReleaseError(f"missing distribution metadata: {', '.join(missing)}")
    _validate_distribution(values)
    return values


def _validate_distribution(distribution: dict[str, str]) -> None:
    for key, value in distribution.items():
        if not value or value != value.strip():
            raise ReleaseError(f"distribution {key} must be a non-empty trimmed string")
    if not SEMVER_RE.fullmatch(distribution["version"]):
        raise ReleaseError(
            f"distribution version {distribution['version']!r} is not valid SemVer"
        )
    if not REPO_RE.fullmatch(distribution["repo"]):
        raise ReleaseError("distribution repo must be a GitHub owner/repository slug")
    branch = distribution["branch"]
    if (
        not BRANCH_RE.fullmatch(branch)
        or ".." in branch
        or "//" in branch
        or "@{" in branch
        or branch.endswith((".", "/", ".lock"))
    ):
        raise ReleaseError(f"distribution branch {branch!r} is not a safe Git branch")


def _origin_slug(url: str) -> str | None:
    value = url.strip().rstrip("/")
    patterns = (
        r"(?:https?|git|ssh)://(?:[^/@]+@)?github\.com[/:]([^/]+/[^/]+)",
        r"[^@]+@github\.com:([^/]+/[^/]+)",
    )
    for pattern in patterns:
        match = re.fullmatch(pattern, value, flags=re.IGNORECASE)
        if match:
            return re.sub(r"\.git$", "", match.group(1), flags=re.IGNORECASE)
    return None


def _git(*args: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["GIT_OPTIONAL_LOCKS"] = "0"
    try:
        return subprocess.run(
            ["git", *args],
            cwd=REPO_ROOT,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    except OSError as exc:
        raise ReleaseError(f"could not run git: {exc}") from exc


def _git_text(*args: str) -> str:
    result = _git(*args)
    if result.returncode:
        detail = result.stderr.strip() or "git command failed"
        raise ReleaseError(f"git {' '.join(args)}: {detail}")
    return result.stdout.strip()


def _validate_tag(tag: str, version: str) -> None:
    expected = f"v{version}"
    if tag != expected or not SEMVER_RE.fullmatch(tag[1:]):
        raise ReleaseError(f"release tag must exactly match distribution version: {expected}")


def preflight(distribution: dict[str, str], tag: str) -> str:
    """Validate a clean, pushed default-branch checkout and return its commit."""
    _validate_tag(tag, distribution["version"])
    root = Path(_git_text("rev-parse", "--show-toplevel")).resolve()
    if root != REPO_ROOT.resolve():
        raise ReleaseError(f"run from the configured repository: {REPO_ROOT}")

    actual_repo = _origin_slug(_git_text("remote", "get-url", "origin"))
    if not actual_repo or actual_repo.casefold() != distribution["repo"].casefold():
        raise ReleaseError(
            f"origin does not match distribution repo {distribution['repo']}"
        )

    branch = _git_text("symbolic-ref", "--quiet", "--short", "HEAD")
    if branch != distribution["branch"]:
        raise ReleaseError(
            f"release from {distribution['branch']!r}, not {branch!r}"
        )
    if _git_text("status", "--porcelain"):
        raise ReleaseError("working tree must be clean")

    tag_result = _git("show-ref", "--verify", "--quiet", f"refs/tags/{tag}")
    if tag_result.returncode == 0:
        raise ReleaseError(f"local tag already exists: {tag}")
    if tag_result.returncode != 1:
        raise ReleaseError(tag_result.stderr.strip() or "could not inspect local tags")

    head = _git_text("rev-parse", "HEAD")
    tracking = _git_text(
        "rev-parse", "--verify", f"refs/remotes/origin/{distribution['branch']}"
    )
    if head != tracking:
        raise ReleaseError("HEAD must match the locally known origin branch before release")
    return head


def _command_text(command: list[str]) -> str:
    try:
        result = subprocess.run(
            command,
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    except OSError as exc:
        raise ReleaseError(f"could not run {command[0]}: {exc}") from exc
    if result.returncode:
        detail = result.stderr.strip() or f"exit code {result.returncode}"
        raise ReleaseError(f"{' '.join(command)}: {detail}")
    return result.stdout.strip()


def publish_preflight(distribution: dict[str, str], tag: str, commit: str) -> None:
    """Recheck live GitHub state immediately before creating a release."""
    branch = distribution["branch"]
    remote_branch = _git_text("ls-remote", "--heads", "origin", f"refs/heads/{branch}")
    expected = f"{commit}\trefs/heads/{branch}"
    if remote_branch != expected:
        raise ReleaseError("live origin branch must exactly match the release commit")

    remote_tag = _git_text(
        "ls-remote", "--tags", "origin", f"refs/tags/{tag}", f"refs/tags/{tag}^{{}}"
    )
    if remote_tag:
        raise ReleaseError(f"remote tag already exists: {tag}")

    repo = distribution["repo"]
    default_branch = _command_text(["gh", "api", f"repos/{repo}", "--jq", ".default_branch"])
    if default_branch != branch:
        raise ReleaseError(
            f"GitHub default branch is {default_branch!r}, expected {branch!r}"
        )

    release_tags = _command_text([
        "gh", "api", "--paginate", f"repos/{repo}/releases?per_page=100",
        "--jq", ".[].tag_name",
    ]).splitlines()
    if tag in release_tags:
        raise ReleaseError(f"GitHub release already exists: {tag}")


def release_notes_path(distribution: dict[str, str]) -> Path:
    """Versioned, reviewed release notes; avoids upstream history in generated notes."""
    return REPO_ROOT / "release-notes" / f"v{distribution['version']}.md"


def release_command(
    distribution: dict[str, str], tag: str, commit: str, notes_file: Path | None = None
) -> list[str]:
    notes_file = notes_file or release_notes_path(distribution)
    command = [
        "gh",
        "release",
        "create",
        tag,
        "--repo",
        distribution["repo"],
        "--target",
        commit,
        "--title",
        f"{distribution['name']} {tag}",
        "--notes-file",
        str(notes_file),
    ]
    if SEMVER_RE.fullmatch(distribution["version"])["prerelease"]:
        command.append("--prerelease")
    return command


def _publish(command: list[str]) -> None:
    try:
        result = subprocess.run(command, cwd=REPO_ROOT, check=False)
    except OSError as exc:
        raise ReleaseError(f"could not run gh: {exc}") from exc
    if result.returncode:
        raise ReleaseError(f"gh release create failed with exit code {result.returncode}")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate or publish this distribution's SemVer release."
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="run offline preflight checks")
    mode.add_argument(
        "--dry-run", action="store_true", help="print the release command without running it"
    )
    mode.add_argument("--publish", action="store_true", help="create the GitHub release")
    parser.add_argument("--tag", help="release tag; defaults to v<distribution version>")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        distribution = load_distribution()
        tag = args.tag or f"v{distribution['version']}"
        commit = preflight(distribution, tag)
        notes_file = release_notes_path(distribution)
        if not notes_file.is_file():
            raise ReleaseError(f"release notes file is missing: {notes_file.name}")
        tracked = _git(
            "ls-files", "--error-unmatch", "--",
            notes_file.relative_to(REPO_ROOT).as_posix(),
        )
        if tracked.returncode:
            raise ReleaseError("release notes must be committed before publishing")
        command = release_command(distribution, tag, commit, notes_file)
        if args.publish:
            publish_preflight(distribution, tag, commit)
            _publish(command)
            print(f"Published {distribution['name']} {tag}")
        elif args.dry_run or not args.check:
            print(shlex.join(command))
        else:
            print(
                f"OK: {distribution['name']} {tag} from "
                f"{distribution['repo']}@{commit[:12]}"
            )
        return 0
    except (OSError, SyntaxError, ValueError, ReleaseError) as exc:
        print(f"release error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
