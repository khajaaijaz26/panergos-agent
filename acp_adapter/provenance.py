"""Derive ACP session-provenance metadata from the existing compression chain.

Additive Panergos extension under ACP ``_meta.panergos`` (unknown to other clients,
so ignored). No new persisted state: everything is derived from the ``sessions``
table (``parent_session_id`` / ``end_reason``), which already models
compression-continuation chains.

The ACP/editor ``session_id`` stays the stable public handle; when compression
rotates the internal Panergos head, ``build_session_provenance`` exposes the
previous/current internal ids and lineage root without parsing status text.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

# Bound defensive walks; compression chains this deep are pathological.
_MAX_WALK = 100


def _get_row(db: Any, session_id: str) -> Optional[Dict[str, Any]]:
    try:
        return db.get_session(session_id)
    except Exception:
        return None


def _is_compression_end(row: Any) -> bool:
    return bool(row) and row.get("end_reason") == "compression"


def build_session_provenance(
    db: Any, acp_session_id: str, current_panergos_session_id: str, *, previous_panergos_session_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Build ``_meta.panergos.sessionProvenance`` for an ACP session.

    ``db`` must expose ``get_session``. ``current_panergos_session_id`` is the live
    internal id (``state.agent.session_id``); ``previous_panergos_session_id`` is
    the id before the most recent turn, supplied by ``prompt()`` to flag a
    rotation. Returns ``None`` if the session can't be read."""
    row = _get_row(db, current_panergos_session_id)
    if not row:
        return None
    parent_id = row.get("parent_session_id")

    # Walk parents to the lineage root. Only compression-split parents
    # (parent.end_reason == 'compression') count toward depth — delegate/branch
    # children share the parent_session_id column but are not compaction boundaries.
    root_id, compression_depth, cursor_parent = current_panergos_session_id, 0, parent_id
    seen = {current_panergos_session_id}
    for _ in range(_MAX_WALK):
        if not cursor_parent or cursor_parent in seen:
            break
        seen.add(cursor_parent)
        prow = _get_row(db, cursor_parent)
        if not prow:
            break
        root_id = cursor_parent
        compression_depth += _is_compression_end(prow)
        cursor_parent = prow.get("parent_session_id")

    # A continuation is a session whose immediate parent ended with end_reason='compression'.
    is_continuation = bool(parent_id) and _is_compression_end(_get_row(db, parent_id))

    provenance: Dict[str, Any] = {
        "acpSessionId": acp_session_id, "currentPanergosSessionId": current_panergos_session_id,
        "rootPanergosSessionId": root_id, "parentPanergosSessionId": parent_id,
        "sessionKind": "continuation" if is_continuation else "root", "compressionDepth": compression_depth,
    }
    if previous_panergos_session_id:
        provenance["previousPanergosSessionId"] = previous_panergos_session_id
        if previous_panergos_session_id != current_panergos_session_id:
            # The only mechanism that rotates the internal id mid-turn is
            # compression-driven session splitting.
            provenance["reason"] = "compression"
            provenance["creatorKind"] = "compression"
    return provenance


def session_provenance_meta(
    db: Any, acp_session_id: str, current_panergos_session_id: str, *, previous_panergos_session_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Return a ready ``_meta`` payload: ``{"panergos": {"sessionProvenance": ...}}``."""
    prov = build_session_provenance(db, acp_session_id, current_panergos_session_id,
                                    previous_panergos_session_id=previous_panergos_session_id)
    return None if prov is None else {"panergos": {"sessionProvenance": prov}}
