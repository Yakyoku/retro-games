// 音源マスター（可逆の 16bit/44.1kHz WAV）を書き出す。ゲームは同じ synth.js で実行時に同じ波形を作るので、
// この WAV は配布物には入れない（制作マスター・比較用）。使い方: node tools/render-audio.js [出力先]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SONGS } from '../shared/audio/songs.js';
import { renderSong, SFX_DEFS, carHumLoop, SR, parseMML } from '../shared/audio/synth.js';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(here, 'audio-master');
mkdirSync(out, { recursive: true });

function wav(data) {
  const n = data.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  let peak = 0;
  for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, data[i])); peak = Math.max(peak, Math.abs(v)); b.writeInt16LE(Math.round(v * 32767), 44 + i * 2); }
  return { b, peak };
}
const report = [];
for (const [name, song] of Object.entries(SONGS)) {
  const lens = song.tracks.map((t) => parseMML(t.mml, song.tempo).length.toFixed(3));
  const r = renderSong(song);
  const { b, peak } = wav(r.data);
  writeFileSync(join(out, `bgm-${name}.wav`), b);
  report.push({ name, sec: r.length.toFixed(2), loop: r.loop, trackLens: lens, peak: peak.toFixed(3) });
}
for (const [name, fn] of Object.entries(SFX_DEFS)) {
  const d = fn();
  const { b, peak } = wav(d);
  writeFileSync(join(out, `sfx-${name}.wav`), b);
  report.push({ name: 'sfx:' + name, sec: (d.length / SR).toFixed(3), peak: peak.toFixed(3) });
}
const hum = carHumLoop();
writeFileSync(join(out, 'sfx-carHum-loop.wav'), wav(hum.data).b);
console.table(report);
