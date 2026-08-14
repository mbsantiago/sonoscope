import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpectrogramComputeBackend } from "./backend";
import type { AudioSource, SpectrogramMatrix } from "./types";
import { SpectrogramViewer } from "./viewer";

type AudioFixture = HTMLAudioElement & {
	paused: boolean;
	emit(name: string): void;
	listenerCount(): number;
};

function audio(): AudioFixture {
	const listeners = new Map<string, () => void>();
	return {
		currentTime: 0,
		duration: 10,
		src: "fixture.wav",
		currentSrc: "fixture.wav",
		paused: true,
		addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
		removeEventListener: (name: string) => listeners.delete(name),
		emit: (name: string) => listeners.get(name)?.(),
		listenerCount: () => listeners.size,
	} as unknown as AudioFixture;
}

function canvas(): HTMLCanvasElement {
	return {
		width: 100,
		height: 100,
		getBoundingClientRect: () => ({ width: 100, height: 100 }),
		getContext: () => ({
			setTransform: vi.fn(),
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			fillText: vi.fn(),
			createImageData: (w: number, h: number) => ({
				width: w,
				height: h,
				data: new Uint8ClampedArray(w * h * 4),
			}),
			putImageData: vi.fn(),
			save: vi.fn(),
			restore: vi.fn(),
			beginPath: vi.fn(),
			moveTo: vi.fn(),
			lineTo: vi.fn(),
			stroke: vi.fn(),
		}),
	} as unknown as HTMLCanvasElement;
}

const source: AudioSource = {
	id: "s",
	sampleRate: 100,
	duration: 10,
	channelCount: 1,
	read: () => new Float32Array(100),
};

function matrix(timeStart: number, timeEnd: number): SpectrogramMatrix {
	return {
		channel: 0,
		timeStart,
		timeEnd,
		frameStart: 0,
		frameCount: 1,
		binCount: 1,
		sampleRate: 100,
		times: Float32Array.from([timeStart]),
		frequencies: Float32Array.from([0]),
		magnitude: Float32Array.from([1]),
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	delete (globalThis as Partial<typeof globalThis>).requestAnimationFrame;
	delete (globalThis as Partial<typeof globalThis>).cancelAnimationFrame;
});

