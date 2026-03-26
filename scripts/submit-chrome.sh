#!/bin/bash
# Chrome Web Store Submission Script
#
# Prerequisites:
# 1. Create a project in Google Cloud Console: https://console.cloud.google.com/
# 2. Enable the Chrome Web Store API
# 3. Create OAuth 2.0 credentials (Desktop application type)
# 4. Get a refresh token by completing the OAuth flow:
#    - Visit: https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob
#    - Exchange the code for a refresh token
#
# Required environment variables:
#   CHROME_CLIENT_ID       - OAuth 2.0 client ID
#   CHROME_CLIENT_SECRET   - OAuth 2.0 client secret
#   CHROME_REFRESH_TOKEN   - OAuth 2.0 refresh token
#   CHROME_APP_ID          - Chrome Web Store extension ID (after first upload)

set -euo pipefail

if [ -z "${CHROME_CLIENT_ID:-}" ] || [ -z "${CHROME_CLIENT_SECRET:-}" ] || [ -z "${CHROME_REFRESH_TOKEN:-}" ]; then
  echo "Error: CHROME_CLIENT_ID, CHROME_CLIENT_SECRET, and CHROME_REFRESH_TOKEN must be set"
  exit 1
fi

VERSION=$(node -p "require('./package.json').version")
ZIP_FILE="goodman-chrome-v${VERSION}.zip"

if [ ! -f "$ZIP_FILE" ]; then
  echo "Building and packaging..."
  pnpm package:chrome
fi

echo "Getting access token..."
ACCESS_TOKEN=$(curl -s -X POST https://oauth2.googleapis.com/token \
  -d "client_id=${CHROME_CLIENT_ID}" \
  -d "client_secret=${CHROME_CLIENT_SECRET}" \
  -d "refresh_token=${CHROME_REFRESH_TOKEN}" \
  -d "grant_type=refresh_token" | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).access_token")

echo "Uploading to Chrome Web Store..."
curl -s -X PUT \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-goog-api-version: 2" \
  -T "$ZIP_FILE" \
  "https://www.googleapis.com/upload/chromewebstore/v1.1/items/${CHROME_APP_ID}"

echo "Publishing..."
curl -s -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-goog-api-version: 2" \
  -H "Content-Length: 0" \
  "https://www.googleapis.com/chromewebstore/v1.1/items/${CHROME_APP_ID}/publish"

echo "Done! Check https://chrome.google.com/webstore/devconsole for status."
