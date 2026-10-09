// scan.mjs — 扫描引擎（无第三方依赖，纯 Node 内置模块）
// 迭代方式：项目清单、脚本分组、功能清单都在 config.json 里维护；
// 工作流门禁从各项目根目录的 *WORKFLOW*.md 自动发现，不需要改代码。
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { ensureStateDir, stateFile } from './lib/paths.mjs';

const ROOT = process.cwd();

const config = loadConfig({ root: ROOT });
const PROJECTS = config.projects;
const WORKFLOW_PATTERNS = config.workflowPatterns || ['WORKFLOW'];
const SCRIPT_GROUPS = config.scriptGroups || [];
const FEATURES = config.features || [];

const exists = (p) => {
  try {
    return fs.existsSync(p);
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
const bytes = (n) => {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

// ---------- 文档 ----------
function extractDoc(p) {
  const text = readText(p);
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  const title = (lines.find((l) => /^#\s+/.test(l)) || '').replace(/^#\s+/, '').trim();
  let summary = '';
  for (const l of lines) {
    const t = l.trim();
    if (!t || /^#{1,6}\s/.test(t) || /^```/.test(t) || /^[-*>]/.test(t) || /^\|/.test(t)) continue;
    if (t === title) continue;
    summary = t;
    break;
  }
  if (summary.length > 220) summary = summary.slice(0, 220) + '…';
  return { title: title || path.basename(p), summary, rel: p, file: path.basename(p) };
}

function collectDocs(...dirs) {
  const out = [];
  const seen = new Set();
  for (const dir of dirs) {
    for (const f of listDir(dir)) {
      if (!f.endsWith('.md')) continue;
      if (seen.has(f)) continue;
      seen.add(f);
      const doc = extractDoc(path.join(dir, f));
      if (doc) out.push(doc);
    }
  }
  return out;
}

// ---------- Root.tsx ----------
function parseRoot(rootFile) {
  const text = readText(rootFile);
  const compositions = [];
  const stills = [];
  const folders = [];
  let m;
  const reComp = /<Composition\s+id="([^"]+)"\s+component=\{([^}]+)\}/g;
  const reStill = /<Still\s+id="([^"]+)"\s+component=\{([^}]+)\}/g;
  const reFolder = /<Folder\s+name="([^"]+)">/g;
  while ((m = reComp.exec(text))) compositions.push({ id: m[1], component: m[2] });
  while ((m = reStill.exec(text))) stills.push({ id: m[1], component: m[2] });
  while ((m = reFolder.exec(text))) folders.push({ name: m[1] });
  return { compositions, stills, folders };
}

// ---------- npm scripts 分组（分组规则来自 config.json） ----------
function groupScripts(scripts) {
  const grouped = {};
  const keys = SCRIPT_GROUPS.map((g) => g.key);
  for (const [name, cmd] of Object.entries(scripts || {})) {
    const g = SCRIPT_GROUPS.find((x) => new RegExp(x.match).test(name));
    const key = g ? g.key : '其他';
    (grouped[key] ||= []).push({ name, cmd });
  }
  return [...keys.filter((k) => grouped[k]), ...(grouped['其他'] ? ['其他'] : [])].map((k) => ({
    group: k,
    items: grouped[k],
  }));
}

// ---------- BGM ----------
function parseBgmMatrix(mdPath) {
  const text = readText(mdPath);
  if (!text) return [];
  const rows = [];
  const re = /\|\s*`([a-z0-9-]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|/g;
  let m;
  while ((m = re.exec(text))) {
    rows.push({
      id: m[1],
      scene: m[2].trim(),
      gravity: m[3].trim(),
      energy: m[4].trim(),
      stinger: m[5].trim().replace(/`/g, ''),
    });
  }
  return rows;
}

