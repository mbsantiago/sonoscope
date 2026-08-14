import { describe, expect, it } from "vitest";
import {
  WEBGL2_WAVEFORM_FRAGMENT_SHADER,
  WEBGL2_WAVEFORM_VERTEX_SHADER,
} from "./webgl2-shaders";

describe("WebGL2 Waveform Shaders", () => {
  it("exports valid GLSL 3.00 ES vertex and fragment shader source strings", () => {
    expect(WEBGL2_WAVEFORM_VERTEX_SHADER).toContain("#version 300 es");
    expect(WEBGL2_WAVEFORM_FRAGMENT_SHADER).toContain("#version 300 es");
    expect(WEBGL2_WAVEFORM_VERTEX_SHADER).toContain("a_position");
    expect(WEBGL2_WAVEFORM_FRAGMENT_SHADER).toContain("fragColor");
  });
});
