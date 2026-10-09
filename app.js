// app.js — 面板渲染逻辑（无依赖）
/* global window, document */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { hour12: false });
};

const fmtMtime = (ms) => {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
};

// ---------- 数据加载 ----------
async function loadData() {
  if (window.__PANEL_DATA__) return window.__PANEL_DATA__;
  const res = await fetch('/api/data');
  return res.json();
}

// 项目显示名：来自 config.json 的 label（data.projects[].label），不硬编码任何项目
const PROJECT_LABELS = {};
const registerProjectLabels = (data) => {
  for (const p of data?.projects || []) PROJECT_LABELS[p.id] = p.label || p.id;
};
PROJECT_LABELS.panel = '面板自检';
const labelOf = (id) => PROJECT_LABELS[id] || id;

// 部署能力探测：只读模式下隐藏会执行命令 / 写文件的控件（服务端也会 403 兜底）
let CAPABILITIES = { run: true, writeFiles: true, fix: true };
const can = (name) => CAPABILITIES[name] !== false;
const readonlyBadge = () =>
  can('run') ? '' : '<span class="badge ro" title="服务以只读模式启动">只读</span>';

const projLabel = (id) => labelOf(id);

// ---------- 全局项目上下文（顶栏选择器） ----------
let selectedProject = null;

function resolveSelectedProject(data) {
  const ps = (data.projects || []).filter((p) => !p.missing);
  if (!ps.length) return null;
  const todayRunning = (data.today?.perProject || []).filter((p) => p.isToday && p.packages?.length);
  if (!selectedProject || !ps.some((p) => p.id === selectedProject)) {
    selectedProject = todayRunning[0]?.id || ps[0].id;
  }
  return selectedProject;
}

function renderTopbarSelector(data) {
  const sel = document.getElementById('topbar-proj');
  if (!sel) return;
  const ps = (data.projects || []).filter((p) => !p.missing);
  const cur = resolveSelectedProject(data);
  const todayIds = new Set((data.today?.perProject || []).filter((p) => p.isToday).map((p) => p.id));
  sel.innerHTML =
    readonlyBadge() +
    ps
      .map((p) => `<button class="proj-pill ${p.id === cur ? 'active' : ''}" data-proj-sel="${esc(p.id)}" title="${esc(p.label)}">
      <span class="proj-dot ${todayIds.has(p.id) ? 'today' : ''}"></span>${esc(projLabel(p.id))}
    </button>`)
      .join('');
}

// ---------- 渲染：总览 ----------
function renderOverview(data) {
  const pid = resolveSelectedProject(data);
  const p = (data.projects || []).find((x) => x.id === pid && !x.missing);
  if (!p) return '<div class="empty">该项目不可用</div>';

  const stats = [
    { num: p.compositions.length, label: '成片 Composition' },
    { num: p.stills.length, label: '封面 / 缩略图 Still' },
    { num: p.scenes.length, label: '独立场景' },
    { num: p.episodes.length, label: '内容期数' },
    { num: p.components.length, label: '通用组件' },
    { num: p.dataFiles.length, label: '数据文件' },
    { num: p.outputs.length, label: '最近产物' },
    { num: p.workflows.reduce((x, w) => x + (w.gates || []).length, 0), label: '结构化门禁' },
  ];

  return `
    <div class="section">
      <div class="panel-head">
        <h2 class="section-title" style="margin:0">${esc(p.label)}</h2>
        <span class="count">${pid} · Remotion ${esc(p.meta.remotion || '—')}</span>
      </div>
      <div class="grid cards-4">
        ${stats.map((s) => `<div class="card metric"><div class="m-label">${s.label}</div><div class="m-num">${s.num}</div></div>`).join('')}
      </div>
    </div>

    <div class="cols-2">
      <div class="section">
        <div class="panel-head"><span class="panel-title">健康度监控</span><span class="count">${esc(p.label)}</span></div>
        ${window.__PANEL_DATA__ ? '<div class="empty">健康监控需要本地服务器（npm start），panel.html 只提供静态快照</div>' : '<div id="overview-health"><div class="loading">加载健康数据…</div></div>'}
      </div>
      <div class="section">
        <div class="panel-head"><span class="panel-title">项目卡片</span></div>
        ${renderProjectCard(p)}
      </div>
    </div>

    <div class="cols-2">
      <div class="section">
        <div class="panel-head"><span class="panel-title">共享组件</span><span class="count">两个项目共用的底层组件</span></div>
        ${renderSharedComponents(data)}
      </div>
      <div class="section">
        <div class="panel-head"><span class="panel-title">共享脚本</span><span class="count">${data.shared.sharedScripts.length} 个</span></div>
        ${renderSharedScripts(data)}
      </div>
    </div>
  `;
}

function renderProjectCard(p) {
  const latest = (p.outputs || []).slice(0, 3);
  return `
    <div class="card">
      <h3>${esc(p.label)}</h3>
      <div class="sub">remotion ${esc(p.meta.remotion || '—')} · ${esc(p.meta.description || '')}</div>
      <div class="chips" style="margin-top:12px">
        <span class="chip"><span class="tag">Comp</span>${p.compositions.length}</span>
        <span class="chip"><span class="tag">Still</span>${p.stills.length}</span>
        <span class="chip"><span class="tag">场景</span>${p.scenes.length}</span>
        <span class="chip"><span class="tag">期数</span>${p.episodes.length}</span>
        ${p.covers.length ? `<span class="chip"><span class="tag">封面</span>${p.covers.length}</span>` : ''}
        <span class="chip"><span class="tag">图标</span>${p.assets.icons}</span>
        <span class="chip"><span class="tag">照片</span>${p.assets.photos}</span>
      </div>
      ${latest.length ? `
        <div class="sub" style="margin-top:12px">最近产物：</div>
        <ul style="margin:6px 0 0;padding-left:18px;color:#b8c2d8;font-size:12.5px">
          ${latest.map((o) => `<li><span class="mono">${esc(o.name)}</span> <span class="muted">· ${esc(o.sizeLabel)} · ${fmtMtime(o.mtime)}</span></li>`).join('')}
        </ul>` : ''}
    </div>
  `;
}

function renderSharedComponents(data) {
  const cards = data.shared.sharedComponents.map((c) => `
    <div class="card feature">
      <h3>${esc(c.name)}</h3>
      <p class="desc">${esc(c.note)}</p>
      <div class="proj-badges">${c.inProjects.map((id) => `<span class="badge comp">${esc(projLabel(id))}</span>`).join('')}</div>
    </div>`);
  const stageCards = (data.shared.stages || []).map((s) => `
    <div class="card feature">
      <h3>${esc(s.file)}</h3>
      <p class="desc">品牌舞台与安全区组件（${esc(projLabel(s.project))} 专用命名）</p>
      <div class="proj-badges"><span class="badge comp">${esc(projLabel(s.project))}</span></div>
    </div>`);
  return `<div class="grid cards-3">${cards.join('')}${stageCards.join('')}</div>`;
}

