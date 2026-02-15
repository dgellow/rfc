// Public API for programmatic use
export { ensureIndex } from "./src/data/index.ts";
export { search, getRfc, getRfcBody } from "./src/data/db.ts";
export type { SearchOptions, SearchResponse } from "./src/data/db.ts";
export { fetchRfc, fetchRfcToFile } from "./src/data/fetch.ts";
export type { RfcMeta, RfcStatus, RfcStream, SearchResult } from "./src/types.ts";
