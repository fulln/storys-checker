# 在本地 Agent App 中使用

Storys Checker 是本地 Agent 的视频生产工作流入口和检查面板。Agent 在已配置的视频项目中按该项目规则制作内容、渲染成片；在工具仓库目录执行扫描与检查命令，读取 JSON 报告。面板用于预览进度和人工操作。

当前调用入口是 Node.js 脚本和本地面板。Agent App 需要具备本机命令执行能力，以及对工具仓库和配置中列出的项目目录的文件访问能力。

支持项目级 Skill 的 Agent 可使用 `.codex/skills/storys-video-production/SKILL.md` 完成从内容到本地交付的编排；根目录 `AGENTS.md` 也会指向该生产入口。制作时先读取目标项目自己的 `AGENTS.md`、账号定位、工作流与适用 Skill，再使用该项目的渲染工具、素材和凭据。示例项目用于学习结构，不能直接产出真实视频。检查器只覆盖已实现和已配置的检查项；事实核验、授权审查及成片播放验收要按目标项目规则完成。

## 让 Agent 制作一期视频

先配置 `config.json` 中目标项目的 `root` 和 `videoDir`，确认它有可运行的生产工具链。然后可向 Agent 提出：

> 使用 `storys-video-production`，按当前项目的账号定位、生产流程和验收规则制作一期视频。逐阶段保存选题来源、脚本、分镜、素材授权、声音和时间轴、关键帧、预览、高清成片与交付包；每道门禁检查实际产物。过程中用 Storys Checker 扫描并读取 findings，最终提供可播放视频及验证记录。

如果 Agent App 不识别项目级 Skill，就让它读取仓库根目录 `AGENTS.md` 和上述 Skill 文件。实际步骤以目标项目规则为准，不能把 demo 的 P0—P12 直接套到其他项目。

## 检查器命令

所有命令都在 Storys Checker 工具仓库目录执行：

```bash
node scan.mjs
node checks.mjs
```

Agent 应先读取 `check-report.json`，统计健康分和 findings，再决定是否执行：

```bash
node checks.mjs --fix <fixId>
node checks.mjs
node gate.mjs
```

使用 findings 中的 fixId 选择对应修复命令。需要放行判断时再运行 `node gate.mjs`，它会重新检查并更新报告。

`checks.mjs` 退出 0 表示检查程序执行完成，具体问题记录在 `check-report.json` 中。`gate.mjs` 按 `config.health.threshold` 判断健康分：达到阈值退出 0，低于阈值退出 1，未知 project 退出 2。事实、素材授权与创意质量仍由 Agent 和使用者根据证据判断。

报告和运行产物包括：

- `data.json`：扫描后的面板数据
- `check-report.json`：结构化检查结果、健康分和 findings
- `fix-result.json`：修复命令结果
- `history/`：历史检查记录
- `logs/`：本地运行命令日志

这些文件可直接由 Agent 读取和总结。`notify` 按当前配置执行 webhook 或命令通知，因此应先确认使用的是自己的可信配置。

产物默认位于工具仓库目录；设置 `STORYS_CHECKER_STATE_DIR` 后，应从该本地目录读取报告和快照。

## 配置选择

配置优先级从高到低为：命令行 `--config`、环境变量 `STORYS_CHECKER_CONFIG`、`config.local.json`、`config.json`、`config.example.json`。例如：

```bash
node checks.mjs --config ./my-config.json
STORYS_CHECKER_CONFIG=./my-config.json node scan.mjs
```

首次使用 demo 时，不要覆盖已有私有配置；只在没有配置时使用 `npm run setup`。`config.local.json` 适合保存本机项目路径和其他不应提交的内容。

## 面板预览

静态预览直接打开生成的 `panel.html`。需要实时重新扫描、运行命令、修复或查看动态历史时，按需运行：

```bash
npm start
```

Agent 可通过 App 的本地任务工具启动这个进程。App 提供浏览器预览时，打开 `http://127.0.0.1:8787`。服务固定监听本机回环地址。

生成的 `panel.html` 内联数据、样式和脚本，可以移动到其他本地目录供 HTML 预览。实时操作通过上述本地进程完成。

## 可直接给 Agent 的短指令

> 在 Storys Checker 工具仓库目录确认当前配置，执行 `node scan.mjs` 和 `node checks.mjs`，读取 `check-report.json`。需要修复时，按 findings 的 fixId 执行 `node checks.mjs --fix <fixId>` 并复检。需要门禁判断时运行 `node gate.mjs`，汇报健康分、error/warn/info 数量、未解决 finding 和 gate 退出码。需要预览时打开生成的 `panel.html`；需要实时操作时通过 App 的本地任务工具启动 `npm start`，在其浏览器预览中打开 `http://127.0.0.1:8787`。
