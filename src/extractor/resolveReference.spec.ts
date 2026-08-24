import { describe, expect, it } from "vitest";
import { parseR } from "../ast/treeSitterService";
import { FIXTURES } from "./fixtures";
import { resolveReference } from "./resolveReference";

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

      expect(result).toEqual(fixture.expected);
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
    expect(result).toEqual({ dataframe: "df", column: "col" });
  });

  it("no longer resolves a default-registry function when the config replaces the list", async () => {
    const source = "select(df, col)";
    const tree = await parseR(source);

    expect(resolveReference(tree, source.indexOf("col"))).toEqual({ dataframe: "df", column: "col" });

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
    expect(result).toEqual({ dataframe: "df", column: "col" });
  });
});
