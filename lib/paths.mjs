// lib/paths.mjs — 运行期状态目录
//
// 代码目录（ROOT）与可变状态（扫描结果、检查报告、历史、日志）分离：
// 默认写在工具目录；可用 STORYS_CHECKER_STATE_DIR 指向另一个本地目录，方便备份与升级。
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();

/** 可变状态目录：默认就是代码目录。 */
export const STATE_DIR = path.resolve(process.env.STORYS_CHECKER_STATE_DIR || ROOT);

export const stateFile = (...parts) => path.join(STATE_DIR, ...parts);

/** 确保状态目录存在（幂等）。 */
export function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  return STATE_DIR;
}

export default { ROOT, STATE_DIR, stateFile, ensureStateDir };
