// build-panel.mjs — 生成供 Agent App 预览的自包含 panel.html（数据、样式与脚本内嵌）
import fs from 'node:fs';
import path from 'node:path';
import { stateFile } from './lib/paths.mjs';

const ROOT = process.cwd();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const data = JSON.stringify(JSON.parse(fs.readFileSync(stateFile('data.json'), 'utf8'))).replace(/</g, '\\u003c');
const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8').replace(/<\/style/gi, '<\\/style');
const js = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').replace(/<\/script/gi, '<\\/script');

const inject = `<!--PANEL-DATA-START--><script>window.__PANEL_DATA__ = ${data};</script><!--PANEL-DATA-END-->`;

let out = html;
if (out.includes('<!--PANEL-DATA-SLOT-->')) {
  out = out.replace('<!--PANEL-DATA-SLOT-->', () => inject);
} else {
  out = out.replace('</head>', () => `${inject}\n</head>`);
}
out = out.replace(/<link\b[^>]*href=["']style\.css["'][^>]*>/i, () => `<style>${css}</style>`);
out = out.replace(/<script\b[^>]*src=["']app\.js["'][^>]*>\s*<\/script>/i, () => `<script>${js}</script>`);

fs.writeFileSync(stateFile('panel.html'), out, 'utf8');
console.log('✅ 已生成 panel.html（自包含，双击即可本地查看）');
