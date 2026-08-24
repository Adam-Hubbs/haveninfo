// providers/havenLabels.ts
import * as vscode from 'vscode';
import { tryAcquirePositronApi } from '@posit-dev/positron';
import { Logger } from '../utils/logger';
import { isValidRIdentifier } from '../utils/rIdentifier';

/**
 * Internal safety caps on how much data we ever ask R to serialize and
 * send back, independent of user-facing *display* cutoffs (applied later,
 * at render time, in `renderHoverContent.ts`). These just protect against
 * a pathological labelled vector or stem match turning a hover into a
 * large payload.
 */
const MAX_VALUE_LABELS_FETCHED = 500;
const MAX_STEM_MATCHES_FETCHED = 50;

export interface ValueLabel {
  value: string | number;
  label: string;
}

/**
 * What a `dataframe`/`column` reference turned out to be, on the R side:
 *  - `"exact"`: `column` is a real column of `dataframe`. `label`/`valueLabels`
 *    carry its haven metadata, if any -- both may be absent/empty for a
 *    genuinely existing but unlabelled column.
 *  - `"stem"`: `column` isn't a real column, but is a valid stem prefix
 *    (per `y2clerk::stem()`, a tidyselect helper for "battery" variable
 *    sets like `Q1_1`, `Q1_2`, ...) matching one or more real columns,
 *    listed in `matches` along with each matched column's own variable
 *    `label` (if any). Only ever detected when `y2clerk` (and its
 *    `tidyselect` dependency) are installed; otherwise this degrades
 *    gracefully to `"none"` rather than erroring -- there is no
 *    interruptive prompt from the passive hover path (contrast
 *    `y2clerkAvailability.ts`'s prompt, used for the explicit "Run
 *    frequencies" action instead).
 *  - `"none"`: neither -- callers should show no hover at all.
 */
export interface StemMatch {
  name: string;
  label?: string;
}

export type ColumnLookupResult =
  | { kind: 'exact'; label?: string; valueLabels: ValueLabel[] }
  | { kind: 'stem'; matches: StemMatch[] }
  | { kind: 'none' };

const NONE_RESULT: ColumnLookupResult = { kind: 'none' };

class HavenLabelsProvider {
  /**
   * Looks up what `column` refers to in `dataframe` -- see
   * {@link ColumnLookupResult} -- via a single silently evaluated R
   * snippet in the user's own R session (deliberately bundled into one
   * round trip covering both the exact-match and stem-match cases, rather
   * than querying twice).
   *
   * Silent and non-interrupting by design:
   *  - Uses `positron.runtime.evaluateCode`, which Positron documents as
   *    evaluating "silently ... without displaying output in the console or
   *    notifying the user" -- unlike `executeCode`, nothing is echoed to the
   *    console or run through the normal interactive-execution UI.
   *  - Only queries a session that's already running; never starts one just
   *    because the user hovered over some text.
   *  - Every failure mode (no Positron API, no R session, R-side error,
   *    missing `haven`/`y2clerk` package, non-existent dataframe/column,
   *    cancellation) resolves to `{ kind: "none" }` rather than throwing or
   *    surfacing anything to the user -- a hover that can't resolve
   *    anything should just show nothing, never an error.
   */
  async lookupColumn(
    dataframe: string,
    column: string,
    cancellationToken?: vscode.CancellationToken,
  ): Promise<ColumnLookupResult> {
    if (!isValidRIdentifier(dataframe) || !isValidRIdentifier(column)) {
      return NONE_RESULT;
    }

    const positron = tryAcquirePositronApi();
    if (!positron) {
      return NONE_RESULT;
    }

    const session = await positron.runtime.getForegroundSession();
    if (!session || session.runtimeMetadata.languageId !== 'r') {
      return NONE_RESULT;
    }

    const code = buildColumnLookupCode(dataframe, column);

    try {
      const { result } = await positron.runtime.evaluateCode(
        'r',
        code,
        cancellationToken,
        session.metadata.sessionId,
      );
      return parseColumnLookupResult(result);
    } catch (error) {
      Logger.debug(`Column lookup for ${dataframe}$${column} failed`, error);
      return NONE_RESULT;
    }
  }
}

