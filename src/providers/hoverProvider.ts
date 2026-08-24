import * as vscode from "vscode";
import { parseR } from "../ast/treeSitterService";
import { resolveReference } from "../extractor/resolveReference";
import HavenLabels from "./havenLabels";

/**
 * Registers the R hover provider: resolves dataframe/column references via
 * the tree-sitter extractor, then looks up a haven `label` attribute (if
 * any) by silently evaluating a snippet in the user's own R session -- see
 * `havenLabels.ts` for why that lookup never interrupts the user or shows
 * up in the console.
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
      const resolved = resolveReference(tree, offset);
      if (!resolved) {
        return undefined;
      }

      const label = await HavenLabels.getDataFrameColumnLabel(resolved.dataframe, resolved.column, token);
      if (!label) {
        return undefined;
      }

      return new vscode.Hover(`Haven label: ${label}`);
    },
  });
}
