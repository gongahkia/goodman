#!/bin/bash
set -e

# Build the project
npm run build

# Create a zip file
OUTPUT_ZIP="extension.zip"
rm -f $OUTPUT_ZIP

cd dist
zip -r ../$OUTPUT_ZIP .
cd ..

echo "Created $OUTPUT_ZIP"
