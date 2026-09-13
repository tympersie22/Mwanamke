import { describe, expect, it } from "vitest";
import { en, sw } from "../src/index";

describe("bilingual resources", () => {
  it("keeps English and Kiswahili key sets identical", () => {
    expect(Object.keys(sw).sort()).toEqual(Object.keys(en).sort());
  });

  it("does not ship blank visible strings", () => {
    for (const [key, value] of [...Object.entries(en), ...Object.entries(sw)]) {
      expect(value.trim(), key).not.toBe("");
    }
  });
});
