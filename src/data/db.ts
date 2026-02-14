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

export function search(
  db: Database,
  query: string,
  limit = 50,
): SearchResult[] {
  const { freeText, filters } = parseQuery(query);

  const whereClauses: string[] = [];
  const params: (string | number | null)[] = [];

  for (const f of filters) {
    switch (f.field) {
      case "author":
        whereClauses.push("r.authors LIKE ?");
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
      case "year":
        whereClauses.push("r.date_year = ?");
        params.push(parseInt(f.value));
        break;
      case "stream":
        whereClauses.push("UPPER(r.stream) LIKE ?");
        params.push(`%${f.value.toUpperCase()}%`);
        break;
    }
  }

  let sql: string;

  if (freeText) {
    // Use FTS5 for free-text search with prefix matching
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
      ORDER BY rank
      LIMIT ?
    `;
    params.unshift(ftsQuery);
    params.push(limit);
  } else if (whereClauses.length) {
    // Filters only, no free text
    sql = `
      SELECT r.*, 0 as rank
      FROM rfcs r
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY r.number DESC
      LIMIT ?
    `;
    params.push(limit);
  } else {
    // No query at all — return recent RFCs
    sql = `
      SELECT r.*, 0 as rank
      FROM rfcs r
      ORDER BY r.number DESC
      LIMIT ?
    `;
    params.push(limit);
  }

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];

  return rows.map((row) => ({
    meta: rowToMeta(db, row),
    rank: (row.rank as number) ?? 0,
  }));
}

// --- Helpers ---

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
