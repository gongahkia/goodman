import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const commonDir = path.join(distDir, 'common');

const packageJson = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

function run(command, args, extraEnv = {}) {
  execFileSync(command, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: 'inherit',
  });
}

function buildCommonArtifacts() {
  rmSync(distDir, { force: true, recursive: true });

  run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '-b']);
  run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build'], {
    EXTENSION_OUT_DIR: commonDir,
  });
  run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build', '-c', 'vite.content.config.ts'], {
    EXTENSION_OUT_DIR: commonDir,
  });
  run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build', '-c', 'vite.background.config.ts'], {
    EXTENSION_OUT_DIR: commonDir,
  });
}

function iconMap() {
  return {
    16: 'icon.png',
    32: 'icon.png',
    48: 'icon.png',
    128: 'icon.png',
  };
}

function baseManifest() {
  return {
    manifest_version: 3,
    name: 'ONUL',
    version: packageJson.version,
    description: 'Instant, offline timezone conversion for selected text.',
    action: {
      default_popup: 'index.html',
      default_icon: iconMap(),
    },
    icons: iconMap(),
    permissions: ['activeTab', 'contextMenus', 'storage', 'scripting'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
  };
}

function createManifest(browserName) {
  const manifest = baseManifest();

  if (browserName === 'chrome') {
    manifest.background = {
      service_worker: 'assets/background.js',
    };
    return manifest;
  }

  if (browserName === 'firefox') {
    manifest.background = {
      scripts: ['assets/background.js'],
    };
    manifest.browser_specific_settings = {
      gecko: {
        id: 'onul@gongahkia.dev',
        strict_min_version: '128.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    };
    return manifest;
  }

  if (browserName === 'safari-webext') {
    manifest.background = {
      service_worker: 'assets/background.js',
    };
    manifest.browser_specific_settings = {
      safari: {
        strict_min_version: '18.0',
      },
    };
    return manifest;
  }

  throw new Error(`Unknown browser build target: ${browserName}`);
}

function validateManifest(browserName, manifest) {
  if (!manifest.permissions.includes('activeTab')) {
    throw new Error(`${browserName} manifest is missing activeTab.`);
  }

  if (manifest.permissions.includes('tabs')) {
    throw new Error(`${browserName} manifest should not request tabs.`);
  }

  if (!Array.isArray(manifest.optional_host_permissions) || manifest.optional_host_permissions.length === 0) {
    throw new Error(`${browserName} manifest is missing optional_host_permissions.`);
  }

  if (browserName === 'chrome' && manifest.background?.service_worker !== 'assets/background.js') {
    throw new Error('Chrome manifest must use a service worker background.');
  }

  if (browserName === 'firefox') {
    if (!Array.isArray(manifest.background?.scripts)) {
      throw new Error('Firefox manifest must use background scripts.');
    }

    const gecko = manifest.browser_specific_settings?.gecko;
    if (!gecko?.id || gecko?.data_collection_permissions?.required?.[0] !== 'none') {
      throw new Error('Firefox manifest is missing required Gecko metadata.');
    }
  }

  if (browserName === 'safari-webext' && !manifest.browser_specific_settings?.safari?.strict_min_version) {
    throw new Error('Safari manifest is missing browser_specific_settings.safari.strict_min_version.');
  }
}

function writeBrowserBundle(browserName) {
  const browserDir = path.join(distDir, browserName);
  mkdirSync(browserDir, { recursive: true });
  cpSync(commonDir, browserDir, { recursive: true });

  const manifest = createManifest(browserName);
  validateManifest(browserName, manifest);
  writeFileSync(path.join(browserDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

buildCommonArtifacts();

for (const browserName of ['chrome', 'firefox', 'safari-webext']) {
  writeBrowserBundle(browserName);
}

rmSync(commonDir, { force: true, recursive: true });
