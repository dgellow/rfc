import type { KeyEvent } from "@dgellow/weew";
import { isKey, Keys } from "@dgellow/weew";
import type { AppContext } from "@dgellow/weew";
import type { TuiState } from "./state.ts";
import { getRfc, getRfcBody, search as dbSearch } from "../data/db.ts";
import { fetchRfc } from "../data/fetch.ts";
import { findMatchingLines, prepareRfcText } from "../render/text.ts";

const STATUS_FILTERS = [
  null,
  "INTERNET STANDARD",
  "PROPOSED STANDARD",
  "BEST CURRENT PRACTICE",
  "INFORMATIONAL",
  "EXPERIMENTAL",
  "HISTORIC",
];

export function handleKey(
  event: KeyEvent,
  state: TuiState,
  ctx: AppContext<TuiState>,
): TuiState | undefined {
  // Global keys
  if (isKey(event, "?") && !state.contentSearchActive) {
    return { ...state, showHelp: !state.showHelp };
  }
  if (state.showHelp) {
    // Any key dismisses help
    return { ...state, showHelp: false };
  }

  if (state.screen === "search") {
    return handleSearchKey(event, state, ctx);
  } else {
    return handleReaderKey(event, state, ctx);
  }
}

// --- Search screen ---

function handleSearchKey(
  event: KeyEvent,
  state: TuiState,
  ctx: AppContext<TuiState>,
): TuiState | undefined {
  // Quit
  if (
    isKey(event, "c", { ctrl: true }) ||
    (state.keymap === "vim" && isKey(event, "q") && !state.query) ||
    (state.keymap === "emacs" && isKey(event, "c", { ctrl: true }))
  ) {
    ctx.exit();
    return;
  }

  // Navigation
  if (
    isKey(event, Keys.Down) ||
    (state.keymap === "vim" && isKey(event, "j")) ||
    (state.keymap === "emacs" && isKey(event, "n", { ctrl: true }))
  ) {
    const next = Math.min(state.selectedIndex + 1, state.results.length - 1);
    return { ...state, selectedIndex: next };
  }

  if (
    isKey(event, Keys.Up) ||
    (state.keymap === "vim" && isKey(event, "k")) ||
    (state.keymap === "emacs" && isKey(event, "p", { ctrl: true }))
  ) {
    const prev = Math.max(state.selectedIndex - 1, 0);
    return { ...state, selectedIndex: prev };
  }

  // Open RFC
  if (isKey(event, Keys.Enter)) {
    if (state.results.length === 0) return;
    const result = state.results[state.selectedIndex];
    if (!result) return;
    openRfc(result.meta.number, result.meta.title, state, ctx);
    return {
      ...state,
      screen: "reader",
      currentRfc: result.meta.number,
      currentTitle: result.meta.title,
      loading: true,
      scrollY: 0,
      contentSearch: "",
      contentSearchActive: false,
      contentMatches: [],
      contentMatchIndex: 0,
    };
  }

  // Info toggle
  if (isKey(event, "i") && !state.query) {
    if (state.results.length === 0) return;
    return { ...state, showInfo: !state.showInfo };
  }

  // Tab - cycle status filter
  if (isKey(event, Keys.Tab)) {
    const currentIdx = STATUS_FILTERS.indexOf(state.statusFilter);
    const nextIdx = (currentIdx + 1) % STATUS_FILTERS.length;
    const newFilter = STATUS_FILTERS[nextIdx];
    return runSearch({ ...state, statusFilter: newFilter, selectedIndex: 0 });
  }

  // Text input
  if (isKey(event, Keys.Backspace)) {
    if (state.cursorPos === 0) return;
    const newQuery = state.query.slice(0, state.cursorPos - 1) +
      state.query.slice(state.cursorPos);
    return runSearch({
      ...state,
      query: newQuery,
      cursorPos: state.cursorPos - 1,
      selectedIndex: 0,
    });
  }

  if (isKey(event, "u", { ctrl: true })) {
    return runSearch({ ...state, query: "", cursorPos: 0, selectedIndex: 0 });
  }

  if (isKey(event, "a", { ctrl: true }) || isKey(event, Keys.Home)) {
    return { ...state, cursorPos: 0 };
  }

  if (isKey(event, "e", { ctrl: true }) || isKey(event, Keys.End)) {
    return { ...state, cursorPos: state.query.length };
  }

  if (isKey(event, Keys.Left)) {
    return { ...state, cursorPos: Math.max(0, state.cursorPos - 1) };
  }

  if (isKey(event, Keys.Right)) {
    return {
      ...state,
      cursorPos: Math.min(state.query.length, state.cursorPos + 1),
    };
  }

  // Regular character input
  if (event.key.length === 1 && !event.ctrl && !event.alt && !event.meta) {
    const newQuery = state.query.slice(0, state.cursorPos) + event.key +
      state.query.slice(state.cursorPos);
    return runSearch({
      ...state,
      query: newQuery,
      cursorPos: state.cursorPos + 1,
      selectedIndex: 0,
    });
  }

  return;
}

