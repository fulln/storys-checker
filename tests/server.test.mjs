import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const source = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');

async function fixture(t, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storys-server-test-'));
  const app = path.join(dir, 'app');
  const project = path.join(dir, 'project');
  const sibling = path.join(dir, 'project-other');
  const state = path.join(dir, 'state');
  for (const d of [app, project, sibling, state]) fs.mkdirSync(d);
  for (const file of ['serve.mjs', 'runner.mjs', 'index.html', 'app.js', 'style.css', 'package.json']) {
    fs.copyFileSync(path.join(source, file), path.join(app, file));
  }
  fs.cpSync(path.join(source, 'lib'), path.join(app, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(app, '.env'), 'SENTINEL=private');
  fs.writeFileSync(path.join(app, 'config.json'), JSON.stringify({ projects: [{ id: 'test', root: project, videoDir: project }] }));
  fs.mkdirSync(path.join(app, '.git'));
  fs.writeFileSync(path.join(app, '.git', 'config'), 'private git config');
  fs.writeFileSync(path.join(state, 'data.json'), JSON.stringify({ configFile: 'config.json' }));
  fs.writeFileSync(path.join(project, 'file.md'), 'inside');
  fs.writeFileSync(path.join(sibling, 'secret.txt'), 'outside');
  fs.symlinkSync(sibling, path.join(project, 'escape'));
  fs.symlinkSync(path.join(sibling, 'missing.txt'), path.join(project, 'dangling'));
  const portServer = net.createServer();
  portServer.listen(0, '127.0.0.1');
  await once(portServer, 'listening');
  const port = portServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));
  const child = spawn(process.execPath, ['serve.mjs'], {
    cwd: app,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', STORYS_CHECKER_HOST: '127.0.0.1',
      STORYS_CHECKER_CONFIG: path.join(app, 'config.json'), STORYS_CHECKER_STATE_DIR: state,
      STORYS_CHECKER_USER: '', STORYS_CHECKER_PASSWORD: '', STORYS_CHECKER_READONLY: '0', ...overrides },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const exited = once(child, 'exit');
  const ready = new Promise((resolve) => {
    child.stdout.on('data', () => { if (output.includes('面板已启动')) resolve('ready'); });
  });
  let timer;
  const result = await Promise.race([ready, exited.then(() => 'exit'), new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), 5000); })]);
  clearTimeout(timer);
  return { project, sibling, dir, child, result, url: `http://127.0.0.1:${port}`, output: () => output,
    request: (url, options) => fetch(`http://127.0.0.1:${port}${url}`, options) };
}

test('only panel assets are served; private files are inaccessible', async (t) => {
  const f = await fixture(t);
  assert.equal(f.result, 'ready', f.output());
  for (const url of ['/', '/index.html', '/app.js', '/style.css']) assert.equal((await f.request(url)).status, 200, url);
  for (const url of ['/config.json', '/.env', '/.git/config', '/runner.mjs', '/data.json']) {
    assert.equal((await f.request(url)).status, 404, url);
  }
});

test('project files cannot cross directory or symlink boundaries', async (t) => {
  const f = await fixture(t);
  assert.equal(f.result, 'ready', f.output());
  const inside = await f.request('/api/file?project=test&path=file.md');
  assert.equal(inside.status, 200);
  assert.equal((await inside.json()).content, 'inside');
  for (const rel of ['../project-other/secret.txt', 'escape/secret.txt', 'escape/new.txt', 'dangling']) {
    const read = await f.request(`/api/file?project=test&path=${encodeURIComponent(rel)}`);
    assert.equal(read.status, 403, rel);
    for (const endpoint of ['/api/file', '/api/prompt/save']) {
      const write = await f.request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: 'test', path: rel, content: 'overwritten' }) });
      assert.equal(write.status, 403, `${endpoint} ${rel}`);
    }
  }
  assert.equal(fs.readFileSync(path.join(f.sibling, 'secret.txt'), 'utf8'), 'outside');
  assert.equal(fs.existsSync(path.join(f.sibling, 'new.txt')), false);
  const save = await f.request('/api/file', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: 'test', path: 'new/nested.md', content: 'saved' }) });
  assert.equal(save.status, 200);
  assert.equal(fs.readFileSync(path.join(f.project, 'new/nested.md'), 'utf8'), 'saved');
});

test('local startup ignores network and credential settings', async (t) => {
  const f = await fixture(t, { HOST: '0.0.0.0', STORYS_CHECKER_HOST: '0.0.0.0',
    STORYS_CHECKER_USER: 'admin', STORYS_CHECKER_PASSWORD: '' });
  assert.equal(f.result, 'ready', f.output());
  const response = await f.request('/api/meta');
  assert.equal(response.status, 200);
  const meta = await response.json();
  assert.equal(meta.host, '127.0.0.1');
  assert.equal(meta.authRequired, false);
  assert.equal((await f.request('/app.js')).status, 200);
});

test('non-local Host and cross-origin API requests are rejected', async (t) => {
  const f = await fixture(t);
  assert.equal(f.result, 'ready', f.output());
  const status = await new Promise((resolve, reject) => {
    const req = httpRequest(`${f.url}/api/meta`, { headers: { Host: 'untrusted.example' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 403);
  assert.equal((await f.request('/api/meta', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await f.request('/api/meta')).status, 200);
});

test('local users can save prompts and run configured project commands', async (t) => {
  const f = await fixture(t);
  assert.equal(f.result, 'ready', f.output());
  const saved = await f.request('/api/prompt/save', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: 'test', path: 'prompt.md', content: 'local prompt' }) });
  assert.equal(saved.status, 200);
  assert.equal(fs.readFileSync(path.join(f.project, 'prompt.md'), 'utf8'), 'local prompt');
  const history = await (await f.request('/api/prompt/history?project=test&path=prompt.md')).json();
  assert.equal(history.length, 1);
  assert.equal(history[0].content, 'local prompt');
  const response = await f.request('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: 'test', cwd: 'root', command: "printf 'local-run'" }) });
  assert.equal(response.status, 200);
  const process = await response.json();
  let finished;
  for (let attempt = 0; attempt < 50; attempt++) {
    const processes = await (await f.request('/api/processes')).json();
    finished = processes.recent.find((p) => p.id === process.id);
    if (finished) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(finished?.status, 'done');
  assert.match(finished.log, /local-run/);
});

test('readonly blocks all project mutations', async (t) => {
  const f = await fixture(t, { STORYS_CHECKER_READONLY: '1' });
  assert.equal(f.result, 'ready', f.output());
  for (const endpoint of ['/api/run', '/api/kill', '/api/fix', '/api/file', '/api/prompt/save']) {
    assert.equal((await f.request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  }
  assert.equal((await f.request('/api/file?project=test&path=file.md')).status, 200);
});

test('oversized, malformed and cross-origin writes are rejected without killing the server', async (t) => {
  const f = await fixture(t);
  assert.equal(f.result, 'ready', f.output());
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
  assert.equal((await f.request('/api/file', { ...options, body: JSON.stringify({ content: 'x'.repeat(1024 * 1024 + 1) }) })).status, 413);
  assert.equal((await f.request('/api/fix', { ...options, body: '{broken' })).status, 400);
  assert.equal((await f.request('/api/file', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await f.request('/api/file', { ...options, headers: { ...options.headers, Origin: 'https://untrusted.example' }, body: '{}' })).status, 403);
  assert.equal((await f.request('/api/healthz')).status, 200);
});
