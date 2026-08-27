import {
  createSpectrogramProgram,
  hasRegisteredSpectrogramProgram,
  unregisterSpectrogramProgram,
} from "@sonoscope/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeTerrainCamera,
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

    registerTerrainProgram("terrain", {
      heightScale: 0.8,
      heightGamma: 1.2,
      fov: 60,
      ambientLight: 0.8,
      diffuseLight: 0.3,
      smoothing: 0.5,
      meshResolution: 32,
    });
    expect(hasRegisteredSpectrogramProgram("terrain")).toBe(true);

    const gl = createMockGl();
    const program = createSpectrogramProgram(gl, "terrain");
    expect(program).toBeInstanceOf(TerrainSpectrogramProgram);
    const terrainProg = program as TerrainSpectrogramProgram;
    expect(terrainProg.getOptions().heightScale).toBe(0.8);
    expect(terrainProg.getOptions().fov).toBe(60);
    expect(terrainProg.getOptions().heightGamma).toBe(1.2);
    expect(terrainProg.getOptions().smoothing).toBe(0.5);

    terrainProg.setOptions({
      heightScale: 1.0,
      fov: 75,
      cameraPitch: 45,
      cameraYaw: 15,
      cameraDistance: 2.0,
      cameraHeight: 1.8,
    });
    expect(terrainProg.getOptions().heightScale).toBe(1.0);
    expect(terrainProg.getOptions().fov).toBe(75);
    expect(terrainProg.getOptions().cameraPitch).toBe(45);
    expect(terrainProg.getOptions().cameraYaw).toBe(15);
    expect(terrainProg.getOptions().cameraDistance).toBe(2.0);
    expect(terrainProg.getOptions().cameraHeight).toBe(1.8);
  });

  it("computes default camera looking top-down", () => {
    const { eye, target, up } = computeTerrainCamera({});
    expect(eye[0]).toBeCloseTo(0);
    expect(eye[1]).toBeCloseTo(0);
    expect(eye[2]).toBeCloseTo(1.5);
    expect(target).toEqual([0, 0, 0]);
    expect(up).toEqual([0, 1, 0]);
  });

  it("computes pitched camera elevation", () => {
    const { eye, target, up } = computeTerrainCamera({
      cameraPitch: 45,
      cameraDistance: 2.0,
    });
    expect(target).toEqual([0, 0, 0]);
    expect(eye[0]).toBeCloseTo(0);
    expect(eye[1]).toBeCloseTo(-2.0 * Math.sin((45 * Math.PI) / 180));
    expect(eye[2]).toBeCloseTo(2.0 * Math.cos((45 * Math.PI) / 180));
    expect(up[0]).toBeCloseTo(0);
    expect(up[1]).toBeCloseTo(Math.cos((45 * Math.PI) / 180));
    expect(up[2]).toBeCloseTo(Math.sin((45 * Math.PI) / 180));
  });

  it("respects explicit camera overrides", () => {
    const { eye, target, up } = computeTerrainCamera({
      cameraEye: [1, 2, 3],
      cameraTarget: [0, 1, 0],
      cameraUp: [0, 0, 1],
    });
    expect(eye).toEqual([1, 2, 3]);
    expect(target).toEqual([0, 1, 0]);
    expect(up).toEqual([0, 0, 1]);
  });

  it("auto-registers when importing /auto", async () => {
    expect(hasRegisteredSpectrogramProgram("terrain")).toBe(false);

    await import("./auto");
    expect(hasRegisteredSpectrogramProgram("terrain")).toBe(true);
  });
});
