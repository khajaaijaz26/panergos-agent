"""``panergos extension`` subcommands."""

from __future__ import annotations

import sys


def build_extension_parser(subparsers) -> None:
    extension_parser = subparsers.add_parser(
        "extension", help="Pair and manage the local Panergos browser extension")
    actions = extension_parser.add_subparsers(dest="extension_action")
    pair = actions.add_parser(
        "pair", help="Create a short-lived pairing code for one extension origin")
    pair.add_argument(
        "--origin", help="Exact chrome-extension:// origin")
    pair.add_argument(
        "--api-base", help="Loopback API base (default: http://127.0.0.1:8642)")

    def _dispatch(args):  # noqa: ANN001
        if getattr(args, "extension_action", None) != "pair":
            extension_parser.print_help()
            return 2
        origin = str(getattr(args, "origin", None) or "").strip()
        if not origin:
            try:
                origin = input("Extension origin: ").strip()
            except (EOFError, KeyboardInterrupt):
                print("Pairing cancelled.", file=sys.stderr)
                return 1
        from panergos_cli.extension_pairing import ExtensionPairingError, request_pairing_code
        try:
            result = request_pairing_code(origin, api_base=getattr(args, "api_base", None))
        except ExtensionPairingError as exc:
            print(f"Pairing failed: {exc}", file=sys.stderr)
            return 1
        print(result["pairing_code"])
        print(
            f"Expires in {result.get('expires_in_seconds', 120)} seconds; "
            f"paste this code into the extension for {origin}.",
            file=sys.stderr,
        )
        return 0

    extension_parser.set_defaults(func=_dispatch)
