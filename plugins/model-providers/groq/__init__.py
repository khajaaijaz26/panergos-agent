"""GroqCloud direct inference provider."""

from providers import register_provider
from providers.base import ProviderProfile


groq = ProviderProfile(
    name="groq",
    aliases=("groqcloud", "groq-cloud"),
    display_name="Groq",
    description="GroqCloud (fast OpenAI-compatible inference)",
    signup_url="https://console.groq.com/keys",
    env_vars=("GROQ_API_KEY", "GROQ_BASE_URL"),
    base_url="https://api.groq.com/openai/v1",
    auth_type="api_key",
    # Groq's /models also advertises speech models; models.dev supplies the
    # tool-capable chat catalog used by Panergos pickers.
    supports_model_listing=False,
)

register_provider(groq)
