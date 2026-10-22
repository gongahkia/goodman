import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const target = process.argv[2];
if (!['chrome', 'firefox'].includes(target)) throw new Error('Choose chrome or firefox');
const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version)) throw new Error('Invalid package version');
const dist = join(root, 'dist');
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
if (manifest.version !== version || manifest.background?.type !== 'module' ||
    (target === 'chrome' ? !manifest.background.service_worker : !Array.isArray(manifest.background.scripts))) {
  throw new Error('Build the matching browser target before packaging');
}
const tooling = join(root, '.tooling');
mkdirSync(tooling, { recursive: true });
const temporary = mkdtempSync(join(tooling, 'package-'));
try {
  const archive = join(temporary, 'extension.zip');
  const zipped = spawnSync('zip', ['-q', '-r', archive, '.'], { cwd: dist, stdio: 'inherit' });
  if (zipped.error) throw zipped.error;
  if (zipped.status !== 0) throw new Error(`zip exited with status ${zipped.status}`);
  const output = join(root, `goodman-${target}-v${version}.${target === 'chrome' ? 'zip' : 'xpi'}`);
  // Replace only after a complete fresh archive exists; obsolete hashed assets cannot survive.
  renameSync(archive, output);
  console.log(`Created ${output}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
