// NIGHT SHAFT の曲 v2（このセッションで作曲したオリジナル。既存曲の旋律・和声進行の引用はしていない）。
// 16 分音符を 1 単位として書き、小節ごとに長さを検証してから MML に変換する（パートどうしの長さが必ずそろう）。
const NN = ['c', 'c+', 'd', 'd+', 'e', 'f', 'f+', 'g', 'g+', 'a', 'a+', 'b'];
const PITCH = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const tok = (m) => `o${Math.floor(m / 12) - 1} ${NN[((m % 12) + 12) % 12]}`;
const LEN = { 16: '1', 12: '2.', 8: '2', 6: '4.', 4: '4', 3: '8.', 2: '8', 1: '16' };
function split(k) { const out = []; for (const d of [16, 12, 8, 6, 4, 3, 2, 1]) while (k >= d) { out.push(d); k -= d; } return out; }
export function pm(s) { // 'c+5' → midi
  const m = /^([a-g])([+#-]?)(-?\d+)$/.exec(s); if (!m) throw new Error('bad pitch ' + s);
  return (Number(m[3]) + 1) * 12 + PITCH[m[1]] + (m[2] === '-' ? -1 : m[2] ? 1 : 0);
}
// 旋律: 'e5:2 r:1 (a3,c4,e4):4 | ...'（長さは 16 分音符の数、小節は | で区切る）
export function mel(src, beatsPerBar = 16) {
  const bars = src.split('|').map((b) => b.trim()).filter(Boolean);
  let out = '';
  bars.forEach((bar, bi) => {
    let sum = 0;
    for (const t of bar.split(/\s+/)) {
      const [p, l] = t.split(':'); const k = Number(l || 1); sum += k;
      const parts = split(k);
      if (p === 'r') { out += parts.map((d) => ` r${LEN[d]}`).join(''); continue; }
      if (p.startsWith('(')) {
        const notes = p.slice(1, -1).split(',').map(pm);
        const ch = `{${notes.map(tok).join(' ')}}`;
        out += parts.map((d, i) => ` ${ch}${LEN[d]}`).join(''); // 和音はタイの代わりに連打せず、長い音価に分けて置く
        continue;
      }
      const m = pm(p);
      out += parts.map((d, i) => ` ${tok(m)}${LEN[d]}${i < parts.length - 1 ? '&' : ''}`).join('');
    }
    if (sum !== beatsPerBar) throw new Error(`bar ${bi + 1} has ${sum}/16: ${bar}`);
    out += ' |';
  });
  return out;
}
// ドラム: 1 小節 16 文字（X 強・x 普通・o 弱・. 休み）
export function drum(kind, rows) {
  let out = 'l16';
  for (const row of rows) {
    if (row.length !== 16) throw new Error('drum row ' + row);
    for (const ch of row) out += ch === '.' ? ' r' : ` v${ch === 'X' ? 14 : ch === 'x' ? 11 : 7} ${kind}`;
    out += ' |';
  }
  return out;
}
const CH = { m: [0, 3, 7], m7: [0, 3, 7, 10], M: [0, 4, 7], M7: [0, 4, 7, 11], d7: [0, 4, 7, 10], sus: [0, 5, 7], m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14] };
function chordMidis(root, type, low = 55) {
  const r = pm(root.toLowerCase() + '3') % 12;
  return CH[type].map((iv) => { let m = 48 + ((r + iv) % 12) + Math.floor((r + iv) / 12) * 12; while (m < low) m += 12; while (m > low + 14) m -= 12; return m; }).sort((a, b) => a - b);
}
// 和音を小節単位で: [['A','m7',16], ...]
export function pads(prog, low = 55) {
  return mel(prog.map((bar) => bar.map(([r, t, k]) => `(${chordMidis(r, t, low).map((m) => NN[m % 12].replace('+', '+') + (Math.floor(m / 12) - 1)).join(',')}):${k}`).join(' ')).join(' | '));
}
// ベース: 小節ごとに根音とパターン（[度数(半音)|'r', 長さ, オクターブ]）
export function bass(roots, pattern, baseOct = 2) {
  return mel(roots.map((root) => {
    const r = pm(root.toLowerCase() + baseOct);
    return pattern.map(([iv, k, o = 0]) => (iv === 'r' ? `r:${k}` : `${NN[(r + iv + o * 12) % 12]}${Math.floor((r + iv + o * 12) / 12) - 1}:${k}`)).join(' ');
  }).join(' | '));
}
// アルペジオ（16 分）: 和音の構成音を上下に
export function arp(prog, shape = [0, 1, 2, 3, 2, 1], low = 64, step = 1) {
  return mel(prog.map((bar) => {
    let s = ''; let pos = 0;
    for (const [r, t, k] of bar) {
      const ns = chordMidis(r, t, low); const ext = [...ns, ...ns.map((m) => m + 12)];
      for (let i = 0; i < k; i += step) { const m = ext[shape[pos++ % shape.length] % ext.length]; s += ` ${NN[m % 12]}${Math.floor(m / 12) - 1}:${step}`; }
    }
    return s.trim();
  }).join(' | '));
}
const rep = (arr, n) => Array.from({ length: n }, () => arr).flat();

// ---------- 音色 ----------
export const INST = {
  pad: { osc: [{ type: 'saw', gain: 1, detune: -6 }, { type: 'saw', gain: 0.8, detune: 7 }], uni: { n: 2, cents: 14 }, amp: { a: 0.45, d: 0.6, s: 0.8, r: 1.3 }, flt: { type: 'lp', fc: 700, res: 0.15, env: 1100, a: 1.1, d: 1.2, s: 0.5, r: 1, key: 0.3 }, gain: 0.075, width: 0.95 },
  pluck: { osc: [{ type: 'saw', gain: 1 }, { type: 'square', gain: 0.5, pw: 0.3 }], amp: { a: 0.002, d: 0.28, s: 0, r: 0.15 }, flt: { type: 'lp', fc: 500, res: 0.38, env: 4200, a: 0.001, d: 0.16, s: 0.0, r: 0.1, key: 0.6 }, gain: 0.15 },
  bass: { osc: [{ type: 'saw', gain: 1 }, { type: 'square', gain: 0.7, oct: -1, pw: 0.5 }], amp: { a: 0.003, d: 0.2, s: 0.85, r: 0.07 }, flt: { type: 'lp', fc: 200, res: 0.32, env: 1300, a: 0.002, d: 0.14, s: 0.18, r: 0.08, key: 0.4 }, gain: 0.3 },
  reese: { osc: [{ type: 'saw', gain: 1, detune: -17 }, { type: 'saw', gain: 1, detune: 17 }, { type: 'sine', oct: -1, gain: 0.9 }], amp: { a: 0.005, d: 0.3, s: 0.9, r: 0.1 }, flt: { type: 'lp', fc: 260, res: 0.28, env: 700, a: 0.08, d: 0.5, s: 0.3, r: 0.1, key: 0.3 }, gain: 0.25 },
  lead: { osc: [{ type: 'saw', gain: 1, detune: -8 }, { type: 'saw', gain: 0.9, detune: 8 }], uni: { n: 2, cents: 8 }, amp: { a: 0.012, d: 0.3, s: 0.72, r: 0.28 }, flt: { type: 'lp', fc: 1500, res: 0.22, env: 2600, a: 0.01, d: 0.35, s: 0.45, r: 0.2, key: 0.6 }, vib: { rate: 5.4, cents: 16, delay: 0.22 }, gain: 0.12, width: 0.5 },
  epiano: { fm: { ratio: 1, index: 2.0, decay: 0.45, sustain: 0.12 }, amp: { a: 0.002, d: 1.1, s: 0.25, r: 0.35 }, gain: 0.15 },
  bell: { fm: { ratio: 3.5, index: 3.2, decay: 0.7, sustain: 0.05 }, amp: { a: 0.001, d: 1.4, s: 0, r: 0.8 }, gain: 0.09 },
  brass: { osc: [{ type: 'saw', gain: 1 }], uni: { n: 3, cents: 12 }, amp: { a: 0.02, d: 0.25, s: 0.65, r: 0.16 }, flt: { type: 'lp', fc: 450, res: 0.18, env: 3200, a: 0.035, d: 0.22, s: 0.45, r: 0.15, key: 0.5 }, gain: 0.12, width: 0.7 },
  arp: { osc: [{ type: 'square', gain: 0.8, pw: 0.28 }, { type: 'saw', gain: 0.5, detune: 5 }], amp: { a: 0.001, d: 0.13, s: 0, r: 0.08 }, flt: { type: 'lp', fc: 1200, res: 0.3, env: 3200, a: 0.001, d: 0.1, s: 0, r: 0.05, key: 0.7 }, gain: 0.085 },
  riser: { osc: [{ type: 'noise', gain: 1 }], amp: { a: 1.5, d: 0.1, s: 1, r: 0.05 }, flt: { type: 'bp', fc: 400, res: 0.5, env: 7000, a: 1.8, d: 0.1, s: 1, r: 0.1, key: 0 }, gain: 0.08 },
  sub: { osc: [{ type: 'sine', gain: 1 }], amp: { a: 0.002, d: 1.2, s: 0, r: 0.3 }, pitch: { semi: 12, decay: 0.06 }, gain: 0.4 },
  stab: { osc: [{ type: 'saw', gain: 1 }, { type: 'square', gain: 0.6, oct: 1 }], uni: { n: 2, cents: 14 }, amp: { a: 0.002, d: 0.18, s: 0.0, r: 0.12 }, flt: { type: 'lp', fc: 900, res: 0.3, env: 4500, a: 0.001, d: 0.12, s: 0, r: 0.1, key: 0.5 }, gain: 0.12, width: 0.8 },
};

// ---------- タイトル（D マイナー・96 BPM・映画的なシンセウェーブ） ----------
const T_PROG = rep([[['D', 'm9', 16]], [['A#', 'M7', 16]], [['F', 'add9', 16]], [['C', 'M', 16]], [['D', 'm7', 16]], [['A#', 'M7', 16]], [['G', 'm7', 16]], [['A', 'sus', 8], ['A', 'M', 8]]], 2);
const T_ROOTS = ['D', 'A#', 'F', 'C', 'D', 'A#', 'G', 'A', 'D', 'A#', 'F', 'C', 'D', 'A#', 'G', 'A'];
const TITLE = {
  tempo: 96, loop: true,
  master: { room: 0.88, damp: 0.3, rev: 1.1, delayBeats: 0.75, delayFb: 0.42, loud: 0.15 },
  tracks: [
    { inst: INST.pad, mml: pads(T_PROG), send: 0.55, duck: 0.35 },
    { inst: INST.arp, mml: arp(T_PROG, [0, 1, 2, 4, 3, 1, 2, 4], 62, 1), send: 0.3, delay: 0.35, pan: 0.15 },
    { inst: INST.bass, mml: bass(T_ROOTS, [[0, 6], [0, 2], [12, 2], [0, 4], [7, 2]]), send: 0.05, duck: 0.5 },
    { inst: INST.lead, mml: mel(
      'r:8 a5:4 d6:4 | c6:6 a+5:2 a5:8 | r:4 a5:2 c6:2 f6:6 e6:2 | e6:12 r:4 | ' +
      'r:8 a5:4 d6:4 | e6:6 f6:2 e6:4 d6:4 | d6:6 c6:2 a+5:4 g5:4 | a5:16 | ' +
      'd6:6 e6:2 f6:8 | f6:4 e6:4 d6:4 a+5:4 | c6:6 d6:2 a5:8 | g5:4 a5:4 c6:8 | ' +
      'd6:6 e6:2 f6:4 a6:4 | g6:6 f6:2 e6:4 d6:4 | a+5:6 c6:2 d6:4 e6:4 | c+6:16'), send: 0.4, delay: 0.25 },
    { drum: true, mml: drum('k', rep(['X.........x.....', 'X.........x...x.'], 8)), send: 0.1, gain: 0.9 },
    { drum: true, mml: drum('s', rep(['........X.......', '........X.......', '........X.......', '........X...o.o.'], 4)), send: 0.35 },
    { drum: true, mml: drum('h', rep(['..x...x...x...x.'], 16)), send: 0.1, gain: 0.7, pans: { h: 0.25 } },
    { drum: true, mml: drum('x', ['X...............', ...rep(['................'], 7), 'X...............', ...rep(['................'], 7)]), send: 0.3 },
    { drum: true, mml: drum('t', [...rep(['................'], 7), '..........x.x.xx', ...rep(['................'], 7), '........x.x.x.xx']), send: 0.3 },
  ],
};

// ---------- 第1ビル／訓練棟（A マイナー・124 BPM・スパイ風ファンクハウス） ----------
const S1_PROG = rep([[['A', 'm7', 16]], [['D', 'm7', 16]], [['F', 'M7', 16]], [['E', 'd7', 16]]], 4);
const S1_ROOTS = rep(['A', 'D', 'F', 'E'], 4);
const S1 = {
  tempo: 124, loop: true,
  master: { room: 0.8, damp: 0.35, rev: 0.9, delayBeats: 0.75, delayFb: 0.35, loud: 0.17 },
  tracks: [
    { drum: true, mml: drum('k', rep(['X...x...X...x...'], 16)), send: 0.03 },
    { drum: true, mml: drum('c', rep(['....X.......X...', '....X.......X..o'], 8)), send: 0.25 },
    { drum: true, mml: drum('o', rep(['..x...x...x...x.'], 16)), gain: 0.4, pans: { o: 0.2 } },
    { drum: true, mml: drum('h', rep(['xoxoxoxoxoxoxoxo'], 16)), gain: 0.32, pans: { h: -0.25 } },
    { inst: INST.bass, mml: bass(S1_ROOTS, [[0, 3], [0, 1], [12, 2], [0, 2], ['r', 2], [10, 2], [12, 2], [7, 2]]), duck: 0.6 },
    { inst: INST.epiano, mml: mel(S1_PROG.map((bar) => { const [r, t] = bar[0]; const ns = chordMidis(r, t, 57).map((m) => NN[m % 12] + (Math.floor(m / 12) - 1)).join(','); return `r:2 (${ns}):2 r:4 (${ns}):1 r:3 (${ns}):2 r:2`; }).join(' | ')), send: 0.3, duck: 0.4, pan: -0.15 },
    { inst: INST.pad, mml: pads(S1_PROG, 60), send: 0.5, duck: 0.7 },
    { inst: INST.pluck, mml: mel(
      'e5:1 r:1 a5:2 r:2 c6:1 d6:1 e6:2 r:2 g5:2 a5:2 | r:4 f5:2 a5:2 d6:4 c6:2 a5:2 | c6:2 r:2 a5:1 c6:1 e6:2 r:2 f6:2 e6:2 c6:2 | b5:4 g+5:4 e5:4 r:4 | ' +
      'e5:1 r:1 a5:2 r:2 c6:1 d6:1 e6:2 r:2 g6:2 e6:2 | r:2 f6:2 e6:2 d6:2 c6:4 a5:4 | c6:2 r:2 e6:2 f6:2 a6:4 g6:2 f6:2 | e6:6 d6:2 b5:4 g+5:4 | ' +
      'a5:2 r:2 a5:1 a5:1 c6:2 e6:4 d6:4 | d6:2 r:2 d6:1 d6:1 f6:2 a6:4 g6:4 | f6:4 e6:2 c6:2 a5:4 c6:4 | b5:2 r:2 b5:1 c6:1 d6:2 e6:4 g+6:4 | ' +
      'a6:4 g6:2 e6:2 g6:4 e6:4 | d6:4 c6:2 a5:2 c6:4 d6:4 | e6:2 f6:2 e6:2 c6:2 a5:4 c6:4 | b5:8 r:8'), send: 0.25, delay: 0.3, pan: 0.12 },
    // 緊張の層（敵に見つかっている間だけ上げる）
    { stem: 'hot', drum: true, mml: drum('z', rep(['xoxxxoxxxoxxxoxx'], 16)), gain: 0.38, pans: { z: 0.4 } },
    { stem: 'hot', inst: INST.brass, mml: mel(rep(['(a4,c5,e5):2 r:6 (a4,c5,e5):1 r:1 (a4,c5,e5):2 r:4', '(a4,d5,f5):2 r:6 (a4,d5,f5):1 r:1 (a4,d5,f5):2 r:4', '(a4,c5,f5):2 r:6 (a4,c5,f5):1 r:1 (a4,c5,f5):2 r:4', '(g+4,b4,e5):2 r:6 (g+4,b4,e5):1 r:1 (g+4,b4,d5):2 r:4'], 4).join(' | ')), send: 0.3 },
    { stem: 'hot', inst: INST.arp, mml: arp(S1_PROG, [0, 2, 1, 3, 2, 4, 3, 5], 64, 1), send: 0.2, delay: 0.25, pan: -0.3 },
    { stem: 'hot', drum: true, mml: drum('t', rep(['................', '................', '................', '..........x.x.xx'], 4)), send: 0.2 },
  ],
};

// ---------- 第2ビル（E マイナー・136 BPM・冷たいエレクトロ） ----------
const S2_PROG = rep([[['E', 'm', 16]], [['C', 'M7', 16]], [['G', 'M', 16]], [['D', 'M', 16]], [['E', 'm', 16]], [['C', 'M7', 16]], [['A', 'm7', 16]], [['B', 'sus', 8], ['B', 'd7', 8]]], 2);
const S2_ROOTS = rep(['E', 'C', 'G', 'D', 'E', 'C', 'A', 'B'], 2);
const S2 = {
  tempo: 136, loop: true,
  master: { room: 0.85, damp: 0.2, rev: 1.0, delayBeats: 0.5, delayFb: 0.4, loud: 0.17 },
  tracks: [
    { drum: true, mml: drum('k', rep(['X.....x...X.....', 'X.....x...X...x.'], 8)), send: 0.03 },
    { drum: true, mml: drum('s', rep(['....X.......X...', '....X.......X.o.'], 8)), send: 0.3 },
    { drum: true, mml: drum('h', rep(['x.xxx.xxx.xxx.xo'], 16)), gain: 0.34, pans: { h: 0.3 } },
    { inst: INST.bass, mml: bass(S2_ROOTS, [[0, 1], [0, 1], [12, 1], [0, 1], [0, 1], [12, 1], [0, 1], [7, 1], [0, 1], [0, 1], [12, 1], [0, 1], [10, 1], [12, 1], [7, 1], [5, 1]]), duck: 0.55 },
    { inst: INST.pad, mml: pads(S2_PROG, 59), send: 0.6, duck: 0.6 },
    { inst: INST.bell, mml: mel(
      'b5:4 r:2 e6:2 g6:4 f+6:4 | e6:4 r:2 b5:2 g5:8 | d6:4 r:2 g6:2 b6:4 a6:4 | f+6:12 r:4 | ' +
      'b5:4 r:2 e6:2 g6:4 b6:4 | c7:4 b6:2 g6:2 e6:8 | e6:4 g6:2 a6:2 c7:4 b6:4 | a6:8 f+6:8 | ' +
      'g6:2 f+6:2 e6:4 b5:4 e6:4 | g6:2 a6:2 g6:4 e6:8 | d6:2 e6:2 g6:4 b6:4 d7:4 | a6:12 r:4 | ' +
      'e7:4 d7:2 b6:2 g6:4 b6:4 | c7:4 b6:2 a6:2 g6:4 e6:4 | a6:4 g6:2 e6:2 c6:4 e6:4 | d+6:16'), send: 0.45, delay: 0.35, pan: 0.2 },
    { stem: 'hot', inst: INST.arp, mml: arp(S2_PROG, [0, 1, 2, 3, 4, 3, 2, 1], 64, 1), send: 0.25, delay: 0.3, pan: -0.25 },
    { stem: 'hot', inst: INST.lead, mml: mel(
      'r:16 | r:16 | r:16 | r:8 f+5:4 a5:4 | b5:12 e6:4 | g6:8 e6:8 | e6:8 c6:4 a5:4 | b5:16 | ' +
      'r:16 | r:16 | r:16 | r:8 f+5:4 a5:4 | b5:12 e6:4 | g6:8 b6:8 | a6:8 g6:4 e6:4 | f+6:16'), send: 0.35, delay: 0.2 },
    { stem: 'hot', drum: true, mml: drum('o', rep(['..x...x...x...x.'], 16)), gain: 0.45 },
    { stem: 'hot', drum: true, mml: drum('c', rep(['................', '............x.x.'], 8)), send: 0.3 },
  ],
};

// ---------- 第3ビル（C マイナー・148 BPM・警報のような緊迫感） ----------
const S3_PROG = rep([[['C', 'm', 16]], [['G#', 'M', 16]], [['D#', 'M', 16]], [['A#', 'M', 16]], [['C', 'm', 16]], [['G#', 'M', 16]], [['F', 'm', 16]], [['G', 'sus', 8], ['G', 'M', 8]]], 2);
const S3_ROOTS = rep(['C', 'G#', 'D#', 'A#', 'C', 'G#', 'F', 'G'], 2);
const S3 = {
  tempo: 148, loop: true,
  master: { room: 0.78, damp: 0.4, rev: 0.8, delayBeats: 0.75, delayFb: 0.3, loud: 0.18 },
  tracks: [
    { drum: true, mml: drum('k', rep(['X.....X...X.....', 'X.....X...x...x.'], 8)), send: 0.03 },
    { drum: true, mml: drum('s', rep(['....X.......X...', '....X.......X.oX'], 8)), send: 0.25 },
    { drum: true, mml: drum('h', rep(['xxxoxxxoxxxoxxxo'], 16)), gain: 0.3, pans: { h: -0.3 } },
    { inst: INST.reese, mml: bass(S3_ROOTS, [[0, 6], [0, 2], [3, 4], [-2, 4]]), duck: 0.7, send: 0.05 },
    { inst: INST.stab, mml: mel(S3_PROG.map((bar) => { const [r, t] = bar[0]; const ns = chordMidis(r, t, 60).map((m) => NN[m % 12] + (Math.floor(m / 12) - 1)).join(','); return `(${ns}):1 r:2 (${ns}):1 r:2 (${ns}):2 r:4 (${ns}):1 r:3`; }).join(' | ')), send: 0.35, delay: 0.2, duck: 0.4 },
    { inst: INST.lead, mml: mel(
      'g5:6 c6:2 d+6:4 d6:4 | c6:4 a+5:4 g+5:8 | g5:6 d+6:2 g6:4 f6:4 | d+6:8 d6:8 | ' +
      'g5:6 c6:2 d+6:4 g6:4 | g+6:4 g6:4 d+6:8 | f6:6 g+6:2 g6:4 f6:4 | d6:8 b5:8 | ' +
      'c6:2 r:2 c6:2 d+6:2 g6:8 | g+6:2 r:2 g6:2 f6:2 d+6:8 | a+5:2 r:2 d+6:2 f6:2 g6:4 a+6:4 | a+6:4 g+6:4 g6:8 | ' +
      'c7:6 a+6:2 g6:4 d+6:4 | g+6:6 g6:2 f6:4 d+6:4 | f6:4 g6:4 g+6:4 a+6:4 | b6:16'), send: 0.3, delay: 0.3 },
    { inst: INST.pad, mml: pads(S3_PROG, 55), send: 0.5, duck: 0.8 },
    { stem: 'hot', inst: INST.arp, mml: arp(S3_PROG, [0, 2, 4, 2, 1, 3, 5, 3], 67, 1), send: 0.2, delay: 0.2, pan: 0.3 },
    { stem: 'hot', drum: true, mml: drum('z', rep(['xxxxxxxxxxxxxxxx'], 16)), gain: 0.32, pans: { z: 0.35 } },
    { stem: 'hot', drum: true, mml: drum('t', rep(['................', '..............xx', '................', 'x.x.x.x.xxxxxxxx'], 4)), send: 0.2 },
    { stem: 'hot', inst: INST.brass, mml: mel(rep(['c5:4 r:12', 'c5:4 r:12', 'a+4:4 r:12', 'd5:4 r:12'], 4).join(' | ')), send: 0.3 },
  ],
};

// ---------- ジングル ----------
const START = { tempo: 120, loop: false, master: { room: 0.85, loud: 0.17 }, tracks: [
  { inst: INST.riser, mml: mel('c5:16 | r:16'), send: 0.4 },
  { inst: INST.brass, mml: mel('r:16 | (a3,c4,e4,a4):8 r:8'), send: 0.5 },
  { inst: INST.sub, mml: mel('r:16 | a1:8 r:8') },
  { drum: true, mml: drum('x', ['................', 'X...............']), send: 0.4 },
  { drum: true, mml: drum('s', ['....x...x.x.xxxx', '................']), send: 0.3 },
] };
const DOC = { tempo: 150, loop: false, master: { room: 0.8, loud: 0.15 }, tracks: [
  { inst: INST.bell, mml: mel('a5:1 c6:1 e6:1 a6:1 c7:4 e7:8 | r:16'), send: 0.5, delay: 0.3 },
  { inst: INST.pluck, mml: mel('(a4,c5,e5):2 r:2 (c5,e5,a5):4 r:8 | r:16'), send: 0.3 },
] };
const CLEAR = { tempo: 128, loop: false, master: { room: 0.85, loud: 0.17 }, tracks: [
  { inst: INST.brass, mml: mel('(c4,e4,g4):3 (c4,e4,g4):1 (c4,f4,a4):4 (d4,g4,b4):8 | (e4,g4,c5):16 | r:16'), send: 0.45 },
  { inst: INST.lead, mml: mel('g5:3 c6:1 c6:4 d6:4 b5:4 | c6:16 | r:16'), send: 0.4, delay: 0.25 },
  { inst: INST.bass, mml: mel('c2:4 f2:4 g2:8 | c2:16 | r:16') },
  { drum: true, mml: drum('k', ['X...X...X...X.X.', 'X...............', '................']) },
  { drum: true, mml: drum('s', ['....X.......X.xx', '................', '................']), send: 0.3 },
  { drum: true, mml: drum('x', ['................', 'X...............', '................']), send: 0.4 },
] };
const ALLCLEAR = { tempo: 112, loop: false, master: { room: 0.9, loud: 0.17 }, tracks: [
  { inst: INST.pad, mml: pads([[['F', 'M7', 16]], [['G', 'M', 16]], [['E', 'm7', 16]], [['A', 'm', 16]], [['D', 'm7', 16]], [['G', 'sus', 8], ['G', 'M', 8]], [['C', 'add9', 16]], [['C', 'add9', 16]]]), send: 0.6 },
  { inst: INST.lead, mml: mel('a5:6 c6:2 e6:8 | d6:6 b5:2 g5:8 | g5:6 b5:2 e6:4 d6:4 | c6:6 b5:2 a5:8 | f5:4 a5:4 d6:4 f6:4 | e6:6 d6:2 d6:8 | e6:16 | r:16'), send: 0.45, delay: 0.3 },
  { inst: INST.arp, mml: arp([[['F', 'M7', 16]], [['G', 'M', 16]], [['E', 'm7', 16]], [['A', 'm', 16]], [['D', 'm7', 16]], [['G', 'M', 16]], [['C', 'add9', 16]], [['C', 'add9', 16]]], [0, 1, 2, 3], 64, 1), send: 0.3, delay: 0.3 },
  { inst: INST.bass, mml: bass(['F', 'G', 'E', 'A', 'D', 'G', 'C', 'C'], [[0, 8], [7, 4], [12, 4]]) },
  { drum: true, mml: drum('k', [...rep(['X.......X.......'], 7), 'X...............']) },
  { drum: true, mml: drum('s', [...rep(['........X.......'], 6), '....x...X...x.xx', '................']), send: 0.35 },
  { drum: true, mml: drum('x', ['X...............', ...rep(['................'], 5), 'X...............', 'X...............']), send: 0.4 },
] };
const MISS = { tempo: 100, loop: false, master: { room: 0.85, loud: 0.15 }, tracks: [
  { inst: { ...INST.lead, vib: { rate: 3, cents: 40, delay: 0.05 } }, mml: mel('e5:2 d+5:2 d5:2 c+5:2 c5:8 | r:16'), send: 0.4 },
  { inst: INST.sub, mml: mel('r:8 a1:8 | r:16') },
  { inst: INST.pad, mml: pads([[['A', 'm', 16]], [['A', 'm', 16]]], 52), send: 0.6 },
] };
const GAMEOVER = { tempo: 72, loop: false, master: { room: 0.92, loud: 0.15 }, tracks: [
  { inst: INST.pad, mml: pads([[['A', 'm', 16]], [['F', 'M', 16]], [['D', 'm', 16]], [['E', 'sus', 8], ['E', 'M', 8]]], 52), send: 0.7 },
  { inst: INST.bell, mml: mel('e6:8 c6:8 | a5:8 f5:8 | d5:8 f5:8 | e5:16'), send: 0.6, delay: 0.3 },
  { inst: INST.sub, mml: mel('a1:16 | f1:16 | d1:16 | e1:16') },
] };

export const SONGS2 = { title: TITLE, stage1: S1, stage2: S2, stage3: S3, start: START, doc: DOC, clear: CLEAR, allclear: ALLCLEAR, miss: MISS, gameover: GAMEOVER };
// ステージ番号 → 曲（訓練棟は第1ビルの曲を落ち着いた層だけで）
export const STAGE_SONG = ['stage1', 'stage1', 'stage2', 'stage3'];
