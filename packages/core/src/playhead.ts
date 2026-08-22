import type { ISonoscope } from "./types";

export interface PlayheadOverlayOptions {
  className?: string | undefined;
  style?: Partial<CSSStyleDeclaration> | undefined;
  color?: string | undefined;
  width?: number | undefined;
  zIndex?: number | undefined;
  snapToPixels?: boolean | undefined;
}

export interface IPlayheadOverlay {
  getElement(): HTMLDivElement;
  update(): void;
  destroy(): void;
}

export class PlayheadOverlay implements IPlayheadOverlay {
  private readonly element: HTMLDivElement;
  private readonly container: HTMLElement;
  private readonly scope: ISonoscope;
  private readonly options: PlayheadOverlayOptions;
  private readonly cleanups: Array<() => void> = [];
  private rafId: number | undefined;

  constructor(
    container: HTMLElement,
    scope: ISonoscope,
    options: PlayheadOverlayOptions = {},
  ) {
    this.container = container;
    this.scope = scope;
    this.options = options;

    if (
      typeof window !== "undefined" &&
      typeof window.getComputedStyle === "function" &&
      window.getComputedStyle(container).position === "static"
    ) {
      container.style.position = "relative";
    }

    this.element = document.createElement("div");
    this.element.className = options.className || "sonoscope-playhead";
    Object.assign(this.element.style, {
      position: "absolute",
      top: "0",
      bottom: "0",
      left: "0",
      margin: "0",
      padding: "0",
      height: "100%",
      boxSizing: "border-box",
      width: `${options.width ?? 1.5}px`,
      backgroundColor: options.color ?? "rgba(255, 255, 255, 0.95)",
      boxShadow: "0 0 2px rgba(0, 0, 0, 0.6)",
      pointerEvents: "none",
      zIndex: String(options.zIndex ?? 10),
      willChange: "transform",
      transformOrigin: "left center",
      ...options.style,
    });

    container.appendChild(this.element);

    const onTime = () => this.update();
    const onViewport = () => this.update();

    const unsubTime = this.scope.on("timeupdate", onTime);
    const unsubVp = this.scope.on("viewportchange", onViewport);
    this.cleanups.push(unsubTime, unsubVp);

    this.update();
  }

  getElement(): HTMLDivElement {
    return this.element;
  }

  scheduleUpdate(): void {
    if (this.rafId !== undefined) return;
    if (typeof requestAnimationFrame !== "undefined") {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = undefined;
        this.update();
      });
    } else {
      this.update();
    }
  }

  update(): void {
    const vp = this.scope.getViewport();
    const currentTime = this.scope.getCurrentTime();
    const duration = vp.endTime - vp.startTime;

    if (
      duration <= 0 ||
      currentTime < vp.startTime ||
      currentTime > vp.endTime
    ) {
      this.element.style.display = "none";
      return;
    }

    const rect = this.container.getBoundingClientRect
      ? this.container.getBoundingClientRect()
      : { width: this.container.clientWidth || 1 };
    const containerWidth = rect.width || this.container.clientWidth || 1;
    const ratio = (currentTime - vp.startTime) / duration;
    let x = ratio * containerWidth;

    if (this.options.snapToPixels) {
      x = Math.round(x);
    }

    this.element.style.display = "";
    this.element.style.transform = `translate3d(${x}px, 0px, 0px)`;
  }

  destroy(): void {
    if (
      this.rafId !== undefined &&
      typeof cancelAnimationFrame !== "undefined"
    ) {
      cancelAnimationFrame(this.rafId);
      this.rafId = undefined;
    }
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}

export function attachPlayheadOverlay(
  container: HTMLElement,
  scope: ISonoscope,
  options?: PlayheadOverlayOptions,
): IPlayheadOverlay {
  return new PlayheadOverlay(container, scope, options);
}
