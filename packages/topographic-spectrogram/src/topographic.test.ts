import {
  createSpectrogramProgram,
  hasRegisteredSpectrogramProgram,
  unregisterSpectrogramProgram,
} from "@sonoscope/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerTopographicProgram,
  TopographicSpectrogramProgram,
} from "./index";

function createMockGl(): WebGL2RenderingContext {
  return {
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ""),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getUniformLocation: vi.fn(() => ({})),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform2f: vi.fn(),
    uniform4f: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    createVertexArray: vi.fn(() => ({})),
    bindVertexArray: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    activeTexture: vi.fn(),
    bindTexture: vi.fn(),
    drawArrays: vi.fn(),
  } as unknown as WebGL2RenderingContext;
}

afterEach(() => {
  unregisterSpectrogramProgram("topographic");
  unregisterSpectrogramProgram("custom-topographic");
});

describe("TopographicSpectrogramProgram", () => {
  it("instantiates and configures options", () => {
    const gl = createMockGl();
    const program = new TopographicSpectrogramProgram(gl, {
      contourInterval: 0.2,
      contourLineWidth: 1.5,
    });
    expect(program.name).toBe("topographic");
    expect(program.getOptions().contourInterval).toBe(0.2);
    expect(program.getOptions().contourLineWidth).toBe(1.5);

    program.setOptions({ contourInterval: 0.1 });
    expect(program.getOptions().contourInterval).toBe(0.1);
  });

  it("registers globally when registerTopographicProgram is called", () => {
    expect(hasRegisteredSpectrogramProgram("topographic")).toBe(false);

    registerTopographicProgram("topographic", { contourLineWidth: 2.0 });
    expect(hasRegisteredSpectrogramProgram("topographic")).toBe(true);

    const gl = createMockGl();
    const program = createSpectrogramProgram(gl, "topographic");
    expect(program).toBeInstanceOf(TopographicSpectrogramProgram);
    expect(
      (program as TopographicSpectrogramProgram).getOptions().contourLineWidth,
    ).toBe(2.0);
  });

  it("auto-registers when importing /auto", async () => {
    expect(hasRegisteredSpectrogramProgram("topographic")).toBe(false);

    await import("./auto");
    expect(hasRegisteredSpectrogramProgram("topographic")).toBe(true);
  });
});
