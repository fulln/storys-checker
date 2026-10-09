# 贡献指南

## 开发约束

- **零运行时依赖**：只用 Node 内置模块。新增第三方依赖需要先说清为什么不能用内置能力实现。
- **引擎与配置分离**：项目、能力、检查项、门禁、修复命令都应通过 `config.json` 表达。
  只有「新增一类检测能力」才需要改 `scan.mjs` / `checks.mjs`。
- **检查只判断客观事实与结构**：不评价创意、文案好坏或镜头美感；涉及事实、日期、来源、授权一律留给人工。
- **新增检查 = 新增一个文件**：`checks/<id>.mjs` 导出 `{ id, category, run(project, ctx) }`，丢进去即自动被发现。
  参考 `checks/timing.mjs`（逐包 + 自动修复）、`checks/publish-package.mjs`（结构校验）、
  `checks/config-self.mjs`（全局检查）。
- **逐包检查要遵守范围**：遍历内容包时先判断 `ctx.inScope(ctx.fs.topicDate(dir))`，
  否则上百个历史包会把面板刷满。
- **同类问题要聚合**：如果一个问题可能在几十个内容包上同时出现，按项目聚合成一条 finding，
  明细放进 `detail`（参考 `checks/daily-review.mjs`）。
- 前端保持无框架：`index.html` + `app.js` + `style.css`，由 `data.json` 驱动。

## 本地验证

```bash
npm run demo                 # 示例项目应当 0 error / 0 warn
npm test                     # HTTP 安全边界与公开导出的回归测试
node checks.mjs --config config.example.json
node --check app.js && node --check checks.mjs
```

提交前请确认 `npm run demo` 的健康分不下降，且没有新增 error。

## 提交信息

用一句话说清「改了什么、为什么」。涉及检查规则的改动，请在描述里贴出前后对比的检查输出。

## 文档

- `docs/UIUX.md` 是本面板自己的 UI/UX 规范，改前端请先读它。
- `docs/README.md` 列出公开工具文档。
- 示例媒体使用文本占位文件；引入真实素材时须记录来源、许可证与再分发条件。
- 本项目支持 macOS / Linux。Windows 尚未验证，shell 命令和进程组控制存在平台差异。
- 安全问题按 `SECURITY.md` 报告。
