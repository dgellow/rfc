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
} from "@dgellow/weew";
import type { RenderContext } from "@dgellow/weew";
import type { TuiState } from "../state.ts";

const STATUS_LABELS = [
  { key: null, label: "ALL" },
  { key: "INTERNET STANDARD", label: "STD" },
  { key: "PROPOSED STANDARD", label: "PROPOSED" },
  { key: "BEST CURRENT PRACTICE", label: "BCP" },
  { key: "INFORMATIONAL", label: "INFO" },
  { key: "EXPERIMENTAL", label: "EXP" },
  { key: "HISTORIC", label: "HIST" },
];

export function renderSearchScreen(
  state: TuiState,
  ctx: RenderContext,
): Component {
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

  const searchInput = TextInput({
    value: state.query,
    cursorPos: state.cursorPos,
    placeholder: "Search RFCs (title, keyword, author, number...)",
    focused: true,
    style: { fg: colors.fg.white },
  });

  const resultLines = buildResultLines(state, ctx.width);

  const resultList: Component = {
    render(canvas, rect) {
      for (let i = 0; i < resultLines.length && i < rect.height; i++) {
        const line = resultLines[i];
        const isSelected = i === state.selectedIndex;

        if (isSelected) {
          // Highlight row background
          canvas.fill(rect.x, rect.y + i, rect.width, 1, " ", {
            bg: colors.bg.hex("#1a3a5c"),
          });
        }

        // RFC number
        canvas.text(rect.x, rect.y + i, line.number, {
          fg: isSelected ? colors.fg.cyan : colors.fg.yellow,
          style: isSelected ? "\x1b[1m" : undefined,
        });

        // Title
        canvas.text(rect.x + 10, rect.y + i, line.title, {
          fg: isSelected ? colors.fg.white : undefined,
          bg: isSelected ? colors.bg.hex("#1a3a5c") : undefined,
        });

        // Status
        const statusX = rect.x + rect.width - 22;
        canvas.text(statusX, rect.y + i, line.status, {
          fg: statusColor(line.rawStatus),
          bg: isSelected ? colors.bg.hex("#1a3a5c") : undefined,
        });

        // Year
        canvas.text(rect.x + rect.width - 5, rect.y + i, line.year, {
          fg: colors.fg.gray,
          bg: isSelected ? colors.bg.hex("#1a3a5c") : undefined,
        });
      }
    },
  };

  const hints = state.keymap === "vim"
    ? "j/k navigate  Enter open  Tab filter  i info  ? help  q quit"
    : "C-n/C-p navigate  Enter open  Tab filter  i info  ? help  C-c quit";

  return Box({
    border: "rounded",
    borderColor: colors.fg.gray,
    title: "rfc",
    child: Column([
      { component: searchInput, height: 1 },
      { component: Text(""), height: 1 },
      { component: filterRow, height: 1 },
      { component: Divider({ style: { fg: colors.fg.gray } }), height: 1 },
      { component: resultList, flex: 1 },
      { component: Divider({ style: { fg: colors.fg.gray } }), height: 1 },
      {
        component: Text({ content: hints, style: { fg: colors.fg.gray } }),
        height: 1,
      },
    ]),
  });
}

interface ResultLine {
  number: string;
  title: string;
  status: string;
  rawStatus: string;
  year: string;
}

function buildResultLines(state: TuiState, width: number): ResultLine[] {
  const titleMaxWidth = width - 10 - 22 - 5 - 6;

  return state.results.map((r) => {
    const meta = r.meta;
    let title = meta.title;
    if (meta.obsoletedBy.length > 0) {
      title += ` (obsoleted)`;
    }
    if (title.length > titleMaxWidth) {
      title = title.slice(0, titleMaxWidth - 1) + "…";
    }

    return {
      number: `RFC ${meta.number}`,
      title,
      status: shortStatus(meta.status),
      rawStatus: meta.status,
      year: meta.date.year ? String(meta.date.year) : "",
    };
  });
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
      return status.slice(0, 12);
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "INTERNET STANDARD":
      return colors.fg.green;
    case "PROPOSED STANDARD":
      return colors.fg.blue;
    case "BEST CURRENT PRACTICE":
      return colors.fg.magenta;
    case "DRAFT STANDARD":
      return colors.fg.cyan;
    case "INFORMATIONAL":
      return colors.fg.yellow;
    case "EXPERIMENTAL":
      return colors.fg.red;
    case "HISTORIC":
      return colors.fg.gray;
    default:
      return colors.fg.gray;
  }
}
