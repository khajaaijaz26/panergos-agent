"""Direct Groq and Mistral provider wiring shared by every UI surface."""

from __future__ import annotations

import asyncio

import pytest


PROVIDERS = (
    ("groq", "GROQ_API_KEY", "https://api.groq.com/openai/v1"),
    ("mistral", "MISTRAL_API_KEY", "https://api.mistral.ai/v1"),
)


@pytest.mark.parametrize("slug,key_env,base_url", PROVIDERS)
def test_direct_provider_is_discoverable_and_routable(slug, key_env, base_url, monkeypatch):
    from panergos_cli import runtime_provider as runtime
    from panergos_cli.auth import is_runtime_provider_routable
    from panergos_cli.provider_catalog import provider_catalog_by_slug
    from providers import get_provider_profile

    profile = get_provider_profile(slug)
    descriptor = provider_catalog_by_slug()[slug]

    assert profile is not None
    assert profile.base_url == base_url
    assert profile.env_vars[0] == key_env
    assert descriptor.api_key_env_vars[0] == key_env
    assert descriptor.signup_url
    assert is_runtime_provider_routable(slug)

    monkeypatch.setattr(runtime._config_mod, "load_config", lambda: {})
    resolved = runtime.resolve_runtime_provider(
        requested=slug, explicit_api_key="test-provider-key", target_model="test-model"
    )
    assert resolved["provider"] == slug
    assert resolved["api_mode"] == "chat_completions"
    assert resolved["base_url"] == base_url
    assert resolved["api_key"] == "test-provider-key"


def test_provider_directory_exposes_named_setup_rows(monkeypatch):
    import agent.models_dev as models_dev
    import panergos_cli.web_routers.config_env as routes

    monkeypatch.setattr(models_dev, "fetch_models_dev", lambda: {
        "groq": {
            "name": "Groq", "doc": "https://console.groq.com/docs/models",
            "models": {"llama-test": {"tool_call": True}},
        },
        "mistral": {
            "name": "Mistral", "doc": "https://docs.mistral.ai/getting-started/models/",
            "models": {"mistral-test": {"tool_call": True}},
        },
    })
    monkeypatch.setattr(routes, "load_config", lambda: {})

    rows = {row["id"]: row for row in routes._provider_setup_directory_sync()["providers"]}
    for slug, key_env, base_url in PROVIDERS:
        row = rows[slug]
        assert row["setup_kind"] == "built_in"
        assert row["key_env"] == key_env
        assert row["base_url"] == base_url
        assert row["models"]
        assert row["signup_url"]


@pytest.mark.parametrize(
    "key_env,url",
    (
        ("GROQ_API_KEY", "https://api.groq.com/openai/v1/models"),
        ("MISTRAL_API_KEY", "https://api.mistral.ai/v1/models"),
    ),
)
def test_browser_and_desktop_connection_probe_uses_bearer_auth(key_env, url, monkeypatch):
    import httpx
    import panergos_cli.web_routers.config_env as routes
    from panergos_cli.web_models import EnvVarUpdate

    calls = []

    class Response:
        status_code = 200
        is_success = True

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, request_url, *, headers, params):
            calls.append((request_url, headers, params))
            return Response()

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: Client())
    monkeypatch.setattr(routes, "_require_token", lambda request: None)

    result = asyncio.run(routes.validate_provider_credential(
        EnvVarUpdate(key=key_env, value="private-test-key"), request=None
    ))

    assert result == {"ok": True, "reachable": True, "message": ""}
    assert calls == [(url, {"Accept": "application/json", "Authorization": "Bearer private-test-key"}, {})]
