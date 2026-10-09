# Storys Checker

本地 Agent App 驱动的面板 + 检查引擎，用来**复盘和守护一条 Remotion 视频生产流水线**。

扫描你的视频项目 → 生成一张可双击打开的控制台 → 显示今天的声音/画面/门禁进度 → 跑一遍检查拿到健康分 → 拦住不合格的发布包。

- **零依赖**：只用 Node 内置模块，`git clone` 后不需要 `npm install`。
- **配置驱动**：项目清单、能力清单、检查项、门禁、修复命令都在 `config.json`，改数据不改引擎。
- **可被 Agent 驱动**：有本地命令和文件访问能力的 Agent 可以执行扫描、检查、修复和门禁，并读取结构化报告；面板用于预览和人工操作。

```bash
npm run demo      # 用自带的示例项目跑一遍
open panel.html   # 也可用 Agent App 的 HTML 预览打开生成的快照
```

---

## 目录

- [快速开始](#快速开始)
- [在本地 Agent App 中使用](#在本地-agent-app-中使用)
- [面板长什么样](#面板长什么样)
- [配置](#配置)
- [检查引擎](#检查引擎)
- [健康分 / 历史 / 门禁 / 通知](#健康分--历史--门禁--通知)
- [实时进程与介入](#实时进程与介入)
- [扩展：写一个检查插件](#扩展写一个检查插件)
- [接入自动化（可选）](#接入自动化可选)
- [目录结构](#目录结构)
- [隐私与安全](#隐私与安全)
- [发布到公共仓库](#发布到公共仓库)

---

## 快速开始

要求：Node.js ≥ 22，推荐 Node.js 24 LTS（使用 Node 内置模块，无需安装第三方依赖）。

在本地 Agent App 中打开本仓库，把 Agent 的命令工作目录设为仓库根目录。首次体验可让 Agent 运行 demo 并预览生成的 `panel.html`。

```bash
git clone <your-repo> storys-checker
cd storys-checker

npm run demo            # 用 examples/demo-project 生成 panel.html，交给 App 预览

npm run setup           # 生成 config.json（复制自 config.example.json）
# 让 Agent 将 config.json 的 projects 指向你自己的项目
npm run build           # 扫描 + 生成自包含的 panel.html
```

首次使用自带 demo 时，不要覆盖已有的 `config.json`、`config.local.json` 或其他私有配置；只在没有配置时运行初始化。不要使用会强制覆盖文件的初始化命令。

## 在本地 Agent App 中使用

这个项目由本地 Agent App 中的 Agent 调用命令和读取文件。运行入口是 Node.js 脚本和本地面板；Agent App 提供本机命令执行、文件访问和预览能力。具体调用流程见 [Agent App 使用说明](./docs/AGENT_APP.md)。

可以直接把下面这段短指令交给 Agent：

> 在 Storys Checker 工具仓库目录确认当前配置，执行 `node scan.mjs` 和 `node checks.mjs`，读取 `check-report.json`。需要修复时，按 findings 的 fixId 执行 `node checks.mjs --fix <fixId>` 并复检。需要门禁判断时运行 `node gate.mjs`，汇报健康分、error/warn/info 数量、未解决 finding 和 gate 退出码。需要预览时，打开生成的 `panel.html`；需要实时操作时通过 App 的本地任务工具启动 `npm start`，在其浏览器预览中打开 `http://127.0.0.1:8787`。

Agent 读取 `data.json`、`check-report.json` 和 `fix-result.json` 等 JSON 结果、`history/` 下的 JSONL 历史与 `logs/` 下的文本日志。`panel.html` 是可独立预览的静态快照；实时运行、修复和历史查询由本机服务提供。

两种打开方式：

| 方式 | 命令 | 特点 |
| --- | --- | --- |
| 静态快照 | `npm run build` → 打开 `panel.html` | 自包含单文件，随时可发；数据是生成时的快照 |
| 本地服务 | `npm start` → http://localhost:8787 | 点「↻ 重新扫描」实时刷新，支持运行命令、自动修复、查看日志 |

指定配置（优先级高于 `config.local.json` / `config.json`）：

```bash
node scan.mjs --config ./my-config.json
STORYS_CHECKER_CONFIG=./my-config.json npm start
```

配置解析顺序：命令行 `--config` → `STORYS_CHECKER_CONFIG` → `config.local.json` → `config.json` → `config.example.json`。
`config.local.json` 适合放不想提交的私有配置，支持 `"extends": "config.json"` 做局部覆盖。

---

## 面板长什么样

九个区块，全部由 `data.json` 驱动、无前端框架：

| 区块 | 内容 |
| --- | --- |
| **流程监控**（默认） | P0—P12 阶段板 + 今日内容包 + 实时进程 + 运行/中断 |
| **总览** | 项目统计、健康度、共享组件、共享脚本 |
| **项目详情** | Composition / Still / 场景 / 期数 / 组件 / 数据 / npm 脚本 / 最近产物 / 文档 |
| **常用功能** | 跨项目能力清单，自动标注被哪些项目使用 |
| **工作流门禁** | 自动发现每个项目的 `*WORKFLOW*.md` 并结构化解析成门禁卡片 |
| **脚本命令** | 各项目 npm scripts 按类别合并对比 |
| **BGM 库** | 选择矩阵、当前选择、转折音效 |
| **Prompt 库** | 规范文档在线预览/编辑，带版本快照 |
| **检查反馈** | 检查结果分级 + 一键自动修复 + 健康分趋势 |

工作流门禁是**自动发现**的：扫描器会读每个项目根目录与 `video` 目录下文件名含 `WORKFLOW` 的 md，
并解析三种常见写法——

- `### P0｜标题` + `输入/产物/通过条件` → 结构化门禁卡片
- `## 制作门禁` 下的编号列表 → 章节文本
- `| 交互 | … |` 表格 → 交互协议表

所以**新增或修改门禁只需改项目里的文档**，点「重新扫描」即生效，不用动面板代码。

---

## 配置

`config.json` 是唯一的迭代入口（结构见 `config.schema.json`）。

```jsonc
{
  "projects": [
    {
      "id": "my-video",
      "label": "我的竖屏栏目",
      "root": "~/opt/my-video",              // 支持 ~ 与相对本配置文件的路径
      "videoDir": "~/opt/my-video/video"     // Remotion 工程目录
    }
  ],
  "workflowPatterns": ["WORKFLOW"],
  "scriptGroups": [
    { "key": "工程 / 校验", "match": "^(dev|build|lint|test|verify)$" },
    { "key": "配音 / TTS", "match": "^(voice|timing|captions)" }
  ],
  "features": [
    {
      "id": "subtitle-band",
      "name": "字幕安全带",
      "cat": "字幕",
      "desc": "按 captions 时间轴淡入淡出，避开平台 UI 遮挡。",
      "detect": { "component": "SubtitleBand.tsx" }
    }
  ],
  "checks": {
    "enabled": ["git", "required-files", "timing", "publish-package"],
    "scope": { "days": 45 },                  // 只检查最近 45 天的内容包；null = 全量
    "requiredFiles": { "my-video": ["research.md", "script.md", "storyboard.md"] },

    // 发布包约定按项目覆盖（数组整体覆盖、对象深合并、null 关闭单项）
    "publishPackage": {
      "overrides": {
        "ytb": {
          "dirPattern": null,
          "requiredFiles": ["video.mp4", "thumbnail.png", "metadata.md", "manifest.json", "SHA256SUMS"],
          "manifest": {
            "status": { "field": "status", "equals": null, "oneOf": ["待发布", "pending"] },
            "version": null,
            "assets": [],
            "hashesField": "hashes",
            "hashFiles": ["video.mp4", "thumbnail.png", "metadata.md"],
            "engagement": false,
            "personalIpRequiredForSchema": null
          }
        }
      }
    }
  },
  "fixes": {
    "timing": { "cwd": "video", "cmd": "npm", "args": ["run", "timing:episode", "--", "{arg}"] }
  },
  "health": { "threshold": 70 },
  "stages": [
    { "id": "P0", "name": "启动单期", "npm": [], "summary": "算对日期、建对包" }
  ]
}
```

### `features[].detect` 的声明式规则

多个键之间是「且」关系；扫描时自动判断哪些项目用到了它。

| 键 | 含义 |
| --- | --- |
| `always` | 所有存在的项目都算用到 |
| `component` / `componentPattern` | `video/src/components/` 存在该文件 / 文件名匹配正则 |
| `scriptFile` / `scriptPattern` | `video/scripts/` 存在该文件 / 文件名匹配正则 |
| `rootScript` / `rootScriptPattern` | `<root>/scripts/` 存在该文件 / 文件名匹配正则 |
| `dataFile` | `video/src/data/` 存在该文件 |
| `npmScript` / `npmPrefix` | 存在某个 npm 命令 / 命令前缀 |
| `rootDoc` | 项目根目录 md 文件名匹配正则 |
| `dir` | 项目根目录下存在该相对目录 |
| `hasStills` | `Root.tsx` 里注册了封面 Still |

新增一条能力 = 在 `features` 里加一条 JSON，重新扫描即可，前端自动展示并标注覆盖项目。

---

## 检查引擎

`checks.mjs` 是闭环：**检查 → 反馈 → 自动修复 → 复检**。它只校验客观事实与结构，不做内容判断。命令退出 0 只表示检查程序执行完成；必须读取 `check-report.json` 才能知道 findings，退出 0 不等于 finding 数为 0，也不等于创意事实已经核验。

内置检查（`checks/` 目录，可通过 `checks.enabled` 开关）：

| 检查 | 默认等级 | 说明 |
| --- | --- | --- | --- |
| `git` | warn | 工作区是否有未提交改动 |
| `required-files` | warn | 每个已开工内容包是否缺必需产物（未来档期按 info 报） |
| `script-review` | warn | `script-review.html` 是否缺失/过期（只对含 `## 口播稿` 的稿子） |
| `timing` | warn | `timing.generated.ts` 是否缺失或落后于旁白音频 |
| `bgm-files` | error | 被**当前选择或近期成片引用**的 BGM 文件是否存在（历史目录项降为 info） |
| `soundtrack-refs` | error | 当前 BGM 选择是否指向存在的曲目/音效 |
| `attribution` | warn | 是否登记素材授权 |
| `icons-index` | warn | 图标索引是否过期 |
| `config-self` | warn | 配置里是否有未匹配任何项目的功能条目 |
| `publish-package` | error | 待发布包 6 件套 + manifest 字段 + SHA-256 与实体一致 |
| `personal-ip` | warn | `used / static / omitted` 决策是否记录（含镜头证据） |
| `daily-review` | warn/error | 执行目标字段完整 + 交接引用的周简报/执行目标**文件存在且 SHA-256 一致** |

```bash
node checks.mjs                  # 全部检查 → check-report.json + history/
node checks.mjs --fix            # 自动修复全部可修复项
node checks.mjs --fix timing     # 只修一类
node checks.mjs --watch          # 监听文件变化，自动复查 + 通知
```

### 范围控制（重要）

历史内容包动辄上百个，逐包检查会把面板刷满。用 `checks.scope` 把检查聚焦到近期：

```jsonc
"checks": { "scope": { "days": 45 } }        // 或 { "since": "2026-09-01" }
```

`required-files`、`script-review`、`personal-ip`、`daily-review` 都会遵守这个范围。
不设置表示全量检查。

### 约定对齐（否则会产生大量误报）

真实的视频仓库往往同时存在多套历史约定，硬编码一套就会把另一套全判成错误。
这些机制都能在 `config` 里调：

| 机制 | 配置 | 为什么需要 |
| --- | --- | --- |
| 时间轴容差 | `checks.timing.toleranceSeconds`（默认 5s） | 旁白音频与 `timing.generated.ts` 常在同一次生成流程里写入，毫秒级先后不该判成「过期」 |
| 只查已开工的内容包 | `checks.requiredFilesOnlyWhen` | 只有候选表的目录属于选题阶段，不该按交付包要求 `storyboard.md` 等产物 |
| 未来档期不判罚 | 内建（内容包日期 > 今天 → info） | 明天的选题还没到分镜阶段，不是缺陷 |
| 审阅页小节名 | `checks.scriptReview.requiredSection`（默认 `## 口播稿`） | 审阅页构建脚本只认一个小节；系列稿用别的小节时不该要求审阅页 |
| 发布包约定按项目 | `checks.publishPackage.overrides[<id>]` | 不同项目的发布包完全不同（封面数量、清单文件名、哈希字段、目录命名） |
| BGM 只在用才判错 | `checks.bgmFiles.mode`（默认 `in-use`） | 目录里保留的历史曲目条目早已清理，不该长期压着健康分 |
| 交接只做可验证的事 | 内建 | 校验引用文件的**存在性与 SHA-256**，而不是去匹配人工写的 `review-log.md` 文本 |

`bgm-files` 默认只把「当前选择或检查范围内成片真正引用」的缺失曲目判为 error，
历史目录条目降为 info；用 `checks.bgmFiles.mode: "all"` 可恢复全量判 error。

### 自动修复

只跑**幂等再生成命令**，修复命令在 `config.json` 的 `fixes` 里声明，`{arg}` 会替换为具体 episode/文件。
新增一种修复只需加一条 JSON，不动代码。

---

## 健康分 / 历史 / 门禁 / 通知

- 每次检查产出 0—100 的健康分。扣分构成：`错误 × errorWeight`（上限 `errorCapPoints`）
  + 警告的**饱和曲线** `warnCapPoints × w / (w + warnHalf)` + 提示 `infoWeight`（上限 `infoCap`）。
- 为什么不用「线性 + 条数封顶」：一旦警告数超过封顶值，再清理多少条分数都不会动。
  饱和曲线让每解决一条警告分数都会上升，同时历史噪声又不会把分数压到 0。
  想回退旧模型：把 `health.warnHalf` 设为 `null`。
- `check-report.json` 里的 `health.penalty` 会给出三个分量，方便判断「分数为什么低」。
- 运行历史写入 `history/check-history.jsonl`，面板显示趋势条与「较上次：新增 / 已解决 / 持续」。
- 发布门禁：

```bash
node gate.mjs                  # 健康分低于阈值 → 退出码 1
node gate.mjs --project my-video
```

`gate.mjs` 按 `config.health.threshold` 判断健康分：达到阈值退出 0，低于阈值退出 1；未知项目通常退出 2。gate 退出 0 仍不代表所有 finding 为 0 或创意事实已核验。

- 通知：`config.notify` 填 webhook（钉钉/飞书/Slack）或 shell 命令，检查失败或健康分低于阈值时触发。

---

## 实时进程与介入

`npm start` 后，「流程监控」页可以：

- 按当日产物自动推断当前处在哪个阶段（阶段定义在 `config.stages`）
- 从当前阶段直接运行 `npm run …`，或在「运行命令」里自由输入
- 每 2 秒拉取日志、显示计时、一键**中断**（杀进程组）

运行中的命令日志写入 `logs/`；重新启动本地服务后内存里的进程列表会清空，但日志文件保留。

> ⚠️ 本地服务提供 `/api/file`（读写项目文件）与 `/api/run`（执行命令）能力，只监听本机回环地址。请只在自己的可信环境中使用。

---

## 扩展：写一个检查插件

在 `checks/` 放一个 `.mjs`，导出 `{ id, category, run(project, ctx) }` 即自动被发现。

```js
// checks/my-check.mjs
import path from 'node:path';

export default {
  id: 'my-check',
  category: '自定义',
  run(project, ctx) {
    const out = [];
    for (const dir of ctx.fs.topicDirs(project)) {
      if (!ctx.inScope(ctx.fs.topicDate(dir))) continue;   // 遵守 checks.scope
      if (!ctx.fs.exists(path.join(dir, 'storyboard.md'))) {
        out.push({
          level: 'warn',                                   // error | warn | info
          title: `${ctx.fs.rel(project, dir)} 缺 storyboard.md`,
          action: '补齐分镜',
          fixId: 'my-fix',                                 // 可选：指向 config.fixes
          fixArg: path.basename(dir),
        });
      }
    }
    return out;
  },
};
```

`ctx` 提供：`config`、`ROOT`、`HOME`、`spawn`、`inScope(date)`、`scope`，以及
`ctx.fs.{exists,listDir,isDir,readJson,readText,mtime,newestInDir,topicDirs,topicDate,rel}`。

想让检查全局执行一次（不针对单个项目），加 `global: true`——此时 `project` 为 `null`，报告里会归到 `panel`。

---

## 本地服务与安全默认值

零第三方依赖，**不需要 `npm install`**。按需运行 `npm start`，服务固定监听 `127.0.0.1:8787`，仅供本机 Agent App 浏览器预览和本机人工操作使用。

面板可以运行项目命令并写项目文件，请只在自己的可信环境中使用。设置 `STORYS_CHECKER_READONLY=1` 可隐藏运行、修复和保存按钮，并由服务端拒绝写接口；扫描与检查仍可启动工具子进程。设置 `STORYS_CHECKER_STATE_DIR` 可把运行期状态移到单独的本地目录，便于备份或清理。

`GET /api/healthz` 返回 `{"ok":true}`；写接口要求 JSON 请求体，上限 1 MiB。

---

## 接入自动化（可选）

```yaml
# .github/workflows/gate.yml
name: storys-gate
on: [push, workflow_dispatch]
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: '24', package-manager-cache: false }
      - run: node checks.mjs
      - run: node gate.mjs
```

Git hook：

```bash
#!/bin/sh
node /path/to/storys-checker/gate.mjs || exit 1
```

---

## 目录结构

```text
config.example.json  配置模板（含完整默认值）
config.schema.json   配置的 JSON Schema
lib/config.mjs       配置解析（优先级、~ 与相对路径、extends 深合并）
scan.mjs             扫描引擎：读配置 + 项目 → data.json
checks.mjs           检查引擎：插件加载 + 健康分 + 历史 + 通知 + 修复 + 监听
checks/              检查插件目录（一个文件一个检查，自动发现）
gate.mjs             发布门禁（按健康分返回退出码）
runner.mjs           进程管理（后台运行 + 日志环形缓冲 + 进程组中断）
serve.mjs            零依赖 HTTP 服务 + /api/*
build-panel.mjs      把 data.json 内嵌进 index.html → panel.html
index.html/app.js/style.css   面板前端
docs/                工具文档（UIUX / 本地使用 / 公开发布）
examples/demo-project         可直接跑通的示例项目
scripts/init.mjs     初始化 config.json
```

运行时产物（默认已 gitignore，不会提交）：`data.json`、`panel.html`、`check-report.json`、
`fix-result.json`、`history/`、`logs/`。用 `STORYS_CHECKER_STATE_DIR` 可以把它们统一挪到独立目录。

---

## 隐私与安全

- 仓库不包含任何密钥。需要在 shell 环境里提供的 key（如 TTS / 分析服务）请用环境变量，不要写进 `config.json`。
- `config.local.json`、`config.json` 默认被 gitignore——可以把私有项目路径写在那里。
- 面板读取项目文件，`/api/file` 的写入被限制在项目根目录内。
- `examples/demo-project` 是纯占位内容，不含真实素材。

---

## 发布到公共仓库

准备 fork 或二次发布时，先过一遍 [`docs/PUBLISHING.md`](./docs/PUBLISHING.md)：
运行 `npm run export:public -- /path/to/new-public-directory` 生成公开交付目录。
导出器保留当前公开代码与示例，排除原 Git 历史、私有配置、扫描产物和生产规范快照。
在该目录验证后初始化新的 Git 仓库；源码仓库的历史仍保存在本地。

---

## License

[MIT](./LICENSE)
