#!/usr/bin/env node
// M1 throwaway feasibility spike: load the vendored grammar and parse a
// batch of representative R snippets, dumping each S-expression so we can
// confirm the node type names the extractor (M2) will rely on.
//
// Usage: node scripts/spike-parse.js

const path = require("path");
const { Parser, Language } = require("web-tree-sitter");

const GRAMMAR_PATH = path.join(__dirname, "..", "src", "ast", "grammar", "tree-sitter-r.wasm");

const SNIPPETS = [
  ["$ access", `df$col`],
  ["[[ ]] access (string)", `df[["col"]]`],
  ["[ ] access (string)", `df["col"]`],
  ["magrittr pipe + select", `df %>% select(col)`],
  [
    "native pipe, multi-step",
    `df |> filter(col > 1) |> summarize(m = mean(col))`,
  ],
  [
    "multi-line native pipe chain",
    `df |>\n  filter(col > 1) |>\n  group_by(grp) |>\n  summarize(m = mean(col))`,
  ],
  ["formula + data= in model call", `lm(y ~ x, data = df)`],
  ["with()", `with(df, col)`],
  ["nested [[ ]] with variable index", `df[[idx]]`],
  ["ggplot + aes", `ggplot(df, aes(x = col, y = other)) + geom_point()`],
];

async function main() {
  await Parser.init();
  const language = await Language.load(GRAMMAR_PATH);
  const parser = new Parser();
  parser.setLanguage(language);

  let anyError = false;

  for (const [label, code] of SNIPPETS) {
    const tree = parser.parse(code);
    const hasError = tree.rootNode.hasError;
    anyError = anyError || hasError;

    console.log("=".repeat(80));
    console.log(`${label}${hasError ? "  [PARSE ERROR]" : ""}`);
    console.log(`  source: ${JSON.stringify(code)}`);
    console.log(`  sexp:   ${tree.rootNode.toString()}`);
  }

  console.log("=".repeat(80));
  if (anyError) {
    console.error("\nOne or more snippets produced parse errors -- see above.");
    process.exitCode = 1;
  } else {
    console.log("\nAll snippets parsed without error.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
