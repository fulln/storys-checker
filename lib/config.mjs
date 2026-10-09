// lib/config.mjs — 配置解析（本地面板与项目清单的唯一入口）
//
// 解析顺序（先命中先用）：
//   1. 命令行 --config <path>
//   2. 环境变量 STORYS_CHECKER_CONFIG
//   3. <cwd>/config.local.json      ← 推荐：本地私有配置（已 gitignore）
//   4. <cwd>/config.json            ← 兼容旧用法（已 gitignore）
//   5. <cwd>/config.example.json    ← 仓库自带示例，保证 clone 后开箱可跑
//
// 支持的路径写法：
//   ~/opt/xxx        → 展开为家目录
//   ./examples/xxx   → 相对「配置文件所在目录」解析
//   /abs/path        → 原样使用
//
// 配置文件可选加 "extends": "config.example.json"，
// 在示例之上做局部覆盖（对象深合并，数组整体替换）。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOME = os.homedir();

/** 展开 `~` / `~/xxx`。 */
export const expandHome = (p) =>
  typeof p === 'string' && (p === '~' || p.startsWith('~/'))
    ? path.join(HOME, p === '~' ? '' : p.slice(2))
    : p;

/** 把配置里的路径解析为绝对路径：`~` 展开、相对路径相对配置文件目录。 */
export const resolveConfigPath = (p, configDir) => {
  if (typeof p !== 'string' || !p) return p;
  const expanded = expandHome(p);
  if (path.isAbsolute(expanded)) return expanded;
  return path.resolve(configDir, expanded);
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** 深合并：对象递归合并，数组与标量由上层整体覆盖。 */
export function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) return override;
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return out;
}

/** 按顺序找到第一个存在的配置文件；全部缺失时抛出可读错误。 */
export function findConfigFile(root = process.cwd(), argv = process.argv) {
  const cliIndex = argv.indexOf('--config');
  const fromCli = cliIndex >= 0 ? argv[cliIndex + 1] : null;
  const candidates = [
    fromCli,
    process.env.STORYS_CHECKER_CONFIG,
    'config.local.json',
    'config.json',
    'config.example.json',
  ].filter(Boolean);

  const tried = [];
  for (const candidate of candidates) {
    const abs = path.isAbsolute(candidate) ? candidate : path.join(root, candidate);
    tried.push(abs);
    if (fs.existsSync(abs)) return abs;
  }
  const error = new Error(
    `找不到配置文件。尝试过：\n  ${tried.join('\n  ')}\n提示：复制 config.example.json 为 config.json 后修改。`,
  );
  error.tried = tried;
  throw error;
}

/** 读取配置，处理 extends 链（带循环保护）。 */
function readConfigChain(file, seen) {
  const abs = path.resolve(file);
  if (seen.has(abs)) throw new Error(`配置 extends 出现循环引用：${abs}`);
  seen.add(abs);

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (error) {
    throw new Error(`配置文件无法解析：${abs}\n${error.message}`);
  }

  if (!raw.extends) return raw;
  const basePath = path.resolve(path.dirname(abs), raw.extends);
  const base = readConfigChain(basePath, seen);
  const { extends: _ignored, ...own } = raw;
  return deepMerge(base, own);
}

/**
 * 加载配置并规范化项目路径。
 * @returns {object} 配置对象（含 projects[].root / videoDir 绝对路径、__file、__dir）
 */
export function loadConfig({ root = process.cwd(), argv = process.argv } = {}) {
  const file = findConfigFile(root, argv);
  const config = readConfigChain(file, new Set());

  // 相对路径一律相对「最终命中的配置文件」所在目录解析
  const baseDir = path.dirname(file);

  const projects = (config.projects || []).map((p, index) => ({
    ...p,
    id: p.id || `project-${index + 1}`,
    label: p.label || p.id || `项目 ${index + 1}`,
    root: resolveConfigPath(p.root, baseDir),
    videoDir: resolveConfigPath(p.videoDir ?? p.root, baseDir),
  }));

  return {
    ...config,
    projects,
    __file: file,
    __dir: baseDir,
  };
}

export default loadConfig;
