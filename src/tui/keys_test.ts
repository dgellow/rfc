import { assertEquals } from "@std/assert";
import { TestDriver } from "@dgellow/weew";
import { Database } from "@db/sqlite";
import { initialState, type TuiState } from "./state.ts";
import { handleKey, setAsyncUpdater, setDbSync } from "./keys.ts";
import { renderSearchScreen } from "./views/search.ts";
import { renderReaderScreen } from "./views/reader.ts";
import type { SearchResult } from "../types.ts";

// --- Test helpers ---

function makeResult(
  number: number,
  title: string,
  status: SearchResult["meta"]["status"] = "PROPOSED STANDARD",
): SearchResult {
  return {
    meta: {
      number,
      title,
      authors: ["Test Author"],
      date: { month: "January", year: 2024 },
      pageCount: 10,
      status,
      stream: "IETF",
      keywords: [],
      obsoletes: [],
      obsoletedBy: [],
      updates: [],
      updatedBy: [],
      doi: "",
      formats: ["ASCII"],
    },
    rank: 0,
  };
}

function createTestDb(): Database {
  const db = new Database(":memory:");
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
    // already exists
  }
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS rfcs_ai AFTER INSERT ON rfcs BEGIN
      INSERT INTO rfc_fts(rowid, title, authors, keywords, abstract, body)
      VALUES (new.number, new.title, new.authors, new.keywords, new.abstract, new.body);
    END;
  `);

  // Insert test RFCs
  const stmt = db.prepare(`
    INSERT INTO rfcs (number, title, authors, date_month, date_year, page_count, status, stream, keywords, formats)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    9999,
    "Test Protocol",
    '["Author A"]',
    "January",
    2024,
    10,
    "PROPOSED STANDARD",
    "IETF",
    "[]",
    '["ASCII"]',
  );
  stmt.run(
    9998,
    "Another Protocol",
    '["Author B"]',
    "February",
    2024,
    20,
    "INFORMATIONAL",
    "IETF",
    "[]",
    '["ASCII"]',
  );
  stmt.run(
    9997,
    "Third Protocol",
    '["Author C"]',
    "March",
    2024,
    15,
    "INTERNET STANDARD",
    "IETF",
    "[]",
    '["ASCII"]',
  );

  return db;
}

const defaultResults = [
  makeResult(9999, "Test Protocol"),
  makeResult(9998, "Another Protocol", "INFORMATIONAL"),
  makeResult(9997, "Third Protocol", "INTERNET STANDARD"),
];

let state: TuiState;

function makeDriver(overrides?: Partial<TuiState>): TestDriver {
  state = {
    ...initialState(),
    results: defaultResults,
    totalMatches: defaultResults.length,
    indexTotal: defaultResults.length,
    ...overrides,
  };

  setAsyncUpdater((fn) => {
    state = fn(state);
  });

  return new TestDriver(
    {
      render: (ctx) => {
        if (state.screen === "search") return renderSearchScreen(state, ctx);
        return renderReaderScreen(state, ctx);
      },
      onKey: (event, ctx) => {
        const newState = handleKey(event, state, ctx);
        if (newState) state = newState;
      },
    },
    100,
    30,
  );
}

// --- Tests ---

let db: Database;

function setup() {
  db = createTestDb();
  setDbSync(db);
}

function teardown() {
  db.close();
}

// Browse mode

Deno.test("browse: j moves selection down", () => {
  setup();
  try {
    const driver = makeDriver();
    assertEquals(state.selectedIndex, 0);
    driver.sendKey("j");
    assertEquals(state.selectedIndex, 1);
    driver.sendKey("j");
    assertEquals(state.selectedIndex, 2);
  } finally {
    teardown();
  }
});

Deno.test("browse: k moves selection up", () => {
  setup();
  try {
    const driver = makeDriver({ selectedIndex: 2 });
    assertEquals(state.selectedIndex, 2);
    driver.sendKey("k");
    assertEquals(state.selectedIndex, 1);
    driver.sendKey("k");
    assertEquals(state.selectedIndex, 0);
  } finally {
    teardown();
  }
});

