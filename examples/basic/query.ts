import { createViewer, getUrlFromPage, requiredElement, viewportStatus } from './demo-utils';

const form = requiredElement<HTMLFormElement>('form');
const input = requiredElement<HTMLInputElement>('input[name="url"]');
const audio = requiredElement<HTMLAudioElement>('audio');
const canvas = requiredElement<HTMLCanvasElement>('canvas');
const output = requiredElement<HTMLElement>('[data-output]');

let viewer: Awaited<ReturnType<typeof createViewer>> | undefined;

function write(value: unknown) {
  output.textContent = JSON.stringify(value, (_key, item) => {
    if (ArrayBuffer.isView(item) && 'length' in item) return Array.from(item as unknown as ArrayLike<number>).slice(0, 16);
    return item;
  }, 2);
}

async function load(url: string) {
  viewer?.destroy();
  output.textContent = 'Loading and rendering...';
  viewer = await createViewer({ audio, canvas, url });
  await viewer.render();
  write({ viewport: viewportStatus(viewer), instruction: 'Click the canvas to query values.' });
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const url = input.value.trim();
  if (url) void load(url);
});

canvas.addEventListener('click', async (event) => {
  if (!viewer) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const point = await viewer.queryCanvasPoint({ x, y });
  const spectrum = await viewer.querySpectrum({ time: point.time });
  write({ point, spectrumPreview: spectrum });
});

await load(getUrlFromPage(input));
