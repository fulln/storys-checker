// checks.mjs — 检查引擎（插件加载 + 健康分 + 历史 + 增量 + 通知 + 修复 + 监听）
// 用法：
//   node checks.mjs               # 运行全部检查 → check-report.json + history/
//   node checks.mjs --fix [fixId] # 自动修复（默认 all）
//   node checks.mjs --watch       # 监听项目文件变化，自动复查 + 通知
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.mjs';
import { STATE_DIR, ensureStateDir, stateFile } from './lib/paths.mjs';

const ROOT = process.cwd();
const HOME = os.homedir();
const HISTORY_DIR = stateFile('history');
const HISTORY_FILE = path.join(HISTORY_DIR, 'check-history.jsonl');
const REPORT_FILE = stateFile('check-report.json');
const FIX_RESULT_FILE = stateFile('fix-result.json');

const config = loadConfig({ root: ROOT });
const PROJECTS = config.projects;
const CHECKS_CFG = config.checks || {};
const ENABLED = CHECKS_CFG.enabled || [];
const FIXES = config.fixes || {};
const HEALTH = {
  errorWeight: 15,
  errorCapPoints: 70,
  // 警告扣分用饱和曲线：100 - 45 * w/(w+40)。
  // 比旧的「线性 + 条数封顶」更好：每解决一条警告分数都会动，同时历史噪声又不会把分数压到 0。
  warnCapPoints: 45,
  warnHalf: 40,
  // 兼容旧模型：把 warnHalf 设为 null 即回退为「线性 + warnCap 封顶」
  warnWeight: 1,
  warnCap: 20,
  infoWeight: 0.25,
  infoCap: 5,
  threshold: 70,
  ...(config.health || {}),
};

function penaltyOf(errors, warns, infos) {
  const errorPenalty = Math.min(errors * HEALTH.errorWeight, HEALTH.errorCapPoints);
  const warnPenalty =
    HEALTH.warnHalf != null
      ? HEALTH.warnCapPoints * (warns / (warns + HEALTH.warnHalf))
      : Math.min(warns, HEALTH.warnCap) * HEALTH.warnWeight;
  const infoPenalty = Math.min(infos, HEALTH.infoCap) * HEALTH.infoWeight;
  return { errorPenalty, warnPenalty, infoPenalty, total: errorPenalty + warnPenalty + infoPenalty };
}

// 检查范围：只对近期内容包做逐包检查（默认全量）。
// config.checks.scope = { days: 60 } 或 { since: '2026-09-01' }
const SCOPE = { days: null, since: null, ...(CHECKS_CFG.scope || {}) };
const scopeCutoff = SCOPE.days
  ? new Date(Date.now() - SCOPE.days * 86400000).toISOString().slice(0, 10)
  : SCOPE.since || null;
const inScope = (date) => {
  if (!date || !scopeCutoff) return true;
  return String(date) >= scopeCutoff;
};

const todayStr = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const TODAY = todayStr();

// ---------- fs 工具 ----------
const exists = (p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
};
const listDir = (p) => {
  if (!exists(p)) return [];
  try {
    return fs.readdirSync(p).sort();
  } catch {
    return [];
  }
};
const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};
const readText = (p) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
};
const mtime = (f) => {
  try {
    return fs.statSync(f).mtimeMs;
  } catch {
    return 0;
  }
};
const newestInDir = (dir) => {
  let max = 0;
  for (const f of listDir(dir)) {
    const full = path.join(dir, f);
    if (!isDir(full)) max = Math.max(max, mtime(full));
  }
  return max;
};
const topicDirs = (p) => {
  const out = [];
  const content = path.join(p.root, 'content');
  for (const date of listDir(content)) {
    const topics = path.join(content, date, 'topics');
    for (const t of listDir(topics)) {
      const full = path.join(topics, t);
      if (isDir(full)) out.push(full);
    }
  }
  return out;
};

const ctx = {
  ROOT,
  STATE_DIR,
  HOME,
  config,
  spawn: spawnSync,
  scope: scopeCutoff,
  today: TODAY,
  inScope,
  isFuture: (date) => Boolean(date) && String(date) > TODAY,
  fs: {
    exists,
    listDir,
    isDir,
    readJson,
    readText,
    mtime,
    newestInDir,
    topicDirs,
    topicDate: (dir) => {
      const d = path.basename(path.dirname(path.dirname(dir)));
      return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
    },
    rel: (p, f) => path.relative(p.root, f),
  },
};

