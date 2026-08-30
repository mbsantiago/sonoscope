import type { SpectrogramMatrix, ValueScaleConfig } from "../types";
import type { RenderInput } from "./canvas";
import { timeFrequencyToCanvas } from "../frequency-scale";
import { valueScaleBounds } from "../value-scale";
import { tileFrequencyRange, tileTimeRange } from "./webgl2-geometry";
import {
  WEBGL2_FRAGMENT_UNIFORMS,
  WEBGL2_OVERLAY_CHECK,
  WEBGL2_SCALE_HELPERS,
  type WebGL2Frame,
  type WebGL2RenderResources,
  WebGL2TileProgramBase,
} from "./webgl2-program";

export const WEBGL2_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export const WEBGL2_FRAGMENT_SHADER = `#version 300 es
precision highp float;

out vec4 outColor;

${WEBGL2_FRAGMENT_UNIFORMS}

${WEBGL2_SCALE_HELPERS}

void main() {
  ${WEBGL2_OVERLAY_CHECK}
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
  float hopDuration = (u_tileTimeRange.y - u_tileTimeRange.x) / max(1.0, u_tileSize.x);
  float framePosition = clamp((time - u_tileTimeRange.x) / max(0.000001, hopDuration), 0.0, max(0.0, u_tileSize.x - 1.0));
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

export class NormalSpectrogramProgram extends WebGL2TileProgramBase {
  constructor(
    gl: WebGL2RenderingContext,
    fragmentShader = WEBGL2_FRAGMENT_SHADER,
  ) {
    super(gl, WEBGL2_VERTEX_SHADER, fragmentShader, "normal", true);
  }

  override paint(
    input: RenderInput,
    frame: WebGL2Frame,
    resources: WebGL2RenderResources,
  ): void {
    this.beginPaint([0.02, 0.025, 0.035, 1], this.gl.COLOR_BUFFER_BIT, false);
    this.bindCommonUniforms(input, frame, resources);
    const bounds = valueScaleBounds(input.valueScale);
    this.shader.uniform4f(
      "u_valueScale",
      bounds.min,
      bounds.max,
      input.valueScale.gamma,
      input.valueScale.clamp ? 1 : 0,
    );

    this.setCustomUniforms(input);

    if ((input.placeholders?.length ?? 0) > 0) this.drawPlaceholder();
    for (const tile of input.tiles) {
      this.setTileScissor(tile, input, frame);
      this.drawTile(tile, input.valueScale, resources);
    }
    this.gl.disable(this.gl.SCISSOR_TEST);
    this.endPaint(false);
  }

  protected setCustomUniforms(_input: RenderInput): void {}

  private drawTile(
    tile: SpectrogramMatrix,
    valueScale: Required<ValueScaleConfig>,
    resources: WebGL2RenderResources,
  ): void {
    if (tile.frameCount === 0 || tile.binCount === 0) return;
    const entry = resources.textureForTile(tile, valueScale);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, entry.texture);
    this.shader.uniform1i("u_tile", 0);
    const { startTime, endTime } = tileTimeRange(tile);
    this.shader.uniform2f("u_tileTimeRange", startTime, endTime);
    const range = tileFrequencyRange(tile);
    this.shader.uniform2f("u_tileFrequencyRange", range.min, range.max);
    this.shader.uniform2f("u_tileSize", entry.width, entry.height);
    this.shader.uniform1f("u_overlayMode", 0);
    this.drawQuad();
  }

  private drawPlaceholder(): void {
    this.shader.uniform1f("u_overlayMode", 1);
    this.drawQuad();
  }

  private setTileScissor(
    tile: SpectrogramMatrix,
    input: RenderInput,
    frame: WebGL2Frame,
  ): void {
    const time = tileTimeRange(tile);
    const frequency = tileFrequencyRange(tile);
    const topLeft = timeFrequencyToCanvas(
      time.startTime,
      frequency.max,
      frame.deviceWidth,
      frame.deviceHeight,
      input.viewport,
      input.frequencyScale,
    );
    const bottomRight = timeFrequencyToCanvas(
      time.endTime,
      frequency.min,
      frame.deviceWidth,
      frame.deviceHeight,
      input.viewport,
      input.frequencyScale,
    );
    const left = Math.max(0, Math.floor(Math.min(topLeft.x, bottomRight.x)));
    const right = Math.min(
      frame.deviceWidth,
      Math.ceil(Math.max(topLeft.x, bottomRight.x)),
    );
    const bottom = Math.max(
      0,
      Math.floor(frame.deviceHeight - Math.max(topLeft.y, bottomRight.y)),
    );
    const top = Math.min(
      frame.deviceHeight,
      Math.ceil(frame.deviceHeight - Math.min(topLeft.y, bottomRight.y)),
    );
    if (right <= left || top <= bottom) {
      this.gl.scissor(0, 0, 0, 0);
      return;
    }
    this.gl.enable(this.gl.SCISSOR_TEST);
    this.gl.scissor(left, bottom, right - left, top - bottom);
  }
}
