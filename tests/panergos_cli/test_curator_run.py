"""Tests for `panergos curator run` CLI behavior."""

from __future__ import annotations

from types import SimpleNamespace


def _args(**kwargs):
    values = {
        "dry_run": False,
        "synchronous": False,
        "background": False,
    }
    values.update(kwargs)
    return SimpleNamespace(**values)
