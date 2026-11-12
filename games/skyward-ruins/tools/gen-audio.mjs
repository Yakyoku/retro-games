// Skyward Ruins の音源をすべて新規に合成して WAV へ書き出す（原曲・原音は使わない）。
// 方式: 1980 年代前半のアーケード基板に多い「短い波形表（32 サンプル×4bit）を読む 3 声＋ノイズ」を近似した独自シンセ。
// 出力: unity/SkywardRuins/Assets/SkywardRuins/Audio/*.wav（22,050Hz・16bit・モノラル）と audio.json（ループ・音量・優先度）
// 実行: node tools/gen-audio.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'unity', 'SkywardRuins', 'Assets', 'SkywardRuins', 'Audio');
mkdirSync(OUT, { recursive: true });
const SR = 22050;

// ---- 波形表（32 サンプル、0..15 の 4bit） ----
const q4 = f => Array.from({ length: 32 }, (_, i) => Math.max(0, Math.min(15, Math.round(7.5 + 7.5 * f(i / 32)))));
const WAVES = {
  pulse25: q4(t => (t < 0.25 ? 1 : -1)),
  pulse50: q4(t => (t < 0.5 ? 1 : -1)),
  tri: q4(t => (t < 0.5 ? 4 * t - 1 : 3 - 4 * t)),
  saw: q4(t => 2 * t - 1),
  organ: q4(t => 0.6 * Math.sin(2 * Math.PI * t) + 0.3 * Math.sin(4 * Math.PI * t) + 0.25 * Math.sin(6 * Math.PI * t)),
  hollow: q4(t => 0.7 * Math.sin(2 * Math.PI * t) + 0.45 * Math.sin(6 * Math.PI * t)),
  bell: q4(t => 0.55 * Math.sin(2 * Math.PI * t) + 0.35 * Math.sin(10 * Math.PI * t) + 0.2 * Math.sin(14 * Math.PI * t)),
  bass: q4(t => 0.8 * Math.sin(2 * Math.PI * t) + 0.3 * (t < 0.5 ? 1 : -1)),
};
const wv = (name, ph) => (WAVES[name][Math.floor(((ph % 1) + 1) % 1 * 32)] - 7.5) / 7.5;

const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
function freq(n) { const m = /^([A-G][b#]?)(-?\d)$/.exec(n); const midi = 12 * (+m[2] + 1) + NOTE[m[1]]; return 440 * Math.pow(2, (midi - 69) / 12); }

// LFSR ノイズ（15bit、短周期モードあり）。音程感のある金属的ノイズと、ザラついた爆発音に使い分ける
function makeNoise(short) { let r = 0x4000; return () => { const b = ((r ^ (r >> (short ? 6 : 1))) & 1); r = (r >> 1) | (b << 14); return (r & 1) ? 1 : -1; }; }

function buf(sec) { return new Float32Array(Math.ceil(sec * SR)); }
// 1 音を足し込む。f は周波数または時間→周波数の関数、env は時間→音量
function tone(out, t0, dur, f, wave, vol, env = adsr(0.004, 0.06, 0.6, 0.05), vib = 0) {
  let ph = 0; const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / SR; let fr = typeof f === 'function' ? f(t / dur, t) : f;
    if (vib) fr *= 1 + vib * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t * 3);
    ph += fr / SR;
    if (s0 + i >= 0) out[s0 + i] += wv(wave, ph) * vol * env(t, dur);
  }
}
function noise(out, t0, dur, vol, env, rate = 8000, short = false, lp = 1) {
  const nz = makeNoise(short); let acc = 0, held = 0, y = 0; const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / SR; const r = typeof rate === 'function' ? rate(t / dur) : rate;
    acc += r / SR; while (acc >= 1) { acc -= 1; held = nz(); }
    y += (held - y) * (typeof lp === 'function' ? lp(t / dur) : lp);   // 1 次ローパスで暗さを調整
    out[s0 + i] += y * vol * env(t, dur);
  }
}
function adsr(a, d, s, r) { return (t, dur) => { const rel = dur - r; if (t < a) return t / a; if (t < a + d) return 1 - (1 - s) * (t - a) / d; if (t < rel) return s; return Math.max(0, s * (1 - (t - rel) / r)); }; }
const expDecay = k => (t) => Math.exp(-t * k);
const pluck = (a, k) => (t) => (t < a ? t / a : Math.exp(-(t - a) * k));

