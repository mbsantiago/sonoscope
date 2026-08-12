import { createViewer, getUrlFromPage, requiredElement, viewportStatus, type DemoViewport } from './demo-utils';
import type { BuiltInColorMap, FrequencyScale, ValueMode, WindowName } from '../../src';

const form = requiredElement<HTMLFormElement>('form');
const input = requiredElement<HTMLInputElement>('input[name="url"]');
const audio = requiredElement<HTMLAudioElement>('audio');
const canvas = requiredElement<HTMLCanvasElement>('canvas');
const status = requiredElement<HTMLElement>('[data-status]');
const apply = requiredElement<HTMLButtonElement>('button[data-action="apply"]');

let viewer: Awaited<ReturnType<typeof createViewer>> | undefined;
let currentUrl = getUrlFromPage(input);

function field<T extends HTMLInputElement | HTMLSelectElement>(name: string): T {
  return requiredElement<T>(`[name="${name}"]`);
}

function readConfig() {
  const windowSize = Number(field<HTMLInputElement>('windowSize').value);
  const fftSize = Number(field<HTMLInputElement>('fftSize').value);
  const hopSize = Number(field<HTMLInputElement>('hopSize').value);
  const minFrequency = Number(field<HTMLInputElement>('minFrequency').value);
  const maxFrequencyField = field<HTMLInputElement>('maxFrequency');
  const maxFrequency = maxFrequencyField.value === '' ? undefined : Number(maxFrequencyField.value);
  const min = Number(field<HTMLInputElement>('min').value);
  const max = Number(field<HTMLInputElement>('max').value);
  const gamma = Number(field<HTMLInputElement>('gamma').value);
  return {
    stft: { windowSize, fftSize, hopSize, window: field<HTMLSelectElement>('window').value as WindowName },
    viewport: { minFrequency, ...(maxFrequency === undefined ? {} : { maxFrequency }), frequencyScale: field<HTMLSelectElement>('frequencyScale').value as FrequencyScale } satisfies Partial<DemoViewport>,
    valueScale: { mode: field<HTMLSelectElement>('mode').value as ValueMode, min, max, gamma, clamp: true },
    colorMap: field<HTMLSelectElement>('colorMap').value as BuiltInColorMap,
  };
}

function decodedNyquist(): number | undefined {
  const source = viewer?.getConfig().source;
  return source === undefined ? undefined : source.sampleRate / 2;
}

function applyDecodedNyquistPlaceholder() {
  const maxFrequency = decodedNyquist();
  if (maxFrequency !== undefined) field<HTMLInputElement>('maxFrequency').placeholder = String(Math.round(maxFrequency));
}

async function render() {
  if (!viewer) return;
  await viewer.render();
  status.textContent = viewportStatus(viewer);
}

async function load(url: string) {
  viewer?.destroy();
  currentUrl = url;
  input.value = url;
  status.textContent = 'Loading and rendering...';
  const config = readConfig();
  viewer = await createViewer({ audio, canvas, url, ...config });
  applyDecodedNyquistPlaceholder();
  await render();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const url = input.value.trim();
  if (url) void load(url);
});

apply.addEventListener('click', () => {
  if (!viewer) return;
  const config = readConfig();
  const maxFrequency = decodedNyquist();
  if (field<HTMLInputElement>('maxFrequency').value === '' && maxFrequency !== undefined) config.viewport.maxFrequency = maxFrequency;
  viewer.setConfig(config);
  applyDecodedNyquistPlaceholder();
  void render();
});

await load(currentUrl);
