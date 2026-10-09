// 检查：script-review.html 是否缺失/过期
//
// 关键前提：审阅页由项目里的构建脚本从 script.md 的某个固定小节生成
// （常见是 `## 口播稿`）。仅当 script.md 确实包含该小节时才要求审阅页存在，
// 否则说明这个内容包用的是另一套 script 约定（例如系列稿用 `## 口播文案`），
// 强行要求审阅页只会产生误报。
//
// 配置：
//   checks.scriptReview.requiredSection  小节标题，默认 "## 口播稿"
//   checks.scriptReview.builder          构建脚本路径，默认 scripts/build-script-review-html.mjs
import path from 'node:path';

export default {
  id: 'script-review',
  category: '门禁产物',
  run(project, ctx) {
    const cfg = ctx.config.checks?.scriptReview || {};
    const builder = cfg.builder || 'scripts/build-script-review-html.mjs';
    const requiredSection = cfg.requiredSection || '## 口播稿';
    if (!ctx.fs.exists(path.join(project.root, builder))) return [];

    const out = [];
    const otherConvention = [];
    for (const dir of ctx.fs.topicDirs(project)) {
      if (!ctx.inScope(ctx.fs.topicDate(dir))) continue;
      const script = path.join(dir, 'script.md');
      if (!ctx.fs.exists(script)) continue;

      if (!ctx.fs.readText(script).includes(requiredSection)) {
        otherConvention.push(ctx.fs.rel(project, dir));
        continue;
      }

      const html = path.join(dir, 'script-review.html');
      if (!ctx.fs.exists(html) || ctx.fs.mtime(html) < ctx.fs.mtime(script)) {
        out.push({
          level: 'warn',
          title: `${ctx.fs.rel(project, dir)} 的 script-review.html 缺失或过期`,
          detail: '口播已改但审阅页未同步',
          action: `node ${builder}`,
          fixId: 'script-review',
          fixArg: ctx.fs.rel(project, script),
        });
      }
    }

    if (otherConvention.length) {
      out.push({
        level: 'info',
        title: `${otherConvention.length} 个 script.md 未使用「${requiredSection}」小节，无对应审阅页`,
        detail: `${otherConvention.slice(0, 8).join('\n')}${otherConvention.length > 8 ? `\n… 另有 ${otherConvention.length - 8} 项` : ''}\n构建脚本只识别「${requiredSection}」，这些内容包用的是另一套约定，已跳过检查`,
        action: `如它们也需要审阅页：统一小节标题，或改 checks.scriptReview.requiredSection`,
      });
    }
    return out;
  },
};
