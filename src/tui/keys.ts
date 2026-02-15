import type { KeyEvent, RunControl } from "@dgellow/weew";
import { isKey, Keys, TextInput } from "@dgellow/weew";
import type { Keymap, SortOrder, TuiState } from "./state.ts";
import { saveConfig } from "./config.ts";
import { getRfc, getRfcBody, search as dbSearch } from "../data/db.ts";
import { fetchRfc as _fetchRfc } from "../data/fetch.ts";
import {
  findMatchingLines,
  findReferences,
  prepareRfcText,
} from "../render/text.ts";
import { adjustListOffset } from "./views/search.ts";

const STATUS_FILTERS = [
  null,
  "INTERNET STANDARD",
  "PROPOSED STANDARD",
  "BEST CURRENT PRACTICE",
  "INFORMATIONAL",
  "EXPERIMENTAL",
  "HISTORIC",
];

const SORT_CYCLE: SortOrder[] = [
  "number_desc",
  "number_asc",
  "date",
  "relevance",
];

export function handleKey(
  event: KeyEvent,
  state: TuiState,
  ctx: RunControl,
): TuiState | undefined {
  // Global keys
  if (isKey(event, "?") && !state.searchActive && !state.contentSearchActive) {
    return { ...state, showHelp: !state.showHelp };
  }
  if (
    isKey(event, "K") && event.shift && !state.searchActive &&
    !state.contentSearchActive
  ) {
    const newKeymap: Keymap = state.keymap === "vim" ? "emacs" : "vim";
    saveConfig({ keymap: newKeymap });
    return { ...state, keymap: newKeymap, showHelp: false };
  }
  if (state.showHelp) {
    return { ...state, showHelp: false };
  }

  if (state.screen === "search") {
    if (state.searchActive) {
      return handleSearchInput(event, state);
    }
    return handleBrowseKey(event, state, ctx);
  } else {
    return handleReaderKey(event, state, ctx);
  }
}

// --- Browse mode (search screen, input not focused) ---

