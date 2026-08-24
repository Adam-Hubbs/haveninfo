/**
 * Fixed, maintained registry of "data-masking" R calls: functions where a
 * bare identifier inside the call plausibly refers to a column of a
 * dataframe argument to that same call (as opposed to an ordinary variable).
 *
 * This is intentionally a curated allow-list, not an open-ended "any call
 * whose first argument looks like a dataframe" heuristic -- see the plan doc
 * for rationale. Extend this table as new verbs come up; don't special-case
 * individual functions in the extractor itself.
 *
 * `dataArg` describes how to find the dataframe argument for a *non-piped*
 * call (e.g. `select(df, x)`, as opposed to `df |> select(x)` where the
 * pipeline supplies the dataframe implicitly -- see `resolveReference.ts`):
 *   - `position`: 0-based index among the call's arguments, matched only
 *     against arguments that aren't otherwise named.
 *   - `name`: matched against a named argument (`data = df`, `.data = df`).
 * At least one of `position`/`name` must be set; both may be set when a
 * function accepts the dataframe either way (the common case).
 *
 * We deliberately do NOT distinguish "column being created" (e.g. the `z` in
 * `mutate(z = x)`) from "column being referenced" (`x`) -- any identifier
 * found within a matched call's arguments (other than the dataframe
 * argument itself) resolves to that call's dataframe. Whether the resulting
 * name is actually a real column of the data is left to the R-execution
 * layer (`havenLabels.ts`) to guard against, not the extractor.
 */

export interface DataArgSpec {
  position?: number;
  name?: string;
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
  { position: 0, name: ".data" },
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
  { position: 0, name: "data" },
);

const Y2CLERK = entry(["freqs"], { position: 0, name: "df" });

const BASE_R = [
  ...entry(["with", "within"], { position: 0, name: "data" }),
  ...entry(["subset"], { position: 0, name: "x" }),
  ...entry(["transform"], { position: 0, name: "_data" }),
  // `aggregate`'s formula method takes `data` as its 2nd argument, but its
  // list method takes the data as its 1st (unnamed) argument -- we only
  // support the common `aggregate(y ~ x, data = df)` form (named `data`);
  // the positional list-method form is a known scope gap.
  ...entry(["aggregate"], { name: "data" }),
];

// No sane positional default: `lm(formula, data, ...)` technically allows
// `data` positionally, but disambiguating it from other positional args
// (subset, weights, ...) isn't worth it -- require `data =` explicitly.
const MODEL_FITTING = entry(["lm", "glm", "aov"], { name: "data" });

const GGPLOT = entry(["ggplot"], { position: 0, name: "data" });

export const DATA_MASKING_FUNCTIONS: readonly DataMaskingFunction[] = [
  ...DPLYR_DATA_FIRST,
  ...TIDYR_DATA_FIRST,
  ...Y2CLERK,
  ...BASE_R,
  ...MODEL_FITTING,
  ...GGPLOT,
];

const REGISTRY_BY_NAME: ReadonlyMap<string, DataArgSpec> = new Map(
  DATA_MASKING_FUNCTIONS.map((fn) => [fn.name, fn.dataArg]),
);

/**
 * Looks up a call's data-arg spec by its (unqualified) function name.
 * Strips a leading `pkg::`/`pkg:::` namespace qualifier before matching, so
 * `dplyr::select(...)` matches the same entry as `select(...)`.
 */
export function lookupDataMaskingFunction(functionName: string): DataArgSpec | undefined {
  const unqualified = functionName.replace(/^[.A-Za-z][.A-Za-z0-9]*:::?/, "");
  return REGISTRY_BY_NAME.get(unqualified);
}
