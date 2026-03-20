import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        emptyOutDir: false,
        outDir: process.env.EXTENSION_OUT_DIR ?? 'dist/common',
        minify: false,
        rollupOptions: {
            input: resolve(__dirname, 'src/background.ts'),
            output: {
                format: 'iife',
                entryFileNames: 'assets/background.js',
                inlineDynamicImports: true,
                extend: true,
            },
        },
    },
});
