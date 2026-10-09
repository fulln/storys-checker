# 发布到公共仓库

公开仓库信息已设为 `fulln/storys-checker`。二次发布时，更新 `package.json` 的仓库、问题跟踪与首页链接、`config.schema.json` 的 `$id` 以及 systemd unit 的 `Documentation`。

## 1. 生成干净的发行目录

在源码仓库中执行：

```bash
npm run export:public -- /tmp/storys-checker-public
```

目标目录必须不存在，其父目录必须存在。导出器复制 Git 已跟踪的公开文件及明确列出的新增运行文件，保留当前修改；排除 `.git`、私有配置、状态文件和生产规范快照，拒绝源符号链接及位于源码仓库内的目标路径。

原有提交中的历史内容仍保存在源码仓库内。首次公开时在导出目录建立新历史；不能在源码仓库中仅执行 `git init` 后直接推送，`git init` 不会删除旧提交。

`docs/` 的公开列表仅包含 `README.md`、`UIUX.md`、`DEPLOY.md` 和本文。Docker 与 npm 分发也使用这个列表。

## 2. 验证发行目录

```bash
cd /tmp/storys-checker-public
npm test
npm run demo                     # 0 error / 0 warn，健康分 100
node gate.mjs --config config.example.json
npm pack --dry-run               # 检查 npm 分发文件列表
```

运行不需要 `npm install`。示例 MP3、MP4 和 PNG 是不可播放或显示的文本占位文件，只验证路径、结构和校验和；说明见 `examples/demo-project/video/public/ATTRIBUTION.md`。真实媒体的播放、内容和素材授权需要单独验证。

复查公开文件中没有本机项目路径、凭据或不打算公开的文档。目录与文件名过滤不能代替内容检查。

仓库自带 CI，覆盖 Node.js 22 / 24 的测试、demo 门禁，以及认证和只读容器的构建与启动。只有 CI 实际运行成功后才能声称通过远端验证。

## 3. 建立首次公开历史

仅在验证过的导出目录执行：

```bash
git init -b main
git add -A
git commit -F - <<'EOF'
Keep the public release independent of private production history

Export the reviewed tool, deployment files and synthetic examples into a new repository.

Constraint: Private production documents and original history must stay local.
Confidence: high
Scope-risk: moderate
Tested: npm test; npm run demo; configured health gate
Not-tested: Record any remaining container or platform verification gaps before publishing.
EOF
```

可选的全新 clone 验证：

```bash
PUBLIC_VERIFY_DIR=$(mktemp -d)
git clone . "$PUBLIC_VERIFY_DIR/clone"
cd "$PUBLIC_VERIFY_DIR/clone"
npm test
npm run demo
```

## 4. 推送与部署

创建对应 GitHub 仓库后，从发行目录推送：

```bash
git remote add origin https://github.com/fulln/storys-checker.git
git push -u origin main
```

部署步骤见 [DEPLOY.md](./DEPLOY.md)。Compose 要求先填写 `.env` 中的真实密码，默认仅映射回环端口、采用只读模式，并将状态存入 named volume。升级不要执行 `docker compose down -v`，该选项会删除状态卷。

需要分发 npm 包时，应在验证过的发行目录执行 `npm publish`。`package.json.files` 只包含工具代码、公开文档、部署文件与示例。

## 5. 版本

使用语义化版本：新增检查或检测规则通常增加 minor，修复增加 patch，不兼容配置变更增加 major。发版时同步 `package.json`、Compose 镜像标签与部署示例，并在公开仓库打 tag。
