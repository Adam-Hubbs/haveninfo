import { describe, expect, it } from "vitest";
import {
  parseDataMaskingFunctionConfigEntry,
  parseDataMaskingFunctionsConfig,
} from "./dataMaskingFunctions";

describe("parseDataMaskingFunctionConfigEntry", () => {
  it("accepts a well-formed entry", () => {
    expect(parseDataMaskingFunctionConfigEntry({ name: "select", position: 0, argName: ".data" })).toEqual({
      name: "select",
      dataArg: { position: 0, argName: ".data" },
    });
  });

  it("accepts an entry with only a name (piped-only usage)", () => {
    expect(parseDataMaskingFunctionConfigEntry({ name: "my_verb" })).toEqual({
      name: "my_verb",
      dataArg: {},
    });
  });

  it.each([
    ["not an object", "select"],
    ["null", null],
    ["missing name", { position: 0 }],
    ["non-identifier name", { name: "not a name" }],
    ["negative position", { name: "select", position: -1 }],
    ["non-integer position", { name: "select", position: 1.5 }],
    ["non-string argName", { name: "select", argName: 42 }],
    ["non-identifier argName", { name: "select", argName: "not an arg" }],
  ])("rejects %s", (_description, value) => {
    expect(parseDataMaskingFunctionConfigEntry(value)).toBeUndefined();
  });
});

describe("parseDataMaskingFunctionsConfig", () => {
  it("drops invalid entries and reports them, keeping valid ones", () => {
    const invalid: unknown[] = [];
    const result = parseDataMaskingFunctionsConfig(
      [{ name: "select", position: 0 }, "garbage", { name: "my_verb" }],
      (entry, index) => invalid.push({ entry, index }),
    );

    expect(result).toEqual([
      { name: "select", dataArg: { position: 0 } },
      { name: "my_verb", dataArg: {} },
    ]);
    expect(invalid).toEqual([{ entry: "garbage", index: 1 }]);
  });

  it("returns an empty list for a non-array value", () => {
    expect(parseDataMaskingFunctionsConfig(undefined)).toEqual([]);
    expect(parseDataMaskingFunctionsConfig("not an array")).toEqual([]);
  });
});
