// 检查：待发布包完整性与一致性
//
// 不同项目的发布包约定可以完全不同（封面数量、清单文件名、哈希字段名、目录命名规则），
// 因此这里完全由配置驱动：config.checks.publishPackage.defaults 提供通用默认值，
// overrides[<项目 id>] 覆盖它，设为 false 表示该项目不检查。
//
// 本检查只做**零依赖静态校验**：固定文件、manifest 字段、哈希是否与实体一致。
// 编码 / 分辨率 / 时长等媒体层校验交给各项目自带的校验脚本（如 ffprobe）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULTS = {
  pendingDir: 'publish/待发布',
  dirPattern: '^\\d{4}-\\d{2}-\\d{2}-.+',
  requiredFiles: ['video.mp4', 'cover-douyin-3x4.png', 'cover-wechat-6x7.png', '发布信息.md', '来源与核对.md', 'manifest.json'],
  minDocuments: [
    { file: '发布信息.md', minBytes: 80 },
    { file: '来源与核对.md', minBytes: 80 },
  ],
  manifest: {
    file: 'manifest.json',
    status: { field: 'status', equals: 'pending' },
    version: { field: 'version', pattern: '^v\\d{2}$' },
    requiredFields: ['id', 'publishDate', 'targetDate', 'title', 'composition'],
    assets: [
      { key: 'video', value: 'video.mp4' },
      { key: 'douyinCover', value: 'cover-douyin-3x4.png' },
      { key: 'wechatCover', value: 'cover-wechat-6x7.png' },
      { key: 'publishCopy', value: '发布信息.md' },
      { key: 'sources', value: '来源与核对.md' },
    ],
    hashesField: 'sha256',
    hashFiles: ['video.mp4', 'cover-douyin-3x4.png', 'cover-wechat-6x7.png'],
    engagement: true,
    personalIpRequiredForSchema: '1.1',
  },
};

const ENGAGEMENT_GOALS = ['follow', 'series', 'article', 'profile'];

const sha256 = (file) => {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
};
const size = (file) => {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
};

const deepMerge = (base, over) => {
  if (over === false || over === null) return over;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in base ? deepMerge(base[k], v) : v;
  return out;
};

function resolveProfile(config, projectId) {
  const cfg = config.checks?.publishPackage || {};
  const merged = deepMerge({ ...DEFAULTS, ...(cfg.defaults || {}) }, cfg.overrides?.[projectId] ?? {});
  return merged === false || merged === null ? null : merged;
}

function validateManifest(manifest, m) {
  const problems = [];
  if (m.status) {
    const value = manifest[m.status.field];
    if (m.status.equals != null && value !== m.status.equals) {
      problems.push({ level: 'error', text: `${m.status.field} 必须为 ${m.status.equals}（当前 ${value ?? '缺失'}）` });
    }
    if (m.status.oneOf && !m.status.oneOf.includes(value)) {
      problems.push({ level: 'error', text: `${m.status.field} 必须为 ${m.status.oneOf.join(' / ')}（当前 ${value ?? '缺失'}）` });
    }
  }
  if (m.version && !new RegExp(m.version.pattern).test(manifest[m.version.field] ?? '')) {
    problems.push({ level: 'warn', text: `${m.version.field} 必须匹配 ${m.version.pattern}` });
  }
  for (const field of m.requiredFields || []) {
    if (!manifest[field]) problems.push({ level: 'warn', text: `manifest 缺少字段：${field}` });
  }
  for (const { key, value: expected } of m.assets || []) {
    const actual = manifest.assets?.[key];
    if (actual !== expected) problems.push({ level: 'warn', text: `manifest.assets.${key} 应为 ${expected}（当前 ${actual ?? '缺失'}）` });
  }

  if (m.engagement) {
    const engagement = manifest.engagement;
    if (!engagement) {
      problems.push({ level: 'warn', text: 'manifest 缺少 engagement（首个评论 / 下期承诺 / 主页动作 / 回复方向）' });
    } else {
      if (!ENGAGEMENT_GOALS.includes(engagement.primaryGoal)) {
        problems.push({ level: 'warn', text: `manifest.engagement.primaryGoal 必须为 ${ENGAGEMENT_GOALS.join('、')}` });
      }
      for (const field of ['firstComment', 'nextEpisodePromise', 'profileAction']) {
        if (typeof engagement[field] !== 'string' || engagement[field].trim().length < 4) {
          problems.push({ level: 'warn', text: `manifest.engagement.${field} 为空或过短` });
        }
      }
      if (!Array.isArray(engagement.replyPrompts) || engagement.replyPrompts.length < 2) {
        problems.push({ level: 'warn', text: 'manifest.engagement.replyPrompts 至少需要两类回复方向' });
      } else {
        engagement.replyPrompts.forEach((prompt, index) => {
          if (!prompt?.trigger?.trim()) problems.push({ level: 'warn', text: `replyPrompts[${index}].trigger 不能为空` });
          if (typeof prompt?.intent !== 'string' || prompt.intent.trim().length < 4) {
            problems.push({ level: 'warn', text: `replyPrompts[${index}].intent 为空或过短` });
          }
        });
      }
    }
  }

  if (m.personalIpRequiredForSchema && String(manifest.schemaVersion) === m.personalIpRequiredForSchema && !manifest.productionChecks?.personalIp) {
    problems.push({ level: 'error', text: `schemaVersion ${m.personalIpRequiredForSchema} 缺少 productionChecks.personalIp` });
  }
  return problems;
}

