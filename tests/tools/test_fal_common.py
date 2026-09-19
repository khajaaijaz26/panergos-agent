"""Tests for the shared direct FAL.ai SDK import."""

import sys
import types
from unittest.mock import MagicMock, patch

import pytest

from tools.fal_common import import_fal_client


@pytest.fixture
def fake_fal_client(monkeypatch):
    module = types.ModuleType("fal_client")
    monkeypatch.setitem(sys.modules, "fal_client", module)
    return module


class TestImportFalClient:
    def test_returns_fal_client_module(self, monkeypatch, fake_fal_client):
        ensure = MagicMock()
        monkeypatch.setattr("tools.lazy_deps.ensure", ensure)

        assert import_fal_client() is fake_fal_client
        ensure.assert_called_once_with("image.fal", prompt=False)

    def test_lazy_ensure_import_error_is_swallowed(self, monkeypatch, fake_fal_client):
        monkeypatch.setattr(
            "tools.lazy_deps.ensure",
            MagicMock(side_effect=ImportError("no lazy_deps")),
        )

        assert import_fal_client() is fake_fal_client

    def test_lazy_ensure_other_exception_raises_import_error(self):
        with patch("tools.lazy_deps.ensure", side_effect=RuntimeError("install hint")):
            with pytest.raises(ImportError, match="install hint"):
                import_fal_client()

    def test_lazy_ensure_module_missing_is_swallowed(self, fake_fal_client):
        import builtins

        original_import = builtins.__import__

        def failing_import(name, *args, **kwargs):
            if name == "tools.lazy_deps":
                raise ImportError("no module")
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=failing_import):
            assert import_fal_client() is fake_fal_client
