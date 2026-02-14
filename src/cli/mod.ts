import { readCommand } from "./read.ts";
import { searchCommand } from "./search.ts";
import { infoCommand } from "./info.ts";
import { syncIndex } from "../data/index.ts";
import { syncAll } from "../data/sync.ts";
import { listCachedRfcs } from "../data/db.ts";
import { fetchRfcToFile } from "../data/fetch.ts";
import { ensureIndex } from "../data/index.ts";

const HELP = `rfc — Read, search, and navigate IETF RFCs

Usage:
  rfc                      Open interactive TUI
  rfc <number>             Read an RFC in $PAGER
  rfc search <query>       Search RFCs (title, keywords, content)
  rfc info <number>        Show RFC metadata
  rfc sync                 Download all RFCs via rsync
  rfc sync --index         Only refresh the metadata index
  rfc list                 List locally cached RFCs
  rfc path <number>        Print local file path for an RFC

Search query syntax:
  rfc search HTTP/2                Free text search
  rfc search author:fielding       Search by author
  rfc search status:standard       Search by status
  rfc search wg:httpbis            Search by working group
  rfc search year:2022             Search by year
  rfc search author:fielding HTTP  Combined filters

Options:
  --help, -h    Show this help
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
        console.error("Usage: rfc search <query>");
        Deno.exit(1);
      }
      await searchCommand(query);
      return true;
    }

    case "info": {
      const n = parseInt(args[1]);
      if (isNaN(n)) {
        console.error("Usage: rfc info <number>");
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
          "No RFCs cached locally. Use 'rfc <number>' to fetch one, or 'rfc sync' to download all.",
        );
        return true;
      }
      for (const meta of rfcs) {
        console.log(`RFC ${String(meta.number).padEnd(5)} ${meta.title}`);
      }
      return true;
    }

    case "path": {
      const n = parseInt(args[1]);
      if (isNaN(n)) {
        console.error("Usage: rfc path <number>");
        Deno.exit(1);
      }
      await ensureIndex();
      const path = await fetchRfcToFile(n);
      console.log(path);
      return true;
    }

    default:
      console.error(`Unknown command: ${first}`);
      console.error("Run 'rfc --help' for usage.");
      Deno.exit(1);
  }
}
