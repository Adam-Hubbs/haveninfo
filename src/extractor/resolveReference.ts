import { DataMaskingRegistry, ParsedDocument } from "../ast/air/air_resolver";
import { DEFAULT_DATA_MASKING_FUNCTIONS, type DataMaskingFunction } from "./dataMaskingFunctions";

export type { DataMaskingRegistry, ParsedDocument };

export interface ResolvedReference {
  dataframe: string;
  column: string;
  /**
   * Source text of the pipeline/call *up to, but not including*, the stage
   * the cursor is in -- i.e. an expression representing the data as it
   * existed right before this stage ran, suitable for piping into a
   * further verb (e.g. `` `${expressionUpToHere} |> freqs(column)` ``).
   *
   * For a piped call, this is the `lhs` of the pipe feeding it (e.g.
   * hovering `new_var` in
   * `df |> mutate(new_var = x) |> select(new_var) |> arrange(new_var)`'s
   * `select(...)` stage yields `"df |> mutate(new_var = x)"` -- the
   * `select` stage itself is deliberately excluded). For a non-piped call,
   * it's just the raw dataframe argument's text (e.g. `select(df, col)`
   * yields `"df"`). Absent for direct `$`/`[[ ]]`/`[ ]` access, where
   * there's no "pipeline point" to speak of.
   *
   * Note this means hovering a column at the exact stage that *creates*
   * it (e.g. `new_var` in `mutate(new_var = x)` itself) yields an
   * expression from *before* that column exists -- expected, since "the
   * step before this one" for the first stage is just the bare dataframe.
   */
  expressionUpToHere?: string;
}

export interface ResolveReferenceOptions {
  /**
   * Data-masking function registry to use, replacing
   * {@link DEFAULT_DATA_MASKING_FUNCTIONS} entirely (not merged) when
   * provided -- mirrors the user-configurable `havenLabels.dataMaskingFunctions`
   * setting.
   */
  dataMaskingFunctions?: readonly DataMaskingFunction[];
}

/**
 * Resolves the dataframe/column a cursor position refers to, given an R
 * document's source and a UTF-16 code-unit offset into it (e.g. from
 * `document.offsetAt(position)`).
 *
 * Parsing and tree-walking happen in Rust, on Air's R parser compiled to
 * WebAssembly (see `air-resolver/`). This one-shot form parses, resolves and
 * frees; to resolve repeatedly against an unchanged document, keep a
 * {@link parseRDocument} result and use {@link resolveInDocument} instead.
 *
 * Pure function: no dependency on `vscode`/`positron`. Returns `undefined`
 * when the offset isn't inside a supported dataframe/column reference --
 * see the "known unsupported patterns" note below, these are deliberate
 * scope limits, not bugs.
 *
 * Supported patterns, checked in this order (nearest/most-specific wins):
 *   1. Direct access: `df$col`, `df[["col"]]`, `df["col"]`.
 *   2. Calls in the data-masking function registry (dplyr/tidyr
 *      verbs, `y2clerk::freqs`, `with`/`subset`, `lm`/`glm`/`aov`,
 *      `ggplot`), with the dataframe supplied either as an explicit
 *      argument or implicitly via a `|>`/`%>%` pipe of arbitrary length.
 *
 * Known unsupported patterns (return `undefined`, not a wrong answer):
 *   - Dynamic indices, e.g. `df[[var_holding_colname]]`.
 *   - A pipeline/dataframe expression that isn't a simple identifier, e.g.
 *     `(df1 |> left_join(df2))$col` or `get("df")$col`.
 *   - Aliasing through intermediate variables across unrelated statements
 *     (e.g. `x <- df; x$col` -- `x` is not resolved back to `df`).
 *   - Quoted/string column names inside data-masking calls other than
 *     `df["col"]`/`df[["col"]]` (e.g. `select(df, "col")`).
 *   - Calls not present in the data-masking function registry.
 *   - `aggregate()`'s positional (non-`data=`) list method.
 *
 * Deliberately NOT distinguished: a "column" being created rather than
 * referenced (e.g. the `z` in `df |> mutate(z = x)`) still resolves to the
 * dataframe. Whether `z` actually exists as a column is left to the
 * R-execution layer to guard against.
 */
export function resolveReference(
  source: string,
  offset: number,
  options: ResolveReferenceOptions = {},
): ResolvedReference | undefined {
  const document = parseRDocument(source);
  const registry = createDataMaskingRegistry(options.dataMaskingFunctions);
  try {
    return resolveInDocument(document, offset, registry);
  } finally {
    document.free();
    registry.free();
  }
}

/**
 * Parses R source into a document that lives in WebAssembly memory until
 * its `free()` is called.
 */
export function parseRDocument(source: string): ParsedDocument {
  return new ParsedDocument(source);
}

/**
 * Builds the data-masking registry {@link resolveInDocument} matches calls
 * against (by unqualified name, so `dplyr::select` matches `select`; later
 * entries win on name collisions). Lives in WebAssembly memory until its
 * `free()` is called.
 */
export function createDataMaskingRegistry(
  functions: readonly DataMaskingFunction[] = DEFAULT_DATA_MASKING_FUNCTIONS,
): DataMaskingRegistry {
  return new DataMaskingRegistry([...functions]);
}

/** {@link resolveReference} against an already-parsed document and registry. */
export function resolveInDocument(
  document: ParsedDocument,
  offset: number,
  registry: DataMaskingRegistry,
): ResolvedReference | undefined {
  return document.resolve(offset, registry);
}
