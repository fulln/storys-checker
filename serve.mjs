// serve.mjs — 本地面板服务 + 实时扫描接口
// 固定监听 127.0.0.1；STORYS_CHECKER_READONLY=1 或 --readonly 可禁止项目写入与命令运行。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startProcess, killProcess, listProcesses } from './runner.mjs';
import { loadConfig } from './lib/config.mjs';
import { STATE_DIR, stateFile } from './lib/paths.mjs';
import { resolveProjectFile } from './lib/project-files.mjs';

const PORT = Number(process.env.PORT) || 8787;
const HOST = '127.0.0.1';
const READONLY = process.env.STORYS_CHECKER_READONLY === '1' || process.argv.includes('--readonly');
const ROOT = process.cwd();
const BODY_LIMIT = 1024 * 1024;

// 只读模式下禁止的接口：会执行命令或改写被监控项目
const WRITE_API = new Set(['/api/run', '/api/kill', '/api/fix', '/api/file', '/api/prompt/save']);

const config = loadConfig({ root: ROOT });
const PROJECTS = config.projects;

// 子进程（scan/check）继承同一份配置，避免 --config / config.local.json 丢失
const CONFIG_ENV = { ...process.env, STORYS_CHECKER_CONFIG: config.__file,
  STORYS_CHECKER_READONLY: READONLY ? '1' : '0' };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function rescan() {
  const r = spawnSync(process.execPath, ['scan.mjs'], { cwd: ROOT, encoding: 'utf8', timeout: 600000, env: CONFIG_ENV });
  return { ok: r.status === 0, stdout: r.stdout, stderr: r.stderr };
}

function runScript(args) {
  return spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 600000, env: CONFIG_ENV });
}

// data.json 可能由另一份配置生成（例如先跑过 npm run demo）。
// 配置不一致时自动重扫，避免面板展示了别的项目的数据。
function dataIsFromOtherConfig(dataFile) {
  if (!fs.existsSync(dataFile)) return true;
  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return data.configFile !== (path.relative(ROOT, config.__file) || null);
  } catch {
    return true;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if ((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
      req.resume();
      return reject(Object.assign(new Error('请求体必须为 application/json'), { status: 415 }));
    }
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > BODY_LIMIT) {
        failed = true;
        chunks.length = 0;
        return reject(Object.assign(new Error('请求体超过 1 MiB'), { status: 413 }));
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (failed) return;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('JSON object required');
        resolve(body);
      } catch {
        reject(Object.assign(new Error('请求体必须为有效 JSON 对象'), { status: 400 }));
      }
    });
    req.on('aborted', () => reject(Object.assign(new Error('请求已中断'), { status: 400 })));
    req.on('error', reject);
  });
}

function appVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function serveStatic(res, urlPath) {
  const assets = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css' };
  const asset = Object.hasOwn(assets, urlPath) ? assets[urlPath] : null;
  if (!asset) {
    res.writeHead(404);
    return res.end('Not Found');
  }
  const file = resolveProjectFile(ROOT, asset);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not Found');
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  return res.end(fs.readFileSync(file));
}

