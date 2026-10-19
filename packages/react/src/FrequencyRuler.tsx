import {
  type AudioSource,
  type FrequencyRulerConfig,
  FrequencyRulerLocator,
  type FrequencyRulerStatus,
  Sonoscope,
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
 * Imperative handle exposed by the FrequencyRuler component ref.
 */
export type FrequencyRulerHandle = {
  /** Returns the underlying FrequencyRulerLocator instance. */
  getLocator: () => FrequencyRulerLocator | null;
  /** Returns the canvas element. */
  getCanvas: () => HTMLCanvasElement | null;
};

/**
 * Props for the FrequencyRuler component.
 */
export interface FrequencyRulerProps extends FrequencyRulerConfig {
  scope?: Sonoscope | null | undefined;
  source?: AudioSource | undefined;
  url?: string | undefined;
  audio?: HTMLAudioElement | undefined;
  width?: number | string | undefined;
  height?: number | string | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  canvasProps?: HTMLAttributes<HTMLCanvasElement> | undefined;
  onReady?: ((locator: FrequencyRulerLocator) => void) | undefined;
}

/**
 * Renders an interactive frequency axis ruler canvas.
 */
export const FrequencyRuler = forwardRef<
  FrequencyRulerHandle,
  FrequencyRulerProps
>((props, ref) => {
  const contextScope = useSonoscopeContext();
  const {
    scope = contextScope,
    source,
    url,
    audio,
    width = 50,
    height,
    className,
    style,
    canvasProps,
    onReady,
    ...locatorConfig
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const locatorRef = useRef<FrequencyRulerLocator | null>(null);
  const [_activeScope, setActiveScope] = useState<Sonoscope | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const [_status, setStatus] = useState<FrequencyRulerStatus>({
    state: "idle",
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: serialize config to avoid shallow object recreations
  const memoizedConfig = useMemo(
    () => locatorConfig,
    [JSON.stringify(locatorConfig)],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: initial mount uses scope/source identity; in-place option updates are handled reactively below
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isCancelled = false;
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

        const locator = new FrequencyRulerLocator(
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
      for (const unsub of unsubs) unsub();
      locatorRef.current?.destroy();
      locatorRef.current = null;
      setActiveScope(null);
      ownedScope?.destroy();
    };
  }, [scope, url, source, audio]);

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
        width: width ?? 50,
        height: height ?? "100%",
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
});

FrequencyRuler.displayName = "FrequencyRuler";
