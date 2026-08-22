import type { WaveformRenderer, WaveformRenderInput } from "../types";
import { parseColor } from "../../../colormap";
import { ContinuousPeakPyramid } from "../peaks/continuous";
import { CanvasWaveformRenderer } from "./canvas";
import {
  createWaveformProgram,
  WEBGL2_WAVEFORM_FRAGMENT_SHADER,
  WEBGL2_WAVEFORM_VERTEX_SHADER,
} from "./webgl2-shaders";

export class WebGL2WaveformRenderer implements WaveformRenderer {
  readonly kind = "webgl2" as const;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private xNormBuffer: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private fallbackRenderer: CanvasWaveformRenderer | null = null;
  private pyramid: ContinuousPeakPyramid | null = null;
  private currentSource: unknown = null;
  private currentChannel = 0;

  async render(input: WaveformRenderInput): Promise<void> {
    const {
      canvas,
      source,
      channel = 0,
      startTime,
      endTime,
      color = "#38bdf8",
      backgroundColor = "transparent",
      amplitudeScale = 1.0,
    } = input;

    if (
      !this.gl ||
      typeof this.gl.viewport !== "function" ||
      typeof this.gl.createProgram !== "function"
    ) {
      try {
        const candidate = canvas.getContext("webgl2", {
          alpha: true,
          antialias: true,
          premultipliedAlpha: false,
        });
        if (candidate && typeof candidate.viewport === "function") {
          this.gl = candidate;
        } else {
          this.gl = null;
        }
      } catch {
        this.gl = null;
      }
    }

    if (!this.gl) {
      if (!this.fallbackRenderer) {
        this.fallbackRenderer = new CanvasWaveformRenderer();
      }
      await this.fallbackRenderer.render(input);
      return;
    }

    const gl = this.gl;
    const width = Math.max(1, canvas.width || 1);
    const height = Math.max(1, canvas.height || 1);

    gl.viewport(0, 0, width, height);

    if (!this.program) {
      try {
        this.program = createWaveformProgram(
          gl,
          WEBGL2_WAVEFORM_VERTEX_SHADER,
          WEBGL2_WAVEFORM_FRAGMENT_SHADER,
        );
        this.vao = gl.createVertexArray();
        this.positionBuffer = gl.createBuffer();
        this.xNormBuffer = gl.createBuffer();
      } catch {
        this.gl = null;
        if (!this.fallbackRenderer) {
          this.fallbackRenderer = new CanvasWaveformRenderer();
        }
        await this.fallbackRenderer.render(input);
        return;
      }
    }

    if (
      !this.pyramid ||
      this.currentSource !== source ||
      this.currentChannel !== channel
    ) {
      this.pyramid?.clear();
      this.pyramid = new ContinuousPeakPyramid(source, channel);
      this.currentSource = source;
      this.currentChannel = channel;
    }

    const rect =
      typeof canvas.getBoundingClientRect === "function"
        ? canvas.getBoundingClientRect()
        : null;
    const dpr = (rect && rect.width > 0 ? width / rect.width : 1) || 1;
    const targetWidth = Math.max(1, Math.floor((rect?.width || width) * dpr));

    const peaks = await this.pyramid.getPeaks(startTime, endTime, targetWidth);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    const [bgR, bgG, bgB, bgA] = parseColor(
      backgroundColor === "transparent" ? "rgba(0,0,0,0)" : backgroundColor,
    );
    gl.clearColor(bgR / 255, bgG / 255, bgB / 255, bgA / 255);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const uResolution = gl.getUniformLocation(this.program, "u_resolution");
    const uAmplitudeScale = gl.getUniformLocation(
      this.program,
      "u_amplitudeScale",
    );
    const uColor = gl.getUniformLocation(this.program, "u_color");

    gl.uniform2f(uResolution, width, height);
    gl.uniform1f(uAmplitudeScale, amplitudeScale);

    const [cR, cG, cB, cA] = parseColor(color);
    gl.uniform4f(uColor, cR / 255, cG / 255, cB / 255, cA / 255);

    const len = peaks.min.length;
    if (len > 0) {
      const centerY = height / 2;
      const halfH = (height / 2) * Math.max(0.01, amplitudeScale);
      const hasX = Boolean(peaks.x && peaks.x.length === len);
      const isLineMode = Boolean(peaks.isLineMode);

      const vertexCount = len * 2;
      const positions = new Float32Array(vertexCount * 2);
      const xNorms = new Float32Array(vertexCount);
      const halfThick = isLineMode ? 1.25 : 0;

      for (let i = 0; i < len; i++) {
        const x = hasX ? peaks.x![i]! : (i / Math.max(1, len - 1)) * width;
        const norm = width > 0 ? x / width : 0;
        let topY: number;
        let bottomY: number;

        if (isLineMode) {
          const sample = (peaks.max[i]! + peaks.min[i]!) / 2;
          const y = centerY - sample * halfH;
          topY = y - halfThick;
          bottomY = y + halfThick;
        } else {
          topY = centerY - peaks.max[i]! * halfH;
          bottomY = centerY - peaks.min[i]! * halfH;
          if (bottomY - topY < 1) {
            bottomY = topY + 1;
          }
        }

        const idx = i * 4;
        positions[idx] = x;
        positions[idx + 1] = topY;
        positions[idx + 2] = x;
        positions[idx + 3] = bottomY;

        xNorms[i * 2] = norm;
        xNorms[i * 2 + 1] = norm;
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
      const aPosition = gl.getAttribLocation(this.program, "a_position");
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.xNormBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, xNorms, gl.DYNAMIC_DRAW);
      const aXNorm = gl.getAttribLocation(this.program, "a_xNormalized");
      gl.enableVertexAttribArray(aXNorm);
      gl.vertexAttribPointer(aXNorm, 1, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertexCount);
    }
  }

  destroy(): void {
    if (this.gl) {
      if (this.program) this.gl.deleteProgram(this.program);
      if (this.positionBuffer) this.gl.deleteBuffer(this.positionBuffer);
      if (this.xNormBuffer) this.gl.deleteBuffer(this.xNormBuffer);
      if (this.vao) this.gl.deleteVertexArray(this.vao);
      this.program = null;
      this.positionBuffer = null;
      this.xNormBuffer = null;
      this.vao = null;
      this.gl = null;
    }
    this.pyramid?.clear();
    this.pyramid = null;
    this.currentSource = null;
    if (this.fallbackRenderer) {
      this.fallbackRenderer.destroy?.();
      this.fallbackRenderer = null;
    }
  }
}
