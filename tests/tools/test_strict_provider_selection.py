"""Strict direct tool-provider selection tests."""

from unittest.mock import patch

import pytest

from tools import tool_backend_helpers as tbh


class TestReadSelection:
    def _with_raw(self, raw):
        return patch("panergos_cli.config.read_raw_config_readonly", return_value=raw)

    def test_never_configured_returns_none(self):
        with self._with_raw({}):
            assert tbh.read_selection("image_gen") is None

    def test_vendor_provider_returned(self):
        with self._with_raw({"image_gen": {"provider": "fal"}}):
            assert tbh.read_selection("image_gen") == "fal"

    def test_legacy_use_gateway_false_keeps_vendor(self):
        with self._with_raw({"tts": {"provider": "openai", "use_gateway": False}}):
            assert tbh.read_selection("tts") == "openai"

    def test_empty_string_backend_is_no_selection(self):
        with self._with_raw({"web": {"backend": ""}}):
            assert tbh.read_selection("web") is None

    def test_raw_stt_local_is_a_selection(self):
        with self._with_raw({"stt": {"provider": "local"}}):
            assert tbh.read_selection("stt") == "local"

    def test_stt_local_with_legacy_key_is_a_selection(self):
        with self._with_raw({"stt": {"provider": "local", "use_gateway": False}}):
            assert tbh.read_selection("stt") == "local"

    def test_browser_backend_key_is_not_the_cloud_selection(self):
        with self._with_raw({"browser": {"backend": "browser-use"}}):
            assert tbh.read_selection("browser") is None

    def test_web_per_capability_keys_mark_configured(self):
        with self._with_raw({"web": {"search_backend": "searxng"}}):
            assert tbh.read_selection("web") is None
            assert tbh.selection_exists("web") is True


class TestSttStrictSelection:
    def test_vendor_selection_missing_key_errors(self):
        from tools import transcription_tools as tt

        with patch.object(tt, "_load_stt_config", return_value={}), patch(
            "tools.tool_backend_helpers.read_selection", return_value="openai"
        ), patch(
            "tools.tool_backend_helpers.resolve_openai_audio_api_key", return_value=""
        ):
            with pytest.raises(ValueError) as exc:
                tt._resolve_openai_audio_client_config()
        assert "stt is configured to use openai" in str(exc.value)
        assert "panergos tools" in str(exc.value)

    def test_never_configured_keeps_credential_ladder(self):
        from tools import transcription_tools as tt

        with patch.object(tt, "_load_stt_config", return_value={}), patch(
            "tools.tool_backend_helpers.read_selection", return_value=None
        ), patch(
            "tools.tool_backend_helpers.resolve_openai_audio_api_key",
            return_value="sk-env",
        ):
            api_key, _base_url = tt._resolve_openai_audio_client_config()
        assert api_key == "sk-env"


class TestBrowserUseStrictSelection:
    @staticmethod
    def _provider():
        from plugins.browser.browser_use.provider import BrowserUseBrowserProvider

        return BrowserUseBrowserProvider()

    def test_vendor_selection_missing_key_errors(self):
        provider = self._provider()
        with patch(
            "plugins.browser.browser_use.provider.get_secret", return_value=""
        ), patch("tools.tool_backend_helpers.read_selection", return_value="browser-use"):
            with pytest.raises(ValueError) as exc:
                provider._get_config()
        assert "direct BROWSER_USE_API_KEY" in str(exc.value)
        assert "BROWSER_USE_API_KEY" in str(exc.value)

    def test_never_configured_key_still_routes_direct(self):
        provider = self._provider()
        with patch(
            "plugins.browser.browser_use.provider.get_secret", return_value="bu-key"
        ), patch("tools.tool_backend_helpers.read_selection", return_value=None):
            config = provider._get_config_or_none()
        assert config["api_key"] == "bu-key"


class TestCamofoxSelection:
    def test_camofox_selection_activates_mode(self, monkeypatch):
        from tools import browser_camofox as bc

        monkeypatch.delenv("BROWSER_CDP_URL", raising=False)
        with patch.object(bc, "_config_cdp_url", return_value=""), patch(
            "tools.tool_backend_helpers.read_selection", return_value="camofox"
        ):
            assert bc.is_camofox_mode() is True

    def test_other_selection_beats_camofox_url_env(self, monkeypatch):
        from tools import browser_camofox as bc

        monkeypatch.delenv("BROWSER_CDP_URL", raising=False)
        with patch.object(bc, "_config_cdp_url", return_value=""), patch.object(
            bc, "get_camofox_url", return_value="http://localhost:9377"
        ), patch("tools.tool_backend_helpers.read_selection", return_value="local"):
            assert bc.is_camofox_mode() is False

    def test_never_configured_env_url_still_activates(self, monkeypatch):
        from tools import browser_camofox as bc

        monkeypatch.delenv("BROWSER_CDP_URL", raising=False)
        with patch.object(bc, "_config_cdp_url", return_value=""), patch.object(
            bc, "get_camofox_url", return_value="http://localhost:9377"
        ), patch("tools.tool_backend_helpers.read_selection", return_value=None):
            assert bc.is_camofox_mode() is True


class TestWriteProviderConfig:
    def test_byok_row_writes_vendor_and_clears_legacy_flag(self):
        from panergos_cli.tools_config import _write_provider_config

        config = {"web": {"backend": "tavily", "use_gateway": True}}
        provider = {"name": "Keenable", "web_backend": "keenable"}
        _write_provider_config(provider, config)
        assert config["web"]["backend"] == "keenable"
        assert "use_gateway" not in config["web"]

    def test_plugin_injected_byok_row_clears_stale_legacy_flag(self):
        from panergos_cli.tools_config import _write_provider_config

        config = {"stt": {"provider": "openai", "use_gateway": True}}
        provider = {"name": "Groq Whisper", "stt_provider": "groq"}
        _write_provider_config(provider, config)
        assert config["stt"]["provider"] == "groq"
        assert "use_gateway" not in config["stt"]