Deno.test("browse: j does not go past end", () => {
  setup();
  try {
    const driver = makeDriver({ selectedIndex: 2 });
    driver.sendKey("j");
    assertEquals(state.selectedIndex, 2);
  } finally {
    teardown();
  }
});

Deno.test("browse: k does not go past beginning", () => {
  setup();
  try {
    const driver = makeDriver({ selectedIndex: 0 });
    driver.sendKey("k");
    assertEquals(state.selectedIndex, 0);
  } finally {
    teardown();
  }
});

Deno.test("browse: / activates search", () => {
  setup();
  try {
    const driver = makeDriver();
    assertEquals(state.searchActive, false);
    driver.sendKey("/");
    assertEquals(state.searchActive, true);
  } finally {
    teardown();
  }
});

Deno.test("browse: s cycles sort order", () => {
  setup();
  try {
    const driver = makeDriver();
    assertEquals(state.sortOrder, "number_desc");
    driver.sendKey("s");
    assertEquals(state.sortOrder, "number_asc");
    driver.sendKey("s");
    assertEquals(state.sortOrder, "date");
    driver.sendKey("s");
    assertEquals(state.sortOrder, "relevance");
    driver.sendKey("s");
    assertEquals(state.sortOrder, "number_desc");
  } finally {
    teardown();
  }
});

Deno.test("browse: Tab cycles status filter", () => {
  setup();
  try {
    const driver = makeDriver();
    assertEquals(state.statusFilter, null);
    driver.sendKey("Tab");
    assertEquals(state.statusFilter, "INTERNET STANDARD");
    driver.sendKey("Tab");
    assertEquals(state.statusFilter, "PROPOSED STANDARD");
  } finally {
    teardown();
  }
});

Deno.test("browse: q quits", () => {
  setup();
  try {
    const driver = makeDriver();
    assertEquals(driver.running, true);
    driver.sendKey("q");
    assertEquals(driver.running, false);
  } finally {
    teardown();
  }
});

Deno.test({
  name: "browse: Enter opens RFC",
  // openRfc triggers async fetch that we can't await in the test
  sanitizeOps: false,
  sanitizeResources: false,
  fn() {
    setup();
    try {
      const driver = makeDriver();
      assertEquals(state.screen, "search");
      driver.sendKey("Enter");
      assertEquals(state.screen, "reader");
      assertEquals(state.currentRfc, 9999);
      assertEquals(state.loading, true);
    } finally {
      teardown();
    }
  },
});

Deno.test({
  name: "browse: g goes to top",
  // previous test's async fetch can leak here
  sanitizeOps: false,
  sanitizeResources: false,
  fn() {
    setup();
    try {
      const driver = makeDriver({ selectedIndex: 2 });
      driver.sendKey("g");
      assertEquals(state.selectedIndex, 0);
    } finally {
      teardown();
    }
  },
});

Deno.test("browse: i toggles info panel", () => {
  setup();
  try {
    const driver = makeDriver();
    assertEquals(state.showInfo, false);
    driver.sendKey("i");
    assertEquals(state.showInfo, true);
    driver.sendKey("i");
    assertEquals(state.showInfo, false);
  } finally {
    teardown();
  }
});

// Search mode

Deno.test("search: typing updates query", () => {
  setup();
  try {
    const driver = makeDriver({ searchActive: true });
    driver.sendKey("h");
    assertEquals(state.query, "h");
    driver.sendKey("t");
    assertEquals(state.query, "ht");
    driver.sendKey("t");
    assertEquals(state.query, "htt");
    driver.sendKey("p");
    assertEquals(state.query, "http");
  } finally {
    teardown();
  }
});

Deno.test("search: Escape exits search mode", () => {
  setup();
  try {
    const driver = makeDriver({ searchActive: true, query: "test" });
    assertEquals(state.searchActive, true);
    driver.sendKey("Escape");
    assertEquals(state.searchActive, false);
    assertEquals(state.query, "test");
  } finally {
    teardown();
  }
});

Deno.test("search: Enter confirms and exits", () => {
  setup();
  try {
    const driver = makeDriver({ searchActive: true, query: "test" });
    driver.sendKey("Enter");
    assertEquals(state.searchActive, false);
  } finally {
    teardown();
  }
});

