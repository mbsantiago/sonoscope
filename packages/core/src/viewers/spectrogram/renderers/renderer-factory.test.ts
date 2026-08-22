import { describe, expect, it, vi } from "vitest";
import { CanvasSpectrogramRenderer } from "./canvas";
import { createSpectrogramRenderer } from "./renderer-factory";

function canvas(context: unknown = null): HTMLCanvasElement {
  return { getContext: vi.fn(() => context) } as unknown as HTMLCanvasElement;
}

function webgl2(): WebGL2RenderingContext {
  const shader = {} as WebGLShader;
  const program = {} as WebGLProgram;
  const buffer = {} as WebGLBuffer;
  const texture = {} as WebGLTexture;
  const uniform = {} as WebGLUniformLocation;
  return {
    ARRAY_BUFFER: 0x8892,
    COMPILE_STATUS: 0x8b81,
    FRAGMENT_SHADER: 0x8b30,
    LINK_STATUS: 0x8b82,
    STATIC_DRAW: 0x88e4,
    VERTEX_SHADER: 0x8b31,
    createShader: vi.fn(() => shader),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => program),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(),
    deleteProgram: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getUniformLocation: vi.fn(() => uniform),
    createBuffer: vi.fn(() => buffer),
    createTexture: vi.fn(() => texture),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    texImage2D: vi.fn(),
    getExtension: vi.fn(),
  } as unknown as WebGL2RenderingContext;
}

describe("createSpectrogramRenderer", () => {
  it("creates canvas renderer when requested", () => {
    expect(createSpectrogramRenderer(canvas(), "canvas2d")).toBeInstanceOf(
      CanvasSpectrogramRenderer,
    );
  });

  it("falls back to canvas renderer in auto mode when webgl2 is unavailable", () => {
    expect(createSpectrogramRenderer(canvas(null), "auto")).toBeInstanceOf(
      CanvasSpectrogramRenderer,
    );
  });

  it("throws when webgl or named shader is requested but unavailable", () => {
    expect(() => createSpectrogramRenderer(canvas(null), "webgl")).toThrow(
      /returned null/,
    );
    expect(() => createSpectrogramRenderer(canvas(null), "dither")).toThrow(
      /returned null/,
    );
    expect(() => createSpectrogramRenderer(canvas(null), "terrain")).toThrow(
      /returned null/,
    );
    expect(() =>
      createSpectrogramRenderer(canvas(null), {
        type: "webgl",
        program: "dither",
      }),
    ).toThrow(/returned null/);
    expect(() =>
      createSpectrogramRenderer(canvas(null), {
        type: "dither",
      }),
    ).toThrow(/returned null/);
  });

  it("falls back to canvas renderer in auto mode when webgl2 initialization fails", () => {
    const gl = webgl2();
    vi.mocked(gl.getShaderParameter).mockReturnValue(false);

    expect(createSpectrogramRenderer(canvas(gl), "auto")).toBeInstanceOf(
      CanvasSpectrogramRenderer,
    );
    expect(
      createSpectrogramRenderer(canvas(gl), { type: "auto" }),
    ).toBeInstanceOf(CanvasSpectrogramRenderer);
  });

  it("creates canvas renderer for canvas2d object config", () => {
    expect(
      createSpectrogramRenderer(canvas(), { type: "canvas2d" }),
    ).toBeInstanceOf(CanvasSpectrogramRenderer);
  });

  it("throws in webgl mode when webgl2 initialization fails", () => {
    const gl = webgl2();
    vi.mocked(gl.getShaderParameter).mockReturnValue(false);

    expect(() => createSpectrogramRenderer(canvas(gl), "webgl")).toThrow(
      /Unable to compile WebGL2/,
    );
    expect(() => createSpectrogramRenderer(canvas(gl), "dither")).toThrow(
      /Unable to compile WebGL2/,
    );
  });

  it("creates webgl2 renderer when webgl is available", () => {
    const gl = webgl2();
    const r1 = createSpectrogramRenderer(canvas(gl), {
      type: "webgl",
      program: "dither",
    });
    expect(r1.kind).toBe("webgl2");

    const r2 = createSpectrogramRenderer(canvas(gl), "dither");
    expect(r2.kind).toBe("webgl2");

    const r3 = createSpectrogramRenderer(canvas(gl), "terrain");
    expect(r3.kind).toBe("webgl2");

    const r4 = createSpectrogramRenderer(canvas(gl), { type: "dither" });
    expect(r4.kind).toBe("webgl2");
  });
});
