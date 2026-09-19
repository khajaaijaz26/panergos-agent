"""Resolve PANERGOS_HOME for standalone skill scripts.

Skill scripts may run outside the Panergos process (system Python, nix env,
CI) where ``panergos_constants`` is not importable.  This module provides the
same ``get_panergos_home()`` contract without requiring it on ``sys.path``.

When ``panergos_constants`` IS available it is used directly so profile
resolution and any future enhancements are picked up automatically.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from panergos_constants import get_panergos_home as get_panergos_home
except (ModuleNotFoundError, ImportError):

    def get_panergos_home() -> Path:
        """Return the Panergos home directory (default: ``~/.panergos``)."""
        val = os.environ.get("PANERGOS_HOME", "").strip()
        return Path(val) if val else Path.home() / ".panergos"