function handleBrowseKey(
  event: KeyEvent,
  state: TuiState,
  ctx: RunControl,
): TuiState | undefined {
  const listHeight = ctx.size().rows - 1 - 1 - 1 - 1 - 1 - 1;

  // Quit
  if (
    isKey(event, "q") ||
    isKey(event, "c", { ctrl: true })
  ) {
    ctx.exit();
    return;
  }

  // Activate search
  if (isKey(event, "/") || isKey(event, "s", { ctrl: true })) {
    return { ...state, searchActive: true };
  }

  // Navigation — all guards check for empty results
  if (
    isKey(event, Keys.Down) ||
    (state.keymap === "vim" && isKey(event, "j")) ||
    (state.keymap === "emacs" && isKey(event, "n", { ctrl: true }))
  ) {
    if (state.results.length === 0) return;
    const next = Math.min(state.selectedIndex + 1, state.results.length - 1);
    return adjustListOffset({ ...state, selectedIndex: next }, listHeight);
  }

  if (
    isKey(event, Keys.Up) ||
    (state.keymap === "vim" && isKey(event, "k")) ||
    (state.keymap === "emacs" && isKey(event, "p", { ctrl: true }))
  ) {
    if (state.results.length === 0) return;
    const prev = Math.max(state.selectedIndex - 1, 0);
    return adjustListOffset({ ...state, selectedIndex: prev }, listHeight);
  }

  // Page down/up
  if (
    isKey(event, Keys.PageDown) ||
    isKey(event, "d", { ctrl: true })
  ) {
    if (state.results.length === 0) return;
    const next = Math.min(
      state.selectedIndex + listHeight,
      state.results.length - 1,
    );
    return adjustListOffset({ ...state, selectedIndex: next }, listHeight);
  }
  if (
    isKey(event, Keys.PageUp) ||
    isKey(event, "u", { ctrl: true })
  ) {
    if (state.results.length === 0) return;
    const prev = Math.max(state.selectedIndex - listHeight, 0);
    return adjustListOffset({ ...state, selectedIndex: prev }, listHeight);
  }

  // Emacs C-v / M-v: move cursor to edge of visible area first, then page
  if (state.keymap === "emacs" && isKey(event, "v", { ctrl: true })) {
    if (state.results.length === 0) return;
    const bottomVisible = Math.min(
      state.listOffset + listHeight - 1,
      state.results.length - 1,
    );
    if (state.selectedIndex < bottomVisible) {
      return adjustListOffset(
        { ...state, selectedIndex: bottomVisible },
        listHeight,
      );
    }
    const next = Math.min(
      state.selectedIndex + listHeight,
      state.results.length - 1,
    );
    return adjustListOffset({ ...state, selectedIndex: next }, listHeight);
  }
  if (state.keymap === "emacs" && event.alt && isKey(event, "v")) {
    if (state.results.length === 0) return;
    const topVisible = state.listOffset;
    if (state.selectedIndex > topVisible) {
      return adjustListOffset(
        { ...state, selectedIndex: topVisible },
        listHeight,
      );
    }
    const prev = Math.max(state.selectedIndex - listHeight, 0);
    return adjustListOffset({ ...state, selectedIndex: prev }, listHeight);
  }

  // Top/bottom
  if (
    (state.keymap === "vim" && isKey(event, "g")) ||
    (state.keymap === "emacs" && event.alt && isKey(event, "<"))
  ) {
    if (state.results.length === 0) return;
    return adjustListOffset({ ...state, selectedIndex: 0 }, listHeight);
  }
  if (
    (state.keymap === "vim" && isKey(event, "G")) ||
    (state.keymap === "emacs" && event.alt && isKey(event, ">"))
  ) {
    if (state.results.length === 0) return;
    const last = state.results.length - 1;
    return adjustListOffset({ ...state, selectedIndex: last }, listHeight);
  }

  // Open RFC
  if (
    isKey(event, Keys.Enter) ||
    (state.keymap === "vim" && isKey(event, "l")) ||
    isKey(event, Keys.Right)
  ) {
    if (state.results.length === 0) return;
    const result = state.results[state.selectedIndex];
    if (!result) return;
    openRfc(result.meta.number, result.meta.title);
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
      refIndex: -1,
      visibleRefs: [],
    };
  }

  // Info toggle
  if (isKey(event, "i")) {
    if (state.results.length === 0) return;
    return { ...state, showInfo: !state.showInfo };
  }

  // Sort
  if (isKey(event, "s")) {
    const currentIdx = SORT_CYCLE.indexOf(state.sortOrder);
    const nextIdx = (currentIdx + 1) % SORT_CYCLE.length;
    const newSort = SORT_CYCLE[nextIdx];
    return runSearch({
      ...state,
      sortOrder: newSort,
      selectedIndex: 0,
      listOffset: 0,
    });
  }

  // Shift-Tab - cycle filter backwards (must be checked before Tab)
  if (isKey(event, Keys.Tab, { shift: true })) {
    const currentIdx = STATUS_FILTERS.indexOf(state.statusFilter);
    const prevIdx = (currentIdx - 1 + STATUS_FILTERS.length) %
      STATUS_FILTERS.length;
    const newFilter = STATUS_FILTERS[prevIdx];
    return adjustListOffset(
      runSearch({
        ...state,
        statusFilter: newFilter,
        selectedIndex: 0,
        listOffset: 0,
      }),
      listHeight,
    );
  }

  // Tab - cycle status filter
  if (isKey(event, Keys.Tab)) {
    const currentIdx = STATUS_FILTERS.indexOf(state.statusFilter);
    const nextIdx = (currentIdx + 1) % STATUS_FILTERS.length;
    const newFilter = STATUS_FILTERS[nextIdx];
    return adjustListOffset(
      runSearch({
        ...state,
        statusFilter: newFilter,
        selectedIndex: 0,
        listOffset: 0,
      }),
      listHeight,
    );
  }

  // Clear search
  if (isKey(event, Keys.Escape)) {
    if (state.query) {
      return runSearch({
        ...state,
        query: "",
        cursorPos: 0,
        selectedIndex: 0,
        listOffset: 0,
      });
    }
    return;
  }

  return;
}

// --- Search input mode (search screen, input focused) ---

function handleSearchInput(
  event: KeyEvent,
  state: TuiState,
): TuiState | undefined {
  // Exit search mode
  if (isKey(event, Keys.Escape) || isKey(event, "g", { ctrl: true })) {
    return { ...state, searchActive: false };
  }

  // Confirm search and return to browse
  if (isKey(event, Keys.Enter)) {
    return runSearch({
      ...state,
      searchActive: false,
      selectedIndex: 0,
      listOffset: 0,
    });
  }

  // Backspace on empty query exits search
  if (
    isKey(event, Keys.Backspace) && state.cursorPos === 0 &&
    state.query.length === 0
  ) {
    return { ...state, searchActive: false };
  }

  // Delegate text editing to TextInput
  const input = TextInput({ value: state.query, cursorPos: state.cursorPos });
  const update = input.handleKey(event);
  if (update) {
    if (update.value !== state.query) {
      return runSearch({
        ...state,
        query: update.value,
        cursorPos: update.cursorPos,
        selectedIndex: 0,
        listOffset: 0,
      });
    }
    return { ...state, cursorPos: update.cursorPos };
  }

  return;
}

