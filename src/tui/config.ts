import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import type { Keymap } from "./state.ts";

interface TuiConfig {
  keymap?: Keymap;
}

function getConfigDir(): string {
  const xdg = Deno.env.get("XDG_CONFIG_HOME");
  if (xdg) return join(xdg, "rfc");

  const home = Deno.env.get("HOME");
  if (!home) throw new Error("Cannot determine home directory");

  if (Deno.build.os === "darwin") {
    return join(home, "Library", "Application Support", "rfc");
  }
  return join(home, ".config", "rfc");
}

const CONFIG_DIR = getConfigDir();
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function loadConfig(): TuiConfig {
  try {
    const text = Deno.readTextFileSync(CONFIG_PATH);
    return JSON.parse(text) as TuiConfig;
  } catch {
    return {};
  }
}

export async function saveConfig(config: TuiConfig): Promise<void> {
  await ensureDir(CONFIG_DIR);
  await Deno.writeTextFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}
