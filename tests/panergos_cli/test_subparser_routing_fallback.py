"""Tests for the defensive subparser routing workaround (bpo-9338).

The main() function in panergos_cli/main.py sets subparsers.required=True
when argv contains a known subcommand name.  This forces deterministic
routing on Python versions where argparse fails to match subcommand tokens
when the parent parser has nargs='?' optional arguments (--continue).

If the subcommand token is consumed as a flag value (e.g. `panergos -c model`
to resume a session named 'model'), the required=True parse raises
SystemExit and the code falls back to the default required=False behaviour.
"""
import argparse
import io
import sys

import pytest

from panergos_cli.main import _parse_cli_args



def _build_parser():
    """Build a minimal replica of the panergos top-level parser."""
    parser = argparse.ArgumentParser(prog="panergos")
    parser.add_argument("--version", "-V", action="store_true")
    parser.add_argument("--resume", "-r", metavar="SESSION", default=None)
    parser.add_argument(
        "--continue", "-c",
        dest="continue_last",
        nargs="?",
        const=True,
        default=None,
        metavar="SESSION_NAME",
    )
    parser.add_argument("--worktree", "-w", action="store_true", default=False)
    parser.add_argument("--skills", "-s", action="append", default=None)
    parser.add_argument("--yolo", action="store_true", default=False)
    parser.add_argument("--pass-session-id", action="store_true", default=False)

    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    chat_p = subparsers.add_parser("chat")
    chat_p.add_argument("-q", "--query", default=None)
    subparsers.add_parser("model")
    subparsers.add_parser("gateway")
    subparsers.add_parser("setup")
    return parser, subparsers


def _safe_parse(parser, subparsers, argv):
    """Replica of the defensive parsing logic from main()."""
    known_cmds = set(subparsers.choices.keys()) if hasattr(subparsers, "choices") else set()
    has_cmd_token = any(t in known_cmds for t in argv if not t.startswith("-"))

    if has_cmd_token:
        subparsers.required = True
        saved_stderr = sys.stderr
        try:
            sys.stderr = io.StringIO()
            args = parser.parse_args(argv)
            sys.stderr = saved_stderr
            return args
        except SystemExit:
            sys.stderr = saved_stderr
            subparsers.required = False
            return parser.parse_args(argv)
    else:
        subparsers.required = False
        return parser.parse_args(argv)


def test_top_level_command_is_case_insensitive_without_lowercasing_option_values():
    parser, subparsers = _build_parser()
    parser.add_argument("--model")
    subparsers.add_parser("desktop")

    args = _parse_cli_args(
        parser,
        subparsers,
        ["--model", "Desktop", "DeSkToP"],
    )

    assert args.command == "desktop"
    assert args.model == "Desktop"


def test_close_unknown_command_gets_concise_suggestion(capsys):
    parser, subparsers = _build_parser()
    subparsers.add_parser("browser")

    with pytest.raises(SystemExit) as exc:
        _parse_cli_args(parser, subparsers, ["broswer"])

    assert exc.value.code == 2
    assert capsys.readouterr().err == (
        "panergos: error: unknown command 'broswer'. Did you mean 'browser'? "
        "To open the web UI, run 'panergos dashboard'.\n"
    )


def test_distant_unknown_command_is_not_silently_mapped(capsys):
    parser, subparsers = _build_parser()
    subparsers.add_parser("browser")

    with pytest.raises(SystemExit) as exc:
        _parse_cli_args(parser, subparsers, ["unrelated"])

    assert exc.value.code == 2
    stderr = capsys.readouterr().err
    assert "invalid choice: 'unrelated'" in stderr
    assert "Did you mean" not in stderr
