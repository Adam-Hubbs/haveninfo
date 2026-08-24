import * as vscode from 'vscode';
import { tryAcquirePositronApi } from '@posit-dev/positron';
import { isValidRIdentifier } from '../utils/rIdentifier';
import { Logger } from '../utils/logger';
import { SHOW_ALL_VALUE_LABELS_COMMAND } from './commandIds';

/**
 * Registers the command backing the "...and N more" link in full-mode
 * hovers (see `renderHoverContent.ts`). Unlike `HavenLabels`'s hover
 * lookup, this one is deliberately *visible*: it's an explicit,
 * user-initiated click, so we run the code with `focus = true` (bringing
 * the console into view) instead of `evaluateCode`'s silent evaluation --
 * the user asked to see the value labels printed in their own console.
 *
 * Because it's explicit and user-triggered (not something firing on every
 * mouse movement over the editor), it's also fine here -- unlike the hover
 * path -- to let Positron auto-start an R session if none is running, and
 * to let a genuine R-side error surface in the console rather than being
 * swallowed.
 */
export function registerShowAllValueLabelsCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(SHOW_ALL_VALUE_LABELS_COMMAND, async (dataframe: unknown, column: unknown) => {
    if (typeof dataframe !== 'string' || typeof column !== 'string') {
      return;
    }
    if (!isValidRIdentifier(dataframe) || !isValidRIdentifier(column)) {
      return;
    }

    const positron = tryAcquirePositronApi();
    if (!positron) {
      return;
    }

    const code = `attr(${dataframe}[["${column}"]], "labels")`;

    try {
      await positron.runtime.executeCode('r', code, true);
    } catch (error) {
      Logger.debug(`Failed to run "show all value labels" for ${dataframe}$${column}`, error);
    }
  });
}
