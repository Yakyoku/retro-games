// ORBITAL WINGS — モダン音源の音色・波形メモリ・打楽器（すべてこの作品のために作った設定）
//
// ■ 音色（PATCHES）
//   type 'va' … 仮想アナログ: osc: [{ w: 'saw'|'pulse'|'tri'|'sine'|'super'|'wt', semi, det(セント), lvl, pw, pwm, pwmRate, table, n, spread, width }]
//                 sub（1 オクターブ下のサイン）、noise、free（位相を毎回ずらす。重ねた音向き）
//   type 'fm' … 4 オペレーター FM: alg 0: 4→3→2→1 / 1: (2→1)+(4→3) / 2: (2+3+4)→1 / 3: (2→1)+3+4 / 4: 全部並列
//                 ops: [{ r: 周波数比, l: 音量（出力）または変調の深さ（ラジアン）, a, d, s, rel, det }]（op1 が先頭）、fb: op4 のフィードバック
//   共通: amp {a,d,s,r}（秒）/ flt {type,cut(Hz),res(0-1),env(オクターブ),a,d,s,r,kt,lfoR,lfoD,vel} / vib {rate,depth(セント),delay,ramp}
//         porta（秒）/ bend（始めのずれ セント）/ gain / pan / rev・dly（センド量）/ duck（キックのサイドチェインを受ける）/ drive
// ■ 打楽器（DRUMKIT）: tone（サイン＋高さの落下）・noise（フィルターつき）・metal（整数比でない矩形波 6 本）の層を重ねる

function table(h) {
  const t = new Float32Array(1025);
  let mx = 0;
  for (let i = 0; i < 1024; i++) { let s = 0; for (let k = 0; k < h.length; k++) if (h[k]) s += h[k] * Math.sin(2 * Math.PI * (k + 1) * i / 1024 + k * 0.7); t[i] = s; mx = Math.max(mx, Math.abs(s)); }
  for (let i = 0; i < 1024; i++) t[i] /= mx;
  t[1024] = t[0];
  return t;
}
export const WAVETABLES = {
  organ: table([1, 0.6, 0, 0.35, 0, 0.2, 0, 0.12]),
  hollow: table([1, 0, 0.55, 0, 0.28, 0, 0.14, 0, 0.07]),
  vox: table([1, 0.42, 0.7, 0.5, 0.18, 0.1, 0.22, 0.12, 0.05, 0.03]),
  glass: table([1, 0, 0, 0.5, 0, 0, 0.3, 0, 0, 0, 0.18, 0, 0.1]),
  reed: table([1, 0.8, 0.55, 0.6, 0.3, 0.32, 0.15, 0.16, 0.08, 0.06, 0.04]),
};

