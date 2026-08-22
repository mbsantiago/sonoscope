import type { IViewportController } from "../../types";
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
  /**
   * Whether to automatically re-render when viewport or configuration changes.
   * @default true
   */
  autoRender?: boolean | undefined;

  /**
   * Primary color for axis lines, tick marks, and text labels.
   * @default "#a0a0a0"
   */
  color?: string | undefined;

  /**
   * Canvas background fill color.
   * @default "transparent"
   */
  backgroundColor?: string | undefined;

  /**
   * Specific color override for tick lines.
   * @default color
   */
  tickColor?: string | undefined;

  /**
   * Specific color override for text labels.
   * @default color
   */
  labelColor?: string | undefined;

  /**
   * CSS font specification for time labels.
   * @default "10px monospace"
   */
  font?: string | undefined;

  /**
   * Tick mark position relative to the ruler baseline.
   * @default "top"
   */
  tickPosition?: "top" | "bottom" | "both" | "inside" | undefined;

  /**
   * Numeric timestamp formatting mode.
   * - "auto": Adapts precision based on zoom level.
   * - "seconds": Displays raw seconds (e.g., `12.5s`).
   * - "timecode": Broadcast notation (`mm:ss.ms`).
   * - "hhmmss": Clock time (`hh:mm:ss`).
   * - Custom function `(sec: number) => string`.
   * @default "auto"
   */
  timeFormat?: TimeFormatMode | undefined;

  /**
   * Minimum pixel spacing between adjacent major tick labels.
   * @default 75
   */
  minMajorPixelSpacing?: number | undefined;

  /**
   * Visual renderer program: standard tick lines or segmented boxes.
   * @default "ticks"
   */
  program?: TimeRulerProgramName | TimeRulerProgram | undefined;

  /**
   * Whether to automatically resize canvas pixel resolution when container dimensions change.
   * @default true
   */
  autoResize?: boolean | undefined;

  /**
   * Device pixel ratio scaling factor for HiDPI/Retina displays.
   * @default window.devicePixelRatio
   */
  devicePixelRatio?: boolean | number | undefined;
};

export type TimeRulerOptions = TimeRulerConfig;

export type ResolvedTimeRulerConfig = {
  autoRender: boolean;
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

/**
 * Time ruler viewer canvas controller and coordinate tick renderer.
 */
export interface ITimeRulerViewer {
  /** Renders the current time ruler viewport asynchronously. */
  render(): Promise<void>;
  /** Schedules a render on the next animation frame. */
  requestRender(): void;
  /** Disposes the ruler renderer and event listeners. */
  destroy(): void;
  /** Returns the current render status. */
  getStatus(): TimeRulerStatus;
  /** Returns the bound HTML canvas element. */
  getCanvas(): HTMLCanvasElement;

  /** Returns the bound viewport controller. */
  getViewportController(): IViewportController;
  /** Returns the visible time viewport. */
  getViewport(): TimeRulerViewport;

  /** Returns the resolved time ruler configuration options. */
  getConfig(): ResolvedTimeRulerConfig;
  /** Updates configuration options and triggers a re-render. */
  updateConfig(input: Partial<TimeRulerOptions>): void;
  /** Alias for `updateConfig`. */
  setConfig(input: Partial<TimeRulerOptions>): void;

  /** Converts canvas X pixel position to time in seconds. */
  canvasToTime(x: number): number;
  /** Converts time in seconds to canvas X pixel position. */
  timeToCanvas(time: number): number;

  /** Subscribes to time ruler events. */
  on<Name extends keyof TimeRulerEvents>(
    name: Name,
    handler: (event: TimeRulerEvents[Name]) => void,
  ): () => void;
}
