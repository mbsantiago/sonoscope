import { MainThreadComputeBackend, SpectrogramViewer, WorkerComputeBackend, type AudioSource, type PerformanceMeasure } from '../../src';

class SyntheticSource implements AudioSource {
  readonly id = 'synthetic-performance';
  readonly sampleRate = 48_000;
  readonly duration = 60;
  readonly channelCount = 1;

  private readonly data = Float32Array.from({ length: this.sampleRate * this.duration }, (_, index) => {
    const time = index / this.sampleRate;
    return 0.6 * Math.sin(2 * Math.PI * 440 * time) + 0.3 * Math.sin(2 * Math.PI * 2_200 * time);
  });

  read(options: { channel: number; startTime: number; endTime: number }): Float32Array {
    const start = Math.max(0, Math.floor(options.startTime * this.sampleRate));
    const end = Math.min(this.data.length, Math.ceil(options.endTime * this.sampleRate));
    return this.data.slice(start, end);
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#spectrogram')!;
const profile = document.querySelector<HTMLPreElement>('#profile')!;
const source = new SyntheticSource();

let viewer: SpectrogramViewer | undefined;
let viewportStart = 0;

function summarize(measures: PerformanceMeasure[]): string {
  const totals = new Map<string, number>();
  for (const measure of measures) totals.set(measure.name, (totals.get(measure.name) ?? 0) + measure.duration);

  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, duration]) => `${name.padEnd(24)} ${duration.toFixed(1)} ms`)
    .join('\n');
}

async function renderWithBackend(name: string, backend: MainThreadComputeBackend | WorkerComputeBackend): Promise<void> {
  viewer?.destroy();
  profile.textContent = `Rendering with ${name}...`;
  viewer = await SpectrogramViewer.create({
    canvas,
    source,
    backend,
    cache: { tileDurationSeconds: 2, maxCachedTiles: 32 },
    viewport: { startTime: viewportStart, endTime: viewportStart + 8, minFrequency: 0, maxFrequency: 12_000 },
    stft: { windowSize: 2048, fftSize: 2048, hopSize: 512, window: 'hann' },
  });

  viewer.on('renderprofile', (event) => {
    profile.textContent = `${name}\nrequest: ${event.requestId}\ngeneration: ${event.generation}\n\n${summarize(event.measures)}`;
  });

  await viewer.render();
}

document.querySelector<HTMLButtonElement>('#main')!.addEventListener('click', () => {
  void renderWithBackend('MainThreadComputeBackend', new MainThreadComputeBackend());
});

document.querySelector<HTMLButtonElement>('#worker')!.addEventListener('click', () => {
  void renderWithBackend('WorkerComputeBackend', new WorkerComputeBackend());
});

document.querySelector<HTMLButtonElement>('#pan')!.addEventListener('click', () => {
  if (!viewer) return;
  viewportStart = (viewportStart + 2) % 40;
  viewer.setViewport({ startTime: viewportStart, endTime: viewportStart + 8 });
  void viewer.render();
});

void renderWithBackend('WorkerComputeBackend', new WorkerComputeBackend());
