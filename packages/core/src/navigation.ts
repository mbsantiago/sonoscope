import type { ViewportConfig } from "./types";
import type { SpectrogramViewer } from "./viewer";
import type { WaveformViewer } from "./waveform/viewer";

export interface NavigableViewer {
  setViewport(viewport: Partial<ViewportConfig>): void;
  requestRender(): void;
  getViewport(): {
    startTime: number;
    endTime: number;
    minFrequency?: number;
    maxFrequency?: number;
    frequencyScale?: string;
  };
  getConfig(): {
    canvas: HTMLCanvasElement;
    source?: { duration?: number; [key: string]: unknown };
    minViewportDuration?: number;
    maxViewportDuration?: number;
    [key: string]: unknown;
  };
  getTimeBounds?: () => TimeBounds;
  canvasToTimeFrequency?: (
    x: number,
    y: number,
  ) => { time: number; frequency: number };
  canvasToTime?: (x: number) => number;
}

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

export type FrequencyBounds = {
  minFrequency: number;
  maxFrequency: number;
  minSpanHz?: number;
};

export function setViewerViewport(
  viewer: NavigableViewer | SpectrogramViewer | WaveformViewer,
  viewport: Partial<ViewportConfig>,
): ViewportConfig {
  viewer.setViewport(viewport);
  viewer.requestRender();
  return viewer.getViewport() as ViewportConfig;
}

export function panViewportTime(
  viewport: ViewportConfig,
  bounds: TimeBounds,
  deltaSeconds: number,
): ViewportConfig {
  const duration = viewport.endTime - viewport.startTime;
  const startTime = clamp(
    viewport.startTime + deltaSeconds,
    bounds.startTime,
    Math.max(bounds.startTime, bounds.endTime - duration),
  );
  return { ...viewport, startTime, endTime: startTime + duration };
}

export function panViewportFrequency(
  viewport: ViewportConfig,
  bounds: FrequencyBounds,
  deltaHz: number,
): ViewportConfig {
  const span = viewport.maxFrequency - viewport.minFrequency;
  const minFrequency = clamp(
    viewport.minFrequency + deltaHz,
    bounds.minFrequency,
    Math.max(bounds.minFrequency, bounds.maxFrequency - span),
  );
  return { ...viewport, minFrequency, maxFrequency: minFrequency + span };
}

export function zoomViewportTime(
  viewport: ViewportConfig,
  bounds: TimeBounds,
  centerTime: number,
  factor: number,
): ViewportConfig {
  const currentDuration = viewport.endTime - viewport.startTime;
  const minDuration = bounds.minDurationSeconds ?? 0.001;
  const maxDuration = Math.min(
    bounds.maxDurationSeconds ?? bounds.endTime - bounds.startTime,
    bounds.endTime - bounds.startTime,
  );
  const duration = clamp(currentDuration * factor, minDuration, maxDuration);
  if (Math.abs(duration - currentDuration) < 1e-9) return viewport;
  const ratio =
    currentDuration <= 0
      ? 0.5
      : (centerTime - viewport.startTime) / currentDuration;
  const startTime = clamp(
    centerTime - duration * ratio,
    bounds.startTime,
    Math.max(bounds.startTime, bounds.endTime - duration),
  );
  return { ...viewport, startTime, endTime: startTime + duration };
}

export function zoomViewportFrequency(
  viewport: ViewportConfig,
  bounds: FrequencyBounds,
  centerFrequency: number,
  factor: number,
): ViewportConfig {
  const currentSpan = viewport.maxFrequency - viewport.minFrequency;
  const maxSpan = bounds.maxFrequency - bounds.minFrequency;
  const minSpan = Math.min(bounds.minSpanHz ?? 10, maxSpan);
  const span = clamp(currentSpan * factor, minSpan, maxSpan);
  if (Math.abs(span - currentSpan) < 1e-9) return viewport;
  const ratio =
    currentSpan <= 0
      ? 0.5
      : (centerFrequency - viewport.minFrequency) / currentSpan;
  const minFrequency = clamp(
    centerFrequency - span * ratio,
    bounds.minFrequency,
    Math.max(bounds.minFrequency, bounds.maxFrequency - span),
  );
  return { ...viewport, minFrequency, maxFrequency: minFrequency + span };
}

