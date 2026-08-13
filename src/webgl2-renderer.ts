import { buildColorMap } from './colormap';
import { CanvasSpectrogramRenderer, type LoadingRenderInput, type PlayheadRenderInput, type RenderInput, type SpectrogramRenderer } from './renderer';
import { valueDataForMode } from './spectrogram-sampling';
import type { ColorMapConfig, SpectrogramMatrix, ValueScaleConfig, ViewportConfig } from './types';

type ProgramInfo = {
  program: WebGLProgram;
  position: number;
  tileUv: number;
  uniforms: Partial<Record<UniformName, WebGLUniformLocation>>;
};

const WEBGL2_UNIFORMS = ['u_tile', 'u_colormap', 'u_viewport', 'u_tileTimeRange', 'u_tileFrequencyRange', 'u_tileSize', 'u_canvasSize', 'u_valueScale', 'u_frequencyScale', 'u_overlayMode'] as const;
type UniformName = typeof WEBGL2_UNIFORMS[number];

type TextureEntry = {
  texture: WebGLTexture;
  width: number;
  height: number;
};

type FrameState = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  dpr: number;
  deviceWidth: number;
  deviceHeight: number;
  viewport: ViewportConfig;
  input: RenderInput;
};

export const WEBGL2_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_tileUv;
out vec2 v_globalUv;
out vec2 v_tileUv;
void main() {
  v_globalUv = a_position * 0.5 + 0.5;
  v_tileUv = a_tileUv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export const WEBGL2_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_globalUv;
in vec2 v_tileUv;
out vec4 outColor;

uniform sampler2D u_tile;
uniform sampler2D u_colormap;
uniform vec4 u_viewport;
uniform vec2 u_tileTimeRange;
uniform vec2 u_tileFrequencyRange;
uniform vec2 u_tileSize;
uniform vec2 u_canvasSize;
uniform vec4 u_valueScale;
uniform float u_frequencyScale;
uniform float u_overlayMode;

float hzToMel(float hz) { return 2595.0 * log(1.0 + hz / 700.0) / log(10.0); }
float melToHz(float mel) { return 700.0 * (pow(10.0, mel / 2595.0) - 1.0); }
float hzToScale(float hz, float scale) {
  if (scale == 1.0) return log(max(1.0, hz)) / log(10.0);
  if (scale == 2.0) return hzToMel(hz);
  return hz;
}
float scaleToHz(float value, float scale) {
  if (scale == 1.0) return pow(10.0, value);
  if (scale == 2.0) return melToHz(value);
  return value;
}

void main() {
  if (u_overlayMode == 1.0) {
    float hatch = step(0.84, fract((gl_FragCoord.x + gl_FragCoord.y) / 12.0));
    outColor = mix(vec4(0.059, 0.09, 0.165, 1.0), vec4(0.278, 0.333, 0.412, 1.0), hatch);
    return;
  }

  if (u_overlayMode == 2.0) {
    outColor = vec4(1.0, 1.0, 1.0, 0.9);
    return;
  }

  float globalX = gl_FragCoord.x / max(1.0, u_canvasSize.x);
  float globalY = gl_FragCoord.y / max(1.0, u_canvasSize.y);
  float time = mix(u_viewport.x, u_viewport.y, globalX);
  if (time < u_tileTimeRange.x || time > u_tileTimeRange.y) discard;
  float minScale = hzToScale(u_viewport.z, u_frequencyScale);
  float maxScale = hzToScale(u_viewport.w, u_frequencyScale);
  float frequency = scaleToHz(mix(maxScale, minScale, globalY), u_frequencyScale);
  float tileU = clamp((time - u_tileTimeRange.x) / max(0.000001, u_tileTimeRange.y - u_tileTimeRange.x), 0.0, 1.0);
  float tileV = 1.0 - clamp((frequency - u_tileFrequencyRange.x) / max(0.000001, u_tileFrequencyRange.y - u_tileFrequencyRange.x), 0.0, 1.0);
  vec2 sampleUv = vec2(
    mix(0.5 / max(1.0, u_tileSize.x), 1.0 - 0.5 / max(1.0, u_tileSize.x), tileU),
    mix(0.5 / max(1.0, u_tileSize.y), 1.0 - 0.5 / max(1.0, u_tileSize.y), tileV)
  );
  float normalized = texture(u_tile, sampleUv).r;
  outColor = texture(u_colormap, vec2(clamp(normalized, 0.0, 1.0), 0.5));
}`;

export class WebGL2SpectrogramRenderer implements SpectrogramRenderer {
  readonly kind = 'webgl2' as const;
  private readonly fallback = new CanvasSpectrogramRenderer();
  private readonly program: ProgramInfo;
  private readonly quadBuffer: WebGLBuffer;
  private readonly colorMapTexture: WebGLTexture;
  private readonly tileTextures = new Map<string, TextureEntry>();
  private colorMapKey = '';
  private frameState: FrameState | undefined;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = this.createProgram(WEBGL2_VERTEX_SHADER, WEBGL2_FRAGMENT_SHADER);
    const quadBuffer = gl.createBuffer();
    const colorMapTexture = gl.createTexture();
    if (!quadBuffer || !colorMapTexture) throw new Error('Unable to initialize WebGL2 renderer resources');
    this.quadBuffer = quadBuffer;
    this.colorMapTexture = colorMapTexture;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0]), gl.STATIC_DRAW);
  }

  static create(canvas: HTMLCanvasElement): WebGL2SpectrogramRenderer | undefined {
    const gl = canvas.getContext('webgl2');
    return gl && isUsableWebGL2Context(gl) ? new WebGL2SpectrogramRenderer(gl) : undefined;
  }

  static diagnose(canvas: HTMLCanvasElement): string | undefined {
    const gl = canvas.getContext('webgl2');
    if (!gl) return 'canvas.getContext("webgl2") returned null';
    if (!isUsableWebGL2Context(gl)) return 'canvas.getContext("webgl2") did not return a usable WebGL2RenderingContext';
    return compileShaderDiagnostic(gl, gl.VERTEX_SHADER, WEBGL2_VERTEX_SHADER) ?? compileShaderDiagnostic(gl, gl.FRAGMENT_SHADER, WEBGL2_FRAGMENT_SHADER);
  }

  invalidate(): void {
    this.fallback.invalidate();
    this.frameState = undefined;
    for (const entry of this.tileTextures.values()) this.gl.deleteTexture(entry.texture);
    this.tileTextures.clear();
  }

  render(input: RenderInput): void {
    const paint = () => this.paint(input);
    if (input.profile) {
      input.profile.measure('renderer.paint', { tiles: input.tiles.length, renderer: this.kind }, paint);
      return;
    }
    paint();
  }

  renderPlayhead(input: PlayheadRenderInput): boolean {
    const frame = this.frameState;
    if (!frame || frame.canvas !== input.canvas || !sameViewport(frame.viewport, input.viewport)) return false;
    const size = canvasSize(input.canvas);
    if (frame.width !== size.width || frame.height !== size.height || frame.dpr !== size.dpr || frame.deviceWidth !== size.deviceWidth || frame.deviceHeight !== size.deviceHeight) return false;
    this.paint({ ...frame.input, playheadTime: input.playheadTime });
    return true;
  }

  renderLoading(input: LoadingRenderInput): void {
    this.frameState = undefined;
    const gl = this.gl;
    const { deviceWidth, deviceHeight } = canvasSize(input.canvas);
    input.canvas.width = deviceWidth;
    input.canvas.height = deviceHeight;
    gl.viewport(0, 0, deviceWidth, deviceHeight);
    gl.clearColor(0.06, 0.09, 0.16, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  destroy(): void {
    this.invalidate();
    this.gl.deleteTexture(this.colorMapTexture);
    this.gl.deleteBuffer(this.quadBuffer);
    this.gl.deleteProgram(this.program.program);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private paint(input: RenderInput): void {
    const gl = this.gl;
    const { width, height, dpr, deviceWidth, deviceHeight } = canvasSize(input.canvas);
    input.canvas.width = deviceWidth;
    input.canvas.height = deviceHeight;

    this.updateColorMap(input.colorMap);
    gl.viewport(0, 0, deviceWidth, deviceHeight);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0.02, 0.025, 0.035, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(this.program.position);
    gl.vertexAttribPointer(this.program.position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.program.tileUv);
    gl.vertexAttribPointer(this.program.tileUv, 2, gl.FLOAT, false, 16, 8);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.colorMapTexture);
    this.uniform1i('u_colormap', 1);
    this.uniform4f('u_viewport', input.viewport.startTime, input.viewport.endTime, input.viewport.minFrequency, input.viewport.maxFrequency);
    this.uniform2f('u_canvasSize', deviceWidth, deviceHeight);
    this.uniform4f('u_valueScale', input.valueScale.min, input.valueScale.max, input.valueScale.gamma, input.valueScale.clamp ? 1 : 0);
    this.uniform1f('u_frequencyScale', frequencyScaleCode(input.viewport.frequencyScale));

    const placeholderCount = input.placeholders?.length ?? 0;
    for (let index = 0; index < placeholderCount; index++) this.drawPlaceholder();
    for (const tile of input.tiles) this.drawTile(tile, input.valueScale);
    if (input.playheadTime !== undefined) this.drawPlayhead(input.playheadTime, input.viewport);
    this.throwOnError('render');
    const { profile: _profile, ...frameInput } = input;
    this.frameState = { canvas: input.canvas, width, height, dpr, deviceWidth, deviceHeight, viewport: { ...input.viewport }, input: { ...frameInput, tiles: [...input.tiles], placeholders: [...(input.placeholders ?? [])] } };
  }

  private drawTile(tile: SpectrogramMatrix, valueScale: Required<ValueScaleConfig>): void {
    if (tile.frameCount === 0 || tile.binCount === 0) return;
    const gl = this.gl;
    const entry = this.textureForTile(tile, valueScale);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    this.uniform1i('u_tile', 0);
    this.uniform1f('u_overlayMode', 0);
    this.setFullViewportQuad();
    this.uniform2f('u_tileTimeRange', tile.timeStart, tile.timeEnd);
    this.uniform2f('u_tileFrequencyRange', tile.frequencies[0] ?? 0, tile.frequencies[tile.frequencies.length - 1] ?? Math.max(1, tile.sampleRate / 2));
    this.uniform2f('u_tileSize', entry.width, entry.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawPlaceholder(): void {
    this.setFullViewportQuad();
    this.uniform1f('u_overlayMode', 1);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawPlayhead(time: number, viewport: ViewportConfig): void {
    if (time < viewport.startTime || time > viewport.endTime) return;
    const x = (time - viewport.startTime) / (viewport.endTime - viewport.startTime);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.uniform1f('u_overlayMode', 2);
    this.setLineQuad(x, Math.min(1, x + 0.002));
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    this.gl.disable(this.gl.BLEND);
  }

  private setFullViewportQuad(): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0]));
  }

  private setLineQuad(start: number, end: number): void {
    const left = start * 2 - 1;
    const right = end * 2 - 1;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, new Float32Array([left, -1, 0, 1, right, -1, 1, 1, left, 1, 0, 0, right, 1, 1, 0]));
  }

  private textureForTile(tile: SpectrogramMatrix, valueScale: Required<ValueScaleConfig>): TextureEntry {
    const key = `${tile.channel}:${tile.timeStart}:${tile.timeEnd}:${valueScale.mode}`;
    const existing = this.tileTextures.get(key);
    if (existing) return existing;

    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error('Unable to create WebGL2 tile texture');
    const values = textureValuesForTile(tile, valueScale);
    const activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as number;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tile.frameCount, tile.binCount, 0, gl.RGBA, gl.UNSIGNED_BYTE, values);
    this.throwOnError('tile texture upload');
    gl.activeTexture(activeTexture);
    const entry = { texture, width: tile.frameCount, height: tile.binCount };
    this.tileTextures.set(key, entry);
    return entry;
  }

  private updateColorMap(config: ColorMapConfig): void {
    const key = JSON.stringify(config);
    if (key === this.colorMapKey) return;
    this.colorMapKey = key;
    const data = new Uint8Array(buildColorMap(config).flat());
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.colorMapTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  private compileShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) throw new Error('Unable to create WebGL2 shader');
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const log = this.gl.getShaderInfoLog(shader)?.trim() || 'unknown shader error';
      const kind = type === this.gl.VERTEX_SHADER ? 'vertex' : type === this.gl.FRAGMENT_SHADER ? 'fragment' : 'unknown';
      this.gl.deleteShader(shader);
      throw new Error(`Unable to compile WebGL2 ${kind} shader: ${log}\n${numberedSource(source)}`);
    }
    return shader;
  }

  private createProgram(vertexSource: string, fragmentSource: string): ProgramInfo {
    const gl = this.gl;
    const vertex = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragment = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) throw new Error('Unable to create WebGL2 program');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'unknown program error';
      gl.deleteProgram(program);
      throw new Error(`Unable to link WebGL2 program: ${log}`);
    }
    const position = gl.getAttribLocation(program, 'a_position');
    const tileUv = gl.getAttribLocation(program, 'a_tileUv');
    const uniforms = Object.fromEntries(WEBGL2_UNIFORMS.flatMap((name) => {
      const location = gl.getUniformLocation(program, name);
      if (!location) return [];
      return [[name, location]];
    })) as ProgramInfo['uniforms'];
    return { program, position, tileUv, uniforms };
  }

  private throwOnError(phase: string): void {
    const error = this.gl.getError();
    if (error !== this.gl.NO_ERROR) throw new Error(`WebGL2 renderer ${phase} failed with GL error 0x${error.toString(16)}`);
  }

  private uniform1i(name: UniformName, value: number): void {
    const location = this.program.uniforms[name];
    if (location) this.gl.uniform1i(location, value);
  }

  private uniform1f(name: UniformName, value: number): void {
    const location = this.program.uniforms[name];
    if (location) this.gl.uniform1f(location, value);
  }

  private uniform2f(name: UniformName, x: number, y: number): void {
    const location = this.program.uniforms[name];
    if (location) this.gl.uniform2f(location, x, y);
  }

  private uniform4f(name: UniformName, x: number, y: number, z: number, w: number): void {
    const location = this.program.uniforms[name];
    if (location) this.gl.uniform4f(location, x, y, z, w);
  }
}

function frequencyScaleCode(scale: RenderInput['viewport']['frequencyScale']): number {
  if (scale === 'log') return 1;
  if (scale === 'mel') return 2;
  return 0;
}

function isUsableWebGL2Context(context: WebGL2RenderingContext): boolean {
  return typeof context.createShader === 'function' && typeof context.createProgram === 'function' && typeof context.texImage2D === 'function';
}

function canvasSize(canvas: HTMLCanvasElement): { width: number; height: number; dpr: number; deviceWidth: number; deviceHeight: number } {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || canvas.width || 1));
  const height = Math.max(1, Math.round(rect.height || canvas.height || 1));
  const dpr = globalThis.devicePixelRatio || 1;
  return { width, height, dpr, deviceWidth: Math.max(1, Math.round(width * dpr)), deviceHeight: Math.max(1, Math.round(height * dpr)) };
}

function sameViewport(left: ViewportConfig, right: ViewportConfig): boolean {
  return left.startTime === right.startTime && left.endTime === right.endTime && left.minFrequency === right.minFrequency && left.maxFrequency === right.maxFrequency && left.frequencyScale === right.frequencyScale;
}

function numberedSource(source: string): string {
  return source.split('\n').map((line, index) => `${String(index + 1).padStart(3, ' ')}: ${line}`).join('\n');
}

function compileShaderDiagnostic(gl: WebGL2RenderingContext, type: number, source: string): string | undefined {
  const shader = gl.createShader(type);
  const kind = type === gl.VERTEX_SHADER ? 'vertex' : type === gl.FRAGMENT_SHADER ? 'fragment' : 'unknown';
  if (!shader) return `Unable to create WebGL2 ${kind} shader`;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean;
  const log = gl.getShaderInfoLog(shader)?.trim() || 'unknown shader error';
  gl.deleteShader(shader);
  return ok ? undefined : `Unable to compile WebGL2 ${kind} shader: ${log}\n${numberedSource(source)}`;
}

export function textureValuesForTile(tile: SpectrogramMatrix, valueScale: Required<ValueScaleConfig>): Uint8Array {
  const source = valueDataForMode(tile, valueScale.mode).values;
  const values = new Uint8Array(tile.frameCount * tile.binCount * 4);
  for (let frame = 0; frame < tile.frameCount; frame++) {
    for (let bin = 0; bin < tile.binCount; bin++) {
      const index = (bin * tile.frameCount + frame) * 4;
      const normalized = normalizedByte(source[frame * tile.binCount + bin]!, valueScale);
      values[index] = normalized;
      values[index + 1] = normalized;
      values[index + 2] = normalized;
      values[index + 3] = 255;
    }
  }
  return values;
}

function normalizedByte(value: number, valueScale: Required<ValueScaleConfig>): number {
  let normalized = (value - valueScale.min) / (valueScale.max - valueScale.min || 1);
  if (valueScale.clamp) normalized = Math.max(0, Math.min(1, normalized));
  normalized = Math.max(0, normalized) ** valueScale.gamma;
  return Math.max(0, Math.min(255, Math.round(normalized * 255)));
}
