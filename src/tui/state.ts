import type { SearchResult } from "../types.ts";
import { loadConfig } from "./config.ts";

export type Screen = "search" | "reader";
export type Keymap = "vim" | "emacs";
export type SortOrder = "number_desc" | "number_asc" | "date" | "relevance";

export interface TuiState {
  screen: Screen;
  keymap: Keymap;

  // Search / browse
  query: string;
  cursorPos: number;
  searchActive: boolean; // whether search input is focused (/ to activate)
  results: SearchResult[];
  totalMatches: number; // total matching results (may be > results.length)
  selectedIndex: number;
  statusFilter: string | null;
  listOffset: number; // viewport offset for result list scrolling
  sortOrder: SortOrder;

  // Reader
  currentRfc: number | null;
  currentTitle: string;
  lines: string[];
  scrollY: number;
  contentSearch: string;
  contentSearchActive: boolean;
  contentMatches: number[];
  contentMatchIndex: number;
  refIndex: number; // which RFC reference is focused (-1 = none)
  visibleRefs: number[]; // RFC numbers visible near scroll position

  // Info panel
  showInfo: boolean;

  // Navigation
  history: number[];

  // System
  loading: boolean;
  error: string | null;
  indexTotal: number; // total RFCs in index

  // Help
  showHelp: boolean;
}

export function initialState(): TuiState {
  // Priority: env var > config file > default (vim)
  const envKeymap = Deno.env.get("RFC_KEYMAP");
  const config = loadConfig();
  const keymap: Keymap = envKeymap === "emacs"
    ? "emacs"
    : envKeymap === "vim"
    ? "vim"
    : config.keymap ?? "vim";
  return {
    screen: "search",
    keymap,
    query: "",
    cursorPos: 0,
    searchActive: false,
    results: [],
    totalMatches: 0,
    selectedIndex: 0,
    statusFilter: null,
    listOffset: 0,
    sortOrder: "number_desc",
    showInfo: false,
    currentRfc: null,
    currentTitle: "",
    lines: [],
    scrollY: 0,
    contentSearch: "",
    contentSearchActive: false,
    contentMatches: [],
    contentMatchIndex: 0,
    refIndex: -1,
    visibleRefs: [],
    history: [],
    loading: false,
    error: null,
    indexTotal: 0,
    showHelp: false,
  };
}
