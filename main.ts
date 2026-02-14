import { runCli } from "./src/cli/mod.ts";
import { closeDb } from "./src/data/db.ts";

try {
  const handled = await runCli(Deno.args);
  if (!handled) {
    // TUI mode
    const { runTui } = await import("./src/tui/mod.ts");
    await runTui();
  }
} finally {
  closeDb();
}
