# Haven Info

A Positron extension that shows [haven](https://haven.tidyverse.org/) variable
and value labels on hover in R source files. Hover over a column reference
like `df$age` or a bare column name inside a piped `dplyr`/`tidyr` call, and —
if that column is `haven::labelled` in your running R session — its metadata
shows up as a tooltip.

## How it works

```
document text
      │
      ▼
tree-sitter (web-tree-sitter + a vendored R grammar)
      │  parses the whole document into a real R AST
      ▼
resolveReference(tree, offset, options)          src/extractor/
      │  pure function: cursor offset -> { dataframe, column } | undefined
      │  understands $ / [[ ]] / [ ] access, and a registry of
      │  "data-masking" calls (dplyr, tidyr, y2clerk::freqs, with/subset,
      │  lm/glm/aov, ggplot by default -- see Settings below), including
      │  through arbitrarily long |>/%>% pipes
      ▼
HavenLabels.getDataFrameColumnInfo     src/providers/havenLabels.ts
      │  silently evaluates a small, guarded R snippet in the user's own
      │  foreground R session (positron.runtime.evaluateCode) -- never
      │  starts a session, never prints to the console, never throws.
      │  Returns the variable `label` and/or the value-label map, if any.
      ▼
renderHoverContent(info, options)      src/providers/renderHoverContent.ts
      │  pure function: builds Markdown for "short" (label only) or "full"
      │  (label + a value-labels table, truncated to a configurable count)
      ▼
vscode.Hover(markdown)
```

See `src/ast/grammar/NOTES.md` for the tree-sitter node shapes the extractor
relies on, and `src/extractor/dataMaskingFunctions.ts` for the built-in list
of supported R calls (fully overridable -- see Settings).

## Settings

All under the `havenLabels.*` namespace (Settings UI: search "Haven Labels"):

| Setting | Default | What it does |
|---|---|---|
| `havenLabels.outputMode` | `"short"` | `"short"` shows just the variable label. `"full"` also shows a table of value labels beneath it. |
| `havenLabels.maxValueLabels` | `10` | In `"full"` mode, how many value labels to show before truncating with a "...and N more" note. |
| `havenLabels.dataMaskingFunctions` | the built-in dplyr/tidyr/etc. list | The R functions treated as data-masking calls when resolving a column reference. **This setting fully replaces the built-in list, it does not merge with it** — copy the default from the Settings UI/`package.json` as a starting point if you just want to add one function. Each entry is `{ "name": "select", "position": 0, "argName": ".data" }`; `position`/`argName` are both optional and only matter for *non-piped* calls (`select(df, x)`) — a function with neither is still recognized when piped (`df \|> select(x)`). |
| `havenLabels.debug` | `false` | Logs verbose diagnostics (including why a hover lookup silently failed) to the "Haven Labels" output channel. |

### Known scope limits

`resolveReference` deliberately does *not* try to resolve every possible R
expression. In particular:

- Dynamic indices (`df[[var_holding_colname]]`) aren't resolved.
- A dataframe expression that isn't a simple identifier (e.g.
  `(df1 |> left_join(df2))$col`, or aliasing through an intermediate
  variable in an earlier statement) isn't resolved.
- Only calls in the `havenLabels.dataMaskingFunctions` registry are
  recognized — a maintained (and user-configurable) allow-list, not an
  open-ended "any call with a dataframe-looking first arg" heuristic.
- A column that doesn't actually exist on the resolved dataframe (e.g. `z`
  in `df |> mutate(z = x)`) is still *offered* for lookup; whether a label
  is actually shown is left entirely to the R-side query in
  `havenLabels.ts`, which resolves to nothing for a nonexistent column.

These all fail silently (no hover shown), never with an error.

## Development

### Setup

```bash
npm install
```

### Scripts

| Script | What it does |
|---|---|
| `npm run compile` | `tsc` + copies the vendored grammar wasm into `out/` |
| `npm run watch` | `tsc -watch` (does **not** re-copy the wasm -- rerun `compile` after touching the grammar) |
| `npm run lint` | ESLint |
| `npm run test:unit` | Fast, plain-Node `vitest` tests for the pure extractor (`src/extractor/*.spec.ts`) |
| `npm test` | Full `vscode-test`/Mocha integration suite in a real Extension Development Host (`src/test/**/*.test.ts`) |
| `npm run sync-grammar` | Re-copies `tree-sitter-r.wasm` from the pinned `@davisvaughan/tree-sitter-r` npm package after bumping its version |

Unit tests (`*.spec.ts`, vitest) and integration tests (`*.test.ts`, Mocha)
are intentionally named differently so `tsc`/`vitest` each pick up only the
files meant for them.

### Running the extension locally

1. Open this folder in Positron.
2. Open the Run and Debug panel, select **"Run Extension"**, press `F5`.
3. In the new "Extension Development Host" window, open an `.R` file with an
   active R session, create a `haven`-labelled data frame, and hover over a
   column reference.

Note: `vscode-test`'s integration harness runs vanilla VS Code, which has no
`positron` module -- it can only verify that hovering fails gracefully when
no R session is reachable, not that a real label renders. Manually testing
in Positron (above) is the only way to confirm the full round trip.

### Updating the grammar

The R grammar is vendored from the `@davisvaughan/tree-sitter-r` npm
package (pinned to an exact version in `package.json`) rather than built
locally -- see `src/ast/grammar/NOTES.md`. To bump it:

```bash
npm install @davisvaughan/tree-sitter-r@<new-version> --save-dev --save-exact
npm run sync-grammar
npm run test:unit
```

## Packaging

```bash
npx vsce package
```

`.vscodeignore` trims the package down to the compiled `out/` tree, the
vendored grammar wasm, and the two runtime `dependencies`
(`@posit-dev/positron`, `web-tree-sitter`) -- no dev tooling, no source
`.ts` files, no test files.

## License

MIT. See `LICENSE`.
