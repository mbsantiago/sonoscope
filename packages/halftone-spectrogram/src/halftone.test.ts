import {
  createSpectrogramProgram,
  hasRegisteredSpectrogramProgram,
  unregisterSpectrogramProgram,
} from "@sonoscope/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HalftoneSpectrogramProgram, registerHalftoneProgram } from "./index";

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
  unregisterSpectrogramProgram("halftone");
  unregisterSpectrogramProgram("custom-halftone");
});

describe("HalftoneSpectrogramProgram", () => {
  it("instantiates and configures options", () => {
    const gl = createMockGl();
    const program = new HalftoneSpectrogramProgram(gl, {
      dotFrequency: 0.3,
      energyGamma: 1.5,
    });
    expect(program.name).toBe("halftone");
    expect(program.getOptions().dotFrequency).toBe(0.3);
    expect(program.getOptions().energyGamma).toBe(1.5);

    program.setOptions({ dotFrequency: 0.5 });
    expect(program.getOptions().dotFrequency).toBe(0.5);
  });

  it("registers globally when registerHalftoneProgram is called", () => {
    expect(hasRegisteredSpectrogramProgram("halftone")).toBe(false);

    registerHalftoneProgram("halftone", { dotFrequency: 0.4 });
    expect(hasRegisteredSpectrogramProgram("halftone")).toBe(true);

    const gl = createMockGl();
    const program = createSpectrogramProgram(gl, "halftone");
    expect(program).toBeInstanceOf(HalftoneSpectrogramProgram);
    expect(
      (program as HalftoneSpectrogramProgram).getOptions().dotFrequency,
    ).toBe(0.4);
  });

  it("auto-registers when importing /auto", async () => {
    expect(hasRegisteredSpectrogramProgram("halftone")).toBe(false);

    await import("./auto");
    expect(hasRegisteredSpectrogramProgram("halftone")).toBe(true);
  });
});
