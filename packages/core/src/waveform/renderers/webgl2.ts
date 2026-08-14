import { parseColor } from "../../colormap";
import type { WaveformRenderer, WaveformRenderInput } from "../types";
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

  render(input: WaveformRenderInput): void {
    const {
      canvas,
      peaks,
      color = "#38bdf8",
      progressColor,
      backgroundColor = "transparent",
      cursorColor = "#ffffff",
      playheadTime,
      startTime,
      endTime,
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
      this.fallbackRenderer.render(input);
      return;
    }

    const gl = this.gl;
    const rect = canvas.getBoundingClientRect();
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const width = Math.max(1, Math.floor((rect.width || canvas.width) * dpr));
    const height = Math.max(
      1,
      Math.floor((rect.height || canvas.height) * dpr),
    );

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

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
        this.fallbackRenderer.render(input);
        return;
      }
    }

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
    const uProgressColor = gl.getUniformLocation(
      this.program,
      "u_progressColor",
    );
    const uProgressRatio = gl.getUniformLocation(
      this.program,
      "u_progressRatio",
    );
    const uHasProgress = gl.getUniformLocation(this.program, "u_hasProgress");

    gl.uniform2f(uResolution, width, height);
    gl.uniform1f(uAmplitudeScale, amplitudeScale);

    const [cR, cG, cB, cA] = parseColor(color);
    gl.uniform4f(uColor, cR / 255, cG / 255, cB / 255, cA / 255);

    if (
      progressColor &&
      playheadTime !== undefined &&
      playheadTime >= startTime &&
      endTime > startTime
    ) {
      const [pcR, pcG, pcB, pcA] = parseColor(progressColor);
      gl.uniform4f(uProgressColor, pcR / 255, pcG / 255, pcB / 255, pcA / 255);
      const ratio = Math.max(
        0,
        Math.min(1, (playheadTime - startTime) / (endTime - startTime)),
      );
      gl.uniform1f(uProgressRatio, ratio);
      gl.uniform1i(uHasProgress, 1);
    } else {
      gl.uniform1i(uHasProgress, 0);
    }

    const len = peaks.min.length;
    if (len > 0) {
      const centerY = height / 2;
      const halfH = (height / 2) * Math.max(0.01, amplitudeScale);

      const vertexCount = len * 2;
      const positions = new Float32Array(vertexCount * 2);
      const xNorms = new Float32Array(vertexCount);

      for (let i = 0; i < len; i++) {
        const norm = i / Math.max(1, len - 1);
        const x = norm * width;
        const topY = centerY - peaks.max[i]! * halfH;
        const bottomY = centerY - peaks.min[i]! * halfH;

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

    // Draw playhead cursor line
    if (
      playheadTime !== undefined &&
      playheadTime >= startTime &&
      playheadTime <= endTime &&
      endTime > startTime
    ) {
      const playRatio = (playheadTime - startTime) / (endTime - startTime);
      const playX = playRatio * width;
      const [curR, curG, curB, curA] = parseColor(cursorColor);
      gl.uniform4f(uColor, curR / 255, curG / 255, curB / 255, curA / 255);
      gl.uniform1i(uHasProgress, 0);

      const cursorWidth = 2 * dpr;
      const cursorPositions = new Float32Array([
        playX - cursorWidth / 2,
        0,
        playX + cursorWidth / 2,
        0,
        playX - cursorWidth / 2,
        height,
        playX + cursorWidth / 2,
        height,
      ]);
      const cursorXNorms = new Float32Array([
        playRatio,
        playRatio,
        playRatio,
        playRatio,
      ]);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, cursorPositions, gl.DYNAMIC_DRAW);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.xNormBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, cursorXNorms, gl.DYNAMIC_DRAW);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
    if (this.fallbackRenderer) {
      this.fallbackRenderer.destroy?.();
      this.fallbackRenderer = null;
    }
  }
}
