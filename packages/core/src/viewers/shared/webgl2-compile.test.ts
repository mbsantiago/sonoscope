import { describe, expect, it } from "vitest";
import { numberedSource } from "./webgl2-compile";

describe("numberedSource", () => {
  it("adds padded one-indexed line numbers", () => {
    expect(numberedSource("first\nsecond")).toBe("  1: first\n  2: second");
  });
});
