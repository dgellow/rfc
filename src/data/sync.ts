import { RFCS_DIR, RSYNC_MODULE } from "../config.ts";
import { ensureCacheDir } from "./cache.ts";
import {
  getCachedRfcCount,
  getDb,
  getIndexRfcCount,
  updateRfcBody,
} from "./db.ts";
import { syncIndex } from "./index.ts";

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

  let fileCount = 0;
  const stopSpinner = startSpinner(() =>
    fileCount > 0 ? `Syncing RFCs (${fileCount} new)...` : "Syncing RFCs..."
  );

  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      for (const line of text.split("\n")) {
        if (line.match(/^rfc\d+\.txt$/)) fileCount++;
      }
    }
  } finally {
    reader.releaseLock();
  }

  stopSpinner();
  const output = await child.output();
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
    console.error(`${newCount} new RFCs, ${cachedAfter} total available.`);
  } else {
    console.error(`${cachedAfter} RFCs available, already up to date.`);
  }
}

export async function indexLocalFiles(): Promise<void> {
  const db = await getDb();

  let indexed = 0;
  const stopSpinner = startSpinner(() =>
    indexed > 0
      ? `Indexing local files (${indexed})...`
      : "Indexing local files..."
  );

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
  }

  stopSpinner();
}

const SPINNER_FRAMES = [
  "\u280B",
  "\u2819",
  "\u2838",
  "\u2834",
  "\u2826",
  "\u2827",
];

function writeSpinnerFrame(msg: string): void {
  const encoder = new TextEncoder();
  try {
    if (Deno.stderr.isTerminal()) {
      Deno.stderr.writeSync(encoder.encode(`\r\x1b[K${msg}`));
    }
  } catch {
    // not a terminal
  }
}

export function startSpinner(getMessage: () => string): () => void {
  let frame = 0;
  const interval = setInterval(() => {
    const spinner = SPINNER_FRAMES[frame++ % SPINNER_FRAMES.length];
    writeSpinnerFrame(`${getMessage()} ${spinner}`);
  }, 80);
  return () => {
    clearInterval(interval);
    writeSpinnerFrame("");
    console.error(`${getMessage()} Done.`);
  };
}
