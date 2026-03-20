import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const firefoxDistDir = path.join(rootDir, 'dist', 'firefox');
const outputDir = path.join(rootDir, 'release');
const addonPackagePath = path.join(outputDir, 'onul-firefox.xpi');
const sourcePackagePath = path.join(outputDir, 'onul-firefox-source.zip');
const submissionNotesPath = path.join(outputDir, 'onul-firefox-submission.txt');

function run(command, args, cwd = rootDir) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
  });
}

function removeIfExists(filePath) {
  rmSync(filePath, { force: true });
}

run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);

if (!existsSync(firefoxDistDir)) {
  throw new Error(`Firefox build output not found at ${firefoxDistDir}`);
}

mkdirSync(outputDir, { recursive: true });
removeIfExists(addonPackagePath);
removeIfExists(sourcePackagePath);
removeIfExists(submissionNotesPath);

run('zip', ['-Xqr', addonPackagePath, '.'], firefoxDistDir);

const sourceExcludes = [
  'asset/*',
  '.git/*',
  '.github/*',
  'dist/*',
  'node_modules/*',
  'release/*',
  'safari/*',
  'scripts/build-safari-app.mjs',
  '__MACOSX/*',
  '*.DS_Store',
];

run('zip', ['-Xqr', sourcePackagePath, '.', ...sourceExcludes.flatMap((pattern) => ['-x', pattern])], rootDir);

writeFileSync(
  submissionNotesPath,
  [
    'Firefox submission artifacts',
    '',
    'Upload to the AMO add-on package field:',
    '  release/onul-firefox.xpi',
    '',
    'Upload to the AMO source code field:',
    '  release/onul-firefox-source.zip',
    '',
    'Use for local unpacked testing only:',
    '  dist/firefox/',
    '',
    'Do not upload:',
    '  release/onul-chrome.zip',
    '  dist/chrome/',
    '  dist/safari-webext/',
    '  safari/',
    '',
    'Build reproduction:',
    '  npm install',
    '  npm run release:firefox',
    '',
    'Reviewer notes:',
    '  - Manual conversion is the default mode.',
    '  - Live inline conversion is opt-in per site via runtime host permissions.',
    '  - No remote code, analytics, or outbound data transmission is used.',
  ].join('\n')
);

console.log(`Created ${addonPackagePath}`);
console.log(`Created ${sourcePackagePath}`);
console.log(`Created ${submissionNotesPath}`);