function normalize(b, peakDb = -3) { let p = 0; for (const v of b) p = Math.max(p, Math.abs(v)); const g = p > 0 ? Math.pow(10, peakDb / 20) / p : 1; for (let i = 0; i < b.length; i++) b[i] *= g; return p; }
function fadeEdges(b, ms = 3) { const n = Math.floor(ms / 1000 * SR); for (let i = 0; i < n && i < b.length; i++) { b[i] *= i / n; b[b.length - 1 - i] *= i / n; } }
function wav(name, b) {
  const data = Buffer.alloc(b.length * 2); for (let i = 0; i < b.length; i++) data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(b[i] * 32767))), i * 2);
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(join(OUT, name + '.wav'), Buffer.concat([h, data]));
}

const meta = {};
function sfx(name, sec, fn, opt = {}) { const b = buf(sec); fn(b); fadeEdges(b, opt.loop ? 0 : 2); normalize(b, opt.peak ?? -3); wav(name, b); meta[name] = { loop: !!opt.loop, gain: opt.gain ?? 1, priority: opt.priority ?? 5, maxVoices: opt.maxVoices ?? 2, cooldown: opt.cooldown ?? 0.03, spatial: !!opt.spatial, len: +(b.length / SR).toFixed(3), desc: opt.desc || '' }; }

// ---------- 効果音 ----------
// 対空発射：明るく短い「ピュッ」。高い矩形の急下降＋倍音の薄い重ね（連射で耳が疲れないよう 70ms）
sfx('air_fire', 0.075, b => { tone(b, 0, 0.07, x => 1900 - 1100 * x, 'pulse25', 0.7, pluck(0.002, 40)); tone(b, 0, 0.05, x => 3800 - 2000 * x, 'tri', 0.18, pluck(0.001, 60)); },
  { gain: 0.42, priority: 3, maxVoices: 3, cooldown: 0.05, desc: '対空発射（高い矩形の急下降）' });
// 対地発射：低く柔らかい「ヒュー」。下降する三角波＋ごく弱い風切りノイズ。対空と音域・長さで明確に区別
sfx('ground_fire', 0.30, b => { tone(b, 0, 0.29, x => 620 - 380 * x, 'hollow', 0.7, adsr(0.01, 0.05, 0.75, 0.08)); noise(b, 0, 0.28, 0.12, adsr(0.02, 0.05, 0.5, 0.1), 6000, false, 0.25); },
  { gain: 0.5, priority: 4, maxVoices: 2, cooldown: 0.1, desc: '対地発射（下降する柔らかい笛音）' });
// 着弾：短い低い衝撃（地面を叩く）
sfx('bomb_land', 0.22, b => { noise(b, 0, 0.21, 0.9, pluck(0.002, 20), x => 3000 - 2200 * x, false, 0.18); tone(b, 0, 0.12, x => 140 - 70 * x, 'bass', 0.6, pluck(0.002, 28)); },
  { gain: 0.55, priority: 4, maxVoices: 3, spatial: true, desc: '爆撃の着弾（低い衝撃）' });
// 空中敵撃破：金属がはじける高めの破裂音
sfx('air_kill', 0.34, b => { noise(b, 0, 0.33, 0.85, pluck(0.001, 11), x => 14000 - 9000 * x, false, 0.6); tone(b, 0, 0.18, x => 1300 - 1000 * x, 'saw', 0.3, pluck(0.001, 18)); },
  { gain: 0.6, priority: 6, maxVoices: 3, spatial: true, desc: '空中敵撃破（高めの金属破裂）' });
