// 检查：素材授权记录
import path from 'node:path';

export default {
  id: 'attribution',
  category: '素材',
  run(project, ctx) {
    if (!ctx.fs.exists(path.join(project.videoDir, 'public/ATTRIBUTION.md'))) {
      return [{ level: 'warn', title: '缺 public/ATTRIBUTION.md', detail: '外部素材与授权来源未登记', action: '补充素材授权记录' }];
    }
    return [];
  },
};
