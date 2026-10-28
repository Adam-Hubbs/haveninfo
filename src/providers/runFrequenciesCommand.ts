import * as vscode from 'vscode';
import { tryAcquirePositronApi } from '@posit-dev/positron';
import { isValidRIdentifier } from '../utils/rIdentifier';
import { Logger } from '../utils/logger';
import { RUN_FREQUENCIES_COMMAND } from './commandIds';
import { CONFIG_SECTION, resolveReferenceAt } from './resolveReferenceAt';
import { isRPackageAvailable, promptToLoadRPackage } from './rPackageAvailability';
import { buildFrequenciesCode, resolveFrequencyFunction, type FrequencyFunction } from './frequencyFunction';
import HavenLabels from './havenLabels';

/** Matches exactly the stem-selector expressions we ourselves generate, e.g. `y2clerk::stem("Q1")`. */
const STEM_SELECTOR_PATTERN = /^y2clerk::stem\("([^"\\]*)"\)$/;

interface RunFrequenciesTarget {
  dataframe: string;
  /** Either a bare column identifier or a `y2clerk::stem("...")` tidyselect expression. */
  selectorExpression: string;
  expressionUpToHere?: string;
}

/**
 * Registers the "run frequencies" command: runs the configured frequency
 * function (`havenLabels.frequencyFunction`, `y2clerk::freqs()` by default --
 * see `frequencyFunction.ts`) *visibly* in the user's R console, either on a
 * single column or (for a stem match) across the whole matched set via
 * `freqs(y2clerk::stem(...))`.
 * Declared as a first-class command in `package.json` (not just invoked
 * via a hover link), so it can be bound to a keyboard shortcut or run from
 * the Command Palette.
 *
 * Two ways to invoke it:
 *  1. From a hover link (`renderHoverContent.ts`), which passes
 *     `(dataframe, selectorExpression, expressionUpToHere?)` explicitly --
 *     the hover already knows (via `HavenLabels.lookupColumn`) whether
 *     this is an exact column or a stem match.
 *  2. With no arguments -- a keybinding or the Command Palette -- in which
 *     case the reference is resolved from the active editor's cursor via
 *     `resolveReferenceAt`, and `HavenLabels.lookupColumn` is consulted to
 *     decide the same way: exact column, stem, or (if neither) a status
 *     message and no-op.
 *
 * `expressionUpToHere` (when available) is the pipeline/call *up to, but
 * not including*, the stage the cursor is in (see `resolveReference.ts`),
 * so this runs frequencies "as of" right before that stage, not the
 * pipeline's final result. Only direct `$`/`[[ ]]`/`[ ]` access, with no
 * pipeline point at all, falls back to `freqs(dataframe, selector)`.
 *
 * When the frequency function is namespace-qualified, its package is
 * required. Since this is an explicit, user-initiated action (unlike the
 * passive hover lookup, which just degrades silently), a missing package
 * gets a proactive notification offering to load it
 * (`rPackageAvailability.ts`) instead of just letting a "there is no
 * package" error appear. A bare custom function name isn't checked -- if
 * it doesn't exist, R's own error surfaces in the console.
 *
 * Deliberately visible, not silent (`focus: true` via `executeCode`, not
 * `evaluateCode`): fine here -- unlike the hover lookup -- to auto-start an
 * R session if none is running, and to let a genuine R-side error surface
 * in the console.
 */
export function registerRunFrequenciesCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    RUN_FREQUENCIES_COMMAND,
    async (dataframe?: unknown, selectorExpression?: unknown, expressionUpToHere?: unknown) => {
      const target =
        typeof dataframe === 'string' && typeof selectorExpression === 'string'
          ? {
              dataframe,
              selectorExpression,
              expressionUpToHere: typeof expressionUpToHere === 'string' ? expressionUpToHere : undefined,
            }
          : await resolveTargetAtActiveCursor();

      if (!target) {
        return;
      }
      if (!isValidRIdentifier(target.dataframe) || !isValidSelectorExpression(target.selectorExpression)) {
        return;
      }

      const fn = await configuredFrequencyFunction();
      if (!fn) {
        return;
      }

      if (fn.packageName && !(await isRPackageAvailable(fn.packageName))) {
        await promptToLoadRPackage(fn.packageName);
        return;
      }

      const positron = tryAcquirePositronApi();
      if (!positron) {
        return;
      }

      const code = buildFrequenciesCode(fn, target);

      try {
        await positron.runtime.executeCode('r', code, true);
      } catch (error) {
        Logger.debug(`Failed to run frequencies for ${target.dataframe} / ${target.selectorExpression}`, error);
      }
    },
  );
}

async function configuredFrequencyFunction(): Promise<FrequencyFunction | undefined> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const result = resolveFrequencyFunction(config.get('frequencyFunction'), config.get('customFrequencyFunction'));
  if (result.ok) {
    return result.fn;
  }

  const openSettings = 'Open Settings';
  const choice = await vscode.window.showErrorMessage(result.reason, openSettings);
  if (choice === openSettings) {
    await vscode.commands.executeCommand('workbench.action.openSettings', `${CONFIG_SECTION}.customFrequencyFunction`);
  }
  return undefined;
}

async function resolveTargetAtActiveCursor(): Promise<RunFrequenciesTarget | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'r') {
    return undefined;
  }

  const resolved = resolveReferenceAt(editor.document, editor.selection.active);
  if (!resolved) {
    return undefined;
  }

  const lookup = await HavenLabels.lookupColumn(resolved.dataframe, resolved.column);
  if (lookup.kind === 'none') {
    vscode.window.showInformationMessage(
      `"${resolved.column}" isn't a column (or column stem) of "${resolved.dataframe}".`,
    );
    return undefined;
  }

  const selectorExpression = lookup.kind === 'stem' ? `y2clerk::stem("${resolved.column}")` : resolved.column;
  return { dataframe: resolved.dataframe, selectorExpression, expressionUpToHere: resolved.expressionUpToHere };
}

function isValidSelectorExpression(selectorExpression: string): boolean {
  if (isValidRIdentifier(selectorExpression)) {
    return true;
  }
  const match = STEM_SELECTOR_PATTERN.exec(selectorExpression);
  return !!match && isValidRIdentifier(match[1]);
}
