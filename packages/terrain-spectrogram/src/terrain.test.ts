import {
  createSpectrogramProgram,
  hasRegisteredSpectrogramProgram,
  unregisterSpectrogramProgram,
} from "@sonoscope/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerTerrainProgram,
  TerrainSpectrogramProgram,
  terrainVerticesForTile,
  tileTimeRange,
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
    uniform3f: vi.fn(),
    uniform4f: vi.fn(),
    uniformMatrix4fv: vi.fn(),
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
  unregisterSpectrogramProgram("terrain");
  unregisterSpectrogramProgram("custom-terrain");
});

describe("TerrainSpectrogramProgram", () => {
  it("builds two triangles per terrain cell with position and uv pairs", () => {
    const vertices = terrainVerticesForTile(
      { frameCount: 3, binCount: 3 },
      96,
      96,
    );
    expect(vertices.length).toBe((3 - 1) * (3 - 1) * 6 * 4);
  });

  it("calculates tile time range properly", () => {
    const range = tileTimeRange({
      times: new Float32Array([0, 1]),
      sampleRate: 44100,
      timeStart: 0,
      timeEnd: 2,
      frameCount: 2,
    });
    expect(range.startTime).toBe(0);
    expect(range.endTime).toBe(2);
  });

  it("registers globally when registerTerrainProgram is called", () => {
    expect(hasRegisteredSpectrogramProgram("terrain")).toBe(false);

    registerTerrainProgram("terrain");
    expect(hasRegisteredSpectrogramProgram("terrain")).toBe(true);

    const gl = createMockGl();
    const program = createSpectrogramProgram(gl, "terrain");
    expect(program).toBeInstanceOf(TerrainSpectrogramProgram);
  });

  it("auto-registers when importing /auto", async () => {
    expect(hasRegisteredSpectrogramProgram("terrain")).toBe(false);

    await import("./auto");
    expect(hasRegisteredSpectrogramProgram("terrain")).toBe(true);
  });
});
