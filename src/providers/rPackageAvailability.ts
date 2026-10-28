import * as vscode from 'vscode';
import { tryAcquirePositronApi } from '@posit-dev/positron';
import { isValidRIdentifier } from '../utils/rIdentifier';

/**
 * Checks whether an R package is installed/loadable in the foreground R
 * session, via a silent, non-interrupting `evaluateCode` call (same
 * rationale as `havenLabels.ts`'s lookup). Returns `false` for any failure
 * mode (no Positron API, no R session, evaluation error, invalid package
 * name) -- a caller should treat "can't tell" the same as "not available"
 * and fail gracefully rather than assume.
 */
export async function isRPackageAvailable(
  packageName: string,
  cancellationToken?: vscode.CancellationToken,
): Promise<boolean> {
  if (!isValidRIdentifier(packageName)) {
    return false;
  }

  const positron = tryAcquirePositronApi();
  if (!positron) {
    return false;
  }

  const session = await positron.runtime.getForegroundSession();
  if (!session || session.runtimeMetadata.languageId !== 'r') {
    return false;
  }

  try {
    const { result } = await positron.runtime.evaluateCode(
      'r',
      `requireNamespace("${packageName}", quietly = TRUE)`,
      cancellationToken,
      session.metadata.sessionId,
    );
    return result === true;
  } catch {
    return false;
  }
}

/**
 * Shows a one-off notification offering to load an R package, for an
 * explicit user action (e.g. "Run frequencies") that needs it but couldn't
 * find it. Deliberately visible/interactive: unlike the passive hover lookup
 * (which degrades silently when `y2clerk` is unavailable -- see
 * `havenLabels.ts`), this only fires in response to something the user
 * explicitly clicked/ran, so a notification -- and, if accepted, a visible
 * `library(<package>)` call -- is appropriate rather than intrusive.
 */
export async function promptToLoadRPackage(packageName: string): Promise<void> {
  if (!isValidRIdentifier(packageName)) {
    return;
  }

  const action = `Load ${packageName}`;
  const choice = await vscode.window.showWarningMessage(
    `This action requires the ${packageName} package, which doesn't appear to be loaded in this R session.`,
    action,
  );
  if (choice !== action) {
    return;
  }

  const positron = tryAcquirePositronApi();
  if (!positron) {
    return;
  }

  await positron.runtime.executeCode('r', `library(${packageName})`, true);
}
