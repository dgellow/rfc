import { RFC_BASE_URL } from "../config.ts";
import { rfcFilePath } from "./cache.ts";
import { getDb, getRfcBody, updateRfcBody } from "./db.ts";

export async function fetchRfc(number: number): Promise<string> {
  const db = await getDb();

  // Check db first
  const cached = getRfcBody(db, number);
  if (cached) return cached;

  // Check filesystem (might exist from rsync but not yet indexed)
  const filePath = rfcFilePath(number);
  try {
    const text = await Deno.readTextFile(filePath);
    updateRfcBody(db, number, text);
    return text;
  } catch {
    // Not on disk, fetch from network
  }

  const padded = String(number).padStart(4, "0");
  const url = `${RFC_BASE_URL}/rfc${padded}.txt`;

  console.error(`Fetching RFC ${number}...`);
  const resp = await fetch(url);

  if (!resp.ok) {
    if (resp.status === 404) {
      throw new Error(`RFC ${number} not found`);
    }
    throw new Error(`Failed to fetch RFC ${number}: ${resp.status}`);
  }

  const text = await resp.text();

  // Write to filesystem
  await Deno.writeTextFile(filePath, text);

  // Update database
  updateRfcBody(db, number, text);

  return text;
}

export async function fetchRfcToFile(number: number): Promise<string> {
  await fetchRfc(number);
  return rfcFilePath(number);
}
