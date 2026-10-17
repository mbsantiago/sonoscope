import {
  type AudioSource,
  attachPlayheadOverlay,
  type NavigationOptions,
  Sonoscope,
  type TimeRulerConfig,
  TimeRulerLocator,
  type TimeRulerStatus,
} from "@sonoscope/core";
import {
  type CSSProperties,
  forwardRef,
  type HTMLAttributes,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSonoscopeContext } from "./SonoscopeContext";

/**
 * Imperative handle exposed by the TimeRuler component ref.
 */
export type TimeRulerHandle = {
  /** Returns the underlying TimeRulerLocator instance. */
  getLocator: () => TimeRulerLocator | null;
  /** Returns the canvas element. */
  getCanvas: () => HTMLCanvasElement | null;
};

/**
 * Props for the TimeRuler component.
 */
export interface TimeRulerProps extends TimeRulerConfig {
  scope?: Sonoscope | null | undefined;
  source?: AudioSource | undefined;
  url?: string | undefined;
  audio?: HTMLAudioElement | undefined;
  width?: number | string | undefined;
  height?: number | string | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  canvasProps?: HTMLAttributes<HTMLCanvasElement> | undefined;
  navigation?: boolean | NavigationOptions | undefined;
  showPlayhead?: boolean | undefined;
  playheadClassName?: string | undefined;
  playheadStyle?: CSSProperties | undefined;
  onReady?: ((locator: TimeRulerLocator) => void) | undefined;
}

/**
 * Renders an interactive time axis ruler canvas.
 */
export const TimeRuler = forwardRef<TimeRulerHandle, TimeRulerProps>(
  (props, ref) => {
    const contextScope = useSonoscopeContext();
    const {
      scope = contextScope,
      source,
      url,
      audio,
      width,
      height = 24,
      className,
      style,
      canvasProps,
      navigation,
      showPlayhead = true,
      playheadClassName,
      playheadStyle,
      onReady,
      ...locatorConfig
    } = props;

    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const locatorRef = useRef<TimeRulerLocator | null>(null);
    const [activeScope, setActiveScope] = useState<Sonoscope | null>(null);
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;

    const [_status, setStatus] = useState<TimeRulerStatus>({ state: "idle" });

    // biome-ignore lint/correctness/useExhaustiveDependencies: serialize config to avoid shallow object recreations
    const memoizedConfig = useMemo(
      () => locatorConfig,
      [JSON.stringify(locatorConfig)],
    );

    const navSerialized = useMemo(
      () =>
        typeof navigation === "object"
          ? JSON.stringify(navigation)
          : String(navigation),
      [navigation],
    );

    // biome-ignore lint/correctness/useExhaustiveDependencies: initial mount uses scope/source identity; in-place option updates are handled reactively below
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      let isCancelled = false;
      let cleanupNav: (() => void) | undefined;
      let ownedScope: Sonoscope | undefined;
      const unsubs: Array<() => void> = [];

      const initLocator = async () => {
        try {
          let effectiveScope: Sonoscope | null = scope ?? null;

          if (!effectiveScope) {
            if (url) {
              effectiveScope = await Sonoscope.fromUrl(url, { audio });
              ownedScope = effectiveScope;
            } else if (source) {
              effectiveScope = Sonoscope.fromSource(source, { audio });
              ownedScope = effectiveScope;
            }
          }

          if (!effectiveScope) {
            setStatus({ state: "idle" });
            return;
          }

          if (isCancelled) {
            ownedScope?.destroy();
            return;
          }

          const locator = new TimeRulerLocator(
            canvas,
            effectiveScope.viewport,
            memoizedConfig,
          );

          if (isCancelled) {
            locator.destroy();
            ownedScope?.destroy();
            return;
          }

          locatorRef.current = locator;
          setActiveScope(effectiveScope);
          setStatus(locator.getStatus());

          onReadyRef.current?.(locator);

          unsubs.push(
            locator.on("renderstart", () => {
              setStatus({ state: "rendering" });
            }),
            locator.on("rendercomplete", () => {
              setStatus({ state: "ready" });
            }),
            locator.on("error", (event) => {
              setStatus({ state: "error", error: event.error });
            }),
          );

          if (navigation !== false && navigation !== undefined) {
            const navOpts = typeof navigation === "object" ? navigation : {};
            cleanupNav = effectiveScope.attachNavigation(canvas, {
              axis: "time",
              ...navOpts,
            });
          }

          await locator.render();
        } catch (error) {
          if (!isCancelled) {
            setStatus({
              state: "error",
              error: error instanceof Error ? error : new Error(String(error)),
            });
          }
        }
      };

      void initLocator();

      return () => {
        isCancelled = true;
        cleanupNav?.();
        for (const unsub of unsubs) unsub();
        locatorRef.current?.destroy();
        locatorRef.current = null;
        setActiveScope(null);
        ownedScope?.destroy();
      };
    }, [scope, url, source, audio, navSerialized]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container || !activeScope || showPlayhead === false) return;

      const overlay = attachPlayheadOverlay(container, activeScope, {
        className: playheadClassName,
        style: playheadStyle as Partial<CSSStyleDeclaration>,
      });

      return () => {
        overlay.destroy();
      };
    }, [activeScope, showPlayhead, playheadClassName, playheadStyle]);

    // Handle in-place reactive config updates on existing locator
    useEffect(() => {
      const locator = locatorRef.current;
      if (!locator) return;
      try {
        locator.updateConfig(memoizedConfig);
      } catch {}
    }, [memoizedConfig]);

    useImperativeHandle(ref, () => ({
      getLocator: () => locatorRef.current,
      getCanvas: () => canvasRef.current,
    }));

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          position: "relative",
          width: width ?? "100%",
          height: height ?? 24,
          ...style,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block" }}
          {...canvasProps}
        />
      </div>
    );
  },
);

TimeRuler.displayName = "TimeRuler";
