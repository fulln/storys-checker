// 检查：面板自检（全局）—— config.json 里是否有未匹配任何项目的功能条目
import path from 'node:path';

export default {
  id: 'config-self',
  category: '面板自检',
  global: true,
  run(_project, ctx) {
    const data = ctx.fs.readJson(path.join(ctx.STATE_DIR, 'data.json'));
    if (!data?.features) return [];
    const out = [];
    for (const f of data.features) {
      if (!(f.usedBy || []).length) {
        out.push({ level: 'warn', title: `功能「${f.name}」未匹配任何项目`, detail: '检查 config.json 里该功能的 detect 规则', action: '修改 config.json 后重新扫描' });
      }
    }
    return out;
  },
};
