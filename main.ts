import { runCli } from "./src/cli/mod.ts";
import { closeDb } from "./src/data/db.ts";
import { setColorEnabled } from "./src/cli/color.ts";

// Handle flags before anything else
const args = Deno.args.filter((arg) => {
  if (arg === "--no-color" || arg === "--color=false") {
    setColorEnabled(false);
    return false;
  }
  return true;
});

try {
  const handled = await runCli(args);
  if (!handled) {
    // TUI mode
    const { runTui } = await import("./src/tui/mod.ts");
    await runTui();
  }
} finally {
  closeDb();
}