// ---------- 插件加载 ----------
async function loadChecks() {
  const dir = path.join(ROOT, 'checks');
  const out = {};
  for (const f of listDir(dir)) {
    if (!f.endsWith('.mjs') || f.startsWith('_')) continue;
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    const def = mod.default;
    if (def?.id) out[def.id] = def;
  }
  return out;
}

// ---------- 健康分 ----------
function computeHealth(findings) {
  let e = 0;
  let w = 0;
  let i = 0;
  const byProject = {};
  for (const f of findings) {
    if (f.level === 'error') e++;
    else if (f.level === 'warn') w++;
    else i++;
    byProject[f.project] ||= { error: 0, warn: 0, info: 0 };
    byProject[f.project][f.level]++;
  }

  const perProject = {};
  for (const [pid, c] of Object.entries(byProject)) {
    perProject[pid] = Math.max(0, Math.round(100 - penaltyOf(c.error, c.warn, c.info).total));
  }

  const penalty = penaltyOf(e, w, i);
  return {
    global: Math.max(0, Math.round(100 - penalty.total)),
    perProject,
    threshold: HEALTH.threshold,
    // 透明化扣分构成，便于判断“分数为什么低”
    counts: { error: e, warn: w, info: i },
    penalty: {
      error: Math.round(penalty.errorPenalty * 10) / 10,
      warn: Math.round(penalty.warnPenalty * 10) / 10,
      info: Math.round(penalty.infoPenalty * 10) / 10,
    },
  };
}

// ---------- 历史 + 增量 ----------
const findingKey = (f) => `${f.project}|${f.category}|${f.title}`;

function readHistory() {
  if (!exists(HISTORY_FILE)) return [];
  return readText(HISTORY_FILE)
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function computeDelta(findings) {
  const history = readHistory();
  const prev = history.length ? history[history.length - 1] : null;
  const prevKeys = new Set(prev?.keys || []);
  const curKeys = new Set(findings.map(findingKey));
  let added = 0;
  let resolved = 0;
  for (const k of curKeys) if (!prevKeys.has(k)) added++;
  for (const k of prevKeys) if (!curKeys.has(k)) resolved++;
  return { added, resolved, ongoing: Math.max(0, curKeys.size - added), lastRun: prev?.checkedAt || null, runs: history.length + 1 };
}

function appendHistory(report) {
  ensureStateDir();
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  const record = {
    checkedAt: report.checkedAt,
    summary: report.summary,
    health: report.health,
    keys: report.findings.map(findingKey),
  };
  fs.appendFileSync(HISTORY_FILE, JSON.stringify(record) + '\n', 'utf8');
}

// ---------- 通知 ----------
async function notify(report) {
  const n = config.notify || {};
  if (!n.webhook && !n.command) return;
  const should = (n.onError && report.summary.error > 0) || (n.onHealthBelow && report.health.global < n.onHealthBelow);
  if (!should) return;
  const payload = { type: 'storys-checker', checkedAt: report.checkedAt, health: report.health, summary: report.summary };
  if (n.webhook) {
    try {
      await fetch(n.webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    } catch (e) {
      console.error('   [notify] webhook 失败:', e.message);
    }
  }
  if (n.command && process.env.STORYS_CHECKER_READONLY !== '1') {
    try {
      spawnSync(n.command, { shell: true, env: { ...process.env, STORYS_CHECKER_JSON: JSON.stringify(payload) } });
    } catch (e) {
      console.error('   [notify] command 失败:', e.message);
    }
  }
}

// ---------- 运行 ----------
async function runAll() {
  const checks = await loadChecks();
  const findings = [];
  for (const p of PROJECTS) {
    if (p.missing) continue;
    for (const id of ENABLED) {
      const c = checks[id];
      if (!c || c.global) continue;
      const r = await c.run(p, ctx);
      if (Array.isArray(r)) findings.push(...r.map((f) => ({ project: p.id, category: c.category, ...f })));
    }
  }
  for (const id of ENABLED) {
    const c = checks[id];
    if (c?.global) {
      const r = await c.run(null, ctx);
      if (Array.isArray(r)) findings.push(...r.map((f) => ({ project: 'panel', category: c.category, ...f })));
    }
  }

  const order = { error: 0, warn: 1, info: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level] || a.project.localeCompare(b.project));

  const summary = { error: 0, warn: 0, info: 0, fixable: 0 };
  for (const f of findings) {
    summary[f.level] = (summary[f.level] || 0) + 1;
    if (f.fixId) summary.fixable++;
  }

  const report = {
    checkedAt: new Date().toISOString(),
    summary,
    health: computeHealth(findings),
    delta: computeDelta(findings),
    findings,
  };

  ensureStateDir();
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
  appendHistory(report);
  return report;
}

function applyFix(f) {
  const fix = FIXES[f.fixId];
  const p = PROJECTS.find((x) => x.id === f.project);
  if (!fix || !p) return { ok: false, title: f.title, error: '无对应修复定义' };
  const cwd = fix.cwd === 'video' ? p.videoDir : p.root;
  const args = (fix.args || []).map((a) => String(a).replace(/\{arg\}/g, f.fixArg || ''));
  const r = spawnSync(fix.cmd, args, { cwd, encoding: 'utf8', timeout: 180000, env: process.env });
  const tailOf = (s, n = 12) => String(s || '').trim().split('\n').slice(-n).join('\n');
  return { ok: r.status === 0, fixId: f.fixId, title: f.title, cmd: `${fix.cmd} ${args.join(' ')}`, note: fix.note || '', stdout: tailOf(r.stdout), stderr: tailOf(r.stderr) };
}

async function runFixes(only = 'all') {
  const before = await runAll();
  const target = before.findings.filter((f) => f.fixId && (only === 'all' || f.fixId === only));
  const seen = new Set();
  const fixed = [];
  for (const f of target) {
    const key = `${f.project}|${f.fixId}|${f.fixArg || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fixed.push(applyFix(f));
  }
  const report = await runAll();
  fs.writeFileSync(FIX_RESULT_FILE, JSON.stringify({ fixedAt: new Date().toISOString(), fixed, report }, null, 2), 'utf8');
  return { fixed, report };
}

// ---------- 监听 ----------
async function watch() {
  console.log('👀 监听模式已启动（Ctrl+C 退出）');
  const dirs = PROJECTS.flatMap((p) => [p.root, p.videoDir]).filter(exists);
  let timer = null;
  let running = false;
  const kick = () => {
    if (running) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      running = true;
      try {
        const report = await runAll();
        await notify(report);
        console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] 复查：错误 ${report.summary.error}，警告 ${report.summary.warn}，健康 ${report.health.global}`);
      } finally {
        running = false;
      }
    }, 1500);
  };
  for (const d of dirs) {
    try {
      fs.watch(d, { recursive: true }, kick);
    } catch {
      /* 某些目录不可监听则跳过 */
    }
  }
  kick();
  await new Promise(() => {});
}