describe("playback sync", () => {
	it("updates viewport when follow is enabled and seeked fires", async () => {
		const element = audio();
		const viewer = await SpectrogramViewer.create({
			audio: element,
			canvas: canvas(),
			source,
			viewport: { startTime: 0, endTime: 2, minFrequency: 0, maxFrequency: 50 },
			playback: { follow: true, renderOnSeek: false },
		});
		element.currentTime = 5;
		element.emit("seeked");
		expect(viewer.getViewport().startTime).toBeGreaterThan(3);
	});

	it("renders when seeked fires and renderOnSeek is enabled", async () => {
		const element = audio();
		const viewer = await SpectrogramViewer.create({
			audio: element,
			canvas: canvas(),
			source,
			playback: { renderOnSeek: true },
		});
		const render = vi.spyOn(viewer, "render").mockResolvedValue();
		element.emit("seeked");
		await Promise.resolve();
		expect(render).toHaveBeenCalledTimes(1);
	});

	it("renders when seeking fires before seeked", async () => {
		const element = audio();
		const viewer = await SpectrogramViewer.create({
			audio: element,
			canvas: canvas(),
			source,
			playback: { renderOnSeek: true },
		});
		const render = vi.spyOn(viewer, "render").mockResolvedValue();

		element.emit("seeking");
		await Promise.resolve();

		expect(render).toHaveBeenCalledTimes(1);
	});

	it("coalesces repeated requested renders", async () => {
		const viewer = await SpectrogramViewer.create({ canvas: canvas(), source });
		const render = vi.spyOn(viewer, "render").mockResolvedValue();

		viewer.requestRender();
		viewer.requestRender();
		await Promise.resolve();

		expect(render).toHaveBeenCalledTimes(1);
	});

	it("refreshes the playhead during playback and stops on pause", async () => {
		const element = audio();
		let frame: FrameRequestCallback | undefined;
		globalThis.requestAnimationFrame = () => 0;
		globalThis.cancelAnimationFrame = () => undefined;
		const request = vi
			.spyOn(globalThis, "requestAnimationFrame")
			.mockImplementation((callback) => {
				frame = callback;
				return 1;
			});
		const cancel = vi
			.spyOn(globalThis, "cancelAnimationFrame")
			.mockImplementation(() => undefined);
		const viewer = await SpectrogramViewer.create({
			audio: element,
			canvas: canvas(),
			source,
		});
		await viewer.render();
		const render = vi.spyOn(viewer, "render").mockResolvedValue();

		element.emit("play");
		frame?.(0);
		element.emit("pause");

		expect(request).toHaveBeenCalledTimes(2);
		expect(render).not.toHaveBeenCalled();
		expect(cancel).toHaveBeenCalledWith(1);
	});

	it("emits playback frame cadence profiles", async () => {
		const element = audio();
		let frame: FrameRequestCallback | undefined;
		globalThis.requestAnimationFrame = () => 0;
		globalThis.cancelAnimationFrame = () => undefined;
		vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
			(callback) => {
				frame = callback;
				return 1;
			},
		);
		const viewer = await SpectrogramViewer.create({
			audio: element,
			canvas: canvas(),
			source,
		});
		await viewer.render();
		const profiles: number[] = [];
		viewer.on("playbackprofile", (stats) => profiles.push(stats.fps));

		element.emit("play");
		for (let index = 0; index <= 30; index++) frame?.(index * 16);

		expect(profiles[0]).toBeCloseTo(62.5);
	});

	it("rerenders during playback after config changes invalidate the cached frame", async () => {
		const element = audio();
		let frame: FrameRequestCallback | undefined;
		globalThis.requestAnimationFrame = () => 0;
		globalThis.cancelAnimationFrame = () => undefined;
		vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
			(callback) => {
				frame = callback;
				return 1;
			},
		);
		const viewer = await SpectrogramViewer.create({
			audio: element,
			canvas: canvas(),
			source,
		});
		await viewer.render();
		viewer.setConfig({ colorMap: "magma" });
		const render = vi.spyOn(viewer, "render").mockResolvedValue();

		element.emit("play");
		frame?.(0);
		await Promise.resolve();

		expect(render).toHaveBeenCalledTimes(1);
	});

	it("has upcoming follow tiles prefetched before the viewport shifts", async () => {
		const element = audio();
		let frame: FrameRequestCallback | undefined;
		globalThis.requestAnimationFrame = () => 0;
		globalThis.cancelAnimationFrame = () => undefined;
		vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
			(callback) => {
				frame = callback;
				return 1;
			},
		);
		const requested: Array<[number, number]> = [];
		const backend: SpectrogramComputeBackend = {
			computeTile: (request) => {
				requested.push([request.timeStart, request.timeEnd]);
				return Promise.resolve(matrix(request.timeStart, request.timeEnd));
			},
		};
		const viewer = await SpectrogramViewer.create({
			audio: element,
			canvas: canvas(),
			source: { ...source, duration: 10 },
			cache: { tileDurationSeconds: 1 },
			viewport: { startTime: 0, endTime: 2, minFrequency: 0, maxFrequency: 50 },
			playback: { follow: true },
			backend,
		});
		await viewer.render();
		expect(requested).toContainEqual([2, 3]);
		requested.length = 0;
		element.currentTime = 1.55;

		element.emit("play");
		frame?.(0);
		await Promise.resolve();

		expect(viewer.getViewport()).toMatchObject({ startTime: 0, endTime: 2 });
		expect(requested).toEqual([]);
	});

	it("skips streaming range rerenders during playback when visible tiles are cached", async () => {
		const element = audio();
		let rangeHandler:
			| ((range: { startTime: number; endTime: number }) => void)
			| undefined;
		const streamingSource = {
			...source,
			onRangeAvailable: (
				handler: (range: { startTime: number; endTime: number }) => void,
			) => {
				rangeHandler = handler;
				return () => undefined;
			},
		};
		const viewer = await SpectrogramViewer.create({
			audio: element,
			canvas: canvas(),
			source: streamingSource,
			viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 50 },
		});
		await viewer.render();
		const render = vi.spyOn(viewer, "render").mockResolvedValue();
		element.paused = false;

		rangeHandler!({ startTime: 0, endTime: 1 });
		await Promise.resolve();

		expect(render).not.toHaveBeenCalled();
	});

	it("skips queued cached full renders when playback starts", async () => {
		const element = audio();
		let frame: FrameRequestCallback | undefined;
		globalThis.requestAnimationFrame = () => 0;
		globalThis.cancelAnimationFrame = () => undefined;
		vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
			(callback) => {
				frame = callback;
				return 1;
			},
		);
		const viewer = await SpectrogramViewer.create({
			audio: element,
			canvas: canvas(),
			source,
			viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 50 },
		});
		await viewer.render();
		const render = vi.spyOn(viewer, "render").mockResolvedValue();

		viewer.requestRender();
		element.paused = false;
		element.emit("play");
		frame?.(0);
		await Promise.resolve();

		expect(render).not.toHaveBeenCalled();
	});

	it("removes playback listeners on destroy", async () => {
		const element = audio();
		globalThis.cancelAnimationFrame = () => undefined;
		const cancel = vi
			.spyOn(globalThis, "cancelAnimationFrame")
			.mockImplementation(() => undefined);
		const viewer = await SpectrogramViewer.create({
			audio: element,
			canvas: canvas(),
			source,
		});
		expect(element.listenerCount()).toBe(5);
		viewer.destroy();
		expect(element.listenerCount()).toBe(0);
		expect(cancel).not.toHaveBeenCalled();
	});
});