function runSearch(state: TuiState): TuiState {
  try {
    const db = getDbSync();
    if (!db) return state;

    // Build query: status filter uses a short keyword that LIKE can match
    let query = state.query;
    if (state.statusFilter) {
      // Use first word of status which is unique enough for LIKE
      const keyword = state.statusFilter.split(" ")[0].toLowerCase();
      query = `status:${keyword} ${query}`;
    }

    const results = dbSearch(db, query || "", 100);
    return { ...state, results, error: null };
  } catch (e) {
    return { ...state, error: (e as Error).message };
  }
}

// --- Reader screen ---

function handleReaderKey(
  event: KeyEvent,
  state: TuiState,
  ctx: AppContext<TuiState>,
): TuiState | undefined {
  if (state.loading) return;

  // Content search mode
  if (state.contentSearchActive) {
    return handleContentSearchKey(event, state);
  }

  // Back to search
  if (
    isKey(event, Keys.Escape) ||
    (state.keymap === "vim" && isKey(event, "q")) ||
    (state.keymap === "emacs" && isKey(event, "g", { ctrl: true }))
  ) {
    if (state.history.length > 0) {
      const prev = state.history[state.history.length - 1];
      const db = getDbSync();
      const meta = db ? getRfc(db, prev) : null;
      if (meta) {
        const body = db ? getRfcBody(db, prev) : null;
        if (body) {
          return {
            ...state,
            currentRfc: prev,
            currentTitle: meta.title,
            lines: prepareRfcText(body),
            scrollY: 0,
            history: state.history.slice(0, -1),
          };
        }
      }
    }
    return { ...state, screen: "search", showInfo: false };
  }

  // Quit
  if (state.keymap === "emacs" && isKey(event, "c", { ctrl: true })) {
    ctx.exit();
    return;
  }

  const maxScroll = Math.max(0, state.lines.length - viewportHeight(ctx));

  // Scroll
  if (
    isKey(event, Keys.Down) ||
    (state.keymap === "vim" && isKey(event, "j")) ||
    (state.keymap === "emacs" && isKey(event, "n", { ctrl: true }))
  ) {
    return { ...state, scrollY: Math.min(state.scrollY + 1, maxScroll) };
  }

  if (
    isKey(event, Keys.Up) ||
    (state.keymap === "vim" && isKey(event, "k")) ||
    (state.keymap === "emacs" && isKey(event, "p", { ctrl: true }))
  ) {
    return { ...state, scrollY: Math.max(state.scrollY - 1, 0) };
  }

  // Half-page scroll
  const halfPage = Math.floor(viewportHeight(ctx) / 2);
  if (
    (state.keymap === "vim" && isKey(event, "d", { ctrl: true })) ||
    (state.keymap === "emacs" && isKey(event, "v", { ctrl: true })) ||
    isKey(event, Keys.PageDown)
  ) {
    return { ...state, scrollY: Math.min(state.scrollY + halfPage, maxScroll) };
  }

  if (
    (state.keymap === "vim" && isKey(event, "u", { ctrl: true })) ||
    (state.keymap === "emacs" && event.alt && isKey(event, "v")) ||
    isKey(event, Keys.PageUp)
  ) {
    return { ...state, scrollY: Math.max(state.scrollY - halfPage, 0) };
  }

  // Top/bottom
  if (state.keymap === "vim" && isKey(event, "g") && !event.shift) {
    return { ...state, scrollY: 0 };
  }
  if (state.keymap === "vim" && isKey(event, "G")) {
    return { ...state, scrollY: maxScroll };
  }
  if (state.keymap === "emacs" && event.alt && isKey(event, "<")) {
    return { ...state, scrollY: 0 };
  }
  if (state.keymap === "emacs" && event.alt && isKey(event, ">")) {
    return { ...state, scrollY: maxScroll };
  }

  // Content search
  if (
    (state.keymap === "vim" && isKey(event, "/")) ||
    (state.keymap === "emacs" && isKey(event, "s", { ctrl: true }))
  ) {
    return { ...state, contentSearchActive: true, contentSearch: "" };
  }

  // Next/prev match
  if (
    state.keymap === "vim" && isKey(event, "n") &&
    state.contentMatches.length > 0
  ) {
    const next = (state.contentMatchIndex + 1) % state.contentMatches.length;
    return {
      ...state,
      contentMatchIndex: next,
      scrollY: scrollToMatch(state.contentMatches[next], ctx),
    };
  }
  if (
    state.keymap === "vim" && isKey(event, "N") &&
    state.contentMatches.length > 0
  ) {
    const prev = (state.contentMatchIndex - 1 + state.contentMatches.length) %
      state.contentMatches.length;
    return {
      ...state,
      contentMatchIndex: prev,
      scrollY: scrollToMatch(state.contentMatches[prev], ctx),
    };
  }

  // Info toggle
  if (isKey(event, "i")) {
    return { ...state, showInfo: !state.showInfo };
  }

  // Follow RFC reference — Enter on current viewport line
  if (isKey(event, Keys.Enter)) {
    return followReference(state, ctx);
  }

  return;
}

