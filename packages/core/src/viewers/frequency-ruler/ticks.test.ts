import { describe, expect, it } from "vitest";
import { computeFrequencyTicks, formatFrequencyLabel } from "./ticks";

describe("FrequencyRuler tick utilities", () => {
  it("computes linear frequency ticks", () => {
    const { majorTicks } = computeFrequencyTicks(0, 20000, 400, "linear");
    expect(majorTicks).toContain(0);
    expect(majorTicks).toContain(5000);
    expect(majorTicks).toContain(10000);
    expect(majorTicks).toContain(20000);
  });

  it("computes mel scale frequency ticks", () => {
    const { majorTicks } = computeFrequencyTicks(0, 22050, 400, "mel");
    expect(majorTicks.length).toBeGreaterThan(4);
    expect(majorTicks).toContain(1000);
    expect(majorTicks).toContain(20000);
  });

  it("computes log scale frequency ticks", () => {
    const { majorTicks } = computeFrequencyTicks(20, 20000, 400, "log");
    expect(majorTicks.length).toBeGreaterThan(3);
    expect(majorTicks).toContain(100);
    expect(majorTicks).toContain(1000);
    expect(majorTicks).toContain(10000);
  });

  it("formats frequency labels cleanly", () => {
    expect(formatFrequencyLabel(0, "auto")).toBe("0 Hz");
    expect(formatFrequencyLabel(440, "auto")).toBe("440 Hz");
    expect(formatFrequencyLabel(1000, "auto")).toBe("1 kHz");
    expect(formatFrequencyLabel(2500, "auto")).toBe("2.5 kHz");
    expect(formatFrequencyLabel(10000, "auto")).toBe("10 kHz");
    expect(formatFrequencyLabel(1000, "hz")).toBe("1000 Hz");
    expect(formatFrequencyLabel(2500, "khz")).toBe("2.50 kHz");
  });

  it("supports custom formatting functions", () => {
    const custom = (hz: number) => `${(hz / 1000).toFixed(0)}k`;
    expect(formatFrequencyLabel(5000, custom)).toBe("5k");
  });
});
