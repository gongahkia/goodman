import { defineManifest } from '@crxjs/vite-plugin';

const isFirefox = process.env.BUILD_TARGET === 'firefox';

const baseManifest = {
  manifest_version: 3,
  name: 'TC Guard',
  description: 'Automatically detect, summarize, and track Terms & Conditions changes',
  version: '1.0.0',
  permissions: ['activeTab', 'storage', 'scripting'],
  host_permissions: ['<all_urls>'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'icons/tc-guard-16.png',
      '48': 'icons/tc-guard-48.png',
      '128': 'icons/tc-guard-128.png',
    },
  },
  icons: {
    '16': 'icons/tc-guard-16.png',
    '48': 'icons/tc-guard-48.png',
    '128': 'icons/tc-guard-128.png',
  },
  default_locale: 'en',
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
  },
};

function getChromeManifest() {
  return {
    ...baseManifest,
    background: {
      service_worker: 'src/background/index.ts',
      type: 'module',
    },
  };
}

function getFirefoxManifest() {
  return {
    ...baseManifest,
    background: {
      service_worker: 'src/background/index.ts',
    },
    browser_specific_settings: {
      gecko: {
        id: 'tc-guard@extension',
        strict_min_version: '109.0',
      },
    },
  };
}

export default defineManifest(isFirefox ? getFirefoxManifest() : getChromeManifest());
export { getChromeManifest, getFirefoxManifest };