function renderSharedScripts(data) {
  const rows = data.shared.sharedScripts.map((s) => `
    <tr>
      <td class="code">${esc(s.name)}</td>
      <td>${esc(s.note || '—')}</td>
      <td>${s.inProjects.map((id) => `<span class="badge comp">${esc(projLabel(id))}</span>`).join(' ')}</td>
    </tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr><th>脚本</th><th>用途</th><th>项目</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="empty">无共享脚本</td></tr>'}</tbody></table></div>`;
}

// ---------- 渲染：项目详情 ----------
function renderProjects(data) {
  const pid = resolveSelectedProject(data);
  const p = (data.projects || []).find((x) => x.id === pid && !x.missing);
  if (!p) return '<div class="empty">该项目不可用</div>';
  return `<div id="project-detail">${renderProjectDetail(p)}</div>`;
}

function renderProjectDetail(p) {
  const chip = (tag, id, extra) => `<span class="chip"><span class="tag">${tag}</span>${esc(id)}${extra ? ` <span class="muted">${extra}</span>` : ''}</span>`;
  const chipsOf = (arr, fn) => (arr && arr.length ? arr.map(fn).join('') : '<span class="empty">无</span>');

  // 分析行
  const statRow = `<div class="grid cards-4">
    <div class="card stat small"><div class="num">${p.compositions.length}</div><div class="label">Composition</div></div>
    <div class="card stat small"><div class="num">${p.stills.length}</div><div class="label">Still</div></div>
    <div class="card stat small"><div class="num">${p.scenes.length}</div><div class="label">场景</div></div>
    <div class="card stat small"><div class="num">${p.episodes.length}</div><div class="label">期数 / 剧集</div></div>
  </div>`;

  // 主区：注册体系（Comp / Still / Folder）
  const registry =
    `<div class="cols-2">
      <div class="section">
        <div class="panel-head"><span class="panel-title">成片 Composition</span><span class="count">${p.compositions.length}</span></div>
        <div class="chips">${chipsOf(p.compositions, (c) => chip('Comp', c.id, `← ${c.component}`))}</div>
      </div>
      <div class="section">
        <div class="panel-head"><span class="panel-title">封面 / 缩略图 Still</span><span class="count">${p.stills.length}</span></div>
        <div class="chips">${chipsOf(p.stills, (c) => chip('Still', c.id, `← ${c.component}`))}</div>
        ${p.folders.length ? `<div class="chips" style="margin-top:10px">${p.folders.map((f) => chip('Folder', f.name)).join('')}</div>` : ''}
      </div>
    </div>`;

  // 主区：场景 + 期数 + 封面
  const content =
    `<div class="cols-2">
      <div class="section">
        <div class="panel-head"><span class="panel-title">场景</span><span class="count">src/scenes</span></div>
        <div class="chips">${chipsOf(p.scenes, (s) => `<span class="chip code">${esc(s)}</span>`)}</div>
      </div>
      <div class="section">
        <div class="panel-head"><span class="panel-title">内容期数</span><span class="count">src/episodes · ${p.episodes.length}</span></div>
        <div class="chips">${chipsOf(p.episodes, (e) => `<span class="chip code">${esc(e)}</span>`)}</div>
        ${p.covers.length ? `<div class="chips" style="margin-top:10px">${p.covers.map((c) => chip('封面', c)).join('')}</div>` : ''}
      </div>
    </div>`;

  // 当前单期数据（如有）
  const episodeSection = p.episode
    ? `<div class="section">
        <div class="panel-head"><span class="panel-title">当前单期数据</span><span class="count">src/data/episode.ts · ${p.episode.scenes.length} 场景 / ${p.episode.captionsCount} 字幕段 / ${p.episode.voiceTrackCount} 音轨</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>场景 id</th><th>布局</th><th>年份</th><th>标题</th></tr></thead>
          <tbody>${p.episode.scenes.map((s) => `<tr><td class="code">${esc(s.id)}</td><td>${esc(s.layout)}</td><td>${esc(s.year)}</td><td>${esc(s.headline)}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>`
    : '';

  // 辅助区：组件 / 数据 | 脚本
  const assist =
    `<div class="cols-2">
      <div class="section">
        <div class="panel-head"><span class="panel-title">通用组件 + 数据文件</span><span class="count">src/components · src/data</span></div>
        <div class="chips">${chipsOf(p.components, (c) => `<span class="chip code">${esc(c)}</span>`)}</div>
        <div class="chips" style="margin-top:10px">${chipsOf(p.dataFiles, (c) => `<span class="chip code">${esc(c)}</span>`)}</div>
      </div>
      <div class="section">
        <div class="panel-head"><span class="panel-title">脚本命令</span><span class="count">npm scripts</span></div>
        ${renderScriptGroups(p.scripts)}
      </div>
    </div>`;

  // 产物表 + 文档
  const outputsSection = `<div class="section">
    <div class="panel-head"><span class="panel-title">最近产物</span><span class="count">out/ · 最新 ${Math.min(40, p.outputs.length)} 项</span></div>
    ${renderOutputs(p.outputs)}
  </div>`;
  const docsSection = p.docs.length
    ? `<div class="section">
        <div class="panel-head"><span class="panel-title">文档</span><span class="count">${p.docs.length} 篇</span></div>
        <div class="grid cards-3">${p.docs.map((d) => `<div class="card feature"><h3 style="font-size:14px">${esc(d.title)}</h3><p class="desc">${esc(d.summary || '')}</p></div>`).join('')}</div>
      </div>`
    : '';

  return `<div class="section">
      <div class="panel-head">
        <h2 class="section-title" style="margin:0">${esc(p.label)}</h2>
        <span class="count code">${esc(p.id)}</span>
      </div>
      ${statRow}
    </div>
    ${registry}
    ${content}
    ${episodeSection}
    ${assist}
    ${outputsSection}
    ${docsSection}`;
}

function renderScriptGroups(groups) {
  return groups.map((g) => `
    <details class="panel" ${g.items.length <= 3 ? 'open' : ''}>
      <summary>${esc(g.group)} <span class="muted">(${g.items.length})</span></summary>
      <div class="body">
        <div class="table-wrap"><table>
          <thead><tr><th style="width:220px">命令</th><th>执行内容</th></tr></thead>
          <tbody>${g.items.map((i) => `<tr><td class="code">npm run ${esc(i.name)}</td><td><span class="cmd">${esc(i.cmd)}</span></td></tr>`).join('')}</tbody>
        </table></div>
      </div>
    </details>`).join('');
}

function renderOutputs(outputs) {
  if (!outputs.length) return '<div class="empty">无产物</div>';
  const rows = outputs.map((o) => {
    const isMp4 = /\.mp4$/.test(o.name);
    const isPng = /\.png$/.test(o.name);
    const kind = o.dir ? '目录' : isMp4 ? '视频' : isPng ? '图片' : '其他';
    const cls = o.dir ? 'folder' : isMp4 ? 'comp' : isPng ? 'still' : '';
    return `<tr><td class="code">${esc(o.name)}</td><td>${cls ? `<span class="badge ${cls}">${kind}</span>` : kind}</td><td class="num">${esc(o.sizeLabel)}</td><td class="muted">${fmtMtime(o.mtime)}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table><thead><tr><th>文件名</th><th>类型</th><th>大小</th><th>修改时间</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ---------- 渲染：常用功能 ----------
function renderFeatures(data) {
  const pid = resolveSelectedProject(data);
  const cats = {};
  for (const f of data.features) {
    (cats[f.cat] ||= []).push(f);
  }
  return Object.entries(cats).map(([cat, features]) => {
    const usedCount = features.filter((f) => (f.usedBy || []).includes(pid)).length;
    return `<div class="section">
      <h2 class="section-title">${esc(cat)} <span class="count">${features.length} 项 · 本项目用 ${usedCount}</span></h2>
      <div class="grid cards-3">
        ${features.map((f) => {
          const used = f.usedBy || [];
          const mine = used.includes(pid);
          return `<div class="card feature ${mine ? '' : 'not-used'}">
            <div class="cat">${esc(f.cat)}</div>
            <h3>${esc(f.name)}</h3>
            <p class="desc">${esc(f.desc)}</p>
            <div class="proj-badges">
              ${mine ? `<span class="badge mine">✓ 本项目使用中</span>` : ''}
              ${used.filter((id) => id !== pid).map((id) => `<span class="badge comp">${esc(projLabel(id))}</span>`).join('')}
              ${!used.length ? '<span class="muted" style="font-size:11px">未检测到</span>' : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

// ---------- 渲染：文档章节内容（轻量 markdown-lite） ----------
function renderDocContent(content) {
  const lines = String(content || '').split('\n');
  const blocks = [];
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    const isTable = buf.every((l) => /^\s*\|/.test(l));
    blocks.push(isTable ? { type: 'table', lines: buf } : { type: 'text', lines: buf });
    buf = [];
  };
  for (const line of lines) {
    const isTableRow = /^\s*\|.*\|\s*$/.test(line);
    const isSepRow = /^\s*\|[\s:|-]+\|\s*$/.test(line);
    const curIsTable = buf.length && /^\s*\|/.test(buf[0]);
    if (isTableRow && !isSepRow) {
      if (buf.length && !curIsTable) flush();
      buf.push(line);
    } else {
      if (curIsTable) flush();
      buf.push(line);
    }
  }
  flush();
  return blocks
    .map((b) => {
      if (b.type === 'table') {
        const rows = b.lines.map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
        const head = rows[0];
        const body = rows.slice(1);
        return `<div class="table-wrap" style="margin:8px 0"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      }
      return `<pre class="doc-pre">${esc(b.lines.join('\n'))}</pre>`;
    })
    .join('');
}

// ---------- 渲染：工作流门禁（自动发现 *WORKFLOW*.md） ----------
function renderWorkflow(data) {
  const pid = resolveSelectedProject(data);
  const p = (data.projects || []).find((x) => x.id === pid && !x.missing && (x.workflows || []).length);
  if (!p) return '<div class="empty">该项目未发现工作流文档</div>';
  const docs = p.workflows
        .map((w) => {
          const gates = w.gates || [];
          const interactions = w.interactions || [];
          const sections = w.sections || [];
          return `
          <div class="card" style="margin-bottom:14px">
            <h3>${esc(w.file)} <span class="muted" style="font-weight:400">· ${esc(w.title)}</span></h3>
            ${gates.length ? `
              <div style="margin-top:10px">
                ${gates.map((g) => `
                  <details class="gate" style="margin-top:2px">
                    <summary><span class="arrow">▶</span><span class="badge p">${esc(g.id)}</span> ${esc(g.title)}</summary>
                    <div class="gate-body">
                      ${g.input ? `<div class="kv"><div class="k">输入</div><div class="v">${esc(g.input)}</div></div>` : ''}
                      ${g.outputs ? `<div class="kv"><div class="k">产物</div><div class="v">${esc(g.outputs)}</div></div>` : ''}
                      ${g.pass ? `<div class="kv"><div class="k">通过条件</div><div class="v">${esc(g.pass)}</div></div>` : ''}
                    </div>
                  </details>`).join('')}
              </div>` : ''}
            ${interactions.length ? `
              <div style="margin-top:12px">
                <div style="font-weight:700;color:var(--accent);font-size:12.5px;margin-bottom:6px">标准交互协议</div>
                <div class="table-wrap"><table>
                  <thead><tr><th>交互</th><th>用户最少需要提供</th><th>系统必须返回</th><th>通过后进入</th></tr></thead>
                  <tbody>${interactions.map((i) => `<tr><td><span class="badge comp">${esc(i.id)}</span></td><td>${esc(i.need)}</td><td>${esc(i.returns)}</td><td>${esc(i.next)}</td></tr>`).join('')}</tbody>
                </table></div>
              </div>` : ''}
            ${sections.length ? `
              <div style="margin-top:12px">
                ${sections.map((s) => `
                  <details class="panel" style="margin-top:8px">
                    <summary>${esc(s.heading)} <span class="muted">(${s.content.length} 字)</span></summary>
                    <div class="body">${renderDocContent(s.content)}</div>
                  </details>`).join('')}
              </div>` : ''}
          </div>`;
        })
        .join('');
  return `
    <div class="section">
      <h2 class="section-title">${esc(p.label)} <span class="count">${p.workflows.length} 篇工作流文档</span></h2>
      ${docs}
    </div>`;
}

// ---------- 渲染：脚本命令（选中项目的 npm scripts） ----------
function renderCommands(data) {
  const pid = resolveSelectedProject(data);
  const p = (data.projects || []).find((x) => x.id === pid && !x.missing);
  if (!p) return '<div class="empty">该项目不可用</div>';
  return `
    <div class="section">
      <h2 class="section-title">脚本命令 <span class="count">${esc(p.label)} · npm scripts</span></h2>
      ${renderScriptGroups(p.scripts)}
    </div>`;
}

// ---------- 渲染：BGM 库（每个项目各自的选择矩阵） ----------
function renderBgm(data) {
  const pid = resolveSelectedProject(data);
  const p = (data.projects || []).find((x) => x.id === pid && !x.missing && x.bgm);
  if (!p) return '<div class="empty">该项目无 BGM 数据</div>';
  const matrixRows = (p.bgm.matrix || []).map((r) => `
      <tr>
        <td class="code">${esc(r.id)}</td>
        <td>${esc(r.name)}</td>
        <td>${esc(r.scene)}</td>
        <td>${esc(r.gravity)}</td>
        <td>${esc(r.energy)}</td>
        <td class="code">${esc(r.stinger)}</td>
        <td><span class="muted">${r.narrationGain ?? '—'}</span> / <span class="muted">${r.gapGain ?? '—'}</span></td>
      </tr>`).join('');

    const s = p.bgm.selection;
    const selCard = !s
      ? `<div class="card feature"><h3>当前选择</h3><p class="desc">未配置 soundtrack-selection.json</p></div>`
      : `<div class="card feature">
          <h3>当前选择</h3>
          <div class="chips" style="margin-top:8px">
            <span class="chip"><span class="tag">BGM</span>${esc(s.bgmId)}</span>
            <span class="chip"><span class="tag">转折</span>${esc(s.stingerId)} @ ${esc(s.accentFrame)}f</span>
            ${s.hookStingerId ? `<span class="chip"><span class="tag">Hook</span>${esc(s.hookStingerId)} @ ${esc(s.hookAccentFrame)}f</span>` : ''}
          </div>
          ${s.reason ? `<p class="desc" style="margin-top:10px">${esc(s.reason)}</p>` : ''}
        </div>`;

    const stingerCards = (p.bgm.stingers || []).map((st) => `<span class="chip"><span class="tag">Stinger</span>${esc(st.id)} <span class="muted">${esc(st.durationSeconds)}s · gain ${esc(st.gain)}</span></span>`).join('');

  return `
    <div class="section">
      <h2 class="section-title">${esc(p.label)} · BGM 选择矩阵 <span class="count">${p.bgm.matrix.length} 条 · BGM_LIBRARY.md</span></h2>
      <div class="table-wrap"><table>
        <thead><tr><th>ID</th><th>曲目</th><th>首选场景</th><th>严肃度</th><th>能量</th><th>默认转折</th><th>增益（旁白/空隙）</th></tr></thead>
        <tbody>${matrixRows || '<tr><td colspan="7" class="empty">无</td></tr>'}</tbody>
      </table></div>
      <div class="grid cards-2" style="margin-top:14px">${selCard}</div>
      ${stingerCards ? `<div class="chips" style="margin-top:10px">${stingerCards}</div>` : ''}
    </div>`;
}

// ---------- 渲染：检查与反馈 ----------
function renderChecks() {
  const server = !window.__PANEL_DATA__;
  if (!server) {
    return `<div class="section">
      <h2 class="section-title">检查与反馈 <span class="count">需要本地服务器</span></h2>
      <div class="card"><p class="desc">静态检查会运行项目里的命令（git、文件时间戳、门禁产物），需要本地服务器。请执行：</p>
      <pre class="doc-pre">cd ~/opt/storys_checker\nnpm start\n# 打开 http://localhost:8787 → 检查反馈</pre>
      <p class="desc">或直接在终端运行 <code>node checks.mjs</code> 查看 <code>check-report.json</code>。</p></div>
    </div>`;
  }
  return `<div class="section">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <h2 class="section-title" style="margin:0">检查与反馈 <span class="count">静态门禁检查 + 安全自动修复</span></h2>
      <div style="display:flex;gap:8px">
        <button class="btn" data-check>↻ 运行检查</button>
        ${can('fix') ? '<button class="btn" data-fix="all">自动修复全部</button>' : ''}
      </div>
    </div>
    <div id="check-results" style="margin-top:14px"><div class="loading">点击「运行检查」开始…</div></div>
  </div>`;
}

function renderFinding(f) {
  const icon = `<span class="f-dot ${f.level}"></span>`;
  const cls = { error: 'error', warn: 'warn', info: 'info' }[f.level] || 'info';
  return `<div class="finding ${cls}">
    <div class="f-head">
      <span class="f-icon">${icon}</span>
      <span class="f-title">${esc(f.title)}</span>
      ${f.fixId && can('fix') ? `<button class="btn btn-fix" data-fix="${esc(f.fixId)}">修复</button>` : ''}
    </div>
    ${f.detail ? `<div class="f-detail"><pre class="doc-pre" style="margin:4px 0 0">${esc(f.detail)}</pre></div>` : ''}
    ${f.action ? `<div class="f-action muted">→ ${esc(f.action)}</div>` : ''}
  </div>`;
}

function healthColor(score, threshold) {
  const t = threshold ?? 70;
  if (score >= t) return 'var(--green)';
  if (score >= t - 15) return 'var(--gold)';
  return 'var(--warm)';
}

function renderHealthGauge(report, history, projectId) {
  const h = report.health || {};
  const d = report.delta || {};
  const threshold = h.threshold ?? 70;
  const pid = projectId && h.perProject?.[projectId] != null ? projectId : null;
  const score = pid ? (h.perProject[pid] ?? 0) : (h.global ?? 0);
  const color = healthColor(score, threshold);
  const labelOf = (id) => PROJECT_LABELS[id] || id;
  const perProject = (pid ? [[pid, h.perProject[pid]]] : Object.entries(h.perProject || {})).map(([id, s]) => `
    <div class="hp-row">
      <span class="hp-label">${esc(labelOf(id))}</span>
      <div class="hp-bar"><div class="hp-fill" style="width:${s}%;background:${healthColor(s, threshold)}"></div></div>
      <span class="hp-num">${s}</span>
    </div>`).join('');
  const trend = (history || []).slice(-40).map((r) => {
    const v = r.health?.global ?? 0;
    return `<div class="trend-bar" style="height:${Math.max(6, v)}%;background:${healthColor(v, threshold)}" title="${fmtTime(r.checkedAt)} · ${v}分"></div>`;
  }).join('');
  return `<div class="card">
    <div style="display:flex;align-items:center;gap:22px;flex-wrap:wrap">
      <div class="gauge" style="--score:${score}%;--gcolor:${color}">
        <div class="gauge-center"><span class="gauge-num" style="color:${color}">${score}</span><span class="gauge-label">健康分</span></div>
      </div>
      <div style="flex:1;min-width:200px">${perProject}</div>
    </div>
    <div style="margin-top:14px">
      <div class="muted" style="font-size:12px">阈值 ${threshold} · 较上次：新增 ${d.added ?? 0} · 已解决 ${d.resolved ?? 0} · 持续 ${d.ongoing ?? 0}${d.lastRun ? ' · 上次 ' + fmtTime(d.lastRun) : ''}</div>
      ${trend ? `<div class="trend">${trend}</div>` : ''}
    </div>
  </div>`;
}

function renderCheckReport(report, history, projectId) {
  const all = report.findings || [];
  const mine = projectId ? all.filter((f) => f.project === projectId) : all;
  const s = {
    error: mine.filter((f) => f.level === 'error').length,
    warn: mine.filter((f) => f.level === 'warn').length,
    info: mine.filter((f) => f.level === 'info').length,
    fixable: mine.filter((f) => f.fixId).length,
  };
  const healthHtml = report.health ? renderHealthGauge(report, history, projectId) : '';
  const statHtml = `<div class="grid cards-4" style="margin-bottom:16px">
    <div class="card stat small"><div class="num" style="color:var(--warm)">${s.error ?? 0}</div><div class="label">错误</div></div>
    <div class="card stat small"><div class="num" style="color:var(--gold)">${s.warn ?? 0}</div><div class="label">警告</div></div>
    <div class="card stat small"><div class="num" style="color:var(--muted)">${s.info ?? 0}</div><div class="label">提示</div></div>
    <div class="card stat small"><div class="num" style="color:var(--accent)">${s.fixable ?? 0}</div><div class="label">可自动修复</div></div>
  </div>`;
  if (!mine.length) {
    return healthHtml + statHtml + '<div class="card"><h3>✓ 全部通过</h3><p class="desc">没有发现需要处理的问题。</p></div>';
  }
  const labelOfProj = (id) => PROJECT_LABELS[id] || id;
  const byProj = {};
  for (const f of mine) (byProj[f.project] ||= []).push(f);
  const body = Object.entries(byProj).map(([proj, fs]) => {
    const byCat = {};
    for (const f of fs) (byCat[f.category] ||= []).push(f);
    const cats = Object.entries(byCat).map(([cat, items]) => `
      <div style="margin-top:12px">
        <div style="font-weight:700;color:var(--muted);font-size:12.5px;letter-spacing:.5px">${esc(cat)}</div>
        ${items.map(renderFinding).join('')}
      </div>`).join('');
    return `<div class="card" style="margin-top:12px"><h3>${esc(labelOfProj(proj))}</h3>${cats}</div>`;
  }).join('');
  return healthHtml + statHtml + body;
}

async function loadChecks() {
  const box = $('#check-results');
  if (!box) return;
  box.innerHTML = '<div class="loading">检查中…</div>';
  try {
    const res = await fetch('/api/check');
    const report = await res.json();
    if (!res.ok) throw new Error(report.error || 'check failed');
    const histRes = await fetch('/api/history');
    const history = histRes.ok ? await histRes.json() : [];
    box.innerHTML = renderCheckReport(report, history, selectedProject);
    refreshGlobalHealth();
  } catch (e) {
    box.innerHTML = `<div class="loading">检查失败：${esc(e.message)}</div>`;
  }
}

async function runFix(fixId) {
  const box = $('#check-results');
  if (box) box.innerHTML = '<div class="loading">自动修复中（可能要几秒到几十秒）…</div>';
  try {
    const res = await fetch('/api/fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fixId }) });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'fix failed');
    const fixed = result.fixed || [];
    const okCount = fixed.filter((r) => r.ok).length;
    const fixSummary = `<div class="card" style="margin-bottom:12px"><h3>修复结果：${okCount}/${fixed.length} 成功</h3>
      ${fixed.map((r) => `<div class="f-line">${r.ok ? '✓' : '✕'} <span class="code">${esc(r.cmd)}</span> <span class="muted">${esc(r.title)}</span></div>`).join('') || '<span class="muted">没有可修复项</span>'}
    </div>`;
    const histRes = await fetch('/api/history');
    const history = histRes.ok ? await histRes.json() : [];
    box.innerHTML = fixSummary + renderCheckReport(result.report, history, selectedProject);
    refreshGlobalHealth();
  } catch (e) {
    box.innerHTML = `<div class="loading">修复失败：${esc(e.message)}</div>`;
  }
}

async function loadOverviewHealth() {
  const box = $('#overview-health');
  if (!box) return;
  try {
    const repRes = await fetch('/api/health');
    const rep = repRes.status === 404 ? null : await repRes.json();
    if (!rep) {
      box.innerHTML = '<div class="empty">尚无检查报告，去「检查反馈」页运行一次检查</div>';
      return;
    }
    const histRes = await fetch('/api/history');
    const history = histRes.ok ? await histRes.json() : [];
    box.innerHTML = renderHealthGauge(rep, history, selectedProject);
  } catch (e) {
    box.innerHTML = '<div class="empty">健康数据加载失败</div>';
  }
}

// ---------- 监控：管线 + 实时进程 + 介入 ----------
function parseProgress(log) {
  const lines = String(log || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/(\d+)\s*\/\s*(\d+)/);
    if (m && +m[2] > 0) return { pct: Math.min(100, Math.round((+m[1] / +m[2]) * 100)), label: `${m[1]}/${m[2]}` };
    const p = lines[i].match(/(\d{1,3}(?:\.\d+)?)\s*%/);
    if (p) return { pct: Math.min(100, Math.round(parseFloat(p[1]))), label: `${p[1]}%` };
  }
  return null;
}

// 监控页聚焦的工程（key = projectId::pkgName）与选中的阶段
let monitorFocus = null;
let monitorStage = null;

function renderMonitor(data) {
  const server = !window.__PANEL_DATA__;
  const stages = data.stages || [];
  const t = data.today;
  const pid = resolveSelectedProject(data);

  // 该项目的工程（内容包）：今天优先，其次最近活跃的
  const engs = [];
  for (const p of (t?.perProject || []).filter((x) => x.id === pid)) {
    for (const pkg of p.packages || []) {
      engs.push({ key: `${p.id}::${pkg.name}`, project: p, pkg, isToday: p.isToday, date: p.isToday ? t.date : p.latestDate });
    }
  }
  if (!engs.length) return '<div class="section"><div class="section-title">流程监控</div><div class="empty">该项目今天还没有内容包</div></div>';

  // 包级切换（同一项目多个内容包时）；初始或焦点失效时取第一个
  if (!monitorFocus || !engs.some((e) => e.key === monitorFocus)) monitorFocus = engs[0].key;
  const eng = engs.find((e) => e.key === monitorFocus) || engs[0];

  const { project: p, pkg } = eng;
  const gateId = pkg?.stage?.gateId || 'P1';
  const stageIdx = Math.max(0, stages.findIndex((s) => s.id === gateId));
  const cur = stages[stageIdx];
  const pct = pkg?.stage?.pct ?? 0;

  // 门禁 map：每阶段 title / input / outputs / pass（来自项目 *WORKFLOW*.md）
  const gateMap = {};
  const projFull = (data.projects || []).find((x) => x.id === p.id);
  for (const w of projFull?.workflows || []) for (const g of w.gates || []) gateMap[g.id] = g;
  // 选中阶段：默认当前阶段；点击管线上的任何 P 可随时切换查看并联动快捷命令
  if (!monitorStage || !stages.some((s) => s.id === monitorStage)) monitorStage = gateId;
  const selId = monitorStage;
  const sel = stages[Math.max(0, stages.findIndex((s) => s.id === selId))];
  const selGate = gateMap[selId];
  const selQuick = can('run') ? (sel?.npm || []).map((n) => `<button class="btn btn-mini" data-run-script="${esc(n)}" data-project="${esc(p.id)}">▶ npm run ${esc(n)}</button>`).join('') : '';

  // 包切换条：仅当该项目有多个内容包时显示
  const tabs = engs.length > 1
    ? engs.map((e) => {
        const on = e.key === eng.key;
        return `<button class="eng-tab ${on ? 'active' : ''}" data-mon-focus="${esc(e.key)}">
          <span class="eng-tab-name"><span class="code">${esc(e.pkg.name)}</span></span>
          <span class="eng-tab-tag ${e.isToday ? 'today' : ''}">${e.isToday ? '今天' : '最近 ' + (e.date || '').slice(5)}</span>
        </button>`;
      }).join('')
    : '';

  const quick = selQuick;

  // ---------- 阶段工作台（四区域：输入 / 动作 / 产物 / 通过条件 + 弹窗编辑） ----------
  const relDir = pkg?.rel || '';
  const quickHint = sel?.npm?.[0] ? `npm run ${sel.npm[0]}${sel.npm[0].includes(':episode') ? ' -- ' + (pkg?.name || '') : ''}` : 'npm run render:preview -- <id>';
  const selIdx = Math.max(0, stages.findIndex((s) => s.id === selId));
  const selState = selIdx < stageIdx ? 'done' : selIdx === stageIdx ? 'current' : 'pending';
  const stateLabel = { done: '已完成', current: '进行中', pending: '未开始' }[selState];
  const gateText = selGate && (selGate.input || selGate.outputs || selGate.pass)
    ? `<div class="wb-gate">
        ${selGate.input ? `<div class="kv"><div class="k">输入</div><div class="v">${esc(selGate.input)}</div></div>` : ''}
        ${selGate.outputs ? `<div class="kv"><div class="k">产物</div><div class="v">${esc(selGate.outputs)}</div></div>` : ''}
        ${selGate.pass ? `<div class="kv"><div class="k">通过条件</div><div class="v">${esc(selGate.pass)}</div></div>` : ''}
      </div>`
    : '';

  // 竖排阶段侧栏（P0—P12 生产流水线）
  const modeLabel = { auto: '自动', decision: '决策', mixed: '人机' };
  const rail = `<aside class="stage-rail">
    <div class="rail-head">生产流水线 <span class="muted">P0—P12</span></div>
    ${stages.map((s, i) => {
      const st = i < stageIdx ? 'done' : i === stageIdx ? 'current' : 'pending';
      const isSel = s.id === selId;
      const md = modeLabel[s.mode] || '人机';
      return `<button type="button" class="rail-step ${st} ${isSel ? 'sel' : ''}" data-stage-sel="${esc(s.id)}" title="${esc(s.name)} · ${esc(md)}">
        <span class="rail-badge">${esc(s.id)}</span>
        <span class="rail-name">${esc(s.name)}</span>
        <span class="rail-mode ${s.mode}">${md}</span>
        <span class="rail-mark">${st === 'done' ? '✓' : st === 'current' ? '●' : ''}</span>
      </button>`;
    }).join('')}
  </aside>`;

  // 产物核对（联动选中阶段）
  const gateProdNames = new Set();
  if (selGate?.outputs) {
    for (const m of String(selGate.outputs).matchAll(/`([^`]+)`/g)) gateProdNames.add(m[1]);
    for (const m of String(selGate.outputs).matchAll(/\[([^\]]+)\]\([^)]+\)/g)) gateProdNames.add(m[1]);
  }
  const hasGateProd = gateProdNames.size > 0;
  const passItems = selGate?.pass ? String(selGate.pass).split(/[；;。]/).map((s) => s.trim()).filter(Boolean) : [];

  // 四区域：输入 / 动作 / 产物 / 通过条件（各占一格，产物点击弹窗编辑）
  // 文本里引用的 .md 渲染为内联可点，点击在区域下方展开实时预览
  const p0MetaHtml = pkg?.p0Init && pkg?.p0meta
    ? `<div class="p0-input">
        <div class="p0-line">发布日期 <b>${esc(pkg.p0meta.publishDate || '—')}</b> → 历史日期 <b>${esc(pkg.p0meta.historyDate || '—')}</b></div>
        ${pkg.p0meta.phase ? `<div class="p0-line muted">${esc(pkg.p0meta.phase)}</div>` : ''}
        ${pkg.p0meta.experiment ? `<div class="p0-line">周实验 <span class="code">${esc(pkg.p0meta.experiment)}</span></div>` : ''}
      </div>`
    : '';
  const inputHtml = (p0MetaHtml ? p0MetaHtml : '') + (selGate?.input ? renderPromptText(selGate.input, p.id) : p0MetaHtml ? '' : '<span class="muted">未登记</span>');
  const actionItems = String(selGate?.action || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const actionHtml = actionItems.length
    ? actionItems.map((s, i) => `<div class="act-line"><span class="act-n">${i + 1}</span><span>${renderPromptText(s, p.id)}</span></div>`).join('')
    : '<span class="muted">未登记</span>';
  const prodPaths = hasGateProd
    ? [...gateProdNames].map((n) => ({ name: n, path: `${relDir}/${n}` }))
    : (pkg?.files || []).map((f) => ({ name: f.name, path: `${relDir}/${f.name}` }));
  const prodHtml = prodPaths
    .map((f) => {
      const hit = (pkg?.files || []).find((x) => x.name === f.name);
      const vrel = (pkg?.videoProds || {})[f.name];
      // 视频工程产物：content 包里没有、但视频工程（src/data|episodes）里有 → 标注，不误标红
      if (vrel && !hit) {
        return `<button type="button" class="wb-file video ${hasGateProd ? 'stage' : ''}" data-open-editor="${esc(vrel)}" data-project="${esc(p.id)}" title="视频工程产物 · ${esc(vrel)}">✓ ${esc(f.name)}<em class="wb-tag">视频工程</em></button>`;
      }
      const ok = !!hit?.exists;
      return `<button type="button" class="wb-file ${ok ? 'ok' : 'miss'} ${hasGateProd ? 'stage' : ''}" data-open-editor="${esc(f.path)}" data-project="${esc(p.id)}" title="点击打开编辑器">${ok ? '✓' : '·'} ${esc(f.name)}<span class="muted">${hit?.time ? ' ' + esc(hit.time) : ''}</span></button>`;
    })
    .join('') || '<span class="muted">无产物登记</span>';
  const passHtml = passItems.length
    ? passItems.map((s) => `<div class="prod-line pass"><span class="p-dot"></span><span>${renderPromptText(s, p.id)}</span></div>`).join('')
    : '<span class="muted">未登记</span>';

  // 引用 / 输入文档 + 内容包文件（点击弹窗编辑；路径经 scan 解析，缺失标出）
  const pkgFileNames = new Set((pkg?.files || []).map((f) => f.name));
  const refList = (selGate?.refDocs || [])
    .map((n) => (pkg?.refResolved || []).find((r) => r.name === n))
    .filter(Boolean)
    .filter((r) => !pkgFileNames.has(r.name) && !gateProdNames.has(r.name))
    .map((r) => `<button type="button" class="wb-doc" data-open-editor="${esc(r.path)}" data-project="${esc(p.id)}" title="${r.exists ? '该阶段引用的输入 / 规范文档' : '引用缺失（未找到文件）'}">
      <span class="wb-doc-name">${esc(r.name)}</span>${r.exists ? '<span class="muted">引用</span>' : '<em class="wb-tag">缺失</em>'}
    </button>`)
    .join('') || '<span class="muted">该阶段未引用外部文档</span>';
  const pkgFilesHtml = (pkg?.files || [])
    .map((f) => `<button type="button" class="wb-file ${f.exists ? 'ok' : 'miss'}" data-open-editor="${esc(relDir + '/' + f.name)}" data-project="${esc(p.id)}" title="点击打开编辑器">${f.exists ? '✓' : '·'} ${esc(f.name)}${f.role ? `<em class="wb-tag">${esc(f.role)}</em>` : ''}<span class="muted">${f.time ? ' ' + esc(f.time) : ''}</span></button>`)
    .join('') || '<span class="muted">无文件</span>';

  // 弹窗编辑器（产物 / 文档点击后打开，MD 预览 / 编辑 / 版本）
  const edModal = `<div id="ed-modal" class="ed-modal" style="display:none">
    <div class="ed-backdrop" data-close-editor></div>
    <div class="ed-dialog">
      <div class="ed-head">
        <span class="code" id="ed-file-name" style="font-size:13px">未加载</span>
        <span class="muted" id="ed-file-path" style="font-size:11px"></span>
        <span style="flex:1"></span>
        <button class="btn btn-mini" data-wb-history>历史</button>
        <button class="btn btn-mini" data-close-editor>关闭</button>
      </div>
      <div class="wb-tabs" id="wb-tabs" style="display:none">
        <button type="button" class="wb-tab active" data-wb-mode="preview">预览</button>
        <button type="button" class="wb-tab" data-wb-mode="edit">编辑</button>
      </div>
      <div id="wb-preview" class="wb-preview md-body" style="display:none"></div>
      <textarea id="wb-editor" class="wb-textarea" placeholder="加载文件后修改，保存自动记录版本。"></textarea>
      <div class="wb-editor-actions" style="margin-top:8px">
        <span id="wb-save-msg" class="muted" style="font-size:11.5px"></span>
        <span style="flex:1"></span>
        <button class="btn" data-wb-save>保存</button>
      </div>
      <div id="wb-history" class="wb-history" style="display:none">
        <div class="wb-history-head">版本历史 <span class="muted" id="wb-history-count"></span></div>
        <div id="wb-history-list" class="wb-history-list"><div class="loading">加载中…</div></div>
      </div>
    </div>
  </div>`;

  // 交接校验：周报（P0 输入）→ review-handoff.json（WEEKLY_REVIEW_INTEGRATION.md 交接模型）
  const hf = pkg?.reviewHandoff;
  const brief = eng.project?.brief || null;
  const handoffKeys = ['sourceBrief', 'sourceSha256', 'experimentId', 'application'];
  const handoffBlock = pkg?.p0Init
    ? `<div class="handoff-check">
        <div class="handoff-title">交接校验 <span class="muted">· P0 输入前置 · WEEKLY_REVIEW_INTEGRATION.md</span></div>
        <div class="handoff-line">
          <span class="handoff-brief ${brief ? 'ok' : 'miss'}">${brief ? '✓ 周生产简报 ' + esc(brief.date) : '✕ 周生产简报未找到'}</span>
          ${brief ? `<button class="btn btn-mini" data-open-editor="${esc(brief.path)}" data-project="${esc(p.id)}">打开简报</button>` : ''}
          <span class="muted" style="font-size:11px">${brief ? esc(brief.path) : 'outputs/weekly-video-review-*/'}</span>
        </div>
        <div class="handoff-fields">
          <span class="chip ok">✓ 已启动 P0（候选 + 活动巡检落盘）</span>
          <span class="chip">等待：锁题后建内容包并生成 review-handoff.json</span>
        </div>
      </div>`
    : hf
    ? `<div class="handoff-check">
        <div class="handoff-title">交接校验 <span class="muted">· P0 输入前置 · WEEKLY_REVIEW_INTEGRATION.md</span></div>
        <div class="handoff-line">
          <span class="handoff-brief ${brief ? 'ok' : 'miss'}">${brief ? '✓ 周生产简报 ' + esc(brief.date) : '✕ 周生产简报未找到'}</span>
          ${brief ? `<button class="btn btn-mini" data-open-editor="${esc(brief.path)}" data-project="${esc(p.id)}">打开简报</button>` : ''}
          <span class="muted" style="font-size:11px">${brief ? esc(brief.path) : 'outputs/weekly-video-review-*/'}</span>
        </div>
        <div class="handoff-fields">
          ${handoffKeys.map((k) => `<span class="chip ${hf.fields[k] ? 'ok' : 'miss'}">${hf.fields[k] ? '✓' : '✕'} <span class="code">${k}</span></span>`).join('')}
          <button class="btn btn-mini" data-open-editor="${esc(relDir + '/review-handoff.json')}" data-project="${esc(p.id)}">打开 review-handoff.json</button>
        </div>
        ${hf.exists && !hf.fields.sourceBrief ? '<div class="handoff-warn">该内容包只拿到模板，未完成周报交接（review-handoff.json 缺交接字段）</div>' : ''}
      </div>`
    : '';

  // 重点卡：一句话判断 + 优先级 + 硬红线（细节折叠展开）
  const keyCard = `<div class="wb-key">
    <div class="wb-key-head">
      <span class="wb-prio p${esc(sel?.priority || '')}">${esc(sel?.priorityLabel || '')}</span>
      <span class="wb-key-summary">${esc(sel?.summary || '')}</span>
      <span style="flex:1"></span>
      <button type="button" class="wb-key-toggle" data-wb-toggle>展开完整门禁 <span class="tg">▾</span></button>
    </div>
    ${(sel?.musts || []).length ? `<div class="wb-key-musts">${sel.musts.map((m) => `<span class="must-chip">${esc(m)}</span>`).join('')}</div>` : ''}
  </div>`;

  const wb = server
    ? `<div class="stage-workbench" id="stage-detail">
        <div class="wb-head">
          <span class="badge p">${esc(sel?.id || '')}</span>
          <b>${esc(selGate?.title || sel?.name || '')}</b>
          <span class="wb-state ${selId === gateId && sel?.mode === 'decision' ? 'decision' : selState}">${selId === gateId && sel?.mode === 'decision' ? '待你决策' : stateLabel}</span>
          ${selId !== gateId ? `<span class="muted" style="font-size:11px">当前实际在 ${esc(gateId)}</span>` : ''}
          <span style="flex:1"></span>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${quick || ''}</div>
        </div>
        ${keyCard}
        ${pkg?.p0Init ? `<div class="lock-guide">
          <div class="lock-guide-title">选题决策 · 候选已就绪，等你锁题</div>
          <div class="lock-guide-line">
            ${(pkg.files || []).filter((f) => f.name.includes('selection-wave')).map((f) => `<button class="btn btn-mini" data-open-editor="${esc(relDir + '/' + f.name)}" data-project="${esc(p.id)}">打开 ${esc(f.name)}</button>`).join('')}
            <span class="muted" style="font-size:11.5px">看完候选后在弹窗里标记选中，然后建 01-topic-slug 内容包进入 P2 事实核验</span>
          </div>
        </div>` : ''}
        ${handoffBlock}
        ${(sel?.npm || []).length ? `<div class="wb-cmdbar">
          <select id="wb-cwd" class="input"><option value="video">video</option><option value="root">根目录</option></select>
          <input id="wb-cmd-input" class="input" style="flex:1;min-width:180px" placeholder="npm run …" value="${esc(quickHint)}" />
          <button class="btn" data-wb-run>▶ 运行</button>
          <button class="btn" data-wb-kill>■ 中断</button>
        </div>` : ''}
        <div class="wb-grid4 hidden" id="wb-grid">
          ${(!selGate?.input && !selGate?.action && !selGate?.outputs && !selGate?.pass) && selGate?.raw
            ? `<div class="wb-cell" style="grid-column:1/-1"><div class="wb-cell-title">门禁说明 <span class="muted">完整条款</span></div><div class="wb-cell-body wb-prose">${mdToHtml(selGate.raw)}</div></div>`
            : `<div class="wb-cell">
                <div class="wb-cell-title">输入 <span class="muted">前置</span></div>
                <div class="wb-cell-body">${inputHtml}</div>
              </div>
              <div class="wb-cell">
                <div class="wb-cell-title">动作 <span class="muted">AI 执行步骤</span></div>
                <div class="wb-cell-body">${actionHtml}</div>
              </div>
              <div class="wb-cell">
                <div class="wb-cell-title">产物 <span class="muted">点击文件编辑</span></div>
                <div class="wb-cell-body wb-file-list">${prodHtml}</div>
              </div>
              <div class="wb-cell">
                <div class="wb-cell-title">通过条件</div>
                <div class="wb-cell-body">${passHtml}</div>
              </div>`}
        </div>
        <div class="wb-lower">
          <div>
            <div class="wb-label">引用 / 输入文档 <span class="muted">· 点击弹窗编辑</span></div>
            <div class="wb-doc-list">${refList}</div>
          </div>
          <div>
            <div class="wb-label">内容包文件 <span class="muted">· 点击弹窗编辑</span></div>
            <div class="wb-file-list">${pkgFilesHtml}</div>
          </div>
        </div>
        <div class="wb-global-entry">
          <span>全局约束文档 <span class="muted">${(projFull?.docs || []).length} 篇 · AGENTS / soul / 各 SYSTEM 等</span></span>
          <span style="flex:1"></span>
          <button class="btn btn-mini" data-goto-prompts>在 Prompt 工作台管理 →</button>
        </div>
      </div>`
    : `<div class="current-stage-card" id="stage-detail">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span class="badge p">${esc(sel?.id || '')}</span>
          <b style="font-size:13.5px">${esc(selGate?.title || sel?.name || '')}</b>
          ${pkg ? `<span class="muted" style="font-size:12px">← ${esc(pkg.name)}${selId !== gateId ? ' · 当前在 ' + esc(gateId) : ''}</span>` : ''}
        </div>
        ${sel?.desc ? `<div class="muted" style="font-size:12px;margin-top:6px">${esc(sel.desc)}</div>` : ''}
        ${gateText}
      </div>`;

  const live = server
    ? `<div class="section"><div class="panel-head"><span class="panel-title">实时进程</span><span class="count">每 2 秒刷新</span></div><div id="mon-live"><div class="loading">加载中…</div></div></div>`
    : '';

  // 今日状态提示：今天有无内容包在跑
  const todayRunning = (t?.perProject || []).filter((x) => x.isToday && (x.packages || []).length);
  const todayNotice = todayRunning.length
    ? `<div class="today-notice ok">今天 ${esc(t?.date || '')} · ${todayRunning.map((x) => esc(x.label)).join('、')} ${todayRunning.length > 1 ? '在生产' : '在生产'}</div>`
    : `<div class="today-notice">今天 ${esc(t?.date || '')} 尚无新内容包 · 正在显示最近活跃：${esc(p.label)} · ${esc(eng.date)}</div>`;

  return `<div class="section">
      <div class="section-title">流程监控 <span class="count">${t?.date || ''} · 聚焦工程</span></div>
      ${todayNotice}
      ${tabs ? `<div class="eng-tabs">${tabs}</div>` : ''}
    </div>
    <div class="eng-hero">
      <div class="card">
        <div class="eng-head">
          <div class="eng-title">
            <div class="eng-label">${esc(p.label)}</div>
            <div class="eng-sub"><span class="code">${esc(pkg.name)}</span> · ${eng.isToday ? '今天 ' + esc(t.date) : '最近 ' + esc(eng.date)}</div>
          </div>
          <div class="eng-stage">
            <span class="badge p">${esc(cur?.id || '')}</span>
            <b>${esc(cur?.name || '')}</b>
            <div class="eng-pct"><div class="eng-pct-fill" style="width:${pct}%"></div></div>
            <span class="muted">${pct}%</span>
          </div>
        </div>
      </div>
      <div class="wb-layout">
        ${rail}
        ${wb}
      </div>
    </div>
    <div class="monitor-grid"><div>${live}</div></div>
    ${server ? edModal : ''}`;
}

function renderProcessList(procs) {
  const active = (procs.active || []).map((p) => {
    const elapsed = Math.max(0, Math.floor((Date.now() - p.startedAt) / 1000));
    const prog = parseProgress(p.log);
    return `<div class="proc-card running">
      <div class="proc-head">
        <span class="proc-dot"></span>
        <span class="proc-label" title="${esc(p.command)}">${esc(p.label || p.command)}</span>
        <span class="muted" style="font-size:11.5px">${esc(p.project || '')} · ${elapsed}s</span>
        ${can('run') ? `<button class="btn btn-fix" data-kill="${esc(p.id)}">■ 中断</button>` : ''}
      </div>
      ${prog ? `<div class="proc-progress"><div class="proc-progress-fill" style="width:${prog.pct}%"></div></div><div class="muted" style="font-size:11px;margin-top:4px">渲染进度 ${esc(prog.label)}</div>` : ''}
      <pre class="proc-log">${esc(p.log || '(等待输出…)')}</pre>
    </div>`;
  }).join('');
  const recent = (procs.recent || []).map((p) => {
    const dur = p.endedAt ? Math.max(0, Math.floor((p.endedAt - p.startedAt) / 1000)) : 0;
    const ok = p.status === 'done';
    const killed = p.status === 'killed';
    const icon = killed ? '■' : ok ? '✓' : '✕';
    const cls = killed ? 'killed' : ok ? 'ok' : 'fail';
    return `<div class="proc-line ${cls}">
      <span>${icon}</span>
      <span class="code" style="flex:1">${esc(p.command)}</span>
      <span class="muted" style="font-size:11px">${killed ? '已中断' : ok ? dur + 's' : dur + 's · 退出码 ' + (p.exitCode ?? '—')}</span>
    </div>`;
  }).join('');
  if (!active && !recent) return '<div class="empty">暂无进程记录</div>';
  return `${active || ''}${recent ? `<div style="margin-top:12px"><div class="muted" style="font-size:11px;margin-bottom:6px">最近完成</div>${recent}</div>` : ''}`;
}

let monitorTimer = null;
async function pollProcesses() {
  const box = $('#mon-live');
  if (!box) return;
  try {
    const r = await fetch('/api/processes');
    const procs = await r.json();
    box.innerHTML = renderProcessList(procs);
  } catch (e) {
    box.innerHTML = '<div class="empty">进程数据加载失败</div>';
  }
}
function startMonitorPoll() {
  stopMonitorPoll();
  pollProcesses();
  monitorTimer = setInterval(pollProcesses, 2000);
}
function stopMonitorPoll() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}

async function runCommand(project, command, cwd) {
  const proj = project || $('#mon-project')?.value;
  const cmd = command || $('#mon-cmd')?.value;
  const c = cwd || $('#mon-cwd')?.value || 'video';
  if (!cmd) {
    alert('请输入命令');
    return;
  }
  try {
    const res = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: proj, cwd: c, command: cmd, label: cmd }) });
    if (!res.ok) throw new Error('run failed');
    pollProcesses();
  } catch (err) {
    alert('运行失败：' + err.message);
  }
}

async function killCommand(id) {
  try {
    await fetch('/api/kill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    pollProcesses();
  } catch (err) {
    alert('中断失败：' + err.message);
  }
}

// ---------- 阶段工作台：文件加载 / 命令运行 / 日志 / 保存 ----------
let wbFilePath = null;
let wbProcId = null;
let wbLogTimer = null;
let wbIsMd = false;
let wbMode = 'edit'; // edit | preview

// 轻量 Markdown 渲染（零依赖，够用即可）
function mdInline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function mdToHtml(src) {
  const lines = String(src || '').split('\n');
  const out = [];
  let inCode = false;
  let codeBuf = [];
  let listBuf = [];
  let inTable = false;
  let tableRows = [];
  const flushList = () => {
    if (listBuf.length) {
      out.push(`<ul>${listBuf.map((x) => `<li>${x}</li>`).join('')}</ul>`);
      listBuf = [];
    }
  };
  const flushTable = () => {
    if (tableRows.length) {
      const head = tableRows[0];
      const body = tableRows.slice(1);
      out.push(`<div class="table-wrap" style="margin:8px 0"><table><thead><tr>${head.map((h) => `<th>${mdInline(h)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${mdInline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      tableRows = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      if (inCode) {
        out.push(`<pre class="doc-pre">${esc(codeBuf.join('\n'))}</pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        flushList();
        flushTable();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    if (inTable && /^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushList();
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(line.split('|').slice(1, -1).map((c) => c.trim()));
      continue;
    }
    if (inTable) {
      flushTable();
      inTable = false;
    }
    const lm = line.match(/^\s*[-*]\s+(.*)/);
    const om = line.match(/^\s*\d+\.\s+(.*)/);
    if (lm || om) {
      flushTable();
      listBuf.push(mdInline(lm ? lm[1] : om[1]));
      continue;
    }
    flushList();
    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      const lvl = hm[1].length;
      out.push(`<h${lvl}>${mdInline(hm[2])}</h${lvl}>`);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      out.push(`<blockquote>${mdInline(line.replace(/^\s*>\s?/, ''))}</blockquote>`);
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push('<hr>');
      continue;
    }
    if (!line.trim()) continue;
    out.push(`<p>${mdInline(line)}</p>`);
  }
  flushList();
  flushTable();
  if (inCode) out.push(`<pre class="doc-pre">${esc(codeBuf.join('\n'))}</pre>`);
  return out.join('');
}

function setWbMode(mode) {
  wbMode = mode;
  const tabs = $('#wb-tabs');
  const preview = $('#wb-preview');
  const editor = $('#wb-editor');
  if (!editor) return;
  if (wbIsMd) {
    if (tabs) tabs.style.display = 'flex';
    if (mode === 'preview') {
      if (preview) {
        preview.style.display = '';
        preview.innerHTML = mdToHtml(editor.value);
      }
      editor.style.display = 'none';
    } else {
      if (preview) preview.style.display = 'none';
      editor.style.display = '';
    }
    $$('.wb-tab').forEach((b) => b.classList.toggle('active', b.dataset.wbMode === mode));
  } else {
    if (tabs) tabs.style.display = 'none';
    if (preview) preview.style.display = 'none';
    editor.style.display = '';
  }
}

async function loadWbFile(path, project) {
  const txt = $('#wb-editor');
  if (!txt) return;
  txt.value = '加载中…';
  try {
    const r = await fetch(`/api/file?project=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`);
    const res = await r.json();
    if (!r.ok) throw new Error(res.error || 'load failed');
    wbFilePath = res.path;
    wbIsMd = /\.md$/i.test(res.path) || /\.markdown$/i.test(res.path);
    wbMode = wbIsMd ? 'preview' : 'edit';
    txt.value = res.content;
    setWbMode(wbMode);
    const fn = $('#ed-file-name');
    if (fn) fn.textContent = res.path.split('/').pop();
    const fp = $('#ed-file-path');
    if (fp) fp.textContent = res.path;
    const nameEl = $('#wb-file-name');
    if (nameEl) nameEl.textContent = res.path;
    const msg = $('#wb-save-msg');
    if (msg) msg.textContent = '';
  } catch (e) {
    wbFilePath = null;
    wbIsMd = false;
    txt.value = '';
    const nameEl = $('#wb-file-name');
    if (nameEl) nameEl.textContent = `加载失败：${e.message}`;
    const fn = $('#ed-file-name');
    if (fn) fn.textContent = '加载失败';
  }
}

// ---------- 弹窗编辑器（产物 / 文档点击打开） ----------
let edOpen = false;

// 把 prompt 文本里的 .md 引用渲染为内联可点（点击在区域内展开实时预览）
function renderPromptText(text, project) {
  if (!text) return '';
  let out = esc(text);
  out = out.replace(/\[([^\]]+)\]\(\.?\/([^)]+\.md)\)/g, (m, name, path) => `<button type="button" class="ref-inline" data-preview-doc="${esc(path)}" data-project="${esc(project)}">${esc(name)} ▸</button>`);
  out = out.replace(/`([^`]*\.md)`/g, (m, name) => `<button type="button" class="ref-inline" data-preview-doc="${esc(name)}" data-project="${esc(project)}">${esc(name)} ▸</button>`);
  return out.replace(/\n/g, '<br>');
}

async function openFileEditor(path, project) {
  edOpen = true;
  const m = $('#ed-modal');
  if (m) m.style.display = '';
  await loadWbFile(path, project);
}

function closeFileEditor() {
  edOpen = false;
  const m = $('#ed-modal');
  if (m) m.style.display = 'none';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && edOpen) closeFileEditor();
});

async function wbRun() {
  const proj = selectedProject;
  const cwd = $('#wb-cwd')?.value || 'video';
  const cmd = $('#wb-cmd-input')?.value.trim();
  if (!cmd) {
    alert('请输入命令');
    return;
  }
  const log = $('#wb-log');
  if (log) log.textContent = '运行中…';
  try {
    const res = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: proj, cwd, command: cmd, label: cmd }) });
    const proc = await res.json();
    wbProcId = proc.id;
    pollProcesses();
    wbLogTick();
  } catch (e) {
    if (log) log.textContent = '运行失败：' + e.message;
  }
}

async function wbLogTick() {
  if (!wbProcId) return;
  try {
    const r = await fetch('/api/processes');
    const procs = await r.json();
    const all = [...(procs.active || []), ...(procs.recent || [])];
    const found = all.find((p) => p.id === wbProcId);
    const log = $('#wb-log');
    if (!log) {
      wbProcId = null;
      return;
    }
    if (found) {
      log.textContent = found.log || '(等待输出…)';
      log.scrollTop = log.scrollHeight;
      if (found.status !== 'running') {
        const st = found.status === 'done' ? '✓ 完成' : found.status === 'killed' ? '■ 已中断' : '✕ 失败' + (found.exitCode != null ? '（' + found.exitCode + '）' : '');
        log.textContent += '\n--- ' + st + ' ---';
        wbProcId = null;
        return;
      }
    }
  } catch {
    /* ignore */
  }
  wbLogTimer = setTimeout(wbLogTick, 2000);
}

async function wbKill() {
  if (!wbProcId) return;
  try {
    await fetch('/api/kill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: wbProcId }) });
    pollProcesses();
  } catch (e) {
    alert('中断失败：' + e.message);
  }
}

async function wbSave() {
  if (!wbFilePath) {
    alert('请先点击左侧文件加载内容');
    return;
  }
  const txt = $('#wb-editor');
  try {
    const res = await fetch('/api/prompt/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: selectedProject, path: wbFilePath, content: txt?.value ?? '' }) });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || 'save failed');
    const msg = $('#wb-save-msg');
    if (msg) msg.textContent = '✓ 已保存，新版本已记录';
    loadWbHistory();
  } catch (e) {
    const msg = $('#wb-save-msg');
    if (msg) msg.textContent = '保存失败：' + e.message;
  }
}

// ---------- 版本历史 ----------
let wbHistoryOpen = false;

async function loadWbHistory() {
  if (!wbFilePath) return;
  const list = $('#wb-history-list');
  if (!list) return;
  try {
    const r = await fetch(`/api/prompt/history?project=${encodeURIComponent(selectedProject)}&path=${encodeURIComponent(wbFilePath)}`);
    const vers = await r.json();
    const count = $('#wb-history-count');
    if (count) count.textContent = vers.length ? `${vers.length} 个版本` : '';
    if (!vers.length) {
      list.innerHTML = '<div class="empty">暂无历史版本（保存过一次就会记录）</div>';
      return;
    }
    list.innerHTML = vers
      .map((v, i) => `
      <div class="wb-ver">
        <div class="wb-ver-head">
          <span class="wb-ver-time">${fmtTime(v.iso)}</span>
          <span class="muted">v${vers.length - i}${v.note ? ' · ' + esc(v.note) : ''}</span>
          <span style="flex:1"></span>
          <button class="btn btn-mini" data-wb-ver-preview="${esc(v.ts)}">查看</button>
          <button class="btn btn-mini" data-wb-ver-restore="${esc(v.ts)}">恢复此版</button>
        </div>
        <div class="wb-ver-body" data-ver="${esc(v.ts)}" style="display:none"><pre class="doc-pre">${esc(v.content.slice(0, 900))}${v.content.length > 900 ? '…' : ''}</pre></div>
      </div>`)
      .join('');
  } catch {
    list.innerHTML = '<div class="empty">历史加载失败</div>';
  }
}

function toggleWbHistory() {
  wbHistoryOpen = !wbHistoryOpen;
  const panel = $('#wb-history');
  if (panel) panel.style.display = wbHistoryOpen ? '' : 'none';
  if (wbHistoryOpen) loadWbHistory();
}

async function wbPreviewVersion(ts) {
  const body = document.querySelector(`.wb-ver-body[data-ver="${ts}"]`);
  if (body) body.style.display = body.style.display === 'none' ? '' : 'none';
}

async function wbRestoreVersion(ts) {
  const r = await fetch(`/api/prompt/history?project=${encodeURIComponent(selectedProject)}&path=${encodeURIComponent(wbFilePath)}`);
  const vers = await r.json();
  const v = vers.find((x) => String(x.ts) === String(ts));
  if (!v) return alert('版本不存在');
  const txt = $('#wb-editor');
  if (!txt) return;
  txt.value = v.content;
  wbMode = wbIsMd ? 'preview' : 'edit';
  setWbMode(wbMode);
  const msg = $('#wb-save-msg');
  if (msg) msg.textContent = '已恢复 ' + fmtTime(v.iso) + ' 的版本，确认后点保存生效';
}

// ---------- 渲染：Prompt 工作台（左侧 prompt 列表 + 右侧编辑器 + 版本） ----------
let pendingWbLoad = null; // 跨页/列表打开：{path, project}
let promptSel = null; // 当前选中的 prompt：'P0' 或 文档 rel
let promptLoadedOnce = false;

function renderPrompts(data) {
  const pid = resolveSelectedProject(data);
  const p = (data.projects || []).find((x) => x.id === pid && !x.missing);
  if (!p) return '<div class="empty">该项目不可用</div>';
  const wf = (p.workflows || [])[0];
  const wfDoc = (p.docs || []).find((x) => x.file === wf?.file);
  const gates = wf?.gates || [];
  const docs = p.docs || [];

  // 默认选中第一个阶段 prompt
  if (!promptSel || !(gates.some((g) => g.id === promptSel) || docs.some((d) => d.rel === promptSel))) {
    promptSel = gates[0]?.id || docs[0]?.rel || null;
  }

  const stageItems = gates
    .map((g) => {
      const on = g.id === promptSel;
      const actions = String(g.action || '').split('\n').map((s) => s.trim()).filter(Boolean);
      return `<button type="button" class="prompt-item ${on ? 'sel' : ''}" data-prompt-item="${esc(g.id)}" title="${esc(g.title)}">
      <span class="rail-badge">${esc(g.id)}</span>
      <span class="prompt-item-name">${esc(g.title)}</span>
      <span class="prompt-item-sub">${esc((actions[0] || g.outputs || '').slice(0, 20))}</span>
    </button>`;
    })
    .join('');
  const docItems = docs
    .map((d) => {
      const on = d.rel === promptSel;
      return `<button type="button" class="prompt-item ${on ? 'sel' : ''}" data-prompt-doc="${esc(d.rel)}" title="${esc(d.title)}">
      <span class="prompt-item-name">${esc(d.file)}</span>
      <span class="prompt-item-sub">${esc((d.title || '').slice(0, 20))}</span>
    </button>`;
    })
    .join('');

  const selGate = gates.find((g) => g.id === promptSel);
  const selDoc = docs.find((d) => d.rel === promptSel);
  const headTitle = selGate ? `${selGate.id} · ${selGate.title}` : selDoc?.file || 'Prompt';
  const headDoc = selGate ? wfDoc : selDoc;

  return `
    <div class="section">
      <div class="panel-head">
        <h2 class="section-title" style="margin:0">Prompt 工作台</h2>
        <span class="count">${esc(p.label)} · 左选 prompt，右编辑 · 保存自动记录版本，可回溯 / 恢复</span>
      </div>
    </div>
    <div class="wb-layout">
      <aside class="prompt-side">
        <div class="side-group">阶段 Prompt <span class="muted">${gates.length}</span></div>
        <div class="prompt-list">${stageItems || '<div class="empty">无结构化门禁</div>'}</div>
        <div class="side-group">全局约束 <span class="muted">${docs.length}</span></div>
        <div class="prompt-list">${docItems || '<div class="empty">无</div>'}</div>
      </aside>
      <div class="prompt-wb">
        <div class="wb-head">
          <span class="badge p">${esc(selGate?.id || 'DOC')}</span>
          <b>${esc(headTitle)}</b>
          ${selGate?.refDocs?.length ? selGate.refDocs.map((n) => `<span class="chip code">${esc(n)}</span>`).join('') : ''}
          <span style="flex:1"></span>
          ${headDoc ? `<span class="muted" style="font-size:11px">${esc(headDoc.file)}</span>` : ''}
        </div>
        ${selGate ? `<div class="wb-prompt-body" style="border-bottom:1px solid var(--border-soft)">
          ${selGate.input ? `<div class="kv"><div class="k">输入</div><div class="v">${esc(selGate.input)}</div></div>` : ''}
          ${selGate.action ? `<div class="kv"><div class="k">动作</div><div class="v">${esc(selGate.action)}</div></div>` : ''}
          ${selGate.outputs ? `<div class="kv"><div class="k">产物</div><div class="v">${esc(selGate.outputs)}</div></div>` : ''}
          ${selGate.pass ? `<div class="kv"><div class="k">通过条件</div><div class="v">${esc(selGate.pass)}</div></div>` : ''}
        </div>` : ''}
        <div class="wb-col" style="padding:12px 14px">
          <div class="wb-label">文件内容 <span class="muted">· ${esc(headDoc?.file || '')} · 在线浏览 / 编辑 · 改完保存</span></div>
          <div class="wb-tabs" id="wb-tabs" style="display:none">
            <button type="button" class="wb-tab active" data-wb-mode="preview">预览</button>
            <button type="button" class="wb-tab" data-wb-mode="edit">编辑</button>
          </div>
          <div id="wb-preview" class="wb-preview md-body" style="display:none"></div>
          <textarea id="wb-editor" class="wb-textarea" placeholder="从左侧选择 prompt 加载，修改后保存（自动记版本）。"></textarea>
          <div class="wb-editor-actions">
            <span class="code" id="wb-file-name" style="font-size:11.5px;color:var(--muted)">未加载</span>
            <span style="flex:1"></span>
            <span id="wb-save-msg" class="muted" style="font-size:11.5px"></span>
            <button class="btn" data-wb-history>历史</button>
            <button class="btn" data-wb-save>保存</button>
          </div>
          <div id="wb-history" class="wb-history" style="display:none">
            <div class="wb-history-head">版本历史 <span class="muted" id="wb-history-count"></span></div>
            <div id="wb-history-list" class="wb-history-list"><div class="loading">加载中…</div></div>
          </div>
        </div>
      </div>
    </div>`;
}

const TITLES = { monitor: '流程监控', overview: '总览', projects: '项目详情', features: '常用功能', workflow: '工作流门禁', commands: '脚本命令', bgm: 'BGM 库', prompts: 'Prompt 库', checks: '检查反馈' };

async function refreshGlobalHealth() {
  if (window.__PANEL_DATA__) return;
  try {
    const r = await fetch('/api/health');
    const el = $('#side-health');
    if (r.status === 404) {
      if (el) el.textContent = '—';
      return;
    }
    const rep = await r.json();
    const score = rep.health?.global ?? 0;
    const t = rep.health?.threshold ?? 70;
    if (el) el.textContent = score;
    const dot = $('#side-health-dot');
    if (dot) dot.style.background = healthColor(score, t);
  } catch {
    /* ignore */
  }
}

// ---------- 路由 ----------
const renderers = {
  monitor: renderMonitor,
  overview: renderOverview,
  projects: renderProjects,
  features: renderFeatures,
  workflow: renderWorkflow,
  commands: renderCommands,
  bgm: renderBgm,
  prompts: renderPrompts,
  checks: renderChecks,
};

async function fetchMeta() {
  try {
    const res = await fetch('/api/meta');
    if (res.ok) {
      const meta = await res.json();
      if (meta?.capabilities) CAPABILITIES = meta.capabilities;
      if (meta?.readonly) document.body.dataset.readonly = '1';
    }
  } catch {
    /* 静态快照（panel.html）没有服务端，保持可写默认值 */
  }
}

async function main() {
  await fetchMeta();
  const data = await loadData();
  registerProjectLabels(data);
  $('#scanned-at').textContent = `扫描于 ${fmtTime(data.scannedAt)}`;
  refreshGlobalHealth();

  const render = () => {
    const tab = location.hash.replace('#', '') || 'monitor';
    $$('.nav-item[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('#page-title').textContent = TITLES[tab] || '总览';
    renderTopbarSelector(data);
    $('#app').innerHTML = renderers[tab] ? renderers[tab](data) : renderers.overview(data);
    window.scrollTo({ top: 0 });
    if (tab === 'prompts' && !promptLoadedOnce) {
      promptLoadedOnce = true;
      const pp = (data.projects || []).find((x) => x.id === resolveSelectedProject(data));
      const wf = (pp?.workflows || [])[0];
      const d = (pp?.docs || []).find((x) => x.file === wf?.file);
      if (d) pendingWbLoad = { path: d.rel, project: pp.id };
    }
    if (pendingWbLoad) {
      const t = pendingWbLoad;
      pendingWbLoad = null;
      loadWbFile(t.path, t.project);
    }
    if (!window.__PANEL_DATA__) {
      if (tab === 'checks') loadChecks();
      else if (tab === 'overview') loadOverviewHealth();
      else if (tab === 'monitor') startMonitorPoll();
      else stopMonitorPoll();
    }
  };

  $$('.nav-item[data-tab]').forEach((b) => b.addEventListener('click', () => {
    location.hash = b.dataset.tab;
  }));

  // 实时跟踪：检测定时任务是否产出新内容（content 目录 mtime 变化 → 自动重扫刷新）
  const scannedAtMs = new Date(data.scannedAt).getTime();
  async function checkTouched() {
    if (window.__PANEL_DATA__) return;
    try {
      const r = await fetch('/api/touched');
      const t = await r.json();
      if (t.latest > scannedAtMs + 5000) {
        await fetch('/api/refresh');
        location.reload();
      }
    } catch {
      /* ignore */
    }
  }
  setInterval(checkTouched, 45000);
  $$('.nav-item[data-goto]').forEach((b) => b.addEventListener('click', () => {
    location.hash = b.dataset.goto;
  }));

  // 顶栏项目选择器：切项目 → 全局上下文，所有区块跟着变
  $('#topbar-proj').addEventListener('click', (e) => {
    const pill = e.target.closest('[data-proj-sel]');
    if (!pill) return;
    selectedProject = pill.dataset.projSel;
    monitorFocus = null;
    monitorStage = null;
    renderTopbarSelector(data);
    render();
  });

  // 事件委托：检查反馈 / 监控介入
  $('#app').addEventListener('click', (e) => {
    const stageBtn = e.target.closest('[data-stage-sel]');
    if (stageBtn) {
      monitorStage = stageBtn.dataset.stageSel;
      render();
      requestAnimationFrame(() => {
        const el = document.getElementById('stage-detail');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      return;
    }
    const monFocus = e.target.closest('[data-mon-focus]');
    if (monFocus) {
      monitorFocus = monFocus.dataset.monFocus;
      render();
      return;
    }
    if (e.target.closest('[data-check]')) return loadChecks();
    // 重点卡折叠 / 展开完整门禁
    const tg = e.target.closest('[data-wb-toggle]');
    if (tg) {
      const grid = document.getElementById('wb-grid');
      if (grid) {
        const on = grid.classList.toggle('hidden') === false;
        tg.querySelector('.tg').textContent = on ? '▴' : '▾';
      }
      return;
    }
    const fileBtn = e.target.closest('[data-file-load]');
    if (fileBtn) {
      loadWbFile(fileBtn.dataset.fileLoad, fileBtn.dataset.project);
      return;
    }
    const openEd = e.target.closest('[data-open-editor]');
    if (openEd) {
      openFileEditor(openEd.dataset.openEditor, openEd.dataset.project);
      return;
    }
    const refBtn = e.target.closest('[data-preview-doc]');
    if (refBtn) {
      openFileEditor(refBtn.dataset.previewDoc, refBtn.dataset.project);
      return;
    }
    if (e.target.closest('[data-close-editor]')) {
      closeFileEditor();
      return;
    }
    if (e.target.closest('[data-goto-prompts]')) {
      location.hash = 'prompts';
      return;
    }
    const promptEdit = e.target.closest('[data-prompt-edit]');
    if (promptEdit) {
      loadWbFile(promptEdit.dataset.promptEdit, promptEdit.dataset.project);
      return;
    }
    if (e.target.closest('[data-wb-run]')) {
      wbRun();
      return;
    }
    if (e.target.closest('[data-wb-kill]')) {
      wbKill();
      return;
    }
    if (e.target.closest('[data-wb-save]')) {
      wbSave();
      return;
    }
    if (e.target.closest('[data-wb-history]')) {
      toggleWbHistory();
      return;
    }
    const verPrev = e.target.closest('[data-wb-ver-preview]');
    if (verPrev) {
      wbPreviewVersion(verPrev.dataset.wbVerPreview);
      return;
    }
    const verRest = e.target.closest('[data-wb-ver-restore]');
    if (verRest) {
      wbRestoreVersion(verRest.dataset.wbVerRestore);
      return;
    }
    const promptItem = e.target.closest('[data-prompt-item]');
    if (promptItem) {
      promptSel = promptItem.dataset.promptItem;
      const pid2 = resolveSelectedProject(data);
      const pp2 = (data.projects || []).find((x) => x.id === pid2);
      const wf2 = (pp2?.workflows || [])[0];
      const d2 = (pp2?.docs || []).find((x) => x.file === wf2?.file);
      pendingWbLoad = d2 ? { path: d2.rel, project: pid2 } : null;
      render();
      return;
    }
    const promptDoc = e.target.closest('[data-prompt-doc]');
    if (promptDoc) {
      promptSel = promptDoc.dataset.promptDoc;
      pendingWbLoad = { path: promptDoc.dataset.promptDoc, project: selectedProject };
      render();
      return;
    }
    const wbTab = e.target.closest('[data-wb-mode]');
    if (wbTab) {
      setWbMode(wbTab.dataset.wbMode);
      return;
    }
    const fixBtn = e.target.closest('[data-fix]');
    if (fixBtn) return runFix(fixBtn.dataset.fix);
    const quick = e.target.closest('[data-run-script]');
    if (quick) return runCommand(quick.dataset.project, `npm run ${quick.dataset.runScript}`, 'video');
    const runBtn = e.target.closest('[data-run]');
    if (runBtn) return runCommand();
    const killBtn = e.target.closest('[data-kill]');
    if (killBtn) return killCommand(killBtn.dataset.kill);
  });

  window.addEventListener('hashchange', render);
  render();

  $('#refresh-btn').addEventListener('click', async () => {
    const btn = $('#refresh-btn');
    btn.disabled = true;
    btn.textContent = '扫描中…';
    try {
      if (window.__PANEL_DATA__) {
        location.reload();
        return;
      }
      const r = await fetch('/api/refresh');
      const res = await r.json();
      if (!r.ok) throw new Error(res.stderr || 'scan failed');
      location.reload();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '↻ 重新扫描';
      alert('扫描失败：' + err.message);
    }
  });
}

main().catch((e) => {
  $('#app').innerHTML = `<div class="loading">加载失败：${esc(e.message)}<br><br>请先运行 <code>node scan.mjs</code> 或 <code>npm start</code></div>`;
});
