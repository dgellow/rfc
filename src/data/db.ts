import { Database } from "@db/sqlite";
import { DB_PATH } from "../config.ts";
import { ensureCacheDir } from "./cache.ts";
import type { RfcMeta, RfcRelation, SearchResult } from "../types.ts";

let _db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (_db) return _db;
  await ensureCacheDir();
  _db = new Database(DB_PATH);
  _db.exec("PRAGMA journal_mode=WAL");
  _db.exec("PRAGMA foreign_keys=ON");
  migrate(_db);
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rfcs (
      number      INTEGER PRIMARY KEY,
      title       TEXT NOT NULL,
      authors     TEXT NOT NULL DEFAULT '[]',
      date_month  TEXT,
      date_year   INTEGER,
      page_count  INTEGER,
      status      TEXT,
      stream      TEXT,
      keywords    TEXT NOT NULL DEFAULT '[]',
      abstract    TEXT,
      wg          TEXT,
      area        TEXT,
      doi         TEXT,
      errata_url  TEXT,
      formats     TEXT NOT NULL DEFAULT '[]',
      body        TEXT,
      fetched_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS rfc_relations (
      source   INTEGER NOT NULL,
      target   INTEGER NOT NULL,
      type     TEXT NOT NULL,
      PRIMARY KEY (source, target, type)
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Create FTS5 table if it doesn't exist
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS rfc_fts USING fts5(
        title, authors, keywords, abstract, body,
        content='rfcs',
        content_rowid='number',
        tokenize='porter unicode61'
      );
    `);
  } catch {
    // FTS table already exists with different schema — fine
  }

  // Triggers to keep FTS in sync
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS rfcs_ai AFTER INSERT ON rfcs BEGIN
      INSERT INTO rfc_fts(rowid, title, authors, keywords, abstract, body)
      VALUES (new.number, new.title, new.authors, new.keywords, new.abstract, new.body);
    END;

    CREATE TRIGGER IF NOT EXISTS rfcs_au AFTER UPDATE ON rfcs BEGIN
      INSERT INTO rfc_fts(rfc_fts, rowid, title, authors, keywords, abstract, body)
      VALUES ('delete', old.number, old.title, old.authors, old.keywords, old.abstract, old.body);
      INSERT INTO rfc_fts(rowid, title, authors, keywords, abstract, body)
      VALUES (new.number, new.title, new.authors, new.keywords, new.abstract, new.body);
    END;

    CREATE TRIGGER IF NOT EXISTS rfcs_ad AFTER DELETE ON rfcs BEGIN
      INSERT INTO rfc_fts(rfc_fts, rowid, title, authors, keywords, abstract, body)
      VALUES ('delete', old.number, old.title, old.authors, old.keywords, old.abstract, old.body);
    END;
  `);

  // Indexes for relation lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_relations_source_type ON rfc_relations(source, type);
    CREATE INDEX IF NOT EXISTS idx_relations_target_type ON rfc_relations(target, type);
  `);
}

// --- Metadata operations ---

export function getMeta(db: Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(db: Database, key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(
    key,
    value,
  );
}

// --- RFC operations ---

export function upsertRfc(db: Database, meta: RfcMeta): void {
  db.prepare(`
    INSERT INTO rfcs (number, title, authors, date_month, date_year, page_count,
      status, stream, keywords, abstract, wg, area, doi, errata_url, formats)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(number) DO UPDATE SET
      title=excluded.title, authors=excluded.authors, date_month=excluded.date_month,
      date_year=excluded.date_year, page_count=excluded.page_count, status=excluded.status,
      stream=excluded.stream, keywords=excluded.keywords, abstract=excluded.abstract,
      wg=excluded.wg, area=excluded.area, doi=excluded.doi, errata_url=excluded.errata_url,
      formats=excluded.formats
  `).run(
    meta.number,
    meta.title,
    JSON.stringify(meta.authors),
    meta.date.month,
    meta.date.year,
    meta.pageCount,
    meta.status,
    meta.stream,
    JSON.stringify(meta.keywords),
    meta.abstract ?? null,
    meta.wg ?? null,
    meta.area ?? null,
    meta.doi,
    meta.errata ?? null,
    JSON.stringify(meta.formats),
  );
}

export function upsertRelations(db: Database, relations: RfcRelation[]): void {
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO rfc_relations (source, target, type) VALUES (?, ?, ?)",
  );
  for (const rel of relations) {
    stmt.run(rel.source, rel.target, rel.type);
  }
}

export function updateRfcBody(
  db: Database,
  number: number,
  body: string,
): void {
  db.prepare(
    "UPDATE rfcs SET body = ?, fetched_at = ? WHERE number = ?",
  ).run(body, new Date().toISOString(), number);
}

export function getRfc(db: Database, number: number): RfcMeta | null {
  const row = db.prepare("SELECT * FROM rfcs WHERE number = ?").get(number) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return rowToMeta(db, row);
}

export function getRfcBody(db: Database, number: number): string | null {
  const row = db
    .prepare("SELECT body FROM rfcs WHERE number = ?")
    .get(number) as { body: string | null } | undefined;
  return row?.body ?? null;
}

export function listCachedRfcs(db: Database): RfcMeta[] {
  const rows = db
    .prepare("SELECT * FROM rfcs WHERE fetched_at IS NOT NULL ORDER BY number")
    .all() as Record<string, unknown>[];
  return rows.map((r) => rowToMeta(db, r));
}

// --- Search ---

interface ParsedQuery {
  freeText: string;
  filters: { field: string; value: string }[];
}

function parseQuery(query: string): ParsedQuery {
  const filters: { field: string; value: string }[] = [];
  const freeTerms: string[] = [];

  for (const token of query.split(/\s+/)) {
    const match = token.match(/^(author|status|wg|year|stream):(.+)$/i);
    if (match) {
      filters.push({ field: match[1].toLowerCase(), value: match[2] });
    } else if (token) {
      freeTerms.push(token);
    }
  }

  return { freeText: freeTerms.join(" "), filters };
}

export interface SearchOptions {
  orderBy?: "relevance" | "number_desc" | "number_asc" | "date";
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
}

export function search(
  db: Database,
  query: string,
  options: SearchOptions = {},
): SearchResponse {
  const orderBy = options.orderBy ?? "relevance";
  const { freeText, filters } = parseQuery(query);

  const whereClauses: string[] = [];
  const params: (string | number | null)[] = [];

  for (const f of filters) {
    switch (f.field) {
      case "author":
        whereClauses.push("r.authors LIKE ? COLLATE NOCASE");
        params.push(`%${f.value}%`);
        break;
      case "status":
        whereClauses.push("UPPER(r.status) LIKE ?");
        params.push(`%${f.value.toUpperCase()}%`);
        break;
      case "wg":
        whereClauses.push("r.wg = ?");
        params.push(f.value);
        break;
      case "year": {
        const year = parseInt(f.value);
        if (!isNaN(year)) {
          whereClauses.push("r.date_year = ?");
          params.push(year);
        }
        break;
      }
      case "stream":
        whereClauses.push("UPPER(r.stream) LIKE ?");
        params.push(`%${f.value.toUpperCase()}%`);
        break;
    }
  }

  // Determine ORDER BY clause
  let orderClause: string;
  if (freeText && orderBy === "relevance") {
    orderClause = "ORDER BY rank";
  } else {
    switch (orderBy) {
      case "number_asc":
        orderClause = "ORDER BY r.number ASC";
        break;
      case "date":
        orderClause = "ORDER BY r.date_year DESC, r.number DESC";
        break;
      case "number_desc":
      default:
        orderClause = "ORDER BY r.number DESC";
        break;
    }
  }

  let sql: string;
  let countSql: string;
  const countParams = [...params];

  if (freeText) {
    const ftsQuery = freeText
      .split(/\s+/)
      .map((t) => `"${t.replace(/"/g, '""')}"*`)
      .join(" ");

    sql = `
      SELECT r.*, bm25(rfc_fts) as rank
      FROM rfc_fts f
      JOIN rfcs r ON r.number = f.rowid
      WHERE rfc_fts MATCH ?
      ${whereClauses.length ? "AND " + whereClauses.join(" AND ") : ""}
      ${orderClause}
    `;
    countSql = `
      SELECT COUNT(*) as total
      FROM rfc_fts f
      JOIN rfcs r ON r.number = f.rowid
      WHERE rfc_fts MATCH ?
      ${whereClauses.length ? "AND " + whereClauses.join(" AND ") : ""}
    `;
    params.unshift(ftsQuery);
    countParams.unshift(ftsQuery);
  } else if (whereClauses.length) {
    sql = `
      SELECT r.*, 0 as rank
      FROM rfcs r
      WHERE ${whereClauses.join(" AND ")}
      ${orderClause}
    `;
    countSql = `
      SELECT COUNT(*) as total
      FROM rfcs r
      WHERE ${whereClauses.join(" AND ")}
    `;
  } else {
    sql = `
      SELECT r.*, 0 as rank
      FROM rfcs r
      ${orderClause}
    `;
    countSql = `SELECT COUNT(*) as total FROM rfcs`;
  }

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  const countRow = db.prepare(countSql).get(...countParams) as {
    total: number;
  };

  const numbers = rows.map((r) => r.number as number);
  const relations = batchLoadRelations(db, numbers);

  return {
    results: rows.map((row) => ({
      meta: rowToMetaWithRelations(row, relations.get(row.number as number)),
      rank: (row.rank as number) ?? 0,
    })),
    total: countRow.total,
  };
}

