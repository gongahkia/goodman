import { defineConfig, type Plugin } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import manifest from './src/manifest';

function swShimPlugin(): Plugin {
  const shim = `if(typeof window==="undefined"){(typeof self!=="undefined"?self:globalThis).window=typeof self!=="undefined"?self:globalThis;}\n`;
  return {
    name: 'sw-shim',
    async writeBundle(options, bundle) {
      const fs = await import('fs');
      const path = await import('path');
      const outDir = options.dir ?? 'dist';
      // write the shim file
      fs.writeFileSync(path.join(outDir, 'sw-shim.js'), shim, 'utf8');
      // Background and content entries share a basename; resolve the original module,
      // never every index.ts chunk or a filename chosen by CRX's basename lookup.
      const backgroundChunk = Object.values(bundle).find(
        (chunk) =>
          chunk.type === 'chunk' &&
          chunk.facadeModuleId === resolve(__dirname, 'src/background/index.ts')
      );
      if (!backgroundChunk) throw new Error('Could not locate the background entry in the build');
      const loaderPath = path.join(outDir, 'service-worker-loader.js');
      const loaderContent = `import './sw-shim.js';\nimport './${backgroundChunk.fileName}';\n`;
      fs.writeFileSync(loaderPath, loaderContent, 'utf8');
      const manifestPath = path.join(outDir, 'manifest.json');
      const builtManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      builtManifest.background =
        process.env.BUILD_TARGET === 'firefox'
          ? { scripts: ['service-worker-loader.js'], type: 'module' }
          : { service_worker: 'service-worker-loader.js', type: 'module' };
      fs.writeFileSync(manifestPath, JSON.stringify(builtManifest, null, 2) + '\n', 'utf8');
      // Vite treats CRX's virtual root as a filesystem path. Canonicalize its
      // metadata key so clean builds at different checkout depths are identical.
      const viteManifestPath = path.join(outDir, '.vite', 'manifest.json');
      if (fs.existsSync(viteManifestPath)) {
        const metadata = JSON.parse(fs.readFileSync(viteManifestPath, 'utf8'));
        const virtualKeys = Object.keys(metadata).filter(key => key.endsWith('/@crx/manifest'));
        for (const key of virtualKeys) {
          metadata['@crx/manifest'] = { ...metadata[key], src: '@crx/manifest' };
          delete metadata[key];
        }
        for (const entry of Object.values(metadata) as Array<{ imports?: string[]; dynamicImports?: string[] }>) {
          for (const kind of ['imports', 'dynamicImports'] as const) {
            if (entry[kind]) entry[kind] = entry[kind].map(key => virtualKeys.includes(key) ? '@crx/manifest' : key);
          }
        }
        fs.writeFileSync(viteManifestPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8');
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
    // Content scripts share the page DOM: root-relative preload links would
    // request extension chunks from the visited website. Use native imports.
    modulePreload: false,
  },
});
