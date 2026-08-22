import {
  type AudioSource,
  type FollowPlaybackMode,
  Sonoscope,
} from "@sonoscope/core";
import { useEffect, useState } from "react";

/**
 * Options for initializing a Sonoscope coordinator inside React.
 */
export interface UseSonoscopeOptions {
  /** URL of an audio file to load. */
  url?: string | undefined;
  /** HTML audio element to synchronize playback with. */
  audio?: HTMLAudioElement | undefined;
  /** Pre-constructed AudioSource instance. */
  source?: AudioSource | undefined;
  /** Audio Blob or File. */
  blob?: Blob | undefined;
  /** Encoded audio file in an ArrayBuffer or Uint8Array. */
  buffer?: ArrayBuffer | Uint8Array | undefined;
  /** Raw PCM samples. */
  array?: Float32Array | Float32Array[] | number[] | number[][] | undefined;
  /** Sample rate in Hz when passing raw PCM samples. */
  sampleRate?: number | undefined;
  /** Initial viewport start time in seconds. */
  startTime?: number | undefined;
  /** Initial viewport end time in seconds. */
  endTime?: number | undefined;
  /** Initial minimum frequency in Hz. */
  minFrequency?: number | undefined;
  /** Initial maximum frequency in Hz. */
  maxFrequency?: number | undefined;
  /** Playback follow mode (`page`, `smooth`, or `off`). */
  followPlayback?: FollowPlaybackMode | undefined;
  /** Screen anchor ratio (0 to 1) for smooth playback follow. */
  smoothAnchor?: number | undefined;
  /** Minimum zoom duration in seconds. */
  minDuration?: number | undefined;
  /** Maximum zoom duration in seconds. */
  maxDuration?: number | undefined;
}

/**
 * Result returned by the `useSonoscope` hook.
 */
export interface UseSonoscopeResult {
  /** Active Sonoscope coordinator instance, or null while loading. */
  scope: Sonoscope | null;
  /** True while the audio source is loading or decoding. */
  loading: boolean;
  /** Error object if audio loading failed. */
  error: Error | null;
}

/**
 * React hook that creates and manages the lifecycle of a Sonoscope coordinator instance.
 * @param options Audio source and coordinator configuration.
 */
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
