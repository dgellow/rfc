import {
  Box,
  colors,
  Column,
  type Component,
  Divider,
  Row,
  Spinner,
  Text,
} from "@dgellow/weew";
import type { RenderContext } from "@dgellow/weew";
import type { TuiState } from "../state.ts";
import { findReferences } from "../../render/text.ts";

export function renderReaderScreen(
  state: TuiState,
  ctx: RenderContext,
): Component {
  if (state.loading) {
    return Box({
      border: "rounded",
      borderColor: colors.fg.hex("#444444"),
      title: `RFC ${state.currentRfc}`,
      child: Column([
        { component: Text(""), flex: 1 },
        {
          component: Row([
            { component: Text(""), flex: 1 },
            {
              component: Spinner({
                frame: Math.floor(Date.now() / 80),
                label: `Fetching RFC ${state.currentRfc}...`,
                color: colors.fg.cyan,
              }),
              width: 30,
            },
            { component: Text(""), flex: 1 },
          ]),
          height: 1,
        },
        { component: Text(""), flex: 1 },
      ]),
    });
  }

  if (state.error) {
    return Box({
      border: "rounded",
      borderColor: colors.fg.red,
      title: `RFC ${state.currentRfc}`,
      child: Column([
        { component: Text(""), flex: 1 },
        {
          component: Text({
            content: `  Error: ${state.error}`,
            style: { fg: colors.fg.red },
          }),
          height: 1,
        },
        {
          component: Text({
            content: "  Press Esc to go back",
            style: { fg: colors.fg.gray },
          }),
          height: 1,
        },
        { component: Text(""), flex: 1 },
      ]),
    });
  }

  // Title bar
  const titleText = state.currentTitle
    ? `RFC ${state.currentRfc} \u2014 ${state.currentTitle}`
    : `RFC ${state.currentRfc}`;

  // Determine how much space content gets
  // Border: 2 rows, title row: 1, divider: 1, status bar: 1 = 5 overhead
  const contentHeight = ctx.height - 2 - 1 - 1;

  // Render only visible lines (performance: don't iterate all 10k+ lines)
  const rfcContent: Component = {
    render(canvas, rect) {
      const matchSet = new Set(state.contentMatches);
      const currentMatchLine = state.contentMatches[state.contentMatchIndex] ??
        -1;

      for (let i = 0; i < rect.height; i++) {
        const lineIdx = state.scrollY + i;
        if (lineIdx >= state.lines.length) break;

        const line = state.lines[lineIdx];
        const y = rect.y + i;
        const isCurrentMatch = lineIdx === currentMatchLine;
        const isMatch = matchSet.has(lineIdx);

        if (isCurrentMatch) {
          canvas.fill(rect.x, y, rect.width, 1, " ", {
            bg: colors.bg.hex("#665500"),
          });
          canvas.text(rect.x, y, line, {
            fg: colors.fg.hex("#ffdd55"),
            bg: colors.bg.hex("#665500"),
            style: "\x1b[1m",
          });
        } else if (isMatch) {
          canvas.fill(rect.x, y, rect.width, 1, " ", {
            bg: colors.bg.hex("#2a2a00"),
          });
          canvas.text(rect.x, y, line, {
            bg: colors.bg.hex("#2a2a00"),
          });
        } else {
          // Check for RFC references to highlight
          const refs = findReferences(line);
          if (refs.length > 0) {
            canvas.text(rect.x, y, line);
            for (const ref of refs) {
              const refText = line.slice(ref.start, ref.end);
              // Highlight the focused reference differently
              const isFocusedRef = state.refIndex >= 0 &&
                state.visibleRefs[state.refIndex] === ref.number;
              canvas.text(rect.x + ref.start, y, refText, {
                fg: isFocusedRef ? colors.fg.hex("#ffffff") : colors.fg.cyan,
                bg: isFocusedRef ? colors.bg.hex("#005577") : undefined,
                style: "\x1b[4m", // underline
              });
            }
          } else {
            // Detect section headers (lines that are all caps or start with digits followed by a dot)
            const trimmed = line.trimStart();
            const isHeader = /^\d+\.(\d+\.)*\s+\S/.test(trimmed) ||
              (trimmed.length > 0 && trimmed.length < 60 &&
                trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed));
            if (isHeader) {
              canvas.text(rect.x, y, line, {
                fg: colors.fg.white,
                style: "\x1b[1m", // bold
              });
            } else {
              canvas.text(rect.x, y, line);
            }
          }
        }
      }
    },
  };

  // Build status line
  let statusLeft: string;
  if (state.contentSearchActive) {
    statusLeft = `/${state.contentSearch}\u2588`;
  } else {
    const percent = state.lines.length > 0
      ? Math.round(
        (state.scrollY / Math.max(1, state.lines.length - contentHeight)) * 100,
      )
      : 0;
    const clampedPercent = Math.min(100, Math.max(0, percent));
    const pos = state.scrollY === 0
      ? "Top"
      : clampedPercent >= 100
      ? "Bot"
      : `${clampedPercent}%`;

    const matchInfo = state.contentMatches.length > 0
      ? `  ${
        state.contentMatchIndex + 1
      }/${state.contentMatches.length} matches`
      : "";
    statusLeft = `${pos}  L${
      state.scrollY + 1
    }/${state.lines.length}${matchInfo}`;
  }

  const historyBreadcrumb = state.history.length > 0
    ? state.history.map((n) => `${n}`).join(" \u2192 ") + " \u2192 "
    : "";

  const refHint = state.visibleRefs.length > 0 && state.refIndex >= 0
    ? `ref: RFC ${state.visibleRefs[state.refIndex]}  `
    : "";

  const hints = state.keymap === "vim"
    ? "j/k \u2195  Ctrl-d/u \u21c5  / search  i info  ? help  K keymap  q back"
    : "C-n/C-p \u2195  C-v/M-v \u21c5  C-s search  i info  ? help  K keymap  C-g back";

  // Scrollbar
  const scrollbarComponent: Component = {
    render(canvas, rect) {
      if (state.lines.length <= contentHeight) return;

      const trackHeight = rect.height;
      const scrollRatio = state.scrollY /
        Math.max(1, state.lines.length - contentHeight);
      const thumbSize = Math.max(
        1,
        Math.floor((contentHeight / state.lines.length) * trackHeight),
      );
      const thumbPos = Math.floor(
        Math.min(scrollRatio, 1) * (trackHeight - thumbSize),
      );

      for (let i = 0; i < trackHeight; i++) {
        const isThumb = i >= thumbPos && i < thumbPos + thumbSize;
        canvas.set(rect.x, rect.y + i, {
          char: isThumb ? "\u2588" : "\u2591",
          fg: isThumb ? colors.fg.hex("#555555") : colors.fg.hex("#222222"),
        });
      }
    },
  };

  return Box({
    border: "rounded",
    borderColor: colors.fg.hex("#444444"),
    title: titleText.length > ctx.width - 4
      ? titleText.slice(0, ctx.width - 7) + "\u2026"
      : titleText,
    child: Column([
      {
        component: Row([
          { component: rfcContent, flex: 1 },
          { component: scrollbarComponent, width: 1 },
        ]),
        flex: 1,
      },
      {
        component: Divider({
          char: "\u2500",
          style: { fg: colors.fg.hex("#333333") },
        }),
        height: 1,
      },
      {
        component: Row([
          {
            component: Text({
              content: historyBreadcrumb
                ? `${historyBreadcrumb}${state.currentRfc}`
                : `${refHint}${statusLeft}`,
              style: { fg: colors.fg.hex("#888888") },
            }),
            flex: 1,
          },
          {
            component: Text({
              content: historyBreadcrumb ? statusLeft : hints,
              style: { fg: colors.fg.hex("#555555") },
              align: "right",
            }),
            flex: 1,
          },
        ]),
        height: 1,
      },
    ]),
  });
}
