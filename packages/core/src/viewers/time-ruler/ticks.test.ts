import { describe, expect, it } from "vitest";
import { computeTimeTicks, formatTimeLabel } from "./ticks";

describe("TimeRuler tick utilities", () => {
  it("computes reasonable major and minor steps for given viewport and width", () => {
    const { majorStep, minorStep, majorTicks, minorTicks } = computeTimeTicks(
      0,
      10,
      1000,
    );
    expect(majorStep).toBe(1);
    expect(minorStep).toBe(0.2);
    expect(majorTicks).toContain(0);
    expect(majorTicks).toContain(5);
    expect(majorTicks).toContain(10);
    expect(minorTicks.length).toBeGreaterThan(majorTicks.length);
  });

  it("handles small sub-second intervals", () => {
    const { majorStep, minorStep, majorTicks } = computeTimeTicks(
      0.05,
      0.15,
      1000,
    );
    expect(majorStep).toBeLessThanOrEqual(0.02);
    expect(minorStep).toBeLessThan(majorStep);
    expect(majorTicks.length).toBeGreaterThanOrEqual(2);
  });

  it("handles long minute/hour intervals", () => {
    const { majorStep, majorTicks } = computeTimeTicks(0, 3600 * 5, 1000);
    expect(majorStep).toBeGreaterThanOrEqual(1800); // 30m or 1h
    expect(majorTicks).toContain(0);
  });

  it("formats time labels cleanly across sub-second, seconds, and minutes", () => {
    expect(formatTimeLabel(0.5, 0.1, "auto")).toBe("0.5s");
    expect(formatTimeLabel(0.005, 0.001, "auto")).toBe("0.005s");
    expect(formatTimeLabel(5, 1, "auto")).toBe("5s");
    expect(formatTimeLabel(65, 1, "auto")).toBe("1:05");
    expect(formatTimeLabel(3665, 1, "auto")).toBe("1:01:05");
    expect(formatTimeLabel(65, 1, "timecode")).toBe("00:01:05");
    expect(formatTimeLabel(1500 * 3600, 3600, "hhmmss")).toBe("1500:00:00");
  });

  it("supports custom formatter functions", () => {
    const custom = (sec: number) => `${sec.toFixed(1)} sec`;
    expect(formatTimeLabel(12.34, 1, custom)).toBe("12.3 sec");
  });
});