// 強化敵への命中（壊れない）
sfx('armor_hit', 0.09, b => { tone(b, 0, 0.08, 2600, 'bell', 0.6, pluck(0.001, 45)); noise(b, 0, 0.05, 0.3, pluck(0.001, 70), 12000, true, 0.7); },
  { gain: 0.4, priority: 3, maxVoices: 2, cooldown: 0.06, spatial: true, desc: '装甲への命中・シャードに弾かれる' });
// 地上物撃破：低く長い爆発（空中撃破より暗く重い）
sfx('ground_kill', 0.60, b => { noise(b, 0, 0.58, 1.0, pluck(0.002, 6), x => 5000 - 4300 * x, false, x => 0.35 - 0.25 * x); tone(b, 0, 0.3, x => 110 - 60 * x, 'bass', 0.55, pluck(0.002, 9)); },
  { gain: 0.66, priority: 6, maxVoices: 3, spatial: true, desc: '地上物撃破（低い爆発）' });
// 自機被弾：長い崩落音。下降音＋ザラついたノイズが段階的に暗くなる
sfx('player_hit', 1.5, b => { noise(b, 0, 1.45, 1.0, expDecay(2.6), x => 9000 * Math.pow(1 - x, 2) + 400, false, x => 0.7 - 0.6 * x); tone(b, 0, 1.0, x => 900 * Math.pow(0.15, x), 'saw', 0.4, expDecay(3)); for (let k = 0; k < 4; k++) noise(b, 0.25 + k * 0.22, 0.25, 0.4, pluck(0.002, 14), 2500, false, 0.3); },
  { gain: 0.85, priority: 10, maxVoices: 1, desc: '自機被弾（下降音と崩落ノイズ）' });
// 隠し対象の発見：地中から現れる、上がっていく鐘の分散和音
sfx('obelisk_reveal', 0.9, b => { ['D5', 'F5', 'A5', 'D6', 'E6'].forEach((n, i) => tone(b, i * 0.09, 0.5, freq(n), 'bell', 0.45, pluck(0.002, 6))); noise(b, 0, 0.25, 0.3, pluck(0.01, 12), 1500, false, 0.2); },
  { gain: 0.7, priority: 8, maxVoices: 1, desc: '隠し対象の出現（上昇する鐘）' });
sfx('obelisk_hit', 0.18, b => { tone(b, 0, 0.17, 880, 'bell', 0.7, pluck(0.001, 22)); tone(b, 0, 0.17, 1320, 'bell', 0.3, pluck(0.001, 26)); },
  { gain: 0.5, priority: 6, maxVoices: 2, desc: '出現後の命中（石の打音）' });
sfx('obelisk_break', 0.8, b => { tone(b, 0, 0.6, x => 1760 * Math.pow(0.5, x), 'bell', 0.5, expDecay(5)); noise(b, 0, 0.7, 0.8, pluck(0.002, 6), x => 7000 - 5000 * x, true, 0.45); },
  { gain: 0.7, priority: 8, maxVoices: 1, desc: '隠し対象の破壊（鐘＋砕ける音）' });
sfx('banner_reveal', 0.7, b => { ['A5', 'E6', 'A6'].forEach((n, i) => tone(b, i * 0.12, 0.45, freq(n), 'organ', 0.5, pluck(0.003, 7), 0.01)); },
  { gain: 0.7, priority: 8, maxVoices: 1, desc: '旗の出現' });
// 残機追加（旗取得・得点）：明るい上昇ファンファーレ
sfx('extend', 1.2, b => { const ns = ['C5', 'E5', 'G5', 'C6', 'G5', 'C6', 'E6']; const ts = [0, 0.08, 0.16, 0.24, 0.40, 0.48, 0.56]; ns.forEach((n, i) => tone(b, ts[i], i === 6 ? 0.6 : 0.14, freq(n), 'pulse25', 0.45, adsr(0.003, 0.05, 0.7, 0.04), i === 6 ? 0.012 : 0)); ns.forEach((n, i) => tone(b, ts[i], 0.12, freq(n) / 2, 'tri', 0.3, adsr(0.003, 0.05, 0.6, 0.03))); },
  { gain: 0.75, priority: 9, maxVoices: 1, desc: '残機追加（上昇ファンファーレ）' });
