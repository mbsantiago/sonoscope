import { SpectrogramViewer, type FrequencyScale, type ValueMode, type WindowName } from '../../src';

export const DEFAULT_AUDIO_URL = 'https://xeno-canto.org/995398/download';

export type DemoViewport = {
  startTime: number;
  endTime: number;
  minFrequency: number;
  maxFrequency: number;
  frequencyScale: FrequencyScale;
};

export function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

export function getUrlFromPage(input: HTMLInputElement): string {
  const params = new URLSearchParams(window.location.search);
  const url = params.get('url') || DEFAULT_AUDIO_URL;
  input.value = url;
  return url;
}

export async function createViewer(options: {
  audio: HTMLAudioElement;
  canvas: HTMLCanvasElement;
  url: string;
  viewport?: Partial<DemoViewport>;
  stft?: { windowSize?: number; fftSize?: number; hopSize?: number; window?: WindowName };
  valueScale?: { mode?: ValueMode; min?: number; max?: number; gamma?: number; clamp?: boolean };
  colorMap?: 'gray' | 'viridis' | 'magma' | 'inferno' | 'plasma' | 'turbo';
  follow?: boolean;
}): Promise<SpectrogramViewer> {
  options.audio.src = options.url;
  const viewer = await SpectrogramViewer.create({
    audio: options.audio,
    canvas: options.canvas,
    colorMap: options.colorMap ?? 'viridis',
    playback: { showPlayhead: true, follow: options.follow ?? true, followMargin: 0.2, renderOnSeek: true },
    ...(options.stft === undefined ? {} : { stft: options.stft }),
    valueScale: { mode: 'db', min: -100, max: 0, ...options.valueScale },
    viewport: { startTime: 0, endTime: 10, minFrequency: 0, frequencyScale: 'linear', ...options.viewport },
  });

  const source = viewer.getConfig().source;
  const minFrequency = options.viewport?.minFrequency ?? 0;
  const maxFrequency = options.viewport?.maxFrequency ?? (source ? source.sampleRate / 2 : viewer.getViewport().maxFrequency);
  viewer.setViewport({ startTime: 0, endTime: Math.min(10, source?.duration ?? 10), minFrequency, maxFrequency });
  return viewer;
}

export function viewportStatus(viewer: SpectrogramViewer): string {
  const viewport = viewer.getViewport();
  const source = viewer.getConfig().source;
  const sampleRate = source ? `, decoded sample rate ${Math.round(source.sampleRate)}Hz` : '';
  return `${viewport.startTime.toFixed(2)}s-${viewport.endTime.toFixed(2)}s, ${Math.round(viewport.minFrequency)}-${Math.round(viewport.maxFrequency)}Hz, ${viewport.frequencyScale}${sampleRate}`;
}

export function fullBounds(viewer: SpectrogramViewer) {
  const source = viewer.getConfig().source;
  return {
    startTime: 0,
    endTime: source?.duration ?? viewer.getViewport().endTime,
    minFrequency: 0,
    maxFrequency: source ? source.sampleRate / 2 : viewer.getViewport().maxFrequency,
  };
}
