import {
  colors,
  Column,
  type Component,
  Divider,
  Row,
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
    return Column([
      { component: Text(""), flex: 1 },
      {
        component: Row([
          { component: Text(""), flex: 1 },
          {
            component: Text({
              content: `Fetching RFC ${state.currentRfc}...`,
              style: { fg: colors.fg.cyan },
            }),
            width: 30,
          },
          { component: Text(""), flex: 1 },
        ]),
        height: 1,
      },
      { component: Text(""), flex: 1 },
    ]);
  }

  if (state.error) {
    return Column([
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
    ]);
  }

  // Title bar
  const titleText = state.currentTitle
    ? `RFC ${state.currentRfc} \u2014 ${state.currentTitle}`
    : `RFC ${state.currentRfc}`;

  // Determine how much space content gets
  // Title: 1, divider: 1, status bar: 1 = 3 overhead
  const contentHeight = ctx.height - 1 - 1 - 1;

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

        if (isCurrentMatch || isMatch) {
          const dimBg = isCurrentMatch
            ? colors.bg.hex("#1a1a00")
            : colors.bg.hex("#111100");
          canvas.fill(rect.x, y, rect.width, 1, " ", { bg: dimBg });
          canvas.text(rect.x, y, line, {
            fg: colors.fg.hex("#999999"),
            bg: dimBg,
          });
          // Highlight actual matched text
          if (state.contentSearch) {
            const lower = line.toLowerCase();
            const needle = state.contentSearch.toLowerCase();
            let pos = 0;
            while ((pos = lower.indexOf(needle, pos)) !== -1) {
              const matchText = line.slice(pos, pos + needle.length);
              canvas.text(rect.x + pos, y, matchText, {
                fg: isCurrentMatch
                  ? colors.fg.hex("#ffdd55")
                  : colors.fg.hex("#ddaa33"),
                bg: isCurrentMatch
                  ? colors.bg.hex("#665500")
                  : colors.bg.hex("#332200"),
                style: "\x1b[1m",
              });
              pos += needle.length;
            }
          }
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

  const searchKey = state.keymap === "vim" ? "/" : "C-s";
  const matchHint = state.contentMatches.length > 0 ? "  n/p match" : "";
  const hints =
    `n/p \u2195  u/d page  t/b jump  ${searchKey} search${matchHint}  i info  ? help  Esc back`;

  // Scrollbar
  const scrollbarComponent: Component = {
    render(canvas, rect) {
      if (state.lines.length <= contentHeight) return;

      const trackHeight = rect.height;
      const totalLines = state.lines.length;
      const scrollRatio = state.scrollY /
        Math.max(1, totalLines - contentHeight);
      const thumbSize = Math.max(
        1,
        Math.floor((contentHeight / totalLines) * trackHeight),
      );
      const thumbPos = Math.floor(
        Math.min(scrollRatio, 1) * (trackHeight - thumbSize),
      );

      // Pre-compute which scrollbar rows have matches
      const matchRows = new Set<number>();
      const currentMatchLine = state.contentMatches[state.contentMatchIndex] ??
        -1;
      let currentMatchRow = -1;
      for (const lineIdx of state.contentMatches) {
        const row = Math.floor((lineIdx / totalLines) * trackHeight);
        matchRows.add(row);
        if (lineIdx === currentMatchLine) currentMatchRow = row;
      }

      for (let i = 0; i < trackHeight; i++) {
        const isThumb = i >= thumbPos && i < thumbPos + thumbSize;
        const isCurrentMatch = i === currentMatchRow;
        const isMatch = matchRows.has(i);

        if (isCurrentMatch) {
          canvas.set(rect.x, rect.y + i, {
            char: isThumb ? "\u2588" : "\u2500",
            fg: colors.fg.hex("#ffdd55"),
          });
        } else if (isMatch) {
          canvas.set(rect.x, rect.y + i, {
            char: isThumb ? "\u2588" : "\u2500",
            fg: isThumb ? colors.fg.hex("#886600") : colors.fg.hex("#665500"),
          });
        } else {
          canvas.set(rect.x, rect.y + i, {
            char: isThumb ? "\u2588" : "\u2591",
            fg: isThumb ? colors.fg.hex("#555555") : colors.fg.hex("#222222"),
          });
        }
      }
    },
  };

  const displayTitle = titleText.length > ctx.width - 2
    ? titleText.slice(0, ctx.width - 3) + "\u2026"
    : titleText;

  return Column([
    {
      component: Text({
        content: displayTitle,
        style: { fg: colors.fg.hex("#888888") },
      }),
      height: 1,
    },
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
              ? `${historyBreadcrumb}${state.currentRfc}  ${statusLeft}`
              : `${refHint}${statusLeft}`,
            style: { fg: colors.fg.hex("#888888") },
          }),
          flex: 1,
        },
        {
          component: Text({
            content: hints,
            style: { fg: colors.fg.hex("#555555") },
            align: "right",
          }),
          flex: 1,
        },
      ]),
      height: 1,
    },
  ]);
}
