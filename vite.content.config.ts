import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        emptyOutDir: false,
        outDir: 'dist',
        minify: false,
        rollupOptions: {
            input: resolve(__dirname, 'src/content.ts'),
            output: {
                format: 'iife',
                entryFileNames: 'assets/content.js',
                inlineDynamicImports: true, // Bundles all dependencies into one file
                extend: true,
            },
        },
    },
});
