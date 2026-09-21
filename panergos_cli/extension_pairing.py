"""Local owner flow for pairing the Panergos browser extension."""

from __future__ import annotations

import ipaddress
import json
import os
import re
from urllib import error, parse, request

from panergos_cli.config import get_env_value_prefer_dotenv


class ExtensionPairingError(RuntimeError):
    pass


class _NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def _default_api_base() -> str:
    port = get_env_value_prefer_dotenv("API_SERVER_PORT") or os.getenv("API_SERVER_PORT") or "8642"
    return f"http://127.0.0.1:{port}"


def _validated_loopback_base(value: str) -> str:
    base = str(value or "").strip().rstrip("/")
    parsed = parse.urlsplit(base)
    if (parsed.scheme not in {"http", "https"} or not parsed.hostname
            or parsed.username is not None or parsed.password is not None
            or parsed.query or parsed.fragment):
        raise ExtensionPairingError("--api-base must be a loopback HTTP(S) URL.")
    try:
        loopback = parsed.hostname.lower() == "localhost" or ipaddress.ip_address(parsed.hostname).is_loopback
    except ValueError:
        loopback = parsed.hostname.lower() == "localhost"
    if not loopback:
        raise ExtensionPairingError("Pairing is loopback-only; --api-base must use localhost.")
    if parsed.path and not re.fullmatch(r"/p/[^/]+", parsed.path):
        raise ExtensionPairingError("--api-base may contain only a /p/<profile> path prefix.")
    return base


def request_pairing_code(
    origin: str, *, api_base: str | None = None, api_key: str | None = None, timeout: float = 10.0
) -> dict:
    """Ask the local API server to mint an origin-bound one-time code."""
    key = api_key or get_env_value_prefer_dotenv("API_SERVER_KEY") or ""
    if not key:
        raise ExtensionPairingError(
            "API_SERVER_KEY is not configured. Start/configure the Panergos API server first.")
    base = _validated_loopback_base(api_base or _default_api_base())
    body = json.dumps({"origin": origin}).encode("utf-8")
    req = request.Request(
        f"{base}/v1/browser-extension/pair",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        # Pairing carries the owner key: never inherit an HTTP proxy and never follow redirects.
        with request.build_opener(request.ProxyHandler({}), _NoRedirect).open(
            req, timeout=timeout
        ) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode("utf-8"))
            message = payload.get("error", {}).get("message") or str(exc.reason)
        except Exception:
            message = str(exc.reason)
        raise ExtensionPairingError(f"Pairing request failed ({exc.code}): {message}") from None
    except (error.URLError, OSError, ValueError) as exc:
        reason = getattr(exc, "reason", exc)
        raise ExtensionPairingError(f"Could not reach the local Panergos API server: {reason}") from None
    if not isinstance(payload, dict) or not payload.get("pairing_code"):
        raise ExtensionPairingError("The local API server returned an invalid pairing response.")
    return payload
