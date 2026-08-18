import {
  type FrequencyRulerConfig,
  type FrequencyRulerStatus,
  FrequencyRulerViewer,
  type ISonoscope,
} from "@sonoscope/core";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

export interface UseFrequencyRulerOptions extends FrequencyRulerConfig {
  scope?: ISonoscope | null | undefined;
}

export function useFrequencyRuler(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  options: UseFrequencyRulerOptions = {},
): {
  viewer: FrequencyRulerViewer | null;
  status: FrequencyRulerStatus;
  scope: ISonoscope | null;
} {
  const { scope, ...viewerConfig } = options;
  const [viewer, setViewer] = useState<FrequencyRulerViewer | null>(null);
  const [status, setStatus] = useState<FrequencyRulerStatus>({ state: "idle" });
  const viewerRef = useRef<FrequencyRulerViewer | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: serialize config to prevent loop
  const memoizedConfig = useMemo(
    () => viewerConfig,
    [JSON.stringify(viewerConfig)],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: initial mount uses scope/canvas identity; in-place option updates handled below
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scope) {
      viewerRef.current?.destroy();
      viewerRef.current = null;
      setViewer(null);
      setStatus({ state: "idle" });
      return;
    }

    const instance = new FrequencyRulerViewer(scope, canvas, memoizedConfig);
    viewerRef.current = instance;
    setViewer(instance);
    setStatus(instance.getStatus());

    const unsubs = [
      instance.on("renderstart", () => setStatus({ state: "rendering" })),
      instance.on("rendercomplete", () => setStatus({ state: "ready" })),
      instance.on("error", (event) =>
        setStatus({ state: "error", error: event.error }),
      ),
    ];

    void instance.render();

    return () => {
      for (const unsub of unsubs) unsub();
      instance.destroy();
      viewerRef.current = null;
      setViewer(null);
    };
  }, [scope, canvasRef]);

  useEffect(() => {
    const instance = viewerRef.current;
    if (!instance) return;
    try {
      instance.updateConfig(memoizedConfig);
    } catch {}
  }, [memoizedConfig]);

  return { viewer, status, scope: scope ?? null };
}
