// 检查：git 工作区是否干净
import path from 'node:path';

export default {
  id: 'git',
  category: '工程健康',
  run(project, ctx) {
    const { fs, spawn } = ctx;
    const gitDir = [project.root, project.videoDir].find((d) => fs.exists(path.join(d, '.git')));
    if (!gitDir) {
      return [{ level: 'info', title: '未纳入 git 版本控制', action: 'git init', detail: '项目根目录与 video 目录均无 .git' }];
    }
    const r = spawn('git', ['-C', gitDir, 'status', '--porcelain'], { encoding: 'utf8', timeout: 10000 });
    if (r.status !== 0) return [{ level: 'warn', title: 'git status 执行失败', detail: (r.stderr || '').trim() }];
    const lines = r.stdout.trim().split('\n').filter(Boolean);
    if (lines.length) {
      return [{ level: 'warn', title: `${lines.length} 个未提交改动`, detail: lines.slice(0, 10).join('\n'), action: '发布前提交或确认改动' }];
    }
    return [];
  },
};
