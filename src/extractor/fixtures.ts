/**
 * R snippets + expected `resolveReference` results, used by
 * `resolveReference.test.ts`. Each fixture gives a source snippet and the
 * substring to hover (the first match of `needle` in `source` is used to
 * compute the cursor offset passed to `resolveReference`).
 *
 * `expected: undefined` means "known unsupported pattern" -- see the
 * doc-comment on `resolveReference` for the rationale in each case.
 */
export interface Fixture {
  description: string;
  source: string;
  /**
   * Substring whose start index becomes the cursor offset -- i.e. the
   * needle's first character must be the character you want to hover.
   */
  needle: string;
  /** Which occurrence of `needle` to use when it appears more than once. Defaults to "first". */
  occurrence?: "first" | "last";
  expected: { dataframe: string; column: string } | undefined;
}

export const FIXTURES: Fixture[] = [
  // --- Direct access (today's regex-parser baseline) ---
  {
    description: "$ access",
    source: `df$col`,
    needle: "col",
    expected: { dataframe: "df", column: "col" },
  },
  {
    description: "$ access, cursor on the dataframe token itself",
    source: `df$col`,
    needle: "df",
    expected: undefined,
  },
  {
    description: "[[ ]] access with a quoted column name",
    source: `df[["col"]]`,
    needle: "col",
    expected: { dataframe: "df", column: "col" },
  },
  {
    description: "[ ] access with a quoted column name",
    source: `df["col"]`,
    needle: "col",
    expected: { dataframe: "df", column: "col" },
  },
  {
    description: "[[ ]] access with a dynamic index (unsupported)",
    source: `df[[idx]]`,
    needle: "idx",
    expected: undefined,
  },
  {
    description: "[a, b] two-argument indexing (not a column reference)",
    source: `df[1, "col"]`,
    needle: "col",
    expected: undefined,
  },

  // --- Non-piped data-masking calls, explicit dataframe argument ---
  {
    description: "select() with explicit data argument",
    source: `select(df, col)`,
    needle: "col",
    expected: { dataframe: "df", column: "col" },
  },
  {
    description: "select() cursor on the dataframe argument itself",
    source: `select(df, col)`,
    needle: "df",
    expected: undefined,
  },
  {
    description: "namespaced dplyr::select()",
    source: `dplyr::select(df, col)`,
    needle: "col",
    expected: { dataframe: "df", column: "col" },
  },
  {
    description: "with()",
    source: `with(df, col)`,
    needle: "col",
    expected: { dataframe: "df", column: "col" },
  },
  {
    description: "subset()",
    source: `subset(df, col > 1)`,
    needle: "col",
    expected: { dataframe: "df", column: "col" },
  },
  {
    description: "y2clerk::freqs()",
    source: `freqs(df, col)`,
    needle: "col",
    expected: { dataframe: "df", column: "col" },
  },
  {
    description: "lm() with named data= and a formula",
    source: `lm(y ~ x, data = df)`,
    needle: "x",
    expected: { dataframe: "df", column: "x" },
  },
  {
    description: "lm() formula lhs",
    source: `lm(y ~ x, data = df)`,
    needle: "y",
    expected: { dataframe: "df", column: "y" },
  },
  {
    description: "ggplot() + aes(), column nested inside aes()",
    source: `ggplot(df, aes(x = col, y = other)) + geom_point()`,
    needle: "col",
    expected: { dataframe: "df", column: "col" },
  },

  // --- Piped calls (single and multi-stage) ---
  {
    description: "single-stage native pipe",
    source: `df |> filter(col > 1)`,
    needle: "col",
    expected: { dataframe: "df", column: "col" },
  },
  {
    description: "single-stage magrittr pipe",
    source: `df %>% select(col)`,
    needle: "col",
    expected: { dataframe: "df", column: "col" },
  },
  {
    description: "3-stage pipe, cursor in the first stage",
    source: `df |> select(x, y) |> mutate(z = x) |> arrange(x)`,
    needle: "x, y",
    expected: { dataframe: "df", column: "x" },
  },
  {
    description: "3-stage pipe, cursor on a referenced column in the middle stage",
    source: `df |> select(x, y) |> mutate(z = x) |> arrange(x)`,
    needle: "x)",
    occurrence: "first",
    expected: { dataframe: "df", column: "x" },
  },
  {
    description: "3-stage pipe, cursor on a newly-created column name (allowed; not guarded here)",
    source: `df |> select(x, y) |> mutate(z = x) |> arrange(x)`,
    needle: "z =",
    expected: { dataframe: "df", column: "z" },
  },
  {
    description: "3-stage pipe, cursor in the final stage",
    source: `df |> select(x, y) |> mutate(z = x) |> arrange(x)`,
    needle: "x)",
    occurrence: "last",
    expected: { dataframe: "df", column: "x" },
  },
  {
    description: "multi-line pipe chain",
    source: `df |>\n  filter(col > 1) |>\n  group_by(grp) |>\n  summarize(m = mean(col))`,
    needle: "col)",
    expected: { dataframe: "df", column: "col" },
  },

  // --- Known unsupported patterns ---
  {
    description: "call not in the data-masking registry",
    source: `do.call(select, list(df, col))`,
    needle: "col",
    expected: undefined,
  },
  {
    description: "quoted tidyselect column name (not bracket access)",
    source: `select(df, "col")`,
    needle: "col",
    expected: undefined,
  },
  {
    description: "dataframe expression more complex than a bare identifier",
    source: `(df1 |> left_join(df2))$col`,
    needle: "col",
    expected: undefined,
  },
];
