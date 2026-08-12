import { createViewer, getUrlFromPage, requiredElement, viewportStatus } from './demo-utils';

const form = requiredElement<HTMLFormElement>('form');
const input = requiredElement<HTMLInputElement>('input[name="url"]');
const audio = requiredElement<HTMLAudioElement>('audio');
const canvas = requiredElement<HTMLCanvasElement>('canvas');
const status = requiredElement<HTMLElement>('[data-status]');

let viewer: Awaited<ReturnType<typeof createViewer>> | undefined;

async function load(url: string) {
  viewer?.destroy();
  status.textContent = 'Loading and rendering...';
  viewer = await createViewer({ audio, canvas, url });
  await viewer.render();
  status.textContent = viewportStatus(viewer);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const url = input.value.trim();
  if (url) void load(url);
});

await load(getUrlFromPage(input));
