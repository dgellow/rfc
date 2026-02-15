import { join } from "@std/path";

function getAppDir(): string {
  const xdg = Deno.env.get("XDG_CONFIG_HOME");
  if (xdg) return join(xdg, "rfc");

  const home = Deno.env.get("HOME");
  if (!home) throw new Error("Cannot determine home directory");
  return join(home, ".config", "rfc");
}

export const APP_DIR = getAppDir();
export const DB_PATH = join(APP_DIR, "rfc.db");
export const RFCS_DIR = join(APP_DIR, "rfcs");

export const RFC_INDEX_URL = "https://www.rfc-editor.org/rfc-index.xml";
export const RFC_BASE_URL = "https://www.rfc-editor.org/rfc";
export const RSYNC_MODULE = "rsync.rfc-editor.org::rfcs-text-only";

export const INDEX_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
