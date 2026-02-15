// CLI color utilities — respects $NO_COLOR, --no-color, --color=false, and tty detection

let _enabled: boolean | null = null;

export function setColorEnabled(enabled: boolean): void {
  _enabled = enabled;
}

function isColorEnabled(): boolean {
  if (_enabled !== null) return _enabled;
  // $NO_COLOR spec: https://no-color.org/
  if (Deno.env.get("NO_COLOR") !== undefined) return false;
  // Only use color if stdout is a tty
  try {
    return Deno.stdout.isTerminal();
  } catch {
    return false;
  }
}

function wrap(code: string, reset: string): (s: string) => string {
  return (s: string) => isColorEnabled() ? `${code}${s}${reset}` : s;
}

const RST = "\x1b[0m";

export const c = {
  bold: wrap("\x1b[1m", RST),
  dim: wrap("\x1b[2m", RST),
  italic: wrap("\x1b[3m", RST),
  underline: wrap("\x1b[4m", RST),
  strikethrough: wrap("\x1b[9m", RST),

  red: wrap("\x1b[31m", RST),
  green: wrap("\x1b[32m", RST),
  yellow: wrap("\x1b[33m", RST),
  blue: wrap("\x1b[34m", RST),
  magenta: wrap("\x1b[35m", RST),
  cyan: wrap("\x1b[36m", RST),
  white: wrap("\x1b[37m", RST),
  gray: wrap("\x1b[90m", RST),

  // Combined
  boldCyan: wrap("\x1b[1;36m", RST),
  boldWhite: wrap("\x1b[1;37m", RST),
  boldYellow: wrap("\x1b[1;33m", RST),
  boldGreen: wrap("\x1b[1;32m", RST),
  boldRed: wrap("\x1b[1;31m", RST),
  dimWhite: wrap("\x1b[2;37m", RST),
};

export function statusColor(status: string): (s: string) => string {
  switch (status) {
    case "INTERNET STANDARD":
      return c.green;
    case "PROPOSED STANDARD":
      return c.blue;
    case "BEST CURRENT PRACTICE":
      return c.magenta;
    case "DRAFT STANDARD":
      return c.cyan;
    case "INFORMATIONAL":
      return c.yellow;
    case "EXPERIMENTAL":
      return c.red;
    case "HISTORIC":
      return c.gray;
    default:
      return c.gray;
  }
}
