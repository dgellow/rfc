import type { SearchResult } from "../types.ts";

export type Screen = "search" | "reader";
export type Keymap = "vim" | "emacs";

export interface TuiState {
  screen: Screen;
  keymap: Keymap;

  // Search
  query: string;
  cursorPos: number;
  results: SearchResult[];
  selectedIndex: number;
  statusFilter: string | null;

  // Reader
  currentRfc: number | null;
  currentTitle: string;
  lines: string[];
  scrollY: number;
  contentSearch: string;
  contentSearchActive: boolean;
  contentMatches: number[];
  contentMatchIndex: number;

  // Info panel
  showInfo: boolean;

  // Navigation
  history: number[];

  // System
  loading: boolean;
  error: string | null;

  // Help
  showHelp: boolean;
}

export function initialState(): TuiState {
  const keymap =
    (Deno.env.get("RFC_KEYMAP") === "emacs" ? "emacs" : "vim") as Keymap;
  return {
    screen: "search",
    keymap,
    query: "",
    cursorPos: 0,
    results: [],
    selectedIndex: 0,
    statusFilter: null,
    showInfo: false,
    currentRfc: null,
    currentTitle: "",
    lines: [],
    scrollY: 0,
    contentSearch: "",
    contentSearchActive: false,
    contentMatches: [],
    contentMatchIndex: 0,
    history: [],
    loading: false,
    error: null,
    showHelp: false,
  };
}