export function attachCanvasWheelNavigation(
  viewer: NavigableViewer | SpectrogramViewer | WaveformViewer,
  canvas = viewer.getConfig().canvas,
  options: CanvasWheelNavigationOptions = {},
): () => void {
  const panSensitivity = options.panSensitivity ?? 260;
  const zoomSensitivity = options.zoomSensitivity ?? 0.055;
  const zoomModifier = options.zoomModifier ?? "ctrl";
  let pendingWheel:
    | {
        deltaY: number;
        shiftKey: boolean;
        ctrlKey: boolean;
        altKey: boolean;
        metaKey: boolean;
        clientX: number;
        clientY: number;
      }
    | undefined;
  let wheelFrame: number | undefined;

  const apply = (viewport: ViewportConfig) => {
    const next = setViewerViewport(viewer, viewport);
    options.onNavigate?.(next);
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    pendingWheel = {
      deltaY: event.deltaY,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    if (wheelFrame !== undefined) return;
    wheelFrame = requestAnimationFrame(() => {
      wheelFrame = undefined;
      if (!pendingWheel) return;
      const wheel = pendingWheel;
      pendingWheel = undefined;
      const viewport = viewer.getViewport() as ViewportConfig;
      const config = viewer.getConfig();
      const bounds: TimeBounds =
        "getTimeBounds" in viewer && typeof viewer.getTimeBounds === "function"
          ? viewer.getTimeBounds()
          : {
              startTime: 0,
              endTime:
                ("getScope" in viewer && typeof viewer.getScope === "function"
                  ? viewer.getScope().getDuration()
                  : config.source?.duration) ?? 0,
              minDurationSeconds: config.minViewportDuration ?? 0.05,
              maxDurationSeconds: config.maxViewportDuration ?? 30,
            };
      if (modifierPressed(wheel, zoomModifier)) {
        const rect = canvas.getBoundingClientRect();
        const time =
          "canvasToTimeFrequency" in viewer &&
          typeof viewer.canvasToTimeFrequency === "function"
            ? viewer.canvasToTimeFrequency(
                wheel.clientX - rect.left,
                wheel.clientY - rect.top,
              ).time
            : "canvasToTime" in viewer &&
                typeof viewer.canvasToTime === "function"
              ? viewer.canvasToTime(wheel.clientX - rect.left)
              : (() => {
                  const width = rect.width || canvas.clientWidth || 1;
                  const ratio = (wheel.clientX - rect.left) / width;
                  return (
                    viewport.startTime +
                    ratio * (viewport.endTime - viewport.startTime)
                  );
                })();
        apply(
          zoomViewportTime(
            viewport,
            bounds,
            time,
            Math.exp((wheel.deltaY < 0 ? -1 : 1) * zoomSensitivity),
          ),
        );
        return;
      }
      apply(
        panViewportTime(
          viewport,
          bounds,
          (wheel.deltaY / panSensitivity) *
            (viewport.endTime - viewport.startTime),
        ),
      );
    });
  };

  canvas.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    canvas.removeEventListener("wheel", onWheel);
    if (wheelFrame !== undefined) cancelAnimationFrame(wheelFrame);
  };
}

