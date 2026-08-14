import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { createServer } from "vite";

const outputDir = new URL("../tmp/screenshots/", import.meta.url);
await mkdir(outputDir, { recursive: true });

const server = await createServer({
	root: new URL("../", import.meta.url).pathname,
	server: { host: "127.0.0.1", port: 0 },
	logLevel: "error",
});

try {
	await server.listen();
	const address = server.httpServer?.address();
	if (!address || typeof address === "string")
		throw new Error("Unable to determine Vite server address");
	const baseUrl = `http://127.0.0.1:${address.port}`;
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage({
			viewport: { width: 1280, height: 800 },
			deviceScaleFactor: 1,
		});
		page.on("console", (message) =>
			console.log(`[browser:${message.type()}] ${message.text()}`),
		);
		page.on("pageerror", (error) =>
			console.error(`[browser:error] ${error.message}`),
		);
		for (const scale of ["linear", "log", "mel"]) {
			await page.goto(`${baseUrl}/examples/basic/renderers.html`, {
				waitUntil: "networkidle",
			});
			await page.selectOption("#frequency-scale", scale);
			await page.selectOption("#renderer", "canvas2d");
			await page.waitForFunction(
				() =>
					document
						.querySelector("#status")
						?.textContent?.includes("renderer config: canvas2d"),
				undefined,
				{ timeout: 10_000 },
			);
			const canvas2d = await capture(page, `${scale}-canvas2d`);
			await page.selectOption("#renderer", "webgl2");
			try {
				await page.waitForFunction(
					() =>
						document
							.querySelector("#status")
							?.textContent?.includes("renderer config: webgl2"),
					undefined,
					{ timeout: 10_000 },
				);
			} catch (error) {
				const status = await page.locator("#status").textContent();
				throw new Error(
					`Timed out waiting for WebGL2 render. Status: ${status}`,
				);
			}
			const webgl2 = await capture(page, `${scale}-webgl2`);
			const diff = pngDiff(canvas2d.buffer, webgl2.buffer);
			console.log(`${scale} canvas2d/webgl2 diff=${JSON.stringify(diff)}`);
			if (
				diff.meanAbsoluteChannelDifference > 8 ||
				(scale === "linear" && diff.maxChannelDifference > 96)
			)
				throw new Error(
					`${scale} Canvas/WebGL2 screenshots differ too much: ${JSON.stringify(diff)}`,
				);
		}
		await page.goto(`${baseUrl}/examples/basic/renderers.html`, {
			waitUntil: "networkidle",
		});
		await page.evaluate(async () => {
			const { WebGL2SpectrogramRenderer } = await import(
				"/src/webgl2-renderer.ts"
			);
			const oldCanvas = document.querySelector("#spectrogram");
			const canvas = oldCanvas.cloneNode(false);
			oldCanvas.replaceWith(canvas);
			const gl = canvas.getContext("webgl2");
			const renderer = new WebGL2SpectrogramRenderer(gl);
			renderer.render({
				canvas,
				viewport: {
					startTime: 0,
					endTime: 1,
					minFrequency: 0,
					maxFrequency: 100,
					frequencyScale: "linear",
				},
				valueScale: {
					mode: "magnitude",
					min: 0,
					max: 1,
					gamma: 1,
					clamp: true,
				},
				colorMap: "gray",
				tiles: [brightBandTile()],
			});

			function brightBandTile() {
				const frameCount = 8;
				const binCount = 8;
				const magnitude = new Float32Array(frameCount * binCount);
				for (let frame = 0; frame < frameCount; frame++) {
					for (let bin = 0; bin < binCount; bin++)
						magnitude[frame * binCount + bin] = bin >= 3 && bin <= 5 ? 1 : 0;
				}
				return {
					channel: 0,
					timeStart: 0,
					timeEnd: 1,
					frameStart: 0,
					frameCount,
					binCount,
					sampleRate: 10,
					times: Float32Array.from(
						{ length: frameCount },
						(_, index) => index / (frameCount - 1),
					),
					frequencies: Float32Array.from(
						{ length: binCount },
						(_, index) => (index / (binCount - 1)) * 100,
					),
					magnitude,
				};
			}
		});
		await capture(page, "webgl2-direct");
	} finally {
		await browser.close();
	}
} finally {
	await server.close();
}

async function capture(page, renderer) {
	const pagePath = new URL(`renderers-${renderer}.png`, outputDir).pathname;
	const canvasPath = new URL(`renderers-${renderer}-canvas.png`, outputDir)
		.pathname;
	await page.screenshot({ path: pagePath, fullPage: true });
	const canvas = page.locator("#spectrogram");
	const canvasPng = await canvas.screenshot({ path: canvasPath });
	const stats = pngStats(canvasPng);
	if (stats.brightPixels < 1000)
		throw new Error(
			`${renderer} screenshot has too few bright pixels: ${stats.brightPixels}`,
		);
	console.log(`${renderer}: page=${pagePath}`);
	console.log(`${renderer}: canvas=${canvasPath}`);
	console.log(`${renderer}: stats=${JSON.stringify(stats)}`);
	return { buffer: canvasPng, stats };
}

function pngStats(buffer) {
	const png = PNG.sync.read(buffer);
	let brightPixels = 0;
	const samplePixels = png.width * png.height;
	for (let index = 0; index < png.data.length; index += 4) {
		if (
			png.data[index] > 64 ||
			png.data[index + 1] > 64 ||
			png.data[index + 2] > 64
		)
			brightPixels += 1;
	}
	return { brightPixels, samplePixels };
}

function pngDiff(leftBuffer, rightBuffer) {
	const left = PNG.sync.read(leftBuffer);
	const right = PNG.sync.read(rightBuffer);
	if (left.width !== right.width || left.height !== right.height)
		throw new Error(
			`Cannot diff PNGs with different sizes: ${left.width}x${left.height} vs ${right.width}x${right.height}`,
		);
	let total = 0;
	let max = 0;
	let compared = 0;
	for (let index = 0; index < left.data.length; index += 4) {
		for (let channel = 0; channel < 3; channel++) {
			const diff = Math.abs(
				left.data[index + channel] - right.data[index + channel],
			);
			total += diff;
			max = Math.max(max, diff);
			compared += 1;
		}
	}
	return {
		meanAbsoluteChannelDifference: total / compared,
		maxChannelDifference: max,
	};
}
