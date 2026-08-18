import {
  attachPlayheadOverlay,
  type SpectrogramViewer,
} from "@sonoscope/core";
import {
  type CSSProperties,
  forwardRef,
  type HTMLAttributes,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { useSonoscopeContext } from "./SonoscopeContext";
import { type UseSpectrogramOptions, useSpectrogram } from "./useSpectrogram";

export type SpectrogramHandle = {
  getViewer: () => SpectrogramViewer | null;
  getCanvas: () => HTMLCanvasElement | null;
  getAudio: () => HTMLAudioElement | null;
};

export type SpectrogramProps = UseSpectrogramOptions & {
  width?: number | string | undefined;
  height?: number | string | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  canvasProps?: HTMLAttributes<HTMLCanvasElement> | undefined;
  showAudioControls?: boolean | undefined;
  showPlayhead?: boolean | undefined;
  playheadClassName?: string | undefined;
  playheadStyle?: CSSProperties | undefined;
};

export const Spectrogram = forwardRef<SpectrogramHandle, SpectrogramProps>(
  (props, ref) => {
    const contextScope = useSonoscopeContext();
    const {
      scope = contextScope,
      width,
      height,
      className,
      style,
      canvasProps,
      showAudioControls = false,
      showPlayhead = true,
      playheadClassName,
      playheadStyle,
      ...options
    } = props;

    const containerRef = useRef<HTMLDivElement | null>(null);

    const {
      canvasRef,
      audioRef,
      viewerRef,
      scope: activeScope,
    } = useSpectrogram({
      ...options,
      scope,
    });

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

    useImperativeHandle(ref, () => ({
      getViewer: () => viewerRef.current,
      getCanvas: () => canvasRef.current,
      getAudio: () => audioRef.current,
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
        {showAudioControls && options.url && (
          <audio
            ref={audioRef}
            src={options.url}
            controls
            style={{ width: "100%", marginTop: "0.5rem" }}
          >
            <track kind="captions" />
          </audio>
        )}
      </div>
    );
  },
);

Spectrogram.displayName = "Spectrogram";
