// 检查：复盘 → 单期交接一致性（对齐 DAILY_REVIEW_SYSTEM.md / WEEKLY_REVIEW_INTEGRATION.md）
//
// 只做三类**可客观验证**的事，不去文本匹配人工写的 review-log：
//   A. 每日复盘产物「执行目标-*.json」字段是否完整、是否单变量；
//   B. review-handoff.json 是否能被识别（同一仓库里并存多套约定，故做能力识别而非字段清单）；
//   C. 交接引用的周简报 / 执行目标文件是否存在，**SHA-256 是否与交接记录一致**（发布包构建前的硬门禁）。
//
// 输出按项目聚合：同类问题只报一条，明细放进 detail，避免 100+ 内容包把面板刷屏。
import crypto from 'node:crypto';
import fsSync from 'node:fs';
import path from 'node:path';

const STAGES = ['T+2h', 'T+24h', 'T+7d'];
const AGGREGATE_LIMIT = 8;

// 交接文件里的字段常常嵌在 productionChecks.* / weeklyBrief.* 下，因此按键名递归收集。
const IDENTITY_KEYS = new Set(['topic', 'topicId', 'episode', 'episodeId', 'experimentId', 'weeklyBrief', 'sourceBrief', 'application', 'adaptation', 'ruleCompliance', 'compliance']);
const VARIABLE_KEYS = new Set(['experimentId', 'weeklyBrief', 'ruleCompliance', 'compliance', 'application', 'adaptation', 'personalIp']);
// 「授权 / 制作范围」型交接：不含实验变量是正常约定，不应判罚。
const AUTHORIZATION_KEYS = new Set(['authorizedScope', 'scriptApproved', 'productionAuthorized', 'productionChecks', 'status']);

const sha256Of = (file) => {
  try {
    return crypto.createHash('sha256').update(fsSync.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
};

/** 递归收集对象里出现过的所有键名（深度上限 4）。 */
function collectKeys(value, keys = new Set(), depth = 0) {
  if (depth > 4 || !value || typeof value !== 'object') return keys;
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, keys, depth + 1);
    return keys;
  }
  for (const [k, v] of Object.entries(value)) {
    keys.add(k);
    collectKeys(v, keys, depth + 1);
  }
  return keys;
}

