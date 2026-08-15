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
  startTime?: number | undefined;
  endTime?: number | undefined;
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
    startTime,
    endTime,
    followPlayback,
    smoothAnchor,
    minDuration,
    maxDuration,
  } = options;

  const [scope, setScope] = useState<Sonoscope | null>(null);
  const [loading, setLoading] = useState<boolean>(
    Boolean(url || source || audio),
  );
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let activeScope: Sonoscope | null = null;

    if (!url && !source && !audio) {
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
          followPlayback,
          smoothAnchor,
          minDuration,
          maxDuration,
        };

        let instance: Sonoscope;
        if (url) {
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
    startTime,
    endTime,
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
