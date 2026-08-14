import { describe, expect, it } from "vitest";
import { StreamingMp3Source } from "./streaming-mp3-source";
import { isWebCodecsMp3Supported } from "./webcodecs-mp3-decoder";

describe("StreamingMp3Source in browser", () => {
  it("detects WebCodecs MP3 support in Chromium browser environment", async () => {
    const supported = await isWebCodecsMp3Supported();
    expect(typeof supported).toBe("boolean");
    if (typeof AudioDecoder !== "undefined") {
      expect(supported).toBe(true);
    }
  });

  it("exposes StreamingMp3Source.isSupported", async () => {
    const supported = await StreamingMp3Source.isSupported();
    expect(typeof supported).toBe("boolean");
  });
});
