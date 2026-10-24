import * as vscode from "vscode";
import { registerHoverProvider } from './providers/hoverProvider';
import { registerShowAllValueLabelsCommand } from './providers/showAllValueLabelsCommand';
import { registerRunFrequenciesCommand } from './providers/runFrequenciesCommand';
import { registerResolveReferenceCaches } from './providers/resolveReferenceAt';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(registerResolveReferenceCaches());
  context.subscriptions.push(registerHoverProvider());
  context.subscriptions.push(registerShowAllValueLabelsCommand());
  context.subscriptions.push(registerRunFrequenciesCommand());
}
