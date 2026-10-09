# Storys Checker — 生产镜像
#
# 本应用不需要 npm install，镜像内不安装第三方 npm 依赖。
# 镜像内不做任何写入：可变状态一律放在 /state 卷（STORYS_CHECKER_STATE_DIR）。
#
# 构建：docker build -t storys-checker:2.0.0 .
# 运行（只读监控第三方项目，推荐）：
#   docker run -d --name storys-checker \
#     -p 127.0.0.1:8787:8787 \
#     -e STORYS_CHECKER_READONLY=1 \
#     -e STORYS_CHECKER_USER=admin \
#     -e STORYS_CHECKER_PASSWORD="$STORYS_CHECKER_PASSWORD" \
#     -v storys-checker-state:/state \
#     -v "$PWD/config.json:/app/config.json:ro" \
#     -v /srv/their-video-project:/projects/their-video-project:ro \
#     storys-checker:2.0.0
FROM node:24-alpine

LABEL org.opencontainers.image.title="Storys Checker" \
      org.opencontainers.image.description="零依赖本地视频生产控制台：门禁 / 健康分 / 发布包校验 / 实时进程" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    STORYS_CHECKER_STATE_DIR=/state

# 应用代码（无第三方依赖）
COPY package.json LICENSE README.md config.schema.json config.example.json ./
COPY lib/ ./lib/
COPY checks/ ./checks/
COPY scripts/ ./scripts/
COPY docs/README.md docs/UIUX.md docs/DEPLOY.md docs/PUBLISHING.md ./docs/
COPY examples/ ./examples/
COPY scan.mjs checks.mjs serve.mjs runner.mjs gate.mjs build-panel.mjs index.html app.js style.css ./

# /state 放运行期状态；/projects 预留给被监控项目
RUN mkdir -p /state /projects && chown -R node:node /app /state /projects

USER node
VOLUME ["/state"]
EXPOSE 8787

# 仅在生成面板时需要 256MB 左右内存，检查是全静态分析
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "serve.mjs"]