// --- Helpers ---

interface RfcRelations {
  obsoletes: number[];
  obsoletedBy: number[];
  updates: number[];
  updatedBy: number[];
}

function emptyRelations(): RfcRelations {
  return { obsoletes: [], obsoletedBy: [], updates: [], updatedBy: [] };
}

function batchLoadRelations(
  db: Database,
  numbers: number[],
): Map<number, RfcRelations> {
  const result = new Map<number, RfcRelations>();
  if (numbers.length === 0) return result;

  for (const n of numbers) result.set(n, emptyRelations());

  const placeholders = numbers.map(() => "?").join(",");
  const numSet = new Set(numbers);

  const sourceRows = db
    .prepare(
      `SELECT source, target, type FROM rfc_relations WHERE source IN (${placeholders})`,
    )
    .all(...numbers) as { source: number; target: number; type: string }[];

  for (const r of sourceRows) {
    const rels = result.get(r.source)!;
    if (r.type === "obsoletes") rels.obsoletes.push(r.target);
    else if (r.type === "updates") rels.updates.push(r.target);
  }

  const targetRows = db
    .prepare(
      `SELECT source, target, type FROM rfc_relations WHERE target IN (${placeholders})`,
    )
    .all(...numbers) as { source: number; target: number; type: string }[];

  for (const r of targetRows) {
    if (!numSet.has(r.target)) continue;
    const rels = result.get(r.target)!;
    if (r.type === "obsoletes") rels.obsoletedBy.push(r.source);
    else if (r.type === "updates") rels.updatedBy.push(r.source);
  }

  return result;
}

