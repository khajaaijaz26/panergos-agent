from types import SimpleNamespace

import agent.models_dev as models_dev
import panergos_cli.auth as auth
import panergos_cli.models as models
import panergos_cli.provider_catalog as catalog
import panergos_cli.web_routers.config_env as routes
from panergos_cli.provider_catalog import ProviderDescriptor


def _provider(
    slug: str, *, tab: str = "keys", auth_type: str = "api_key",
    keyless: bool = False, api_key: bool = True,
):
    return ProviderDescriptor(
        slug=slug, label=slug.title(), description=slug, auth_type=auth_type, tab=tab,
        api_key_env_vars=(
            (f"{slug.upper()}_API_KEY",) if tab == "keys" and not keyless and api_key else ()
        ),
        base_url_env_var="", signup_url="", order=0, keyless=keyless,
    )


def test_directory_lists_only_real_routable_setup_paths(monkeypatch):
    fetch_calls = []
    registry = {
        "acme-reg": {
            "name": "Acme Registry", "doc": "https://docs.acme.test", "models": {
                f"model-{index:03}": {} for index in range(105)
            },
        },
        "account-reg": {"name": "Account", "models": {"not-entitled": {}}},
        "extra": {
            "name": "Extra AI", "npm": "@ai-sdk/openai-compatible",
            "api": "https://api.extra.test/v1", "env": ["EXTRA_API_KEY"],
            "doc": "https://docs.extra.test", "models": {"extra-chat": {}},
        },
        "native-only": {
            "name": "Native", "npm": "@ai-sdk/anthropic", "api": "https://native.test/v1",
            "env": ["NATIVE_API_KEY"], "models": {"native-chat": {}},
        },
        "templated": {
            "name": "Template", "npm": "@ai-sdk/openai-compatible",
            "api": "https://${HOST}/v1", "env": ["TEMPLATE_API_KEY"], "models": {"chat": {}},
        },
    }
    monkeypatch.setattr(
        models_dev,
        "fetch_models_dev",
        lambda **kwargs: fetch_calls.append(kwargs) or registry,
    )
    monkeypatch.setattr(
        models_dev, "PROVIDER_TO_MODELS_DEV", {"acme": "acme-reg", "account": "account-reg"}
    )
    monkeypatch.setattr(catalog, "provider_catalog", lambda: [
        _provider("acme"), _provider("account", tab="accounts", auth_type="oauth_external"),
        _provider("bedrock", auth_type="aws_sdk", api_key=False),
        _provider("free", keyless=True), _provider("virtual", auth_type="virtual"), _provider("custom"),
    ])
    monkeypatch.setattr(auth, "PROVIDER_REGISTRY", {
        "acme": SimpleNamespace(inference_base_url="https://api.acme.test/v1"),
        "account": SimpleNamespace(inference_base_url="https://account.test/v1"),
        "bedrock": SimpleNamespace(inference_base_url="https://bedrock.test/v1"),
    })
    monkeypatch.setattr(auth, "is_provider_explicitly_configured", lambda slug: slug == "acme")
    monkeypatch.setattr(models, "_PROVIDER_MODELS", {
        "acme": ["preferred-model"], "account": ["entitled-model"],
        "bedrock": ["bedrock-model"], "free": ["free-model"],
    })
    monkeypatch.setattr(routes, "load_config", lambda: {
        "providers": {
            "saved-extra": {
                "name": "Saved extra", "base_url": "https://api.extra.test/v1",
                "model": "extra-chat", "models": {"extra-chat": {}},
            }
        },
        "model": {},
    })
    result = routes._provider_setup_directory_sync()["providers"]
    by_id = {row["id"]: row for row in result}

    assert set(by_id) == {"acme", "account", "bedrock", "free", "extra"}
    assert by_id["acme"]["models"][0] == "preferred-model"
    assert len(by_id["acme"]["models"]) == 100
    assert by_id["acme"]["total_models"] == 106
    assert by_id["account"]["models"] == ["entitled-model"]
    assert by_id["account"]["setup_tab"] == "accounts"
    assert by_id["acme"]["setup_tab"] == "keys"
    assert by_id["bedrock"]["signup_url"].startswith("https://docs.aws.amazon.com/")
    assert by_id["free"]["configured"] is True
    assert by_id["extra"]["setup_kind"] == "custom_endpoint"
    assert by_id["extra"]["configured"] is True
    assert by_id["extra"]["key_env"] == "EXTRA_API_KEY"
    assert fetch_calls == [{}]


def test_directory_url_filter_rejects_templates_and_non_http_urls():
    assert routes._concrete_http_url("https://api.example.test/v1/") == "https://api.example.test/v1"
    assert routes._concrete_http_url("http://api.example.test/v1") == ""
    assert routes._concrete_http_url("http://127.0.0.1:11434/v1") == "http://127.0.0.1:11434/v1"
    assert routes._concrete_http_url("https://${ACCOUNT}/v1") == ""
    assert routes._concrete_http_url("file:///tmp/models") == ""
