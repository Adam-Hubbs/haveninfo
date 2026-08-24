# Haven Info

A Positron extension that shows [haven](https://haven.tidyverse.org/) variable
labels on hover in R source files. Hover over a column reference like
`df$age` or a bare column name inside a piped `dplyr`/`tidyr` call, and — if
that column is `haven::labelled` in your running R session — its `label`
attribute shows up as a tooltip.

## How it works

```
document text
      │
      ▼
tree-sitter (web-tree-sitter + a vendored R grammar)
      │  parses the whole document into a real R AST
      ▼
resolveReference(tree, offset)          src/extractor/
      │  pure function: cursor offset -> { dataframe, column } | undefined
      │  understands $ / [[ ]] / [ ] access, and a maintained registry of
      │  "data-masking" calls (dplyr, tidyr, y2clerk::freqs, with/subset,
      │  lm/glm/aov, ggplot), including through arbitrarily long |>/%>% pipes
      ▼
HavenLabels.getDataFrameColumnLabel     src/providers/havenLabels.ts
      │  silently evaluates a small, guarded R snippet in the user's own
      │  foreground R session (positron.runtime.evaluateCode) -- never
      │  starts a session, never prints to the console, never throws
      ▼
vscode.Hover("Haven label: ...")
```

See `src/ast/grammar/NOTES.md` for the tree-sitter node shapes the extractor
relies on, and `src/extractor/dataMaskingFunctions.ts` for the exact list of
supported R calls.

### Known scope limits

`resolveReference` deliberately does *not* try to resolve every possible R
expression. In particular:

- Dynamic indices (`df[[var_holding_colname]]`) aren't resolved.
- A dataframe expression that isn't a simple identifier (e.g.
  `(df1 |> left_join(df2))$col`, or aliasing through an intermediate
  variable in an earlier statement) isn't resolved.
- Only calls in the registry in `dataMaskingFunctions.ts` are recognized —
  this is a fixed, maintained allow-list, not an open-ended heuristic.
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
