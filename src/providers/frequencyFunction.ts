import { isValidRIdentifier } from '../utils/rIdentifier';

/**
 * The R function "Run frequencies" calls, per the `havenLabels.frequencyFunction`
 * setting (plus `havenLabels.customFrequencyFunction` for `"custom"`). Kept
 * free of any `vscode`/`positron` import so it stays unit-testable in plain
 * Node.
 *
 * Every option must share `y2clerk::freqs()`'s calling convention -- a
 * dataframe first, then tidyselect column selectors -- since it's called as
 * `data |> fn(selector)` or `fn(data, selector)`.
 */
export const FREQUENCY_FUNCTION_PRESETS = ['y2clerk::freqs', 'freq2::freqs'] as const;
export const CUSTOM_FREQUENCY_FUNCTION = 'custom';
export const DEFAULT_FREQUENCY_FUNCTION = 'y2clerk::freqs';

export interface FrequencyFunction {
  /** The callable as written in R source, e.g. `freq2::freqs` or `my_freqs`. */
  call: string;
  /** The package to check for (and offer to load) before calling, if namespace-qualified. */
  packageName?: string;
}

export type FrequencyFunctionResult =
  | { ok: true; fn: FrequencyFunction }
  | { ok: false; reason: string };

const QUALIFIED_FUNCTION_PATTERN = /^([^:]+):::?([^:]+)$/;

export function resolveFrequencyFunction(setting: unknown, customFunction: unknown): FrequencyFunctionResult {
  if (setting === CUSTOM_FREQUENCY_FUNCTION) {
    const trimmed = typeof customFunction === 'string' ? customFunction.trim() : '';
    if (!trimmed) {
      return { ok: false, reason: 'havenLabels.frequencyFunction is "custom", but havenLabels.customFrequencyFunction is empty.' };
    }
    const fn = parseFunctionReference(trimmed);
    return fn
      ? { ok: true, fn }
      : {
          ok: false,
          reason: `havenLabels.customFrequencyFunction "${trimmed}" isn't a valid R function name (expected e.g. "my_freqs" or "mypkg::freqs").`,
        };
  }

  const preset = FREQUENCY_FUNCTION_PRESETS.find((p) => p === setting) ?? DEFAULT_FREQUENCY_FUNCTION;
  return { ok: true, fn: parseFunctionReference(preset)! };
}

export function buildFrequenciesCode(
  fn: FrequencyFunction,
  target: { dataframe: string; selectorExpression: string; expressionUpToHere?: string },
): string {
  return target.expressionUpToHere
    ? `${target.expressionUpToHere} |> ${fn.call}(${target.selectorExpression})`
    : `${fn.call}(${target.dataframe}, ${target.selectorExpression})`;
}

function parseFunctionReference(text: string): FrequencyFunction | undefined {
  const qualified = QUALIFIED_FUNCTION_PATTERN.exec(text);
  if (qualified) {
    const [, packageName, name] = qualified;
    return isValidRIdentifier(packageName) && isValidRIdentifier(name) ? { call: text, packageName } : undefined;
  }
  return isValidRIdentifier(text) ? { call: text } : undefined;
}
