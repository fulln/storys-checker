#!/usr/bin/env node
// scripts/init.mjs — 初始化本地配置（把示例配置复制成 config.json）
//
// 用法：
//   npm run setup                 # 复制 config.example.json → config.json（已存在则跳过）
//   node scripts/init.mjs --force # 覆盖已有 config.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findConfigFile } from '../lib/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'config.json');
const source = path.join(ROOT, 'config.example.json');
const force = process.argv.includes('--force');

if (!fs.existsSync(source)) {
  console.error(`❌ 找不到示例配置：${source}`);
  process.exit(1);
}

if (fs.existsSync(target) && !force) {
  console.log(`ℹ️  config.json 已存在，未覆盖。如需重建：node scripts/init.mjs --force`);
} else {
  fs.copyFileSync(source, target);
  console.log(`✅ 已生成 config.json（来自 config.example.json）`);
}

try {
  const active = findConfigFile(ROOT);
  console.log(`   当前生效配置：${path.relative(ROOT, active)}`);
  const config = JSON.parse(fs.readFileSync(active, 'utf8'));
  console.log(`   项目数：${(config.projects || []).length}，检查项：${(config.checks?.enabled || []).length}`);
} catch (error) {
  console.warn(`   ⚠️  ${error.message}`);
}

console.log(`
下一步：
  1. 编辑 config.json 的 projects，把 root / videoDir 指向你的项目
  2. npm run scan     # 扫描并生成 data.json
  3. npm run build    # 生成可双击打开的面板 panel.html
  4. npm start        # 或启动本地服务 http://localhost:8787

想先看效果：npm run demo
`);
