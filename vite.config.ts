import { defineConfig, type Plugin } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import manifest from './src/manifest';

function swShimPlugin(): Plugin {
  const shim = `if(typeof window==="undefined"){var g=typeof self!=="undefined"?self:globalThis;g.window=g;if(typeof document==="undefined")g.document={createElement:function(){return{relList:{supports:function(){return false}}}},getElementsByTagName:function(){return[]},querySelector:function(){return null},querySelectorAll:function(){return[]},head:{appendChild:function(){}},body:null,title:"",addEventListener:function(){}};if(typeof history==="undefined")g.history={pushState:function(){},replaceState:function(){}};if(typeof Node==="undefined")g.Node={ELEMENT_NODE:1};if(typeof getComputedStyle==="undefined")g.getComputedStyle=function(){return{position:""}};if(typeof DOMParser==="undefined")g.DOMParser=function(){};if(g.DOMParser)g.DOMParser.prototype.parseFromString=function(){return{querySelector:function(){return null},querySelectorAll:function(){return[]},body:{textContent:""}}};if(typeof TextDecoder==="undefined")g.TextDecoder=function(){};if(g.TextDecoder)g.TextDecoder.prototype.decode=function(){return""}};\n`;
  return {
    name: 'sw-shim',
    generateBundle(_, bundle) {
      for (const [, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && chunk.code) {
          chunk.code = shim + chunk.code;
        }
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
