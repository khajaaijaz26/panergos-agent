"""``panergos model`` subcommand parser."""

from __future__ import annotations

from typing import Callable


def build_model_parser(subparsers, *, cmd_model: Callable) -> None:
    """Attach the ``model`` subcommand to ``subparsers``."""
    model_parser = subparsers.add_parser(
        "model", help="Select default model and provider",
        description="Interactively select your inference provider and default model")
    model_parser.add_argument(
        "--refresh", action="store_true",
        help="Wipe the model picker disk cache and re-fetch every provider's live /v1/models list.")
    model_parser.add_argument(
        "--quick", action="store_true",
        help="Auto-detect a ready local model or connect one model provider with minimal setup")
    model_parser.add_argument(
        "--provider", dest="quick_provider", default="auto",
        choices=["auto", "local", "anthropic", "openai-compatible"],
        help="Route for --quick (default: prefer a detected local runtime)")
    model_parser.add_argument("--base-url", help="OpenAI-compatible API base URL for --quick")
    model_parser.add_argument("--model", help="Exact model ID for --quick")
    model_parser.add_argument(
        "--key-env",
        help="Environment variable containing the endpoint key; the secret is never put in shell history")
    model_parser.add_argument(
        "--yes", action="store_true",
        help="Use the deterministic detected/default model without prompting")
    model_parser.set_defaults(func=cmd_model)
