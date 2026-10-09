// 检查：逐词时间轴 timing.generated.ts 是否缺失/过期
//
// 容差：旁白音频与 timing.generated.ts 常在同一次生成流程中写入（毫秒级先后），
// 直接用 mtime 比较会把 70+ 个同一次生成的 episode 误判为“过期”。
// 因此默认留 5 秒容差，可用 config.checks.timing.toleranceSeconds 调整。
//
// 自动修复：时间轴由每个旁白 track 的 `<track>.captions.raw.json` 复算。
// 若部分 track 缺逐词时间戳，重算命令必然失败，此时不提供 fixId，
// 而是提示先重新合成该期配音。
import path from 'node:path';

/** 找出缺少 .captions.raw.json 的旁白 track（仅当存在 generation-manifest.json 时可判定）。 */
function missingCaptionTracks(audioDir, fs) {
  const manifestFile = path.join(audioDir, 'generation-manifest.json');
  if (!fs.exists(manifestFile)) return [];
  let manifest;
  try {
    manifest = JSON.parse(fs.readText(manifestFile));
  } catch {
    return [];
  }
  return (manifest.tracks || [])
    .filter((t) => t?.name && !fs.exists(path.join(audioDir, `${t.name}.captions.raw.json`)))
    .map((t) => t.name);
}

export default {
  id: 'timing',
  category: '声音',
  run(project, ctx) {
    const { fs } = ctx;
    const toleranceMs = (ctx.config.checks?.timing?.toleranceSeconds ?? 5) * 1000;
    const epsDir = path.join(project.videoDir, 'src/episodes');
    const out = [];

    for (const ep of fs.listDir(epsDir)) {
      const epDir = path.join(epsDir, ep);
      if (!fs.isDir(epDir)) continue;
      const audioDir = path.join(project.videoDir, 'public/audio', ep);
      if (!fs.exists(audioDir)) continue;
      const timing = path.join(epDir, 'timing.generated.ts');

      if (!fs.exists(timing)) {
        const hasRawCaptions = fs.listDir(audioDir).some((f) => f.endsWith('.captions.raw.json'));
        if (!hasRawCaptions) continue;
        const missing = missingCaptionTracks(audioDir, fs);
        if (missing.length) {
          out.push({
            level: 'warn',
            title: `episode「${ep}」缺 timing.generated.ts`,
            detail: `旁白 track 缺逐词时间戳：${missing.join('、')}，无法复算时间轴`,
            action: '先重新合成该期配音（生成 .captions.raw.json），再运行 npm run timing:episode',
          });
        } else {
          out.push({
            level: 'warn',
            title: `episode「${ep}」缺 timing.generated.ts`,
            detail: '存在逐词时间戳但未生成时间轴',
            action: 'npm run timing:episode',
            fixId: 'timing',
            fixArg: ep,
          });
        }
        continue;
      }

      const newestAudio = fs.newestInDir(audioDir);
      if (newestAudio > fs.mtime(timing) + toleranceMs) {
        const overSeconds = Math.round((newestAudio - fs.mtime(timing)) / 1000);
        out.push({
          level: 'warn',
          title: `episode「${ep}」时间轴过期`,
          detail: `旁白音频比 timing.generated.ts 新约 ${overSeconds}s（超出 ${toleranceMs / 1000}s 容差）`,
          action: 'npm run timing:episode',
          fixId: 'timing',
          fixArg: ep,
        });
      }
    }
    return out;
  },
};
