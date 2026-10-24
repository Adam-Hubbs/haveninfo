/**
 * Registry of "data-masking" R calls: functions where a bare identifier
 * inside the call plausibly refers to a column of a dataframe argument to
 * that same call (as opposed to an ordinary variable).
 *
 * {@link DEFAULT_DATA_MASKING_FUNCTIONS} is a curated allow-list (dplyr,
 * tidyr, `y2clerk::freqs`, base R, model-fitting, ggplot2) -- but it's not
 * hardcoded into the extractor. It's entirely user-configurable via the
 * `havenLabels.dataMaskingFunctions` setting (see `package.json`'s
 * `contributes.configuration`, whose default mirrors this array -- keep
 * them in sync; `dataMaskingFunctions.settings-sync.spec.ts` catches drift).
 * The setting *replaces* this list wholesale, not merges with it, so users
 * can add, remove, or adjust entries freely.
 *
 * `dataArg` describes how to find the dataframe argument for a *non-piped*
 * call (e.g. `select(df, x)`, as opposed to `df |> select(x)` where the
 * pipeline supplies the dataframe implicitly -- see `resolveReference.ts`):
 *   - `position`: 0-based index among the call's arguments, matched only
 *     against arguments that aren't otherwise named.
 *   - `argName`: matched against a named argument (`data = df`, `.data = df`).
 * Both are optional: a function registered with neither is still
 * recognized (and resolvable when piped), just never resolvable as a
 * standalone non-piped call.
 *
 * We deliberately do NOT distinguish "column being created" (e.g. the `z` in
 * `mutate(z = x)`) from "column being referenced" (`x`) -- any identifier
 * found within a matched call's arguments (other than the dataframe
 * argument itself) resolves to that call's dataframe. Whether the resulting
 * name is actually a real column of the data is left to the R-execution
 * layer (`havenLabels.ts`) to guard against, not the extractor.
 */
import { isValidRIdentifier } from "../utils/rIdentifier";

export interface DataArgSpec {
  position?: number;
  argName?: string;
}

export interface DataMaskingFunction {
  /** Unqualified function name, e.g. `select` (matches `dplyr::select` too). */
  name: string;
  dataArg: DataArgSpec;
}

function entry(names: string[], dataArg: DataArgSpec): DataMaskingFunction[] {
  return names.map((name) => ({ name, dataArg }));
}

const DPLYR_DATA_FIRST = entry(
  [
    "select",
    "rename",
    "relocate",
    "rename_with",
    "filter",
    "mutate",
    "transmute",
    "summarise",
    "summarize",
    "arrange",
    "distinct",
    "group_by",
    "rowwise",
    "pull",
    "slice",
    "slice_head",
    "slice_tail",
    "slice_sample",
    "slice_min",
    "slice_max",
    "with_groups",
    "count",
    "tally",
    "add_count",
    "add_tally",
  ],
  { position: 0, argName: ".data" },
);

const TIDYR_DATA_FIRST = entry(
  [
    "pivot_longer",
    "pivot_wider",
    "drop_na",
    "fill",
    "expand",
    "complete",
    "nest",
    "unite",
    "separate",
    "separate_rows",
    "extract",
    "unnest",
    "replace_na",
  ],
  { position: 0, argName: "data" },
);

// All take their dataframe as the first (unnamed) argument, named `dataset`
// when passed by name (verified against each function's actual signature,
// e.g. `freqs(dataset, ...)`, not `df`/`data`). `freq` is a documented
// alias of `freqs`.
const Y2CLERK = entry(["freqs", "freq", "multi_freqs", "cross_freqs", "pivot_freqs"], {
  position: 0,
  argName: "dataset",
});

const BASE_R = [
  ...entry(["with", "within"], { position: 0, argName: "data" }),
  ...entry(["subset"], { position: 0, argName: "x" }),
  ...entry(["transform"], { position: 0, argName: "_data" }),
  // `aggregate`'s formula method takes `data` as its 2nd argument, but its
  // list method takes the data as its 1st (unnamed) argument -- we only
  // support the common `aggregate(y ~ x, data = df)` form (named `data`);
  // the positional list-method form is a known scope gap.
  ...entry(["aggregate"], { argName: "data" }),
];

// No sane positional default: `lm(formula, data, ...)` technically allows
// `data` positionally, but disambiguating it from other positional args
// (subset, weights, ...) isn't worth it -- require `data =` explicitly.
const MODEL_FITTING = entry(["lm", "glm", "aov"], { argName: "data" });

const GGPLOT = entry(["ggplot"], { position: 0, argName: "data" });

export const DEFAULT_DATA_MASKING_FUNCTIONS: readonly DataMaskingFunction[] = [
  ...DPLYR_DATA_FIRST,
  ...TIDYR_DATA_FIRST,
  ...Y2CLERK,
  ...BASE_R,
  ...MODEL_FITTING,
  ...GGPLOT,
];

/**
 * Validates a single entry of the user-facing `havenLabels.dataMaskingFunctions`
 * setting (arbitrary JSON from `settings.json`) into a {@link DataMaskingFunction}.
 * Returns `undefined` -- rather than throwing -- for anything malformed, so
 * one bad entry doesn't break the whole list.
 */
export function parseDataMaskingFunctionConfigEntry(value: unknown): DataMaskingFunction | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { name, position, argName } = value as Record<string, unknown>;

  if (typeof name !== "string" || !isValidRIdentifier(name)) {
    return undefined;
  }
  if (position !== undefined && !(typeof position === "number" && Number.isInteger(position) && position >= 0)) {
    return undefined;
  }
  if (argName !== undefined && (typeof argName !== "string" || !isValidRIdentifier(argName))) {
    return undefined;
  }

  const dataArg: DataArgSpec = {};
  if (typeof position === "number") {
    dataArg.position = position;
  }
  if (typeof argName === "string") {
    dataArg.argName = argName;
  }
  return { name, dataArg };
}

/**
 * Validates the whole `havenLabels.dataMaskingFunctions` setting value.
 * Malformed entries are dropped (not fatal); `onInvalidEntry` is called for
 * each one so the caller can log a warning.
 */
export function parseDataMaskingFunctionsConfig(
  value: unknown,
  onInvalidEntry?: (entry: unknown, index: number) => void,
): DataMaskingFunction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: DataMaskingFunction[] = [];
  value.forEach((entry, index) => {
    const parsed = parseDataMaskingFunctionConfigEntry(entry);
    if (parsed) {
      result.push(parsed);
    } else {
      onInvalidEntry?.(entry, index);
    }
  });
  return result;
}
