import { describe, expect, it } from "vitest";
import {
	canvasToTimeFrequency,
	hzToMel,
	melToHz,
	timeFrequencyToCanvas,
} from "./frequency-scale";

const viewport = {
	startTime: 10,
	endTime: 20,
	minFrequency: 100,
	maxFrequency: 10_000,
	frequencyScale: "linear" as const,
};

describe("frequency-scale", () => {
	it("round-trips mel conversion", () => {
		expect(melToHz(hzToMel(1000))).toBeCloseTo(1000, 5);
	});

	it("maps canvas center to viewport center for linear axes", () => {
		expect(canvasToTimeFrequency(50, 50, 100, 100, viewport)).toEqual({
			time: 15,
			frequency: 5050,
		});
	});

	it("maps viewport start, midpoint, and end exactly across the canvas width", () => {
		const width = 320;
		const height = 100;

		expect(
			timeFrequencyToCanvas(
				viewport.startTime,
				viewport.minFrequency,
				width,
				height,
				viewport,
			).x,
		).toBe(0);
		expect(canvasToTimeFrequency(0, 0, width, height, viewport).time).toBe(
			viewport.startTime,
		);

		expect(
			timeFrequencyToCanvas(15, viewport.minFrequency, width, height, viewport)
				.x,
		).toBe(160);
		expect(canvasToTimeFrequency(160, 0, width, height, viewport).time).toBe(
			15,
		);

		expect(
			timeFrequencyToCanvas(
				viewport.endTime,
				viewport.minFrequency,
				width,
				height,
				viewport,
			).x,
		).toBe(320);
		expect(canvasToTimeFrequency(320, 0, width, height, viewport).time).toBe(
			viewport.endTime,
		);
	});

	it("maps fractional times with a non-zero viewport start without pixel drift", () => {
		const fractionalViewport = {
			...viewport,
			startTime: 12.25,
			endTime: 13.75,
		};
		const width = 375;
		const time = 12.625;

		const point = timeFrequencyToCanvas(
			time,
			440.5,
			width,
			140,
			fractionalViewport,
		);

		expect(point.x).toBeCloseTo(93.75, 12);
		expect(
			canvasToTimeFrequency(point.x, point.y, width, 140, fractionalViewport)
				.time,
		).toBeCloseTo(time, 12);
	});

	it("round-trips time/frequency coordinates", () => {
		const point = timeFrequencyToCanvas(12.5, 2575, 100, 100, viewport);
		expect(
			canvasToTimeFrequency(point.x, point.y, 100, 100, viewport).time,
		).toBeCloseTo(12.5);
		expect(
			canvasToTimeFrequency(point.x, point.y, 100, 100, viewport).frequency,
		).toBeCloseTo(2575);
	});
});
