"""Mistral AI direct inference provider."""

from providers import register_provider
from providers.base import ProviderProfile


mistral = ProviderProfile(
    name="mistral",
    aliases=("mistral-ai", "mistralai"),
    display_name="Mistral AI",
    description="Mistral AI (OpenAI-compatible direct model API)",
    signup_url="https://console.mistral.ai/api-keys/",
    env_vars=("MISTRAL_API_KEY", "MISTRAL_BASE_URL"),
    base_url="https://api.mistral.ai/v1",
    auth_type="api_key",
    # Mistral's /models mixes chat and non-chat products; models.dev supplies
    # the tool-capable catalog used by Panergos pickers.
    supports_model_listing=False,
)

register_provider(mistral)