// ---------- CLI ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (process.argv.includes('--watch')) {
    await watch();
  } else if (process.argv.includes('--fix')) {
    const idx = process.argv.indexOf('--fix');
    const next = process.argv[idx + 1];
    const only = next && !next.startsWith('-') ? next : 'all';
    const { fixed, report } = await runFixes(only);
    for (const r of fixed) {
      console.log(`${r.ok ? '✅' : '❌'} [${r.fixId}] ${r.title}`);
      console.log(`   $ ${r.cmd}`);
      if (r.stdout) console.log(`   ${r.stdout.split('\n').slice(0, 6).join('\n   ')}`);
      if (r.stderr) console.log(`   stderr: ${r.stderr.split('\n').slice(0, 3).join('\n   ')}`);
    }
    console.log(`\n复检：错误 ${report.summary.error}，警告 ${report.summary.warn}，健康 ${report.health.global}/100（阈值 ${report.health.threshold}）`);
  } else {
    const report = await runAll();
    await notify(report);
    console.log(`✅ 检查完成：错误 ${report.summary.error}，警告 ${report.summary.warn}，提示 ${report.summary.info}，可修复 ${report.summary.fixable}`);
    console.log(`   健康分 ${report.health.global}/100（阈值 ${report.health.threshold}）· 较上次：新增 ${report.delta.added}，已解决 ${report.delta.resolved}`);
    for (const f of report.findings) {
      const icon = { error: '🔴', warn: '🟡', info: '⚪' }[f.level];
      const fix = f.fixId ? `  [可修复: ${f.fixId}]` : '';
      console.log(`   ${icon} [${f.project}/${f.category}] ${f.title}${fix}`);
    }
    console.log(`   → ${path.relative(ROOT, REPORT_FILE) || 'check-report.json'} + ${path.relative(ROOT, HISTORY_FILE) || 'check-history.jsonl'}`);
  }
}

export { runAll, runFixes, computeHealth, loadChecks, readHistory };
