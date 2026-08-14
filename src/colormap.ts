import type { BuiltInColorMap, ColorMapConfig, Rgba } from "./types";

const ANCHORS: Record<BuiltInColorMap, Array<{ at: number; color: Rgba }>> = {
	gray: [
		{ at: 0, color: [0, 0, 0, 255] },
		{ at: 1, color: [255, 255, 255, 255] },
	],
	viridis: [
		{ at: 0, color: [68, 1, 84, 255] },
		{ at: 0.33, color: [49, 104, 142, 255] },
		{ at: 0.66, color: [53, 183, 121, 255] },
		{ at: 1, color: [253, 231, 37, 255] },
	],
	magma: [
		{ at: 0, color: [0, 0, 4, 255] },
		{ at: 0.33, color: [87, 15, 109, 255] },
		{ at: 0.66, color: [187, 55, 84, 255] },
		{ at: 1, color: [252, 253, 191, 255] },
	],
	inferno: [
		{ at: 0, color: [0, 0, 4, 255] },
		{ at: 0.33, color: [120, 28, 109, 255] },
		{ at: 0.66, color: [237, 105, 37, 255] },
		{ at: 1, color: [252, 255, 164, 255] },
	],
	plasma: [
		{ at: 0, color: [13, 8, 135, 255] },
		{ at: 0.33, color: [126, 3, 168, 255] },
		{ at: 0.66, color: [240, 89, 97, 255] },
		{ at: 1, color: [240, 249, 33, 255] },
	],
	turbo: [
		{ at: 0, color: [48, 18, 59, 255] },
		{ at: 0.25, color: [50, 101, 214, 255] },
		{ at: 0.5, color: [37, 213, 118, 255] },
		{ at: 0.75, color: [249, 210, 60, 255] },
		{ at: 1, color: [122, 4, 3, 255] },
	],
};

export function parseColor(color: string | Rgba): Rgba {
	if (Array.isArray(color)) return color;
	const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
	if (!match) throw new Error(`Unsupported color format: ${color}`);
	return [
		Number.parseInt(match[1]!, 16),
		Number.parseInt(match[2]!, 16),
		Number.parseInt(match[3]!, 16),
		255,
	];
}

function adjust(
	value: number,
	gamma: number,
	contrast: number,
	brightness: number,
): number {
	const normalized = Math.max(0, Math.min(1, value / 255));
	const gammaValue = normalized ** gamma;
	const contrasted = (gammaValue - 0.5) * contrast + 0.5 + brightness;
	return Math.round(Math.max(0, Math.min(1, contrasted)) * 255);
}

function interpolate(
	points: Array<{ at: number; color: Rgba }>,
	gamma = 1,
	contrast = 1,
	brightness = 0,
): Rgba[] {
	const sorted = [...points].sort((a, b) => a.at - b.at);
	return Array.from({ length: 256 }, (_, index) => {
		const at = index / 255;
		const hi =
			sorted.find((point) => point.at >= at) ?? sorted[sorted.length - 1]!;
		const lo =
			[...sorted].reverse().find((point) => point.at <= at) ?? sorted[0]!;
		const span = hi.at - lo.at || 1;
		const t = (at - lo.at) / span;
		const rgba = lo.color.map((value, channel) =>
			Math.round(value + (hi.color[channel]! - value) * t),
		) as Rgba;
		return [
			adjust(rgba[0], gamma, contrast, brightness),
			adjust(rgba[1], gamma, contrast, brightness),
			adjust(rgba[2], gamma, contrast, brightness),
			rgba[3],
		];
	});
}

export function buildColorMap(config: ColorMapConfig): Rgba[] {
	if (typeof config === "string") return interpolate(ANCHORS[config]);
	if ("base" in config)
		return interpolate(
			ANCHORS[config.base],
			config.gamma ?? 1,
			config.contrast ?? 1,
			config.brightness ?? 0,
		);
	return interpolate(
		config.points.map((point) => ({
			at: point.at,
			color: parseColor(point.color),
		})),
		config.gamma ?? 1,
		config.contrast ?? 1,
		config.brightness ?? 0,
	);
}
