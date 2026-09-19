"""Resolve PANERGOS_HOME for standalone skill scripts.

Skill scripts may run outside the Panergos process (e.g. system Python,
nix env, CI) where ``panergos_constants`` is not importable.  This module
provides the same ``get_panergos_home()`` and ``display_panergos_home()``
contracts as ``panergos_constants`` without requiring it on ``sys.path``.

When ``panergos_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``panergos_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``PANERGOS_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from panergos_constants import display_panergos_home as display_panergos_home
    from panergos_constants import get_panergos_home as get_panergos_home
except (ModuleNotFoundError, ImportError):

    def get_panergos_home() -> Path:
        """Return the Panergos home directory (default: ~/.panergos).

        Mirrors ``panergos_constants.get_panergos_home()``."""
        val = os.environ.get("PANERGOS_HOME", "").strip()
        return Path(val) if val else Path.home() / ".panergos"

    def display_panergos_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``panergos_constants.display_panergos_home()``."""
        home = get_panergos_home()
        try:
            return "~/" + home.relative_to(Path.home()).as_posix()
        except ValueError:
            return str(home)
