import { Box, colors, type Component } from "@dgellow/weew";
import type { TuiState } from "../state.ts";
import { getRfc } from "../../data/db.ts";
import type { Database } from "@db/sqlite";

export function renderInfoPanel(
  state: TuiState,
  db: Database | null,
): Component | null {
  const number = state.screen === "search"
    ? state.results[state.selectedIndex]?.meta.number
    : state.currentRfc;

  if (!number || !db) return null;

  const meta = getRfc(db, number);
  if (!meta) return null;

  const fields: { label: string; value: string; color?: string }[] = [
    { label: "Title", value: meta.title },
    {
      label: "Authors",
      value: meta.authors.join(", ") || "Unknown",
    },
    {
      label: "Date",
      value: `${meta.date.month} ${meta.date.year}`,
    },
    {
      label: "Status",
      value: meta.status,
      color: statusInfoColor(meta.status),
    },
    { label: "Stream", value: meta.stream },
  ];

  if (meta.wg) fields.push({ label: "WG", value: meta.wg });
  if (meta.area) fields.push({ label: "Area", value: meta.area });
  fields.push({ label: "Pages", value: String(meta.pageCount) });

  if (meta.keywords.length) {
    fields.push({ label: "Keywords", value: meta.keywords.join(", ") });
  }

  if (meta.obsoletes.length) {
    fields.push({
      label: "Obsoletes",
      value: meta.obsoletes.map((n) => `RFC ${n}`).join(", "),
    });
  }
  if (meta.obsoletedBy.length) {
    fields.push({
      label: "Obsoleted by",
      value: meta.obsoletedBy.map((n) => `RFC ${n}`).join(", "),
      color: colors.fg.red,
    });
  }
  if (meta.updates.length) {
    fields.push({
      label: "Updates",
      value: meta.updates.map((n) => `RFC ${n}`).join(", "),
    });
  }
  if (meta.updatedBy.length) {
    fields.push({
      label: "Updated by",
      value: meta.updatedBy.map((n) => `RFC ${n}`).join(", "),
    });
  }

  const infoContent: Component = {
    render(canvas, rect) {
      let y = 0;
      const labelWidth = 12;

      for (const field of fields) {
        if (y >= rect.height) break;

        // Label
        const label = field.label.padEnd(labelWidth);
        canvas.text(rect.x, rect.y + y, label, {
          fg: colors.fg.hex("#888888"),
        });

        // Value — word wrap if needed
        const valueWidth = rect.width - labelWidth;
        const valueLines = wrapValue(field.value, valueWidth);
        for (let i = 0; i < valueLines.length; i++) {
          if (y >= rect.height) break;
          canvas.text(rect.x + labelWidth, rect.y + y, valueLines[i], {
            fg: field.color ?? colors.fg.white,
            style: i === 0 && field.label === "Title" ? "\x1b[1m" : undefined,
          });
          y++;
        }
      }

      // Abstract with separator
      if (meta.abstract && y < rect.height - 2) {
        y++;
        if (y < rect.height) {
          canvas.text(rect.x, rect.y + y, "Abstract", {
            fg: colors.fg.hex("#888888"),
          });
          y++;

          const abstractLines = wrapValue(meta.abstract, rect.width);
          for (const line of abstractLines) {
            if (y >= rect.height) break;
            canvas.text(rect.x, rect.y + y, line, {
              fg: colors.fg.hex("#aaaaaa"),
              style: "\x1b[2m",
            });
            y++;
          }
        }
      }
    },
  };

  return Box({
    border: "single",
    borderColor: colors.fg.hex("#555555"),
    title: `RFC ${number}`,
    fill: " ",
    style: { bg: colors.bg.hex("#111111") },
    padding: { top: 0, right: 1, bottom: 0, left: 1 },
    child: infoContent,
  });
}

function wrapValue(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const lines: string[] = [];
  const words = text.split(/\s+/);
  let current = "";

  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  return lines.length > 0 ? lines : [""];
}

function statusInfoColor(status: string): string {
  switch (status) {
    case "INTERNET STANDARD":
      return colors.fg.green;
    case "PROPOSED STANDARD":
      return colors.fg.hex("#5599ff");
    case "BEST CURRENT PRACTICE":
      return colors.fg.magenta;
    case "INFORMATIONAL":
      return colors.fg.hex("#bb8833");
    case "EXPERIMENTAL":
      return colors.fg.hex("#cc5544");
    case "HISTORIC":
      return colors.fg.hex("#666666");
    default:
      return colors.fg.white;
  }
}
