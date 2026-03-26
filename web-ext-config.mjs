export default {
  sourceDir: 'dist',
  artifactsDir: 'web-ext-artifacts',
  ignoreFiles: ['.DS_Store'],
  build: {
    overwriteDest: true,
  },
  run: {
    startUrl: ['https://example.com'],
    firefoxProfile: 'goodman-dev',
    profileCreateIfMissing: true,
    browserConsole: true,
  },
  sign: {
    channel: 'listed',
  },
};
