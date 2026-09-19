import { describe, expect, it } from "vitest";
import { applyPtyFilters, PtyResumeSanitizer } from "./pty-resume-sanitizer";

/**
 * Fixture note — why most cases use CRLF, not LF.
 *
 * `panergos_cli/pty_bridge.py` spawns the agent through
 * `ptyprocess.PtyProcess.spawn()` and never puts the PTY into raw mode, so the
 * line discipline runs with ONLCR: every LF the child writes reaches the
 * master (and therefore xterm) as CRLF. Verified against a real PTY:
 *
 *   child writes b"A" + b"\n"*5 + b"B"  ->  master reads b"A\r\n\r\n\r\n\r\n\r\nB"
 *
 * Tests that assert burst collapsing therefore use `\r\n`; an LF-only fixture
 * would pass while the production path did nothing.
 */
const CRLF = "\r\n";

/** Split a string into fixed-size frames, mimicking chunked `os.read` output. */
function frames(s: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

/** Feed every frame through a sanitizer and concatenate output + flush. */
function drain(sanitizer: PtyResumeSanitizer, chunks: string[]): string {
  return chunks.map((c) => sanitizer.next(c)).join("") + sanitizer.flush();
}

describe("applyPtyFilters", () => {
  it("passes through normal text unchanged", () => {
    const input = "hello world\r\nfoo bar\r\n";
    expect(applyPtyFilters(input)).toBe(input);
  });

  it("collapses pathological CRLF bursts (real PTY output)", () => {
    const burst = "a" + CRLF.repeat(1000) + "b";
    expect(applyPtyFilters(burst)).toBe("a\r\n\r\nb");
  });

  it("collapses pathological LF-only bursts (raw-mode PTY)", () => {
    const burst = "a" + "\n".repeat(100) + "b";
    expect(applyPtyFilters(burst)).toBe("a\r\n\r\nb");
  });

  it("leaves short blank-line runs untouched", () => {
    const short = `a${CRLF}${CRLF}${CRLF}b`;
    expect(applyPtyFilters(short)).toBe(short);
  });

  it("preserves ANSI erase controls needed for redraws", () => {
    const redraw = "old text and stale tail\r\x1b[Knew text\x1b[12X";
    expect(applyPtyFilters(redraw)).toBe(redraw);
  });

  it("leaves normal SGR sequences untouched", () => {
    const input = "\x1b[31mred text\x1b[0m\r\n";
    expect(applyPtyFilters(input)).toBe(input);
  });

  it("handles empty string", () => {
    expect(applyPtyFilters("")).toBe("");
  });

});

describe("PtyResumeSanitizer — stateful frame handling", () => {
  it("processes a complete chunk in one frame", () => {
    const s = new PtyResumeSanitizer();
    // The trailing newline run is held back in case it continues next frame.
    expect(s.next("hello\r\n")).toBe("hello");
    expect(s.flush()).toBe("\r\n");
  });

  it("buffers a trailing partial escape and restores it in the next frame", () => {
    const s = new PtyResumeSanitizer();
    expect(s.next("hello\x1b[")).toBe("hello");
    expect(s.next("2K world\r\n")).toBe("\x1b[2K world");
    expect(s.flush()).toBe("\r\n");
  });

  it("buffers bare \\x1b and resolves on completion", () => {
    const s = new PtyResumeSanitizer();
    expect(s.next("before\x1b")).toBe("before");
    expect(s.next("[Kafter")).toBe("\x1b[Kafter");
  });

  it("buffers \\x1b[\\d+ prefix and resolves", () => {
    const s = new PtyResumeSanitizer();
    expect(s.next("x\x1b[4")).toBe("x");
    expect(s.next("2Ky")).toBe("\x1b[42Ky");
  });

  it("passes through when no partial escape is buffered", () => {
    const s = new PtyResumeSanitizer();
    expect(s.next("chunk1 ")).toBe("chunk1 ");
    expect(s.next("chunk2 ")).toBe("chunk2 ");
  });

  it("drops a buffered partial escape on flush", () => {
    // An unterminated CSI must never reach xterm: it would leave the parser
    // in an "in-escape" state and swallow output after reconnect.
    const s = new PtyResumeSanitizer();
    s.next("trailing\x1b[");
    expect(s.flush()).toBe("");
  });

  it("resets state across instances", () => {
    const a = new PtyResumeSanitizer();
    a.next("\x1b[");
    const b = new PtyResumeSanitizer();
    // "[K" without an ESC prefix is literal text, not a CSI code.
    expect(b.next("[Khello")).toBe("[Khello");
    expect(a.flush()).toBe("");
  });

  it("handles empty chunk without disturbing pending buffer", () => {
    const s = new PtyResumeSanitizer();
    s.next("before\x1b[");
    expect(s.next("")).toBe("");
    expect(s.next("2Kafter")).toBe("\x1b[2Kafter");
  });

  it("handles consecutive split escapes across three frames", () => {
    const s = new PtyResumeSanitizer();
    expect(s.next("a\x1b")).toBe("a");
    expect(s.next("[")).toBe("");
    expect(s.next("2Kb")).toBe("\x1b[2Kb");
  });
});

describe("PtyResumeSanitizer — cross-frame blank-line bursts", () => {
  it("collapses a burst contained in a single frame", () => {
    const s = new PtyResumeSanitizer();
    expect(drain(s, ["start" + CRLF.repeat(60) + "end"])).toBe(
      "start\r\n\r\nend",
    );
  });

  it("collapses a burst split across 64KiB-scale frames", () => {
    // bridge.read() does os.read(fd, 65536); a 3000-row burst spans frames.
    const burst = "START" + CRLF.repeat(3000) + "END";
    const s = new PtyResumeSanitizer();
    const out = drain(s, frames(burst, 4096));
    expect(out).toBe("START\r\n\r\nEND");
  });

  it("collapses a burst delivered as many small partial reads", () => {
    const burst = "START" + CRLF.repeat(3000) + "END";
    const s = new PtyResumeSanitizer();
    const out = drain(s, frames(burst, 40));
    expect(out).toBe("START\r\n\r\nEND");
  });

  it("collapses sub-threshold fragments that sum past the threshold", () => {
    // 49 + 49 rows individually duck the 50 threshold but total 98 blank rows.
    const s = new PtyResumeSanitizer();
    const out = drain(s, [CRLF.repeat(49), CRLF.repeat(49)]);
    expect(out).toBe("\r\n\r\n");
  });

  it("does not merge blank runs separated by real content", () => {
    const s = new PtyResumeSanitizer();
    const out = drain(s, [CRLF.repeat(40), "text", CRLF.repeat(40)]);
    expect(out).toBe(`${CRLF.repeat(40)}text${CRLF.repeat(40)}`);
  });

  it("emits a buffered trailing newline run on flush", () => {
    const s = new PtyResumeSanitizer();
    expect(s.next("done" + CRLF)).toBe("done");
    expect(s.flush()).toBe(CRLF);
  });
});

describe("PtyResumeSanitizer — ANSI redraw preservation", () => {
  it("preserves a redraw split across frames", () => {
    const s = new PtyResumeSanitizer();
    const spinner = "Loading 10%\r\x1b[KLoading 20%\r\x1b[KDone";
    expect(drain(s, [spinner.slice(0, 14), spinner.slice(14)])).toBe(spinner);
  });
});
