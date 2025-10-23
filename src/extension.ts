import * as vscode from "vscode";
import { Logger } from './utils/logger';
import { tryAcquirePositronApi } from "@posit-dev/positron";
import HavenLabels from './providers/havenLabels';
import { VariableParser } from './parsers/variableParser';

export function activate(context: vscode.ExtensionContext) {
  Logger.show();
  Logger.info("Activating extension...");

  const hoverProvider = vscode.languages.registerHoverProvider('r', {
    async provideHover(document, position) {
      const positron = tryAcquirePositronApi();
      if (!positron) return;

      const foregroundSession = await positron.runtime.getForegroundSession();
      if (!foregroundSession) return;

      const range = document.getWordRangeAtPosition(position, /\w+(\$\w+|\[\[["']?\w+["']?\]\])?/);
      if (!range) return;

      const parsed = VariableParser.parseVariable(document, position);

      let label: string | undefined;
      
      if (parsed) {
        label = await HavenLabels.getDataFrameColumnLabels(
          parsed.variable, 
          parsed.column!
        );
      } 

      // Check if label is a string
      if (typeof label === 'string') {
        return new vscode.Hover(`Haven label: ${label}`);
      }
    }
  });

  context.subscriptions.push(hoverProvider);

  Logger.info("Extension activated.");
}
