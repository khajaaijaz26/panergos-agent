"""Ambient conversation and routing affinity context."""

from __future__ import annotations

from contextvars import ContextVar
from typing import Optional


_conversation_id: ContextVar[Optional[str]] = ContextVar(
    "panergos_conversation_id", default=None
)
_affinity_scope: ContextVar[Optional[str]] = ContextVar(
    "panergos_affinity_scope", default=None
)


def _reset_var(var: ContextVar, token) -> None:
    try:
        var.reset(token)
    except Exception:
        var.set(None)


def set_affinity_scope(scope: Optional[str]):
    return _affinity_scope.set(scope or None)


def reset_affinity_scope(token) -> None:
    _reset_var(_affinity_scope, token)


def get_affinity_scope() -> Optional[str]:
    return _affinity_scope.get()


def set_conversation_context(conversation_id: Optional[str]):
    return _conversation_id.set(conversation_id or None)


def reset_conversation_context(token) -> None:
    _reset_var(_conversation_id, token)


def get_conversation_context() -> Optional[str]:
    return _conversation_id.get()
