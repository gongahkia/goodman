import { defineConfig, type Plugin } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import manifest from './src/manifest';

function swShimPlugin(): Plugin {
  const shim = `if(typeof window==="undefined"){(typeof self!=="undefined"?self:globalThis).window=typeof self!=="undefined"?self:globalThis;}\n`;
  return {
    name: 'sw-shim',
    async writeBundle(options) {
      const fs = await import('fs');
      const path = await import('path');
      const outDir = options.dir ?? 'dist';
      // write the shim file
      fs.writeFileSync(path.join(outDir, 'sw-shim.js'), shim, 'utf8');
      // prepend shim import to service-worker-loader.js
      const loaderPath = path.join(outDir, 'service-worker-loader.js');
      if (fs.existsSync(loaderPath)) {
        const content = fs.readFileSync(loaderPath, 'utf8');
        fs.writeFileSync(loaderPath, `import './sw-shim.js';\n${content}`, 'utf8');
      }
    },
  };
}

export default defineConfig({
  plugins: [swShimPlugin(), crx({ manifest })],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@providers': resolve(__dirname, 'src/providers'),
      '@content': resolve(__dirname, 'src/content'),
      '@background': resolve(__dirname, 'src/background'),
      '@popup': resolve(__dirname, 'src/popup'),
      '@summarizer': resolve(__dirname, 'src/summarizer'),
      '@versioning': resolve(__dirname, 'src/versioning'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: { polyfill: false },
  },
});
