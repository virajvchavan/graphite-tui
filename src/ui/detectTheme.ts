import type { ThemeMode } from "./theme.js";

/** Parse an explicit override from CLI flags or the GRAPHITE_TUI_THEME env var.
 * Returns null when the user hasn't forced a mode. */
function overrideMode(argv: string[]): ThemeMode | null {
  if (argv.includes("--light")) return "light";
  if (argv.includes("--dark")) return "dark";
  const env = process.env.GRAPHITE_TUI_THEME?.trim().toLowerCase();
  if (env === "light" || env === "dark") return env;
  return null;
}

/** Relative luminance of an 8-bit-ish RGB triple in [0,1] per channel.
 * > 0.5 reads as a light background. */
export function isLightLuminance(r: number, g: number, b: number): boolean {
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.5;
}

/** Parse a terminal OSC 11 reply such as
 * `\x1b]11;rgb:ffff/ffff/ffff\x07` (or `…\x1b\\`) into a light/dark decision.
 * Channels may be 1–4 hex digits; each is normalized to [0,1]. Returns null
 * when the string isn't a recognizable color reply. */
export function parseOsc11(reply: string): ThemeMode | null {
  const m = /rgba?:([0-9a-f]+)\/([0-9a-f]+)\/([0-9a-f]+)/i.exec(reply);
  if (!m) return null;
  const norm = (hex: string) => parseInt(hex, 16) / (16 ** hex.length - 1);
  return isLightLuminance(norm(m[1]), norm(m[2]), norm(m[3])) ? "light" : "dark";
}

/** Read the COLORFGBG env var (set by rxvt/Konsole/some others). Its last
 * field is the background color index; 7 and 9–15 are light. */
function colorfgbgMode(): ThemeMode | null {
  const v = process.env.COLORFGBG;
  if (!v) return null;
  const parts = v.split(";");
  const bg = parseInt(parts[parts.length - 1], 10);
  if (Number.isNaN(bg)) return null;
  return bg === 7 || bg >= 9 ? "light" : "dark";
}

/** Query the terminal's background color via OSC 11 and resolve light/dark.
 * Resolves null on timeout or any failure so the caller can fall back. */
function queryOsc11(timeoutMs: number): Promise<ThemeMode | null> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
      resolve(null);
      return;
    }

    const wasRaw = stdin.isRaw;
    let settled = false;
    let buf = "";

    const cleanup = () => {
      clearTimeout(timer);
      stdin.removeListener("data", onData);
      try {
        stdin.setRawMode(wasRaw);
      } catch {
        // ignore — restoring raw mode is best-effort
      }
      if (!wasRaw) stdin.pause();
    };
    const finish = (mode: ThemeMode | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(mode);
    };

    const onData = (chunk: Buffer) => {
      buf += chunk.toString("latin1");
      // Reply ends with BEL or ST (ESC \). Wait until we have a terminator.
      if (buf.includes("\x07") || buf.includes("\x1b\\")) {
        finish(parseOsc11(buf));
      }
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    try {
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on("data", onData);
      // OSC 11: query background color.
      stdout.write("\x1b]11;?\x07");
    } catch {
      finish(null);
    }
  });
}

/**
 * Decide which color palette to use. Order of precedence:
 *   1. Explicit override — `--light`/`--dark` flag or `GRAPHITE_TUI_THEME`.
 *   2. OSC 11 background query against the terminal (with a short timeout).
 *   3. `COLORFGBG` env var, if present.
 *   4. Default to "dark" (preserves the app's original behavior).
 */
export async function detectTheme(
  argv: string[] = process.argv.slice(2),
  timeoutMs = 120
): Promise<ThemeMode> {
  const override = overrideMode(argv);
  if (override) return override;

  const queried = await queryOsc11(timeoutMs);
  if (queried) return queried;

  return colorfgbgMode() ?? "dark";
}
