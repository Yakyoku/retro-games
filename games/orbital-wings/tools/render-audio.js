// ORBITAL WINGS — 全曲・全効果音を WAV に書き出して数値で点検する（Node 22）
//   node tools/render-audio.js            … audio-masters/ に 22050Hz モノラル 16bit WAV（＋ ffmpeg があれば .ogg）
//   node tools/render-audio.js --rate 44100   … 書き出しの標本化周波数を変える（44100 か 22050）
//   node tools/render-audio.js --no-ogg --only stage1,shot
// 音は常に 44100Hz で作って点検する（ピーク・RMS・直流・クリップ数・ループの継ぎ目）。
// 22050Hz で書くときは 63 タップの窓付き sinc で半分に間引く（試聴用の原盤を小さく保つため）。
import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChipSynth } from '../shared/audio/chip.js';
import { SONGS } from '../shared/audio/songs.js';
import { SFX } from '../shared/audio/sfx.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'audio-masters');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const WRITE_RATE = Number(opt('--rate', 22050));
const RATE = 44100;
const only = opt('--only', '') ? new Set(opt('--only', '').split(',')) : null;
const wantOgg = !args.includes('--no-ogg');
const FFMPEG = ['/usr/bin/ffmpeg', 'ffmpeg'].find((p) => { try { execFileSync(p, ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } });

mkdirSync(OUT, { recursive: true });

function renderSong(id) {
  const sy = new ChipSynth(RATE);
  sy.setVolumes({ master: 1, bgm: 1, sfx: 1 });
  sy.playMusic(id);
  const comp = sy.compiled(id);
  const chunk = 1024, chunks = [];
  let loopStart = -1, loopEnd = -1, loops = 0, ended = -1, total = 0;
  const maxSamples = Math.ceil((comp.loop ? comp.introSeconds + comp.loopSeconds * 2 : comp.seconds + 3) * RATE) + RATE;
  while (total < maxSamples) {
    const buf = new Float32Array(chunk); sy.render(buf); chunks.push(buf); total += chunk;
    for (const e of sy.drainEvents()) {
      if (e.type === 'loopStart' && loopStart < 0) loopStart = e.sample;
      if (e.type === 'loop') { loops = e.n; if (e.n === 1) loopEnd = e.sample; }
      if (e.type === 'ended') ended = e.sample;
    }
    if (comp.loop && loops >= 3) break;
    if (!comp.loop && ended >= 0 && total > ended + RATE * 0.25) break;
  }
  const all = concat(chunks);
  let len;
  if (comp.loop) {
    if (loopStart < 0) loopStart = 0; // 前奏なし
    const loopLen = loopEnd - loopStart;
    len = loopStart + 2 * loopLen;
  } else len = ended >= 0 ? Math.min(all.length, ended + Math.round(RATE * 0.25)) : all.length;
  return { data: all.subarray(0, len), loopStart, loopEnd, comp, loops };
}

function renderSfx(name) {
  const sy = new ChipSynth(RATE);
  sy.sfx(name);
  const n = Math.ceil((SFX[name].frames.length / 60 + 0.35) * RATE);
  const buf = new Float32Array(n); sy.render(buf);
  return { data: buf };
}

function concat(list) { let n = 0; for (const a of list) n += a.length; const out = new Float32Array(n); let o = 0; for (const a of list) { out.set(a, o); o += a.length; } return out; }

function stats(x) {
  let peak = 0, sum = 0, sq = 0, clip = 0, nan = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (!Number.isFinite(v)) { nan++; continue; }
    const a = Math.abs(v); if (a > peak) peak = a; if (a > 0.99) clip++;
    sum += v; sq += v * v;
  }
  return { peak, rms: Math.sqrt(sq / x.length), dc: sum / x.length, clip, nan };
}

// 0.25 秒ごとに 2048 点の FFT で重心を出し、音のある所だけの平均（大まかな明るさ）
function centroid(x, rate) {
  const N = 2048, hop = Math.round(rate * 0.25), re = new Float64Array(N), im = new Float64Array(N);
  const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  let acc = 0, cnt = 0;
  for (let s = 0; s + N <= x.length; s += hop) {
    let e = 0;
    for (let i = 0; i < N; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; e += re[i] * re[i]; }
    if (e < 1e-4) continue;
    fft(re, im);
    let num = 0, den = 0;
    for (let k = 1; k < N / 2; k++) { const m = Math.hypot(re[k], im[k]); num += m * k * rate / N; den += m; }
    if (den > 0) { acc += num / den; cnt++; }
  }
  return cnt ? acc / cnt : 0;
}
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j], k = i + j + len / 2;
        const vr = re[k] * cr - im[k] * ci, vi = re[k] * ci + im[k] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi; re[k] = ur - vr; im[k] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

