import type { Node, Tree } from "web-tree-sitter";
import {
  createDataMaskingFunctionLookup,
  DEFAULT_DATA_MASKING_FUNCTIONS,
  type DataMaskingFunction,
} from "./dataMaskingFunctions";

export interface ResolvedReference {
  dataframe: string;
  column: string;
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
 * Resolves the dataframe/column a cursor position refers to, given a
 * tree-sitter parse `Tree` for an R document and a UTF-16 code-unit offset
 * into that document's source (e.g. from `document.offsetAt(position)`).
 *
 * Pure function: no dependency on `vscode`/`positron`. Returns `undefined`
 * when the offset isn't inside a supported dataframe/column reference --
 * see the "known unsupported patterns" note below, these are deliberate
 * scope limits, not bugs.
 *
 * Supported patterns, checked in this order (nearest/most-specific wins):
 *   1. Direct access: `df$col`, `df[["col"]]`, `df["col"]`.
 *   2. Calls in the {@link lookupDataMaskingFunction} registry (dplyr/tidyr
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
  tree: Tree,
  offset: number,
  options: ResolveReferenceOptions = {},
): ResolvedReference | undefined {
  const leaf = tree.rootNode.descendantForIndex(offset, offset + 1);
  if (!leaf) {
    return undefined;
  }

  if (leaf.type === "identifier") {
    const dollar = resolveDollarAccess(leaf);
    if (dollar !== NOT_APPLICABLE) {
      return dollar;
    }
  }

  if (leaf.type === "identifier" || leaf.type === "string_content") {
    const bracket = resolveBracketAccess(leaf);
    if (bracket !== NOT_APPLICABLE) {
      return bracket;
    }
  }

  if (leaf.type !== "identifier") {
    return undefined;
  }

  const lookupDataMaskingFunction = createDataMaskingFunctionLookup(
    options.dataMaskingFunctions ?? DEFAULT_DATA_MASKING_FUNCTIONS,
  );
  return resolveDataMaskingCall(leaf, lookupDataMaskingFunction);
}

/** Sentinel distinguishing "not this kind of node" from "recognized, but no result". */
const NOT_APPLICABLE = Symbol("not-applicable");
type MaybeResolved = ResolvedReference | undefined | typeof NOT_APPLICABLE;

function resolveDollarAccess(leaf: Node): MaybeResolved {
  const parent = leaf.parent;
  if (!parent || parent.type !== "extract_operator") {
    return NOT_APPLICABLE;
  }

  const rhs = parent.childForFieldName("rhs");
  if (rhs && leaf.equals(rhs)) {
    const lhs = parent.childForFieldName("lhs");
    if (lhs && lhs.type === "identifier") {
      return { dataframe: lhs.text, column: leaf.text };
    }
    // Dataframe side is a more complex expression (e.g. `(df1 |>
    // left_join(df2))$col`) -- unsupported.
    return undefined;
  }

  // Cursor is on the lhs (the dataframe/list token itself): not a column.
  return undefined;
}

function resolveBracketAccess(leaf: Node): MaybeResolved {
  // Climb from the leaf to the nearest `argument`, then check whether that
  // argument's parent chain leads directly to a `subset`/`subset2` node
  // (single-argument bracket access only -- `df[a, b]` matrix-style
  // indexing isn't a column reference).
  const argument = findAncestor(leaf, "argument");
  if (!argument) {
    return NOT_APPLICABLE;
  }

  const argumentsNode = argument.parent;
  if (!argumentsNode || argumentsNode.type !== "arguments") {
    return NOT_APPLICABLE;
  }

  const subsetNode = argumentsNode.parent;
  if (!subsetNode || (subsetNode.type !== "subset" && subsetNode.type !== "subset2")) {
    return NOT_APPLICABLE;
  }

  // Only handle the single-argument form: `df["col"]` / `df[["col"]]`.
  if (countArguments(argumentsNode) !== 1) {
    return undefined;
  }

  const dataframeNode = subsetNode.childForFieldName("function");
  if (!dataframeNode || dataframeNode.type !== "identifier") {
    return undefined;
  }

  const value = argument.childForFieldName("value");
  if (!value) {
    return undefined;
  }

  if (value.type === "string") {
    const content = value.childForFieldName("content");
    if (content && leaf.equals(content)) {
      return { dataframe: dataframeNode.text, column: content.text };
    }
    return undefined;
  }

  // e.g. `df[[idx]]` -- dynamic index, unsupported.
  return undefined;
}

function resolveDataMaskingCall(
  leaf: Node,
  lookupDataMaskingFunction: (functionName: string) => { position?: number; argName?: string } | undefined,
): ResolvedReference | undefined {
  let call = findAncestor(leaf, "call");
  while (call) {
    const functionNode = call.childForFieldName("function");
    const argumentsNode = call.childForFieldName("arguments");

    if (functionNode && argumentsNode && !leaf.equals(functionNode)) {
      const dataArg = lookupDataMaskingFunction(functionNode.text);
      if (dataArg) {
        const dataframeNode = isPipedCall(call)
          ? resolvePipelineRoot(call)
          : findExplicitDataArgument(argumentsNode, dataArg)?.identifier;
        const excludedArgument = isPipedCall(call)
          ? undefined
          : findExplicitDataArgument(argumentsNode, dataArg)?.argument;

        if (
          dataframeNode &&
          isWithin(argumentsNode, leaf) &&
          !(excludedArgument && isWithin(excludedArgument, leaf))
        ) {
          return { dataframe: dataframeNode.text, column: leaf.text };
        }

        // Nearest matching call didn't yield a result (e.g. leaf is the
        // dataframe argument itself, or the data arg couldn't be found for
        // a non-piped call) -- deliberately stop rather than keep climbing
        // past a call we recognize, to avoid surprising outer matches.
        return undefined;
      }
    }

    call = findAncestor(call.parent, "call");
  }

  return undefined;
}

function findExplicitDataArgument(
  argumentsNode: Node,
  spec: { position?: number; argName?: string },
): { identifier: Node; argument: Node } | undefined {
  const argumentNodes = namedChildrenOfType(argumentsNode, "argument");

  if (spec.argName) {
    for (const argument of argumentNodes) {
      const name = argument.childForFieldName("name");
      if (name && name.text === spec.argName) {
        const value = argument.childForFieldName("value");
        if (value && value.type === "identifier") {
          return { identifier: value, argument };
        }
        return undefined;
      }
    }
  }

  if (spec.position !== undefined) {
    const unnamedArguments = argumentNodes.filter((argument) => !argument.childForFieldName("name"));
    const argument = unnamedArguments[spec.position];
    if (argument) {
      const value = argument.childForFieldName("value");
      if (value && value.type === "identifier") {
        return { identifier: value, argument };
      }
    }
  }

  return undefined;
}

function isPipedCall(call: Node): boolean {
  const parent = call.parent;
  if (!parent || parent.type !== "binary_operator") {
    return false;
  }
  const rhs = parent.childForFieldName("rhs");
  return !!rhs && call.equals(rhs) && isPipeOperator(parent);
}

function isPipeOperator(binaryOperator: Node): boolean {
  const operator = binaryOperator.childForFieldName("operator");
  if (!operator) {
    return false;
  }
  return operator.type === "|>" || operator.text === "%>%";
}

/**
 * Given a call known to be fed by a pipe (see {@link isPipedCall}), walks
 * back through the (possibly multi-stage) pipe chain feeding it to find the
 * original dataframe identifier. Left-associativity means each pipe stage
 * nests one level deeper as the `lhs` of the previous stage's
 * `binary_operator`, so this only ever needs to descend, never climb past
 * `call.parent`.
 */
function resolvePipelineRoot(call: Node): Node | undefined {
  let current: Node | null = call.parent!.childForFieldName("lhs");
  while (current && current.type === "binary_operator" && isPipeOperator(current)) {
    current = current.childForFieldName("lhs");
  }
  return current && current.type === "identifier" ? current : undefined;
}

function findAncestor(node: Node | null, type: string): Node | null {
  let current = node;
  while (current && current.type !== type) {
    current = current.parent;
  }
  return current;
}

function namedChildrenOfType(node: Node, type: string): Node[] {
  const result: Node[] = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child && child.type === type) {
      result.push(child);
    }
  }
  return result;
}

function countArguments(argumentsNode: Node): number {
  return namedChildrenOfType(argumentsNode, "argument").length;
}

function isWithin(ancestor: Node, node: Node): boolean {
  return ancestor.startIndex <= node.startIndex && node.endIndex <= ancestor.endIndex;
}
