import type {
  BuiltInColorMap,
  FrequencyScale,
  ValueMode,
  WindowName,
} from "@sonoscope/core";

export type ShaderProgram =
  | "auto"
  | "normal"
  | "halftone"
  | "terrain"
  | "topographic";

export type SpectrogramSettings = {
  recordingIndex: number;
  frequencyScale: FrequencyScale;
  valueMode: ValueMode;
  colorMap: BuiltInColorMap;
  minDb: number;
  maxDb: number;
  valueGamma: number;
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
