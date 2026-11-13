// Sky Climber VR — 掛け声の合成（声帯の波形＋3 つのフォルマント共振器による音源・フィルター方式）。
// 参考作品の声は ROM の短いデジタルサンプル（MAME で確認）。本作は録音を使わず、日本語の音素を並べて合成し、
// 当時のサンプル再生のような「低いサンプリング周波数・粗い量子化」に落として、短く・少し高く・コミカルに誇張する。
// 一般的な読み上げ音声（speechSynthesis）は掛け声には使わない。
const V = { // 母音のフォルマント（Hz）: 日本語の成人男性の平均的な値を出発点に、キャラクター用に少し高くする
  a: [800, 1250, 2600], i: [320, 2250, 3000], u: [360, 1350, 2400], e: [500, 1900, 2600], o: [520, 900, 2500],
};
// 音素: kind = vowel | fric（摩擦）| stop（閉鎖＋破裂）| tap | nasal | glide | sil
const P = {
  a: { kind: 'vowel', f: V.a }, i: { kind: 'vowel', f: V.i }, u: { kind: 'vowel', f: V.u }, e: { kind: 'vowel', f: V.e }, o: { kind: 'vowel', f: V.o },
  y: { kind: 'glide', f: [280, 2300, 3000] }, w: { kind: 'glide', f: [320, 800, 2300] },
  sh: { kind: 'fric', fc: 3600, bw: 2400, amp: 0.55 }, h: { kind: 'asp', amp: 0.45 },
  t: { kind: 'stop', fc: 4200, bw: 2500, voiced: false }, k: { kind: 'stop', fc: 2000, bw: 1200, voiced: false },
  g: { kind: 'stop', fc: 1800, bw: 1000, voiced: true }, b: { kind: 'stop', fc: 800, bw: 900, voiced: true }, d: { kind: 'stop', fc: 3200, bw: 1500, voiced: true },
  r: { kind: 'tap', f: [380, 1400, 2500] }, n: { kind: 'nasal', f: [260, 1700, 2650] }, N: { kind: 'nasal', f: [260, 1250, 2600] },
  Q: { kind: 'sil' }, _: { kind: 'sil' },
};
// 掛け声の台本: [音素, 長さ秒]、f0（声の高さ）の折れ線 [時刻比, Hz]、formant 倍率、amp
export const VOICES = {
  yoisho: { seg: [['y', 0.05], ['o', 0.10], ['i', 0.09], ['sh', 0.09], ['o', 0.20]], f0: [[0, 250], [0.35, 330], [0.6, 300], [1, 220]], fm: 1.12 },
  itte:   { seg: [['i', 0.09], ['Q', 0.06], ['t', 0.03], ['e', 0.11], ['Q', 0.03]], f0: [[0, 340], [0.5, 400], [1, 360]], fm: 1.15 },
  are:    { seg: [['a', 0.14], ['r', 0.035], ['e', 0.55]], f0: [[0, 300], [0.25, 380], [0.45, 360], [1, 150]], fm: 1.12 },
  ganbare:{ seg: [['g', 0.04], ['a', 0.08], ['N', 0.07], ['b', 0.04], ['a', 0.08], ['r', 0.03], ['e', 0.16]], f0: [[0, 240], [0.4, 300], [0.7, 320], [1, 250]], fm: 1.1 },
  yatta:  { seg: [['y', 0.05], ['a', 0.11], ['Q', 0.08], ['t', 0.025], ['a', 0.30]], f0: [[0, 280], [0.45, 330], [0.7, 420], [1, 380]], fm: 1.14 },
  wa:     { seg: [['w', 0.05], ['a', 0.14], ['Q', 0.02]], f0: [[0, 360], [0.5, 430], [1, 330]], fm: 1.15 },
  // 窓の住人（低く、少しだみ声）
  kora:   { seg: [['k', 0.035], ['o', 0.09], ['r', 0.03], ['a', 0.34]], f0: [[0, 140], [0.35, 175], [1, 115]], fm: 0.95, rough: 0.25 },
  hoi:    { seg: [['h', 0.06], ['o', 0.08], ['i', 0.08], ['Q', 0.02]], f0: [[0, 150], [0.5, 185], [1, 160]], fm: 0.96, rough: 0.2 },
  // 屋上のパイロット
  okaeri: { seg: [['o', 0.08], ['k', 0.03], ['a', 0.07], ['e', 0.07], ['r', 0.03], ['i', 0.14]], f0: [[0, 190], [0.5, 230], [1, 170]], fm: 1.0 },
};

function resonator(F, BW, sr) { const T = 1 / sr, C = -Math.exp(-2 * Math.PI * BW * T), B = 2 * Math.exp(-Math.PI * BW * T) * Math.cos(2 * Math.PI * F * T), A = 1 - B - C; return { A, B, C }; }
function lerp(a, b, t) { return a + (b - a) * t; }
function interp(pts, x) { for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const t = (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]); return lerp(pts[i - 1][1], pts[i][1], t); } return pts[pts.length - 1][1]; }

