import type { FrequencyScale, IViewportController } from "../../types";
import type { FrequencyFormatMode } from "./ticks";

export type FrequencyRulerRendererName = "ticks" | "boxes";

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

export interface FrequencyRulerRenderer {
  readonly name: string;
  draw(
    ctx: CanvasRenderingContext2D,
    input: FrequencyRulerRenderInput,
    frame: FrequencyRulerFrame,
  ): void;
}

export type FrequencyRulerConfig = {
  /**
   * Whether to automatically re-render when viewport or configuration changes.
   * @default true
   */
  autoRender?: boolean | undefined;

  /**
   * Frequency scale mapping: linear, mel, or logarithmic.
   * @default inherits from Sonoscope viewport scale
   */
  frequencyScale?: FrequencyScale | undefined;

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
   * CSS font specification for frequency labels.
   * @default "10px monospace"
   */
  font?: string | undefined;

  /**
   * Tick mark position relative to the vertical ruler axis.
   * @default "left"
   */
  tickPosition?: "left" | "right" | "both" | "inside" | undefined;

  /**
   * Frequency label formatting mode.
   * - "auto": Switches between Hz and kHz depending on magnitude.
   * - "hz": Always formats in Hertz (e.g. `2000 Hz`).
   * - "khz": Always formats in kilohertz (e.g. `2.0 kHz`).
   * - Custom function `(hz: number) => string`.
   * @default "auto"
   */
  frequencyFormat?: FrequencyFormatMode | undefined;

  /**
   * Minimum pixel spacing between adjacent major frequency labels.
   * @default 45
   */
  minMajorPixelSpacing?: number | undefined;

  /**
   * Visual renderer renderer: standard tick lines or segmented boxes.
   * @default "ticks"
   */
  renderer?: FrequencyRulerRendererName | FrequencyRulerRenderer | undefined;

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

export type FrequencyRulerOptions = FrequencyRulerConfig;

export type ResolvedFrequencyRulerConfig = {
  autoRender: boolean;
  frequencyScale: FrequencyScale;
  color: string;
  backgroundColor: string;
  tickColor: string;
  labelColor: string;
  font: string;
  tickPosition: "left" | "right" | "both" | "inside";
  frequencyFormat: FrequencyFormatMode;
  minMajorPixelSpacing: number;
  renderer: FrequencyRulerRendererName | FrequencyRulerRenderer;
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

/**
 * Frequency ruler viewer canvas controller and coordinate tick renderer.
 */
export interface IFrequencyRulerViewer {
  /** Renders the current frequency ruler viewport asynchronously. */
  render(): Promise<void>;
  /** Schedules a render on the next animation frame. */
  requestRender(): void;
  /** Disposes the frequency ruler renderer and event listeners. */
  destroy(): void;
  /** Returns the current render status. */
  getStatus(): FrequencyRulerStatus;
  /** Returns the bound HTML canvas element. */
  getCanvas(): HTMLCanvasElement;

  /** Returns the bound viewport controller. */
  getViewportController(): IViewportController;
  /** Returns the visible frequency viewport. */
  getViewport(): FrequencyRulerViewport;

  /** Returns the resolved frequency ruler configuration options. */
  getConfig(): ResolvedFrequencyRulerConfig;
  /** Updates configuration options and triggers a re-render. */
  updateConfig(input: Partial<FrequencyRulerOptions>): void;
  /** Alias for `updateConfig`. */
  setConfig(input: Partial<FrequencyRulerOptions>): void;

  /** Converts canvas Y pixel position to frequency in Hz. */
  canvasToFrequency(y: number): number;
  /** Converts frequency in Hz to canvas Y pixel position. */
  frequencyToCanvas(freq: number): number;

  /** Subscribes to frequency ruler events. */
  on<Name extends keyof FrequencyRulerEvents>(
    name: Name,
    handler: (event: FrequencyRulerEvents[Name]) => void,
  ): () => void;
}
