import { describe, expect, it } from "vitest";
import { buildColorMap, parseColor } from "./colormap";

describe("colormap", () => {
	it("parses hex colors to rgba bytes", () => {
		expect(parseColor("#336699")).toEqual([51, 102, 153, 255]);
	});

	it("builds named maps with 256 entries", () => {
		expect(buildColorMap("viridis")).toHaveLength(256);
		expect(buildColorMap("gray")[0]).toEqual([0, 0, 0, 255]);
		expect(buildColorMap("gray")[255]).toEqual([255, 255, 255, 255]);
	});

	it("interpolates custom points", () => {
		const map = buildColorMap({
			points: [
				{ at: 0, color: "#000000" },
				{ at: 1, color: "#ffffff" },
			],
		});
		expect(map[128]?.[0]).toBeGreaterThan(120);
		expect(map[128]?.[0]).toBeLessThan(136);
	});
});
