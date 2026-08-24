import type { ColumnLookupResult, StemMatch } from './havenLabels';
import { RUN_FREQUENCIES_COMMAND, SHOW_ALL_VALUE_LABELS_COMMAND } from './commandIds';

export type OutputMode = 'short' | 'full';

/** The subset of a resolved reference `renderHoverContent` needs. Structurally compatible with `ResolvedReference`. */
export interface RenderHoverReference {
  dataframe: string;
  column: string;
  expressionUpToHere?: string;
}

export interface RenderHoverOptions {
  mode: OutputMode;
  /** Maximum number of value labels to show in `full` mode before truncating. */
  maxValueLabels: number;
  /** Maximum number of stem-matched columns to list before truncating. */
  maxStemMatches: number;
  /** Whether to append a "Run frequencies" link. */
  showRunFrequenciesLink: boolean;
}

const DEFAULT_MAX_STEM_MATCHES_SHOWN = 15;

/**
 * Pure function: turns a resolved reference + its {@link ColumnLookupResult}
 * into Markdown for the hover tooltip, or `undefined` if there's nothing
 * to show. No `vscode` dependency (only the plain string constants in
 * `commandIds.ts`), so it's unit-testable without an editor host.
 *
 * `lookup.kind === "none"` (column doesn't exist and isn't a valid stem)
 * always means no hover at all, regardless of settings.
 *
 * `"exact"` match, style loosely modeled on R's own `?function` help hover
 * (a bold title, then plain-text detail, then an italic section heading +
 * rule before a further breakdown):
 *
 * ```
 * **col**
 *
 * Respondent sex
 *
 * *Variable labels*
 *
 * ---
 *
 * - `1`: Male
 * - `2`: Female
 *
 * [*...and 8 more*](command:havenLabels.showAllValueLabels?...)
 *
 * [Run frequencies →](command:havenLabels.runFrequencies?...)
 * ```
 *
 * - `short` mode: bold column name + plain-text variable label (only if
 *   the column has one, even if it has value labels).
 * - `full` mode: also appends the "Variable labels" section, truncated to
 *   `maxValueLabels`.
 * - If there's no label, no value labels (in `full` mode), and
 *   `showRunFrequenciesLink` is off, there's nothing to show
 *   (`undefined`) even though the column genuinely exists.
 *
 * `"stem"` match -- `column` isn't a real column but matches one or more
 * via `y2clerk::stem()` -- renders a distinct hover listing each matched
 * column alongside its own variable label (if any), with a link to run
 * frequencies across the whole matched set:
 *
 * ```
 * **col** *(stem)*
 *
 * - `col_1`: First label
 * - `col_2`: Second label
 * - `col_3`
 *
 * [Run frequencies →](command:havenLabels.runFrequencies?...)
 * ```
 *
 * The match list is truncated to `maxStemMatches`, with a "...and N more"
 * note. With `showRunFrequenciesLink` off there is nothing else a stem
 * match can show, so the result is `undefined`.
 *
 * The caller (`hoverProvider.ts`) must construct the `Hover`'s
 * `MarkdownString` with `isTrusted` scoped to allow
 * {@link SHOW_ALL_VALUE_LABELS_COMMAND} and {@link RUN_FREQUENCIES_COMMAND},
 * or these links will render inert.
 */
export function renderHoverContent(
  reference: RenderHoverReference,
  lookup: ColumnLookupResult,
  options: RenderHoverOptions,
): string | undefined {
  if (lookup.kind === 'none') {
    return undefined;
  }
  if (lookup.kind === 'stem') {
    return renderStemHover(reference, lookup.matches, options);
  }
  return renderExactHover(reference, lookup, options);
}

