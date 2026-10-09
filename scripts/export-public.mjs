#!/usr/bin/env node
/** Export an explicitly allow-listed, clean public checkout without touching git history. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = process.argv[2] && path.resolve(process.argv[2]);

const rootFiles = new Set([
  'package.json', '.gitignore', 'SECURITY.md', 'AGENTS.md',
  'README.md', 'CONTRIBUTING.md', 'LICENSE', 'config.example.json', 'config.schema.json',
  'app.js', 'style.css', 'index.html', 'scan.mjs', 'checks.mjs', 'serve.mjs',
  'runner.mjs', 'gate.mjs', 'build-panel.mjs',
]);
const allowedDirs = new Set(['lib', 'checks', 'scripts', 'examples']);
const explicitFiles = new Set([
  'lib/project-files.mjs', 'scripts/export-public.mjs', 'tests/server.test.mjs',
  'tests/export-public.test.mjs', 'tests/notifications.test.mjs', 'tests/panel.test.mjs', 'SECURITY.md',
  'docs/AGENT_APP.md', 'AGENTS.md',
  '.codex/skills/storys-video-production/SKILL.md',
  '.github/workflows/ci.yml',
]);
const publicDocs = new Set(['README.md', 'UIUX.md', 'PUBLISHING.md', 'AGENT_APP.md']);

function usage(message) {
  if (message) console.error(`error: ${message}`);
  console.error('usage: node scripts/export-public.mjs /path/to/new-directory');
  process.exitCode = 2;
}

function isInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

async function trackedFiles() {
  const { stdout } = await execFileAsync('git', ['ls-files', '-z'], { cwd: source, encoding: 'utf8' });
  return stdout.split('\0').filter(Boolean);
}

function isAllowed(file) {
  const normalized = file.replaceAll(path.sep, '/');
  const parts = normalized.split('/');
  if (parts.some((part) => ['.git', 'node_modules', 'state', 'logs', 'history'].includes(part))) return false;
  const basename = parts.at(-1);
  if ((basename.startsWith('.env') && basename !== '.env.example') ||
      ['config.json', 'config.local.json', 'data.json', 'panel.html', 'check-report.json', 'fix-result.json'].includes(basename)) return false;
  if (normalized.startsWith('docs/')) return publicDocs.has(normalized.slice(5));
  if (normalized.startsWith('.github/')) return normalized === '.github/workflows/ci.yml';
  if (explicitFiles.has(normalized)) return true;
  if (normalized.startsWith('tests/')) return false;
  const first = normalized.split('/')[0];
  return normalized === first ? rootFiles.has(first) : allowedDirs.has(first);
}

async function copyChecked(relative) {
  const from = path.join(source, relative);
  await validateSourcePath(relative);
  const info = await fs.lstat(from);
  if (!info.isFile()) throw new Error(`refusing non-regular source: ${relative}`);
  const to = path.join(destination, relative);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}

async function validateSourcePath(relative) {
  let cursor = source;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    const ancestor = await fs.lstat(cursor);
    if (ancestor.isSymbolicLink()) throw new Error(`refusing symlink source: ${relative}`);
  }
}

async function canonicalDestination(candidate) {
  let cursor = candidate;
  const suffix = [];
  while (true) {
    try {
      const real = await fs.realpath(cursor);
      return path.resolve(real, ...suffix.reverse());
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw new Error('destination has no existing parent');
      suffix.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

if (!destination) usage('destination is required');
else {
  const resolvedHome = path.resolve(os.homedir());
  const sourceReal = await fs.realpath(source);
  const destinationReal = await canonicalDestination(destination);
  if (destination === path.parse(destination).root || destination === resolvedHome || destination === source || isInside(destinationReal, sourceReal)) {
    usage('destination is unsafe or inside the source repository');
  } else {
    let created = false;
    try {
      await fs.lstat(destination).then(() => { throw new Error('destination already exists'); }, error => {
        if (error.code !== 'ENOENT') throw error;
      });
      const files = (await trackedFiles()).filter(isAllowed);
      for (const file of explicitFiles) {
        try {
          const info = await fs.lstat(path.join(source, file));
          if (info.isFile() && !files.includes(file)) files.push(file);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      if (!files.includes('scripts/export-public.mjs')) files.push('scripts/export-public.mjs');
      for (const file of files) {
        const from = path.join(source, file);
        await validateSourcePath(file);
        const info = await fs.lstat(from);
        if (!info.isFile()) throw new Error(`refusing non-regular source: ${file}`);
      }
      await fs.mkdir(destination);
      created = true;
      for (const file of files.sort()) await copyChecked(file);
      console.log(`exported ${files.length} files to ${destination}`);
    } catch (error) {
      if (created) await fs.rm(destination, { recursive: true, force: true }).catch(() => {});
      console.error(`error: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
