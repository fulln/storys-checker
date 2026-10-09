// 检查：BGM 库引用的音频文件是否真实存在
//
// 关键区分：目录里可能保留着历史曲目条目，其文件早已清理，也不再有成片引用——
// 把这类条目一律判为 error 会让健康分长期被历史债务压住。
// 因此只在曲目**真正被使用**（当前选择，或检查范围内的成片引用了它）时判 error，
// 否则降为 info。可用 config.checks.bgmFiles.mode = "all" 恢复为全量 error。
import path from 'node:path';

function collectInUseIds(project, ctx, ids) {
  // 对每个曲目 id 直接做文本包含匹配：比「抽取所有字符串字面量」更可靠
  // （不会漏掉 composition 里以常量、模板或属性方式引用的 id）。
  // 只统计「仍在检查范围内」的成片。
  const epsDir = path.join(project.videoDir, 'src', 'episodes');
  const cutoffMs = ctx.scope ? Date.parse(`${ctx.scope}T00:00:00`) : null;
  const recent = new Set();
  for (const ep of ctx.fs.listDir(epsDir)) {
    const epDir = path.join(epsDir, ep);
    if (!ctx.fs.isDir(epDir)) continue;
    if (cutoffMs && ctx.fs.mtime(epDir) < cutoffMs) continue;
    for (const file of ctx.fs.listDir(epDir)) {
      if (!/\.(tsx|ts)$/.test(file)) continue;
      const text = ctx.fs.readText(path.join(epDir, file));
      for (const id of ids) if (text.includes(id)) recent.add(id);
    }
  }
  return recent;
}

export default {
  id: 'bgm-files',
  category: '音乐',
  run(project, ctx) {
    const { fs } = ctx;
    const lib = fs.readJson(path.join(project.videoDir, 'src/data/bgm-library.json'));
    if (!lib) return [];

    const mode = ctx.config.checks?.bgmFiles?.mode || 'in-use';
    const sel = fs.readJson(path.join(project.videoDir, 'src/data/soundtrack-selection.json')) || {};
    const selected = new Set([sel.bgmId, sel.stingerId, sel.hookStingerId].filter(Boolean));
    const catalogIds = [
      ...(lib.tracks || []).map((t) => t.id),
      ...(lib.stingers || []).map((s) => s.id),
    ].filter(Boolean);
    const used = mode === 'all' ? null : collectInUseIds(project, ctx, catalogIds);

    const entries = [
      ...(lib.tracks || []).map((t) => ({ ...t, kind: 'BGM' })),
      ...(lib.stingers || []).map((s) => ({ ...s, kind: '转折音效' })),
    ];

    const out = [];
    for (const entry of entries) {
      if (fs.exists(path.join(project.videoDir, 'public', entry.file))) continue;
      const isSelected = selected.has(entry.id);
      const isUsed = mode === 'all' || (used && used.has(entry.id));

      if (isSelected) {
        out.push({
          level: 'error',
          title: `${entry.kind}文件缺失（当前选择）：${entry.file}`,
          detail: `soundtrack-selection.json 选中了 ${entry.id}，但没有对应音频文件，成片无法渲染`,
          action: '补充音频文件，或重新选择 BGM（npm run bgm:select）',
        });
      } else if (isUsed) {
        out.push({
          level: 'error',
          title: `${entry.kind}文件缺失（成片引用）：${entry.file}`,
          detail: `检查范围内的成片引用了 ${entry.id}，但音频文件不存在`,
          action: '补充音频文件，或改用现有曲目（npm run bgm）',
        });
      } else {
        out.push({
          level: 'info',
          title: `历史${entry.kind}条目缺文件：${entry.file}`,
          detail: `未被当前选择或检查范围内的成片引用；如需复用请先补文件`,
        });
      }
    }
    return out;
  },
};
