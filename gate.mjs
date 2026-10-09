// gate.mjs — 发布门禁：健康分低于阈值则退出码 1，可接入 git hook / CI
// 用法：
//   node gate.mjs            # 运行检查，按 config.health.threshold 判定
//   node gate.mjs --project <id>   # 只看某个项目的健康分
import { runAll } from './checks.mjs';

const report = await runAll();
const h = report.health;
const target = process.argv.includes('--project')
  ? process.argv[process.argv.indexOf('--project') + 1]
  : null;

const score = target ? h.perProject[target] : h.global;
const label = target || '全局';

console.log(`门禁检查：${label}健康分 ${score}/100（阈值 ${h.threshold}）`);
console.log(`   错误 ${report.summary.error}，警告 ${report.summary.warn}，提示 ${report.summary.info}`);
for (const f of report.findings.filter((x) => x.level === 'error')) {
  console.log(`   🔴 [${f.project}] ${f.title}`);
}

if (score === undefined) {
  console.error(`❌ 项目「${target}」不存在`);
  process.exit(2);
}
if (score < h.threshold) {
  console.error(`❌ 未通过：健康分 ${score} 低于阈值 ${h.threshold}`);
  process.exit(1);
}
console.log('✅ 健康分达到阈值；发布前仍需核验内容、素材授权和成片播放');
process.exit(0);
