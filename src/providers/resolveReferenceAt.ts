import * as vscode from 'vscode';
import { parseR } from '../ast/treeSitterService';
import { parseDataMaskingFunctionsConfig } from '../extractor/dataMaskingFunctions';
import { resolveReference, type ResolvedReference } from '../extractor/resolveReference';
import { Logger } from '../utils/logger';

export const CONFIG_SECTION = 'havenLabels';

/**
 * Parses `document` and resolves the dataframe/column reference at
 * `position`, honoring the user-configurable `havenLabels.dataMaskingFunctions`
 * registry. Shared by the hover provider and by `runFrequenciesCommand.ts`'s
 * keybinding/Command-Palette path (which has no hover position to work
 * from except "wherever the cursor currently is").
 */
export async function resolveReferenceAt(
  document: vscode.TextDocument,
  position: vscode.Position,
): Promise<ResolvedReference | undefined> {
  const offset = document.offsetAt(position);
  const tree = await parseR(document.getText());

  const config = vscode.workspace.getConfiguration(CONFIG_SECTION, document);
  const dataMaskingFunctions = parseDataMaskingFunctionsConfig(
    config.get('dataMaskingFunctions'),
    (entry, index) => Logger.warn(`Ignoring invalid havenLabels.dataMaskingFunctions[${index}]`, entry),
  );

  return resolveReference(tree, offset, { dataMaskingFunctions });
}