function buildColumnLookupCode(dataframe: string, column: string): string {
  // Every branch/guard falls through to `list(kind = "none")` rather than
  // an R-level error, so nothing is ever printed to the console.
  //
  // `y2clerk::stem()` is a tidyselect helper -- it can't be called
  // directly, only evaluated in a selecting context. `tidyselect::eval_select()`
  // gives us that context without needing dplyr: y2clerk depends on
  // tidyselect for stem() to work at all, so if `requireNamespace("y2clerk")`
  // succeeds, tidyselect is guaranteed to be installed too.
  return `
(function() {
  tryCatch({
    if (!exists("${dataframe}")) return(list(kind = "none"))
    df <- get("${dataframe}")
    if (!is.data.frame(df)) return(list(kind = "none"))

    if ("${column}" %in% names(df)) {
      col <- df[["${column}"]]
      label <- NULL
      value_labels <- list()
      if (haven::is.labelled(col)) {
        lbl <- attr(col, "label", exact = TRUE)
        if (!is.null(lbl)) label <- as.character(lbl)
        vl <- attr(col, "labels", exact = TRUE)
        if (!is.null(vl)) {
          n <- min(length(vl), ${MAX_VALUE_LABELS_FETCHED})
          if (n > 0) {
            value_labels <- lapply(seq_len(n), function(i) {
              list(value = unname(vl[[i]]), label = names(vl)[[i]])
            })
          }
        }
      }
      return(list(kind = "exact", label = label, valueLabels = value_labels))
    }

    if (requireNamespace("y2clerk", quietly = TRUE) && requireNamespace("tidyselect", quietly = TRUE)) {
      matched <- tryCatch(
        names(tidyselect::eval_select(quote(y2clerk::stem("${column}")), data = df)),
        error = function(e) character(0)
      )
      if (length(matched) > 0) {
        n <- min(length(matched), ${MAX_STEM_MATCHES_FETCHED})
        matched <- matched[seq_len(n)]
        match_info <- lapply(matched, function(nm) {
          mcol <- df[[nm]]
          mlabel <- NULL
          if (haven::is.labelled(mcol)) {
            l <- attr(mcol, "label", exact = TRUE)
            if (!is.null(l)) mlabel <- as.character(l)
          }
          list(name = nm, label = mlabel)
        })
        return(list(kind = "stem", matches = match_info))
      }
    }

    list(kind = "none")
  }, error = function(e) list(kind = "none"))
})()
  `.trim();
}

function parseColumnLookupResult(result: unknown): ColumnLookupResult {
  if (typeof result !== 'object' || result === null) {
    return NONE_RESULT;
  }
  const record = result as Record<string, unknown>;

  if (record.kind === 'exact') {
    return {
      kind: 'exact',
      label: typeof record.label === 'string' ? record.label : undefined,
      valueLabels: parseValueLabels(record.valueLabels),
    };
  }

  if (record.kind === 'stem') {
    const matches = Array.isArray(record.matches)
      ? record.matches.map(parseStemMatch).filter((m): m is StemMatch => m !== undefined)
      : [];
    return matches.length > 0 ? { kind: 'stem', matches } : NONE_RESULT;
  }

  return NONE_RESULT;
}

function parseStemMatch(value: unknown): StemMatch | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const { name, label } = value as Record<string, unknown>;
  if (typeof name !== 'string') {
    return undefined;
  }
  return { name, label: typeof label === 'string' ? label : undefined };
}

function parseValueLabels(valueLabels: unknown): ValueLabel[] {
  const parsed: ValueLabel[] = [];
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
        parsed.push({ value: e.value as string | number, label: e.label as string });
      }
    }
  }
  return parsed;
}

const HavenLabels = new HavenLabelsProvider();
export default HavenLabels;
