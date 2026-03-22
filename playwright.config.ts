import { defineConfig } from '@playwright/test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  use: {
    headless: false,
    browserName: 'chromium',
    launchOptions: {
      args: [
        `--disable-extensions-except=${resolve(__dirname, 'dist')}`,
        `--load-extension=${resolve(__dirname, 'dist')}`,
      ],
    },
  },
});
