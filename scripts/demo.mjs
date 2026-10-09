#!/usr/bin/env node
// scripts/demo.mjs — 确定性生成示例面板
//
// 为什么需要它：git 不保存文件修改时间，而部分检查（timing / icons-index / script-review）
// 依赖 mtime 判断产物是否过期。克隆仓库后 mtime 全是检出时间，比较结果随机。
// 这里先按正确顺序校正示例项目的 mtime，再扫描并生成自包含面板，保证 demo 结果稳定。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO = path.join(ROOT, 'examples', 'demo-project');
const BASE = Date.parse('2026-01-01T08:00:00+08:00') / 1000;

// [相对路径, 相对基准的秒数] —— 越靠后表示越新
const TIMELINE = [
  ['content/2026-01-01/topics/01-demo/research.md', 0],
  ['content/2026-01-01/topics/01-demo/jev/topic-triage.json', 900],
  ['content/2026-01-01/topics/01-demo/jev/fact-classification.json', 1200],
  ['content/2026-01-01/topics/01-demo/script.md', 1800],
  ['video/public/audio/demo/demo.captions.raw.json', 2400],
  ['video/public/icons/demo.svg', 2400],
  ['video/src/episodes/demo/timing.generated.ts', 3600],
  ['video/src/data/icon-library.json', 3600],
  ['content/2026-01-01/topics/01-demo/script-review.html', 4200],
];

for (const [rel, offset] of TIMELINE) {
  const file = path.join(DEMO, rel);
  if (!fs.existsSync(file)) continue;
  const t = BASE + offset;
  fs.utimesSync(file, t, t);
}

const run = (args) => {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run(['scan.mjs', '--config', 'config.example.json']);
run(['build-panel.mjs']);
console.log('✅ 示例面板已生成：panel.html（双击打开，或 npm start 看实时版）');
