"""Shared FAL.ai SDK plumbing for the direct provider."""

from __future__ import annotations

from typing import Any


def import_fal_client() -> Any:
    """Import ``fal_client`` lazily; raise ImportError when it is unavailable."""
    try:
        from tools.lazy_deps import ensure as _lazy_ensure
        _lazy_ensure("image.fal", prompt=False)
    except ImportError:
        pass
    except Exception as exc:  # noqa: BLE001 — lazy_deps surfaces install hints
        raise ImportError(str(exc))
    import fal_client  # type: ignore  # noqa: WPS433 — intentionally lazy
    return fal_client
