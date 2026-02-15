import { ensureIndex } from "../data/index.ts";
import { getRfc } from "../data/db.ts";
import { c, statusColor } from "./color.ts";

export async function infoCommand(number: number): Promise<void> {
  const db = await ensureIndex();
  const meta = getRfc(db, number);

  if (!meta) {
    console.error(c.boldRed(`RFC ${number} not found in index.`));
    Deno.exit(1);
  }

  // Title header
  console.log(
    c.boldCyan(`RFC ${meta.number}`) + c.dim(": ") + c.boldWhite(meta.title),
  );
  console.log();

  // Metadata fields
  const label = (s: string) => c.gray(s.padEnd(14));

  console.log(`  ${label("Authors")}${meta.authors.join(", ") || "Unknown"}`);
  console.log(`  ${label("Date")}${meta.date.month} ${meta.date.year}`);

  const colorFn = statusColor(meta.status);
  console.log(`  ${label("Status")}${colorFn(meta.status)}`);
  console.log(`  ${label("Stream")}${meta.stream}`);

  if (meta.wg) console.log(`  ${label("WG")}${meta.wg}`);
  if (meta.area) console.log(`  ${label("Area")}${meta.area}`);
  console.log(`  ${label("Pages")}${meta.pageCount}`);

  if (meta.keywords.length) {
    console.log(`  ${label("Keywords")}${c.dim(meta.keywords.join(", "))}`);
  }

  // Relations
  if (meta.obsoletes.length) {
    console.log(
      `  ${label("Obsoletes")}${
        meta.obsoletes.map((n) => c.cyan(`RFC ${n}`)).join(", ")
      }`,
    );
  }
  if (meta.obsoletedBy.length) {
    console.log(
      `  ${label("Obsoleted by")}${
        meta.obsoletedBy.map((n) => c.boldRed(`RFC ${n}`)).join(", ")
      }`,
    );
  }
  if (meta.updates.length) {
    console.log(
      `  ${label("Updates")}${
        meta.updates.map((n) => c.cyan(`RFC ${n}`)).join(", ")
      }`,
    );
  }
  if (meta.updatedBy.length) {
    console.log(
      `  ${label("Updated by")}${
        meta.updatedBy.map((n) => c.cyan(`RFC ${n}`)).join(", ")
      }`,
    );
  }

  // Abstract
  if (meta.abstract) {
    console.log();
    console.log(`  ${c.dim(meta.abstract)}`);
  }

  // Links
  if (meta.doi || meta.errata) {
    console.log();
    if (meta.doi) {
      console.log(
        `  ${label("DOI")}${c.underline(`https://doi.org/${meta.doi}`)}`,
      );
    }
    if (meta.errata) {
      console.log(`  ${label("Errata")}${c.underline(meta.errata)}`);
    }
  }
}
