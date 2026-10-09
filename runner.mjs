// runner.mjs — 进程管理器：后台运行命令、实时日志环形缓冲、进程组中断
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { stateFile } from './lib/paths.mjs';

const ROOT = process.cwd();
const LOG_DIR = stateFile('logs');
const procs = new Map(); // id -> proc
let seq = 0;

const RING_MAX = 400; // 内存中保留的日志块数
const TRANSPORT_MAX = 8000; // 每次返回给前端的日志字符上限

function publicProc(p) {
  return {
    id: p.id,
    project: p.project,
    label: p.label,
    cwd: p.cwd,
    command: p.command,
    pid: p.pid,
    startedAt: p.startedAt,
    endedAt: p.endedAt,
    status: p.status,
    exitCode: p.exitCode,
    signal: p.signal || null,
    log: p.log.slice(-TRANSPORT_MAX),
  };
}

export function startProcess({ project, label = '', cwd, command }) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const id = `${Date.now()}-${++seq}`;
  const logFile = path.join(LOG_DIR, `${id}.log`);
  const ring = [];
  const proc = {
    id,
    project,
    label,
    cwd,
    command,
    pid: null,
    startedAt: Date.now(),
    endedAt: null,
    status: 'running',
    exitCode: null,
    log: '',
    child: null,
  };

  let child;
  try {
    child = spawn(command, { cwd, env: process.env, detached: true, shell: true });
  } catch (e) {
    proc.status = 'failed';
    proc.exitCode = -1;
    proc.endedAt = Date.now();
    proc.log = String(e.message);
    procs.set(id, proc);
    return publicProc(proc);
  }

  proc.child = child;
  proc.pid = child.pid;
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  const push = (chunk) => {
    const s = String(chunk);
    logStream.write(s);
    ring.push(s);
    if (ring.length > RING_MAX) ring.shift();
    proc.log = ring.join('');
  };
  child.stdout?.on('data', push);
  child.stderr?.on('data', push);
  child.on('error', (e) => {
    push(`[runner] ${e.message}\n`);
    proc.status = 'failed';
    proc.exitCode = -1;
    proc.endedAt = Date.now();
    logStream.end();
  });
  child.on('exit', (code, signal) => {
    proc.status = code === 0 ? 'done' : signal ? 'killed' : 'failed';
    proc.exitCode = code;
    proc.signal = signal || null;
    proc.endedAt = Date.now();
    logStream.end();
  });

  procs.set(id, proc);
  // 只保留最近 60 条，避免内存无限增长
  if (procs.size > 60) {
    const oldest = [...procs.keys()].slice(0, procs.size - 60);
    for (const k of oldest) procs.delete(k);
  }
  return publicProc(proc);
}

export function killProcess(id) {
  const proc = procs.get(id);
  if (!proc || proc.status !== 'running') return { ok: false, error: '进程不存在或已结束' };
  try {
    process.kill(-proc.pid, 'SIGTERM');
    setTimeout(() => {
      try {
        process.kill(-proc.pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }, 3000);
  } catch (e) {
    try {
      proc.child?.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }
  return { ok: true, pid: proc.pid };
}

export function listProcesses() {
  const active = [];
  const recent = [];
  for (const p of procs.values()) {
    const pub = publicProc(p);
    if (p.status === 'running') active.push(pub);
    else recent.push(pub);
  }
  active.sort((a, b) => b.startedAt - a.startedAt);
  recent.sort((a, b) => b.endedAt - a.endedAt);
  return { active, recent: recent.slice(0, 20) };
}
