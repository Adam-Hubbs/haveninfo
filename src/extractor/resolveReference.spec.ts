import { describe, expect, it } from "vitest";
import { FIXTURES } from "./fixtures";
import {
  createDataMaskingRegistry,
  parseRDocument,
  resolveInDocument,
  resolveReference,
} from "./resolveReference";

/** Fixtures only assert `{ dataframe, column }`; `expressionUpToHere` gets its own dedicated tests below. */
function dataframeAndColumn(result: ReturnType<typeof resolveReference>) {
  return result && { dataframe: result.dataframe, column: result.column };
}

describe("resolveReference", () => {
  for (const fixture of FIXTURES) {
    it(fixture.description, () => {
      const offset =
        fixture.occurrence === "last"
          ? fixture.source.lastIndexOf(fixture.needle)
          : fixture.source.indexOf(fixture.needle);
      expect(offset, `needle ${JSON.stringify(fixture.needle)} not found in source`).toBeGreaterThanOrEqual(0);

      const result = resolveReference(fixture.source, offset);

      expect(dataframeAndColumn(result)).toEqual(fixture.expected);
    });
  }
});

describe("resolveReference with a custom data-masking function registry", () => {
  it("resolves a function absent from the default registry when configured", () => {
    const source = "my_custom_verb(df, col)";

    expect(resolveReference(source, source.indexOf("col"))).toBeUndefined();

    const result = resolveReference(source, source.indexOf("col"), {
      dataMaskingFunctions: [{ name: "my_custom_verb", dataArg: { position: 0 } }],
    });
    expect(dataframeAndColumn(result)).toEqual({ dataframe: "df", column: "col" });
  });

  it("no longer resolves a default-registry function when the config replaces the list", () => {
    const source = "select(df, col)";

    expect(dataframeAndColumn(resolveReference(source, source.indexOf("col")))).toEqual({
      dataframe: "df",
      column: "col",
    });

    const result = resolveReference(source, source.indexOf("col"), {
      dataMaskingFunctions: [{ name: "my_custom_verb", dataArg: { position: 0 } }],
    });
    expect(result).toBeUndefined();
  });

  it("still resolves a custom function through a pipe without any dataArg spec", () => {
    const source = "df |> my_custom_verb(col)";

    const result = resolveReference(source, source.indexOf("col"), {
      dataMaskingFunctions: [{ name: "my_custom_verb", dataArg: {} }],
    });
    expect(dataframeAndColumn(result)).toEqual({ dataframe: "df", column: "col" });
  });

  it("matches a namespace-qualified call against an unqualified custom entry", () => {
    const source = "mypkg::my_custom_verb(df, col)";

    const result = resolveReference(source, source.indexOf("col"), {
      dataMaskingFunctions: [{ name: "my_custom_verb", dataArg: { position: 0 } }],
    });
    expect(dataframeAndColumn(result)).toEqual({ dataframe: "df", column: "col" });
  });

  it("lets later registry entries win on name collisions", () => {
    const source = "my_custom_verb(df, other, col)";

    const result = resolveReference(source, source.indexOf("col"), {
      dataMaskingFunctions: [
        { name: "my_custom_verb", dataArg: { position: 0 } },
        { name: "my_custom_verb", dataArg: { position: 1 } },
      ],
    });
    expect(dataframeAndColumn(result)).toEqual({ dataframe: "other", column: "col" });
  });
});

describe("resolveInDocument", () => {
  it("resolves repeatedly against one parsed document and registry", () => {
    const source = "df |> select(x) |> mutate(y = x)\nother$col";
    const document = parseRDocument(source);
    const registry = createDataMaskingRegistry();

    expect(resolveInDocument(document, source.indexOf("x)"), registry)).toEqual({
      dataframe: "df",
      column: "x",
      expressionUpToHere: "df",
    });
    expect(resolveInDocument(document, source.indexOf("y ="), registry)).toEqual({
      dataframe: "df",
      column: "y",
      expressionUpToHere: "df |> select(x)",
    });
    expect(resolveInDocument(document, source.indexOf("col"), registry)).toEqual({
      dataframe: "other",
      column: "col",
    });

    document.free();
    registry.free();
  });
});

describe("resolveReference expressionUpToHere", () => {
  it("is absent for direct $ access", () => {
    const source = "df$col";
    const result = resolveReference(source, source.indexOf("col"));
    expect(result?.expressionUpToHere).toBeUndefined();
  });

  it("is absent for direct [[ ]] access", () => {
    const source = `df[["col"]]`;
    const result = resolveReference(source, source.indexOf("col"));
    expect(result?.expressionUpToHere).toBeUndefined();
  });

  it("is just the raw dataframe argument for a non-piped call", () => {
    const source = "select(df, col)";
    const result = resolveReference(source, source.indexOf("col"));
    expect(result?.expressionUpToHere).toBe("df");
  });

  it("is the chain up to, but excluding, the hovered stage", () => {
    const source = "df |> mutate(new_var = other_var) |> select(new_var) |> arrange(new_var)";

    const inSelect = resolveReference(source, source.indexOf("select(new_var)") + "select(".length);
    expect(inSelect?.expressionUpToHere).toBe("df |> mutate(new_var = other_var)");

    // First stage: "the step before" is just the bare dataframe -- new_var
    // doesn't exist yet at that point, which is expected/documented.
    const inMutate = resolveReference(source, source.indexOf("mutate(new_var") + "mutate(".length);
    expect(inMutate?.expressionUpToHere).toBe("df");

    const inArrange = resolveReference(source, source.lastIndexOf("new_var"));
    expect(inArrange?.expressionUpToHere).toBe("df |> mutate(new_var = other_var) |> select(new_var)");
  });

  it("preserves multi-line formatting verbatim, up to but excluding the hovered stage", () => {
    const source = "df |>\n  filter(col > 1) |>\n  group_by(grp) |>\n  summarize(m = mean(col))";
    const result = resolveReference(source, source.lastIndexOf("col"));
    expect(result?.expressionUpToHere).toBe("df |>\n  filter(col > 1) |>\n  group_by(grp)");
  });
});
