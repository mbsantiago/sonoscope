import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpectrogramViewer } from './viewer';
import type { AudioSource } from './types';

type AudioFixture = HTMLAudioElement & {
  emit(name: string): void;
  listenerCount(): number;
};

function audio(): AudioFixture {
  const listeners = new Map<string, () => void>();
  return {
    currentTime: 0,
    duration: 10,
    src: 'fixture.wav',
    currentSrc: 'fixture.wav',
    paused: true,
    addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
    removeEventListener: (name: string) => listeners.delete(name),
    emit: (name: string) => listeners.get(name)?.(),
    listenerCount: () => listeners.size,
  } as unknown as AudioFixture;
}

function canvas(): HTMLCanvasElement {
  return {
    width: 100,
    height: 100,
    getBoundingClientRect: () => ({ width: 100, height: 100 }),
    getContext: () => ({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    }),
  } as unknown as HTMLCanvasElement;
}

const source: AudioSource = {
  id: 's',
  sampleRate: 100,
  duration: 10,
  channelCount: 1,
  read: () => new Float32Array(100),
};

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as Partial<typeof globalThis>).requestAnimationFrame;
  delete (globalThis as Partial<typeof globalThis>).cancelAnimationFrame;
});

describe('playback sync', () => {
  it('updates viewport when follow is enabled and seeked fires', async () => {
    const element = audio();
    const viewer = await SpectrogramViewer.create({
      audio: element,
      canvas: canvas(),
      source,
      viewport: { startTime: 0, endTime: 2, minFrequency: 0, maxFrequency: 50 },
      playback: { follow: true, renderOnSeek: false },
    });
    element.currentTime = 5;
    element.emit('seeked');
    expect(viewer.getViewport().startTime).toBeGreaterThan(3);
  });

  it('renders when seeked fires and renderOnSeek is enabled', async () => {
    const element = audio();
    const viewer = await SpectrogramViewer.create({ audio: element, canvas: canvas(), source, playback: { renderOnSeek: true } });
    const render = vi.spyOn(viewer, 'render').mockResolvedValue();
    element.emit('seeked');
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('refreshes the playhead during playback and stops on pause', async () => {
    const element = audio();
    let frame: FrameRequestCallback | undefined;
    globalThis.requestAnimationFrame = () => 0;
    globalThis.cancelAnimationFrame = () => undefined;
    const request = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const viewer = await SpectrogramViewer.create({ audio: element, canvas: canvas(), source });
    await viewer.render();
    const render = vi.spyOn(viewer, 'render').mockResolvedValue();

    element.emit('play');
    frame?.(0);
    element.emit('pause');

    expect(request).toHaveBeenCalledTimes(2);
    expect(render).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledWith(1);
  });

  it('rerenders during playback after config changes invalidate the cached frame', async () => {
    const element = audio();
    let frame: FrameRequestCallback | undefined;
    globalThis.requestAnimationFrame = () => 0;
    globalThis.cancelAnimationFrame = () => undefined;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    const viewer = await SpectrogramViewer.create({ audio: element, canvas: canvas(), source });
    await viewer.render();
    viewer.setConfig({ colorMap: 'magma' });
    const render = vi.spyOn(viewer, 'render').mockResolvedValue();

    element.emit('play');
    frame?.(0);

    expect(render).toHaveBeenCalledTimes(1);
  });

  it('removes playback listeners on destroy', async () => {
    const element = audio();
    globalThis.cancelAnimationFrame = () => undefined;
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const viewer = await SpectrogramViewer.create({ audio: element, canvas: canvas(), source });
    expect(element.listenerCount()).toBe(3);
    viewer.destroy();
    expect(element.listenerCount()).toBe(0);
    expect(cancel).not.toHaveBeenCalled();
  });
});
