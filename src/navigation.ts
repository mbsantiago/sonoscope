import type { SpectrogramViewer } from './viewer';
import type { ViewportConfig } from './types';

export type TimeBounds = { startTime: number; endTime: number; minDurationSeconds?: number; maxDurationSeconds?: number };

export type CanvasNavigationOptions = {
  panSensitivity?: number;
  zoomSensitivity?: number;
  zoomModifier?: 'shift' | 'ctrl' | 'alt' | 'meta';
  onNavigate?: (viewport: ViewportConfig) => void;
};

export function setViewerViewport(viewer: SpectrogramViewer, viewport: Partial<ViewportConfig>): ViewportConfig {
  viewer.setViewport(viewport);
  viewer.requestRender();
  return viewer.getViewport();
}

export function panViewportTime(viewport: ViewportConfig, bounds: TimeBounds, deltaSeconds: number): ViewportConfig {
  const duration = viewport.endTime - viewport.startTime;
  const startTime = clamp(viewport.startTime + deltaSeconds, bounds.startTime, Math.max(bounds.startTime, bounds.endTime - duration));
  return { ...viewport, startTime, endTime: startTime + duration };
}

export function zoomViewportTime(viewport: ViewportConfig, bounds: TimeBounds, centerTime: number, factor: number): ViewportConfig {
  const currentDuration = viewport.endTime - viewport.startTime;
  const minDuration = bounds.minDurationSeconds ?? 0.001;
  const maxDuration = Math.min(bounds.maxDurationSeconds ?? bounds.endTime - bounds.startTime, bounds.endTime - bounds.startTime);
  const duration = clamp(currentDuration * factor, minDuration, maxDuration);
  if (Math.abs(duration - currentDuration) < 1e-9) return viewport;
  const ratio = currentDuration <= 0 ? 0.5 : (centerTime - viewport.startTime) / currentDuration;
  const startTime = clamp(centerTime - duration * ratio, bounds.startTime, Math.max(bounds.startTime, bounds.endTime - duration));
  return { ...viewport, startTime, endTime: startTime + duration };
}

export function attachCanvasNavigation(viewer: SpectrogramViewer, canvas = viewer.getConfig().canvas, options: CanvasNavigationOptions = {}): () => void {
  const panSensitivity = options.panSensitivity ?? 260;
  const zoomSensitivity = options.zoomSensitivity ?? 0.055;
  const zoomModifier = options.zoomModifier ?? 'shift';
  let pendingWheel: { deltaY: number; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; clientX: number; clientY: number } | undefined;
  let wheelFrame: number | undefined;

  const apply = (viewport: ViewportConfig) => {
    const next = setViewerViewport(viewer, viewport);
    options.onNavigate?.(next);
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    pendingWheel = { deltaY: event.deltaY, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, altKey: event.altKey, metaKey: event.metaKey, clientX: event.clientX, clientY: event.clientY };
    if (wheelFrame !== undefined) return;
    wheelFrame = requestAnimationFrame(() => {
      wheelFrame = undefined;
      if (!pendingWheel) return;
      const wheel = pendingWheel;
      pendingWheel = undefined;
      const source = viewer.getConfig().source;
      if (!source) return;
      const viewport = viewer.getViewport();
      const constraints = viewer.getConfig().viewportConstraints;
      const bounds = { startTime: 0, endTime: source.duration, minDurationSeconds: constraints?.minDurationSeconds, maxDurationSeconds: constraints?.maxDurationSeconds };
      if (modifierPressed(wheel, zoomModifier)) {
        const rect = canvas.getBoundingClientRect();
        const { time } = viewer.canvasToTimeFrequency(wheel.clientX - rect.left, wheel.clientY - rect.top);
        apply(zoomViewportTime(viewport, bounds, time, Math.exp((wheel.deltaY < 0 ? -1 : 1) * zoomSensitivity)));
        return;
      }
      apply(panViewportTime(viewport, bounds, (wheel.deltaY / panSensitivity) * (viewport.endTime - viewport.startTime)));
    });
  };

  canvas.addEventListener('wheel', onWheel, { passive: false });
  return () => {
    canvas.removeEventListener('wheel', onWheel);
    if (wheelFrame !== undefined) cancelAnimationFrame(wheelFrame);
  };
}

function modifierPressed(event: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }, modifier: NonNullable<CanvasNavigationOptions['zoomModifier']>): boolean {
  if (modifier === 'shift') return event.shiftKey;
  if (modifier === 'ctrl') return event.ctrlKey;
  if (modifier === 'alt') return event.altKey;
  return event.metaKey;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
