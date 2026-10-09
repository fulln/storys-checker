# 部署指南

Storys Checker 是一个不需要 npm 安装依赖的 Node 应用：不需要数据库，
镜像也不带任何外部二进制。它做两件事——扫描被监控的视频项目、按你的门禁规则检查它们。

本文档面向「**部署给别人用**」的场景，包含安全默认值、状态管理、升级与排障。

---

## 0. 前置要求

| 项 | 要求 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 22 | 只用内置模块（`fetch`、`node:test` 等）；镜像默认使用 Node 24 |
| npm | 不需要 | 没有任何 `dependencies` / `devDependencies` |
| 外部工具 | 按检查项决定 | `git` 检查使用系统 git；精简容器可禁用 git 检查。被监控项目自己的渲染/校验才需要 ffmpeg 等 |
| 被监控项目 | 本地目录可读 | 可选：需要能读它的 `content/`、`video/`、`publish/` 等约定目录 |

> 镜像内不包含 git、ffmpeg、Python 或 OpenCV。启用相应检查或运行项目脚本前，请确认执行环境提供所需工具。

---

## 1. 方式一：本机零依赖部署（最常见）

```bash
git clone <repo> /opt/storys-checker
cd /opt/storys-checker

cp config.example.json config.json     # 或用 npm run setup
$EDITOR config.json                    # 把 projects[].root 指向要监控的项目
npm run build                          # 生成 panel.html（可双击打开，无需服务）
npm start                              # 或起服务：http://127.0.0.1:8787
```

验证部署是否正确：`npm run demo`（用自带示例项目）应当报 **0 error / 0 warn**。

如果只是偶尔看一眼，`npm run build` 产出的 `panel.html` 是**自包含单文件**，
直接发给别人双击就能看——不需要 Node 环境。但它是生成时的快照，项目变化后要重新生成。

### 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 监听端口 |
| `HOST` / `STORYS_CHECKER_HOST` | `127.0.0.1` | **默认只监听本机**。要暴露必须同时配认证 |
| `STORYS_CHECKER_USER` | 空 | HTTP Basic Auth 用户名；对外监听时必须与密码同时设置 |
| `STORYS_CHECKER_PASSWORD` | 空 | HTTP Basic Auth 密码；对外监听时必须与用户名同时设置 |
| `STORYS_CHECKER_READONLY` | `0` | `1` = 只读模式，禁止执行命令与写入被监控项目 |
| `STORYS_CHECKER_STATE_DIR` | 代码目录 | 运行期状态目录（见「状态管理」） |
| `STORYS_CHECKER_CONFIG` | — | 指定配置文件路径，等价于 `--config <path>` |

---

## 2. 方式二：Linux 服务器常驻（systemd）

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin storys
sudo git clone <repo> /opt/storys-checker
sudo chown -R storys:storys /opt/storys-checker
cd /opt/storys-checker && sudo -u storys cp config.example.json config.json
sudo -u storys $EDITOR config.json

# 认证信息放独立 env 文件，权限 600
sudo tee /etc/storys-checker.env >/dev/null <<'EOF'
HOST=127.0.0.1
PORT=8787
STORYS_CHECKER_USER=admin
STORYS_CHECKER_PASSWORD=换成强密码
STORYS_CHECKER_READONLY=1
EOF
sudo chmod 600 /etc/storys-checker.env

sudo cp deploy/systemd/storys-checker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now storys-checker
systemctl status storys-checker
```

unit 文件已经做了加固（`ProtectSystem=strict`、`NoNewPrivileges`、`StateDirectory`），
并且**只允许写 `/var/lib/storys-checker`**，所以代码目录保持只读、升级只需替换文件。

需要从别的机器访问：

```bash
sudo systemctl edit storys-checker
# [Service]
# Environment=HOST=127.0.0.1
# Environment=STORYS_CHECKER_USER=admin
# Environment=STORYS_CHECKER_PASSWORD=请改成强密码
```

然后**务必**通过反向代理加 HTTPS（见第 6 节），不要直接裸暴露 8787。

---

## 3. 方式三：macOS 常驻（launchd）

```bash
mkdir -p "$HOME/opt"
git clone <repo> "$HOME/opt/storys-checker"
cd "$HOME/opt/storys-checker" && cp config.example.json config.json
mkdir -p "$HOME/opt/storys-checker/state/logs"
# 将 plist 中的 /opt/storys-checker 替换为上面的实际路径，并确认 node 路径

