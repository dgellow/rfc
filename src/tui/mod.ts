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
import { Database } from "@db/sqlite";
import { ensureIndex } from "../data/index.ts";
import { search } from "../data/db.ts";
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
  const initialResults = search(db, "", 100);
  state.results = initialResults;

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
      const panelWidth = Math.min(50, ctx.width - 10);
      const panelHeight = Math.min(20, ctx.height - 4);
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
      "Vim Key Bindings",
      "",
      "Search Screen:",
      "  Type         Search RFCs",
      "  j / ↓        Next result",
      "  k / ↑        Previous result",
      "  Enter        Open RFC",
      "  Tab          Cycle status filter",
      "  i            Info panel",
      "  q            Quit",
      "",
      "Reader:",
      "  j / k        Scroll up/down",
      "  Ctrl-d/u     Half-page down/up",
      "  g / G        Top / Bottom",
      "  /            Search in content",
      "  n / N        Next/prev match",
      "  Enter        Follow RFC reference",
      "  i            Toggle info",
      "  Esc / q      Back",
      "",
      "Press any key to close",
    ]
    : [
      "Emacs Key Bindings",
      "",
      "Search Screen:",
      "  Type         Search RFCs",
      "  C-n / ↓      Next result",
      "  C-p / ↑      Previous result",
      "  Enter        Open RFC",
      "  Tab          Cycle status filter",
      "  i            Info panel",
      "  C-c          Quit",
      "",
      "Reader:",
      "  C-n / C-p    Scroll up/down",
      "  C-v / M-v    Page down/up",
      "  M-< / M->    Top / Bottom",
      "  C-s          Search in content",
      "  Enter        Follow RFC reference",
      "  i            Toggle info",
      "  C-g          Back",
      "",
      "Press any key to close",
    ];

  const helpContent: Component = {
    render(canvas, rect) {
      for (let i = 0; i < lines.length && i < rect.height; i++) {
        const isBold = i === 0 || lines[i].endsWith(":");
        canvas.text(rect.x, rect.y + i, lines[i], {
          fg: isBold ? colors.fg.cyan : undefined,
          style: isBold ? "\x1b[1m" : undefined,
        });
      }
    },
  };

  const width = 42;
  const height = lines.length + 2;

  return Center({
    child: Box({
      border: "rounded",
      borderColor: colors.fg.cyan,
      title: "Help",
      padding: { top: 0, right: 1, bottom: 0, left: 1 },
      child: helpContent,
    }),
    width,
    height,
  });
}