// 要塞の接近警告：2 音の交互（耳に刺さらないよう角の丸い波形で 1.6 秒）
sfx('fortress_warn', 1.7, b => { for (let k = 0; k < 6; k++) tone(b, k * 0.27, 0.24, k % 2 ? freq('E5') : freq('B4'), 'hollow', 0.55, adsr(0.01, 0.04, 0.8, 0.05)); tone(b, 0, 1.65, 55, 'bass', 0.25, adsr(0.2, 0.1, 0.8, 0.3)); },
  { gain: 0.7, priority: 9, maxVoices: 1, desc: '要塞接近の警告（2 音交互）' });
sfx('core_open', 0.25, b => tone(b, 0, 0.24, x => 300 + 700 * x * x, 'organ', 0.6, adsr(0.01, 0.05, 0.7, 0.06)),
  { gain: 0.5, priority: 7, maxVoices: 1, desc: 'コアが開く（上昇音）' });
sfx('core_clang', 0.3, b => { tone(b, 0, 0.29, 1180, 'bell', 0.6, expDecay(14)); tone(b, 0, 0.29, 1770, 'bell', 0.35, expDecay(18)); },
  { gain: 0.55, priority: 6, maxVoices: 1, spatial: true, desc: '閉じたコアに弾かれる' });
sfx('fortress_destroyed', 2.6, b => { for (let k = 0; k < 7; k++) noise(b, k * 0.22, 0.7, 0.75, pluck(0.002, 5), x => 6000 - 4500 * x, false, 0.35); noise(b, 0, 2.5, 0.8, expDecay(1.2), x => 2500 - 2200 * x, false, 0.15); tone(b, 0, 1.8, x => 220 * Math.pow(0.25, x), 'bass', 0.6, expDecay(1.6)); },
  { gain: 0.9, priority: 10, maxVoices: 1, desc: '要塞撃破（連鎖爆発）' });
sfx('enemy_fire', 0.06, b => tone(b, 0, 0.055, x => 700 + 300 * x, 'tri', 0.6, pluck(0.002, 50)),
  { gain: 0.22, priority: 2, maxVoices: 2, cooldown: 0.08, spatial: true, desc: '敵の発射（小さく、警告として聞き取れる程度）' });
sfx('ui_move', 0.05, b => tone(b, 0, 0.045, 1320, 'pulse50', 0.5, pluck(0.001, 60)), { gain: 0.35, priority: 1, desc: 'メニュー移動' });
sfx('ui_select', 0.16, b => { tone(b, 0, 0.07, 990, 'pulse25', 0.5, adsr(0.002, 0.02, 0.8, 0.02)); tone(b, 0.07, 0.08, 1480, 'pulse25', 0.5, adsr(0.002, 0.02, 0.8, 0.03)); }, { gain: 0.4, priority: 1, desc: 'メニュー決定' });