function renderExactHover(
  reference: RenderHoverReference,
  lookup: Extract<ColumnLookupResult, { kind: 'exact' }>,
  options: RenderHoverOptions,
): string | undefined {
  const hasLabel = !!lookup.label;
  const hasValueLabels = options.mode === 'full' && lookup.valueLabels.length > 0;

  if (!hasLabel && !hasValueLabels && !options.showRunFrequenciesLink) {
    return undefined;
  }

  const sections = [`**${escapeMarkdown(reference.column)}**`];

  if (hasLabel) {
    sections.push(escapeMarkdown(lookup.label!));
  }

  if (hasValueLabels) {
    sections.push(
      [
        '*Variable labels*',
        '',
        '---',
        '',
        renderValueLabelsList(reference.dataframe, reference.column, lookup.valueLabels, options.maxValueLabels),
      ].join('\n'),
    );
  }

  if (options.showRunFrequenciesLink) {
    sections.push(renderRunFrequenciesLink(reference, reference.column));
  }

  return sections.join('\n\n');
}

function renderStemHover(
  reference: RenderHoverReference,
  matches: StemMatch[],
  options: RenderHoverOptions,
): string | undefined {
  // A stem match's only content *is* the run-frequencies-style action --
  // without it, there's nothing left to show.
  if (!options.showRunFrequenciesLink) {
    return undefined;
  }

  const limit =
    Number.isInteger(options.maxStemMatches) && options.maxStemMatches > 0
      ? options.maxStemMatches
      : DEFAULT_MAX_STEM_MATCHES_SHOWN;
  const shown = matches.slice(0, limit);
  const remaining = matches.length - shown.length;
  const items = shown
    .map((m) => (m.label ? `- \`${m.name}\`: ${escapeMarkdown(m.label)}` : `- \`${m.name}\``))
    .join('\n');
  const matchesBlock = remaining > 0 ? `${items}\n\n*...and ${remaining} more*` : items;

  const column = escapeMarkdown(reference.column);
  const selectorExpression = `y2clerk::stem("${reference.column}")`;
  const link = renderRunFrequenciesLink(reference, selectorExpression);

  return [`**${column}** *(stem)*`, matchesBlock, link].join('\n\n');
}

function renderValueLabelsList(
  dataframe: string,
  column: string,
  valueLabels: ValueLabel[],
  maxValueLabels: number,
): string {
  const limit = Number.isInteger(maxValueLabels) && maxValueLabels > 0 ? maxValueLabels : 10;
  const shown = valueLabels.slice(0, limit);
  const remaining = valueLabels.length - shown.length;

  // The value sits inside a code span, where markdown-escaping isn't
  // needed (and would show literal backslashes) -- values are always
  // simple numeric/string codes in practice, never containing a backtick.
  const items = shown.map((vl) => `- \`${vl.value}\`: ${escapeMarkdown(vl.label)}`).join('\n');

  if (remaining === 0) {
    return items;
  }

  const args = encodeURIComponent(JSON.stringify([dataframe, column]));
  const commandUri = `command:${SHOW_ALL_VALUE_LABELS_COMMAND}?${args}`;
  return `${items}\n\n[*...and ${remaining} more*](${commandUri})`;
}

function renderRunFrequenciesLink(
  reference: RenderHoverReference,
  selectorExpression: string,
  linkText = 'Run frequencies \u2192',
): string {
  const args = encodeURIComponent(JSON.stringify([reference.dataframe, selectorExpression, reference.expressionUpToHere]));
  const commandUri = `command:${RUN_FREQUENCIES_COMMAND}?${args}`;
  return `[${linkText}](${commandUri})`;
}

function escapeMarkdown(text: string): string {
  // Only escape characters that could actually change rendering of inline
  // label text (bold/italic/code/links) -- not `.`/`-`/`()` etc., which are
  // only special at the start of a line (headers, lists) and would just
  // clutter ordinary labels with unnecessary backslashes.
  return text.replace(/([\\`*_[\]])/g, '\\$1');
}

type ValueLabel = Extract<ColumnLookupResult, { kind: 'exact' }>['valueLabels'][number];
