import type { HavenColumnInfo } from './havenLabels';

export type OutputMode = 'short' | 'full';

export interface RenderHoverOptions {
  mode: OutputMode;
  /** Maximum number of value labels to show in `full` mode before truncating. */
  maxValueLabels: number;
}

/**
 * Pure function: turns resolved haven column info into Markdown for the
 * hover tooltip, or `undefined` if there's nothing to show. No `vscode`
 * dependency, so it's unit-testable without an editor host.
 *
 * - `short` mode: just the variable label (today's behavior), or nothing if
 *   the column has no `label` attribute (even if it has value labels).
 * - `full` mode: the variable label (if any), followed by a Markdown table
 *   of value labels (if any), truncated to `maxValueLabels` with a
 *   "...and N more" note.
 */
export function renderHoverContent(info: HavenColumnInfo, options: RenderHoverOptions): string | undefined {
  if (options.mode === 'short') {
    return info.label ? `**Haven label:** ${escapeMarkdown(info.label)}` : undefined;
  }

  const sections: string[] = [];

  if (info.label) {
    sections.push(`**${escapeMarkdown(info.label)}**`);
  }

  if (info.valueLabels.length > 0) {
    sections.push(renderValueLabelsTable(info.valueLabels, options.maxValueLabels));
  }

  return sections.length > 0 ? sections.join('\n\n') : undefined;
}

function renderValueLabelsTable(valueLabels: HavenColumnInfo['valueLabels'], maxValueLabels: number): string {
  const limit = Number.isInteger(maxValueLabels) && maxValueLabels > 0 ? maxValueLabels : 10;
  const shown = valueLabels.slice(0, limit);
  const remaining = valueLabels.length - shown.length;

  const rows = shown.map((vl) => `| ${escapeMarkdownTableCell(String(vl.value))} | ${escapeMarkdownTableCell(vl.label)} |`);

  const table = ['| Value | Label |', '|---|---|', ...rows].join('\n');

  return remaining > 0 ? `${table}\n\n*...and ${remaining} more*` : table;
}

function escapeMarkdown(text: string): string {
  // Only escape characters that could actually change rendering of inline
  // label text (bold/italic/code/links) -- not `.`/`-`/`()` etc., which are
  // only special at the start of a line (headers, lists) and would just
  // clutter ordinary labels with unnecessary backslashes.
  return text.replace(/([\\`*_[\]])/g, '\\$1');
}

function escapeMarkdownTableCell(text: string): string {
  return escapeMarkdown(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
