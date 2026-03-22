#!/bin/bash
# Firefox Add-ons Submission Script
#
# Prerequisites:
# 1. Create an account at https://addons.mozilla.org/developers/
# 2. Generate API credentials at https://addons.mozilla.org/developers/addon/api/key/
# 3. Install web-ext: pnpm add -g web-ext
#
# Required environment variables:
#   WEB_EXT_API_KEY    - AMO JWT issuer (from the API key page)
#   WEB_EXT_API_SECRET - AMO JWT secret (from the API key page)

set -euo pipefail

if [ -z "${WEB_EXT_API_KEY:-}" ] || [ -z "${WEB_EXT_API_SECRET:-}" ]; then
  echo "Error: WEB_EXT_API_KEY and WEB_EXT_API_SECRET must be set"
  exit 1
fi

VERSION=$(node -p "require('./package.json').version")

echo "Building Firefox extension..."
pnpm build:firefox

echo "Signing and submitting to Firefox Add-ons..."
npx web-ext sign \
  --source-dir dist \
  --api-key "${WEB_EXT_API_KEY}" \
  --api-secret "${WEB_EXT_API_SECRET}" \
  --channel listed

echo "Done! Check https://addons.mozilla.org/developers/ for status."
