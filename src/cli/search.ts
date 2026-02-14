import { ensureIndex } from "../data/index.ts";
import { search } from "../data/db.ts";

export async function searchCommand(query: string): Promise<void> {
  const db = await ensureIndex();
  const results = search(db, query);

  if (results.length === 0) {
    console.log("No results found.");
    return;
  }

  // Column widths
  const numWidth = 8;
  const yearWidth = 6;
  const statusWidth = 16;

  for (const { meta } of results) {
    const num = `RFC ${meta.number}`.padEnd(numWidth);
    const year = meta.date.year ? String(meta.date.year).padStart(4) : "    ";
    const status = truncate(meta.status, statusWidth).padEnd(statusWidth);
    let cols = 80;
    try {
      cols = Deno.consoleSize().columns;
    } catch { /* not a tty */ }
    const titleWidth = cols - numWidth - yearWidth - statusWidth - 4;
    const title = truncate(
      formatTitle(meta.title, meta.obsoletedBy),
      titleWidth,
    );

    console.log(`${num} ${title.padEnd(titleWidth)} ${status} ${year}`);
  }
}

function formatTitle(title: string, obsoletedBy: number[]): string {
  if (obsoletedBy.length > 0) {
    return `${title} (obsoleted by ${obsoletedBy.join(", ")})`;
  }
  return title;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
