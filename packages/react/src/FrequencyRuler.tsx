import {
  type AudioSource,
  type FrequencyRulerConfig,
  type FrequencyRulerStatus,
  FrequencyRulerViewer,
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

export type FrequencyRulerHandle = {
  getViewer: () => FrequencyRulerViewer | null;
  getCanvas: () => HTMLCanvasElement | null;
};

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
  onReady?: ((viewer: FrequencyRulerViewer) => void) | undefined;
}

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
    ...viewerConfig
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<FrequencyRulerViewer | null>(null);
  const [_activeScope, setActiveScope] = useState<Sonoscope | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const [_status, setStatus] = useState<FrequencyRulerStatus>({
    state: "idle",
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: serialize config to avoid shallow object recreations
  const memoizedConfig = useMemo(
    () => viewerConfig,
    [JSON.stringify(viewerConfig)],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: initial mount uses scope/source identity; in-place option updates are handled reactively below
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isCancelled = false;
    let ownedScope: Sonoscope | undefined;
    const unsubs: Array<() => void> = [];

    const initViewer = async () => {
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

        const viewer = new FrequencyRulerViewer(
          effectiveScope,
          canvas,
          memoizedConfig,
        );

        if (isCancelled) {
          viewer.destroy();
          ownedScope?.destroy();
          return;
        }

        viewerRef.current = viewer;
        setActiveScope(effectiveScope);
        setStatus(viewer.getStatus());

        onReadyRef.current?.(viewer);

        unsubs.push(
          viewer.on("renderstart", () => {
            setStatus({ state: "rendering" });
          }),
          viewer.on("rendercomplete", () => {
            setStatus({ state: "ready" });
          }),
          viewer.on("error", (event) => {
            setStatus({ state: "error", error: event.error });
          }),
        );

        await viewer.render();
      } catch (error) {
        if (!isCancelled) {
          setStatus({
            state: "error",
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    };

    void initViewer();

    return () => {
      isCancelled = true;
      for (const unsub of unsubs) unsub();
      viewerRef.current?.destroy();
      viewerRef.current = null;
      setActiveScope(null);
      ownedScope?.destroy();
    };
  }, [scope, url, source, audio]);

  // Handle in-place reactive config updates on existing viewer
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    try {
      viewer.updateConfig(memoizedConfig);
    } catch {}
  }, [memoizedConfig]);

  useImperativeHandle(ref, () => ({
    getViewer: () => viewerRef.current,
    getCanvas: () => canvasRef.current,
  }));

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        width,
        height,
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
