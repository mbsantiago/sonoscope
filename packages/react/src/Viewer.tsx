import type {
  CustomViewerFactory,
  ISonoscopeViewer,
  Sonoscope,
} from "@sonoscope/core";
import type React from "react";
import { forwardRef, useImperativeHandle } from "react";
import { useViewer } from "./useViewer";

export type ViewerHandle<TViewer extends ISonoscopeViewer = ISonoscopeViewer> =
  {
    getCanvas: () => HTMLCanvasElement | null;
    getViewer: () => TViewer | null;
  };

export type ViewerProps<
  TOptions = unknown,
  TViewer extends ISonoscopeViewer = ISonoscopeViewer,
> = {
  viewer: string | CustomViewerFactory<TOptions, TViewer>;
  scope?: Sonoscope | null | undefined;
  options?: TOptions | undefined;
  className?: string | undefined;
  style?: React.CSSProperties | undefined;
  onReady?: ((viewer: TViewer) => void) | undefined;
};

function ViewerInner<
  TOptions = unknown,
  TViewer extends ISonoscopeViewer = ISonoscopeViewer,
>(
  props: ViewerProps<TOptions, TViewer>,
  ref: React.ForwardedRef<ViewerHandle<TViewer>>,
): React.ReactElement {
  const { viewer, scope, options, className, style, onReady } = props;
  const { canvasRef, viewerRef } = useViewer<TOptions, TViewer>({
    viewer,
    scope,
    options,
    onReady,
  });

  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    getViewer: () => viewerRef.current,
  }));

  return <canvas ref={canvasRef} className={className} style={style} />;
}

export const Viewer = forwardRef(ViewerInner) as <
  TOptions = unknown,
  TViewer extends ISonoscopeViewer = ISonoscopeViewer,
>(
  props: ViewerProps<TOptions, TViewer> & {
    ref?: React.ForwardedRef<ViewerHandle<TViewer>>;
  },
) => React.ReactElement;
