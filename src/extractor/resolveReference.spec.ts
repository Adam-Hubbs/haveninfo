import { describe, expect, it } from "vitest";
import { parseR } from "../ast/treeSitterService";
import { FIXTURES } from "./fixtures";
import { resolveReference } from "./resolveReference";

/** Fixtures only assert `{ dataframe, column }`; `expressionUpToHere` gets its own dedicated tests below. */
function dataframeAndColumn(result: ReturnType<typeof resolveReference>) {
  return result && { dataframe: result.dataframe, column: result.column };
}

describe("resolveReference", () => {
  for (const fixture of FIXTURES) {
    it(fixture.description, async () => {
      const offset =
        fixture.occurrence === "last"
          ? fixture.source.lastIndexOf(fixture.needle)
          : fixture.source.indexOf(fixture.needle);
      expect(offset, `needle ${JSON.stringify(fixture.needle)} not found in source`).toBeGreaterThanOrEqual(0);

      const tree = await parseR(fixture.source);
      const result = resolveReference(tree, offset);

      expect(dataframeAndColumn(result)).toEqual(fixture.expected);
    });
  }
});

describe("resolveReference with a custom data-masking function registry", () => {
  it("resolves a function absent from the default registry when configured", async () => {
    const source = "my_custom_verb(df, col)";
    const tree = await parseR(source);

    expect(resolveReference(tree, source.indexOf("col"))).toBeUndefined();

    const result = resolveReference(tree, source.indexOf("col"), {
      dataMaskingFunctions: [{ name: "my_custom_verb", dataArg: { position: 0 } }],
    });
    expect(dataframeAndColumn(result)).toEqual({ dataframe: "df", column: "col" });
  });

  it("no longer resolves a default-registry function when the config replaces the list", async () => {
    const source = "select(df, col)";
    const tree = await parseR(source);

    expect(dataframeAndColumn(resolveReference(tree, source.indexOf("col")))).toEqual({
      dataframe: "df",
      column: "col",
    });

    const result = resolveReference(tree, source.indexOf("col"), {
      dataMaskingFunctions: [{ name: "my_custom_verb", dataArg: { position: 0 } }],
    });
    expect(result).toBeUndefined();
  });

  it("still resolves a custom function through a pipe without any dataArg spec", async () => {
    const source = "df |> my_custom_verb(col)";
    const tree = await parseR(source);

    const result = resolveReference(tree, source.indexOf("col"), {
      dataMaskingFunctions: [{ name: "my_custom_verb", dataArg: {} }],
    });
    expect(dataframeAndColumn(result)).toEqual({ dataframe: "df", column: "col" });
  });
});

describe("resolveReference expressionUpToHere", () => {
  it("is absent for direct $ access", async () => {
    const source = "df$col";
    const tree = await parseR(source);
    const result = resolveReference(tree, source.indexOf("col"));
    expect(result?.expressionUpToHere).toBeUndefined();
  });

  it("is absent for direct [[ ]] access", async () => {
    const source = `df[["col"]]`;
    const tree = await parseR(source);
    const result = resolveReference(tree, source.indexOf("col"));
    expect(result?.expressionUpToHere).toBeUndefined();
  });

  it("is just the raw dataframe argument for a non-piped call", async () => {
    const source = "select(df, col)";
    const tree = await parseR(source);
    const result = resolveReference(tree, source.indexOf("col"));
    expect(result?.expressionUpToHere).toBe("df");
  });

  it("is the chain up to, but excluding, the hovered stage", async () => {
    const source = "df |> mutate(new_var = other_var) |> select(new_var) |> arrange(new_var)";
    const tree = await parseR(source);

    const inSelect = resolveReference(tree, source.indexOf("select(new_var)") + "select(".length);
    expect(inSelect?.expressionUpToHere).toBe("df |> mutate(new_var = other_var)");

    // First stage: "the step before" is just the bare dataframe -- new_var
    // doesn't exist yet at that point, which is expected/documented.
    const inMutate = resolveReference(tree, source.indexOf("mutate(new_var") + "mutate(".length);
    expect(inMutate?.expressionUpToHere).toBe("df");

    const inArrange = resolveReference(tree, source.lastIndexOf("new_var"));
    expect(inArrange?.expressionUpToHere).toBe("df |> mutate(new_var = other_var) |> select(new_var)");
  });

  it("preserves multi-line formatting verbatim, up to but excluding the hovered stage", async () => {
    const source = "df |>\n  filter(col > 1) |>\n  group_by(grp) |>\n  summarize(m = mean(col))";
    const tree = await parseR(source);
    const result = resolveReference(tree, source.lastIndexOf("col"));
    expect(result?.expressionUpToHere).toBe("df |>\n  filter(col > 1) |>\n  group_by(grp)");
  });
});
