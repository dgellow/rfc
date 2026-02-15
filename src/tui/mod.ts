import {
  type AppContext,
  Box,
  Center,
  colors,
  type Component,
  type KeyEvent,
  Positioned,
  type RenderContext,
  run,
  Stack,
} from "@dgellow/weew";
import type { Database } from "@db/sqlite";
import { ensureIndex } from "../data/index.ts";
import { getIndexRfcCount, search } from "../data/db.ts";
import { initialState, type TuiState } from "./state.ts";
import { handleKey, setDbSync } from "./keys.ts";
import { renderSearchScreen } from "./views/search.ts";
import { renderReaderScreen } from "./views/reader.ts";
import { renderInfoPanel } from "./views/info.ts";

let db: Database;

export async function runTui(): Promise<void> {
  db = await ensureIndex();
  setDbSync(db);

  const state = initialState();

  // Initial search to populate results
  const { results, total } = search(db, "", { limit: 500 });
  state.results = results;
  state.totalMatches = total;
  state.indexTotal = getIndexRfcCount(db);

  await run<TuiState>({
    initialState: state,
    render: renderApp,
    onKey: onKey,
    onResize: (_size, state) => state,
    tickInterval: 100,
    onTick: (state) => {
      // Keep spinner animating during loading
      if (state.loading) return { ...state };
      return undefined;
    },
  });
}

function renderApp(state: TuiState, ctx: RenderContext): Component {
  let main: Component;

  if (state.screen === "search") {
    main = renderSearchScreen(state, ctx);
  } else {
    main = renderReaderScreen(state, ctx);
  }

  const layers: Component[] = [main];

  // Info panel overlay
  if (state.showInfo) {
    const info = renderInfoPanel(state, db);
    if (info) {
      const panelWidth = Math.min(55, ctx.width - 6);
      const panelHeight = Math.min(24, ctx.height - 4);
      layers.push(
        Positioned({
          right: 2,
          y: 2,
          width: panelWidth,
          height: panelHeight,
          child: info,
        }),
      );
    }
  }

  // Help overlay
  if (state.showHelp) {
    layers.push(renderHelp(state));
  }

  return Stack(layers);
}

function onKey(
  event: KeyEvent,
  state: TuiState,
  ctx: AppContext<TuiState>,
): TuiState | undefined {
  return handleKey(event, state, ctx);
}

function renderHelp(state: TuiState): Component {
  const lines = state.keymap === "vim"
    ? [
      "Key Bindings (vim)",
      "",
      "Browse:",
      "  j/k \u2191\u2193         Navigate results",
      "  Ctrl-d/u       Page down/up",
      "  g / G          Top / bottom",
      "  Enter / l      Open RFC",
      "  /              Search",
      "  s              Cycle sort order",
      "  Tab            Cycle status filter",
      "  i              Info panel",
      "  Esc            Clear search",
      "  q              Quit",
      "",
      "Reader:",
      "  j/k \u2191\u2193         Scroll",
      "  Ctrl-d/u       Half-page scroll",
      "  g / G          Top / bottom",
      "  /              Search in document",
      "  n / N          Next / prev match",
      "  Tab            Cycle RFC references",
      "  Enter / l      Follow reference",
      "  i              Info panel",
      "  Esc / q / h    Back",
      "",
      "Search syntax:",
      "  author:name  status:standard",
      "  wg:httpbis   year:2022",
      "",
      "  ? to toggle this help",
    ]
    : [
      "Key Bindings (emacs)",
      "",
      "Browse:",
      "  C-n/C-p \u2191\u2193    Navigate results",
      "  Enter          Open RFC",
      "  C-s            Search",
      "  s              Cycle sort order",
      "  Tab            Cycle status filter",
      "  i              Info panel",
      "  Esc            Clear search",
      "  C-c            Quit",
      "",
      "Reader:",
      "  C-n/C-p        Scroll",
      "  C-v / M-v      Page down / up",
      "  M-< / M->      Top / bottom",
      "  C-s            Search in document",
      "  Tab            Cycle RFC references",
      "  Enter          Follow reference",
      "  i              Info panel",
      "  C-g            Back",
      "",
      "Search syntax:",
      "  author:name  status:standard",
      "  wg:httpbis   year:2022",
      "",
      "  ? to toggle this help",
    ];

  const helpContent: Component = {
    render(canvas, rect) {
      for (let i = 0; i < lines.length && i < rect.height; i++) {
        const isTitle = i === 0;
        const isSection = lines[i].endsWith(":");
        const isHint = i === lines.length - 1;
        canvas.text(rect.x, rect.y + i, lines[i], {
          fg: isTitle
            ? colors.fg.cyan
            : isSection
            ? colors.fg.hex("#888888")
            : isHint
            ? colors.fg.hex("#555555")
            : undefined,
          style: isTitle ? "\x1b[1m" : isSection ? "\x1b[1m" : undefined,
        });
      }
    },
  };

  const width = 44;
  const height = lines.length + 2;

  return Center({
    child: Box({
      border: "rounded",
      borderColor: colors.fg.hex("#555555"),
      title: "Help",
      fill: " ",
      style: { bg: colors.bg.hex("#111111") },
      padding: { top: 0, right: 1, bottom: 0, left: 1 },
      child: helpContent,
    }),
    width,
    height,
  });
}
