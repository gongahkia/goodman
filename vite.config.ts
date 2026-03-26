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
      // find all index.ts-*.js chunks (excluding loaders) and ensure SW imports them all
      const assetsDir = path.join(outDir, 'assets');
      const indexChunks = fs.readdirSync(assetsDir)
        .filter((f: string) => f.startsWith('index.ts-') && !f.includes('loader'))
        .map((f: string) => `import './assets/${f}';`);
      const loaderPath = path.join(outDir, 'service-worker-loader.js');
      const loaderContent = `import './sw-shim.js';\n${indexChunks.join('\n')}\n`;
      fs.writeFileSync(loaderPath, loaderContent, 'utf8');
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
