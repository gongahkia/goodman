/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [preact()],
  test: {
    globals: true,
    environment: 'node',
  },
  build: {
    outDir: process.env.EXTENSION_OUT_DIR ?? 'dist/common',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
})
