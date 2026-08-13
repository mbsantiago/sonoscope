import { buildColorMap } from './colormap';
import { CanvasSpectrogramRenderer, type LoadingRenderInput, type PlayheadRenderInput, type RenderInput, type SpectrogramRenderer } from './renderer';
import { valueDataForMode } from './spectrogram-sampling';
import type { ColorMapConfig, SpectrogramMatrix, ValueScaleConfig, ViewportConfig } from './types';

const WEBGL2_UNIFORMS = ['u_tile', 'u_colormap', 'u_viewport', 'u_tileTimeRange', 'u_tileFrequencyRange', 'u_tileSize', 'u_canvasSize', 'u_valueScale', 'u_frequencyScale', 'u_overlayMode', 'u_terrainHeight'] as const;
type UniformName = typeof WEBGL2_UNIFORMS[number];

class WebGL2ShaderProgram {
  readonly program: WebGLProgram;
  readonly position: number;
  readonly tileUv: number;
  private readonly uniforms: Partial<Record<UniformName, WebGLUniformLocation>>;

  constructor(private readonly gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
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
    this.program = program;
    this.position = gl.getAttribLocation(program, 'a_position');
    this.tileUv = gl.getAttribLocation(program, 'a_tileUv');
    this.uniforms = Object.fromEntries(WEBGL2_UNIFORMS.flatMap((name) => {
      const location = gl.getUniformLocation(program, name);
      if (!location) return [];
      return [[name, location]];
    })) as WebGL2ShaderProgram['uniforms'];
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

  uniform4f(name: UniformName, x: number, y: number, z: number, w: number): void {
    const location = this.uniforms[name];
    if (location) this.gl.uniform4f(location, x, y, z, w);
  }
}

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

type WebGL2Frame = ReturnType<typeof canvasSize>;

type WebGL2RenderResources = {
  colorMapTexture: WebGLTexture;
  textureForTile(tile: SpectrogramMatrix, valueScale: Required<ValueScaleConfig>): TextureEntry;
};

type WebGL2RenderProgram = {
  readonly shader: WebGL2ShaderProgram;
  paint(input: RenderInput, frame: WebGL2Frame, resources: WebGL2RenderResources): void;
  delete(): void;
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

float hzToMel(float hz) { return 1127.01048 * log(1.0 + hz / 700.0); }
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
  float canvasY = 1.0 - gl_FragCoord.y / max(1.0, u_canvasSize.y);
  float time = mix(u_viewport.x, u_viewport.y, globalX);
  if (time < u_tileTimeRange.x || time > u_tileTimeRange.y) discard;
  float minScale = hzToScale(u_viewport.z, u_frequencyScale);
  float maxScale = hzToScale(u_viewport.w, u_frequencyScale);
  float frequency = scaleToHz(mix(maxScale, minScale, canvasY), u_frequencyScale);
  float frequencyStep = (u_tileFrequencyRange.y - u_tileFrequencyRange.x) / max(1.0, u_tileSize.y - 1.0);
  if (frequency > u_tileFrequencyRange.x && frequency <= u_tileFrequencyRange.x + frequencyStep * 0.5 + 0.000001) {
    outColor = texture(u_colormap, vec2(0.0, 0.5));
    return;
  }
  float framePosition = clamp((time - u_tileTimeRange.x) / max(0.000001, u_tileTimeRange.y - u_tileTimeRange.x) * max(1.0, u_tileSize.x - 1.0), 0.0, max(0.0, u_tileSize.x - 1.0));
  float binPosition = clamp((frequency - u_tileFrequencyRange.x) / max(0.000001, u_tileFrequencyRange.y - u_tileFrequencyRange.x) * max(1.0, u_tileSize.y - 1.0), 0.0, max(0.0, u_tileSize.y - 1.0));
  int frame0 = int(floor(framePosition));
  int frame1 = int(ceil(framePosition));
  int bin0 = int(floor(binPosition));
  int bin1 = int(ceil(binPosition));
  float frameFraction = fract(framePosition);
  float binFraction = fract(binPosition);
  float low0 = texelFetch(u_tile, ivec2(frame0, bin0), 0).r;
  float low1 = texelFetch(u_tile, ivec2(frame1, bin0), 0).r;
  float high0 = texelFetch(u_tile, ivec2(frame0, bin1), 0).r;
  float high1 = texelFetch(u_tile, ivec2(frame1, bin1), 0).r;
  float normalized = mix(mix(low0, low1, frameFraction), mix(high0, high1, frameFraction), binFraction);
  outColor = texture(u_colormap, vec2(clamp(normalized, 0.0, 1.0), 0.5));
}`;

export const WEBGL2_TERRAIN_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_tileUv;
out vec2 v_tileUv;
out float v_height;

uniform sampler2D u_tile;
uniform vec2 u_tileTimeRange;
uniform vec2 u_canvasSize;
uniform float u_terrainHeight;

void main() {
  v_tileUv = a_tileUv;
  float heightValue = texture(u_tile, a_tileUv).r;
  v_height = heightValue;
  vec2 terrain = vec2(a_position.x * 2.0 - 1.0, a_position.y * 2.0 - 1.0);
  float isoX = (terrain.x - terrain.y) * 0.58;
  float isoY = (terrain.x + terrain.y) * 0.28 - heightValue * u_terrainHeight;
  gl_Position = vec4(isoX, isoY - 0.18, heightValue * 0.2, 1.0);
}`;

export const WEBGL2_TERRAIN_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_tileUv;
in float v_height;
out vec4 outColor;

uniform sampler2D u_tile;
uniform vec2 u_tileSize;

void main() {
  vec2 stepSize = 1.0 / max(vec2(1.0), u_tileSize - 1.0);
  float left = texture(u_tile, clamp(v_tileUv - vec2(stepSize.x, 0.0), 0.0, 1.0)).r;
  float right = texture(u_tile, clamp(v_tileUv + vec2(stepSize.x, 0.0), 0.0, 1.0)).r;
  float low = texture(u_tile, clamp(v_tileUv - vec2(0.0, stepSize.y), 0.0, 1.0)).r;
  float high = texture(u_tile, clamp(v_tileUv + vec2(0.0, stepSize.y), 0.0, 1.0)).r;
  vec3 normal = normalize(vec3((left - right) * 1.8, (low - high) * 1.8, 0.6));
  float light = clamp(dot(normal, normalize(vec3(-0.35, -0.55, 0.9))), 0.0, 1.0);
  float contour = smoothstep(0.015, 0.0, abs(fract(v_height * 18.0) - 0.5));
  float ridge = smoothstep(0.965, 1.0, fract(v_tileUv.y * u_tileSize.y));
  float tone = 0.18 + v_height * 0.48 + light * 0.26 + contour * 0.18 + ridge * 0.16;
  outColor = vec4(vec3(clamp(tone, 0.0, 1.0)), 1.0);
}`;

class NormalSpectrogramProgram implements WebGL2RenderProgram {
  readonly shader: WebGL2ShaderProgram;
  private readonly quadBuffer: WebGLBuffer;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.shader = new WebGL2ShaderProgram(gl, WEBGL2_VERTEX_SHADER, WEBGL2_FRAGMENT_SHADER);
    const quadBuffer = gl.createBuffer();
    if (!quadBuffer) throw new Error('Unable to initialize WebGL2 normal renderer resources');
    this.quadBuffer = quadBuffer;
    this.setFullViewportQuad();
  }

  paint(input: RenderInput, frame: WebGL2Frame, resources: WebGL2RenderResources): void {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0.02, 0.025, 0.035, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.shader.use();
    this.bindAttributes();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, resources.colorMapTexture);
    this.shader.uniform1i('u_colormap', 1);
    this.shader.uniform4f('u_viewport', input.viewport.startTime, input.viewport.endTime, input.viewport.minFrequency, input.viewport.maxFrequency);
    this.shader.uniform2f('u_canvasSize', frame.deviceWidth, frame.deviceHeight);
    this.shader.uniform4f('u_valueScale', input.valueScale.min, input.valueScale.max, input.valueScale.gamma, input.valueScale.clamp ? 1 : 0);
    this.shader.uniform1f('u_frequencyScale', frequencyScaleCode(input.viewport.frequencyScale));

    const placeholderCount = input.placeholders?.length ?? 0;
    for (let index = 0; index < placeholderCount; index++) this.drawPlaceholder();
    for (const tile of input.tiles) this.drawTile(tile, input.valueScale, resources);
    if (input.playheadTime !== undefined) this.drawPlayhead(input.playheadTime, input.viewport, frame.deviceWidth);
  }

  delete(): void {
    this.gl.deleteBuffer(this.quadBuffer);
    this.shader.delete();
  }

  private bindAttributes(): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.enableVertexAttribArray(this.shader.position);
    this.gl.vertexAttribPointer(this.shader.position, 2, this.gl.FLOAT, false, 16, 0);
    this.gl.enableVertexAttribArray(this.shader.tileUv);
    this.gl.vertexAttribPointer(this.shader.tileUv, 2, this.gl.FLOAT, false, 16, 8);
  }

  private drawTile(tile: SpectrogramMatrix, valueScale: Required<ValueScaleConfig>, resources: WebGL2RenderResources): void {
    if (tile.frameCount === 0 || tile.binCount === 0) return;
    const entry = resources.textureForTile(tile, valueScale);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, entry.texture);
    this.shader.uniform1i('u_tile', 0);
    this.shader.uniform1f('u_overlayMode', 0);
    this.setFullViewportQuad();
    this.shader.uniform2f('u_tileTimeRange', tile.timeStart, tile.timeEnd);
    const frequencyRange = tileFrequencyRange(tile);
    this.shader.uniform2f('u_tileFrequencyRange', frequencyRange.min, frequencyRange.max);
    this.shader.uniform2f('u_tileSize', entry.width, entry.height);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawPlaceholder(): void {
    this.setFullViewportQuad();
    this.shader.uniform1f('u_overlayMode', 1);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawPlayhead(time: number, viewport: ViewportConfig, deviceWidth: number): void {
    if (time < viewport.startTime || time > viewport.endTime) return;
    const x = (time - viewport.startTime) / (viewport.endTime - viewport.startTime);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.shader.uniform1f('u_overlayMode', 2);
    const pixelWidth = 1 / Math.max(1, deviceWidth);
    this.setLineQuad(x, Math.min(1, x + pixelWidth));
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    this.gl.disable(this.gl.BLEND);
  }

  private setFullViewportQuad(): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0]), this.gl.DYNAMIC_DRAW);
  }

  private setLineQuad(start: number, end: number): void {
    const left = start * 2 - 1;
    const right = end * 2 - 1;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([left, -1, 0, 1, right, -1, 1, 1, left, 1, 0, 0, right, 1, 1, 0]), this.gl.DYNAMIC_DRAW);
  }
}

class TerrainSpectrogramProgram implements WebGL2RenderProgram {
  readonly shader: WebGL2ShaderProgram;
  private readonly terrainBuffer: WebGLBuffer;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.shader = new WebGL2ShaderProgram(gl, WEBGL2_TERRAIN_VERTEX_SHADER, WEBGL2_TERRAIN_FRAGMENT_SHADER);
    const terrainBuffer = gl.createBuffer();
    if (!terrainBuffer) throw new Error('Unable to initialize WebGL2 terrain renderer resources');
    this.terrainBuffer = terrainBuffer;
  }

  paint(input: RenderInput, frame: WebGL2Frame, resources: WebGL2RenderResources): void {
    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.shader.use();
    this.bindAttributes();
    this.shader.uniform2f('u_canvasSize', frame.deviceWidth, frame.deviceHeight);
    this.shader.uniform1f('u_terrainHeight', 0.72);
    for (const tile of input.tiles) this.drawTile(tile, input.valueScale, resources);
    gl.disable(gl.DEPTH_TEST);
  }

  delete(): void {
    this.gl.deleteBuffer(this.terrainBuffer);
    this.shader.delete();
  }

  private bindAttributes(): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.terrainBuffer);
    this.gl.enableVertexAttribArray(this.shader.position);
    this.gl.vertexAttribPointer(this.shader.position, 2, this.gl.FLOAT, false, 16, 0);
    this.gl.enableVertexAttribArray(this.shader.tileUv);
    this.gl.vertexAttribPointer(this.shader.tileUv, 2, this.gl.FLOAT, false, 16, 8);
  }

  private drawTile(tile: SpectrogramMatrix, valueScale: Required<ValueScaleConfig>, resources: WebGL2RenderResources): void {
    if (tile.frameCount < 2 || tile.binCount < 2) return;
    const entry = resources.textureForTile(tile, valueScale);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, entry.texture);
    this.shader.uniform1i('u_tile', 0);
    this.shader.uniform2f('u_tileTimeRange', tile.timeStart, tile.timeEnd);
    this.shader.uniform2f('u_tileSize', entry.width, entry.height);
    const vertices = terrainVerticesForTile(tile, 96, 96);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.terrainBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, vertices.length / 4);
  }
}

export class WebGL2SpectrogramRenderer implements SpectrogramRenderer {
  readonly kind = 'webgl2' as const;
  private readonly fallback = new CanvasSpectrogramRenderer();
  private readonly normalProgram: WebGL2RenderProgram;
  private readonly terrainProgram: WebGL2RenderProgram;
  private readonly colorMapTexture: WebGLTexture;
  private readonly tileTextures = new Map<string, TextureEntry>();
  private colorMapKey = '';
  private frameState: FrameState | undefined;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.normalProgram = new NormalSpectrogramProgram(gl);
    this.terrainProgram = new TerrainSpectrogramProgram(gl);
    const colorMapTexture = gl.createTexture();
    if (!colorMapTexture) throw new Error('Unable to initialize WebGL2 renderer resources');
    this.colorMapTexture = colorMapTexture;
  }

  static create(canvas: HTMLCanvasElement): WebGL2SpectrogramRenderer | undefined {
    const gl = canvas.getContext('webgl2');
    return gl && isUsableWebGL2Context(gl) ? new WebGL2SpectrogramRenderer(gl) : undefined;
  }

  static diagnose(canvas: HTMLCanvasElement): string | undefined {
    const gl = canvas.getContext('webgl2');
    if (!gl) return 'canvas.getContext("webgl2") returned null';
    if (!isUsableWebGL2Context(gl)) return 'canvas.getContext("webgl2") did not return a usable WebGL2RenderingContext';
    return compileShaderDiagnostic(gl, gl.VERTEX_SHADER, WEBGL2_VERTEX_SHADER)
      ?? compileShaderDiagnostic(gl, gl.FRAGMENT_SHADER, WEBGL2_FRAGMENT_SHADER)
      ?? compileShaderDiagnostic(gl, gl.VERTEX_SHADER, WEBGL2_TERRAIN_VERTEX_SHADER)
      ?? compileShaderDiagnostic(gl, gl.FRAGMENT_SHADER, WEBGL2_TERRAIN_FRAGMENT_SHADER);
  }

  invalidate(): void {
    this.fallback.invalidate();
    this.frameState = undefined;
    for (const entry of this.tileTextures.values()) this.gl.deleteTexture(entry.texture);
    this.tileTextures.clear();
  }

  render(input: RenderInput): void {
    const paint = () => this.paint(input, this.programFor(input));
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
    this.paint({ ...frame.input, playheadTime: input.playheadTime }, this.programFor(frame.input));
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
    this.normalProgram.delete();
    this.terrainProgram.delete();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private paint(input: RenderInput, program: WebGL2RenderProgram): void {
    const frame = canvasSize(input.canvas);
    input.canvas.width = frame.deviceWidth;
    input.canvas.height = frame.deviceHeight;

    this.updateColorMap(input.colorMap);
    this.gl.viewport(0, 0, frame.deviceWidth, frame.deviceHeight);
    program.paint(input, frame, this.renderResources());
    this.throwOnError('render');
    const { profile: _profile, ...frameInput } = input;
    this.frameState = { canvas: input.canvas, width: frame.width, height: frame.height, dpr: frame.dpr, deviceWidth: frame.deviceWidth, deviceHeight: frame.deviceHeight, viewport: { ...input.viewport }, input: { ...frameInput, tiles: [...input.tiles], placeholders: [...(input.placeholders ?? [])] } };
  }

  private programFor(input: RenderInput): WebGL2RenderProgram {
    return input.secretSpectrogram3d ? this.terrainProgram : this.normalProgram;
  }

  private renderResources(): WebGL2RenderResources {
    return {
      colorMapTexture: this.colorMapTexture,
      textureForTile: (tile, valueScale) => this.textureForTile(tile, valueScale),
    };
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

  private throwOnError(phase: string): void {
    const error = this.gl.getError();
    if (error !== this.gl.NO_ERROR) throw new Error(`WebGL2 renderer ${phase} failed with GL error 0x${error.toString(16)}`);
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

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create WebGL2 shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)?.trim() || 'unknown shader error';
    const kind = type === gl.VERTEX_SHADER ? 'vertex' : type === gl.FRAGMENT_SHADER ? 'fragment' : 'unknown';
    gl.deleteShader(shader);
    throw new Error(`Unable to compile WebGL2 ${kind} shader: ${log}\n${numberedSource(source)}`);
  }
  return shader;
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

export function terrainVerticesForTile(tile: Pick<SpectrogramMatrix, 'frameCount' | 'binCount'>, maxColumns = 96, maxRows = 96): Float32Array {
  const columns = Math.max(2, Math.min(maxColumns, tile.frameCount));
  const rows = Math.max(2, Math.min(maxRows, tile.binCount));
  const vertices = new Float32Array((columns - 1) * (rows - 1) * 6 * 4);
  let offset = 0;
  for (let row = 0; row < rows - 1; row++) {
    const v0 = row / (rows - 1);
    const v1 = (row + 1) / (rows - 1);
    for (let column = 0; column < columns - 1; column++) {
      const u0 = column / (columns - 1);
      const u1 = (column + 1) / (columns - 1);
      offset = writeTerrainVertex(vertices, offset, u0, v0);
      offset = writeTerrainVertex(vertices, offset, u1, v0);
      offset = writeTerrainVertex(vertices, offset, u0, v1);
      offset = writeTerrainVertex(vertices, offset, u1, v0);
      offset = writeTerrainVertex(vertices, offset, u1, v1);
      offset = writeTerrainVertex(vertices, offset, u0, v1);
    }
  }
  return vertices;
}

function writeTerrainVertex(vertices: Float32Array, offset: number, u: number, v: number): number {
  vertices[offset] = u;
  vertices[offset + 1] = v;
  vertices[offset + 2] = u;
  vertices[offset + 3] = v;
  return offset + 4;
}

export function tileFrequencyRange(tile: Pick<SpectrogramMatrix, 'frequencies' | 'sampleRate'>): { min: number; max: number } {
  return {
    min: tile.frequencies[0] ?? 0,
    max: tile.frequencies[tile.frequencies.length - 1] ?? Math.max(1, tile.sampleRate / 2),
  };
}

function normalizedByte(value: number, valueScale: Required<ValueScaleConfig>): number {
  let normalized = (value - valueScale.min) / (valueScale.max - valueScale.min || 1);
  if (valueScale.clamp) normalized = Math.max(0, Math.min(1, normalized));
  normalized = Math.max(0, normalized) ** valueScale.gamma;
  return Math.max(0, Math.min(255, Math.round(normalized * 255)));
}
