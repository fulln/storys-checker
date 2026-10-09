import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const exporter = fileURLToPath(new URL('../scripts/export-public.mjs', import.meta.url));
const fixtures = [];

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'storys-export-'));
  fixtures.push(root);
  await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
  await fs.copyFile(exporter, path.join(root, 'scripts/export-public.mjs'));
  await fs.writeFile(path.join(root, 'package.json'), '{}');
  await fs.writeFile(path.join(root, 'README.md'), 'public');
  await fs.writeFile(path.join(root, 'SECURITY.md'), 'security');
  await fs.mkdir(path.join(root, '.codex/skills/storys-video-production'), { recursive: true });
  await fs.writeFile(path.join(root, '.codex/skills/storys-video-production/SKILL.md'), 'public skill');
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs/README.md'), 'docs');
  await fs.writeFile(path.join(root, 'docs/soul.md'), 'private');
  await fs.writeFile(path.join(root, 'docs/another-private.md'), 'private');
  await fs.writeFile(path.join(root, 'config.json'), 'private configuration');
  await fs.writeFile(path.join(root, '.env'), 'private credentials');
  await fs.writeFile(path.join(root, 'Dockerfile'), 'obsolete deployment');
  await fs.writeFile(path.join(root, 'docker-compose.yml'), 'obsolete deployment');
  await fs.writeFile(path.join(root, 'docs/DEPLOY.md'), 'obsolete deployment');
  await fs.mkdir(path.join(root, 'deploy'));
  await fs.writeFile(path.join(root, 'deploy/service'), 'obsolete deployment');
  await fs.mkdir(path.join(root, 'examples/demo'), { recursive: true });
  await fs.writeFile(path.join(root, 'examples/demo/.env'), 'private nested credentials');
  await run('git', ['init', '-q'], { cwd: root });
  await run('git', ['add', '-A'], { cwd: root });
  await fs.mkdir(path.join(root, 'lib'));
  await fs.writeFile(path.join(root, 'lib/project-files.mjs'), '// new runtime helper');
  return root;
}

test('exports runtime files and excludes private docs', async () => {
  const root = await fixture();
  const destination = path.join(path.dirname(root), `${path.basename(root)}-out`);
  fixtures.push(destination);
  await run(process.execPath, [path.join(root, 'scripts/export-public.mjs'), destination], { cwd: root });
  assert.equal(await fs.readFile(path.join(destination, 'package.json'), 'utf8'), '{}');
  assert.equal(await fs.readFile(path.join(destination, 'lib/project-files.mjs'), 'utf8'), '// new runtime helper');
  assert.equal(await fs.readFile(path.join(destination, '.codex/skills/storys-video-production/SKILL.md'), 'utf8'), 'public skill');
  assert.equal(await fs.readFile(path.join(destination, 'scripts/export-public.mjs'), 'utf8').then(Boolean), true);
  await assert.rejects(fs.stat(path.join(destination, 'docs/soul.md')), { code: 'ENOENT' });
  for (const file of ['.git', 'config.json', '.env', 'examples/demo/.env', 'docs/another-private.md', 'Dockerfile', 'docker-compose.yml', 'deploy', 'docs/DEPLOY.md']) {
    await assert.rejects(fs.stat(path.join(destination, file)), { code: 'ENOENT' });
  }
});

test('rejects existing destinations and parent symlink into source', async () => {
  const root = await fixture();
  const existing = path.join(path.dirname(root), `${path.basename(root)}-existing`);
  await fs.mkdir(existing);
  fixtures.push(existing);
  await fs.writeFile(path.join(existing, 'sentinel'), 'keep');
  await assert.rejects(run(process.execPath, [path.join(root, 'scripts/export-public.mjs'), existing], { cwd: root }));
  assert.equal(await fs.readFile(path.join(existing, 'sentinel'), 'utf8'), 'keep');
  const linkParent = path.join(path.dirname(root), `${path.basename(root)}-link`);
  fixtures.push(linkParent);
  await fs.symlink(root, linkParent);
  await assert.rejects(run(process.execPath, [path.join(root, 'scripts/export-public.mjs'), path.join(linkParent, 'out')], { cwd: root }));
});

test('rejects a tracked source symlink before creating output', async () => {
  const root = await fixture();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'storys-outside-'));
  fixtures.push(outside);
  await fs.mkdir(path.join(root, 'lib'), { recursive: true });
  await fs.symlink(outside, path.join(root, 'lib/leak'));
  await run('git', ['add', '-A'], { cwd: root });
  const destination = path.join(path.dirname(root), `${path.basename(root)}-symlink-out`);
  await assert.rejects(run(process.execPath, [path.join(root, 'scripts/export-public.mjs'), destination], { cwd: root }));
  await assert.rejects(fs.stat(destination), { code: 'ENOENT' });
  await fs.rm(outside, { recursive: true, force: true });
});

test('rejects a symlink ancestor of a new runtime helper', async () => {
  const root = await fixture();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'storys-outside-'));
  fixtures.push(outside);
  await fs.writeFile(path.join(outside, 'project-files.mjs'), '// outside');
  await fs.rm(path.join(root, 'lib'), { recursive: true });
  await fs.symlink(outside, path.join(root, 'lib'));
  const destination = `${root}-ancestor-out`;
  await assert.rejects(run(process.execPath, [path.join(root, 'scripts/export-public.mjs'), destination], { cwd: root }));
  await assert.rejects(fs.stat(destination), { code: 'ENOENT' });
});

test.after(async () => {
  await Promise.all(fixtures.map(root => fs.rm(root, { recursive: true, force: true })));
});