function rowToMetaWithRelations(
  row: Record<string, unknown>,
  relations?: RfcRelations,
): RfcMeta {
  const rels = relations ?? emptyRelations();
  return {
    number: row.number as number,
    title: row.title as string,
    authors: JSON.parse((row.authors as string) || "[]"),
    date: {
      month: (row.date_month as string) || "",
      year: (row.date_year as number) || 0,
    },
    pageCount: (row.page_count as number) || 0,
    status: (row.status as RfcMeta["status"]) || "UNKNOWN",
    stream: (row.stream as RfcMeta["stream"]) || "Legacy",
    keywords: JSON.parse((row.keywords as string) || "[]"),
    abstract: (row.abstract as string) || undefined,
    obsoletes: rels.obsoletes,
    obsoletedBy: rels.obsoletedBy,
    updates: rels.updates,
    updatedBy: rels.updatedBy,
    wg: (row.wg as string) || undefined,
    area: (row.area as string) || undefined,
    errata: (row.errata_url as string) || undefined,
    doi: (row.doi as string) || "",
    formats: JSON.parse((row.formats as string) || "[]"),
  };
}

function rowToMeta(db: Database, row: Record<string, unknown>): RfcMeta {
  const number = row.number as number;

  const obsoletes = db
    .prepare(
      "SELECT target FROM rfc_relations WHERE source = ? AND type = 'obsoletes'",
    )
    .all(number) as { target: number }[];
  const obsoletedBy = db
    .prepare(
      "SELECT source FROM rfc_relations WHERE target = ? AND type = 'obsoletes'",
    )
    .all(number) as { source: number }[];
  const updates = db
    .prepare(
      "SELECT target FROM rfc_relations WHERE source = ? AND type = 'updates'",
    )
    .all(number) as { target: number }[];
  const updatedBy = db
    .prepare(
      "SELECT source FROM rfc_relations WHERE target = ? AND type = 'updates'",
    )
    .all(number) as { source: number }[];

  return {
    number,
    title: row.title as string,
    authors: JSON.parse((row.authors as string) || "[]"),
    date: {
      month: (row.date_month as string) || "",
      year: (row.date_year as number) || 0,
    },
    pageCount: (row.page_count as number) || 0,
    status: (row.status as RfcMeta["status"]) || "UNKNOWN",
    stream: (row.stream as RfcMeta["stream"]) || "Legacy",
    keywords: JSON.parse((row.keywords as string) || "[]"),
    abstract: (row.abstract as string) || undefined,
    obsoletes: obsoletes.map((r) => r.target),
    obsoletedBy: obsoletedBy.map((r) => r.source),
    updates: updates.map((r) => r.target),
    updatedBy: updatedBy.map((r) => r.source),
    wg: (row.wg as string) || undefined,
    area: (row.area as string) || undefined,
    errata: (row.errata_url as string) || undefined,
    doi: (row.doi as string) || "",
    formats: JSON.parse((row.formats as string) || "[]"),
  };
}

export function getIndexRfcCount(db: Database): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM rfcs").get() as {
    count: number;
  };
  return row.count;
}

export function getCachedRfcCount(db: Database): number {
  const row = db
    .prepare("SELECT COUNT(*) as count FROM rfcs WHERE fetched_at IS NOT NULL")
    .get() as { count: number };
  return row.count;
}
