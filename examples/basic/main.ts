import { SpectrogramViewer } from '../../src';

const audio = document.querySelector('audio');
const canvas = document.querySelector('canvas');

if (!audio || !canvas) throw new Error('Missing audio or canvas element');

const viewer = await SpectrogramViewer.create({
  audio,
  canvas,
  colorMap: 'viridis',
  valueScale: { mode: 'db', min: -100, max: 0 },
  viewport: { startTime: 0, endTime: 10, minFrequency: 0, maxFrequency: 12_000, frequencyScale: 'linear' },
});

await viewer.render();