export default {
  id: 'publish-package',
  category: '发布包',
  run(project, ctx) {
    const profile = resolveProfile(ctx.config, project.id);
    if (!profile) return [];
    const pendingDir = path.join(project.root, profile.pendingDir);
    if (!ctx.fs.isDir(pendingDir)) return [];

    const out = [];
    for (const name of ctx.fs.listDir(pendingDir)) {
      const dir = path.join(pendingDir, name);
      if (!ctx.fs.isDir(dir)) continue;
      const rel = path.relative(project.root, dir);

      if (profile.dirPattern && !new RegExp(profile.dirPattern).test(name)) {
        out.push({ level: 'warn', title: `${rel} 目录名不符合 ${profile.dirPattern}`, action: '重命名待发布包目录，便于发布记录与复盘对齐' });
      }

      const missing = (profile.requiredFiles || []).filter((f) => !ctx.fs.exists(path.join(dir, f)) || size(path.join(dir, f)) === 0);
      if (missing.length) {
        out.push({
          level: 'error',
          title: `${rel} 发布包不完整：缺 ${missing.join('、')}`,
          detail: `按项目约定应包含：${(profile.requiredFiles || []).join('、')}`,
          action: '补齐或重建发布包',
        });
        continue;
      }

      const m = profile.manifest;
      let manifest = null;
      if (m) {
        const manifestFile = path.join(dir, m.file || 'manifest.json');
        if (!ctx.fs.exists(manifestFile)) {
          out.push({ level: 'error', title: `${rel} 缺 ${m.file || 'manifest.json'}` });
          continue;
        }
        try {
          manifest = JSON.parse(ctx.fs.readText(manifestFile));
        } catch (error) {
          out.push({ level: 'error', title: `${rel} ${m.file || 'manifest.json'} 无法解析`, detail: String(error.message || error) });
          continue;
        }
        const problems = validateManifest(manifest, m);
        const hashes = manifest[m.hashesField] || {};
        for (const file of m.hashFiles || []) {
          if (!/^[a-f0-9]{64}$/.test(hashes[file] ?? '')) {
            problems.push({ level: 'error', text: `${m.hashesField}.${file} 缺失或不是 64 位十六进制` });
            continue;
          }
          if (sha256(path.join(dir, file)) !== hashes[file]) {
            problems.push({ level: 'error', text: `${file} 哈希与 manifest 不一致（文件已变更，需重建发布包版本）` });
          }
        }
        for (const p of problems) {
          out.push({ level: p.level, title: `${rel}：${p.text}`, action: '修正发布包或按项目脚本重新构建' });
        }
        if (problems.length) continue;
      }

      for (const { file, minBytes } of profile.minDocuments || []) {
        if (size(path.join(dir, file)) < minBytes) {
          out.push({ level: 'warn', title: `${rel} ${file} 内容过短（< ${minBytes} 字节）`, action: '补齐发布文案或来源核对说明' });
        }
      }

      if (!out.some((f) => f.title.startsWith(rel))) {
        out.push({
          level: 'info',
          title: `${rel} 发布包静态校验通过${manifest?.version ? `（${manifest.version}）` : ''}`,
          detail: '媒体层（编码/分辨率/帧率/时长）请运行项目自带的发布包校验脚本',
        });
      }
    }
    return out;
  },
};