export function attachCanvasDragNavigation(
  viewer: NavigableViewer | SpectrogramViewer | WaveformViewer,
  canvas = viewer.getConfig().canvas,
  options: CanvasDragNavigationOptions = {},
): () => void {
  const targetButton = options.button ?? 0;
  const dragThreshold = options.dragThreshold ?? 3;
  const manageCursor = options.cursor ?? true;

  let isPointerDown = false;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startViewport: ViewportConfig | undefined;
  let activePointerId: number | undefined;
  const originalCursor = canvas.style?.cursor ?? "";

  if (manageCursor && canvas.style) {
    canvas.style.cursor = "grab";
  }

  const apply = (viewport: ViewportConfig) => {
    const next = setViewerViewport(viewer, viewport);
    options.onNavigate?.(next);
  };

  const onPointerDown = (event: PointerEvent | MouseEvent) => {
    if (event.button !== targetButton) return;
    if (options.modifier && !modifierPressed(event, options.modifier)) return;

    isPointerDown = true;
    isDragging = false;
    startX = event.clientX;
    startY = event.clientY;
    startViewport = viewer.getViewport() as ViewportConfig;

    if ("pointerId" in event) {
      activePointerId = event.pointerId;
      try {
        canvas.setPointerCapture?.(event.pointerId);
      } catch {
        // pointer capture may not be supported in some environments
      }
    }
  };

  const onPointerMove = (event: PointerEvent | MouseEvent) => {
    if (!isPointerDown || !startViewport) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (!isDragging) {
      if (Math.hypot(dx, dy) < dragThreshold) return;
      isDragging = true;
      if (manageCursor && canvas.style) {
        canvas.style.cursor = "grabbing";
      }
      options.onDragStart?.(event);
    }

    const rect = canvas.getBoundingClientRect?.() ?? { width: 0 };
    const canvasWidth = rect.width || canvas.clientWidth || 1;
    const duration = startViewport.endTime - startViewport.startTime;
    const deltaSeconds = -(dx / canvasWidth) * duration;

    const config = viewer.getConfig();
    const bounds: TimeBounds =
      "getTimeBounds" in viewer && typeof viewer.getTimeBounds === "function"
        ? viewer.getTimeBounds()
        : {
            startTime: 0,
            endTime:
              ("getScope" in viewer && typeof viewer.getScope === "function"
                ? viewer.getScope().getDuration()
                : config.source?.duration) ?? 0,
            minDurationSeconds: config.minViewportDuration ?? 0.05,
            maxDurationSeconds: config.maxViewportDuration ?? 30,
          };

    apply(panViewportTime(startViewport, bounds, deltaSeconds));
  };

  const onPointerUp = (event: PointerEvent | MouseEvent) => {
    if (!isPointerDown) return;
    isPointerDown = false;

    if (
      activePointerId !== undefined &&
      "releasePointerCapture" in canvas &&
      typeof canvas.releasePointerCapture === "function"
    ) {
      try {
        canvas.releasePointerCapture(activePointerId);
      } catch {
        // ignore release capture error
      }
      activePointerId = undefined;
    }

    if (isDragging) {
      isDragging = false;
      if (manageCursor && canvas.style) {
        canvas.style.cursor = "grab";
      }
      options.onDragEnd?.(event);
    }
    startViewport = undefined;
  };

  const hasPointerEvents =
    typeof window !== "undefined" && "PointerEvent" in window;
  const downEvent = hasPointerEvents ? "pointerdown" : "mousedown";
  const moveEvent = hasPointerEvents ? "pointermove" : "mousemove";
  const upEvent = hasPointerEvents ? "pointerup" : "mouseup";
  const cancelEvent = hasPointerEvents ? "pointercancel" : "mouseleave";

  canvas.addEventListener(downEvent, onPointerDown as EventListener);
  canvas.addEventListener(moveEvent, onPointerMove as EventListener);
  canvas.addEventListener(upEvent, onPointerUp as EventListener);
  canvas.addEventListener(cancelEvent, onPointerUp as EventListener);

  return () => {
    canvas.removeEventListener(downEvent, onPointerDown as EventListener);
    canvas.removeEventListener(moveEvent, onPointerMove as EventListener);
    canvas.removeEventListener(upEvent, onPointerUp as EventListener);
    canvas.removeEventListener(cancelEvent, onPointerUp as EventListener);
    if (manageCursor && canvas.style) {
      canvas.style.cursor = originalCursor;
    }
  };
}

export function attachCanvasNavigation(
  viewer: NavigableViewer | SpectrogramViewer | WaveformViewer,
  canvas = viewer.getConfig().canvas,
  options: CanvasNavigationOptions = {},
): () => void {
  const cleanups: Array<() => void> = [];

  if (options.enableWheel !== false) {
    cleanups.push(attachCanvasWheelNavigation(viewer, canvas, options));
  }

  if (options.enableDrag !== false) {
    cleanups.push(attachCanvasDragNavigation(viewer, canvas, options));
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}

function modifierPressed(
  event: {
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  },
  modifier: NonNullable<CanvasWheelNavigationOptions["zoomModifier"]>,
): boolean {
  if (modifier === "shift") return event.shiftKey;
  if (modifier === "ctrl") return event.ctrlKey;
  if (modifier === "alt") return event.altKey;
  return event.metaKey;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
