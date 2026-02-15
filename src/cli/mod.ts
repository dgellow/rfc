import { readCommand } from "./read.ts";
import { searchCommand } from "./search.ts";
import { infoCommand } from "./info.ts";
import { syncIndex } from "../data/index.ts";
import { syncAll } from "../data/sync.ts";
import { listCachedRfcs } from "../data/db.ts";
import { fetchRfcToFile } from "../data/fetch.ts";
import { ensureIndex } from "../data/index.ts";
import { c } from "./color.ts";
import denoConfig from "../../deno.json" with { type: "json" };

const HELP = `${c.boldCyan("rfc")} ${
  c.dim("—")
} Read, search, and navigate IETF RFCs

${c.boldWhite("Usage:")}
  ${c.cyan("rfc")}                      Open interactive TUI
  ${c.cyan("rfc")} <number>             Read an RFC in $PAGER
  ${c.cyan("rfc search")} <query>       Search RFCs
  ${c.cyan("rfc info")} <number>        Show RFC metadata
  ${c.cyan("rfc sync")}                 Download all RFCs via rsync
  ${c.cyan("rfc sync --index")}         Only refresh the metadata index
  ${c.cyan("rfc list")}                 List locally cached RFCs
  ${c.cyan("rfc path")} <number>        Print local file path for an RFC

${c.boldWhite("Search syntax:")}
  rfc search HTTP/2                ${c.dim("Free text search")}
  rfc search author:fielding       ${c.dim("Search by author")}
  rfc search status:standard       ${c.dim("Search by status")}
  rfc search wg:httpbis            ${c.dim("Search by working group")}
  rfc search year:2022             ${c.dim("Search by year")}
  rfc search author:fielding HTTP  ${c.dim("Combined filters")}

${c.boldWhite("Options:")}
  --help, -h       Show this help
  --version, -V    Show version
  --no-color       Disable colored output
`;

export async function runCli(args: string[]): Promise<boolean> {
  if (args.length === 0) {
    return false; // Signal to open TUI
  }

  const first = args[0];

  if (first === "--help" || first === "-h") {
    console.log(HELP);
    return true;
  }

  if (first === "--version" || first === "-V") {
    console.log(`rfc ${denoConfig.version}`);
    return true;
  }

  // rfc <number>
  const num = parseInt(first);
  if (!isNaN(num) && String(num) === first) {
    await readCommand(num);
    return true;
  }

  switch (first) {
    case "search": {
      const query = args.slice(1).join(" ");
      if (!query) {
        console.error(c.boldRed("Usage:") + " rfc search <query>");
        Deno.exit(1);
      }
      await searchCommand(query);
      return true;
    }

    case "info": {
      const n = parseInt(args[1]);
      if (isNaN(n)) {
        console.error(c.boldRed("Usage:") + " rfc info <number>");
        Deno.exit(1);
      }
      await infoCommand(n);
      return true;
    }

    case "sync": {
      if (args[1] === "--index") {
        await syncIndex();
      } else {
        await syncAll();
      }
      return true;
    }

    case "list": {
      const db = await ensureIndex();
      const rfcs = listCachedRfcs(db);
      if (rfcs.length === 0) {
        console.log(
          c.dim("No RFCs cached locally.") +
            " Use " +
            c.cyan("rfc <number>") +
            " to fetch one, or " +
            c.cyan("rfc sync") +
            " to download all.",
        );
        return true;
      }
      for (const meta of rfcs) {
        console.log(
          c.boldCyan(`RFC ${String(meta.number).padEnd(5)}`) +
            ` ${meta.title}`,
        );
      }
      console.log(c.dim(`\n${rfcs.length} cached`));
      return true;
    }

    case "path": {
      const n = parseInt(args[1]);
      if (isNaN(n)) {
        console.error(c.boldRed("Usage:") + " rfc path <number>");
        Deno.exit(1);
      }
      await ensureIndex();
      const path = await fetchRfcToFile(n);
      console.log(path);
      return true;
    }

    default:
      console.error(c.boldRed(`Unknown command: ${first}`));
      console.error("Run " + c.cyan("rfc --help") + " for usage.");
      Deno.exit(1);
  }
}
