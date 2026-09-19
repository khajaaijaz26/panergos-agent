"""Direct OpenAI-compatible TTS client configuration tests."""

from unittest.mock import patch

import pytest

from tools import tts_tool, tts_tool_openai


class TestResolveOpenaiAudioClientConfig:
    def test_prefers_tts_config_credentials_and_base_url(self):
        config = {
            "provider": "openai",
            "openai": {
                "api_key": "cfg-key",
                "base_url": "http://localhost:4003/v1",
            },
        }
        with patch.object(tts_tool, "_load_tts_config", return_value=config), patch.object(
            tts_tool_openai, "read_selection", return_value="openai"
        ), patch.object(
            tts_tool_openai, "resolve_openai_audio_api_key", return_value="env-key"
        ):
            assert tts_tool_openai._resolve_openai_audio_client_config() == (
                "cfg-key",
                "http://localhost:4003/v1",
                False,
            )

    def test_config_without_base_url_falls_back_to_default(self):
        config = {"openai": {"api_key": "cfg-key"}}
        with patch.object(tts_tool, "_load_tts_config", return_value=config), patch.object(
            tts_tool_openai, "read_selection", return_value=None
        ):
            assert tts_tool_openai._resolve_openai_audio_client_config() == (
                "cfg-key",
                tts_tool_openai.DEFAULT_OPENAI_BASE_URL,
                False,
            )

    def test_vendor_selection_missing_key_raises_selection_error(self):
        with patch.object(
            tts_tool, "_load_tts_config", return_value={"provider": "openai"}
        ), patch.object(
            tts_tool_openai, "read_selection", return_value="openai"
        ), patch.object(
            tts_tool_openai, "resolve_openai_audio_api_key", return_value=""
        ):
            with pytest.raises(ValueError) as exc:
                tts_tool_openai._resolve_openai_audio_client_config()
        assert "openai" in str(exc.value)
        assert "panergos tools" in str(exc.value)

    def test_missing_config_and_env_raises_updated_error(self):
        with patch.object(tts_tool, "_load_tts_config", return_value={}), patch.object(
            tts_tool_openai, "read_selection", return_value=None
        ), patch.object(
            tts_tool_openai, "resolve_openai_audio_api_key", return_value=""
        ):
            with pytest.raises(ValueError) as exc:
                tts_tool_openai._resolve_openai_audio_client_config()
        assert str(exc.value) == (
            "Neither tts.openai.api_key in config nor "
            "VOICE_TOOLS_OPENAI_KEY/OPENAI_API_KEY is set"
        )

    def test_config_api_key_counts_as_available_backend(self):
        config = {"openai": {"api_key": "cfg-key"}}
        with patch.object(tts_tool, "_load_tts_config", return_value=config):
            assert tts_tool_openai._has_openai_audio_backend() is True
