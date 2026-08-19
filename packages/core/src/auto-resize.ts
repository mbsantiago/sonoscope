export interface AutoResizeOptions {
  /**
   * Whether to scale internal canvas buffer pixels by window.devicePixelRatio for High-DPI (Retina) crispness.
   * Default: true
   */
  devicePixelRatio?: boolean | number | undefined;

  /**
   * Callback invoked whenever the canvas buffer dimensions change.
   */
  onResize?: ((width: number, height: number) => void) | undefined;
}

/**
 * Attaches a ResizeObserver to an HTMLCanvasElement that synchronizes its internal
 * buffer dimensions (canvas.width, canvas.height) with its rendered CSS layout size.
 *
 * @returns A cleanup function to disconnect the ResizeObserver.
 */
export function attachAutoResize(
  canvas: HTMLCanvasElement,
  onResizeOrOptions?:
    | ((width: number, height: number) => void)
    | AutoResizeOptions
    | undefined,
): () => void {
  if (typeof ResizeObserver === "undefined" || !canvas) {
    return () => {};
  }

  const options: AutoResizeOptions =
    typeof onResizeOrOptions === "function"
      ? { onResize: onResizeOrOptions }
      : (onResizeOrOptions ?? {});

  const useDpr = options.devicePixelRatio ?? true;

  const updateSize = (rectWidth: number, rectHeight: number) => {
    if (rectWidth <= 0 || rectHeight <= 0) return;

    const dpr =
      typeof useDpr === "number"
        ? useDpr
        : useDpr
          ? (globalThis as unknown as { devicePixelRatio?: number })
              .devicePixelRatio || 1
          : 1;

    const targetWidth = Math.max(1, Math.round(rectWidth * dpr));
    const targetHeight = Math.max(1, Math.round(rectHeight * dpr));

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      options.onResize?.(targetWidth, targetHeight);
    }
  };

  // Immediate initial check if canvas already has layout bounds
  if (typeof canvas.getBoundingClientRect === "function") {
    const initialRect = canvas.getBoundingClientRect();
    if (initialRect.width > 0 && initialRect.height > 0) {
      updateSize(initialRect.width, initialRect.height);
    }
  }

  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    const { width, height } = entry.contentRect;
    updateSize(width, height);
  });

  observer.observe(canvas);

  return () => {
    observer.disconnect();
  };
}
