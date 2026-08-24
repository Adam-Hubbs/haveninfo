import * as vscode from "vscode";
import HavenLabels from "./havenLabels";
import { renderHoverContent, type OutputMode } from "./renderHoverContent";
import { RUN_FREQUENCIES_COMMAND, SHOW_ALL_VALUE_LABELS_COMMAND } from "./commandIds";
import { CONFIG_SECTION, resolveReferenceAt } from "./resolveReferenceAt";

const DEFAULT_MAX_VALUE_LABELS = 10;
const DEFAULT_MAX_STEM_MATCHES = 15;

/**
 * Registers the R hover provider: resolves dataframe/column references via
 * the tree-sitter extractor (using the user-configurable
 * `havenLabels.dataMaskingFunctions` registry, see `resolveReferenceAt.ts`),
 * then asks `HavenLabels.lookupColumn` what the reference actually is --
 * an exact column (with haven metadata, if any), a stem match (see
 * `havenLabels.ts`), or neither, in which case no hover is shown at all.
 * Rendering is controlled by `havenLabels.outputMode`,
 * `havenLabels.maxValueLabels`, `havenLabels.maxStemMatches`, and
 * `havenLabels.showRunFrequenciesLink`.
 *
 * `isTrusted` is scoped to allow only {@link SHOW_ALL_VALUE_LABELS_COMMAND}
 * and {@link RUN_FREQUENCIES_COMMAND}, not arbitrary commands.
 *
 * NOTE: parses the whole document text on every hover request. Caching a
 * per-document `Tree` and incrementally re-parsing on edits (per the target
 * architecture) is a follow-up optimization, not required for this
 * milestone.
 */
export function registerHoverProvider(): vscode.Disposable {
  return vscode.languages.registerHoverProvider("r", {
    async provideHover(document, position, token) {
      const resolved = await resolveReferenceAt(document, position);
      if (!resolved) {
        return undefined;
      }

      const lookup = await HavenLabels.lookupColumn(resolved.dataframe, resolved.column, token);

      const config = vscode.workspace.getConfiguration(CONFIG_SECTION, document);
      const mode = config.get<OutputMode>("outputMode", "short");
      const maxValueLabels = config.get<number>("maxValueLabels", DEFAULT_MAX_VALUE_LABELS);
      const maxStemMatches = config.get<number>("maxStemMatches", DEFAULT_MAX_STEM_MATCHES);
      const showRunFrequenciesLink = config.get<boolean>("showRunFrequenciesLink", true);

      const content = renderHoverContent(resolved, lookup, {
        mode,
        maxValueLabels,
        maxStemMatches,
        showRunFrequenciesLink,
      });
      if (!content) {
        return undefined;
      }

      const markdown = new vscode.MarkdownString(content);
      markdown.isTrusted = { enabledCommands: [SHOW_ALL_VALUE_LABELS_COMMAND, RUN_FREQUENCIES_COMMAND] };

      return new vscode.Hover(markdown);
    },
  });
}
