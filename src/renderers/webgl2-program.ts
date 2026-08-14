import type { SpectrogramMatrix, ValueScaleConfig } from "../types";
import type { RenderInput } from "./canvas";

export const WEBGL2_UNIFORMS = [
	"u_tile",
	"u_colormap",
	"u_viewport",
	"u_tileTimeRange",
	"u_tileFrequencyRange",
	"u_tileSize",
	"u_canvasSize",
	"u_valueScale",
	"u_frequencyScale",
	"u_overlayMode",
	"u_terrainHeight",
	"u_terrainPlayhead",
	"u_terrainTimeRange",
] as const;
export type UniformName = (typeof WEBGL2_UNIFORMS)[number];

export type TextureEntry = {
	texture: WebGLTexture;
	width: number;
	height: number;
};

export type WebGL2Frame = {
	width: number;
	height: number;
	dpr: number;
	deviceWidth: number;
	deviceHeight: number;
};

export type WebGL2RenderResources = {
	colorMapTexture: WebGLTexture;
	tiles: SpectrogramMatrix[];
	textureForTile(
		tile: SpectrogramMatrix,
		valueScale: Required<ValueScaleConfig>,
	): TextureEntry;
};

export type WebGL2RenderProgram = {
	readonly shader: WebGL2ShaderProgram;
	paint(
		input: RenderInput,
		frame: WebGL2Frame,
		resources: WebGL2RenderResources,
	): void;
	delete(): void;
};

export class WebGL2ShaderProgram {
	readonly program: WebGLProgram;
	readonly position: number;
	readonly tileUv: number;
	private readonly uniforms: Partial<Record<UniformName, WebGLUniformLocation>>;

	constructor(
		private readonly gl: WebGL2RenderingContext,
		vertexSource: string,
		fragmentSource: string,
	) {
		const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
		const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
		const program = gl.createProgram();
		if (!program) throw new Error("Unable to create WebGL2 program");
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		gl.linkProgram(program);
		gl.deleteShader(vertex);
		gl.deleteShader(fragment);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			const log = gl.getProgramInfoLog(program) ?? "unknown program error";
			gl.deleteProgram(program);
			throw new Error(`Unable to link WebGL2 program: ${log}`);
		}
		this.program = program;
		this.position = gl.getAttribLocation(program, "a_position");
		this.tileUv = gl.getAttribLocation(program, "a_tileUv");
		this.uniforms = Object.fromEntries(
			WEBGL2_UNIFORMS.flatMap((name) => {
				const location = gl.getUniformLocation(program, name);
				if (!location) return [];
				return [[name, location]];
			}),
		) as WebGL2ShaderProgram["uniforms"];
	}

	use(): void {
		this.gl.useProgram(this.program);
	}

	delete(): void {
		this.gl.deleteProgram(this.program);
	}

	uniform1i(name: UniformName, value: number): void {
		const location = this.uniforms[name];
		if (location) this.gl.uniform1i(location, value);
	}

	uniform1f(name: UniformName, value: number): void {
		const location = this.uniforms[name];
		if (location) this.gl.uniform1f(location, value);
	}

	uniform2f(name: UniformName, x: number, y: number): void {
		const location = this.uniforms[name];
		if (location) this.gl.uniform2f(location, x, y);
	}

	uniform4f(
		name: UniformName,
		x: number,
		y: number,
		z: number,
		w: number,
	): void {
		const location = this.uniforms[name];
		if (location) this.gl.uniform4f(location, x, y, z, w);
	}
}

export function compileShader(
	gl: WebGL2RenderingContext,
	type: number,
	source: string,
): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error("Unable to create WebGL2 shader");
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader)?.trim() || "unknown shader error";
		const kind =
			type === gl.VERTEX_SHADER
				? "vertex"
				: type === gl.FRAGMENT_SHADER
					? "fragment"
					: "unknown";
		gl.deleteShader(shader);
		throw new Error(
			`Unable to compile WebGL2 ${kind} shader: ${log}\n${numberedSource(source)}`,
		);
	}
	return shader;
}

export function numberedSource(source: string): string {
	return source
		.split("\n")
		.map((line, index) => `${String(index + 1).padStart(3, " ")}: ${line}`)
		.join("\n");
}

export function frequencyScaleCode(
	scale: RenderInput["viewport"]["frequencyScale"],
): number {
	if (scale === "log") return 1;
	if (scale === "mel") return 2;
	return 0;
}
