import type {
  BuiltInColorMap,
  FrequencyScale,
  ValueMode,
  WindowName,
} from "@sonogram/core";

export type ShaderProgram = "auto" | "normal" | "dither" | "sobel" | "terrain";

export type SpectrogramSettings = {
  recordingIndex: number;
  frequencyScale: FrequencyScale;
  valueMode: ValueMode;
  colorMap: BuiltInColorMap;
  minDb: number;
  maxDb: number;
  windowSize: number;
  hopSize: number;
  window: WindowName;
  shaderProgram: ShaderProgram;
};

export type ViewportState = {
  startTime: number;
  endTime: number;
  minFrequency: number;
  maxFrequency: number;
};
