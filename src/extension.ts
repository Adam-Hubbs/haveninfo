import * as vscode from "vscode";
import { Logger } from './utils/logger';
import { registerHoverProvider } from './providers/hoverProvider';

export function activate(context: vscode.ExtensionContext) {
  Logger.show();
  Logger.info("Activating extension...");

  context.subscriptions.push(registerHoverProvider());

  Logger.info("Extension activated.");
}
