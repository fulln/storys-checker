// build-panel.mjs — 生成可直接双击打开的自包含 panel.html（数据内嵌，无需服务器）
import fs from 'node:fs';
import path from 'node:path';
import { stateFile } from './lib/paths.mjs';

const ROOT = process.cwd();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const data = fs.readFileSync(stateFile('data.json'), 'utf8');

const inject = `<!--PANEL-DATA-START--><script>window.__PANEL_DATA__ = ${data};</script><!--PANEL-DATA-END-->`;

let out = html;
if (out.includes('<!--PANEL-DATA-SLOT-->')) {
  out = out.replace('<!--PANEL-DATA-SLOT-->', inject);
} else {
  out = out.replace('</head>', `${inject}\n</head>`);
}

fs.writeFileSync(stateFile('panel.html'), out, 'utf8');
console.log('✅ 已生成 panel.html（自包含，双击即可本地查看）');
