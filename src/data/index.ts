import { parse } from "@libs/xml";
import { Database } from "@db/sqlite";
import { INDEX_MAX_AGE_MS, RFC_INDEX_URL } from "../config.ts";
import {
  getDb,
  getIndexRfcCount,
  getMeta,
  setMeta,
  upsertRelations,
  upsertRfc,
} from "./db.ts";
import type { RfcMeta, RfcRelation, RfcStatus, RfcStream } from "../types.ts";

export async function ensureIndex(): Promise<Database> {
  const db = await getDb();
  const lastSync = getMeta(db, "index_last_sync");

  if (lastSync) {
    const age = Date.now() - new Date(lastSync).getTime();
    const count = getIndexRfcCount(db);
    if (age < INDEX_MAX_AGE_MS && count > 0) {
      return db;
    }
  }

  await syncIndex(db);
  return db;
}

export async function syncIndex(db?: Database): Promise<void> {
  db = db ?? await getDb();

  console.error("Fetching RFC index...");

  const headers: Record<string, string> = {};
  const etag = getMeta(db, "index_etag");
  if (etag) headers["If-None-Match"] = etag;

  const lastSync = getMeta(db, "index_last_sync");
  if (lastSync) headers["If-Modified-Since"] = new Date(lastSync).toUTCString();

  const resp = await fetch(RFC_INDEX_URL, { headers });

  if (resp.status === 304) {
    console.error("Index is up to date.");
    setMeta(db, "index_last_sync", new Date().toISOString());
    return;
  }

  if (!resp.ok) {
    throw new Error(`Failed to fetch index: ${resp.status} ${resp.statusText}`);
  }

  const xml = await resp.text();
  console.error(
    `Parsing index (${(xml.length / 1024 / 1024).toFixed(1)} MB)...`,
  );

  const newEtag = resp.headers.get("etag");
  if (newEtag) setMeta(db, "index_etag", newEtag);

  const doc = parse(xml) as Record<string, unknown>;
  const rfcIndex = doc["rfc-index"] as Record<string, unknown>;
  if (!rfcIndex) throw new Error("Invalid index XML: missing rfc-index root");

  const entries = rfcIndex["rfc-entry"];
  if (!entries) throw new Error("Invalid index XML: no rfc-entry elements");

  const rfcEntries = Array.isArray(entries) ? entries : [entries];

  console.error(`Indexing ${rfcEntries.length} RFCs...`);

  db.exec("BEGIN TRANSACTION");
  try {
    let count = 0;
    for (const entry of rfcEntries) {
      const { meta, relations } = parseEntry(entry as Record<string, unknown>);
      if (meta) {
        upsertRfc(db, meta);
        if (relations.length) upsertRelations(db, relations);
        count++;
      }
    }
    db.exec("COMMIT");
    console.error(`Indexed ${count} RFCs.`);
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  setMeta(db, "index_last_sync", new Date().toISOString());
}

function parseEntry(
  entry: Record<string, unknown>,
): { meta: RfcMeta | null; relations: RfcRelation[] } {
  const docId = textContent(entry["doc-id"]);
  if (!docId) return { meta: null, relations: [] };

  const match = docId.match(/^RFC(\d+)$/);
  if (!match) return { meta: null, relations: [] };

  const number = parseInt(match[1]);
  const title = textContent(entry["title"]) || `RFC ${number}`;

  // Authors
  const authorEntries = entry["author"];
  const authors: string[] = [];
  if (authorEntries) {
    const authorList = Array.isArray(authorEntries)
      ? authorEntries
      : [authorEntries];
    for (const a of authorList) {
      const name = typeof a === "object" && a !== null
        ? textContent((a as Record<string, unknown>)["name"])
        : null;
      if (name) authors.push(name);
    }
  }

  // Date
  const dateObj = entry["date"] as Record<string, unknown> | undefined;
  const month = dateObj ? textContent(dateObj["month"]) || "" : "";
  const year = dateObj ? parseInt(textContent(dateObj["year"]) || "0") : 0;

  // Page count
  const pageCount = parseInt(textContent(entry["page-count"]) || "0");

  // Status
  const status =
    (textContent(entry["current-status"]) || "UNKNOWN") as RfcStatus;
  const stream = (textContent(entry["stream"]) || "Legacy") as RfcStream;

  // Keywords
  const kws = entry["keywords"] as Record<string, unknown> | undefined;
  const keywords: string[] = [];
  if (kws) {
    const kwList = kws["kw"];
    if (kwList) {
      const items = Array.isArray(kwList) ? kwList : [kwList];
      for (const k of items) {
        const t = textContent(k);
        if (t) keywords.push(t);
      }
    }
  }

  // Abstract
  const abstractNode = entry["abstract"];
  let abstract_: string | undefined;
  if (abstractNode && typeof abstractNode === "object") {
    const p = (abstractNode as Record<string, unknown>)["p"];
    abstract_ = textContent(p) || undefined;
  }

  // Working group and area
  const wg = textContent(entry["wg_acronym"]) || undefined;
  const area = textContent(entry["area"]) || undefined;

  // DOI and errata
  const doi = textContent(entry["doi"]) || "";
  const errata = textContent(entry["errata-url"]) || undefined;

  // Formats
  const formatNode = entry["format"] as Record<string, unknown> | undefined;
  const formats: string[] = [];
  if (formatNode) {
    const ff = formatNode["file-format"];
    if (ff) {
      const items = Array.isArray(ff) ? ff : [ff];
      for (const f of items) {
        const t = textContent(f);
        if (t) formats.push(t);
      }
    }
  }

  // Relations
  const relations: RfcRelation[] = [];

  const obsoletesNode = entry["obsoletes"];
  if (obsoletesNode && typeof obsoletesNode === "object") {
    for (const id of extractDocIds(obsoletesNode as Record<string, unknown>)) {
      relations.push({ source: number, target: id, type: "obsoletes" });
    }
  }

  const updatesNode = entry["updates"];
  if (updatesNode && typeof updatesNode === "object") {
    for (const id of extractDocIds(updatesNode as Record<string, unknown>)) {
      relations.push({ source: number, target: id, type: "updates" });
    }
  }

  const meta: RfcMeta = {
    number,
    title,
    authors,
    date: { month, year },
    pageCount,
    status,
    stream,
    keywords,
    abstract: abstract_,
    obsoletes: relations
      .filter((r) => r.type === "obsoletes")
      .map((r) => r.target),
    obsoletedBy: [], // filled by reverse lookup in db
    updates: relations
      .filter((r) => r.type === "updates")
      .map((r) => r.target),
    updatedBy: [], // filled by reverse lookup in db
    wg,
    area,
    errata,
    doi,
    formats,
  };

  return { meta, relations };
}

function extractDocIds(node: Record<string, unknown>): number[] {
  const docId = node["doc-id"];
  if (!docId) return [];
  const items = Array.isArray(docId) ? docId : [docId];
  const ids: number[] = [];
  for (const item of items) {
    const t = textContent(item);
    if (t) {
      const m = t.match(/^RFC(\d+)$/);
      if (m) ids.push(parseInt(m[1]));
    }
  }
  return ids;
}

function textContent(node: unknown): string | null {
  if (node === null || node === undefined) return null;
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "object") {
    // @libs/xml represents text content as "#text" or the value directly
    const obj = node as Record<string, unknown>;
    if ("#text" in obj) return textContent(obj["#text"]);
    if ("~text" in obj) return textContent(obj["~text"]);
    // Try to extract any string value
    for (const v of Object.values(obj)) {
      if (typeof v === "string") return v;
    }
  }
  return null;
}
