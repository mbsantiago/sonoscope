import type { ISonoscope } from "../../types";
import type { TimeFormatMode } from "./ticks";

export type TimeRulerProgramName = "ticks" | "boxes";

export type TimeRulerFrame = {
  width: number;
  height: number;
  dpr: number;
};

export type TimeRulerRenderInput = {
  canvas: HTMLCanvasElement;
  startTime: number;
  endTime: number;
  totalDuration: number;
  color?: string | undefined;
  backgroundColor?: string | undefined;
  tickColor?: string | undefined;
  labelColor?: string | undefined;
  font?: string | undefined;
  tickPosition?: "top" | "bottom" | "both" | "inside" | undefined;
  timeFormat?: TimeFormatMode | undefined;
  minMajorPixelSpacing?: number | undefined;
};

export interface TimeRulerProgram {
  readonly name: string;
  draw(
    ctx: CanvasRenderingContext2D,
    input: TimeRulerRenderInput,
    frame: TimeRulerFrame,
  ): void;
}

export type TimeRulerConfig = {
  autoRender?: boolean | undefined;
  startTime?: number | undefined;
  endTime?: number | undefined;
  minViewportDuration?: number | undefined;
  maxViewportDuration?: number | undefined;
  color?: string | undefined;
  backgroundColor?: string | undefined;
  tickColor?: string | undefined;
  labelColor?: string | undefined;
  font?: string | undefined;
  tickPosition?: "top" | "bottom" | "both" | "inside" | undefined;
  timeFormat?: TimeFormatMode | undefined;
  minMajorPixelSpacing?: number | undefined;
  program?: TimeRulerProgramName | TimeRulerProgram | undefined;
};

export type TimeRulerOptions = TimeRulerConfig;

export type ResolvedTimeRulerConfig = {
  autoRender: boolean;
  startTime: number;
  endTime: number;
  minViewportDuration: number;
  maxViewportDuration: number;
  color: string;
  backgroundColor: string;
  tickColor: string;
  labelColor: string;
  font: string;
  tickPosition: "top" | "bottom" | "both" | "inside";
  timeFormat: TimeFormatMode;
  minMajorPixelSpacing: number;
  program: TimeRulerProgramName | TimeRulerProgram;
};

export type TimeRulerViewport = {
  startTime: number;
  endTime: number;
};

export type TimeRulerStatus =
  | { state: "idle" | "rendering" | "ready" | "destroyed"; error?: undefined }
  | { state: "error"; error: Error };

export type TimeRulerEvents = {
  configchange: { config: ResolvedTimeRulerConfig };
  viewportchange: { viewport: TimeRulerViewport };
  renderstart: { requestId: string };
  rendercomplete: { requestId: string };
  error: { error: Error };
};

export interface ITimeRulerViewer {
  render(): Promise<void>;
  requestRender(): void;
  destroy(): void;
  getStatus(): TimeRulerStatus;
  getCanvas(): HTMLCanvasElement;

  getScope(): ISonoscope;
  getViewport(): TimeRulerViewport;

  getConfig(): ResolvedTimeRulerConfig;
  updateConfig(input: Partial<TimeRulerOptions>): void;
  setConfig(input: Partial<TimeRulerOptions>): void;

  canvasToTime(x: number): number;
  timeToCanvas(time: number): number;

  on<Name extends keyof TimeRulerEvents>(
    name: Name,
    handler: (event: TimeRulerEvents[Name]) => void,
  ): () => void;
}
