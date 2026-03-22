import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'TC Guard',
  description: 'Automatically detect, summarize, and track Terms & Conditions changes',
  version: '1.0.0',
  permissions: ['activeTab', 'storage', 'scripting'],
  host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
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
});
