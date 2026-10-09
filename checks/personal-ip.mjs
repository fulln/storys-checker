// 检查：个人 IP 决策记录（对齐 PERSONAL_IP_SYSTEM.md）
//
// 决策可以记录在三处中的任意一处（按 convention 选最自然的一处即可）：
//   - storyboard.md
//   - review-log.md（门禁状态表 / 反馈记录）
//   - review-handoff.json（personalIp）或待发布包 manifest 的 productionChecks.personalIp
//
// 只有当项目确实存在个人 IP 资产、且内容包日期不早于系统启用日期（config.checks.personalIp.since）时才检查，
// 避免对历史内容包做追溯性判罚。
import path from 'node:path';

const DECISIONS = ['used', 'static', 'omitted'];
const DECISION_RE = /\b(used|static|omitted)\b|个人\s*IP\s*决策/;
const SCENE_FIELDS = ['asset', 'timecode', 'duty', 'settledFrame', 'evidence'];

function topicDateFromDir(dir) {
  const date = path.basename(path.dirname(path.dirname(dir)));
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function ipAssetsPresent(project, ctx) {
  return ctx.fs.isDir(path.join(project.videoDir, 'public', 'illustrations', 'personal-ip'));
}

function readDecision(dir, ctx) {
  const storyboard = path.join(dir, 'storyboard.md');
  const reviewLog = path.join(dir, 'review-log.md');
  const text = [ctx.fs.readText(storyboard), ctx.fs.readText(reviewLog)].join('\n');
  if (DECISION_RE.test(text)) return true;
  const handoffFile = path.join(dir, 'review-handoff.json');
  if (ctx.fs.exists(handoffFile)) {
    try {
      const h = JSON.parse(ctx.fs.readText(handoffFile));
      if (h.personalIp || h.ruleCompliance?.personalIp || h.compliance?.personalIp) return true;
    } catch {
      /* 由 daily-review 检查报错 */
    }
  }
  return false;
}

function validateManifestDecision(personalIp, { required }) {
  if (!personalIp) return required ? [{ level: 'error', text: 'manifest 缺少 productionChecks.personalIp' }] : [];
  const out = [];
  if (!DECISIONS.includes(personalIp.decision)) {
    return [{ level: 'error', text: `personalIp.decision 必须为 ${DECISIONS.join(' / ')}` }];
  }
  if (typeof personalIp.rationale !== 'string' || personalIp.rationale.trim().length < 8) {
    out.push({ level: 'warn', text: 'personalIp.rationale 为空或过短（需写清编辑理由）' });
  }
  if (personalIp.decision === 'omitted') return out;
  if (!Array.isArray(personalIp.scenes) || personalIp.scenes.length < 1) {
    out.push({ level: 'warn', text: 'decision 为 used/static 时至少记录一个有叙事职责的场景' });
    return out;
  }
  personalIp.scenes.forEach((scene, index) => {
    for (const field of SCENE_FIELDS) {
      if (typeof scene?.[field] !== 'string' || scene[field].trim().length < 3) {
        out.push({ level: 'warn', text: `personalIp.scenes[${index}].${field} 为空或过短` });
      }
    }
  });
  return out;
}

export default {
  id: 'personal-ip',
  category: '个人 IP',
  run(project, ctx) {
    const hasAssets = ipAssetsPresent(project, ctx);
    const since = ctx.config.checks?.personalIp?.since || null;
    const out = [];

    // 1) 待发布包 manifest
    const pendingDir = path.join(project.root, 'publish', '待发布');
    for (const name of ctx.fs.listDir(pendingDir)) {
      const dir = path.join(pendingDir, name);
      if (!ctx.fs.isDir(dir)) continue;
      const manifestFile = path.join(dir, 'manifest.json');
      if (!ctx.fs.exists(manifestFile)) continue;
      let manifest = null;
      try {
        manifest = JSON.parse(ctx.fs.readText(manifestFile));
      } catch {
        continue; // 由 publish-package 检查报错
      }
      const required = manifest.schemaVersion === '1.1' && hasAssets;
      const rel = path.relative(project.root, dir);
      for (const p of validateManifestDecision(manifest.productionChecks?.personalIp, { required })) {
        out.push({ level: p.level, title: `${rel}：${p.text}`, action: '按 PERSONAL_IP_SYSTEM.md 补写 IP 决策与镜头证据' });
      }
    }

    // 2) 内容包内的决策记录
    if (!hasAssets) return out;
    for (const dir of ctx.fs.topicDirs(project)) {
      const date = topicDateFromDir(dir);
      if (since && date && date < since) continue;
      if (!ctx.inScope(date)) continue;
      const storyboard = path.join(dir, 'storyboard.md');
      if (!ctx.fs.exists(storyboard)) continue;
      if (readDecision(dir, ctx)) continue;
      out.push({
        level: 'warn',
        title: `${ctx.fs.rel(project, dir)} 未记录个人 IP 决策（used / static / omitted）`,
        action: '在 storyboard.md 或 review-log.md 写明决策与编辑理由；used 需给出时间码与落定帧',
      });
    }
    return out;
  },
};