export const PATCHES = {
  // ---- リード
  lead_saw: { type: 'va', free: true, osc: [{ w: 'saw', det: -8, lvl: 0.5 }, { w: 'saw', det: 9, lvl: 0.5 }, { w: 'pulse', semi: -12, pw: 0.4, lvl: 0.25 }],
    flt: { cut: 2300, res: 0.25, env: 2.2, a: 0.004, d: 0.35, s: 0.45, r: 0.2, kt: 0.5 }, amp: { a: 0.005, d: 0.4, s: 0.8, r: 0.12 },
    vib: { rate: 5.6, depth: 16, delay: 0.22, ramp: 0.25 }, porta: 0.035, gain: 0.2, rev: 0.16, dly: 0.2 },
  lead_sq: { type: 'va', osc: [{ w: 'pulse', pw: 0.5, pwm: 0.22, pwmRate: 0.9, lvl: 0.6 }, { w: 'saw', det: 6, lvl: 0.28 }, { w: 'tri', semi: 12, lvl: 0.12 }],
    flt: { cut: 2500, res: 0.2, env: 1.6, a: 0.004, d: 0.3, s: 0.5, r: 0.2, kt: 0.5 }, amp: { a: 0.006, d: 0.5, s: 0.78, r: 0.14 },
    vib: { rate: 5.2, depth: 14, delay: 0.25, ramp: 0.3 }, porta: 0.03, gain: 0.19, rev: 0.2, dly: 0.24 },
  lead_fm: { type: 'fm', alg: 1, fb: 0.12, ops: [{ r: 1, l: 0.62, a: 0.004, d: 0.6, s: 0.8, rel: 0.12 }, { r: 2, l: 2.4, a: 0.002, d: 0.25, s: 0.45, rel: 0.12 },
    { r: 1, det: 7, l: 0.4, a: 0.006, d: 0.6, s: 0.8, rel: 0.12 }, { r: 3, l: 1.5, a: 0.002, d: 0.18, s: 0.3, rel: 0.1 }],
    amp: { a: 0.003, d: 0.5, s: 1, r: 0.12 }, vib: { rate: 5.8, depth: 14, delay: 0.2, ramp: 0.2 }, gain: 0.2, rev: 0.16, dly: 0.2 },
  brass: { type: 'va', free: true, osc: [{ w: 'saw', det: -6, lvl: 0.5 }, { w: 'saw', det: 7, lvl: 0.5 }, { w: 'saw', semi: -12, lvl: 0.2 }],
    flt: { cut: 1000, res: 0.12, env: 2.6, a: 0.05, d: 0.5, s: 0.6, r: 0.18, kt: 0.45, vel: 0.5 }, amp: { a: 0.018, d: 0.4, s: 0.85, r: 0.14 },
    vib: { rate: 5.3, depth: 12, delay: 0.3, ramp: 0.3 }, bend: -45, bendT: 0.035, gain: 0.2, rev: 0.22, dly: 0.08 },
  lead_soft: { type: 'va', osc: [{ w: 'tri', lvl: 0.7 }, { w: 'wt', table: 'reed', lvl: 0.3, det: 5 }, { w: 'sine', semi: 12, lvl: 0.15 }],
    flt: { cut: 2400, res: 0.1, env: 0.8, a: 0.01, d: 0.4, s: 0.5, r: 0.3 }, amp: { a: 0.012, d: 0.5, s: 0.8, r: 0.22 },
    vib: { rate: 5, depth: 18, delay: 0.3, ramp: 0.35 }, porta: 0.04, gain: 0.24, rev: 0.3, dly: 0.25 },
  eerie: { type: 'va', osc: [{ w: 'wt', table: 'hollow', lvl: 0.6 }, { w: 'wt', table: 'hollow', det: 11, lvl: 0.4 }, { w: 'sine', semi: 12, det: -6, lvl: 0.12 }],
    flt: { cut: 1700, res: 0.3, env: 0.6, a: 0.15, d: 0.8, s: 0.5, r: 0.4, lfoR: 0.35, lfoD: 0.25 }, amp: { a: 0.06, d: 0.6, s: 0.85, r: 0.3 },
    vib: { rate: 4.4, depth: 34, delay: 0.12, ramp: 0.5 }, porta: 0.07, gain: 0.23, rev: 0.4, dly: 0.3 },
  ssaw: { type: 'va', free: true, osc: [{ w: 'super', n: 7, spread: 26, width: 0.9, lvl: 0.9 }, { w: 'saw', semi: -12, lvl: 0.2 }],
    flt: { cut: 3000, res: 0.15, env: 1.6, a: 0.004, d: 0.4, s: 0.6, r: 0.2, kt: 0.4 }, amp: { a: 0.006, d: 0.4, s: 0.85, r: 0.16 },
    vib: { rate: 5.5, depth: 10, delay: 0.25, ramp: 0.25 }, gain: 0.17, rev: 0.2, dly: 0.14 },
  // ---- 和音の層
  pad_warm: { type: 'va', free: true, osc: [{ w: 'super', n: 5, spread: 18, width: 1, lvl: 0.9 }, { w: 'tri', semi: -12, lvl: 0.25 }],
    flt: { cut: 1500, res: 0.1, env: 1.0, a: 0.5, d: 1.2, s: 0.7, r: 0.6, kt: 0.3, lfoR: 0.17, lfoD: 0.22 }, amp: { a: 0.16, d: 1, s: 0.85, r: 0.45 },
    gain: 0.095, rev: 0.4, dly: 0.05, duck: true },
  pad_choir: { type: 'va', free: true, osc: [{ w: 'wt', table: 'vox', det: -9, lvl: 0.5 }, { w: 'wt', table: 'vox', det: 9, lvl: 0.5 }, { w: 'wt', table: 'vox', semi: 12, det: 4, lvl: 0.18 }],
    flt: { type: 'lp', cut: 1900, res: 0.2, env: 0.5, a: 0.4, d: 1, s: 0.7, r: 0.5, lfoR: 0.21, lfoD: 0.18 }, amp: { a: 0.2, d: 1, s: 0.9, r: 0.5 },
    vib: { rate: 4.8, depth: 9, delay: 0.4, ramp: 0.5 }, gain: 0.13, rev: 0.5, duck: true },
  strings: { type: 'va', free: true, osc: [{ w: 'super', n: 5, spread: 14, width: 0.9, lvl: 0.8 }, { w: 'pulse', pw: 0.3, pwm: 0.15, pwmRate: 0.4, lvl: 0.2 }],
    flt: { cut: 3600, res: 0.08, env: 0.6, a: 0.3, d: 1, s: 0.7, r: 0.4, kt: 0.3 }, amp: { a: 0.09, d: 1, s: 0.9, r: 0.3 },
    vib: { rate: 5.4, depth: 8, delay: 0.3, ramp: 0.4 }, gain: 0.1, rev: 0.4, duck: true },
  pad_glass: { type: 'fm', alg: 1, fb: 0.05, ops: [{ r: 1, l: 0.5, a: 0.25, d: 2, s: 0.7, rel: 0.6 }, { r: 2, l: 0.9, a: 0.4, d: 1.5, s: 0.4, rel: 0.5 },
    { r: 2, det: 6, l: 0.3, a: 0.3, d: 2, s: 0.6, rel: 0.6 }, { r: 5, l: 0.7, a: 0.02, d: 1.2, s: 0.2, rel: 0.5 }],
    amp: { a: 0.1, d: 1, s: 1, r: 0.6 }, gain: 0.13, rev: 0.5, dly: 0.12, duck: true },
  organ: { type: 'fm', alg: 4, fb: 0.08, ops: [{ r: 1, l: 0.5, a: 0.006, d: 1, s: 0.9, rel: 0.08 }, { r: 2, l: 0.3, a: 0.006, d: 1, s: 0.9, rel: 0.08 },
    { r: 3, l: 0.16, a: 0.006, d: 0.6, s: 0.7, rel: 0.08 }, { r: 4, l: 0.1, a: 0.004, d: 0.4, s: 0.5, rel: 0.08 }],
    amp: { a: 0.006, d: 1, s: 1, r: 0.1 }, vib: { rate: 6, depth: 7, delay: 0.3, ramp: 0.3 }, gain: 0.17, rev: 0.25, duck: true },
  stab: { type: 'va', free: true, osc: [{ w: 'super', n: 5, spread: 24, width: 0.9, lvl: 0.9 }, { w: 'pulse', pw: 0.35, lvl: 0.2 }],
    flt: { cut: 800, res: 0.2, env: 3, a: 0.002, d: 0.16, s: 0.15, r: 0.12, kt: 0.3 }, amp: { a: 0.003, d: 0.22, s: 0.3, r: 0.1 },
    gain: 0.19, rev: 0.25, dly: 0.18, duck: true },
  // ---- 分散和音・対旋律
  pluck: { type: 'va', osc: [{ w: 'saw', lvl: 0.55 }, { w: 'pulse', pw: 0.3, det: 8, lvl: 0.45 }],
    flt: { cut: 750, res: 0.3, env: 3.4, a: 0.001, d: 0.13, s: 0.05, r: 0.12, kt: 0.5, vel: 0.5 }, amp: { a: 0.002, d: 0.28, s: 0, r: 0.14 },
    gain: 0.3, rev: 0.18, dly: 0.34 },
  arp_sq: { type: 'va', osc: [{ w: 'pulse', pw: 0.25, lvl: 0.7 }, { w: 'pulse', pw: 0.5, semi: 12, det: 5, lvl: 0.2 }],
    flt: { cut: 900, res: 0.2, env: 2.6, a: 0.001, d: 0.1, s: 0.1, r: 0.1, kt: 0.5 }, amp: { a: 0.002, d: 0.2, s: 0, r: 0.1 },
    gain: 0.26, rev: 0.15, dly: 0.36 },
  bell: { type: 'fm', alg: 1, ops: [{ r: 1, l: 0.6, a: 0.001, d: 1.3, s: 0, rel: 0.5 }, { r: 3.5, l: 1.9, a: 0.001, d: 0.5, s: 0, rel: 0.3 },
    { r: 2, det: 5, l: 0.22, a: 0.001, d: 0.9, s: 0, rel: 0.4 }, { r: 7, l: 1.1, a: 0.001, d: 0.2, s: 0, rel: 0.2 }],
    amp: { a: 0.001, d: 1.4, s: 0, r: 0.5 }, gain: 0.26, rev: 0.36, dly: 0.3 },
  epiano: { type: 'fm', alg: 1, ops: [{ r: 1, l: 0.7, a: 0.002, d: 1.1, s: 0.15, rel: 0.25 }, { r: 1, l: 1.3, a: 0.001, d: 0.5, s: 0.1, rel: 0.2 },
    { r: 1, det: -6, l: 0.3, a: 0.002, d: 1, s: 0.15, rel: 0.25 }, { r: 9, l: 0.9, a: 0.001, d: 0.08, s: 0, rel: 0.08 }],
    amp: { a: 0.002, d: 1.2, s: 0.2, r: 0.25 }, gain: 0.24, rev: 0.26, dly: 0.2 },
  harp: { type: 'va', osc: [{ w: 'tri', lvl: 0.7 }, { w: 'wt', table: 'glass', lvl: 0.3 }],
    flt: { cut: 1200, res: 0.1, env: 2.4, a: 0.001, d: 0.2, s: 0.1, r: 0.2, kt: 0.6 }, amp: { a: 0.002, d: 0.7, s: 0, r: 0.3 },
    gain: 0.25, rev: 0.4, dly: 0.34 },
  tension: { type: 'va', osc: [{ w: 'pulse', pw: 0.2, pwm: 0.12, pwmRate: 3, lvl: 0.6 }, { w: 'saw', det: 12, lvl: 0.3 }],
    flt: { type: 'bp', cut: 2200, res: 0.4, env: 1, a: 0.002, d: 0.08, s: 0.2, r: 0.08, lfoR: 0.5, lfoD: 0.5 }, amp: { a: 0.002, d: 0.1, s: 0.3, r: 0.06 },
    gain: 0.14, rev: 0.25, dly: 0.25 },
  // ---- 低音
  bass_fm: { type: 'fm', alg: 0, fb: 0.1, ops: [{ r: 1, l: 0.85, a: 0.002, d: 0.5, s: 0.75, rel: 0.07 }, { r: 1, l: 2.6, a: 0.001, d: 0.14, s: 0.22, rel: 0.07, ks: 0.2 },
    { r: 2, l: 1.0, a: 0.001, d: 0.07, s: 0.05, rel: 0.05, ks: 0.2 }, { r: 3, l: 0.4, a: 0.001, d: 0.04, s: 0, rel: 0.04 }],
    amp: { a: 0.002, d: 0.4, s: 1, r: 0.07 }, sub: 0, gain: 0.2, duck: true },
  bass_saw: { type: 'va', osc: [{ w: 'saw', lvl: 0.6 }, { w: 'pulse', pw: 0.45, det: -7, lvl: 0.4 }], sub: 0.38,
    flt: { cut: 260, res: 0.28, env: 3.0, a: 0.001, d: 0.14, s: 0.2, r: 0.08, kt: 0.3, vel: 0.4 }, amp: { a: 0.002, d: 0.3, s: 0.8, r: 0.07 },
    drive: 1.6, gain: 0.24, duck: true },
  bass_sub: { type: 'va', osc: [{ w: 'tri', lvl: 0.55 }, { w: 'sine', lvl: 0.6 }], sub: 0.3,
    flt: { cut: 500, res: 0.05, env: 1, a: 0.001, d: 0.2, s: 0.3, r: 0.1 }, amp: { a: 0.004, d: 0.4, s: 0.85, r: 0.1 }, gain: 0.21, duck: true },
  bass_pulse: { type: 'va', osc: [{ w: 'pulse', pw: 0.3, pwm: 0.1, pwmRate: 0.7, lvl: 0.6 }, { w: 'saw', det: 9, lvl: 0.35 }], sub: 0.4,
    flt: { cut: 320, res: 0.35, env: 2.6, a: 0.001, d: 0.1, s: 0.15, r: 0.07, kt: 0.3 }, amp: { a: 0.002, d: 0.25, s: 0.75, r: 0.06 },
    drive: 1.4, gain: 0.2, duck: true },
  // ---- 効果
  riser: { type: 'va', osc: [{ w: 'super', n: 3, spread: 40, width: 1, lvl: 0.25 }], noise: 0.9,
    flt: { type: 'bp', cut: 350, res: 0.45, env: 4.6, a: 1.9, d: 0.2, s: 1, r: 0.1, kt: 0 }, amp: { a: 1.7, d: 0.2, s: 1, r: 0.08 }, gain: 0.1, rev: 0.4 },
  sweep: { type: 'va', osc: [{ w: 'sine', lvl: 0.01 }], noise: 1,
    flt: { type: 'bp', cut: 9000, res: 0.3, env: -4, a: 0.9, d: 0.2, s: 1, r: 0.2, kt: 0 }, amp: { a: 0.004, d: 1.3, s: 0, r: 0.3 }, gain: 0.085, rev: 0.5 },
  timp: { type: 'fm', alg: 1, ops: [{ r: 1, l: 0.9, a: 0.001, d: 0.7, s: 0, rel: 0.3 }, { r: 1.5, l: 1.6, a: 0.001, d: 0.12, s: 0, rel: 0.1 },
    { r: 2.02, l: 0.2, a: 0.001, d: 0.4, s: 0, rel: 0.2 }, { r: 0.5, l: 0.6, a: 0.001, d: 0.05, s: 0, rel: 0.05 }],
    amp: { a: 0.001, d: 0.8, s: 0, r: 0.3 }, bend: 60, bendT: 0.05, gain: 0.32, rev: 0.35 },
};

