// 检查：当前 BGM 选择是否指向存在的曲目/音效
import path from 'node:path';

export default {
  id: 'soundtrack-refs',
  category: '音乐',
  run(project, ctx) {
    const { fs } = ctx;
    const lib = fs.readJson(path.join(project.videoDir, 'src/data/bgm-library.json'));
    const sel = fs.readJson(path.join(project.videoDir, 'src/data/soundtrack-selection.json'));
    if (!lib || !sel) return [];
    const trackIds = new Set((lib.tracks || []).map((t) => t.id));
    const stingerIds = new Set((lib.stingers || []).map((s) => s.id));
    const out = [];
    if (sel.bgmId && !trackIds.has(sel.bgmId)) out.push({ level: 'error', title: `soundtrack-selection 引用不存在的 BGM：${sel.bgmId}`, action: 'npm run bgm:select 重新选择' });
    if (sel.stingerId && !stingerIds.has(sel.stingerId)) out.push({ level: 'error', title: `soundtrack-selection 引用不存在的转折音效：${sel.stingerId}`, action: '修正 soundtrack-selection.json' });
    if (sel.hookStingerId && !stingerIds.has(sel.hookStingerId)) out.push({ level: 'error', title: `soundtrack-selection 引用不存在的 hook 音效：${sel.hookStingerId}`, action: '修正 soundtrack-selection.json' });
    return out;
  },
};
