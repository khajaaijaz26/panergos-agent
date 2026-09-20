"""Fast, original Panergos Relay startup trace for interactive terminals."""

from __future__ import annotations

import os
import sys
import time
from typing import Callable, Mapping, TextIO

BRAND = "PANERGOS"
RELAY_FRAMES = ("╲  ▶", "╲━ ▶", "╲━━▶", "╱━━▶", "╱━ ▶", "╱  ▶")
RELAY_RESOLVED = ("━━━╲", "━━━━▶  RELAY / READY", "━━━╱")
TICK_SECONDS = 0.045

_GLYPHS: dict[str, tuple[str, str, str]] = {
    "P": ("┌──┐", "├──┘", "│   "),
    "A": ("┌──┐", "├──┤", "│  │"),
    "N": ("│╲ │", "│ ╲│", "│  │"),
    "E": ("┌───", "├── ", "└───"),
    "R": ("┌──┐", "├─┬┘", "│ ╲ "),
    "G": ("┌──┐", "│ ─┤", "└──┘"),
    "O": ("┌──┐", "│  │", "└──┘"),
    "S": ("┌──┐", "└──┐", "└──┘"),
}


def wordmark_rows(revealed: int) -> tuple[str, str, str]:
    """Return the three-row thin-line wordmark with *revealed* letters."""
    letters = BRAND[: max(0, min(len(BRAND), int(revealed)))]
    return tuple(" ".join(_GLYPHS[letter][row] for letter in letters) for row in range(3))  # type: ignore[return-value]


def intro_lines(revealed: int, signal_index: int = -1, *, columns: int = 80) -> tuple[str, ...]:
    """Pure six-line frame; terminals below 40 columns use a single-line brand."""
    brand_lines = wordmark_rows(revealed) if columns >= 40 else (BRAND[:revealed], "", "")
    if signal_index < 0:
        signal_lines = ("", "", "")
    elif signal_index >= len(RELAY_FRAMES):
        signal_lines = RELAY_RESOLVED
    else:
        signal_lines = ("", RELAY_FRAMES[signal_index], "")
    return (*brand_lines, *signal_lines)


def should_play_relay_intro(
    *,
    stdin: TextIO = sys.stdin,
    stdout: TextIO = sys.stdout,
    env: Mapping[str, str] = os.environ,
    automated: bool = False,
    resumed: bool = False,
) -> bool:
    """Only animate a manual interactive launch."""
    ci = str(env.get("CI", "")).strip().lower() in {"1", "true", "yes", "on"}
    try:
        tty = stdin.isatty() and stdout.isatty()
    except (AttributeError, OSError, ValueError):
        tty = False
    return bool(tty and not ci and not automated)


def _ansi(hex_color: str, enabled: bool) -> str:
    value = hex_color.lstrip("#")
    if not enabled or len(value) != 6:
        return ""
    try:
        red, green, blue = (int(value[index : index + 2], 16) for index in (0, 2, 4))
    except ValueError:
        return ""
    return f"\033[38;2;{red};{green};{blue}m"


def play_relay_intro(
    *,
    stdout: TextIO = sys.stdout,
    columns: int = 80,
    colors: tuple[str, str, str] = ("#FF6B5E", "#F7C453", "#2EE6A6"),
    sleep_fn: Callable[[float], None] = time.sleep,
) -> None:
    """Trace the wordmark letter-by-letter, resolve Relay, and return in under one second."""
    color_enabled = "NO_COLOR" not in os.environ
    tones = tuple(_ansi(color, color_enabled) for color in colors)
    reset = "\033[0m" if any(tones) else ""
    first = True

    def paint(lines: tuple[str, ...]) -> None:
        nonlocal first
        if not first:
            stdout.write(f"\033[{len(lines)}A")
        for index, line in enumerate(lines):
            tone = tones[index % 3]
            stdout.write(f"\r\033[2K{tone}{line}{reset}\n")
        stdout.flush()
        first = False

    stdout.write("\033[?25l")
    try:
        for revealed in range(1, len(BRAND) + 1):
            paint(intro_lines(revealed, columns=columns))
            sleep_fn(TICK_SECONDS)
        for signal_index in range(len(RELAY_FRAMES)):
            paint(intro_lines(len(BRAND), signal_index, columns=columns))
            sleep_fn(TICK_SECONDS)
        paint(intro_lines(len(BRAND), len(RELAY_FRAMES), columns=columns))
        sleep_fn(0.1)
    except KeyboardInterrupt:
        paint(intro_lines(len(BRAND), len(RELAY_FRAMES), columns=columns))
    finally:
        stdout.write("\033[?25h")
        stdout.flush()
