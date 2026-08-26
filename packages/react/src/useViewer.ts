import type {
  CustomViewerFactory,
  ISonoscopeViewer,
  Sonoscope,
} from "@sonoscope/core";
import { type RefObject, useEffect, useRef } from "react";
import { useSonoscopeContext } from "./SonoscopeContext";

export type UseViewerOptions<
  TOptions = unknown,
  TViewer extends ISonoscopeViewer = ISonoscopeViewer,
> = {
  viewer: string | CustomViewerFactory<TOptions, TViewer>;
  scope?: Sonoscope | null | undefined;
  options?: TOptions | undefined;
  onReady?: ((viewer: TViewer) => void) | undefined;
};

export type UseViewerResult<
  TViewer extends ISonoscopeViewer = ISonoscopeViewer,
> = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  viewerRef: RefObject<TViewer | null>;
  scope: Sonoscope | null;
};

export function useViewer<
  TOptions = unknown,
  TViewer extends ISonoscopeViewer = ISonoscopeViewer,
>(options: UseViewerOptions<TOptions, TViewer>): UseViewerResult<TViewer> {
  const {
    viewer: viewerFactory,
    scope: propScope,
    options: viewerOptions,
    onReady,
  } = options;

  const contextScope = useSonoscopeContext();
  const activeScope = propScope !== undefined ? propScope : contextScope;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<TViewer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeScope) return;

    const instance = activeScope.createViewer<TOptions, TViewer>(
      viewerFactory,
      canvas,
      viewerOptions,
    );
    viewerRef.current = instance;

    if (onReady) {
      onReady(instance);
    }

    return () => {
      viewerRef.current = null;
      instance.destroy();
    };
  }, [activeScope, viewerFactory, viewerOptions, onReady]);

  return {
    canvasRef,
    viewerRef,
    scope: activeScope,
  };
}
