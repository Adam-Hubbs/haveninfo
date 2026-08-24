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
