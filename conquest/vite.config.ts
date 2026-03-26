import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { crx } from '@crxjs/vite-plugin'
import { defineConfig } from 'vite'

type Manifest = Record<string, unknown>

function loadManifest(targetBrowser: string): Manifest {
  const manifestFilename = targetBrowser === 'firefox'
    ? 'manifest.firefox.json'
    : 'manifest.json'

  return JSON.parse(
    readFileSync(resolve(__dirname, manifestFilename), 'utf-8'),
  ) as Manifest
}

export default defineConfig(() => {
  const targetBrowser = process.env.TARGET_BROWSER === 'firefox'
    ? 'firefox'
    : 'chrome'
  const manifest = loadManifest(targetBrowser)

  return {
    build: {
      target: 'es2022',
      minify: 'terser',
      rollupOptions: {
        output: {
          chunkFileNames: 'assets/[name]-[hash].js',
        },
      },
    },
    plugins: [
      crx({ manifest }),
    ],
  }
})
