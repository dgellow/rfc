import {
  Box,
  colors,
  Column,
  type Component,
  Divider,
  Row,
  ScrollBox,
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
      borderColor: colors.fg.gray,
      title: `RFC ${state.currentRfc}`,
      child: Column([
        { component: Text(""), flex: 1 },
        {
          component: Spinner({
            frame: Math.floor(Date.now() / 80),
            label: "Loading...",
            color: colors.fg.cyan,
          }),
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
      child: Text({
        content: `Error: ${state.error}`,
        style: { fg: colors.fg.red },
      }),
    });
  }

  const titleBar = `RFC ${state.currentRfc} — ${state.currentTitle}`;

  const rfcContent: Component = {
    render(canvas, rect) {
      for (let i = 0; i < rect.height; i++) {
        const lineIdx = i;
        if (lineIdx >= state.lines.length) break;

        const line = state.lines[lineIdx];
        const isMatch = state.contentMatches.includes(lineIdx);
        const isCurrentMatch = isMatch &&
          state.contentMatches[state.contentMatchIndex] === lineIdx;

        if (isCurrentMatch) {
          canvas.fill(rect.x, rect.y + i, rect.width, 1, " ", {
            bg: colors.bg.yellow,
          });
          canvas.text(rect.x, rect.y + i, line, {
            fg: colors.fg.black,
            bg: colors.bg.yellow,
          });
        } else if (isMatch) {
          canvas.fill(rect.x, rect.y + i, rect.width, 1, " ", {
            bg: colors.bg.hex("#3a3a00"),
          });
          canvas.text(rect.x, rect.y + i, line, {
            bg: colors.bg.hex("#3a3a00"),
          });
        } else {
          // Highlight RFC references
          const refs = findReferences(line);
          if (refs.length > 0) {
            canvas.text(rect.x, rect.y + i, line);
            for (const ref of refs) {
              const refText = line.slice(ref.start, ref.end);
              canvas.text(rect.x + ref.start, rect.y + i, refText, {
                fg: colors.fg.cyan,
                style: "\x1b[4m", // underline
              });
            }
          } else {
            canvas.text(rect.x, rect.y + i, line);
          }
        }
      }
    },
  };

  // Build status line
  let statusText: string;
  if (state.contentSearchActive) {
    statusText = `/${state.contentSearch}`;
  } else {
    const pos = `${state.scrollY + 1}/${state.lines.length}`;
    const matchInfo = state.contentMatches.length > 0
      ? ` [${
        state.contentMatchIndex + 1
      }/${state.contentMatches.length} matches]`
      : "";
    const historyInfo = state.history.length > 0
      ? ` ← ${state.history.length} back`
      : "";
    statusText = `${pos}${matchInfo}${historyInfo}`;
  }

  const hints = state.keymap === "vim"
    ? "j/k scroll  g/G top/bottom  / search  n/N match  Enter follow  i info  Esc back"
    : "C-n/C-p scroll  M-</M-> top/bottom  C-s search  Enter follow  i info  C-g back";

  return Box({
    border: "rounded",
    borderColor: colors.fg.gray,
    title: titleBar.length > ctx.width - 4
      ? titleBar.slice(0, ctx.width - 7) + "…"
      : titleBar,
    child: Column([
      {
        component: ScrollBox({
          scrollY: state.scrollY,
          contentHeight: state.lines.length,
          border: "none",
          showScrollbar: true,
          child: rfcContent,
        }),
        flex: 1,
      },
      { component: Divider({ style: { fg: colors.fg.gray } }), height: 1 },
      {
        component: Row([
          {
            component: Text({
              content: statusText,
              style: { fg: colors.fg.cyan },
            }),
            flex: 1,
          },
          {
            component: Text({
              content: hints,
              style: { fg: colors.fg.gray },
              align: "right",
            }),
            flex: 2,
          },
        ]),
        height: 1,
      },
    ]),
  });
}
