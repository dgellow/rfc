import { Box, colors, type Component } from "@dgellow/weew";
import type { TuiState } from "../state.ts";
import { getRfc } from "../../data/db.ts";
import { Database } from "@db/sqlite";

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

  const lines: { label: string; value: string }[] = [
    { label: "Title", value: meta.title },
    { label: "Authors", value: meta.authors.join(", ") || "Unknown" },
    { label: "Date", value: `${meta.date.month} ${meta.date.year}` },
    { label: "Status", value: meta.status },
    { label: "Stream", value: meta.stream },
  ];

  if (meta.wg) lines.push({ label: "WG", value: meta.wg });
  if (meta.area) lines.push({ label: "Area", value: meta.area });
  lines.push({ label: "Pages", value: String(meta.pageCount) });

  if (meta.keywords.length) {
    lines.push({ label: "Keywords", value: meta.keywords.join(", ") });
  }

  if (meta.obsoletes.length) {
    lines.push({
      label: "Obsoletes",
      value: meta.obsoletes.map((n) => `RFC ${n}`).join(", "),
    });
  }
  if (meta.obsoletedBy.length) {
    lines.push({
      label: "Obsoleted by",
      value: meta.obsoletedBy.map((n) => `RFC ${n}`).join(", "),
    });
  }
  if (meta.updates.length) {
    lines.push({
      label: "Updates",
      value: meta.updates.map((n) => `RFC ${n}`).join(", "),
    });
  }
  if (meta.updatedBy.length) {
    lines.push({
      label: "Updated by",
      value: meta.updatedBy.map((n) => `RFC ${n}`).join(", "),
    });
  }

  if (meta.abstract) {
    lines.push({ label: "", value: "" });
    lines.push({ label: "Abstract", value: meta.abstract });
  }

  const infoContent: Component = {
    render(canvas, rect) {
      let y = 0;
      for (const line of lines) {
        if (y >= rect.height) break;

        if (line.label) {
          const labelText = `${line.label}: `;
          canvas.text(rect.x, rect.y + y, labelText, {
            fg: colors.fg.cyan,
            style: "\x1b[1m",
          });

          const valueWidth = rect.width - labelText.length;
          const value = line.value.length > valueWidth
            ? line.value.slice(0, valueWidth - 1) + "…"
            : line.value;
          canvas.text(rect.x + labelText.length, rect.y + y, value);
        }
        y++;
      }
    },
  };

  return Box({
    border: "rounded",
    borderColor: colors.fg.cyan,
    title: `RFC ${number}`,
    padding: { top: 0, right: 1, bottom: 0, left: 1 },
    child: infoContent,
  });
}
