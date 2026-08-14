import type { ViewportConfig } from "./types";
import type { SpectrogramViewer } from "./viewer";
export type TimeBounds = {
  startTime: number;
  endTime: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
};
export type CanvasWheelNavigationOptions = {
  panSensitivity?: number;
  zoomSensitivity?: number;
  zoomModifier?: "shift" | "ctrl" | "alt" | "meta";
  onNavigate?: (viewport: ViewportConfig) => void;
};
export type CanvasDragNavigationOptions = {
  button?: number;
  modifier?: "shift" | "ctrl" | "alt" | "meta";
  dragThreshold?: number;
  cursor?: boolean;
  onNavigate?: (viewport: ViewportConfig) => void;
  onDragStart?: (event: PointerEvent | MouseEvent) => void;
  onDragEnd?: (event: PointerEvent | MouseEvent) => void;
};
export type CanvasNavigationOptions = CanvasWheelNavigationOptions &
  CanvasDragNavigationOptions & {
    enableWheel?: boolean;
    enableDrag?: boolean;
  };
export declare function setViewerViewport(
  viewer: SpectrogramViewer,
  viewport: Partial<ViewportConfig>,
): ViewportConfig;
export declare function panViewportTime(
  viewport: ViewportConfig,
  bounds: TimeBounds,
  deltaSeconds: number,
): ViewportConfig;
export declare function zoomViewportTime(
  viewport: ViewportConfig,
  bounds: TimeBounds,
  centerTime: number,
  factor: number,
): ViewportConfig;
export declare function attachCanvasWheelNavigation(
  viewer: SpectrogramViewer,
  canvas?: HTMLCanvasElement,
  options?: CanvasWheelNavigationOptions,
): () => void;
export declare function attachCanvasDragNavigation(
  viewer: SpectrogramViewer,
  canvas?: HTMLCanvasElement,
  options?: CanvasDragNavigationOptions,
): () => void;
export declare function attachCanvasNavigation(
  viewer: SpectrogramViewer,
  canvas?: HTMLCanvasElement,
  options?: CanvasNavigationOptions,
): () => void;
//# sourceMappingURL=navigation.d.ts.map
