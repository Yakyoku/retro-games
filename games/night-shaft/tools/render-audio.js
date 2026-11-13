// 音源の書き出し（v2）。曲は synth2.js でレンダリングし、
//   - 可逆マスター: audio-master/<曲>[-hot].flac（16bit/44.1kHz ステレオ）
//   - 配布用: shared/audio/files/<曲>[-hot].mp3（192kbps）と manifest.json
// ループする曲は「末尾 1 秒＋曲＋先頭 1 秒」を書き出し、再生時は loopStart=1.0, loopEnd=1.0+長さ にする。
// こうするとエンコーダーの遅延が何サンプルあっても、ループの両端が曲の同じ位置になり継ぎ目が出ない。
// 使い方: node tools/render-audio.js   （ffmpeg が必要。Netlify のビルドでは実行しない＝生成物をコミットする）
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { SONGS2 } from '../shared/audio/songs2.js';
import { renderSong, SR } from '../shared/audio/synth2.js';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const master = join(here, 'audio-master');
const files = join(here, 'shared', 'audio', 'files');
rmSync(master, { recursive: true, force: true }); mkdirSync(master, { recursive: true }); mkdirSync(files, { recursive: true });
const tmp = join(here, 'audio-master', '_tmp.wav');

function wav(L, R) {
  const n = L.length; const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); }
  return b;
}
function pad(L, R) { // 末尾 1 秒＋曲＋先頭 1 秒
  const p = SR; const n = L.length; const oL = new Float32Array(n + 2 * p), oR = new Float32Array(n + 2 * p);
  oL.set(L.subarray(n - p), 0); oR.set(R.subarray(n - p), 0); oL.set(L, p); oR.set(R, p); oL.set(L.subarray(0, p), n + p); oR.set(R.subarray(0, p), n + p);
  return [oL, oR];
}
const manifest = {};
const report = [];
for (const [name, song] of Object.entries(SONGS2)) {
  const hasHot = song.tracks.some((t) => t.stem === 'hot');
  const t0 = Date.now();
  const base = renderSong(song, { stem: hasHot ? 'base' : null });
  const stems = [['', base]];
  if (hasHot) stems.push(['-hot', renderSong(song, { stem: 'hot', pre: base.pre })]);
  for (const [suf, r] of stems) {
    writeFileSync(tmp, wav(r.L, r.R));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'flac', join(master, `${name}${suf}.flac`)]);
    const [pL, pR] = song.loop ? pad(r.L, r.R) : [r.L, r.R];
    writeFileSync(tmp, wav(pL, pR));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'libmp3lame', '-b:a', '192k', join(files, `${name}${suf}.mp3`)]);
  }
  manifest[name] = { file: `${name}.mp3`, hot: hasHot ? `${name}-hot.mp3` : null, loop: !!song.loop, loopStart: song.loop ? 1.0 : 0, loopEnd: song.loop ? 1.0 + base.loopEnd : base.length, length: base.length, tempo: song.tempo };
  report.push({ name, sec: base.length.toFixed(2), loop: !!song.loop, hot: hasHot, ms: Date.now() - t0 });
}
rmSync(tmp, { force: true });
writeFileSync(join(files, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.table(report);
