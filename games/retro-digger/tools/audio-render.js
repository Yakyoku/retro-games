// 音源を Node で書き出して数値を確かめる（耳で聞く代わりではない）。
// 使い方: node tools/audio-render.js [WAV を書き出すフォルダ]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WSGCore } from '../shared/audio/wsg-core.js';
import { TRACKS, JINGLES } from '../shared/audio/tracks.js';
import { SFX, sfxLength } from '../shared/audio/sfx-defs.js';

const SR = 48000, outDir = process.argv[2];
if (outDir) mkdirSync(outDir, { recursive: true });

function run(name, sec, setup) {
  const c = new WSGCore(SR);
  setup(c);
  const n = Math.round(sec * SR), L = new Float32Array(n), R = new Float32Array(n);
  const t0 = performance.now();
  for (let i = 0; i < n; i += 128) c.render(L.subarray(i, i + 128), R.subarray(i, i + 128), Math.min(128, n - i));
  const ms = performance.now() - t0;
  let peak = 0, sum = 0, sq = 0, nan = 0, big = 0, maxJump = 0;
  for (let i = 0; i < n; i++) for (const a of [L, R]) {
    const x = a[i]; if (!Number.isFinite(x)) nan++;
    peak = Math.max(peak, Math.abs(x)); sum += x; sq += x * x;
    if (i) { const j = Math.abs(x - a[i - 1]); maxJump = Math.max(maxJump, j); if (j > 0.25) big++; }
  }
  const row = { name, sec: +sec.toFixed(2), peak: +peak.toFixed(3), rmsDb: +(20 * Math.log10(Math.sqrt(sq / (2 * n)) + 1e-12)).toFixed(1),
    dc: +(sum / (2 * n)).toExponential(1), nan, maxJump: +maxJump.toFixed(3), jumps025: big, speed: +((sec * 1000) / ms).toFixed(0) + 'x' };
  if (outDir) writeWav(join(outDir, name.replace(/[^\w-]/g, '_') + '.wav'), L, R);
  return row;
}
function writeWav(file, L, R) {
  const n = L.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round(L[i] * 32767), 44 + i * 4); b.writeInt16LE(Math.round(R[i] * 32767), 46 + i * 4); }
  writeFileSync(file, b);
}

const rows = [];
for (const name of Object.keys(TRACKS)) rows.push(run(name, TRACKS[name].seconds + 1, (c) => { c.handle({ type: 'walk', on: true }); c.handle({ type: 'music', name }); }));
// 歩く/止まるを 0.37 秒ごとに切り替える（つぎはぎのクリックを数える）
rows.push(run('walk-toggle', 8, (c) => {
  c.handle({ type: 'music', name: 'stage-soil' });
  for (let k = 0; k < 22; k++) c.handle({ type: 'walk', on: k % 2 === 0, at: Math.round(k * 0.37 * SR) });
}));
for (const name of Object.keys(JINGLES)) rows.push(run('jingle-' + name, JINGLES[name].seconds + 0.4, (c) => c.handle({ type: 'jingle', name, id: 1 })));
for (const name of Object.keys(SFX)) rows.push(run('sfx-' + name, sfxLength(name, { stage: 3 }) + 0.2, (c) => c.handle({ type: 'sfx', name, opts: { stage: 3 } })));
for (const kind of ['soil', 'crystal', 'volcano']) rows.push(run('amb-' + kind, 10, (c) => c.handle({ type: 'amb', kind })));
// 全部いっしょ（最悪の重なり）
rows.push(run('stress', 3, (c) => {
  c.handle({ type: 'vol', master: 1, bgm: 1, sfx: 1, amb: 1 }); c.handle({ type: 'walk', on: true });
  c.handle({ type: 'music', name: 'stage-volcano' }); c.handle({ type: 'amb', kind: 'volcano' });
  let k = 0; for (const n of Object.keys(SFX)) c.handle({ type: 'sfx', name: n, opts: { stage: 5 }, at: (k++ * 2400) });
}));
console.table(rows);
