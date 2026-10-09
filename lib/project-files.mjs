import fs from 'node:fs';
import path from 'node:path';

function contains(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function forbidden() {
  return Object.assign(new Error('文件路径超出项目目录'), { status: 403 });
}

/** 校验已有文件及新文件的父目录，拒绝前缀目录和指向项目外的符号链接。 */
export function resolveProjectFile(projectRoot, relative) {
  const root = fs.realpathSync(projectRoot);
  const file = path.resolve(root, relative);
  if (!contains(root, file)) throw forbidden();

  let existing = file;
  const missing = [];
  while (true) {
    try {
      // lstat 能识别 dangling symlink，不能把它当成待创建的文件。
      fs.lstatSync(existing);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      missing.unshift(path.basename(existing));
      existing = path.dirname(existing);
    }
  }
  let real;
  try {
    real = fs.realpathSync(existing);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ELOOP') throw forbidden();
    throw error;
  }
  if (!contains(root, real)) throw forbidden();
  return path.join(real, ...missing);
}
