import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('..', import.meta.url));
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";

test('readonly checks suppress shell notifications while writable checks still send them', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storys-notify-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const commandFile = path.join(dir, 'notify.mjs');
  const marker = path.join(dir, 'notified');
  fs.writeFileSync(commandFile, "import fs from 'node:fs'; fs.writeFileSync(new URL('./notified', import.meta.url), 'sent');");
  const configFile = path.join(dir, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify({ projects: [], checks: { enabled: [] },
    notify: { onHealthBelow: 101, command: `${quote(process.execPath)} ${quote(commandFile)}` } }));
  for (const readonly of ['1', '0']) {
    const result = spawnSync(process.execPath, ['checks.mjs'], { cwd: source, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, STORYS_CHECKER_CONFIG: configFile, STORYS_CHECKER_STATE_DIR: dir, STORYS_CHECKER_READONLY: readonly } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(marker), readonly === '0');
  }
});
