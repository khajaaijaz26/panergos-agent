import argparse

import pytest

from panergos_cli import extension_pairing
from panergos_cli.subcommands.extension import build_extension_parser


ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"


def test_extension_pair_command_uses_exact_origin(monkeypatch, capsys):
    parser = argparse.ArgumentParser()
    build_extension_parser(parser.add_subparsers(dest="command"))
    args = parser.parse_args(["extension", "pair", "--origin", ORIGIN])
    seen = {}

    def fake_request(origin, *, api_base=None):
        seen.update(origin=origin, api_base=api_base)
        return {"pairing_code": "ABCDEF-23456789", "expires_in_seconds": 120}

    monkeypatch.setattr(extension_pairing, "request_pairing_code", fake_request)
    assert args.func(args) == 0
    output = capsys.readouterr()
    assert output.out.strip() == "ABCDEF-23456789"
    assert seen == {"origin": ORIGIN, "api_base": None}


def test_pairing_cli_refuses_remote_api_base():
    for api_base in ("https://example.com", "http://user:secret@127.0.0.1:8642"):
        with pytest.raises(extension_pairing.ExtensionPairingError):
            extension_pairing.request_pairing_code(
                ORIGIN, api_base=api_base, api_key="owner-key")