function decimate2(x) {
  const T = 63, h = new Float64Array(T), M = (T - 1) / 2;
  let s = 0;
  for (let i = 0; i < T; i++) { const k = i - M; const sinc = k === 0 ? 0.5 : Math.sin(Math.PI * 0.5 * k) / (Math.PI * k); const w = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (T - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (T - 1)); h[i] = sinc * w; s += h[i]; }
  for (let i = 0; i < T; i++) h[i] /= s;
  const out = new Float32Array(Math.floor(x.length / 2));
  for (let o = 0; o < out.length; o++) { let acc = 0; const c = o * 2; for (let i = 0; i < T; i++) { const j = c + i - M; if (j >= 0 && j < x.length) acc += x[j] * h[i]; } out[o] = acc; }
  return out;
}

function writeWav(path, x, rate) {
  const n = x.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  writeFileSync(path, buf);
}

function seam(x, a, b) {
  // ループを切り貼りしたときの継ぎ目: x[b-1] の次に x[a] が来る。ふだんの 1 サンプルの差（99 パーセンタイル）と比べる
  const jump = Math.abs(x[b - 1] - x[a]);
  const d = []; for (let i = 1; i < x.length; i += 7) d.push(Math.abs(x[i] - x[i - 1]));
  d.sort((p, q) => p - q);
  return { jump, p99: d[Math.floor(d.length * 0.99)] };
}

const f = (v, n = 3) => v.toFixed(n);
const rows = [];
let bad = 0, bytes = 0;
const out = (name, x) => {
  const data = WRITE_RATE === RATE ? x : decimate2(x);
  const p = join(OUT, `${name}.wav`); writeWav(p, data, WRITE_RATE); bytes += statSync(p).size;
  if (wantOgg && FFMPEG) { try { execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', p, '-c:a', 'libvorbis', '-q:a', '4', join(OUT, `${name}.ogg`)]); } catch (e) { console.warn('ogg 変換に失敗', name, e.message); } }
};

console.log(`音源 ${RATE}Hz で生成 → 書き出し ${WRITE_RATE}Hz モノラル 16bit → ${OUT}${FFMPEG && wantOgg ? '（.ogg も）' : ''}`);
console.log('曲'.padEnd(12) + '長さ(s)  peak   RMS     DC        >0.99  明るさ(Hz)  前奏/ループ(s)        継ぎ目の段差 (普段の99%値)');
for (const id of Object.keys(SONGS)) {
  if (only && !only.has(id)) continue;
  const r = renderSong(id), s = stats(r.data), c = centroid(r.data, RATE);
  let loopInfo = '1 回で終わる', seamInfo = '';
  if (r.comp.loop) {
    loopInfo = `${f(r.loopStart / RATE, 2)} → ${f(r.loopEnd / RATE, 2)}`;
    const sm = seam(r.data, r.loopStart, r.loopEnd);
    seamInfo = `${f(sm.jump, 4)} (${f(sm.p99, 4)})`;
    if (sm.jump > Math.max(0.05, sm.p99 * 3)) { seamInfo += ' ← 大きい'; }
  }
  if (s.nan || s.clip || s.peak >= 1) bad++;
  console.log(id.padEnd(12) + `${f(r.data.length / RATE, 2).padStart(6)}  ${f(s.peak)}  ${f(s.rms, 4)}  ${s.dc.toExponential(1).padStart(8)}  ${String(s.clip).padStart(5)}  ${f(c, 0).padStart(9)}   ${loopInfo.padEnd(20)}  ${seamInfo}${s.nan ? '  NaN!' : ''}`);
  rows.push({ id, ...s, seconds: r.data.length / RATE, centroid: c });
  out(`bgm_${id}`, r.data);
}
console.log('\n効果音'.padEnd(13) + '長さ(s)  peak   RMS     DC        >0.99  明るさ(Hz)');
for (const name of Object.keys(SFX)) {
  if (only && !only.has(name)) continue;
  const r = renderSfx(name), s = stats(r.data), c = centroid(r.data, RATE);
  if (s.nan || s.clip || s.peak >= 1) bad++;
  console.log(name.padEnd(12) + `${f(r.data.length / RATE, 2).padStart(6)}  ${f(s.peak)}  ${f(s.rms, 4)}  ${s.dc.toExponential(1).padStart(8)}  ${String(s.clip).padStart(5)}  ${f(c, 0).padStart(9)}${s.nan ? '  NaN!' : ''}`);
  out(`sfx_${name}`, r.data);
}
console.log(`\nWAV 合計 ${(bytes / 1048576).toFixed(1)} MB。問題（NaN・クリップ・peak>=1）: ${bad} 件`);
if (bad) process.exitCode = 1;
