import { ensureIndex } from "../data/index.ts";
import { getRfc } from "../data/db.ts";

export async function infoCommand(number: number): Promise<void> {
  const db = await ensureIndex();
  const meta = getRfc(db, number);

  if (!meta) {
    console.error(`RFC ${number} not found in index.`);
    Deno.exit(1);
  }

  console.log(`RFC ${meta.number}: ${meta.title}`);
  console.log();
  console.log(`  Authors:  ${meta.authors.join(", ") || "Unknown"}`);
  console.log(`  Date:     ${meta.date.month} ${meta.date.year}`);
  console.log(`  Status:   ${meta.status}`);
  console.log(`  Stream:   ${meta.stream}`);
  if (meta.wg) console.log(`  WG:       ${meta.wg}`);
  if (meta.area) console.log(`  Area:     ${meta.area}`);
  console.log(`  Pages:    ${meta.pageCount}`);

  if (meta.keywords.length) {
    console.log(`  Keywords: ${meta.keywords.join(", ")}`);
  }

  if (meta.obsoletes.length) {
    console.log(
      `  Obsoletes:   ${meta.obsoletes.map((n) => `RFC ${n}`).join(", ")}`,
    );
  }
  if (meta.obsoletedBy.length) {
    console.log(
      `  Obsoleted by: ${meta.obsoletedBy.map((n) => `RFC ${n}`).join(", ")}`,
    );
  }
  if (meta.updates.length) {
    console.log(
      `  Updates:     ${meta.updates.map((n) => `RFC ${n}`).join(", ")}`,
    );
  }
  if (meta.updatedBy.length) {
    console.log(
      `  Updated by:  ${meta.updatedBy.map((n) => `RFC ${n}`).join(", ")}`,
    );
  }

  if (meta.abstract) {
    console.log();
    console.log(`  ${meta.abstract}`);
  }

  if (meta.doi) {
    console.log();
    console.log(`  DOI: https://doi.org/${meta.doi}`);
  }
  if (meta.errata) {
    console.log(`  Errata: ${meta.errata}`);
  }
}
