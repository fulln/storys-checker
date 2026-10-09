import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const source = fileURLToPath(new URL('..', import.meta.url));

test('a moved snapshot keeps styles, scripts and data without companion files', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storys-panel-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const app = path.join(dir, 'app');
  const state = path.join(dir, 'state');
  fs.mkdirSync(app);
  fs.mkdirSync(state);
  fs.copyFileSync(path.join(source, 'build-panel.mjs'), path.join(app, 'build-panel.mjs'));
  fs.cpSync(path.join(source, 'lib'), path.join(app, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(app, 'index.html'), '<html><head><!--PANEL-DATA-SLOT--><link rel="stylesheet" href="style.css" /></head><body><script src="app.js"></script></body></html>');
  fs.writeFileSync(path.join(app, 'style.css'), 'body { color: red; } /* $& */');
  fs.writeFileSync(path.join(app, 'app.js'), 'window.ready = true; window.label = "</script> $&";');
  const data = { label: '</script><script>window.injected = true;</script>', literal: '$&' };
  fs.writeFileSync(path.join(state, 'data.json'), JSON.stringify(data));
  const result = spawnSync(process.execPath, ['build-panel.mjs'], { cwd: app, encoding: 'utf8',
    env: { ...process.env, STORYS_CHECKER_STATE_DIR: state } });
  assert.equal(result.status, 0, result.stderr);
  fs.rmSync(app, { recursive: true });
  const panel = fs.readFileSync(path.join(state, 'panel.html'), 'utf8');
  assert.doesNotMatch(panel, /<link\b[^>]*href=/i);
  assert.doesNotMatch(panel, /<script\b[^>]*src=/i);
  assert.match(panel, /<style>body \{ color: red; \} \/\* \$& \*\/<\/style>/);
  const scripts = [...panel.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 2);
  const context = { window: {} };
  for (const script of scripts) vm.runInNewContext(script[1], context);
  assert.equal(context.window.ready, true);
  assert.equal(context.window.label, '</script> $&');
  assert.equal(context.window.__PANEL_DATA__.label, data.label);
  assert.equal(context.window.__PANEL_DATA__.literal, '$&');
  assert.equal(context.window.injected, undefined);
});
