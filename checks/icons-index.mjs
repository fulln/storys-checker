// 检查：图标索引 icon-library.json 是否过期
import path from 'node:path';

export default {
  id: 'icons-index',
  category: '素材',
  run(project, ctx) {
    const { fs } = ctx;
    if (!fs.exists(path.join(project.videoDir, 'scripts/index-icons.mjs'))) return [];
    const idx = path.join(project.videoDir, 'src/data/icon-library.json');
    const iconsDir = path.join(project.videoDir, 'public/icons');
    if (!fs.exists(idx)) {
      return [{ level: 'warn', title: '缺 icon-library.json 索引', action: 'npm run icons:index', fixId: 'icons-index' }];
    }
    if (fs.newestInDir(iconsDir) > fs.mtime(idx)) {
      return [{ level: 'warn', title: 'icon-library.json 索引过期', detail: '图标目录比索引新', action: 'npm run icons:index', fixId: 'icons-index' }];
    }
    return [];
  },
};
