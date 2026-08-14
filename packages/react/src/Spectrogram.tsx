import type { SpectrogramViewer } from "@sonogram/core";
import {
  type CSSProperties,
  forwardRef,
  type HTMLAttributes,
  useImperativeHandle,
} from "react";
import { type UseSpectrogramOptions, useSpectrogram } from "./useSpectrogram";

export type SpectrogramHandle = {
  getViewer: () => SpectrogramViewer | null;
  getCanvas: () => HTMLCanvasElement | null;
  getAudio: () => HTMLAudioElement | null;
};

export type SpectrogramProps = UseSpectrogramOptions & {
  className?: string;
  style?: CSSProperties;
  canvasProps?: HTMLAttributes<HTMLCanvasElement>;
  showAudioControls?: boolean;
};

export const Spectrogram = forwardRef<SpectrogramHandle, SpectrogramProps>(
  (props, ref) => {
    const {
      className,
      style,
      canvasProps,
      showAudioControls = false,
      ...options
    } = props;

    const { canvasRef, audioRef, viewerRef } = useSpectrogram(options);

    useImperativeHandle(ref, () => ({
      getViewer: () => viewerRef.current,
      getCanvas: () => canvasRef.current,
      getAudio: () => audioRef.current,
    }));

    return (
      <div className={className} style={{ position: "relative", ...style }}>
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