function handleContentSearchKey(
  event: KeyEvent,
  state: TuiState,
): TuiState | undefined {
  if (
    isKey(event, Keys.Escape) ||
    (state.keymap === "emacs" && isKey(event, "g", { ctrl: true }))
  ) {
    return { ...state, contentSearchActive: false };
  }

  if (isKey(event, Keys.Enter)) {
    const matches = findMatchingLines(state.lines, state.contentSearch);
    const scrollY = matches.length > 0
      ? scrollToMatchValue(matches[0])
      : state.scrollY;
    return {
      ...state,
      contentSearchActive: false,
      contentMatches: matches,
      contentMatchIndex: 0,
      scrollY,
    };
  }

  if (isKey(event, Keys.Backspace)) {
    if (state.contentSearch.length === 0) return;
    return { ...state, contentSearch: state.contentSearch.slice(0, -1) };
  }

  if (event.key.length === 1 && !event.ctrl && !event.alt) {
    return { ...state, contentSearch: state.contentSearch + event.key };
  }

  return;
}

// --- Helpers ---

function viewportHeight(ctx: AppContext<TuiState>): number {
  return ctx.size().rows - 4; // title bar + status bar + borders
}

function scrollToMatch(lineIndex: number, ctx: AppContext<TuiState>): number {
  const vh = viewportHeight(ctx);
  return Math.max(0, lineIndex - Math.floor(vh / 3));
}

function scrollToMatchValue(lineIndex: number): number {
  // Approximate viewport height
  return Math.max(0, lineIndex - 10);
}

function followReference(
  state: TuiState,
  ctx: AppContext<TuiState>,
): TuiState | undefined {
  // Look at lines around current scroll position for RFC references
  const RFC_PATTERN = /RFC\s*(\d{1,5})/gi;
  const startLine = state.scrollY;
  const endLine = Math.min(startLine + 30, state.lines.length);

  for (let i = startLine; i < endLine; i++) {
    let match;
    RFC_PATTERN.lastIndex = 0;
    while ((match = RFC_PATTERN.exec(state.lines[i])) !== null) {
      const refNum = parseInt(match[1]);
      if (refNum !== state.currentRfc && refNum > 0) {
        // Found a reference — navigate to it
        const history = [...state.history];
        if (state.currentRfc) history.push(state.currentRfc);

        openRfc(refNum, "", state, ctx);
        return {
          ...state,
          screen: "reader",
          currentRfc: refNum,
          currentTitle: "",
          loading: true,
          scrollY: 0,
          history,
          contentSearch: "",
          contentMatches: [],
          contentMatchIndex: 0,
        };
      }
    }
  }
  return;
}

async function openRfc(
  number: number,
  title: string,
  _state: TuiState,
  ctx: AppContext<TuiState>,
): Promise<void> {
  try {
    const text = await fetchRfc(number);
    const lines = prepareRfcText(text);

    // Get title from db if not provided
    let rfcTitle = title;
    if (!rfcTitle) {
      const db = getDbSync();
      if (db) {
        const meta = getRfc(db, number);
        if (meta) rfcTitle = meta.title;
      }
    }

    ctx.setState((s) => ({
      ...s,
      lines,
      currentTitle: rfcTitle || `RFC ${number}`,
      loading: false,
      error: null,
    }));
  } catch (e) {
    ctx.setState((s) => ({
      ...s,
      loading: false,
      error: (e as Error).message,
    }));
  }
}

// Synchronous db access (db is set once at TUI startup via setDbSync)
import { Database } from "@db/sqlite";

let _dbSync: Database | null = null;

function getDbSync(): Database | null {
  return _dbSync;
}

export function setDbSync(db: Database): void {
  _dbSync = db;
}
