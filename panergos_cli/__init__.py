"""Panergos CLI - Unified command-line interface for Panergos Agent."""

import os
import sys

__version__ = "0.1.0"
__release_date__ = "2026.9.19"
__distribution_name__ = "Panergos Agent"
__distribution_version__ = "0.1.0"
__distribution_repo_slug__ = "khajaaijaz26/panergos-agent"
__distribution_default_branch__ = "main"
__distribution_repo_url__ = f"https://github.com/{__distribution_repo_slug__}"
__distribution_docs_url__ = "https://khajaaijaz26.github.io/panergos-agent/docs"
__distribution_user_agent__ = f"PanergosAgent/{__distribution_version__}"


def _ensure_utf8():
    """Force UTF-8 stdout/stderr to prevent UnicodeEncodeError crashes.

    The CLI prints box-drawing characters and the Relay sigil in the setup wizard, doctor, and status
    banners; under a non-UTF-8 codec that raises before the command can even start (e.g.
    `panergos setup` on a fresh Pi).
    """
    repaired = False
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is None:
            continue
        try:
            if (getattr(stream, "encoding", "") or "").lower().replace("-", "") == "utf8":
                continue
            # Preferred: reconfigure in place, preserving object identity so code already holding
            # a reference to the old sys.stdout benefits from the repair too.
            reconfigure = getattr(stream, "reconfigure", None)
            if callable(reconfigure):
                reconfigure(encoding="utf-8", errors="replace")
            else:
                # No reconfigure(): reopen the fd as UTF-8 (closefd=False keeps the original fd open).
                new_stream = open(stream.fileno(), "w", encoding="utf-8", errors="replace",
                                  buffering=1, closefd=False)
                setattr(sys, stream_name, new_stream)
            repaired = True
        except (AttributeError, OSError, ValueError):
            pass
    # Only nudge child processes toward UTF-8 when a non-UTF-8 locale was actually detected; on a
    # healthy UTF-8 host children inherit it from the locale already.
    if repaired:
        os.environ.setdefault("PYTHONUTF8", "1")
        os.environ.setdefault("PYTHONIOENCODING", "utf-8")


_ensure_utf8()