Deno.test("search: Backspace on empty exits search", () => {
  setup();
  try {
    const driver = makeDriver({ searchActive: true, query: "", cursorPos: 0 });
    driver.sendKey("Backspace");
    assertEquals(state.searchActive, false);
  } finally {
    teardown();
  }
});

Deno.test("search: Backspace deletes character", () => {
  setup();
  try {
    const driver = makeDriver({
      searchActive: true,
      query: "test",
      cursorPos: 4,
    });
    driver.sendKey("Backspace");
    assertEquals(state.query, "tes");
    assertEquals(state.cursorPos, 3);
  } finally {
    teardown();
  }
});

Deno.test("search: Ctrl+A moves cursor to start", () => {
  setup();
  try {
    const driver = makeDriver({
      searchActive: true,
      query: "test",
      cursorPos: 4,
    });
    driver.sendKey("a", { ctrl: true });
    assertEquals(state.cursorPos, 0);
  } finally {
    teardown();
  }
});

Deno.test("search: Ctrl+E moves cursor to end", () => {
  setup();
  try {
    const driver = makeDriver({
      searchActive: true,
      query: "test",
      cursorPos: 0,
    });
    driver.sendKey("e", { ctrl: true });
    assertEquals(state.cursorPos, 4);
  } finally {
    teardown();
  }
});

Deno.test("search: Ctrl+U clears to start of line", () => {
  setup();
  try {
    const driver = makeDriver({
      searchActive: true,
      query: "hello world",
      cursorPos: 5,
    });
    driver.sendKey("u", { ctrl: true });
    assertEquals(state.query, " world");
    assertEquals(state.cursorPos, 0);
  } finally {
    teardown();
  }
});

// Reader mode