/** 递归找出第一个 experimentId 值。 */
function findExperimentId(value, depth = 0) {
  if (depth > 4 || !value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = findExperimentId(v, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const [k, v] of Object.entries(value)) {
    if (k === 'experimentId' && typeof v === 'string' && v.trim()) return v;
    const found = findExperimentId(v, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * 收集交接里声明的来源文件引用（周简报 / 执行目标）。
 * 只认已知形状，避免把任意 "path" 字段误当成引用。
 */
function collectSourceRefs(handoff) {
  const refs = [];
  const add = (refPath, hash, label) => {
    if (typeof refPath !== 'string' || !refPath.trim()) return;
    refs.push({ path: refPath.trim(), hash: typeof hash === 'string' ? hash.trim().toLowerCase() : '', label });
  };

  for (const [key, label] of [
    ['weeklyBrief', '周生产简报'],
    ['dailyExecutionTarget', '执行目标'],
  ]) {
    const value = handoff[key];
    if (value && typeof value === 'object') add(value.path, value.sha256, label);
  }
  if (typeof handoff.sourceBrief === 'string') {
    add(handoff.sourceBrief, handoff.sourceSha256 || handoff.briefSha256, '周生产简报');
  }

  // productionChecks.* 下的同形引用
  const walk = (value, depth = 0) => {
    if (depth > 3 || !value || typeof value !== 'object') return;
    for (const [k, v] of Object.entries(value)) {
      if (k === 'weeklyReview' && v && typeof v === 'object') add(v.record, v.sourceSha256, '周生产简报');
      walk(v, depth + 1);
    }
  };
  walk(handoff.productionChecks || {});

  return refs.filter((r, i) => refs.findIndex((x) => x.path === r.path) === i);
}

function aggregate(out, level, label, items, action) {
  if (!items.length) return;
  const detail =
    items.slice(0, AGGREGATE_LIMIT).join('\n') +
    (items.length > AGGREGATE_LIMIT ? `\n… 另有 ${items.length - AGGREGATE_LIMIT} 项` : '');
  out.push({ level, title: `${label}：${items.length} 项`, detail, action });
}

function topicDateFromDir(dir) {
  const date = path.basename(path.dirname(path.dirname(dir)));
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function findLatestHandoff(project, ctx) {
  const dir = path.join(project.root, 'outputs');
  if (!ctx.fs.isDir(dir)) return null;
  const found = [];
  const walk = (d, depth = 0) => {
    if (depth > 4) return;
    for (const name of ctx.fs.listDir(d)) {
      const full = path.join(d, name);
      if (ctx.fs.isDir(full)) walk(full, depth + 1);
      else if (/^执行目标-\d{4}-\d{2}-\d{2}\.json$/.test(name)) {
        found.push({ full, date: name.match(/(\d{4}-\d{2}-\d{2})/)[1] });
      }
    }
  };
  walk(dir);
  found.sort((a, b) => b.date.localeCompare(a.date));
  return found[0] || null;
}

function validateExecutionHandoff(h) {
  const problems = [];
  for (const field of ['sourceReviewDate', 'reviewStage', 'nextAction', 'preserve']) {
    if (typeof h[field] !== 'string' || !h[field].trim()) problems.push(`执行目标缺少字段 ${field}`);
  }
  if (!Array.isArray(h.validationMetrics) || h.validationMetrics.length === 0) problems.push('执行目标缺少 validationMetrics（主验收指标）');
  if (h.singleVariable !== true) problems.push('执行目标必须 singleVariable: true（只改一个变量）');
  if (h.reviewStage && !STAGES.includes(h.reviewStage)) problems.push(`reviewStage 应为 ${STAGES.join(' / ')}`);
  if (h.finalDecisionAllowed && h.reviewStage !== 'T+7d') problems.push('只有 T+7d 正式复盘才允许最终决策');
  return problems;
}

/** 交接文件是否可识别、是否记录本期变量（按键名递归判断）。 */
function inspectReviewHandoff(h) {
  const problems = [];
  const keys = collectKeys(h);
  const has = (set) => [...set].some((k) => keys.has(k));

  if (!('schemaVersion' in h) && !has(IDENTITY_KEYS) && !has(AUTHORIZATION_KEYS)) {
    problems.push({ kind: 'unrecognized', text: '无法识别的交接结构（既无 schemaVersion，也无 topic/experimentId/weeklyBrief 等字段）' });
    return problems;
  }
  if ('schemaVersion' in h && !has(VARIABLE_KEYS) && !has(AUTHORIZATION_KEYS)) {
    problems.push({ kind: 'missing-variable', text: '版本化交接未记录本期变量 / 实验 / 合规信息' });
  }
  return problems;
}

export default {
  id: 'daily-review',
  category: '复盘交接',
  run(project, ctx) {
    const out = [];
    const cfg = ctx.config.checks?.dailyReview || {};

    // A. 每日复盘流水线产物（数量少，逐条报）
    const latest = findLatestHandoff(project, ctx);
    if (latest) {
      const file = path.relative(project.root, latest.full);
      let parsed = null;
      try {
        parsed = JSON.parse(ctx.fs.readText(latest.full));
      } catch (error) {
        out.push({ level: 'error', title: `${file} 无法解析`, detail: String(error.message || error) });
      }
      if (parsed) {
        for (const text of validateExecutionHandoff(parsed)) {
          out.push({
            level: 'error',
            title: `${file}：${text}`,
            action: 'node scripts/daily-review/verify-execution-handoff.mjs <执行目标.json>',
          });
        }
      }
    }

    // B + C. 单期交接
    const since = cfg.since || null;
    const unrecognized = [];
    const missingVariable = [];
    const refMissing = [];
    const refMismatch = [];
    const refNoHash = [];

    for (const dir of ctx.fs.topicDirs(project)) {
      const date = topicDateFromDir(dir);
      if (since && date && date < since) continue;
      if (!ctx.inScope(date)) continue;
      const handoffFile = path.join(dir, 'review-handoff.json');
      if (!ctx.fs.exists(handoffFile)) continue;

      const name = path.relative(project.root, dir);
      let handoff;
      try {
        handoff = JSON.parse(ctx.fs.readText(handoffFile));
      } catch {
        unrecognized.push(name);
        continue;
      }

      for (const p of inspectReviewHandoff(handoff)) {
        if (p.kind === 'unrecognized') unrecognized.push(name);
        if (p.kind === 'missing-variable') missingVariable.push(name);
      }

      // 来源引用：存在性 + SHA-256 一致性
      for (const ref of collectSourceRefs(handoff)) {
        const resolved = path.resolve(project.root, ref.path);
        // 只允许读取项目内的文件
        if (!resolved.startsWith(project.root)) continue;
        if (!ctx.fs.exists(resolved)) {
          refMissing.push(`${name} → ${ref.path}`);
          continue;
        }
        if (!ref.hash) {
          refNoHash.push(`${name} → ${ref.path}`);
          continue;
        }
        if (sha256Of(resolved) !== ref.hash) {
          refMismatch.push(`${name} → ${ref.path}`);
        }
      }
    }

    aggregate(out, 'warn', 'review-handoff.json 结构无法识别', unrecognized, '统一交接文件结构（见 WEEKLY_REVIEW_INTEGRATION.md）');
    aggregate(out, 'warn', 'review-handoff.json 未记录本期变量', missingVariable, '补齐 experimentId / application / adaptation');
    aggregate(out, 'error', '交接引用的来源文件缺失', refMissing, '补齐 outputs/ 下的周简报或执行目标文件');
    aggregate(out, 'error', '交接引用的来源文件 SHA-256 不一致', refMismatch, '流程：重新生成周简报后更新交接里的 sha256（P12 构建发布包前必须一致）');
    aggregate(out, 'info', '交接未记录来源文件 SHA-256', refNoHash, '建议在交接里记录 sha256，以便发布包构建前自动校验');

    return out;
  },
};