cp deploy/launchd/com.storys-checker.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.storys-checker.plist
tail -f "$HOME/opt/storys-checker/state/logs/server.log"
```

> 注意：launchd 是用户级 agent，**用户登录后才启动**。需要开机即跑请改用 root LaunchDaemon
> （plist 放 `/Library/LaunchDaemons/` 并加 `UserName`）。

---

## 4. 方式四：Docker / Compose

```bash
cd /opt/storys-checker
cp .env.example .env            # 设置 STORYS_CHECKER_PASSWORD
cp config.example.json config.json   # config 里的项目路径用容器内路径 /projects/...
docker compose up -d
docker compose logs -f
```

`.env` 中的 `STORYS_CHECKER_PASSWORD` 必须替换为空值示例的真实强密码；不要把 `.env` 提交到仓库。

Compose 的默认值就是「给别人部署」最安全的组合：

- 只绑定 `127.0.0.1:8787`（外部无法直连）
- 强制设置登录密码（`STORYS_CHECKER_PASSWORD` 未设置会**启动失败**）
- **只读模式**：能扫描、能检查、能看健康分，但不能执行命令、不能改写被监控项目
- 容器本身 `read_only: true`，状态只落 `/state` 卷；`cap_drop: ALL`、`no-new-privileges`

挂载关系：

```
storys-checker-state -> /state     运行期状态（可写，命名卷）
./config.json -> /app/config.json  （只读）
$PROJECTS_DIR -> /projects          （只读，被监控项目）
```

镜像把 `config.example.json` 也带了进来，所以第一次起来就能看到示例数据，方便先验证再替换配置。

### 只监控、不改动对方项目

这是推荐给第三方的方式。`config.json` 里这样写：

```jsonc
{
  "projects": [
    { "id": "their-video", "label": "对方的视频项目",
      "root": "/projects/their-video-project",
      "videoDir": "/projects/their-video-project/video" }
  ],
  "checks": { "enabled": ["git", "required-files", "timing", "publish-package"] }
}
```

`STORYS_CHECKER_READONLY=1` 下，「运行命令 / 自动修复 / 保存文件」这些按钮在前端会被隐藏，
服务端对所有写接口也返回 `403`（双层防护）。

### 什么时候**不该**用容器

如果要用面板去**运行被监控项目的 npm 脚本**（渲染、配音、自动修复），容器里必须同时具备
对方的 Node 依赖、Python 虚拟环境、ffmpeg 等，成本高且容易踩版本问题。
这种「编排 + 执行」的场景建议用**方式一/二**，把面板和项目放在同一台机器上。

---

## 5. 状态管理与升级

**代码目录与可变状态是分离的**，这是为了容器和只读部署：

| 文件/目录 | 内容 | 是否可变 |
| --- | --- | --- |
| `data.json` | 最近一次扫描结果 | 可变 |
| `check-report.json` | 最近一次检查报告 + 健康分 | 可变 |
| `fix-result.json` | 最近一次自动修复结果 | 可变 |
| `history/check-history.jsonl` | 健康分历史（趋势条数据源） | 追加 |
| `history/prompt-versions.jsonl` | Prompt 库版本快照 | 追加 |
| `logs/` | 运行命令的日志 | 追加 |
| `panel.html` | 自包含静态面板 | 可变 |

设置 `STORYS_CHECKER_STATE_DIR` 后，以上全部落在该目录；systemd 里是 `/var/lib/storys-checker`，
容器里是 `/state`。

### 备份

只需要备份配置 + 状态：

```bash
docker compose exec -T storys-checker tar czf - \
  -C / app/config.json state > storys-backup-$(date +%F).tgz   # 容器部署：兼容 Alpine 的 tar
sudo tar czf storys-backup-$(date +%F).tgz \
  -C /opt/storys-checker config.json \
  -C /var/lib/storys-checker .   # systemd：一次归档，避免把两份 tar 直接追加
```

历史文件是可再生的（重新扫描/检查即可），但**健康分趋势**依赖 `history/`。

容器备份内的路径是 `app/config.json` 和 `state/`。恢复时先解压到临时目录，再将配置与状态分别放回对应位置。

### 升级

```bash
cd /opt/storys-checker
git fetch && git checkout <tag>
# 代码目录本身不含状态，所以不需要迁移数据
sudo systemctl restart storys-checker      # 或 docker compose up -d --build
node checks.mjs --config config.json       # 升级后确认配置仍可用
```

回滚只需切回上一个 tag。**配置结构如有不兼容变更，会体现在 `config.schema.json`**。
升级 Compose 时不要使用 `docker compose down -v`，否则会删除状态命名卷；直接执行 `docker compose up -d --build`。

---

## 6. 对外暴露：反向代理 + HTTPS

不要把 8787 直接开到公网。用 Caddy（自动 HTTPS，最省事）：

```caddyfile
storys.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

nginx：

```nginx
server {
    listen 443 ssl http2;
    server_name storys.example.com;

    ssl_certificate     /etc/letsencrypt/live/storys.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/storys.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 600s;      # /api/check、/api/run 可能跑很久
    }
}
```

保持进程监听 `HOST=127.0.0.1`，并同时设置 `STORYS_CHECKER_USER` 与 `STORYS_CHECKER_PASSWORD`。反向代理在同机连接回环地址；只有确实需要直接对外监听时才改用非回环地址，此时缺少完整用户名密码会拒绝启动。

只读模式会拒绝写入接口；是否适合对外仍取决于项目内容、认证和网络边界。如果连项目数据都不想暴露，就继续只监听 `127.0.0.1` + SSH 隧道：
`ssh -L 8787:127.0.0.1:8787 user@host`

