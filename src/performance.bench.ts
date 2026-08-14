import { bench, describe } from "vitest";
import { MainThreadComputeBackend } from "./backend";
import { CanvasSpectrogramRenderer } from "./renderers/canvas";
import { computeStftMatrix } from "./stft";
import type { AudioSource, SpectrogramMatrix, StftConfig } from "./types";

const sampleRate = 48_000;
const durationSeconds = 2;

function samples(length: number): Float32Array {
	return Float32Array.from({ length }, (_, index) =>
		Math.sin((2 * Math.PI * 440 * index) / sampleRate),
	);
}

function source(data: Float32Array): AudioSource {
	return {
		id: "synthetic:48000:2",
		sampleRate,
		duration: durationSeconds,
		channelCount: 1,
		read: ({ startTime, endTime }) =>
			data.slice(
				Math.floor(startTime * sampleRate),
				Math.ceil(endTime * sampleRate),
			),
	};
}

const configs: StftConfig[] = [
	{ windowSize: 1024, fftSize: 1024, hopSize: 256, window: "hann" },
	{ windowSize: 2048, fftSize: 2048, hopSize: 512, window: "hann" },
];

const data = samples(sampleRate * durationSeconds);
const audioSource = source(data);
const renderMatrix = computeStftMatrix(data, {
	channel: 0,
	timeStart: 0,
	sampleRate,
	stft: { windowSize: 1024, fftSize: 1024, hopSize: 256, window: "hann" },
});

describe("STFT compute", () => {
	for (const stft of configs) {
		bench(`computeStftMatrix fft=${stft.fftSize} hop=${stft.hopSize}`, () => {
			computeStftMatrix(data, { channel: 0, timeStart: 0, sampleRate, stft });
		});
	}
});

describe("MainThreadComputeBackend", () => {
	for (const stft of configs) {
		bench(`computeTile fft=${stft.fftSize} hop=${stft.hopSize}`, async () => {
			await new MainThreadComputeBackend().computeTile({
				source: audioSource,
				channel: 0,
				timeStart: 0,
				timeEnd: durationSeconds,
				stft,
			});
		});
	}
});

describe("CanvasSpectrogramRenderer paint", () => {
	bench("paint 400x240 one tile", () => {
		paint(renderMatrix, 400, 240);
	});

	bench("paint 800x480 one tile", () => {
		paint(renderMatrix, 800, 480);
	});
});

function paint(matrix: SpectrogramMatrix, width: number, height: number): void {
	new CanvasSpectrogramRenderer().render({
		canvas: canvas(width, height),
		viewport: {
			startTime: 0,
			endTime: durationSeconds,
			minFrequency: 0,
			maxFrequency: sampleRate / 2,
			frequencyScale: "linear",
		},
		valueScale: { mode: "db", min: -100, max: 0, gamma: 1, clamp: true },
		colorMap: "viridis",
		tiles: [matrix],
	});
}

function canvas(width: number, height: number): HTMLCanvasElement {
	const context = {
		setTransform: () => undefined,
		clearRect: () => undefined,
		createImageData: (w: number, h: number) => ({
			width: w,
			height: h,
			data: new Uint8ClampedArray(w * h * 4),
		}),
		putImageData: () => undefined,
		save: () => undefined,
		restore: () => undefined,
		beginPath: () => undefined,
		moveTo: () => undefined,
		lineTo: () => undefined,
		stroke: () => undefined,
	};
	return {
		width,
		height,
		getBoundingClientRect: () => ({ width, height }),
		getContext: () => context,
	} as unknown as HTMLCanvasElement;
}