const server = http.createServer(async (req, res) => {
  try {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  const json = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  // 本机服务拒绝非本机 Host，防止浏览器 DNS rebinding。
  const hostname = new URL(`http://${req.headers.host || ''}`).hostname;
  if (!['localhost', HOST].includes(hostname)) {
    return json(403, { error: 'forbidden host' });
  }
  if (url.pathname.startsWith('/api/') && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
    return json(403, { error: 'forbidden origin' });
  }

  // 只读模式拦截（GET /api/file 仍允许，只拦写入）
  const isWrite = WRITE_API.has(url.pathname) && (url.pathname === '/api/file' ? req.method === 'POST' : true);
  if (READONLY && isWrite) {
    return json(403, { error: 'readonly', message: '服务以只读模式启动，已拒绝执行命令或写入项目文件' });
  }

  // 本地存活状态与前端能力探测。
  if (url.pathname === '/api/healthz' && req.method === 'GET') return json(200, { ok: true });
  if (url.pathname === '/api/meta') {
    return json(200, {
      app: 'storys-checker',
      version: appVersion(),
      readonly: READONLY,
      authRequired: false,
      host: HOST,
      port: PORT,
      configFile: path.relative(ROOT, config.__file) || null,
      stateDir: STATE_DIR,
      projects: PROJECTS.map((p) => ({ id: p.id, label: p.label })),
      capabilities: { run: !READONLY, writeFiles: !READONLY, fix: !READONLY },
    });
  }

  if (url.pathname === '/api/data') {
    const dataFile = stateFile('data.json');
    if (url.searchParams.get('refresh') === '1' || dataIsFromOtherConfig(dataFile)) {
      rescan();
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(fs.readFileSync(dataFile));
  }
  if (url.pathname === '/api/refresh') {
    const r = rescan();
    res.writeHead(r.ok ? 200 : 500, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(r));
  }
  if (url.pathname === '/api/check') {
    const r = runScript(['checks.mjs']);
    const reportFile = stateFile('check-report.json');
    if (r.status !== 0 || !fs.existsSync(reportFile)) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'check failed', stderr: r.stderr }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(fs.readFileSync(reportFile));
  }
  if (url.pathname === '/api/health') {
    const reportFile = stateFile('check-report.json');
    if (!fs.existsSync(reportFile)) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'no report yet' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(fs.readFileSync(reportFile));
  }
  if (url.pathname === '/api/history') {
    const historyFile = stateFile('history', 'check-history.jsonl');
    const lines = fs.existsSync(historyFile)
      ? fs.readFileSync(historyFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        }).filter(Boolean)
      : [];
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(lines));
  }
  if (url.pathname === '/api/fix' && req.method === 'POST') {
      const body = await readBody(req);
      const fixId = body.fixId || 'all';
      const args = ['checks.mjs', '--fix'];
      if (fixId !== 'all') args.push(fixId);
      const r = runScript(args);
      const resultFile = stateFile('fix-result.json');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      if (fs.existsSync(resultFile)) return res.end(fs.readFileSync(resultFile));
      return res.end(JSON.stringify({ ok: false, stderr: r.stderr, stdout: r.stdout }));
  }
  if (url.pathname === '/api/file' && req.method === 'GET') {
    const proj = PROJECTS.find((x) => x.id === url.searchParams.get('project'));
    const rel = url.searchParams.get('path') || '';
    if (!proj) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'unknown project' }));
    }
    const full = resolveProjectFile(proj.root, rel);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'no such file', path: rel }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: true, path: rel, content: fs.readFileSync(full, 'utf8') }));
  }
  if (url.pathname === '/api/file' && req.method === 'POST') {
      const b = await readBody(req);
      const proj = PROJECTS.find((x) => x.id === b.project);
      const rel = String(b.path || '').replace(/^\.\//, '');
      if (!proj) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'unknown project' }));
      }
      const full = resolveProjectFile(proj.root, rel);
      try {
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, String(b.content ?? ''), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: true, path: rel }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: String(err.message || err) }));
      }
  }
  if (url.pathname === '/api/prompt/save' && req.method === 'POST') {
      const b = await readBody(req);
      const proj = PROJECTS.find((x) => x.id === b.project);
      const rel = String(b.path || '').replace(/^\.\//, '');
      if (!proj) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'unknown project' }));
      }
      const full = resolveProjectFile(proj.root, rel);
      try {
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, String(b.content ?? ''), 'utf8');
        // 版本快照：追加到 history/prompt-versions.jsonl（每文件保留最近 40 条）
        const vf = stateFile('history', 'prompt-versions.jsonl');
        fs.mkdirSync(path.dirname(vf), { recursive: true });
        const rec = JSON.stringify({ ts: Date.now(), iso: new Date().toISOString(), project: b.project, path: rel, note: String(b.note || ''), content: String(b.content ?? '') });
        fs.appendFileSync(vf, rec + '\n', 'utf8');
        const lines = fs.existsSync(vf) ? fs.readFileSync(vf, 'utf8').trim().split('\n').filter(Boolean) : [];
        const kept = lines.filter((l) => {
          try {
            return JSON.parse(l).path !== rel;
          } catch {
            return false;
          }
        });
        // 只对同文件做裁剪：保留最后 40 条
        const sameFile = lines.filter((l) => {
          try {
            return JSON.parse(l).path === rel;
          } catch {
            return false;
          }
        });
        const toDrop = sameFile.length - 40;
        let dropped = 0;
        const pruned = lines.filter((l) => {
          if (dropped >= toDrop) return true;
          try {
            if (JSON.parse(l).path === rel) {
              dropped++;
              return false;
            }
          } catch {
            /* ignore */
          }
          return true;
        });
        fs.writeFileSync(vf, pruned.join('\n') + (pruned.length ? '\n' : ''), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: true, path: rel, version: Date.now() }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: String(err.message || err) }));
      }
  }
  if (url.pathname === '/api/prompt/history') {
    const proj = url.searchParams.get('project');
    const rel = url.searchParams.get('path') || '';
    const vf = stateFile('history', 'prompt-versions.jsonl');
    const out = [];
    if (fs.existsSync(vf)) {
      for (const l of fs.readFileSync(vf, 'utf8').trim().split('\n').filter(Boolean)) {
        try {
          const r = JSON.parse(l);
          if (r.project === proj && r.path === rel) out.push(r);
        } catch {
          /* ignore */
        }
      }
    }
    out.sort((a, b) => b.ts - a.ts);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(out));
  }
  if (url.pathname === '/api/touched') {
    // 各项目 content 目录最新文件 mtime（前端轮询检测定时任务是否产出了新内容）
    let latest = 0;
    const walk = (d) => {
      let items = [];
      try {
        items = fs.readdirSync(d);
      } catch {
        return;
      }
      for (const f of items) {
        const full = path.join(d, f);
        try {
          const st = fs.statSync(full);
          if (st.isDirectory()) walk(full);
          else if (st.mtimeMs > latest) latest = st.mtimeMs;
        } catch {
          /* ignore */
        }
      }
    };
    for (const p of PROJECTS) walk(path.join(p.root, 'content'));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ latest }));
  }
  if (url.pathname === '/api/processes') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(listProcesses()));
  }
  if (url.pathname === '/api/run' && req.method === 'POST') {
      const b = await readBody(req);
      const p = PROJECTS.find((x) => x.id === b.project);
      if (!p) return json(404, { error: 'unknown project' });
      if (typeof b.command !== 'string' || !b.command.trim()) return json(400, { error: 'command required' });
      const cwd = b.cwd === 'root' ? p?.root : p?.videoDir || ROOT;
      const proc = startProcess({ project: b.project || '', label: b.label || b.command || '', cwd, command: b.command || '' });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(proc));
  }
  if (url.pathname === '/api/kill' && req.method === 'POST') {
      const b = await readBody(req);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(killProcess(b.id)));
  }
  return serveStatic(res, url.pathname);
  } catch (error) {
    if (res.writableEnded || res.destroyed) return;
    const status = error.status || (error.code === 'ENOENT' ? 404 : 500);
    if (status === 500) console.error('[request]', error.message);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: status === 500 ? 'internal error' : error.message }));
  }
});

server.listen(PORT, HOST, () => {
  // 首次启动自动扫描一次，保证 data.json 存在
  if (!fs.existsSync(stateFile('data.json'))) rescan();
  console.log('');
  console.log('  Storys Checker 面板已启动');
  console.log(`   -> http://${HOST}:${PORT}`);
  console.log(`   配置：${path.relative(ROOT, config.__file)}  |  项目：${PROJECTS.map((p) => p.id).join(', ') || '(无)'}`);
  console.log(`   监听：${HOST}:${PORT}（仅本机）`);
  console.log(`   模式：${READONLY ? '只读（禁止执行命令 / 写入文件）' : '可写（可运行命令、自动修复）'}`);
  console.log('');
});
