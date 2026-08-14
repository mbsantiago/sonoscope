import { describe, expect, it } from "vitest";
import { Spectrogram, useSpectrogram } from "./index";

describe("@sonogram/react", () => {
  it("exports useSpectrogram hook and Spectrogram component", () => {
    expect(typeof useSpectrogram).toBe("function");
    expect(typeof Spectrogram).toBe("object");
  });
});
