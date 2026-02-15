import {
  Badge,
  Box,
  colors,
  Column,
  type Component,
  Divider,
  Row,
  Text,
  TextInput,
  VirtualList,
} from "@dgellow/weew";
import type { RenderContext } from "@dgellow/weew";
import type { SortOrder, TuiState } from "../state.ts";
import type { SearchResult } from "../../types.ts";

const STATUS_LABELS = [
  { key: null, label: "ALL" },
  { key: "INTERNET STANDARD", label: "STD" },
  { key: "PROPOSED STANDARD", label: "PROPOSED" },
  { key: "BEST CURRENT PRACTICE", label: "BCP" },
  { key: "INFORMATIONAL", label: "INFO" },
  { key: "EXPERIMENTAL", label: "EXP" },
  { key: "HISTORIC", label: "HIST" },
];

function sortLabel(order: SortOrder): string {
  switch (order) {
    case "number_desc":
      return "#\u2193";
    case "number_asc":
      return "#\u2191";
    case "date":
      return "date";
    case "relevance":
      return "rank";
  }
}

export function renderSearchScreen(
  state: TuiState,
  _ctx: RenderContext,
): Component {
  // Filter badges
  const filterRow = Row(
    STATUS_LABELS.map((f) => ({
      component: Badge({
        text: f.label,
        style: {
          fg: state.statusFilter === f.key ? colors.fg.black : colors.fg.gray,
          bg: state.statusFilter === f.key ? colors.bg.cyan : undefined,
          bold: state.statusFilter === f.key,
        },
      }),
      width: f.label.length + 2,
    })),
    { gap: 1 },
  );

  // Sort indicator
  const sortText = `sort: ${sortLabel(state.sortOrder)}`;

  // Search bar — different appearance when active vs inactive
  let searchBar: Component;
  if (state.searchActive) {
    searchBar = Row([
      {
        component: Text({
          content: "/",
          style: { fg: colors.fg.cyan, bold: true },
        }),
        width: 1,
      },
      {
        component: TextInput({
          value: state.query,
          cursorPos: state.cursorPos,
          placeholder:
            "author:fielding  status:standard  wg:httpbis  year:2022",
          focused: true,
          style: { fg: colors.fg.white },
        }),
        flex: 1,
      },
    ]);
  } else if (state.query) {
    // Show current query, dimmed
    searchBar = Row([
      {
        component: Text({
          content: `/ ${state.query}`,
          style: { fg: colors.fg.hex("#888888") },
        }),
        flex: 1,
      },
      {
        component: Text({
          content: sortText,
          style: { fg: colors.fg.hex("#555555"), dim: true },
          align: "right",
        }),
        width: sortText.length,
      },
    ]);
  } else {
    searchBar = Row([
      {
        component: Text({
          content: "/ to search",
          style: { fg: colors.fg.hex("#555555") },
        }),
        flex: 1,
      },
      {
        component: Text({
          content: sortText,
          style: { fg: colors.fg.hex("#555555"), dim: true },
          align: "right",
        }),
        width: sortText.length,
      },
    ]);
  }

  // Result count
  const countText = state.totalMatches > 0
    ? state.results.length < state.totalMatches
      ? `${state.results.length} of ${state.totalMatches.toLocaleString()}`
      : `${state.totalMatches.toLocaleString()}`
    : "";

  const resultList: Component = state.results.length === 0
    ? {
      render(canvas, rect) {
        const msg = state.query ? "No results" : "/ to search";
        const msgY = Math.floor(rect.height / 3);
        const msgX = Math.floor((rect.width - msg.length) / 2);
        canvas.text(rect.x + Math.max(0, msgX), rect.y + msgY, msg, {
          fg: colors.fg.hex("#555555"),
        });
      },
    }
    : VirtualList<SearchResult>({
      items: state.results,
      selected: state.selectedIndex,
      scrollY: state.listOffset,
      itemHeight: 1,
      border: "none",
      showScrollbar: true,
      renderItem: (result, _index, isSelected) =>
        renderResultItem(result, isSelected),
    });

  // Hints change based on mode
  let hints: string;
  if (state.searchActive) {
    hints = "Enter confirm  Esc cancel";
  } else if (state.keymap === "vim") {
    hints =
      "j/k \u2195  Enter open  / search  s sort  Tab filter  i info  ? help  K keymap  q quit";
  } else {
    hints =
      "C-n/C-p \u2195  Enter open  C-s search  s sort  Tab filter  i info  ? help  K keymap  C-c quit";
  }

  // Title with count
  const title = countText ? `rfc \u2014 ${countText}` : "rfc";

  return Box({
    border: "rounded",
    borderColor: state.searchActive ? colors.fg.cyan : colors.fg.hex("#444444"),
    title,
    child: Column([
      { component: searchBar, height: 1 },
      { component: filterRow, height: 1 },
      {
        component: Divider({
          char: "\u2500",
          style: {
            fg: colors.fg.hex("#333333"),
          },
        }),
        height: 1,
      },
      { component: resultList, flex: 1 },
      {
        component: Divider({
          char: "\u2500",
          style: {
            fg: colors.fg.hex("#333333"),
          },
        }),
        height: 1,
      },
      {
        component: Text({
          content: hints,
          style: { fg: colors.fg.hex("#555555") },
        }),
        height: 1,
      },
    ]),
  });
}

