import { ensureIndex } from "../data/index.ts";
import { fetchRfcToFile } from "../data/fetch.ts";
import { openInPager } from "./pager.ts";

export async function readCommand(number: number): Promise<void> {
  await ensureIndex();
  const filePath = await fetchRfcToFile(number);
  await openInPager(filePath);
}
