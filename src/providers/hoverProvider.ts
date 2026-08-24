import * as vscode from "vscode";
import { parseR } from "../ast/treeSitterService";
import { parseDataMaskingFunctionsConfig } from "../extractor/dataMaskingFunctions";
import { resolveReference } from "../extractor/resolveReference";
import HavenLabels from "./havenLabels";
import { Logger } from "../utils/logger";
import { renderHoverContent, type OutputMode } from "./renderHoverContent";

const CONFIG_SECTION = "havenLabels";
const DEFAULT_MAX_VALUE_LABELS = 10;

/**
 * Registers the R hover provider: resolves dataframe/column references via
 * the tree-sitter extractor (using the user-configurable
 * `havenLabels.dataMaskingFunctions` registry), then looks up haven
 * metadata (if any) by silently evaluating a snippet in the user's own R
 * session -- see `havenLabels.ts` for why that lookup never interrupts the
 * user or shows up in the console. Rendering (short label vs. full label +
 * value-labels table) is controlled by `havenLabels.outputMode` and
 * `havenLabels.maxValueLabels`.
 *
 * NOTE: parses the whole document text on every hover request. Caching a
 * per-document `Tree` and incrementally re-parsing on edits (per the target
 * architecture) is a follow-up optimization, not required for this
 * milestone.
 */
export function registerHoverProvider(): vscode.Disposable {
  return vscode.languages.registerHoverProvider("r", {
    async provideHover(document, position, token) {
      const offset = document.offsetAt(position);
      const tree = await parseR(document.getText());

      const config = vscode.workspace.getConfiguration(CONFIG_SECTION, document);
      const dataMaskingFunctions = parseDataMaskingFunctionsConfig(
        config.get("dataMaskingFunctions"),
        (entry, index) => Logger.warn(`Ignoring invalid havenLabels.dataMaskingFunctions[${index}]`, entry),
      );

      const resolved = resolveReference(tree, offset, { dataMaskingFunctions });
      if (!resolved) {
        return undefined;
      }

      const info = await HavenLabels.getDataFrameColumnInfo(resolved.dataframe, resolved.column, token);
      if (!info) {
        return undefined;
      }

      const mode = config.get<OutputMode>("outputMode", "short");
      const maxValueLabels = config.get<number>("maxValueLabels", DEFAULT_MAX_VALUE_LABELS);

      const content = renderHoverContent(info, { mode, maxValueLabels });
      if (!content) {
        return undefined;
      }

      return new vscode.Hover(new vscode.MarkdownString(content));
    },
  });
}