// 合成して Float32Array を返す。lofi: 当時のサンプル再生風（サンプリング 8kHz・8bit 量子化）
// hq: モダン音源用（量子化なし・第 4 フォルマント・息の成分・声の高さの細かなゆらぎ・口元の放射特性）
export function synthVoice(name, sampleRate = 44100, { lofi = true, seed = 1, hq = false } = {}) {
  const v = VOICES[name]; if (!v) throw new Error('voice: ' + name);
  const total = v.seg.reduce((s, x) => s + x[1], 0);
  const n = Math.ceil((total + 0.05) * sampleRate);
  const out = new Float32Array(n);
  let rnd = seed * 9301 + 49297; const noise = () => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x3fffffff - 1; };
  // 区間ごとの目標（前後の母音へなめらかに移る）
  const bounds = []; let acc = 0; for (const s of v.seg) { bounds.push([acc, acc + s[1], P[s[0]], s[0]]); acc += s[1]; }
  const formantsAt = (k) => { // k 番目の区間の声道（子音は次の母音の形を借りる）
    const p = bounds[k][2];
    if (p.f) return p.f;
    for (let j = k + 1; j < bounds.length; j++) if (bounds[j][2].f) return bounds[j][2].f;
    for (let j = k - 1; j >= 0; j--) if (bounds[j][2].f) return bounds[j][2].f;
    return V.a;
  };
  const y1 = [0, 0, 0, 0], y2 = [0, 0, 0, 0]; let fy1 = 0, fy2 = 0, jit = 0, prevOut = 0;
  const NF = hq ? 4 : 3;
  let phase = 0, prevG = 0, amp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let k = bounds.findIndex((b) => t < b[1]); if (k < 0) k = bounds.length - 1;
    const [t0, t1, p] = bounds[k];
    const local = (t - t0) / Math.max(1e-6, t1 - t0);
    // 声道の形: 区間の始め 35ms で前の区間の形から移る
    const cur = formantsAt(k), prev = k > 0 ? formantsAt(k - 1) : cur;
    const tr = Math.min(1, (t - t0) / 0.035);
    const F = cur.map((f, j) => lerp(prev[j], f, tr) * v.fm); if (hq) F.push(3650 * v.fm);
    // 声の高さ（f0）と声帯の波形（Rosenberg パルスの微分）
    const f0 = interp(v.f0, Math.min(1, t / total)) * (1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t));
    if (hq) { jit += (noise() * 0.012 - jit) * 0.002; }
    phase += f0 * (1 + jit) / sampleRate; if (phase >= 1) phase -= 1;
    const Tp = 0.42, Tn = 0.16;
    const g = phase < Tp ? 0.5 * (1 - Math.cos(Math.PI * phase / Tp)) : phase < Tp + Tn ? Math.cos(Math.PI * (phase - Tp) / (2 * Tn)) : 0;
    let src = (g - prevG) * 18; prevG = g;
    if (v.rough) src *= 1 + v.rough * noise(); // だみ声
    // 区間の種類ごとの音源の混ぜ方
    let voiced = 0, asp = 0, fric = 0, fc = 0, fbw = 0;
    let target = 1;
    switch (p.kind) {
      case 'vowel': voiced = 1; break;
      case 'glide': voiced = 0.8; break;
      case 'tap': voiced = 0.6 * (0.5 + 0.5 * Math.abs(local - 0.5) * 2); break;
      case 'nasal': voiced = 0.45; break;
      case 'asp': asp = p.amp; voiced = local > 0.7 ? (local - 0.7) / 0.3 : 0; break;
      case 'fric': fric = p.amp; fc = p.fc; fbw = p.bw; break;
      case 'stop': if (local < 0.6) { voiced = p.voiced ? 0.12 : 0; target = p.voiced ? 0.3 : 0; } else { fric = 0.9 * (1 - (local - 0.6) / 0.4); fc = p.fc; fbw = p.bw; asp = p.voiced ? 0 : 0.3; } break;
      case 'sil': target = 0; break;
    }
    // 始まりと終わりの音量の包絡
    const env = Math.min(1, t / 0.012, Math.max(0, (total - t) / 0.06));
    amp += ((p.kind === 'sil' ? 0 : target) - amp) * 0.02;
    let x = (src * voiced + noise() * (asp * 0.6 + (hq ? voiced * 0.035 : 0))) * amp; // hq: 母音にも少し息を混ぜる
    for (let j = 0; j < NF; j++) {
      const bw = [80, 110, 170, 260][j];
      const r = resonator(Math.min(F[j], sampleRate * 0.45), bw, sampleRate);
      const yv = r.A * x + r.B * y1[j] + r.C * y2[j]; y2[j] = y1[j]; y1[j] = yv; x = yv;
    }
    let s = x;
    if (fric > 0) { const r = resonator(fc, fbw, sampleRate); const fy = r.A * noise() + r.B * fy1 + r.C * fy2; fy2 = fy1; fy1 = fy; s += fy * fric * 0.6; }
    if (hq) { const r = s - 0.6 * prevOut; prevOut = s; s = s * 0.5 + r * 0.9; } // 口元の放射（高域を持ち上げて明るく）
    out[i] = s * env;
  }
  // 正規化して、当時のサンプル再生のように 8kHz・8bit に落とす
  let peak = 1e-6; for (const s of out) peak = Math.max(peak, Math.abs(s));
  const g = 0.85 / peak;
  if (!lofi) { for (let i = 0; i < n; i++) out[i] *= g; return out; }
  const hold = Math.max(1, Math.round(sampleRate / 8000));
  let held = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    if (i % hold === 0) held = Math.round(out[i] * g * 127) / 127;
    lp += (held - lp) * 0.45; // DAC の後ろの簡単なローパス
    out[i] = lp;
  }
  return out;
}
