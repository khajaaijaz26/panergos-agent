#!/usr/bin/env python3
"""Fail when tracked files reintroduce upstream product or service branding."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
_LEGACY_PRODUCT = "her" + "mes"
_LEGACY_VENDOR = "no" + "us"
FORBIDDEN = re.compile(
    rf"{_LEGACY_PRODUCT}|{_LEGACY_VENDOR}research|{_LEGACY_VENDOR} research|"
    rf"\.{_LEGACY_VENDOR}research\.com|"
    rf"(?:^|[^a-z]){_LEGACY_VENDOR}(?:[_-]| portal| cloud| agent| api| provider| model| auth| inference| policy| wire| rate)|"
    rf"[\"']{_LEGACY_VENDOR}[\"']|\b(?:is|make|get|default){_LEGACY_VENDOR}",
    re.IGNORECASE,
)


def tracked_files() -> list[Path]:
    output = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT)
    return [ROOT / name.decode("utf-8") for name in output.split(b"\0") if name]


def allowed(path: Path, line: str) -> bool:
    relative = path.relative_to(ROOT).as_posix()
    if path.name.upper().startswith(("LICENSE", "NOTICE", "COPYING")):
        return True
    parser_package = rf"{_LEGACY_PRODUCT}-(?:estree|parser)"
    return relative == "package-lock.json" and bool(re.search(parser_package, line, re.IGNORECASE))


def main() -> int:
    sys.stdout.reconfigure(errors="backslashreplace")
    violations: list[str] = []
    for path in tracked_files():
        if FORBIDDEN.search(path.relative_to(ROOT).as_posix()):
            violations.append(path.relative_to(ROOT).as_posix())
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for number, line in enumerate(text.splitlines(), 1):
            if FORBIDDEN.search(line) and not allowed(path, line):
                violations.append(f"{path.relative_to(ROOT).as_posix()}:{number}: {line.strip()}")

    if violations:
        shown = violations[:200]
        suffix = f"\n... {len(violations) - len(shown)} more" if len(violations) > len(shown) else ""
        print("Forbidden upstream identity references:\n" + "\n".join(shown) + suffix)
        return 1
    print("Panergos identity check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
