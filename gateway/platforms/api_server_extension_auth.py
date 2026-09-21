"""Ephemeral, least-privilege credentials for the local browser extension."""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
import hashlib
import hmac
import re
import secrets
import threading
import time
from typing import Callable


PAIRING_TTL_SECONDS = 120
TOKEN_TTL_SECONDS = 8 * 60 * 60
PAIRING_ATTEMPTS = 5
BROWSER_EXTENSION_SCOPES = (
    "capabilities:read",
    "session:own",
    "runs:control",
    "browser-control:connect",
)
BROWSER_EXTENSION_CONTROLLER_CAPABILITIES = frozenset({
    "controller.noop", "browser_back", "browser_click", "browser_navigate",
    "browser_press", "browser_screenshot", "browser_scroll", "browser_snapshot",
    "browser_type",
})
_PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_EXTENSION_ORIGIN_RE = re.compile(r"chrome-extension://[a-p]{32}\Z")
_PROFILE_PREFIX_RE = re.compile(r"\A/p/[^/]+(?=/)")


# An extension grant is intentionally narrower than API_SERVER_KEY. Keep this list
# beside the credential implementation so a new API route is denied by default.
_SCOPED_ROUTES: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (method, re.compile(pattern))
    for method, pattern in (
        ("GET", r"/v1/capabilities\Z"),
        ("POST", r"/api/sessions\Z"),
        ("GET", r"/api/sessions/[^/]+\Z"),
        ("POST", r"/v1/runs\Z"),
        ("GET", r"/v1/runs/[^/]+\Z"),
        ("GET", r"/v1/runs/[^/]+/events\Z"),
        ("POST", r"/v1/runs/[^/]+/(?:approval|steer|stop)\Z"),
        ("POST", r"/v1/browser-control/register\Z"),
        ("DELETE", r"/v1/browser-extension/token\Z"),
    )
)


class BrowserExtensionAuthError(Exception):
    """A client-safe pairing/authentication failure."""

    def __init__(self, message: str, *, status: int = 401, code: str = "extension_auth_failed"):
        super().__init__(message)
        self.status = status
        self.code = code


@dataclass(frozen=True)
class BrowserExtensionGrant:
    grant_id: str
    origin: str
    profile: str
    principal: str
    session_id: str
    expires_at: float


@dataclass
class _Pairing:
    secret_hash: bytes
    origin: str
    profile: str
    expires_at: float
    attempts_left: int = PAIRING_ATTEMPTS


def valid_extension_origin(origin: str) -> bool:
    """Only exact Chromium extension origins are pairable (no paths or wildcards)."""
    return bool(_EXTENSION_ORIGIN_RE.fullmatch(str(origin or "")))


def extension_route_allowed(method: str, path: str) -> bool:
    """Return whether a restricted token may call this API route."""
    normalized = _PROFILE_PREFIX_RE.sub("", path, count=1)
    return any(method.upper() == allowed_method and pattern.fullmatch(normalized)
               for allowed_method, pattern in _SCOPED_ROUTES)


