import { RFCS_DIR, RSYNC_MODULE } from "../config.ts";
import { ensureCacheDir } from "./cache.ts";
import { getDb, getIndexRfcCount, updateRfcBody } from "./db.ts";
import { syncIndex } from "./index.ts";

export async function syncAll(): Promise<void> {
  await ensureCacheDir();

  // Ensure index is up to date first
  const db = await getDb();
  if (getIndexRfcCount(db) === 0) {
    await syncIndex(db);
  }

  console.error(`Syncing RFCs via rsync to ${RFCS_DIR}...`);

  const cmd = new Deno.Command("rsync", {
    args: ["-avz", "--progress", RSYNC_MODULE, RFCS_DIR + "/"],
    stdout: "inherit",
    stderr: "inherit",
  });

  const status = await cmd.output();
  if (!status.success) {
    throw new Error(`rsync failed with exit code ${status.code}`);
  }

  // Index new files into database
  await indexLocalFiles();
}

export async function indexLocalFiles(): Promise<void> {
  const db = await getDb();

  console.error("Indexing local RFC files...");

  let indexed = 0;
  for await (const entry of Deno.readDir(RFCS_DIR)) {
    if (!entry.isFile) continue;
    const match = entry.name.match(/^rfc(\d+)\.txt$/);
    if (!match) continue;

    const number = parseInt(match[1]);

    // Skip if already indexed
    const row = db.prepare(
      "SELECT fetched_at FROM rfcs WHERE number = ?",
    ).get(number) as { fetched_at: string | null } | undefined;

    if (row?.fetched_at) continue;

    const filePath = `${RFCS_DIR}/${entry.name}`;
    const text = await Deno.readTextFile(filePath);
    updateRfcBody(db, number, text);
    indexed++;

    if (indexed % 500 === 0) {
      console.error(`  Indexed ${indexed} files...`);
    }
  }

  console.error(`Indexed ${indexed} new RFC files.`);
}
