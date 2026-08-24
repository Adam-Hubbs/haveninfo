// providers/havenLabels.ts
import * as vscode from 'vscode';
import { tryAcquirePositronApi } from '@posit-dev/positron';
import { Logger } from '../utils/logger';

/**
 * `resolveReference` only ever emits identifiers/strings pulled from real
 * AST nodes, which already rules out most injection concerns -- but since
 * we still interpolate these into R source text, double-check they look
 * like plain R identifiers (or dotted names) before doing so, as
 * defense-in-depth against a future extractor bug.
 */
const R_IDENTIFIER = /^[.a-zA-Z][.a-zA-Z0-9_]*$/;

/**
 * Internal safety cap on how many value labels we ever ask R to serialize
 * and send back, independent of the user-facing `havenLabels.maxValueLabels`
 * *display* cutoff (applied later, at render time, in `renderHoverContent`).
 * This just protects against a pathological labelled vector with thousands
 * of codes turning a hover into a large payload.
 */
const MAX_VALUE_LABELS_FETCHED = 500;

export interface ValueLabel {
  value: string | number;
  label: string;
}

export interface HavenColumnInfo {
  /** The variable-level `label` attribute, if the column has one. */
  label?: string;
  /** The value-level `labels` attribute (code -> label), if any, in the order R reports them. */
  valueLabels: ValueLabel[];
}

class HavenLabelsProvider {
  /**
   * Looks up haven metadata (`label` attribute and/or the `labels`
   * value-label map) for `dataframe[[column]]`, if any, by silently
   * evaluating a small R snippet in the user's own R session. Returns
   * `undefined` when the column isn't `haven::labelled` at all, or when
   * lookup fails for any reason.
   *
   * Silent and non-interrupting by design:
   *  - Uses `positron.runtime.evaluateCode`, which Positron documents as
   *    evaluating "silently ... without displaying output in the console or
   *    notifying the user" -- unlike `executeCode`, nothing is echoed to the
   *    console or run through the normal interactive-execution UI.
   *  - Only queries a session that's already running; never starts one just
   *    because the user hovered over some text (`evaluateCode`/`executeCode`
   *    will auto-start a session if none exists, which we deliberately avoid
   *    triggering from a hover).
   *  - Every failure mode (no Positron API, no R session, R-side error,
   *    missing `haven` package, non-existent dataframe/column, cancellation)
   *    resolves to `undefined` rather than throwing or surfacing anything to
   *    the user -- a hover that can't resolve anything should just show
   *    nothing, never an error.
   */
  async getDataFrameColumnInfo(
    dataframe: string,
    column: string,
    cancellationToken?: vscode.CancellationToken,
  ): Promise<HavenColumnInfo | undefined> {
    if (!R_IDENTIFIER.test(dataframe) || !R_IDENTIFIER.test(column)) {
      return undefined;
    }

    const positron = tryAcquirePositronApi();
    if (!positron) {
      return undefined;
    }

    const session = await positron.runtime.getForegroundSession();
    if (!session || session.runtimeMetadata.languageId !== 'r') {
      return undefined;
    }

    const code = buildColumnInfoLookupCode(dataframe, column);

    try {
      const { result } = await positron.runtime.evaluateCode(
        'r',
        code,
        cancellationToken,
        session.metadata.sessionId,
      );
      return parseColumnInfoResult(result);
    } catch (error) {
      Logger.debug(`Haven info lookup for ${dataframe}$${column} failed`, error);
      return undefined;
    }
  }
}

function buildColumnInfoLookupCode(dataframe: string, column: string): string {
  // Guarded end-to-end in R too (not just relying on the TS-side identifier
  // check): a missing dataframe/column, a non-data-frame value, a missing
  // `haven` package, or any other error all fall through to `NULL`, which
  // `evaluateCode` reports back as a non-object `result` -- never an R-level
  // error, so nothing is ever printed to the console.
  return `
(function() {
  tryCatch({
    if (!exists("${dataframe}")) return(NULL)
    df <- get("${dataframe}")
    if (!is.data.frame(df)) return(NULL)
    if (!("${column}" %in% names(df))) return(NULL)
    col <- df[["${column}"]]
    if (!haven::is.labelled(col)) return(NULL)

    label <- attr(col, "label", exact = TRUE)
    value_labels <- attr(col, "labels", exact = TRUE)

    codes <- list()
    if (!is.null(value_labels)) {
      n <- min(length(value_labels), ${MAX_VALUE_LABELS_FETCHED})
      if (n > 0) {
        codes <- lapply(seq_len(n), function(i) {
          list(value = unname(value_labels[[i]]), label = names(value_labels)[[i]])
        })
      }
    }

    list(
      label = if (is.null(label)) NULL else as.character(label),
      valueLabels = codes
    )
  }, error = function(e) NULL)
})()
  `.trim();
}

function parseColumnInfoResult(result: unknown): HavenColumnInfo | undefined {
  if (typeof result !== 'object' || result === null) {
    return undefined;
  }

  const { label, valueLabels } = result as Record<string, unknown>;

  const parsedValueLabels: ValueLabel[] = [];
  if (Array.isArray(valueLabels)) {
    for (const entry of valueLabels) {
      if (
        typeof entry === 'object' &&
        entry !== null &&
        (typeof (entry as Record<string, unknown>).value === 'string' ||
          typeof (entry as Record<string, unknown>).value === 'number') &&
        typeof (entry as Record<string, unknown>).label === 'string'
      ) {
        const e = entry as Record<string, unknown>;
        parsedValueLabels.push({ value: e.value as string | number, label: e.label as string });
      }
    }
  }

  const parsedLabel = typeof label === 'string' ? label : undefined;

  if (parsedLabel === undefined && parsedValueLabels.length === 0) {
    return undefined;
  }

  return { label: parsedLabel, valueLabels: parsedValueLabels };
}

const HavenLabels = new HavenLabelsProvider();
export default HavenLabels;