class BrowserExtensionAuthStore:
    """In-memory pairing codes and hashed extension tokens.

    Restarting the API server revokes every extension grant. That is a useful
    fail-closed property and avoids writing bearer credentials to disk.
    """

    def __init__(
        self,
        *,
        clock: Callable[[], float] = time.monotonic,
        pairing_ttl_seconds: int = PAIRING_TTL_SECONDS,
        token_ttl_seconds: int = TOKEN_TTL_SECONDS,
    ) -> None:
        self._clock = clock
        self.pairing_ttl_seconds = pairing_ttl_seconds
        self.token_ttl_seconds = token_ttl_seconds
        self._pairings: dict[str, _Pairing] = {}
        self._grants: dict[bytes, BrowserExtensionGrant] = {}
        self._rates: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    @staticmethod
    def _digest(value: str) -> bytes:
        return hashlib.sha256(value.encode("utf-8")).digest()

    def _gc(self, now: float) -> None:
        self._pairings = {
            key: value for key, value in self._pairings.items() if value.expires_at > now
        }
        self._grants = {
            key: value for key, value in self._grants.items() if value.expires_at > now
        }

    def _limit(self, kind: str, actor: str, *, count: int, window: int = 60) -> None:
        now = self._clock()
        bucket = self._rates[(kind, actor)]
        while bucket and bucket[0] <= now - window:
            bucket.popleft()
        if len(bucket) >= count:
            raise BrowserExtensionAuthError(
                "Too many browser-extension pairing attempts; retry shortly.",
                status=429,
                code="extension_pairing_rate_limited",
            )
        bucket.append(now)

    def mint_pairing_code(self, *, origin: str, profile: str, actor: str) -> tuple[str, int]:
        if not valid_extension_origin(origin):
            raise BrowserExtensionAuthError(
                "origin must be an exact chrome-extension:// origin.",
                status=400,
                code="invalid_extension_origin",
            )
        with self._lock:
            self._limit("mint", actor, count=5)
            now = self._clock()
            self._gc(now)
            pairing_id = "".join(secrets.choice(_PAIRING_ALPHABET) for _ in range(6))
            secret = "".join(secrets.choice(_PAIRING_ALPHABET) for _ in range(8))
            while pairing_id in self._pairings:
                pairing_id = "".join(secrets.choice(_PAIRING_ALPHABET) for _ in range(6))
            self._pairings[pairing_id] = _Pairing(
                secret_hash=self._digest(secret),
                origin=origin,
                profile=profile or "default",
                expires_at=now + self.pairing_ttl_seconds,
            )
            return f"{pairing_id}-{secret}", self.pairing_ttl_seconds

    def exchange(self, *, pairing_code: str, origin: str, actor: str) -> tuple[str, BrowserExtensionGrant]:
        if not valid_extension_origin(origin):
            raise BrowserExtensionAuthError(
                "A valid browser-extension Origin header is required.",
                status=403,
                code="extension_origin_required",
            )
        with self._lock:
            self._limit("exchange", actor, count=20)
            now = self._clock()
            self._gc(now)
            try:
                pairing_id, secret = pairing_code.strip().upper().split("-", 1)
            except (AttributeError, ValueError):
                pairing_id = secret = ""
            pairing = self._pairings.get(pairing_id)
            if pairing is None:
                raise BrowserExtensionAuthError(
                    "Invalid or expired browser-extension pairing code.",
                    code="invalid_pairing_code",
                )
            if not hmac.compare_digest(pairing.origin, origin):
                pairing.attempts_left -= 1
                if pairing.attempts_left <= 0:
                    self._pairings.pop(pairing_id, None)
                raise BrowserExtensionAuthError(
                    "The pairing code was issued for a different extension origin.",
                    status=403,
                    code="extension_origin_mismatch",
                )
            if not hmac.compare_digest(pairing.secret_hash, self._digest(secret)):
                pairing.attempts_left -= 1
                if pairing.attempts_left <= 0:
                    self._pairings.pop(pairing_id, None)
                raise BrowserExtensionAuthError(
                    "Invalid or expired browser-extension pairing code.",
                    code="invalid_pairing_code",
                )

            self._pairings.pop(pairing_id, None)  # success is one-time
            token = f"pxe_{secrets.token_urlsafe(32)}"
            token_hash = self._digest(token)
            extension_identity = hashlib.sha256(
                f"{pairing.profile}\0{origin}".encode("utf-8")
            ).hexdigest()[:32]
            grant = BrowserExtensionGrant(
                grant_id=token_hash.hex(),
                origin=origin,
                profile=pairing.profile,
                principal=f"principal:browser-extension:{extension_identity}",
                session_id=f"extension_{extension_identity}",
                expires_at=now + self.token_ttl_seconds,
            )
            self._grants[token_hash] = grant
            return token, grant

    def grant_is_active(self, grant_id: str) -> bool:
        """Whether an unexpired grant still exists, without accepting its bearer again."""
        try:
            token_hash = bytes.fromhex(grant_id)
        except (TypeError, ValueError):
            return False
        with self._lock:
            now = self._clock()
            self._gc(now)
            grant = self._grants.get(token_hash)
            return grant is not None and hmac.compare_digest(grant.grant_id, grant_id)

    def revoke_grant(self, token: str) -> BrowserExtensionGrant | None:
        """Atomically revoke ``token`` and return the grant needed for live cleanup."""
        with self._lock:
            return self._grants.pop(self._digest(token), None)

    def revoke_grant_id(self, grant_id: str) -> BrowserExtensionGrant | None:
        """Atomically remove one grant by its server-only digest identifier."""
        try:
            token_hash = bytes.fromhex(grant_id)
        except (TypeError, ValueError):
            return None
        with self._lock:
            grant = self._grants.get(token_hash)
            if grant is None or not hmac.compare_digest(grant.grant_id, grant_id):
                return None
            return self._grants.pop(token_hash)

    def authenticate(
        self, *, token: str, origin: str, profile: str, method: str, path: str
    ) -> BrowserExtensionGrant:
        if not valid_extension_origin(origin):
            raise BrowserExtensionAuthError(
                "A valid browser-extension Origin header is required.",
                code="extension_origin_required",
            )
        with self._lock:
            now = self._clock()
            self._gc(now)
            grant = self._grants.get(self._digest(token))
            if grant is None or not hmac.compare_digest(grant.origin, origin) or grant.profile != (profile or "default"):
                raise BrowserExtensionAuthError(
                    "Invalid or expired browser-extension token.",
                    code="extension_auth_failed",
                )
            if not extension_route_allowed(method, path):
                raise BrowserExtensionAuthError(
                    "This browser-extension token is not authorized for that API route.",
                    status=403,
                    code="extension_scope_forbidden",
                )
            return grant

    def revoke(self, token: str) -> bool:
        return self.revoke_grant(token) is not None