可写模式会运行配置中的项目命令并写入项目文件，只适合信任使用者；它等同于把该服务进程的 shell 权限交给使用者。只读模式仍会为 scan/check 启动工具子进程；只读实现会自动抑制 notify command。

---

## 7. 接入监控与 CI

- **存活探针**：`GET /api/healthz` → `{"ok":true}`（唯一匿名探针；Healthcheck / K8s liveness 用这个）
- **健康分**：`GET /api/health` → 最近一次完整检查报告
- **元信息**：`GET /api/meta` → 版本、只读状态、是否启用认证、状态目录、项目清单
- **CI 门禁**：

```yaml
- run: node checks.mjs --config config.json
- run: node gate.mjs --config config.json      # 健康分低于阈值 → 退出码 1
```

- **告警**：`config.notify` 支持 webhook（钉钉/飞书/Slack）或任意 shell 命令，
  payload 通过环境变量 `STORYS_CHECKER_JSON` 传给命令。

---

## 8. 排障

| 现象 | 原因 / 处理 |
| --- | --- |
| 面板空白、项目显示「missing」 | `projects[].root` 路径不对。相对路径是**相对配置文件所在目录**解析的；容器里要用 `/projects/...` |
| 报「找不到配置文件」 | 没有 `config.json`。`cp config.example.json config.json`，或用 `STORYS_CHECKER_CONFIG` / `--config` 指定 |
| 启动日志提示「未启用（仅限本机使用）」 | 正常。要对外请同时设 `STORYS_CHECKER_USER` 和 `STORYS_CHECKER_PASSWORD` |
| 点了「运行命令 / 修复」返回 403 | 处于只读模式。去掉 `STORYS_CHECKER_READONLY`（并确认环境可信） |
| 浏览器一直弹登录框 | 已启用 Basic Auth。用 `.env` / `EnvironmentFile` 里的账号密码；改密后要重启进程 |
| 容器里看不到项目文件 | 忘了挂载，或挂到了容器里不存在的路径。检查 `docker compose config` |
| 端口被占用 | `PORT=8788 npm start` |
| 升级后 `data.json` 报配置不匹配 | 启动时会自动重扫；也可手动 `node scan.mjs --config config.json` |
| 检查很慢 | 用 `checks.scope`（如 `{ "days": 45 }`）只查近期内容包；历史包动辄上百个 |

---

## 9. 部署自检

部署完请跑一遍，确认「扫描 → 检查 → 服务 → 只读隔离」四条链路都通：

```bash
# 1) 示例数据自检（应当 0 error / 0 warn，健康分 ≥ 95）
npm run demo
node checks.mjs --config config.example.json

# 2) 真实配置扫描 + 健康分门禁
node scan.mjs  --config config.json
node checks.mjs --config config.json
node gate.mjs   --config config.json     # 期望退出码 0

# 3) 服务探针
curl -s http://127.0.0.1:8787/api/healthz                    # {"ok":true}
curl -s -u admin:密码 http://127.0.0.1:8787/api/meta | head -c 300

# 4) 只读隔离验证（关键：容器/只读部署必须通过）
curl -s -o /dev/null -w '%{http_code}\n' \
  -u admin:密码 -X POST http://127.0.0.1:8787/api/run -d '{}'   # 期望 403
```

### 不用 Docker 也能验证「只读代码目录」这个前提

容器部署依赖「代码目录只读、状态写进卷」。可以在本机等价复现：

```bash
cp -R /opt/storys-checker /tmp/sc-ro
chmod -R a-w /tmp/sc-ro                        # 代码目录只读
cd /tmp/sc-ro && mkdir -p /tmp/sc-state
HOST=0.0.0.0 STORYS_CHECKER_READONLY=1 \
STORYS_CHECKER_USER=admin STORYS_CHECKER_PASSWORD=test \
STORYS_CHECKER_STATE_DIR=/tmp/sc-state \
node serve.mjs
# 另一个终端：
#   curl -s -u admin:test http://127.0.0.1:8787/api/healthz        → {"ok":true}
#   ls /tmp/sc-state                                               → data.json 等状态在这里
#   代码目录里不应出现 data.json / history/ / logs/
```

> Docker 镜像构建需要能访问 `registry-1.docker.io` 拉取 `node:24-alpine`。
> 如果部署环境走内网仓库，把 Dockerfile 的 `FROM` 换成你们镜像站里的 Node 24 镜像即可。

---

## 10. 交付清单（把这套给别人时）

给对方只需要：

1. **本仓库**（或一个 tag 的 tarball / 镜像）
2. 一份 `config.json`（按第 1 节或第 4 节示例改成他的项目）
3. 一句部署命令（`npm start` 或 `docker compose up -d`）
4. 这份文档

仓库里**没有任何密钥、没有作者的私有路径**（`config.json` / `config.local.json` 已 gitignore，
`examples/demo-project` 是纯占位内容）。发布前建议按 [`PUBLISHING.md`](./PUBLISHING.md) 再走一遍自检。