// ---------- 曲 ----------
// 共通: 小節の配列から 3 声＋打楽器を組む。ループ曲は 2 周描いて 2 周目を切り出し、余韻を先頭へ回り込ませて継ぎ目を消す
function song(name, bpm, bars, parts, opt = {}) {
  const beat = 60 / bpm, barLen = beat * 4, loopLen = barLen * bars;
  const loops = opt.loop ? 2 : 1;
  const b = buf(loopLen * loops + (opt.loop ? 0 : (opt.tail ?? 1.5)));
  for (let L = 0; L < loops; L++) parts(b, L * loopLen, beat);
  let out = b;
  if (opt.loop) { const n = Math.round(loopLen * SR); out = b.slice(n, n * 2); }
  normalize(out, opt.peak ?? -4);
  wav(name, out);
  meta[name] = { loop: !!opt.loop, gain: opt.gain ?? 0.6, priority: 0, maxVoices: 1, cooldown: 0, spatial: false, len: +(out.length / SR).toFixed(3), bpm, bars, desc: opt.desc || '' };
}
// 拍の列 "D3:2 F3:1 ..." を鳴らす（":" の後は拍数。"-" は休符）
function seq(b, t0, beat, str, wave, vol, env, oct = 0, vib = 0, legato = 0.92) {
  let t = t0;
  for (const tok of str.trim().split(/\s+/)) {
    const [n, l] = tok.split(':'); const len = +(l ?? 1) * beat;
    if (n !== '-') { const f = freq(n) * Math.pow(2, oct); tone(b, t, len * legato, f, wave, vol, env, vib); }
    t += len;
  }
  return t;
}
function drums(b, t0, beat, pattern, bars) { // k=低いノイズ打, s=明るいノイズ打, h=短い金属ノイズ
  for (let bar = 0; bar < bars; bar++) for (let i = 0; i < 16; i++) {
    const c = pattern[i % pattern.length], t = t0 + bar * beat * 4 + i * beat / 4;
    if (c === 'k') { noise(b, t, 0.12, 0.5, pluck(0.001, 30), x => 1500 - 1200 * x, false, 0.2); tone(b, t, 0.08, x => 120 - 60 * x, 'bass', 0.4, pluck(0.001, 35)); }
    if (c === 's') noise(b, t, 0.1, 0.32, pluck(0.001, 32), 9000, false, 0.55);
    if (c === 'h') noise(b, t, 0.03, 0.12, pluck(0.001, 90), 16000, true, 0.9);
  }
}

// プレイ曲「Skyward Ruins」：ニ短調ドリア風の静かな緊張。低音の反復の上に、間を残した旋律（8 小節ループ）
song('bgm_play', 126, 8, (b, t0, beat) => {
  const bass = ['D2:0.5 D3:0.5 A2:0.5 D3:0.5 C3:0.5 D3:0.5 A2:0.5 F2:0.5', 'D2:0.5 D3:0.5 A2:0.5 D3:0.5 E3:0.5 D3:0.5 C3:0.5 A2:0.5',
    'Bb1:0.5 Bb2:0.5 F2:0.5 Bb2:0.5 A2:0.5 Bb2:0.5 F2:0.5 D2:0.5', 'C2:0.5 C3:0.5 G2:0.5 C3:0.5 E3:0.5 C3:0.5 G2:0.5 E2:0.5',
    'D2:0.5 D3:0.5 A2:0.5 D3:0.5 C3:0.5 D3:0.5 A2:0.5 F2:0.5', 'D2:0.5 D3:0.5 A2:0.5 D3:0.5 E3:0.5 F3:0.5 E3:0.5 C3:0.5',
    'G1:0.5 G2:0.5 D2:0.5 G2:0.5 Bb2:0.5 G2:0.5 D2:0.5 Bb1:0.5', 'A1:0.5 A2:0.5 E2:0.5 A2:0.5 C#3:0.5 A2:0.5 E2:0.5 C#2:0.5'].join(' ');
  seq(b, t0, beat, bass, 'bass', 0.55, adsr(0.004, 0.08, 0.55, 0.04), 0, 0, 0.8);
  const lead = 'A4:2 G4:1 F4:1  E4:3 D4:1  F4:1 G4:1 A4:1 Bb4:1  G4:4  A4:1 C5:1 D5:2  C5:2 A4:2  Bb4:1 A4:1 G4:1 F4:1  E4:2 A3:2';
  seq(b, t0, beat, lead, 'organ', 0.32, adsr(0.02, 0.15, 0.7, 0.12), 0, 0.008, 0.95);
  // 3 声目：和音の分散（16 分）。薄く
  const chords = [['D4', 'F4', 'A4'], ['D4', 'F4', 'A4'], ['Bb3', 'D4', 'F4'], ['C4', 'E4', 'G4'], ['D4', 'F4', 'A4'], ['D4', 'F4', 'A4'], ['G3', 'Bb3', 'D4'], ['A3', 'C#4', 'E4']];
  chords.forEach((ch, bar) => { for (let i = 0; i < 16; i++) tone(b, t0 + bar * beat * 4 + i * beat / 4, beat / 4 * 0.7, freq(ch[i % 3]) * (i % 6 < 3 ? 1 : 2), 'pulse25', 0.09, pluck(0.002, 18)); });
  drums(b, t0, beat, 'k-h-s-h-k-hks-h-', 8);
}, { loop: true, gain: 0.55, desc: 'プレイ中（8 小節ループ・126BPM）' });

