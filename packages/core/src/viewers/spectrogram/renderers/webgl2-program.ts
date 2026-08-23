import type { FrequencyScale } from "../../../types";
import type {
  RenderInput,
  WebGL2Frame,
  WebGL2RenderProgram,
  WebGL2RenderResources,
} from "../model";
import { createProgram } from "../../shared/webgl2-compile";

// Data model and program contracts live in the dependency-free model module.
export type {
  RenderInput,
  TextureEntry,
  WebGL2Frame,
  WebGL2RenderProgram,
  WebGL2RenderResources,
} from "../model";

const WEBGL2_UNIFORMS = [
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
  "u_viewProjection",
  "u_cameraPosition",
  // Halftone shader parameters
  "u_dotFrequency",
  "u_minEnergyThreshold",
  "u_energyGamma",
] as const;
type UniformName = (typeof WEBGL2_UNIFORMS)[number];

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
    const program = createProgram(
      gl,
      vertexSource,
      fragmentSource,
      "spectrogram",
    );
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

  uniform3f(name: UniformName, x: number, y: number, z: number): void {
    const location = this.uniforms[name];
    if (location) this.gl.uniform3f(location, x, y, z);
  }

  uniformMat4(name: UniformName, value: Float32Array): void {
    const location = this.uniforms[name];
    if (location) this.gl.uniformMatrix4fv(location, false, value);
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

export function frequencyScaleCode(scale: FrequencyScale | undefined): number {
  if (scale === "log") return 1;
  if (scale === "mel") return 2;
  return 0;
}

export const WEBGL2_FRAGMENT_UNIFORMS = `uniform sampler2D u_tile;
uniform sampler2D u_colormap;
uniform vec4 u_viewport;
uniform vec2 u_tileTimeRange;
uniform vec2 u_tileFrequencyRange;
uniform vec2 u_tileSize;
uniform vec2 u_canvasSize;
uniform vec4 u_valueScale;
uniform float u_frequencyScale;
uniform float u_overlayMode;`;

export const WEBGL2_SCALE_HELPERS = `float hzToMel(float hz) { return 1127.01048 * log(1.0 + hz / 700.0); }
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
}`;

export const WEBGL2_OVERLAY_CHECK = `if (u_overlayMode == 1.0) {
    float hatch = step(0.84, fract((gl_FragCoord.x + gl_FragCoord.y) / 12.0));
    outColor = mix(vec4(0.059, 0.09, 0.165, 1.0), vec4(0.278, 0.333, 0.412, 1.0), hatch);
    return;
  }

  if (u_overlayMode == 2.0) {
    outColor = vec4(1.0, 1.0, 1.0, 0.9);
    return;
  }`;

export abstract class WebGL2TileProgramBase implements WebGL2RenderProgram {
  readonly name: string;
  readonly shader: WebGL2ShaderProgram;
  protected readonly gl: WebGL2RenderingContext;
  protected readonly vertexBuffer: WebGLBuffer;
  private readonly vao: WebGLVertexArrayObject | null;

  protected constructor(
    gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string,
    label: string,
    fillQuad: boolean,
  ) {
    this.name = label;
    this.gl = gl;
    this.shader = new WebGL2ShaderProgram(gl, vertexSource, fragmentSource);
    const vertexBuffer = gl.createBuffer();
    if (!vertexBuffer)
      throw new Error(`Unable to initialize WebGL2 ${label} resources`);
    this.vertexBuffer = vertexBuffer;

    this.vao =
      typeof gl.createVertexArray === "function"
        ? gl.createVertexArray()
        : null;

    if (fillQuad) {
      this.setFullViewportQuad();
    }
    if (this.vao) {
      this.setupVao();
    }
  }

  abstract paint(
    input: RenderInput,
    frame: WebGL2Frame,
    resources: WebGL2RenderResources,
  ): void;

  delete(): void {
    if (this.vao) {
      this.gl.deleteVertexArray(this.vao);
    }
    this.gl.deleteBuffer(this.vertexBuffer);
    this.shader.delete();
  }

  protected beginPaint(
    clearColor: [number, number, number, number],
    clearMask: number,
    enableDepthTest: boolean,
  ): void {
    const gl = this.gl;
    if (enableDepthTest) {
      gl.enable(gl.DEPTH_TEST);
    } else {
      gl.disable(gl.DEPTH_TEST);
    }
    gl.disable(gl.BLEND);
    gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
    gl.clear(clearMask);
    this.shader.use();
    if (this.vao) {
      gl.bindVertexArray(this.vao);
    } else {
      this.bindAttributes();
    }
  }

  protected bindCommonUniforms(
    input: RenderInput,
    frame: WebGL2Frame,
    resources: WebGL2RenderResources,
  ): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, resources.colorMapTexture);
    this.shader.uniform1i("u_colormap", 1);
    this.shader.uniform4f(
      "u_viewport",
      input.viewport.startTime,
      input.viewport.endTime,
      input.viewport.minFrequency ?? 0,
      input.viewport.maxFrequency ?? 24000,
    );
    this.shader.uniform2f(
      "u_canvasSize",
      frame.deviceWidth,
      frame.deviceHeight,
    );
    this.shader.uniform1f(
      "u_frequencyScale",
      frequencyScaleCode(input.frequencyScale),
    );
  }

  protected endPaint(disableDepthTest: boolean): void {
    const gl = this.gl;
    if (disableDepthTest) {
      gl.disable(gl.DEPTH_TEST);
    }
    if (this.vao) {
      gl.bindVertexArray(null);
    }
  }

  protected drawQuad(): void {
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  private setupVao(): void {
    if (!this.vao) return;
    this.gl.bindVertexArray(this.vao);
    this.bindAttributes();
    this.gl.bindVertexArray(null);
  }

  private bindAttributes(): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    if (this.shader.position >= 0) {
      gl.enableVertexAttribArray(this.shader.position);
      gl.vertexAttribPointer(this.shader.position, 2, gl.FLOAT, false, 16, 0);
    }
    if (this.shader.tileUv >= 0) {
      gl.enableVertexAttribArray(this.shader.tileUv);
      gl.vertexAttribPointer(this.shader.tileUv, 2, gl.FLOAT, false, 16, 8);
    }
  }

  private setFullViewportQuad(): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
  }
}
