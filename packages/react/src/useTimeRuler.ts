import {
  type ISonoscope,
  type TimeRulerConfig,
  TimeRulerLocator,
  type TimeRulerStatus,
} from "@sonoscope/core";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

export interface UseTimeRulerOptions extends TimeRulerConfig {
  scope?: ISonoscope | null | undefined;
}

export function useTimeRuler(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  options: UseTimeRulerOptions = {},
): {
  locator: TimeRulerLocator | null;
  status: TimeRulerStatus;
  scope: ISonoscope | null;
} {
  const { scope, ...locatorConfig } = options;
  const [locator, setLocator] = useState<TimeRulerLocator | null>(null);
  const [status, setStatus] = useState<TimeRulerStatus>({ state: "idle" });
  const locatorRef = useRef<TimeRulerLocator | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: serialize config to prevent loop
  const memoizedConfig = useMemo(
    () => locatorConfig,
    [JSON.stringify(locatorConfig)],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: initial mount uses scope/canvas identity; in-place option updates handled below
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scope) {
      locatorRef.current?.destroy();
      locatorRef.current = null;
      setLocator(null);
      setStatus({ state: "idle" });
      return;
    }

    const instance = new TimeRulerLocator(
      canvas,
      scope.viewport,
      memoizedConfig,
    );
    locatorRef.current = instance;
    setLocator(instance);
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
      locatorRef.current = null;
      setLocator(null);
    };
  }, [scope, canvasRef]);

  useEffect(() => {
    const instance = locatorRef.current;
    if (!instance) return;
    try {
      instance.updateConfig(memoizedConfig);
    } catch {}
  }, [memoizedConfig]);

  return { locator, status, scope: scope ?? null };
}
