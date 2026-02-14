export async function openInPager(filePath: string): Promise<void> {
  const pager = Deno.env.get("PAGER") || "less";

  const cmd = new Deno.Command(pager, {
    args: [filePath],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const status = await cmd.output();
  if (!status.success) {
    // Fallback to less, then more
    if (pager !== "less") {
      try {
        const fallback = new Deno.Command("less", {
          args: [filePath],
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        });
        const s = await fallback.output();
        if (s.success) return;
      } catch {
        // less not found
      }
    }
    if (pager !== "more") {
      const fallback = new Deno.Command("more", {
        args: [filePath],
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      await fallback.output();
    }
  }
}
