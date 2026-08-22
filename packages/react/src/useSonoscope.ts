import {
  type AudioSource,
  type FollowPlaybackMode,
  Sonoscope,
} from "@sonoscope/core";
import { useEffect, useState } from "react";

export interface UseSonoscopeOptions {
  url?: string | undefined;
  audio?: HTMLAudioElement | undefined;
  source?: AudioSource | undefined;
  blob?: Blob | undefined;
  buffer?: ArrayBuffer | Uint8Array | undefined;
  array?: Float32Array | Float32Array[] | number[] | number[][] | undefined;
  sampleRate?: number | undefined;
  startTime?: number | undefined;
  endTime?: number | undefined;
  minFrequency?: number | undefined;
  maxFrequency?: number | undefined;
  followPlayback?: FollowPlaybackMode | undefined;
  smoothAnchor?: number | undefined;
  minDuration?: number | undefined;
  maxDuration?: number | undefined;
}

export interface UseSonoscopeResult {
  scope: Sonoscope | null;
  loading: boolean;
  error: Error | null;
}

export function useSonoscope(
  options: UseSonoscopeOptions = {},
): UseSonoscopeResult {
  const {
    url,
    audio,
    source,
    blob,
    buffer,
    array,
    sampleRate,
    startTime,
    endTime,
    minFrequency,
    maxFrequency,
    followPlayback,
    smoothAnchor,
    minDuration,
    maxDuration,
  } = options;

  const hasTarget = Boolean(
    url || source || audio || blob || buffer || (array && sampleRate),
  );
  const [scope, setScope] = useState<Sonoscope | null>(null);
  const [loading, setLoading] = useState<boolean>(hasTarget);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let activeScope: Sonoscope | null = null;

    if (!hasTarget) {
      setScope(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const init = async () => {
      try {
        const sonoscopeOpts = {
          startTime,
          endTime,
          minFrequency,
          maxFrequency,
          followPlayback,
          smoothAnchor,
          minDuration,
          maxDuration,
        };

        let instance: Sonoscope;
        if (blob) {
          instance = await Sonoscope.fromBlob(blob, {
            ...sonoscopeOpts,
            audio,
          });
        } else if (buffer) {
          instance = await Sonoscope.fromBuffer(buffer, {
            ...sonoscopeOpts,
            audio,
          });
        } else if (array && sampleRate) {
          instance = Sonoscope.fromArray(array, sampleRate, {
            ...sonoscopeOpts,
            audio,
          });
        } else if (url) {
          instance = await Sonoscope.fromUrl(url, {
            ...sonoscopeOpts,
            audio,
          });
        } else if (source) {
          instance = new Sonoscope({
            ...sonoscopeOpts,
            source,
            audio,
          });
        } else if (audio) {
          instance = await Sonoscope.fromAudio(audio, sonoscopeOpts);
        } else {
          return;
        }

        if (isCancelled) {
          instance.destroy();
          return;
        }

        activeScope = instance;
        setScope(instance);
        setLoading(false);
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
          setScope(null);
        }
      }
    };

    void init();

    return () => {
      isCancelled = true;
      if (activeScope) {
        activeScope.destroy();
        activeScope = null;
      }
    };
  }, [
    url,
    source,
    audio,
    blob,
    buffer,
    array,
    sampleRate,
    hasTarget,
    startTime,
    endTime,
    minFrequency,
    maxFrequency,
    followPlayback,
    smoothAnchor,
    minDuration,
    maxDuration,
  ]);

  return {
    scope,
    loading,
    error,
  };
}
