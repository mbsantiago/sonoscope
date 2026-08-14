import {
  attachCanvasNavigation,
  type CanvasNavigationOptions,
  type SpectrogramConfig,
  type SpectrogramStatus,
  SpectrogramViewer,
  type ViewportConfig,
} from "@sonogram/core";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

export type SpectrogramReadyInfo = {
  viewer: SpectrogramViewer;
  duration: number;
  sampleRate: number;
  nyquist: number;
  viewport: ViewportConfig;
};

export type UseSpectrogramOptions = Omit<
  SpectrogramConfig,
  "canvas" | "audio"
> & {
  url?: string | undefined;
  navigation?: boolean | CanvasNavigationOptions | undefined;
  onViewportChange?: ((viewport: ViewportConfig) => void) | undefined;
  onReady?: ((info: SpectrogramReadyInfo) => void) | undefined;
};

export type UseSpectrogramResult = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
  viewerRef: RefObject<SpectrogramViewer | null>;
  status: SpectrogramStatus;
  viewport: ViewportConfig | null;
  duration: number;
  sampleRate: number;
  nyquist: number;
};

export function useSpectrogram(
  options: UseSpectrogramOptions = {},
): UseSpectrogramResult {
  const {
    url,
    source,
    navigation,
    onViewportChange,
    onReady,
    ...viewerConfig
  } = options;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const viewerRef = useRef<SpectrogramViewer | null>(null);
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const [status, setStatus] = useState<SpectrogramStatus>({ state: "idle" });
  const [viewport, setViewport] = useState<ViewportConfig | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [sampleRate, setSampleRate] = useState<number>(0);
  const [nyquist, setNyquist] = useState<number>(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: serialize config to avoid shallow object recreations
  const memoizedConfig = useMemo(
    () => viewerConfig,
    [JSON.stringify(viewerConfig)],
  );

  const navSerialized = useMemo(
    () =>
      typeof navigation === "object"
        ? JSON.stringify(navigation)
        : String(navigation),
    [navigation],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: initial mount uses source identity; in-place option updates are handled reactively below
  useEffect(() => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas) return;

    let isCancelled = false;
    let cleanupNav: (() => void) | undefined;
    const unsubs: Array<() => void> = [];

    setStatus({ state: "loading" });

    const initViewer = async () => {
      try {
        let viewer: SpectrogramViewer;
        const audioProp = audio ? { audio } : {};

        if (url) {
          viewer = await SpectrogramViewer.fromUrl({
            ...memoizedConfig,
            ...audioProp,
            canvas,
            url,
          });
        } else if (source) {
          viewer = await SpectrogramViewer.fromSource({
            ...memoizedConfig,
            ...audioProp,
            canvas,
            source,
          });
        } else {
          return;
        }

        if (isCancelled) {
          viewer.destroy();
          return;
        }

        viewerRef.current = viewer;
        const dur = viewer.getDuration();
        const sr = viewer.getSampleRate();
        const nq = viewer.getNyquist();
        const vp = viewer.getViewport();

        setDuration(dur);
        setSampleRate(sr);
        setNyquist(nq);
        setViewport(vp);
        setStatus(viewer.getStatus());

        onReadyRef.current?.({
          viewer,
          duration: dur,
          sampleRate: sr,
          nyquist: nq,
          viewport: vp,
        });

        unsubs.push(
          viewer.on("viewportchange", (event) => {
            setViewport(event.viewport);
            onViewportChangeRef.current?.(event.viewport);
          }),
          viewer.on("renderstart", () => {
            setStatus({ state: "loading" });
          }),
          viewer.on("rendercomplete", () => {
            setStatus({ state: "ready" });
          }),
        );

        if (navigation !== false) {
          const navOpts = typeof navigation === "object" ? navigation : {};
          cleanupNav = attachCanvasNavigation(viewer, canvas, navOpts);
        }

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
      cleanupNav?.();
      for (const unsub of unsubs) unsub();
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [url, source, navSerialized]);

  // Handle in-place reactive config updates on existing viewer
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    try {
      viewer.updateConfig(memoizedConfig);
    } catch {}
  }, [memoizedConfig]);

  return {
    canvasRef,
    audioRef,
    viewerRef,
    status,
    viewport,
    duration,
    sampleRate,
    nyquist,
  };
}
