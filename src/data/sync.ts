import { RFCS_DIR, RSYNC_MODULE } from "../config.ts";
import { ensureCacheDir } from "./cache.ts";
import {
  getCachedRfcCount,
  getDb,
  getIndexRfcCount,
  updateRfcBody,
} from "./db.ts";
import { syncIndex } from "./index.ts";
import { c } from "../cli/color.ts";

export async function syncAll(): Promise<void> {
  await ensureCacheDir();

  // Ensure index is up to date first
  const db = await getDb();
  if (getIndexRfcCount(db) === 0) {
    await syncIndex(db);
  }

  const cachedBefore = getCachedRfcCount(db);

  const cmd = new Deno.Command("rsync", {
    args: ["-av", RSYNC_MODULE, RFCS_DIR + "/"],
    stdout: "piped",
    stderr: "piped",
  });

  const child = cmd.spawn();

  // Stream stdout, count transferred files and show progress
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let fileCount = 0;
  const frames = ["\u280B", "\u2819", "\u2838", "\u2834", "\u2826", "\u2827"];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.match(/^rfc\d+\.txt$/)) fileCount++;
      }
      const frame = frames[fileCount % frames.length];
      const msg = fileCount > 0
        ? `${frame} Syncing RFCs... ${fileCount} new files`
        : `${frame} Syncing RFCs...`;
      writeProgress(msg);
    }
  } finally {
    reader.releaseLock();
  }

  const output = await child.output();
  clearProgress();
  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    throw new Error(
      `rsync failed: ${stderr.trim() || `exit code ${output.code}`}`,
    );
  }

  // Index new files into database
  await indexLocalFiles();

  const cachedAfter = getCachedRfcCount(db);
  const newCount = cachedAfter - cachedBefore;

  if (newCount > 0) {
    console.error(
      c.green(`Done.`) + ` ${newCount} new RFCs, ${cachedAfter} total cached.`,
    );
  } else {
    console.error(
      c.green(`Done.`) + ` ${cachedAfter} RFCs cached, already up to date.`,
    );
  }
}

export async function indexLocalFiles(): Promise<void> {
  const db = await getDb();

  let total = 0;
  let indexed = 0;
  for await (const entry of Deno.readDir(RFCS_DIR)) {
    if (!entry.isFile) continue;
    const match = entry.name.match(/^rfc(\d+)\.txt$/);
    if (!match) continue;

    total++;
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
      writeProgress(`Indexing local files... ${indexed}`);
    }
  }

  if (indexed > 0) {
    clearProgress();
    console.error(`Indexed ${c.boldCyan(String(indexed))} local files.`);
  }
}

function writeProgress(msg: string): void {
  const encoder = new TextEncoder();
  try {
    if (Deno.stderr.isTerminal()) {
      Deno.stderr.writeSync(encoder.encode(`\r\x1b[K${msg}`));
    }
  } catch {
    // not a terminal
  }
}

function clearProgress(): void {
  writeProgress("");
}
