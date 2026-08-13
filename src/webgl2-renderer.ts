import { buildColorMap } from './colormap';
import { CanvasSpectrogramRenderer, type LoadingRenderInput, type PlayheadRenderInput, type RenderInput, type SpectrogramRenderer } from './renderer';
import { valueDataForMode } from './spectrogram-sampling';
import type { ColorMapConfig, SpectrogramMatrix, ValueScaleConfig } from './types';

type ProgramInfo = {
  program: WebGLProgram;
  position: number;
  uniforms: Record<UniformName, WebGLUniformLocation>;
};

type UniformName = 'u_tile' | 'u_colormap' | 'u_tileRect' | 'u_viewport' | 'u_tileTimeRange' | 'u_tileFrequencyRange' | 'u_tileSize' | 'u_valueScale' | 'u_frequencyScale' | 'u_placeholder';

type TextureEntry = {
  texture: WebGLTexture;
  width: number;
  height: number;
};

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_tile;
uniform sampler2D u_colormap;
uniform vec4 u_tileRect;
uniform vec4 u_viewport;
uniform vec2 u_tileTimeRange;
uniform vec2 u_tileFrequencyRange;
uniform vec2 u_tileSize;
uniform vec4 u_valueScale;
uniform int u_frequencyScale;
uniform int u_placeholder;

float hzToMel(float hz) { return 2595.0 * log(1.0 + hz / 700.0) / log(10.0); }
float melToHz(float mel) { return 700.0 * (pow(10.0, mel / 2595.0) - 1.0); }
float hzToScale(float hz, int scale) {
  if (scale == 1) return log(max(1.0, hz)) / log(10.0);
  if (scale == 2) return hzToMel(hz);
  return hz;
}
float scaleToHz(float value, int scale) {
  if (scale == 1) return pow(10.0, value);
  if (scale == 2) return melToHz(value);
  return value;
}

