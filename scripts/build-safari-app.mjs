import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const safariExtensionDir = path.join(rootDir, 'dist', 'safari-webext');
const safariProjectRoot = path.join(rootDir, 'safari');

function run(command, args) {
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
  });
}

if (process.platform !== 'darwin') {
  throw new Error('Safari App Store packaging is only available on macOS.');
}

if (!existsSync(safariExtensionDir)) {
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);
}

const converterPath = execFileSync('xcrun', ['--find', 'safari-web-extension-converter'], {
  cwd: rootDir,
  encoding: 'utf8',
}).trim();

if (existsSync(path.join(safariProjectRoot, 'ONUL'))) {
  console.log(`Safari app project already exists at ${path.join(safariProjectRoot, 'ONUL')}`);
  console.log('The project references dist/safari-webext directly. Rebuild the extension bundle with npm run build before archiving in Xcode.');
} else {
  run(converterPath, [
    '--project-location',
    safariProjectRoot,
    '--app-name',
    'ONUL',
    '--bundle-identifier',
    'dev.gongahkia.onul',
    '--swift',
    '--macos-only',
    '--no-open',
    '--no-prompt',
    '--force',
    safariExtensionDir,
  ]);
}
