// ORBITAL WINGS — 全曲・全効果音を書き出して数値で点検する（Node 22）
//   node tools/render-audio.js                 … 点検して audio-masters/ に試聴用 .ogg（＋ WAV。WAV は git に入れない）と report.json を書く
//   node tools/render-audio.js --no-write      … 点検だけ（速い）
//   node tools/render-audio.js --only stage1,shot --no-ogg
//   node tools/render-audio.js --retro         … レトロ音源（従来の PSG・波形メモリ）の点検と audio-masters/retro/ への書き出し
// 音は 48000Hz ステレオで作って測る。耳で聴けない環境なので、次を数値で確かめる:
//   ピーク・真のピーク（4 倍補間）・統合ラウドネス（BS.1770）・オクターブ帯域・左右の相関・直流・クリップ・NaN・
//   ループ 1 周目と 2 周目の一致・曲の作り（小節・トラック長・調の中の音の割合・旋律と和音の協和）・計算時間
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModernSynth } from '../shared/audio/modern.js';
import { ChipSynth } from '../shared/audio/chip.js';
import { SoundCore } from '../shared/audio/core.js';
import { MSONGS, parseChord } from '../shared/audio/songs2.js';
import { MSFX } from '../shared/audio/sfx2.js';
import { SONGS } from '../shared/audio/songs.js';
import { SFX } from '../shared/audio/sfx.js';
import { basic, truePeak, loudness, bands, BANDS, minCorr, writeWav } from './audio-metrics.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'audio-masters');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const RATE = 48000;
const only = opt('--only', '') ? new Set(opt('--only', '').split(',')) : null;
const write = !args.includes('--no-write');
const wantOgg = write && !args.includes('--no-ogg');
const retro = args.includes('--retro');
const FFMPEG = ['/usr/bin/ffmpeg', 'ffmpeg'].find((p) => { try { execFileSync(p, ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } });
const f = (v, n = 2) => (Number.isFinite(v) ? v.toFixed(n) : String(v));
const TARGET_LUFS = -15;       // 曲の目標（bgm 音量 100% のとき）。全曲 ±1.5 LU 以内にそろえる
let bad = 0; const problems = [];
const fail = (msg) => { bad++; problems.push(msg); };
const report = { rate: RATE, target: TARGET_LUFS, songs: {}, sfx: {}, scenes: {} };

// 計算時間は CPU 時間（user）で測る。同じ機械でほかの処理が動いていても、待たされた時間は数えない
const cpuMs = () => process.cpuUsage().user / 1000;
function renderN(sy, n) { const L = new Float32Array(n), R = new Float32Array(n); const t0 = cpuMs(); sy.renderStereo(L, R); return { L, R, ms: cpuMs() - t0 }; }
function save(name, L, R, dir = OUT) {
  if (!write) return 0;
  fs.mkdirSync(dir, { recursive: true });
  const p = join(dir, `${name}.wav`); writeWav(fs, p, L, R, RATE);
  if (wantOgg && FFMPEG) { try { execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', p, '-c:a', 'libvorbis', '-q:a', '2', join(dir, `${name}.ogg`)]); } catch (e) { console.warn('ogg 変換に失敗', name, e.message); } }
  return fs.statSync(p).size;
}

// ---------------------------------------------------------------- 曲の作りの点検（音を出さずに譜面を見る）
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 9, 10, 11];   // 短調は自然・和声・旋律短音階の和
function musical(id, comp) {
  const def = MSONGS[id];
  const key = parseChord(def.key.replace(/m$/, '') + (def.key.endsWith('m') ? 'm' : ''));
  const scale = def.key.endsWith('m') ? MINOR : MAJOR;
  // 節ごとの移調と、半小節ごとの和音
  const half = []; // {root, ints, k}
  for (const s of def.chords) for (const b of s.bars) { const p = b.split('|').map(parseChord); half.push({ c: p[0], k: s.k }, { c: p[1] || p[0], k: s.k }); }
  let inKey = 0, all = 0, chordTone = 0, tension = 0, clash = 0, strong = 0, lo = 999, hi = -999;
  const ranges = {};
  for (const t of comp.tracks) {
    if (t.drum) continue;
    let tick = 0, mn = 999, mx = -999;
    for (const e of t.events) {
      if (e.t === 'n') {
        const h = half[Math.min(half.length - 1, Math.floor(tick / 48))];
        for (const m of e.ms || [e.m]) {
          if (e.inst === 'riser' || e.inst === 'sweep') continue;
          mn = Math.min(mn, m); mx = Math.max(mx, m);
          const pc = (((m - h.k - key.root) % 12) + 12) % 12;
          all += e.len; if (scale.includes(pc)) inKey += e.len;
          if (t.name === 'lead' && (tick % 48 === 0 || e.len >= 36)) {
            const rel = (((m - h.k - h.c.root) % 12) + 12) % 12;
            const tones = h.c.ints.map((i) => i % 12);
            strong++;
            if (tones.includes(rel)) chordTone++;
            else if (tones.some((x) => (x + 1) % 12 === rel)) { clash++; if (args.includes('--verbose')) console.log(`   ぶつかり ${id} 小節 ${Math.floor(tick / 96) + 1} 拍 ${(tick % 96) / 24 + 1} 音 ${m} 和音 ${h.c.sym}`); }
            else tension++;
          }
        }
      }
      tick += e.len;
    }
    if (mn < 999) { ranges[t.name] = [mn, mx]; if (t.name === 'lead') { lo = mn; hi = mx; } }
  }
  return { inKey: all ? inKey / all : 1, chordTone: strong ? chordTone / strong : 1, clash: strong ? clash / strong : 0, strong, leadRange: [lo, hi], ranges };
}

// ---------------------------------------------------------------- 曲
function renderSong(id) {
  const sy = new ModernSynth(RATE);
  sy.playMusic(id);
  const comp = sy.compiled(id);
  const chunks = []; let loopStart = -1, loopEnd = -1, loop2 = -1, ended = -1, total = 0; const c0 = cpuMs();
  const max = Math.ceil((comp.loop ? comp.introSeconds + comp.loopSeconds * 2 : comp.seconds + 6) * RATE) + RATE;
  while (total < max) {
    const r = renderN(sy, 4096); chunks.push(r); total += 4096;
    for (const e of sy.drainEvents()) {
      if (e.type === 'loopStart' && loopStart < 0) loopStart = e.sample;
      if (e.type === 'loop') { if (e.n === 1) loopEnd = e.sample; if (e.n === 2) loop2 = e.sample; }
      if (e.type === 'ended') ended = e.sample;
    }
    if (comp.loop && loop2 >= 0) break;
    if (!comp.loop && ended >= 0) break;
  }
  const ms = cpuMs() - c0;
  const L = new Float32Array(total), R = new Float32Array(total);
  chunks.forEach((c, i) => { L.set(c.L, i * 4096); R.set(c.R, i * 4096); });
  const len = comp.loop ? loop2 : Math.min(total, ended + Math.round(0.2 * RATE));
  return { L: L.subarray(0, len), R: R.subarray(0, len), comp, loopStart, loopEnd, loop2, cpu: ms / (total / RATE) / 10, sy };
}

function songRow(id) {
  const r = renderSong(id), { L, R, comp } = r;
  const b = basic(L, R), tp = Math.max(truePeak(L), truePeak(R)), lo = loudness(L, R), bd = bands(L, R), mc = minCorr(L, R), mu = musical(id, comp);
  let loopInfo = '1 回', d12 = 0;
  if (comp.loop) {
    const a = loudness(L.subarray(r.loopStart, r.loopEnd), R.subarray(r.loopStart, r.loopEnd)).lufs, c = loudness(L.subarray(r.loopEnd, r.loop2), R.subarray(r.loopEnd, r.loop2)).lufs;
    d12 = c - a;
    const lenA = r.loopEnd - r.loopStart, lenB = r.loop2 - r.loopEnd;
    loopInfo = `${f((r.loopStart) / RATE, 1)}→${f(r.loopEnd / RATE, 1)} Δ${f(d12, 2)}LU`;
    if (Math.abs(lenA - lenB) > 64) fail(`${id}: ループの長さが周ごとに違う ${lenA} / ${lenB}`);
    if (Math.abs(d12) > 0.5) fail(`${id}: ループ 1 周目と 2 周目の音量が違う ${f(d12)} LU`);
  }
  if (b.nan) fail(`${id}: NaN`);
  if (b.clip) fail(`${id}: クリップ ${b.clip}`);
  if (tp > 1.0) fail(`${id}: 真のピーク ${f(tp, 3)}`);
  if (Math.abs(lo.lufs - TARGET_LUFS) > 1.5) fail(`${id}: ラウドネス ${f(lo.lufs)} LUFS（目標 ${TARGET_LUFS}±1.5）`);
  if (b.corr < 0.3) fail(`${id}: 左右の相関 ${f(b.corr)}（モノラルで痩せる）`);
  if (Math.abs(b.dc) > 1e-3) fail(`${id}: 直流 ${b.dc}`);
  if (r.sy.steals) fail(`${id}: 声が足りない（奪った回数 ${r.sy.steals}）`);
  if (comp.errors.length) fail(`${id}: 記法の誤り ${comp.errors[0]}`);
  if (mu.clash > 0.08) fail(`${id}: 旋律と和音のぶつかり ${f(mu.clash * 100, 0)}%`);
  console.log(id.padEnd(9) + `${f(L.length / RATE, 1).padStart(6)} ${f(b.peak, 3)} ${f(tp, 3)} ${f(lo.lufs, 1).padStart(6)} ${f(lo.range, 1).padStart(4)} ${f(b.corr, 2)}/${f(mc, 2)} ${b.dc.toExponential(0).padStart(6)} ${String(b.clip).padStart(2)}  ` +
    bd.db.map((v) => f(v, 0).padStart(4)).join('') + `  ${f(r.cpu, 2).padStart(5)} ${String(r.sy.peakVoices).padStart(3)}  ${f(mu.inKey * 100, 0).padStart(3)}% ${f(mu.chordTone * 100, 0).padStart(3)}%/${f(mu.clash * 100, 0)}%  ${loopInfo}`);
  report.songs[id] = { seconds: L.length / RATE, peak: b.peak, truePeak: tp, lufs: lo.lufs, range: lo.range, corr: b.corr, minCorr: mc, dc: b.dc, clip: b.clip, bands: bd.db, centroid: bd.centroid,
    cpuPercent: r.cpu, voices: r.sy.peakVoices, inKey: mu.inKey, chordTone: mu.chordTone, clash: mu.clash, loopDelta: d12, intro: comp.introSeconds, loop: comp.loopSeconds, bars: comp.totalTicks / 96, trimSuggest: TARGET_LUFS - lo.lufs, ranges: mu.ranges };
  // 試聴用: 前奏＋1 周＋次の周の頭 4 秒を消しながら
  if (write) {
    let n = L.length;
    if (comp.loop) { n = Math.min(L.length, r.loopEnd + 4 * RATE); }
    const l = L.slice(0, n), rr = R.slice(0, n);
    if (comp.loop) for (let i = 0; i < 4 * RATE && n - 1 - i >= 0; i++) { const g = i / (4 * RATE); l[n - 1 - i] *= g; rr[n - 1 - i] *= g; }
    return save(`bgm_${id}`, l, rr);
  }
  return 0;
}

// ---------------------------------------------------------------- 効果音
function sfxRow(name) {
  const sy = new ModernSynth(RATE), def = sy.sfxDefs[name];
  sy.sfx(name);
  const n = Math.ceil((def.seconds + 1.6) * RATE);
  const { L, R } = renderN(sy, n);
  const b = basic(L, R), lo = loudness(L, R), bd = bands(L, R);
  // 聞こえる長さ（最後に -50dB を超えた時刻）
  let last = 0; for (let i = n - 1; i > 0; i--) if (Math.abs(L[i]) > 0.003 || Math.abs(R[i]) > 0.003) { last = i; break; }
  if (b.nan) fail(`${name}: NaN`);
  if (b.clip) fail(`${name}: クリップ`);
  if (b.peak < 0.02) fail(`${name}: ほぼ無音 peak ${b.peak}`);
  if (Math.abs(b.dc) > 2e-3) fail(`${name}: 直流 ${b.dc}`);
  console.log(name.padEnd(16) + `${String(def.pri).padStart(2)} ${f(last / RATE, 2).padStart(5)} ${f(b.peak, 3)} ${f(lo.momentaryMax, 1).padStart(6)} ${f(b.corr, 2).padStart(5)} ${f(bd.centroid, 0).padStart(6)}  ` + bd.db.map((v) => f(v, 0).padStart(4)).join(''));
  report.sfx[name] = { pri: def.pri, seconds: last / RATE, peak: b.peak, momentaryMax: lo.momentaryMax, corr: b.corr, centroid: bd.centroid, bands: bd.db };
  return write ? save(`sfx_${name}`, L.subarray(0, Math.min(n, last + RATE / 2)), R.subarray(0, Math.min(n, last + RATE / 2))) : 0;
}

// ---------------------------------------------------------------- 場面の点検
function scenes() {
  console.log('\n■ 場面の点検');
  // 1) 連射: 曲（stage1）＋ shot を毎秒 10 回。曲だけのときより何 LU 上がるか（上がりすぎ = 耳が疲れる）
  {
    const a = new ModernSynth(RATE), b = new ModernSynth(RATE); a.playMusic('stage1'); b.playMusic('stage1');
    renderN(a, RATE * 8); renderN(b, RATE * 8);
    const A = renderN(a, RATE * 6); const Ls = [], Rs = [];
    for (let i = 0; i < 60; i++) { b.sfx('shot'); const r = renderN(b, RATE / 10); Ls.push(r.L); Rs.push(r.R); }
    const cat = (l) => { const o = new Float32Array(l.length * l[0].length); l.forEach((x, i) => o.set(x, i * x.length)); return o; };
    const la = loudness(A.L, A.R).lufs, lb = loudness(cat(Ls), cat(Rs)).lufs;
    const s = new ModernSynth(RATE); const one = []; const oneR = [];
    for (let i = 0; i < 30; i++) { s.sfx('shot'); const r = renderN(s, RATE / 10); one.push(r.L); oneR.push(r.R); }
    const ls = loudness(cat(one), cat(oneR)).lufs;
    console.log(`連射（shot 10 回/秒）: 曲だけ ${f(la)} LUFS → 曲＋連射 ${f(lb)} LUFS（+${f(lb - la)} LU）。連射だけ ${f(ls)} LUFS（曲より ${f(ls - la)} LU）。同時に鳴る shot は ${s.sfxActive().filter((x) => x === 'shot').length} 個`);
    report.scenes.fire = { music: la, withFire: lb, fireOnly: ls };
    if (lb - la > 2.5) fail(`連射で全体が ${f(lb - la)} LU 上がる（大きすぎ）`);
    if (ls - la > -4) fail(`連射の音量が曲に近すぎる ${f(ls - la)} LU`);
    if (ls - la < -20) fail(`連射が小さすぎる ${f(ls - la)} LU`);
  }
  // 2) いちばん重い場面: 強さ 2・残機最後のボス曲＋効果音を毎フレーム → ピークと計算時間
  for (const song of ['boss', 'final', 'stage7']) {
    const sy = new ModernSynth(RATE); sy.playMusic(song); sy.setIntensity(2); sy.setLayer('danger', true);
    const names = ['explode_l', 'boss_explode', 'player_die', 'laser', 'explode_m', 'shield_on', 'double', 'part_destroyed', 'boss_beam', 'warning', 'phase_change', 'zap_beam'];
    let pk = 0; const n = 800, per = [];
    for (let sec = 0; sec < 20; sec++) {
      const c0 = cpuMs();
      for (let k = 0; k < 60; k++) {
        const i = sec * 60 + k;
        sy.sfx(names[i % names.length], { pan: ((i * 37) % 200) / 100 - 1 }); sy.sfx('shot'); sy.sfx('explode_s'); sy.sfx('enemy_hit');
        const r = renderN(sy, n); const b = basic(r.L, r.R); pk = Math.max(pk, b.peak); if (b.nan) fail(`${song} 重い場面で NaN`);
      }
      per.push((cpuMs() - c0) / 10);
    }
    per.sort((a, b) => a - b);
    const cpu = per[5];           // 下から 1/4 の値（ほかの処理に邪魔された秒を除く）
    console.log(`最大負荷 ${song}（強さ 2＋danger＋効果音を毎フレーム 4 種）: peak ${f(pk, 3)}  計算 ${f(cpu, 2)}%（1 コア）  声の最大 ${sy.peakVoices}  リミッター最小 ${f(sy.grMin, 2)}`);
    report.scenes['max_' + song] = { peak: pk, cpuPercent: cpu, voices: sy.peakVoices, limiterMin: sy.grMin };
    if (pk >= 0.985) fail(`${song}: 最大負荷でピーク ${pk}`);
    if (cpu > 10) fail(`${song}: 計算が重い ${f(cpu)}%`);
  }
  // 3) 動的な層: 強さ 0 → 1 → 2、danger で何 LU 変わるか
  for (const song of ['boss', 'final', 'stage1']) {
    const lv = [];
    for (const [n, dg] of [[0, false], [1, false], [2, false], [0, true]]) {
      const sy = new ModernSynth(RATE); sy.setIntensity(n); sy.setLayer('danger', dg); sy.playMusic(song);
      const r = renderN(sy, RATE * 24); lv.push(loudness(r.L.subarray(RATE * 4), r.R.subarray(RATE * 4)).lufs);
    }
    console.log(`動的な層 ${song}: 強さ 0 ${f(lv[0])} / 1 ${f(lv[1])}（+${f(lv[1] - lv[0])}）/ 2 ${f(lv[2])}（+${f(lv[2] - lv[0])}）/ danger ${f(lv[3])}（+${f(lv[3] - lv[0])}） LUFS`);
    report.scenes['layers_' + song] = lv;
    if (lv[1] - lv[0] < 0.15 || lv[2] - lv[1] < 0.1 || lv[3] - lv[0] < 0.1) fail(`${song}: 層を足しても音が変わらない`);
    if (lv[2] - lv[0] > 4) fail(`${song}: 層を足すと大きくなりすぎる`);
  }
  // 4) 一時停止のローパス: 2kHz より上が 20dB 以上下がり、低域は残る。解除で戻る
  {
    const sy = new ModernSynth(RATE); sy.playMusic('stage1'); renderN(sy, RATE * 8);
    const hi = (r) => { const b = bands(r.L, r.R).db; const tot = 10 * Math.log10(basic(r.L, r.R).rms ** 2 + 1e-12); return [tot + 10 * Math.log10(b.slice(6).reduce((a, v) => a + 10 ** (v / 10), 0)), tot + 10 * Math.log10(b.slice(0, 4).reduce((a, v) => a + 10 ** (v / 10), 0))]; };
    const a = hi(renderN(sy, RATE * 3)); sy.setPaused(true); renderN(sy, RATE / 2); const p = hi(renderN(sy, RATE * 3)); sy.setPaused(false); renderN(sy, RATE / 2); const c = hi(renderN(sy, RATE * 3));
    console.log(`一時停止: 高域(2kHz〜) ${f(a[0])} → ${f(p[0])} → ${f(c[0])} dB、低域(〜350Hz) ${f(a[1])} → ${f(p[1])} → ${f(c[1])} dB`);
    report.scenes.pause = { before: a, paused: p, after: c };
    if (a[0] - p[0] < 18) fail('一時停止で高域が下がらない');
    if (a[1] - p[1] > 12) fail('一時停止で低域まで消えている');
    if (Math.abs(a[0] - c[0]) > 4) fail('一時停止の解除で音が戻らない');
  }
  // 5) 開始ファンファーレ → 面の曲: 切れ目（無音）が無いこと
  {
    const sy = new ModernSynth(RATE); sy.playMusic('stage1', { lead: true, restart: true });
    const r = renderN(sy, RATE * 8); const w = Math.round(0.06 * RATE); let quiet = 0, worst = 1;
    for (let s = Math.round(0.3 * RATE); s + w < r.L.length; s += w / 2) { const e = basic(r.L.subarray(s, s + w), r.R.subarray(s, s + w)).rms; if (e < 0.004) quiet++; worst = Math.min(worst, e); }
    const pos = sy.musicPosition();
    console.log(`開始ファンファーレ → stage1: 60ms 窓の最小 RMS ${f(worst, 4)}（無音の窓 ${quiet}）、8 秒後の位置 ${pos.id} 小節 ${pos.bar}`);
    report.scenes.leadIn = { minRms: worst, quiet };
    if (quiet) fail('ファンファーレと面の曲の間に無音がある');
    if (pos.id !== 'stage1' || pos.lead) fail('ファンファーレから面の曲へ進んでいない');
  }
  // 6) テープストップ: 約 1 秒で落ち、次の曲（gameover）が始まる。段差なし
  {
    const sy = new ModernSynth(RATE); sy.playMusic('stage3'); renderN(sy, RATE * 6);
    const st = (x) => { let m = 0; for (let i = 1; i < x.length; i++) m = Math.max(m, Math.abs(x[i] - x[i - 1])); return m; };
    const ref = st(renderN(sy, RATE * 2).L);
    sy.playMusic('gameover', { mode: 'tape', fade: 0.9 });
    const r = renderN(sy, RATE * 3); const mx = st(r.L);
    console.log(`テープストップ → gameover: 3 秒後の曲 ${sy.musicPosition().id}、最大の 1 標本の段差 ${f(mx, 3)}（ふだんの曲 ${f(ref, 3)}）`);
    if (mx > ref * 1.5 + 0.02) fail('テープストップで段差（クリック）');
    if (sy.musicPosition().id !== 'gameover') fail('テープストップのあと次の曲が始まらない');
  }
  // 7) 無音のあと（非正規化数）でも遅くならない
  {
    const sy = new ModernSynth(RATE); sy.playMusic('clear'); renderN(sy, RATE * 12);
    const r = renderN(sy, RATE * 20);
    console.log(`無音の計算: ${f(r.ms / 20 / 10, 2)}%（1 コア）`);
    report.scenes.idleCpu = r.ms / 20 / 10;
  }
}

function retroRun() {
  console.log('■ レトロ音源（従来の PSG・波形メモリ。モノラル）');
  console.log('曲        長さ(s) peak   LUFS');
  for (const id of Object.keys(SONGS)) {
    if (only && !only.has(id)) continue;
    const sy = new ChipSynth(RATE); sy.playMusic(id); const comp = sy.compiled(id);
    const n = Math.ceil((comp.loop ? comp.introSeconds + comp.loopSeconds : comp.seconds + 0.5) * RATE);
    const { L, R } = renderN(sy, n); const b = basic(L, R), lo = loudness(L, R);
    if (b.nan || b.clip) fail(`retro ${id}`);
    console.log(id.padEnd(9) + `${f(n / RATE, 1).padStart(6)} ${f(b.peak, 3)} ${f(lo.lufs, 1)}`);
    save(`bgm_${id}`, L, null, join(OUT, 'retro'));
  }
  for (const name of Object.keys(SFX)) {
    if (only && !only.has(name)) continue;
    const sy = new ChipSynth(RATE); sy.sfx(name); const { L, R } = renderN(sy, Math.ceil((SFX[name].frames.length / 60 + 0.3) * RATE));
    const b = basic(L, R); if (b.nan || b.clip) fail(`retro ${name}`);
    save(`sfx_${name}`, L, null, join(OUT, 'retro'));
  }
  // 切り替え: モダン → レトロ → モダンで NaN・クリップ・大きな段差が出ない
  const core = new SoundCore(RATE); core.playMusic('stage2'); let pk = 0, nan = 0;
  for (let i = 0; i < 12; i++) { if (i === 3) core.setMode('retro'); if (i === 7) core.setMode('modern'); const r = renderN(core, RATE); const b = basic(r.L, r.R); pk = Math.max(pk, b.peak); nan += b.nan; }
  console.log(`音源の切り替え（モダン→レトロ→モダン）: peak ${f(pk, 3)} NaN ${nan} 位置 ${JSON.stringify(core.musicPosition().id)}`);
  if (nan || pk >= 0.985) fail('切り替えで音が壊れる');
}

// ================================================================
console.log(`モダン音源 ${RATE}Hz ステレオ${write ? ` → ${OUT}${FFMPEG && wantOgg ? '（.ogg も）' : ''}` : '（点検のみ）'}`);
let bytes = 0;
if (retro) retroRun();
else {
  console.log('曲        長さ(s) peak  真peak   LUFS 幅   相関/最小   DC  クリップ  帯域(dB) ' + BANDS.map((b) => (b >= 1000 ? b / 1000 + 'k' : String(b)).padStart(4)).join('').slice(9) + '   CPU%  声  調内 和音音/ぶつかり ループ');
  for (const id of Object.keys(MSONGS)) { if (only && !only.has(id)) continue; bytes += songRow(id); }
  const ls = Object.values(report.songs).map((s) => s.lufs);
  if (ls.length > 1) console.log(`曲のラウドネス: ${f(Math.min(...ls))} 〜 ${f(Math.max(...ls))} LUFS（幅 ${f(Math.max(...ls) - Math.min(...ls))} LU、目標 ${TARGET_LUFS}±1.5）`);
  console.log('\n効果音          優先 長さ(s) peak 最大瞬間LUFS 相関 重心(Hz)  帯域(dB)');
  for (const name of Object.keys(MSFX)) { if (name === 'gauge') continue; if (only && !only.has(name)) continue; bytes += sfxRow(name); }
  if (!only) scenes();
  if (write && !only) fs.writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v), 1));
}
console.log(`\n${write ? `WAV 合計 ${(bytes / 1048576).toFixed(1)} MB。` : ''}問題: ${bad} 件`);
for (const p of problems) console.log('  - ' + p);
if (bad) process.exitCode = 1;
