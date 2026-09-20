from __future__ import annotations

import io

from panergos_cli.relay_intro import (
    BIG_WORDMARK,
    BRAND,
    RELAY_FRAMES,
    big_wordmark_rows,
    intro_lines,
    play_relay_intro,
    should_play_relay_intro,
    wordmark_rows,
)


class _TTY(io.StringIO):
    def isatty(self) -> bool:
        return True


def test_wordmark_reveals_one_letter_and_has_narrow_fallback():
    first = wordmark_rows(1)
    complete = wordmark_rows(len(BRAND))

    assert all(row for row in first)
    assert all(len(row) > len(first[index]) for index, row in enumerate(complete))
    assert intro_lines(3, columns=39)[:3] == ("PAN", "", "")
    assert intro_lines(len(BRAND), len(RELAY_FRAMES), columns=80)[-2].endswith("RELAY / READY")


def test_big_wordmark_reveals_whole_letters_at_full_terminal_width():
    first = big_wordmark_rows(1)
    complete = big_wordmark_rows(len(BRAND))

    assert len(first) == len(BIG_WORDMARK) == 6
    assert {len(row) for row in first} == {8}
    assert complete == BIG_WORDMARK
    assert intro_lines(len(BRAND), columns=80)[:6] == BIG_WORDMARK


def test_intro_gate_skips_automation_and_noninteractive_launches():
    tty = _TTY()

    assert should_play_relay_intro(stdin=tty, stdout=tty, env={})
    assert not should_play_relay_intro(stdin=tty, stdout=tty, env={"CI": "true"})
    assert should_play_relay_intro(stdin=tty, stdout=tty, env={"TERM": "dumb"})
    assert not should_play_relay_intro(stdin=tty, stdout=tty, env={}, automated=True)
    assert should_play_relay_intro(stdin=tty, stdout=tty, env={}, resumed=True)
    assert not should_play_relay_intro(stdin=io.StringIO(), stdout=tty, env={})


def test_intro_animates_without_blocking_the_caller_for_real_time():
    output = _TTY()
    delays: list[float] = []

    play_relay_intro(stdout=output, columns=80, rows=24, sleep_fn=delays.append)

    assert len(delays) == len(BRAND) + len(RELAY_FRAMES) + 1
    assert sum(delays) < 1
    assert output.getvalue().startswith("\033[?25l\033[2J\033[H\n\n")
    assert "RELAY / READY" in output.getvalue()
    assert output.getvalue().endswith("\033[?25h")