function parseBgm(videoDir) {
  const lib = readJson(path.join(videoDir, 'src/data/bgm-library.json'));
  const sel = readJson(path.join(videoDir, 'src/data/soundtrack-selection.json'));
  const tracks = lib?.tracks || [];
  const stingers = lib?.stingers || [];
  const trackById = Object.fromEntries(tracks.map((t) => [t.id, t]));
  const matrix = parseBgmMatrix(path.join(videoDir, 'BGM_LIBRARY.md')).map((r) => ({
    ...r,
    name: trackById[r.id]?.name || r.id,
    description: trackById[r.id]?.description || '',
    energyLevel: trackById[r.id]?.energy ?? null,
    narrationGain: trackById[r.id]?.narrationGain ?? null,
    gapGain: trackById[r.id]?.gapGain ?? null,
  }));
  return { tracks, stingers, selection: sel || null, matrix };
}

// ---------- 工作流门禁（自动发现 *WORKFLOW*.md，通用解析） ----------
function extractSections(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^(#{2,4})\s+(.+)$/);
    if (m && !line.startsWith('```')) {
      if (cur) sections.push(cur);
      cur = { level: m[1].length, heading: m[2].trim(), content: '' };
    } else if (cur) {
      cur.content += line + '\n';
    }
  }
  if (cur) sections.push(cur);
  for (const s of sections) {
    s.content = s.content
      .replace(/```mermaid[\s\S]*?```/g, '▸ 流程图（略）')
      .replace(/```[a-zA-Z]*\n?/g, '')
      .trim();
  }
  return sections;
}

function parseWorkflowDoc(filePath) {
  const text = readText(filePath);
  if (!text) return null;
  const title = (text.match(/^#\s+(.+)$/m) || [])[1]?.trim() || path.basename(filePath);

  // 结构化门禁：### P0｜标题 这种格式（gzh 风格）
  const gates = [];
  const reGate = /^#{2,4}\s+(P\d+(?:\.\d+)?)[｜|]\s*(.+)$/gm;
  let m;
  const matches = [];
  while ((m = reGate.exec(text))) matches.push({ idx: m.index, id: m[1], title: m[2].trim() });
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end = i + 1 < matches.length ? matches[i + 1].idx : text.length;
    const body = text.slice(start, end);
    const pick = (label) => {
      const re = new RegExp(`^\\s*${label}\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\s*(?:输入|动作|产物|通过条件|###|##)\\s*[:：]|\\n\\s*#{2,4}\\s|$)`, 'm');
      return (body.match(re) || [])[1]?.trim() || '';
    };
    gates.push({ id: matches[i].id, title: matches[i].title, input: pick('输入'), action: pick('动作'), outputs: pick('产物'), pass: pick('通过条件'), raw: body.trim(), refDocs: [...new Set([...body.matchAll(/\[[^\]]*\]\(\.?\/([^)]+\.md)\)/g)].map((x) => x[1]).concat([...body.matchAll(/`([^`]*\.md)`/g)].map((x) => x[1])))] });
  }

  // 交互协议表（I0—I6）
  const interactions = [];
  const tm = text.match(/\|\s*交互\s*\|([\s\S]*?)(?=\n\s*\n|\n#{2,})/);
  if (tm) {
    for (const row of tm[1].split('\n')) {
      if (!row.includes('|')) continue;
      const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 4 && /^I\d/.test(cells[0])) {
        interactions.push({ id: cells[0], need: cells[1], returns: cells[2], next: cells[3] });
      }
    }
  }

  // 其余章节（排除门禁标题与交互协议表所在章节，避免重复）
  const sections = extractSections(text).filter(
    (s) => s.content.length > 0 && !/^P\d+[｜|]/.test(s.heading) && !s.heading.includes('标准交互协议'),
  );

  return { file: path.basename(filePath), title, gates, interactions, sections };
}

function discoverWorkflows(root, videoDir) {
  const files = new Set();
  for (const dir of [root, videoDir]) {
    for (const f of listDir(dir)) {
      if (!f.endsWith('.md')) continue;
      if (WORKFLOW_PATTERNS.some((p) => f.toUpperCase().includes(p.toUpperCase()))) files.add(path.join(dir, f));
    }
  }
  return [...files].map(parseWorkflowDoc).filter(Boolean);
}

// ---------- 功能覆盖检测（声明式规则，来自 config.json） ----------
function matchRule(p, rule) {
  if (!rule) return false;
  if (rule.always) return true;
  const checks = [];
  if (rule.component) checks.push((p.components || []).includes(rule.component));
  if (rule.componentPattern) checks.push((p.components || []).some((c) => new RegExp(rule.componentPattern).test(c)));
  if (rule.scriptFile) checks.push((p.scriptFiles || []).includes(rule.scriptFile));
  if (rule.scriptPattern) checks.push((p.scriptFiles || []).some((f) => new RegExp(rule.scriptPattern).test(f)));
  if (rule.dataFile) checks.push((p.dataFiles || []).includes(rule.dataFile));
  if (rule.npmScript) checks.push(Object.keys(p.scriptsFlat || {}).includes(rule.npmScript));
  if (rule.npmPrefix) checks.push(Object.keys(p.scriptsFlat || {}).some((n) => n.startsWith(rule.npmPrefix)));
  if (rule.rootDoc) checks.push((p.docFiles || []).some((f) => new RegExp(rule.rootDoc).test(f)));
  if (rule.rootScript) checks.push((p.rootScriptFiles || []).includes(rule.rootScript));
  if (rule.rootScriptPattern) checks.push((p.rootScriptFiles || []).some((f) => new RegExp(rule.rootScriptPattern).test(f)));
  if (rule.dir) checks.push(exists(path.join(p.root, rule.dir)));
  if (rule.hasStills) checks.push((p.stills || []).length > 0);
  return checks.length > 0 && checks.every(Boolean);
}

function computeFeatures(projects) {
  return FEATURES.map((f) => ({
    ...f,
    usedBy: projects.filter((p) => !p.missing && matchRule(p, f.detect)).map((p) => p.id),
  }));
}

// ---------- 项目扫描 ----------
function scanProject(cfg) {
  const { root, videoDir } = cfg;
  if (!exists(root)) return { ...cfg, missing: true };

  const pkg = readJson(path.join(videoDir, 'package.json')) || {};
  const src = path.join(videoDir, 'src');

  const scenes = listDir(path.join(src, 'scenes')).filter((f) => f.endsWith('.tsx'));
  const episodes = listDir(path.join(src, 'episodes')).filter((f) => isDir(path.join(src, 'episodes', f)));
  const covers = listDir(path.join(src, 'covers')).filter((f) => f.endsWith('.tsx'));
  const components = listDir(path.join(src, 'components')).filter((f) => f.endsWith('.tsx'));
  const dataFiles = listDir(path.join(src, 'data'));
  const scriptFiles = listDir(path.join(videoDir, 'scripts')).filter((f) => /\.(mjs|js|sh|py|swift)$/.test(f));
  const rootScriptFiles = listDir(path.join(root, 'scripts'));

  const rootInfo = parseRoot(path.join(src, 'Root.tsx'));
  const docs = collectDocs(root, videoDir);

  const outDir = path.join(videoDir, 'out');
  const outputs = listDir(outDir)
    .map((f) => {
      const full = path.join(outDir, f);
      let stat = null;
      try {
        stat = fs.statSync(full);
      } catch {
        /* ignore */
      }
      return { name: f, size: stat?.size ?? 0, mtime: stat?.mtimeMs ?? 0, dir: stat?.isDirectory() ?? false };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 40)
    .map((o) => ({ ...o, sizeLabel: o.dir ? '目录' : bytes(o.size) }));

  const assets = {
    icons: listDir(path.join(videoDir, 'public/icons')).filter((f) => f.endsWith('.svg')).length,
    photos: listDir(path.join(videoDir, 'public/photos')).length,
    audio: listDir(path.join(videoDir, 'public/audio')).length,
  };

  const content = listDir(path.join(root, 'content'));

  let episode = null;
  const epText = readText(path.join(src, 'data/episode.ts'));
  if (epText) {
    const sceneRe = /\{id:\s*'([^']+)',\s*durationInFrames:\s*sceneDurations\.(\w+),\s*layout:\s*'([^']+)',\s*year:\s*'([^']*)',\s*headline:\s*'([^']*)'/g;
    const sceneList = [];
    let mm;
    while ((mm = sceneRe.exec(epText))) sceneList.push({ id: mm[1], durKey: mm[2], layout: mm[3], year: mm[4], headline: mm[5] });
    episode = {
      scenes: sceneList,
      captionsCount: (epText.match(/startMs:\s*\d+/g) || []).length,
      voiceTrackCount: (epText.match(/file:\s*'[^']+'/g) || []).length,
    };
  }

  return {
    ...cfg,
    missing: false,
    meta: {
      name: pkg.name || cfg.id,
      description: pkg.description || '',
      remotion: pkg.dependencies?.remotion || pkg.dependencies?.['@remotion/cli'] || '',
    },
    docs,
    docFiles: docs.map((d) => d.file),
    scripts: groupScripts(pkg.scripts),
    scriptsFlat: pkg.scripts || {},
    compositions: rootInfo.compositions,
    stills: rootInfo.stills,
    folders: rootInfo.folders,
    scenes,
    episodes,
    covers,
    components,
    dataFiles,
    scriptFiles,
    rootScriptFiles,
    outputs,
    assets,
    content,
    episode,
    bgm: parseBgm(videoDir),
    workflows: discoverWorkflows(root, videoDir),
  };
}

// ---------- 共享项 ----------
function computeShared(projects) {
  const present = projects.filter((p) => !p.missing);
  const componentMap = {
    KoboyoIcon: '通用 SVG 图标动画（tone 滤镜 / enter / 翻转 / 修正）',
    Actor: '人物 SVG 演员（基线对齐、可见高度、入场）',
  };
  const sharedComponents = Object.entries(componentMap)
    .map(([name, note]) => ({
      name,
      note,
      inProjects: present.filter((p) => p.components.includes(`${name}.tsx`)).map((p) => p.id),
    }))
    .filter((c) => c.inProjects.length > 0);

  const stages = present
    .map((p) => {
      const s = p.components.find((c) => /Stage\.tsx$/.test(c));
      return s ? { project: p.id, file: s } : null;
    })
    .filter(Boolean);

  const scriptCounts = new Map();
  for (const p of present) {
    for (const f of p.scriptFiles) scriptCounts.set(f, (scriptCounts.get(f) || []).concat(p.id));
  }
  const scriptNote = {
    'clone-minimax-voice.mjs': '上传音频并创建 MiniMax 克隆音色',
    'preview-cloned-voice.mjs': '克隆音色试听',
    'generate-episode-voiceover.mjs': '多场景旁白合成（含逐词时间戳）',
    'generate-bgm-library.mjs': '生成原创 BGM 资产目录',
    'select-bgm.mjs': '按选题关键词输出 BGM 候选 / 写入选择',
    'verify-bgm-library.mjs': '校验 BGM 文件、时长、采样率、声道、解码',
    'rebuild-episode-timing.mjs': '由逐词结果复算时间轴 timing.generated.ts',
    'tts-timeline.mjs': 'TTS 逐词时间戳解析',
    'minimax-api.mjs': 'MiniMax API 封装',
    'verify-output.sh': '成片技术校验（ffprobe + SHA-256）',
  };
  const sharedScripts = [...scriptCounts.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([name, ids]) => ({ name, inProjects: ids, note: scriptNote[name] || '' }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { sharedComponents, stages, sharedScripts };
}

// ---------- 今日进度 ----------
// topics 级文件的用途标注（P0/P1 产出）
function roleOfTopicFile(f) {
  if (f === 'README.md') return '当日索引（发布日 / 历史日 / 阶段 / 实验）';
  if (f.includes('activity-match')) return '活动只读巡检与匹配';
  if (f.includes('selection-wave')) return 'P1 候选排序（3-5 个 exact-date）';
  return '';
}

// 解析引用文档的真实路径（workflow 里的相对引用 → 可访问路径 + 是否存在）
function resolveRef(proj, pkgDir, ref) {
  const name = path.basename(ref);
  const cands = [
    path.join(proj.root, ref),
    path.join(pkgDir, ref),
    path.join(path.dirname(pkgDir), name),
    path.join(path.dirname(path.dirname(pkgDir)), ref),
    // 视频工程（ATTRIBUTION.md 在 video/public、部分产物在 src/data）
    path.join(proj.videoDir, 'public', name),
    path.join(proj.videoDir, 'public', ref),
    path.join(proj.videoDir, 'src', 'data', name),
    path.join(proj.videoDir, ref),
    path.join(proj.videoDir, name),
  ];
  for (const c of cands) {
    try {
      if (fs.statSync(c).isFile()) return { name: ref, path: path.relative(proj.root, c), exists: true };
    } catch {
      /* ignore */
    }
  }
  return { name: ref, path: ref, exists: false };
}

// 最新周生产简报：outputs/weekly-video-review-*/周生产简报-YYYY-MM-DD.json
function findLatestBrief(root) {
  const dir = path.join(root, 'outputs');
  if (!exists(dir)) return null;
  const found = [];
  const walk = (d) => {
    for (const f of listDir(d)) {
      const full = path.join(d, f);
      try {
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (/^周生产简报-\d{4}-\d{2}-\d{2}\.json$/.test(f)) {
          const m = f.match(/(\d{4}-\d{2}-\d{2})/);
          if (m) found.push({ path: path.relative(root, full), date: m[1], file: f });
        }
      } catch {
        /* ignore */
      }
    }
  };
  walk(dir);
  found.sort((a, b) => b.date.localeCompare(a.date));
  return found[0] || null;
}

function todayStr() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function topicDirs(p) {
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
}

const fileMtime = (f) => {
  try {
    return fs.statSync(f).mtimeMs;
  } catch {
    return 0;
  }
};

function stageOf(files, reqFiles) {
  const has = (n) => files.find((f) => f.name === n)?.exists;
  const done = reqFiles.filter((n) => has(n)).length;
  const total = reqFiles.length || 1;
  if (done === 0) return { label: '候选 / 未开始', idx: 0, gateId: 'P1', pct: 0 };
  if (has('publish-package.json')) return { label: '发布准备（P12）', idx: 6, gateId: 'P12', pct: 100 };
  if (done >= total && has('script-review.html')) return { label: '待渲染 / 终检（P7-P11）', idx: 5, gateId: 'P9', pct: 88 };
  if (has('episode.json') && has('storyboard.md')) return { label: '声音 / 素材（P5-P6）', idx: 4, gateId: 'P6', pct: 70 };
  if (has('storyboard.md')) return { label: '分镜（P4）', idx: 3, gateId: 'P4', pct: 55 };
  if (has('script.md')) return { label: '口播（P3）', idx: 2, gateId: 'P3', pct: 40 };
  if (has('research.md')) return { label: '研究（P1-P2）', idx: 1, gateId: 'P2', pct: 25 };
  return { label: '进行中', idx: 1, gateId: 'P2', pct: Math.round((done / total) * 20) };
}

function collectRecent(p, todayStart) {
  const roots = [
    path.join(p.root, 'content'),
    path.join(p.videoDir, 'src'),
    path.join(p.videoDir, 'public'),
    path.join(p.videoDir, 'scripts'),
  ];
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 6 || out.length > 300) return;
    for (const f of listDir(dir)) {
      const full = path.join(dir, f);
      try {
        const st = fs.statSync(full);
        if (st.isDirectory()) {
          if (!['node_modules', '.git', 'out', 'build'].includes(f)) walk(full, depth + 1);
        } else if (st.mtimeMs >= todayStart) {
          out.push({ rel: path.relative(p.root, full), mtime: st.mtimeMs });
        }
      } catch {
        /* ignore */
      }
    }
  };
  for (const r of roots) walk(r, 0);
  for (const dir of [p.root, p.videoDir]) {
    for (const f of listDir(dir)) {
      if (!f.endsWith('.md')) continue;
      const full = path.join(dir, f);
      const t = fileMtime(full);
      if (t >= todayStart) out.push({ rel: path.relative(p.root, full), mtime: t });
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

function computeToday(projects) {
  const now = new Date();
  const date = todayStr();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const hm = (ms) => (ms ? new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');

  const perProject = [];
  for (const p of projects) {
    if (p.missing) continue;
    const reqFiles = config.checks?.requiredFiles?.[p.id] || [];
    const extraFiles = ['script-review.html', 'publish-package.json', 'review-handoff.json'];
    const allFiles = [...new Set([...reqFiles, ...extraFiles])];

    const dirs = topicDirs(p);
    const dateOf = (d) => path.basename(path.dirname(path.dirname(d)));
    const todayDirs = dirs.filter((d) => dateOf(d) === date);
    // 今天 topics 目录有活动文件（P0 已启动但未建内容包子目录）
    const todayTopicsDir = path.join(p.root, 'content', date, 'topics');
    const hasTodayTopics = isDir(todayTopicsDir) && listDir(todayTopicsDir).length > 0;
    const isToday = todayDirs.length > 0 || hasTodayTopics;
    const latestDate = todayDirs.length ? date : hasTodayTopics ? date : dirs.map(dateOf).sort().pop() || date;
    const pkgDirs = todayDirs.length ? todayDirs : dirs.filter((d) => dateOf(d) === latestDate);

    // 最新周生产简报（P0 输入：outputs/weekly-video-review-*/周生产简报-*.json）
    const brief = findLatestBrief(p.root);

    // 视频工程产物映射：gate 产物里属于视频工程的（如 src/data/episode.ts）……
    // 避免在 content 包目录里找不到而被误标红（episode.ts 实际在 video 工程）
    const videoProds = {}; // name -> 相对项目根的路径（src/data 优先）
    const markVid = (name, full) => { if (!(name in videoProds)) videoProds[name] = path.relative(p.root, full); };
    const vdata = path.join(p.videoDir, 'src', 'data');
    if (isDir(vdata)) {
      for (const f of listDir(vdata)) {
        if (!/^(episode|storyboard|research|script|review-log|soundtrack|icon)/.test(f) && !/\.(ts|json)$/.test(f) && !/\.md$/.test(f)) continue;
        markVid(f, path.join(vdata, f));
      }
    }
    const veps = path.join(p.videoDir, 'src', 'episodes');
    if (isDir(veps)) {
      for (const slug of listDir(veps)) {
        if (!isDir(path.join(veps, slug))) continue;
        for (const f of listDir(path.join(veps, slug))) markVid(f, path.join(veps, slug, f));
      }
    }

    const packages = pkgDirs.map((d) => {
      // 引用文档存在性解析：ref 是 workflow 里的相对引用，尝试 root / 内容包内 / 内容包上级目录
      const refResolved = [];
      const seenRef = new Set();
      for (const g of (p.workflows || []).flatMap((w) => w.gates || [])) {
        for (const r of g.refDocs || []) {
          if (seenRef.has(r)) continue;
          seenRef.add(r);
          refResolved.push(resolveRef(p, d, r));
        }
      }

      const files = allFiles.map((f) => {
        const full = path.join(d, f);
        const ok = exists(full);
        const t = ok ? fileMtime(full) : 0;
        return { name: f, exists: ok, mtime: t, time: hm(t) };
      });
      const required = files.filter((f) => reqFiles.includes(f.name));
      // 交接校验：review-handoff.json 是否符合 WEEKLY_REVIEW_INTEGRATION.md 交接模型
      let reviewHandoff = { exists: false, fields: {} };
      const hf = path.join(d, 'review-handoff.json');
      if (exists(hf)) {
        try {
          const h = JSON.parse(readText(hf));
          reviewHandoff = {
            exists: true,
            schemaVersion: h.schemaVersion,
            fields: {
              sourceBrief: 'sourceBrief' in h,
              sourceSha256: 'sourceSha256' in h,
              experimentId: 'experimentId' in h,
              application: 'application' in h,
            },
          };
        } catch {
          reviewHandoff = { exists: true, parseError: true, fields: {} };
        }
      }
      return {
        rel: path.relative(p.root, d),
        name: path.basename(d),
        stage: stageOf(files, reqFiles),
        files,
        requiredDone: required.filter((f) => f.exists).length,
        requiredTotal: required.length,
        reviewHandoff,
        refResolved,
        videoProds,
      };
    });

    // P0 初始化中：今天有 topics 级文件（README / activity-match / selection-wave）但尚无内容包子目录
    if (todayDirs.length === 0 && hasTodayTopics) {
      const todayFiles = listDir(todayTopicsDir)
        .filter((f) => !f.startsWith('.'))
        .map((f) => {
          const full = path.join(todayTopicsDir, f);
          const t = fileMtime(full);
          return { name: f, exists: true, mtime: t, time: hm(t), role: roleOfTopicFile(f) };
        });
      // 解析 README.md：发布日期 / 历史日期 / 当前阶段 / 周实验（P0/P1 的输入上下文）
      let p0meta = null;
      const readmeFull = path.join(todayTopicsDir, 'README.md');
      if (exists(readmeFull)) {
        const txt = readText(readmeFull);
        const pick0 = (label) => (txt.match(new RegExp(`${label}[:：]\\s*([^\\n]+)`)) || [])[1]?.trim() || '';
        p0meta = {
          publishDate: pick0('发布日期'),
          historyDate: pick0('历史日期'),
          phase: pick0('当前阶段'),
          experiment: pick0('周实验'),
        };
      }
      packages.push({
        rel: path.relative(p.root, todayTopicsDir),
        name: 'P0 初始化中（未建内容包）',
        stage: { label: '候选搜索 / P0 已启动', idx: 0, gateId: 'P1', pct: 10 },
        files: todayFiles,
        requiredDone: 0,
        requiredTotal: 0,
        reviewHandoff: { exists: false, fields: {} },
        refResolved: [],
        p0Init: true,
        p0meta,
      });
    }

    const outputsToday = (p.outputs || [])
      .filter((o) => o.mtime >= todayStart)
      .map((o) => ({ name: o.name, sizeLabel: o.sizeLabel, time: hm(o.mtime) }));

    const changedToday = collectRecent(p, todayStart).slice(0, 30).map((f) => ({ rel: f.rel, time: hm(f.mtime) }));

    perProject.push({ id: p.id, label: p.label, date, latestDate, isToday, packages, outputsToday, changedToday, brief });
  }
  return { date, perProject };
}

// ---------- 主流程 ----------
function main() {
  const projects = PROJECTS.map(scanProject);
  const shared = computeShared(projects);
  const features = computeFeatures(projects);

  const data = {
    scannedAt: new Date().toISOString(),
    generatedBy: `scan.mjs (${path.basename(config.__file || 'config.json')})`,
    configFile: path.relative(ROOT, config.__file || '') || null,
    projects,
    shared,
    features,
    today: computeToday(projects),
    stages: config.stages || [],
  };

  ensureStateDir();
  fs.writeFileSync(stateFile('data.json'), JSON.stringify(data, null, 2), 'utf8');
  const present = projects.filter((p) => !p.missing);
  console.log(`✅ 扫描完成：${present.length} 个项目 → ${path.relative(ROOT, stateFile('data.json')) || 'data.json'}`);
  console.log(`   - 今日 ${data.today.date}：${data.today.perProject.map((p) => `${p.id} ${p.packages.length} 个内容包`).join('，')}`);
  console.log(`   - 功能 ${features.length} 项（检测到覆盖：${features.map((f) => `${f.id}=${f.usedBy.join('/') || '无'}`).join(', ')}）`);
  console.log(`   - 共享组件 ${shared.sharedComponents.length} 个，共享脚本 ${shared.sharedScripts.length} 个`);
  for (const p of present) {
    const gates = p.workflows.reduce((s, w) => s + w.gates.length, 0);
    console.log(`   - ${p.id}: 工作流文档 ${p.workflows.length} 篇 / 结构化门禁 ${gates} 道`);
  }
}

main();