// 要塞戦：半音でずり上がる低音と短い旋律の繰り返しで切迫感（4 小節ループ）
song('bgm_fortress', 144, 4, (b, t0, beat) => {
  const bass = 'E2:0.5 E2:0.5 E3:0.5 E2:0.5 F2:0.5 F2:0.5 F3:0.5 F2:0.5 '.repeat(2) + 'G2:0.5 G2:0.5 G3:0.5 G2:0.5 F#2:0.5 F#2:0.5 F#3:0.5 F#2:0.5 '.repeat(2);
  seq(b, t0, beat, bass, 'bass', 0.55, adsr(0.003, 0.06, 0.5, 0.03), 0, 0, 0.75);
  seq(b, t0, beat, 'B4:1.5 C5:0.5 B4:1 E4:1  B4:1.5 C5:0.5 D5:1 C5:1  D5:1.5 E5:0.5 D5:1 G4:1  F#4:2 B4:2', 'pulse25', 0.26, adsr(0.005, 0.1, 0.6, 0.06), 0, 0.01, 0.9);
  drums(b, t0, beat, 'k-hsk-hsk-hsk-ss', 4);
}, { loop: true, gain: 0.58, desc: '要塞戦（4 小節ループ・144BPM）' });

// 開始ジングル（約 3 秒）
song('jingle_start', 120, 2, (b, t0, beat) => {
  seq(b, t0, beat, 'D4:0.5 A4:0.5 D5:1 C5:0.5 A4:0.5 F4:1  G4:0.5 A4:0.5 E5:3', 'organ', 0.4, adsr(0.01, 0.1, 0.75, 0.1), 0, 0.01);
  seq(b, t0, beat, 'D3:2 F3:2  C3:1 A2:3', 'bass', 0.5, adsr(0.005, 0.1, 0.6, 0.1));
  seq(b, t0, beat, 'A3:2 A3:2  G3:1 C#4:3', 'pulse25', 0.15, adsr(0.01, 0.1, 0.6, 0.1));
}, { gain: 0.65, tail: 0.8, desc: 'ゲーム開始' });
// 1 周達成
song('jingle_loop', 132, 2, (b, t0, beat) => {
  seq(b, t0, beat, 'D5:0.5 F5:0.5 A5:0.5 D6:0.5 C6:0.5 A5:0.5 F5:1  G5:0.5 A5:0.5 Bb5:0.5 C6:0.5 D6:2', 'pulse25', 0.35, adsr(0.004, 0.06, 0.7, 0.05), 0, 0.01);
  seq(b, t0, beat, 'D3:2 F3:2 G3:2 A3:2', 'bass', 0.5, adsr(0.005, 0.1, 0.6, 0.1));
}, { gain: 0.65, tail: 0.8, desc: '1 周達成' });
// ゲームオーバー（下降する短調）
song('jingle_gameover', 96, 2, (b, t0, beat) => {
  seq(b, t0, beat, 'A4:1 G4:1 F4:1 E4:1  D4:1 C#4:1 D4:2', 'organ', 0.38, adsr(0.01, 0.2, 0.6, 0.2), 0, 0.012);
  seq(b, t0, beat, 'D3:2 Bb2:2  A2:2 D2:2', 'bass', 0.5, adsr(0.005, 0.2, 0.6, 0.2));
}, { gain: 0.65, tail: 1.2, desc: 'ゲームオーバー' });

writeFileSync(join(OUT, '..', 'Data', 'audio.json'), JSON.stringify(meta, null, 1));
console.log('audio:', Object.keys(meta).length, 'clips →', OUT);