/** Ensure selectedIndex is visible within the list viewport */
export function adjustListOffset(
  state: TuiState,
  listHeight: number,
): TuiState {
  let { listOffset, selectedIndex } = state;

  if (selectedIndex < listOffset) {
    listOffset = selectedIndex;
  } else if (selectedIndex >= listOffset + listHeight) {
    listOffset = selectedIndex - listHeight + 1;
  }

  listOffset = Math.max(0, listOffset);

  if (listOffset !== state.listOffset) {
    return { ...state, listOffset };
  }
  return state;
}

function renderResultItem(
  result: SearchResult,
  isSelected: boolean,
): Component {
  return {
    render(canvas, rect) {
      const meta = result.meta;
      const obsoleted = meta.obsoletedBy.length > 0;
      const titleMaxWidth = rect.width - 2 - 10 - 18 - 6 - 4;
      let title = meta.title;
      if (title.length > titleMaxWidth) {
        title = title.slice(0, titleMaxWidth - 1) + "\u2026";
      }
      const numberStr = String(meta.number);
      const status = shortStatus(meta.status);
      const year = meta.date.year ? String(meta.date.year) : "    ";

      if (isSelected) {
        canvas.fill(rect.x, rect.y, rect.width, 1, " ", {
          bg: colors.bg.hex("#1a3a5c"),
        });
      }

      if (isSelected) {
        canvas.text(rect.x, rect.y, "\u203a ", {
          fg: colors.fg.cyan,
          bg: colors.bg.hex("#1a3a5c"),
        });
      }

      const numX = rect.x + 2;
      canvas.text(numX, rect.y, "RFC ", {
        fg: isSelected ? colors.fg.hex("#5599bb") : colors.fg.hex("#666666"),
        bg: isSelected ? colors.bg.hex("#1a3a5c") : undefined,
      });
      canvas.text(numX + 4, rect.y, numberStr, {
        fg: isSelected ? colors.fg.cyan : colors.fg.yellow,
        bg: isSelected ? colors.bg.hex("#1a3a5c") : undefined,
        style: isSelected ? "\x1b[1m" : undefined,
      });

      const titleX = numX + 10;
      canvas.text(titleX, rect.y, title, {
        fg: isSelected
          ? colors.fg.white
          : obsoleted
          ? colors.fg.gray
          : undefined,
        bg: isSelected ? colors.bg.hex("#1a3a5c") : undefined,
        style: obsoleted ? "\x1b[9m" : undefined,
      });

      if (obsoleted && !isSelected) {
        const marker = " (obsoleted)";
        const markerX = titleX + title.length;
        if (markerX + marker.length < rect.x + rect.width - 22) {
          canvas.text(markerX, rect.y, marker, {
            fg: colors.fg.hex("#664444"),
          });
        }
      }

      const statusX = rect.x + rect.width - 18;
      canvas.text(statusX, rect.y, status.padStart(10), {
        fg: statusColor(meta.status),
        bg: isSelected ? colors.bg.hex("#1a3a5c") : undefined,
        style: "\x1b[2m",
      });

      canvas.text(rect.x + rect.width - 6, rect.y, year, {
        fg: isSelected ? colors.fg.hex("#888888") : colors.fg.hex("#555555"),
        bg: isSelected ? colors.bg.hex("#1a3a5c") : undefined,
      });
    },
  };
}

function shortStatus(status: string): string {
  switch (status) {
    case "INTERNET STANDARD":
      return "STANDARD";
    case "PROPOSED STANDARD":
      return "PROPOSED";
    case "BEST CURRENT PRACTICE":
      return "BCP";
    case "DRAFT STANDARD":
      return "DRAFT STD";
    case "INFORMATIONAL":
      return "INFO";
    case "EXPERIMENTAL":
      return "EXP";
    case "HISTORIC":
      return "HISTORIC";
    default:
      return status.slice(0, 10);
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "INTERNET STANDARD":
      return colors.fg.green;
    case "PROPOSED STANDARD":
      return colors.fg.hex("#5599ff");
    case "BEST CURRENT PRACTICE":
      return colors.fg.magenta;
    case "DRAFT STANDARD":
      return colors.fg.cyan;
    case "INFORMATIONAL":
      return colors.fg.hex("#bb8833");
    case "EXPERIMENTAL":
      return colors.fg.hex("#cc5544");
    case "HISTORIC":
      return colors.fg.hex("#555555");
    default:
      return colors.fg.hex("#555555");
  }
}
