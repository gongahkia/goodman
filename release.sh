#!/bin/bash
set -euo pipefail

npm run build

OUTPUT_DIR="release"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

(
  cd dist/chrome
  zip -Xqr "../../$OUTPUT_DIR/onul-chrome.zip" .
)

(
  cd dist/firefox
  zip -Xqr "../../$OUTPUT_DIR/onul-firefox.xpi" .
)

echo "Created release/onul-chrome.zip"
echo "Created release/onul-firefox.xpi"
echo "Run 'npm run build:safari-app' on macOS to rebuild the Safari containing app project."
