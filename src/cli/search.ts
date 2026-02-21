import { ensureIndex } from "../data/index.ts";
import { search } from "../data/db.ts";
import { c, statusColor } from "./color.ts";

export async function searchCommand(query: string): Promise<void> {
  const db = await ensureIndex();
  const { results, total } = search(db, query);

  if (results.length === 0) {
    console.log(c.dim("No results found."));
    return;
  }

  let cols = 80;
  try {
    cols = Deno.consoleSize().columns;
  } catch { /* not a tty */ }

  const numWidth = 9;
  const yearWidth = 6;
  const statusWidth = 14;
  const gapWidth = 4;

  for (const r of results) {
    const num = c.boldCyan(`RFC ${r.number}`);
    const numPad = `RFC ${r.number}`.length;

    const year = r.year ? c.gray(String(r.year)) : "    ";

    const colorFn = statusColor(r.status);
    const statusShort = shortStatus(r.status);
    const status = colorFn(statusShort);
    const statusPad = statusShort.length;

    const titleWidth = cols - numWidth - yearWidth - statusWidth - gapWidth;
    const title = r.obsoletedBy.length > 0
      ? c.strikethrough(c.dim(truncate(r.title, titleWidth - 20))) +
        c.dim(
          ` (obsoleted by ${r.obsoletedBy.map((n) => `RFC ${n}`).join(", ")})`,
        )
      : truncate(r.title, titleWidth);

    // Pad using invisible widths
    const numStr = num + " ".repeat(Math.max(0, numWidth - numPad));
    const statusStr = " ".repeat(Math.max(0, statusWidth - statusPad)) +
      status;
    const yearStr = " " + (r.year ? year : "    ");

    console.log(`${numStr} ${title.padEnd(titleWidth)}${statusStr}${yearStr}`);
  }

  const countMsg = total > results.length
    ? `${results.length} of ${total} results (showing top matches)`
    : `${total} result${total === 1 ? "" : "s"}`;
  console.log(c.dim(`\n${countMsg}`));
}

function shortStatus(status: string): string {
  switch (status) {
    case "INTERNET STANDARD":
      return "STANDARD";
    case "PROPOSED STANDARD":
      return "PROPOSED";
    case "BEST CURRENT PRACTICE":
      return "BCP";
    case "DRAFT STANDARD":
      return "DRAFT STD";
    case "INFORMATIONAL":
      return "INFO";
    case "EXPERIMENTAL":
      return "EXP";
    case "HISTORIC":
      return "HISTORIC";
    default:
      return status.slice(0, 12);
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "\u2026";
}
