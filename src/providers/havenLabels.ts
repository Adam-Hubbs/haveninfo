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

class HavenLabelsProvider {
  /**
   * Looks up the haven `label` attribute of `dataframe[[column]]`, if any,
   * by silently evaluating a small R snippet in the user's own R session.
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
   *  resolves to `undefined` rather than throwing or surfacing anything to
   *    the user -- a hover that can't resolve a label should just show
   *    nothing, never an error.
   */
  async getDataFrameColumnLabel(
    dataframe: string,
    column: string,
    cancellationToken?: vscode.CancellationToken,
  ): Promise<string | undefined> {
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

    const code = buildLabelLookupCode(dataframe, column);

    try {
      const { result } = await positron.runtime.evaluateCode(
        'r',
        code,
        cancellationToken,
        session.metadata.sessionId,
      );
      return typeof result === 'string' ? result : undefined;
    } catch (error) {
      Logger.debug(`Haven label lookup for ${dataframe}$${column} failed`, error);
      return undefined;
    }
  }
}

function buildLabelLookupCode(dataframe: string, column: string): string {
  // Guarded end-to-end in R too (not just relying on the TS-side identifier
  // check): a missing dataframe/column, a non-data-frame value, a missing
  // `haven` package, or any other error all fall through to `NULL`, which
  // `evaluateCode` reports back as a non-string `result` -- never an R-level
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
    if (is.null(label)) return(NULL)
    as.character(label)
  }, error = function(e) NULL)
})()
  `.trim();
}

const HavenLabels = new HavenLabelsProvider();
export default HavenLabels;
