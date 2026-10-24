import * as vscode from 'vscode';
import { parseDataMaskingFunctionsConfig } from '../extractor/dataMaskingFunctions';
import {
  createDataMaskingRegistry,
  parseRDocument,
  resolveInDocument,
  type DataMaskingRegistry,
  type ParsedDocument,
  type ResolvedReference,
} from '../extractor/resolveReference';
import { Logger } from '../utils/logger';

export const CONFIG_SECTION = 'havenLabels';

const parsedDocuments = new Map<string, { version: number; parsed: ParsedDocument }>();
let dataMaskingRegistry: DataMaskingRegistry | undefined;

/**
 * Resolves the dataframe/column reference at `position`, honoring the
 * user-configurable `havenLabels.dataMaskingFunctions` registry. Shared by
 * the hover provider and by `runFrequenciesCommand.ts`'s
 * keybinding/Command-Palette path (which has no hover position to work
 * from except "wherever the cursor currently is").
 *
 * Reuses the document's parse until its version changes, and the registry
 * until the setting changes (see {@link registerResolveReferenceCaches}).
 */
export function resolveReferenceAt(
  document: vscode.TextDocument,
  position: vscode.Position,
): ResolvedReference | undefined {
  return resolveInDocument(parsedDocument(document), document.offsetAt(position), registryFor(document));
}

/**
 * Frees cached parses as soon as their document is edited or closed, rather
 * than holding them until the next hover notices the stale version, and drops
 * the cached registry when its setting changes.
 */
export function registerResolveReferenceCaches(): vscode.Disposable {
  return vscode.Disposable.from(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.contentChanges.length > 0) {
        evictDocument(event.document.uri.toString());
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => evictDocument(document.uri.toString())),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${CONFIG_SECTION}.dataMaskingFunctions`)) {
        evictRegistry();
      }
    }),
    {
      dispose() {
        [...parsedDocuments.keys()].forEach(evictDocument);
        evictRegistry();
      },
    },
  );
}

function parsedDocument(document: vscode.TextDocument): ParsedDocument {
  const key = document.uri.toString();
  const cached = parsedDocuments.get(key);
  if (cached?.version === document.version) {
    return cached.parsed;
  }

  evictDocument(key);
  const parsed = parseRDocument(document.getText());
  parsedDocuments.set(key, { version: document.version, parsed });
  return parsed;
}

// The setting is window-scoped (no per-folder values), so one registry
// serves every document.
function registryFor(document: vscode.TextDocument): DataMaskingRegistry {
  if (!dataMaskingRegistry) {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION, document);
    const dataMaskingFunctions = parseDataMaskingFunctionsConfig(
      config.get('dataMaskingFunctions'),
      (entry, index) => Logger.warn(`Ignoring invalid havenLabels.dataMaskingFunctions[${index}]`, entry),
    );
    dataMaskingRegistry = createDataMaskingRegistry(dataMaskingFunctions);
  }
  return dataMaskingRegistry;
}

function evictDocument(key: string): void {
  parsedDocuments.get(key)?.parsed.free();
  parsedDocuments.delete(key);
}

function evictRegistry(): void {
  dataMaskingRegistry?.free();
  dataMaskingRegistry = undefined;
}
