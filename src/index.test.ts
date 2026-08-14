import { describe, expect, it } from "vitest";
import {
  createWebCodecsMp3Decoder,
  isMp3Bytes,
  isWebCodecsMp3Supported,
  parseMp3FrameHeader,
  parseMp3Info,
  SpectrogramViewer,
  StreamingMp3Source,
  version,
} from "./index";

describe("public entrypoint", () => {
  it("exports a package version string", () => {
    expect(version).toBe("0.0.0");
  });

  it("exports MP3 parser and streaming functions", () => {
    expect(typeof isMp3Bytes).toBe("function");
    expect(typeof parseMp3FrameHeader).toBe("function");
    expect(typeof parseMp3Info).toBe("function");
    expect(typeof StreamingMp3Source).toBe("function");
    expect(typeof isWebCodecsMp3Supported).toBe("function");
    expect(typeof createWebCodecsMp3Decoder).toBe("function");
  });

  it("exports SpectrogramViewer with fromUrl, fromAudio, fromSource, and create", () => {
    expect(typeof SpectrogramViewer.create).toBe("function");
    expect(typeof SpectrogramViewer.fromUrl).toBe("function");
    expect(typeof SpectrogramViewer.fromAudio).toBe("function");
    expect(typeof SpectrogramViewer.fromSource).toBe("function");
  });
});
