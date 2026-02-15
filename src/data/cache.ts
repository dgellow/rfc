import { ensureDir } from "@std/fs";
import { APP_DIR, RFCS_DIR } from "../config.ts";

export async function ensureCacheDir(): Promise<void> {
  await ensureDir(APP_DIR);
  await ensureDir(RFCS_DIR);
}

export function rfcFilePath(number: number): string {
  const padded = String(number).padStart(4, "0");
  return `${RFCS_DIR}/rfc${padded}.txt`;
}

export async function isRfcCached(number: number): Promise<boolean> {
  try {
    await Deno.stat(rfcFilePath(number));
    return true;
  } catch {
    return false;
  }
}
