import { defineConfig } from 'vite';
import { preview } from '@vitest/browser-preview';

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: preview(),
      instances: [{ browser: 'chromium' }],
    },
    include: ['src/**/*.browser.test.ts'],
  },
});