void main() {
  if (v_uv.x < u_tileRect.x || v_uv.x > u_tileRect.z || v_uv.y < u_tileRect.y || v_uv.y > u_tileRect.w) discard;

  if (u_placeholder == 1) {
    float hatch = step(0.84, fract((gl_FragCoord.x + gl_FragCoord.y) / 12.0));
    outColor = mix(vec4(0.059, 0.09, 0.165, 1.0), vec4(0.278, 0.333, 0.412, 1.0), hatch);
    return;
  }

  float time = mix(u_viewport.x, u_viewport.y, v_uv.x);
  float minScale = hzToScale(u_viewport.z, u_frequencyScale);
  float maxScale = hzToScale(u_viewport.w, u_frequencyScale);
  float frequency = scaleToHz(mix(minScale, maxScale, 1.0 - v_uv.y), u_frequencyScale);
  float tileU = clamp((time - u_tileTimeRange.x) / max(0.000001, u_tileTimeRange.y - u_tileTimeRange.x), 0.0, 1.0);
  float tileV = clamp((frequency - u_tileFrequencyRange.x) / max(0.000001, u_tileFrequencyRange.y - u_tileFrequencyRange.x), 0.0, 1.0);
  float halfFrame = 0.5 / max(1.0, u_tileSize.x);
  float halfBin = 0.5 / max(1.0, u_tileSize.y);
  float value = texture(u_tile, vec2(mix(halfFrame, 1.0 - halfFrame, tileU), mix(halfBin, 1.0 - halfBin, tileV))).r;
  float normalized = (value - u_valueScale.x) / max(0.000001, u_valueScale.y - u_valueScale.x);
  if (u_valueScale.w == 1.0) normalized = clamp(normalized, 0.0, 1.0);
  normalized = pow(max(0.0, normalized), u_valueScale.z);
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

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = this.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
    const quadBuffer = gl.createBuffer();
    const colorMapTexture = gl.createTexture();
    if (!quadBuffer || !colorMapTexture) throw new Error('Unable to initialize WebGL2 renderer resources');
    this.quadBuffer = quadBuffer;
    this.colorMapTexture = colorMapTexture;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  }

  static create(canvas: HTMLCanvasElement): WebGL2SpectrogramRenderer | undefined {
    const gl = canvas.getContext('webgl2');
    return gl && isUsableWebGL2Context(gl) ? new WebGL2SpectrogramRenderer(gl) : undefined;
  }

  invalidate(): void {
    this.fallback.invalidate();
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
    return this.fallback.renderPlayhead(input);
  }

  renderLoading(input: LoadingRenderInput): void {
    this.fallback.renderLoading(input);
    this.invalidate();
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
    const rect = input.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || input.canvas.width || 1));
    const height = Math.max(1, Math.round(rect.height || input.canvas.height || 1));
    const dpr = globalThis.devicePixelRatio || 1;
    const deviceWidth = Math.max(1, Math.round(width * dpr));
    const deviceHeight = Math.max(1, Math.round(height * dpr));
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
    gl.vertexAttribPointer(this.program.position, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.colorMapTexture);
    gl.uniform1i(this.program.uniforms.u_colormap, 1);
    gl.uniform4f(this.program.uniforms.u_viewport, input.viewport.startTime, input.viewport.endTime, input.viewport.minFrequency, input.viewport.maxFrequency);
    gl.uniform4f(this.program.uniforms.u_valueScale, input.valueScale.min, input.valueScale.max, input.valueScale.gamma, input.valueScale.clamp ? 1 : 0);
    gl.uniform1i(this.program.uniforms.u_frequencyScale, frequencyScaleCode(input.viewport.frequencyScale));

    for (const placeholder of input.placeholders ?? []) this.drawPlaceholder(placeholder.timeStart, placeholder.timeEnd, input.viewport.startTime, input.viewport.endTime);
    for (const tile of input.tiles) this.drawTile(tile, input.valueScale, input.viewport.startTime, input.viewport.endTime);
  }

  private drawTile(tile: SpectrogramMatrix, valueScale: Required<ValueScaleConfig>, viewportStart: number, viewportEnd: number): void {
    if (tile.frameCount === 0 || tile.binCount === 0) return;
    const gl = this.gl;
    const entry = this.textureForTile(tile, valueScale);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    gl.uniform1i(this.program.uniforms.u_tile, 0);
    gl.uniform1i(this.program.uniforms.u_placeholder, 0);
    this.setTileRect(tile.timeStart, tile.timeEnd, viewportStart, viewportEnd);
    gl.uniform2f(this.program.uniforms.u_tileTimeRange, tile.timeStart, tile.timeEnd);
    gl.uniform2f(this.program.uniforms.u_tileFrequencyRange, tile.frequencies[0] ?? 0, tile.frequencies[tile.frequencies.length - 1] ?? 0);
    gl.uniform2f(this.program.uniforms.u_tileSize, entry.width, entry.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawPlaceholder(timeStart: number, timeEnd: number, viewportStart: number, viewportEnd: number): void {
    this.setTileRect(timeStart, timeEnd, viewportStart, viewportEnd);
    this.gl.uniform1i(this.program.uniforms.u_placeholder, 1);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  private setTileRect(timeStart: number, timeEnd: number, viewportStart: number, viewportEnd: number): void {
    const start = Math.max(0, (timeStart - viewportStart) / (viewportEnd - viewportStart));
    const end = Math.min(1, (timeEnd - viewportStart) / (viewportEnd - viewportStart));
    this.gl.uniform4f(this.program.uniforms.u_tileRect, start, 0, end, 1);
  }

  private textureForTile(tile: SpectrogramMatrix, valueScale: Required<ValueScaleConfig>): TextureEntry {
    const key = `${tile.channel}:${tile.timeStart}:${tile.timeEnd}:${valueScale.mode}`;
    const existing = this.tileTextures.get(key);
    if (existing) return existing;

    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error('Unable to create WebGL2 tile texture');
    const valueData = valueDataForMode(tile, valueScale.mode).values;
    const values = valueData instanceof Float32Array ? valueData : Float32Array.from(valueData);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, tile.frameCount, tile.binCount, 0, gl.RED, gl.FLOAT, values);
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
      const log = this.gl.getShaderInfoLog(shader) ?? 'unknown shader error';
      this.gl.deleteShader(shader);
      throw new Error(`Unable to compile WebGL2 shader: ${log}`);
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
    const uniforms = Object.fromEntries((['u_tile', 'u_colormap', 'u_tileRect', 'u_viewport', 'u_tileTimeRange', 'u_tileFrequencyRange', 'u_tileSize', 'u_valueScale', 'u_frequencyScale', 'u_placeholder'] satisfies UniformName[]).map((name) => {
      const location = gl.getUniformLocation(program, name);
      if (!location) throw new Error(`Unable to find WebGL2 uniform ${name}`);
      return [name, location];
    })) as Record<UniformName, WebGLUniformLocation>;
    return { program, position, uniforms };
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