function runSearch(state: TuiState): TuiState {
  try {
    const db = getDbSync();
    if (!db) return state;

    let query = state.query;
    if (state.statusFilter) {
      const keyword = state.statusFilter.split(" ")[0].toLowerCase();
      query = `status:${keyword} ${query}`;
    }

    const { results, total } = dbSearch(db, query || "", {
      orderBy: state.sortOrder,
    });
    return { ...state, results, totalMatches: total, error: null };
  } catch (e) {
    return { ...state, error: (e as Error).message };
  }
}

// --- Reader screen ---

function handleReaderKey(
  event: KeyEvent,
  state: TuiState,
  ctx: RunControl,
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
    (state.keymap === "vim" && isKey(event, "h")) ||
    isKey(event, Keys.Left) ||
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
            refIndex: -1,
            visibleRefs: [],
          };
        }
      }
    }
    return {
      ...state,
      screen: "search",
      showInfo: false,
      contentMatches: [],
      contentMatchIndex: 0,
    };
  }

  // Quit
  if (isKey(event, "c", { ctrl: true })) {
    ctx.exit();
    return;
  }

  const viewportHeight = ctx.size().rows - 1 - 1 - 1;
  const maxScroll = Math.max(0, state.lines.length - viewportHeight);

  // Scroll
  if (
    isKey(event, Keys.Down) ||
    (state.keymap === "vim" && isKey(event, "j")) ||
    (state.keymap === "emacs" && isKey(event, "n", { ctrl: true }))
  ) {
    const newScrollY = Math.min(state.scrollY + 1, maxScroll);
    return updateVisibleRefs({ ...state, scrollY: newScrollY, refIndex: -1 });
  }

  if (
    isKey(event, Keys.Up) ||
    (state.keymap === "vim" && isKey(event, "k")) ||
    (state.keymap === "emacs" && isKey(event, "p", { ctrl: true }))
  ) {
    const newScrollY = Math.max(state.scrollY - 1, 0);
    return updateVisibleRefs({ ...state, scrollY: newScrollY, refIndex: -1 });
  }

  // Half-page scroll
  const halfPage = Math.floor(viewportHeight / 2);
  if (
    isKey(event, "d", { ctrl: true }) ||
    (state.keymap === "emacs" && isKey(event, "v", { ctrl: true })) ||
    isKey(event, Keys.PageDown)
  ) {
    const newScrollY = Math.min(state.scrollY + halfPage, maxScroll);
    return updateVisibleRefs({ ...state, scrollY: newScrollY, refIndex: -1 });
  }

  if (
    isKey(event, "u", { ctrl: true }) ||
    (state.keymap === "emacs" && event.alt && isKey(event, "v")) ||
    isKey(event, Keys.PageUp)
  ) {
    const newScrollY = Math.max(state.scrollY - halfPage, 0);
    return updateVisibleRefs({ ...state, scrollY: newScrollY, refIndex: -1 });
  }

  // Top/bottom
  if (state.keymap === "vim" && isKey(event, "g")) {
    return updateVisibleRefs({ ...state, scrollY: 0, refIndex: -1 });
  }
  if (state.keymap === "vim" && isKey(event, "G")) {
    return updateVisibleRefs({ ...state, scrollY: maxScroll, refIndex: -1 });
  }
  if (state.keymap === "emacs" && event.alt && isKey(event, "<")) {
    return updateVisibleRefs({ ...state, scrollY: 0, refIndex: -1 });
  }
  if (state.keymap === "emacs" && event.alt && isKey(event, ">")) {
    return updateVisibleRefs({ ...state, scrollY: maxScroll, refIndex: -1 });
  }

  // Content search
  if (
    (state.keymap === "vim" && isKey(event, "/")) ||
    (state.keymap === "emacs" && isKey(event, "s", { ctrl: true }))
  ) {
    return { ...state, contentSearchActive: true, contentSearch: "" };
  }

  // Next/prev match
  if (isKey(event, "n") && state.contentMatches.length > 0) {
    const next = (state.contentMatchIndex + 1) % state.contentMatches.length;
    return {
      ...state,
      contentMatchIndex: next,
      scrollY: scrollToMatch(state.contentMatches[next], viewportHeight),
    };
  }
  if (
    (isKey(event, "N") || isKey(event, "p")) &&
    state.contentMatches.length > 0
  ) {
    const prev = (state.contentMatchIndex - 1 + state.contentMatches.length) %
      state.contentMatches.length;
    return {
      ...state,
      contentMatchIndex: prev,
      scrollY: scrollToMatch(state.contentMatches[prev], viewportHeight),
    };
  }

  // Cycle through RFC references with Tab
  if (isKey(event, Keys.Tab)) {
    if (state.visibleRefs.length === 0) return;
    const nextRef = (state.refIndex + 1) % state.visibleRefs.length;
    return { ...state, refIndex: nextRef };
  }

  // Info toggle
  if (isKey(event, "i")) {
    return { ...state, showInfo: !state.showInfo };
  }

  // Follow RFC reference
  if (
    isKey(event, Keys.Enter) ||
    (state.keymap === "vim" && isKey(event, "l")) ||
    isKey(event, Keys.Right)
  ) {
    return followReference(state);
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

  // Delegate text editing to TextInput (cursor always at end)
  const input = TextInput({
    value: state.contentSearch,
    cursorPos: state.contentSearch.length,
  });
  const update = input.handleKey(event);
  if (update) {
    return { ...state, contentSearch: update.value };
  }

  return;
}