export const DRUMKIT = {
  // キック: 高さが落ちるサイン＋短いクリック。サイドチェインを叩く
  k: { tone: { f0: 175, f1: 46, pt: 0.03, d: 0.3, hold: 0.025, lvl: 1 }, noise: { type: 'lp', cut: 3800, d: 0.012, lvl: 0.32 }, drive: 1.7, gain: 0.33, rev: 0.02, sc: true },
  // スネア: 胴（2 つのサイン）＋響き線（ノイズ）
  s: { tone: { f0: 290, f1: 186, pt: 0.02, d: 0.12, f2: 1.62, lvl2: 0.45, lvl: 0.6 }, noise: { type: 'bp', cut: 3600, res: 0.05, d: 0.17, lvl: 1.0 }, drive: 1.2, gain: 0.37, rev: 0.16 },
  h: { slot: 'hat', metal: { base: 410, type: 'hp', cut: 7800, d: 0.042, lvl: 1 }, noise: { type: 'hp', cut: 9000, d: 0.03, lvl: 0.35 }, gain: 0.27, pan: 0.22, rev: 0.03 },
  o: { slot: 'hat', metal: { base: 410, type: 'hp', cut: 7000, d: 0.3, lvl: 1 }, noise: { type: 'hp', cut: 8000, d: 0.22, lvl: 0.3 }, gain: 0.26, pan: 0.22, rev: 0.06 },
  x: { metal: { base: 330, type: 'hp', cut: 4200, d: 1.5, lvl: 0.8 }, noise: { type: 'hp', cut: 5200, d: 1.1, lvl: 0.75 }, gain: 0.27, pan: -0.25, rev: 0.3 },
  y: { metal: { base: 520, type: 'bp', cut: 6800, res: 0.5, d: 0.45, lvl: 1 }, tone: { f0: 5200, f1: 5200, d: 0.25, lvl: 0.05 }, gain: 0.21, pan: 0.35, rev: 0.1 },
  t: { tone: { f0: 300, f1: 190, pt: 0.05, d: 0.26, lvl: 1 }, noise: { type: 'bp', cut: 2400, res: 0.2, d: 0.03, lvl: 0.25 }, drive: 1.2, gain: 0.34, pan: -0.3, rev: 0.14 },
  u: { tone: { f0: 190, f1: 105, pt: 0.06, d: 0.32, lvl: 1 }, noise: { type: 'bp', cut: 1600, res: 0.2, d: 0.03, lvl: 0.25 }, drive: 1.2, gain: 0.38, pan: 0.3, rev: 0.14 },
  j: { tone: { f0: 1750, f1: 1700, pt: 0.01, d: 0.035, f2: 0.283, lvl2: 0.6, lvl: 0.8 }, noise: { type: 'bp', cut: 4200, res: 0.3, d: 0.012, lvl: 0.5 }, gain: 0.2, pan: -0.15, rev: 0.12 },
  // クラップ: 短いノイズを 3 回＋尾
  c: { noise: { type: 'bp', cut: 1500, res: 0.35, d: 0.2, lvl: 1.3, bursts: 3, gap: 0.011, bd: 0.012 }, gain: 0.34, pan: 0.1, rev: 0.22 },
};
