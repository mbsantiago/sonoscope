import type { FrequencyScale, ISonoscope, NavigationOptions } from "../../types";
import type { FrequencyFormatMode } from "./ticks";

export type FrequencyRulerProgramName = "ticks" | "boxes";

export type FrequencyRulerFrame = {
  width: number;
  height: number;
  dpr: number;
};

export type FrequencyRulerRenderInput = {
  canvas: HTMLCanvasElement;
  minFrequency: number;
  maxFrequency: number;
  frequencyScale?: FrequencyScale | undefined;
  color?: string | undefined;
  backgroundColor?: string | undefined;
  tickColor?: string | undefined;
  labelColor?: string | undefined;
  font?: string | undefined;
  tickPosition?: "left" | "right" | "both" | "inside" | undefined;
  frequencyFormat?: FrequencyFormatMode | undefined;
  minMajorPixelSpacing?: number | undefined;
};

export interface FrequencyRulerProgram {
  readonly name: string;
  draw(
    ctx: CanvasRenderingContext2D,
    input: FrequencyRulerRenderInput,
    frame: FrequencyRulerFrame,
  ): void;
}

export type FrequencyRulerConfig = {
  autoRender?: boolean | undefined;
  minFrequency?: number | undefined;
  maxFrequency?: number | undefined;
  frequencyScale?: FrequencyScale | undefined;
  color?: string | undefined;
  backgroundColor?: string | undefined;
  tickColor?: string | undefined;
  labelColor?: string | undefined;
  font?: string | undefined;
  tickPosition?: "left" | "right" | "both" | "inside" | undefined;
  frequencyFormat?: FrequencyFormatMode | undefined;
  minMajorPixelSpacing?: number | undefined;
  program?: FrequencyRulerProgramName | FrequencyRulerProgram | undefined;
};

export type FrequencyRulerOptions = FrequencyRulerConfig;

export type ResolvedFrequencyRulerConfig = {
  autoRender: boolean;
  minFrequency: number;
  maxFrequency: number;
  frequencyScale: FrequencyScale;
  color: string;
  backgroundColor: string;
  tickColor: string;
  labelColor: string;
  font: string;
  tickPosition: "left" | "right" | "both" | "inside";
  frequencyFormat: FrequencyFormatMode;
  minMajorPixelSpacing: number;
  program: FrequencyRulerProgramName | FrequencyRulerProgram;
};

export type FrequencyRulerViewport = {
  minFrequency: number;
  maxFrequency: number;
  frequencyScale: FrequencyScale;
};

export type FrequencyRulerStatus =
  | { state: "idle" | "rendering" | "ready" | "destroyed"; error?: undefined }
  | { state: "error"; error: Error };

export type FrequencyRulerEvents = {
  configchange: { config: ResolvedFrequencyRulerConfig };
  viewportchange: { viewport: FrequencyRulerViewport };
  renderstart: { requestId: string };
  rendercomplete: { requestId: string };
  error: { error: Error };
};

export interface IFrequencyRulerViewer {
  render(): Promise<void>;
  requestRender(): void;
  destroy(): void;
  getStatus(): FrequencyRulerStatus;
  getCanvas(): HTMLCanvasElement;

  getScope(): ISonoscope;
  getViewport(): FrequencyRulerViewport;
  updateViewport(viewport: Partial<FrequencyRulerViewport>): void;
  setViewport(viewport: Partial<FrequencyRulerViewport>): void;
  attachNavigation(options?: NavigationOptions): () => void;

  getConfig(): ResolvedFrequencyRulerConfig;
  updateConfig(input: Partial<FrequencyRulerOptions>): void;
  setConfig(input: Partial<FrequencyRulerOptions>): void;

  canvasToFrequency(y: number): number;
  frequencyToCanvas(freq: number): number;

  on<Name extends keyof FrequencyRulerEvents>(
    name: Name,
    handler: (event: FrequencyRulerEvents[Name]) => void,
  ): () => void;
}
