"""xAI (Grok) provider profile."""

from panergos_cli import __distribution_version__ as _PANERGOS_VERSION
from providers import register_provider
from providers.base import ProviderProfile

xai = ProviderProfile(
    name="xai", aliases=("grok", "x-ai", "x.ai"), api_mode="codex_responses", env_vars=("XAI_API_KEY",),
    base_url="https://api.x.ai/v1", auth_type="api_key",
    default_headers={"User-Agent": f"PanergosAgent/{_PANERGOS_VERSION}"},
)

register_provider(xai)