Deno.test("reader: j/k scrolls", () => {
  setup();
  try {
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i}`);
    const driver = makeDriver({
      screen: "reader",
      lines,
      scrollY: 0,
      currentRfc: 9999,
      currentTitle: "Test",
    });
    driver.sendKey("j");
    assertEquals(state.scrollY, 1);
    driver.sendKey("j");
    assertEquals(state.scrollY, 2);
    driver.sendKey("k");
    assertEquals(state.scrollY, 1);
  } finally {
    teardown();
  }
});

Deno.test("reader: / activates content search", () => {
  setup();
  try {
    const driver = makeDriver({
      screen: "reader",
      lines: ["hello world"],
      currentRfc: 9999,
      currentTitle: "Test",
    });
    driver.sendKey("/");
    assertEquals(state.contentSearchActive, true);
    assertEquals(state.contentSearch, "");
  } finally {
    teardown();
  }
});

Deno.test("reader: content search typing and confirm", () => {
  setup();
  try {
    const lines = Array.from(
      { length: 100 },
      (_, i) => i === 50 ? "The quick brown fox" : `Line ${i}`,
    );
    const driver = makeDriver({
      screen: "reader",
      lines,
      scrollY: 0,
      currentRfc: 9999,
      currentTitle: "Test",
    });
    driver.sendKey("/");
    driver.sendKey("f");
    driver.sendKey("o");
    driver.sendKey("x");
    assertEquals(state.contentSearch, "fox");
    driver.sendKey("Enter");
    assertEquals(state.contentSearchActive, false);
    assertEquals(state.contentMatches.length, 1);
    assertEquals(state.contentMatches[0], 50);
  } finally {
    teardown();
  }
});

Deno.test("reader: Escape goes back to search screen", () => {
  setup();
  try {
    const driver = makeDriver({
      screen: "reader",
      lines: ["hello"],
      currentRfc: 9999,
      currentTitle: "Test",
    });
    driver.sendKey("Escape");
    assertEquals(state.screen, "search");
  } finally {
    teardown();
  }
});

Deno.test("reader: Tab cycles RFC references", () => {
  setup();
  try {
    const driver = makeDriver({
      screen: "reader",
      lines: ["See RFC 1234 and RFC 5678"],
      currentRfc: 9999,
      currentTitle: "Test",
      visibleRefs: [1234, 5678],
      refIndex: -1,
    });
    driver.sendKey("Tab");
    assertEquals(state.refIndex, 0);
    driver.sendKey("Tab");
    assertEquals(state.refIndex, 1);
  } finally {
    teardown();
  }
});

Deno.test("browse: ? toggles help", () => {
  setup();
  try {
    const driver = makeDriver();
    assertEquals(state.showHelp, false);
    driver.sendKey("?");
    assertEquals(state.showHelp, true);
    // Any key dismisses help
    driver.sendKey("j");
    assertEquals(state.showHelp, false);
  } finally {
    teardown();
  }
});

// Empty results edge cases

Deno.test("browse: j with empty results does not crash", () => {
  setup();
  try {
    const driver = makeDriver({ results: [], totalMatches: 0 });
    assertEquals(state.selectedIndex, 0);
    driver.sendKey("j");
    assertEquals(state.selectedIndex, 0);
  } finally {
    teardown();
  }
});

Deno.test("browse: k with empty results does not crash", () => {
  setup();
  try {
    const driver = makeDriver({ results: [], totalMatches: 0 });
    driver.sendKey("k");
    assertEquals(state.selectedIndex, 0);
  } finally {
    teardown();
  }
});

Deno.test("browse: g with empty results does not crash", () => {
  setup();
  try {
    const driver = makeDriver({ results: [], totalMatches: 0 });
    driver.sendKey("g");
    assertEquals(state.selectedIndex, 0);
  } finally {
    teardown();
  }
});

Deno.test("browse: G with empty results does not crash", () => {
  setup();
  try {
    const driver = makeDriver({ results: [], totalMatches: 0 });
    driver.sendKey("G");
    assertEquals(state.selectedIndex, 0);
  } finally {
    teardown();
  }
});

Deno.test("browse: G goes to last item", () => {
  setup();
  try {
    const driver = makeDriver({ selectedIndex: 0 });
    driver.sendKey("G");
    assertEquals(state.selectedIndex, 2);
  } finally {
    teardown();
  }
});

Deno.test("browse: Shift+Tab cycles filter backward", () => {
  setup();
  try {
    const driver = makeDriver();
    assertEquals(state.statusFilter, null);
    // Shift+Tab from "ALL" should wrap to last filter
    driver.sendKey("Tab", { shift: true });
    assertEquals(state.statusFilter, "HISTORIC");
    driver.sendKey("Tab", { shift: true });
    assertEquals(state.statusFilter, "EXPERIMENTAL");
  } finally {
    teardown();
  }
});

Deno.test("reader: content search with no matches", () => {
  setup();
  try {
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i}`);
    const driver = makeDriver({
      screen: "reader",
      lines,
      scrollY: 0,
      currentRfc: 9999,
      currentTitle: "Test",
    });
    driver.sendKey("/");
    driver.sendKey("z");
    driver.sendKey("z");
    driver.sendKey("z");
    driver.sendKey("Enter");
    assertEquals(state.contentSearchActive, false);
    assertEquals(state.contentMatches.length, 0);
    assertEquals(state.scrollY, 0);
  } finally {
    teardown();
  }
});

Deno.test("reader: n/N navigates matches", () => {
  setup();
  try {
    const lines = Array.from(
      { length: 100 },
      (_, i) => i % 25 === 0 ? "target line" : `Line ${i}`,
    );
    const driver = makeDriver({
      screen: "reader",
      lines,
      scrollY: 0,
      currentRfc: 9999,
      currentTitle: "Test",
    });
    // Search for "target"
    driver.sendKey("/");
    for (const ch of "target") driver.sendKey(ch);
    driver.sendKey("Enter");
    assertEquals(state.contentMatches.length, 4); // lines 0, 25, 50, 75
    assertEquals(state.contentMatchIndex, 0);

    // n goes to next match
    driver.sendKey("n");
    assertEquals(state.contentMatchIndex, 1);
    driver.sendKey("n");
    assertEquals(state.contentMatchIndex, 2);

    // N goes to previous match
    driver.sendKey("N");
    assertEquals(state.contentMatchIndex, 1);

    // N wraps around from first to last
    driver.sendKey("N");
    assertEquals(state.contentMatchIndex, 0);
    driver.sendKey("N");
    assertEquals(state.contentMatchIndex, 3);
  } finally {
    teardown();
  }
});
