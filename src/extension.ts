import * as vscode from "vscode";
import { Logger } from './utils/logger';
import { registerHoverProvider } from './providers/hoverProvider';
import { registerShowAllValueLabelsCommand } from './providers/showAllValueLabelsCommand';
import { registerRunFrequenciesCommand } from './providers/runFrequenciesCommand';

export function activate(context: vscode.ExtensionContext) {
  Logger.show();
  Logger.info("Activating extension...");

  context.subscriptions.push(registerHoverProvider());
  context.subscriptions.push(registerShowAllValueLabelsCommand());
  context.subscriptions.push(registerRunFrequenciesCommand());

  Logger.info("Extension activated.");
}