// --- Helpers ---

function scrollToMatch(lineIndex: number, viewportHeight: number): number {
  return Math.max(0, lineIndex - Math.floor(viewportHeight / 3));
}

function scrollToMatchValue(lineIndex: number): number {
  return Math.max(0, lineIndex - 10);
}

function collectVisibleRefs(state: TuiState): number[] {
  const seen = new Set<number>();
  const refs: number[] = [];
  const startLine = state.scrollY;
  const endLine = Math.min(startLine + 40, state.lines.length);

  for (let i = startLine; i < endLine; i++) {
    const lineRefs = findReferences(state.lines[i]);
    for (const ref of lineRefs) {
      if (ref.number !== state.currentRfc && !seen.has(ref.number)) {
        seen.add(ref.number);
        refs.push(ref.number);
      }
    }
  }
  return refs;
}

function updateVisibleRefs(state: TuiState): TuiState {
  return { ...state, visibleRefs: collectVisibleRefs(state) };
}

function followReference(
  state: TuiState,
): TuiState | undefined {
  let targetRef: number | undefined;

  if (state.refIndex >= 0 && state.visibleRefs[state.refIndex]) {
    targetRef = state.visibleRefs[state.refIndex];
  } else if (state.visibleRefs.length > 0) {
    targetRef = state.visibleRefs[0];
  }

  if (!targetRef) return;

  const history = [...state.history];
  if (state.currentRfc) history.push(state.currentRfc);

  openRfc(targetRef, "");
  return {
    ...state,
    screen: "reader",
    currentRfc: targetRef,
    currentTitle: "",
    loading: true,
    scrollY: 0,
    history,
    contentSearch: "",
    contentMatches: [],
    contentMatchIndex: 0,
    refIndex: -1,
    visibleRefs: [],
  };
}

async function openRfc(
  number: number,
  title: string,
): Promise<void> {
  const generation = ++_openRfcGeneration;
  try {
    const text = await _fetchRfcFn(number);
    if (generation !== _openRfcGeneration) return;
    const lines = prepareRfcText(text);

    let rfcTitle = title;
    if (!rfcTitle) {
      const db = getDbSync();
      if (db) {
        const meta = getRfc(db, number);
        if (meta) rfcTitle = meta.title;
      }
    }

    asyncUpdate((s) => {
      if (generation !== _openRfcGeneration) return s;
      const newState: TuiState = {
        ...s,
        lines,
        currentTitle: rfcTitle || `RFC ${number}`,
        loading: false,
        error: null,
      };
      return { ...newState, visibleRefs: collectVisibleRefs(newState) };
    });
  } catch (e) {
    asyncUpdate((s) => {
      if (generation !== _openRfcGeneration) return s;
      return {
        ...s,
        loading: false,
        error: (e as Error).message,
      };
    });
  }
}

// Async state updater (set by mod.ts, used for post-fetch updates)
let _asyncUpdate: ((fn: (s: TuiState) => TuiState) => void) | null = null;

export function setAsyncUpdater(
  fn: (updater: (s: TuiState) => TuiState) => void,
): void {
  _asyncUpdate = fn;
}

function asyncUpdate(fn: (s: TuiState) => TuiState): void {
  _asyncUpdate?.(fn);
}

// Generation counter: prevents stale async openRfc updates from applying
let _openRfcGeneration = 0;

// Injectable fetch for testing
let _fetchRfcFn: (number: number) => Promise<string> = _fetchRfc;

export function setFetchRfc(fn: (number: number) => Promise<string>): void {
  _fetchRfcFn = fn;
}

// Synchronous db access
import type { Database } from "@db/sqlite";

let _dbSync: Database | null = null;

function getDbSync(): Database | null {
  return _dbSync;
}

export function setDbSync(db: Database): void {
  _dbSync = db;
}
