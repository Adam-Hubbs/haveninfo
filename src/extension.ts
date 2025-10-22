import * as vscode from "vscode";
import { Logger } from './utils/logger';
// Use helper function to safely get positron api if it exists
import { tryAcquirePositronApi } from "@posit-dev/positron";

export function activate(context: vscode.ExtensionContext) {
  Logger.show();

  const helloWorld = vscode.commands.registerCommand(
    "haven-info.hello-world",
    () => {
    
      Logger.info("Hello from Haven Info!");


      const positron = tryAcquirePositronApi();

      if (positron === undefined) {
        vscode.window.showInformationMessage("Failed to find positron api");
        return;
      }

      // Execute code in the active runtime
      positron.runtime.executeCode(
        "r",
        'print("Hello from Haven Info!")',
        true
      );
    }
  );

  const getVariables = vscode.commands.registerCommand(
    "haven-info.get-variables",
    async () => {
      const positron = tryAcquirePositronApi();

      if (positron === undefined) {
        vscode.window.showInformationMessage("Failed to find positron api");
        return;
      }


      const foregroundSession = await positron.runtime.getForegroundSession();

      // Get variables from a session
      if (foregroundSession) {
        const variables = await positron.runtime.getSessionVariables(
          foregroundSession.metadata.sessionId
        );
        Logger.info("Current variables:", variables);
      }
    }
  );

  context.subscriptions.push(helloWorld, getVariables);
}
