// 检查：内容包必需产物是否齐全
//
// 只检查「已进入制作」的内容包，避免把仍在选题阶段的候选目录当成交付包判罚：
//   目录里存在 config.checks.requiredFilesOnlyWhen 中任意一个产物（默认
//   script.md / storyboard.md / review-log.md / publish-package.json / episode.json）
//   才要求 config.checks.requiredFiles[<项目 id>] 里的文件齐全。
//
// 未来档期（内容包日期晚于今天）的包按 info 报：制作中的包还没到分镜/复盘阶段，
// 不是缺陷；只有过去日期仍然缺产物才是真的遗留债。
//
// 不同仓库的产物约定不同（例如单期配置放在 video/src/episodes/ 而不是内容包里的
// episode.json），因此必填清单完全由配置决定，检查本身不假设任何项目结构。
import path from 'node:path';

const DEFAULT_COMMITTED_MARKERS = ['script.md', 'storyboard.md', 'review-log.md', 'publish-package.json', 'episode.json'];

export default {
  id: 'required-files',
  category: '门禁产物',
  run(project, ctx) {
    const cfg = ctx.config.checks || {};
    const required = cfg.requiredFiles?.[project.id] || [];
    const markers = cfg.requiredFilesOnlyWhen || DEFAULT_COMMITTED_MARKERS;
    if (!required.length) return [];

    const out = [];
    for (const dir of ctx.fs.topicDirs(project)) {
      const date = ctx.fs.topicDate(dir);
      if (!ctx.inScope(date)) continue;
      const at = (f) => path.join(dir, f);
      if (!markers.some((m) => ctx.fs.exists(at(m)))) continue; // 仍是候选目录

      const missing = required.filter((f) => !ctx.fs.exists(at(f)));
      if (!missing.length) continue;

      const rel = ctx.fs.rel(project, dir);
      if (ctx.isFuture(date)) {
        out.push({
          level: 'info',
          title: `${rel}（未来档期 ${date}）尚未产出：${missing.join('、')}`,
          detail: '档期在未来，属于制作中的正常状态',
        });
      } else {
        out.push({
          level: 'warn',
          title: `${rel} 缺必需产物：${missing.join('、')}`,
          action: '补齐内容包文件（见项目内的 *WORKFLOW*.md）',
        });
      }
    }
    return out;
  },
};
