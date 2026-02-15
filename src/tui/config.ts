import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { APP_DIR } from "../config.ts";
import type { Keymap } from "./state.ts";

interface TuiConfig {
  keymap?: Keymap;
}

export const CONFIG_PATH = join(APP_DIR, "config.json");

export function loadConfig(): TuiConfig {
  try {
    const text = Deno.readTextFileSync(CONFIG_PATH);
    return JSON.parse(text) as TuiConfig;
  } catch {
    return {};
  }
}

export async function saveConfig(config: TuiConfig): Promise<void> {
  await ensureDir(APP_DIR);
  await Deno.writeTextFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}
