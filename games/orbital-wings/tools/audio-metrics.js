// ORBITAL WINGS — 音の数値点検の部品（tools/render-audio.js と tests/audio.test.js が使う。Node 専用）
// 耳で聴けない環境なので、書き出した波形を数値で確かめる: ピーク・真のピーク（4 倍補間）・ラウドネス（BS.1770 の K 特性＋ゲート）・
// オクターブ帯域ごとの量・左右の相関・直流・クリップ数・無音／NaN。

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const k = i + j + len / 2, ur = re[i + j], ui = im[i + j];
        const vr = re[k] * cr - im[k] * ci, vi = re[k] * ci + im[k] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi; re[k] = ur - vr; im[k] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

export function basic(L, R = L) {
  let peak = 0, sq = 0, sum = 0, clip = 0, nan = 0, lr = 0, ll = 0, rr = 0;
  const n = L.length;
  for (let i = 0; i < n; i++) {
    const a = L[i], b = R[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) { nan++; continue; }
    const pa = Math.abs(a), pb = Math.abs(b);
    if (pa > peak) peak = pa; if (pb > peak) peak = pb;
    if (pa >= 0.98 || pb >= 0.98) clip++;
    sq += a * a + b * b; sum += a + b; lr += a * b; ll += a * a; rr += b * b;
  }
  return { peak, rms: Math.sqrt(sq / (2 * n)), dc: sum / (2 * n), clip, nan, corr: ll > 0 && rr > 0 ? lr / Math.sqrt(ll * rr) : 1 };
}

// 真のピークの近似: 4 倍に補間して最大値（窓付き sinc、片側 6 標本）
export function truePeak(x) {
  const T = 6, ph = [];
  for (let p = 1; p < 4; p++) { const h = []; for (let k = -T + 1; k <= T; k++) { const t = k - p / 4; const w = 0.5 + 0.5 * Math.cos(Math.PI * t / T); h.push(Math.abs(t) < 1e-9 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t) * w); } ph.push(h); }
  let pk = 0;
  for (let i = T; i < x.length - T; i++) {
    const a = Math.abs(x[i]); if (a > pk) pk = a;
    if (a < 0.5 * pk) continue;                       // 小さい所は飛ばす（速さのため）
    for (let p = 0; p < 3; p++) { const h = ph[p]; let s = 0; for (let k = 0; k < 2 * T; k++) s += x[i - T + 1 + k] * h[k]; if (s < 0) s = -s; if (s > pk) pk = s; }
  }
  return pk;
}

// BS.1770 の K 特性（48kHz の係数）
function kWeight(x) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, v1 = 0, v2 = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i];
    const s = 1.53512485958697 * a - 2.69169618940638 * x1 + 1.19839281085285 * x2 + 1.69065929318241 * y1 - 0.73248077421585 * y2;
    x2 = x1; x1 = a; y2 = y1; y1 = s;
    const h = s - 2 * u1 + u2 + 1.99004745483398 * v1 - 0.99007225036621 * v2;
    u2 = u1; u1 = s; v2 = v1; v1 = h;
    y[i] = h;
  }
  return y;
}
const lu = (ms) => -0.691 + 10 * Math.log10(Math.max(ms, 1e-12));
// 統合ラウドネス（LUFS）、最大の瞬間値（400ms）、短時間値（3 秒）の幅。rate は 48000 のこと
export function loudness(L, R = L, rate = 48000) {
  const kl = kWeight(L), kr = R === L ? kl : kWeight(R);
  const blk = Math.round(0.4 * rate), hop = Math.round(0.1 * rate);
  const cs = new Float64Array(L.length + 1);
  for (let i = 0; i < L.length; i++) cs[i + 1] = cs[i] + kl[i] * kl[i] + kr[i] * kr[i];
  const ms = [];
  for (let s = 0; s + blk <= L.length; s += hop) ms.push((cs[s + blk] - cs[s]) / blk);
  if (!ms.length) ms.push(cs[L.length] / Math.max(1, L.length));
  const abs = ms.filter((m) => lu(m) > -70);
  if (!abs.length) return { lufs: -Infinity, momentaryMax: -Infinity, range: 0 };
  const rel = lu(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const g = abs.filter((m) => lu(m) > rel);
  const lufs = lu(g.reduce((a, b) => a + b, 0) / g.length);
  const st = []; const sb = Math.round(3 * rate);
  for (let s = 0; s + sb <= L.length; s += rate) st.push(lu((cs[s + sb] - cs[s]) / sb));
  const stg = st.filter((v) => v > lufs - 20).sort((a, b) => a - b);
  const range = stg.length > 2 ? stg[Math.floor(stg.length * 0.95)] - stg[Math.floor(stg.length * 0.1)] : 0;
  return { lufs, momentaryMax: lu(Math.max(...ms)), range };
}

export const BANDS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
// オクターブ帯域ごとの量（全体に対する dB）。モノラルに混ぜて測る
export function bands(L, R = L, rate = 48000) {
  const N = 8192, re = new Float64Array(N), im = new Float64Array(N), acc = new Float64Array(BANDS.length);
  const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  let tot = 0, cnum = 0, cden = 0;
  for (let s = 0; s + N <= L.length; s += N / 2) {
    for (let i = 0; i < N; i++) { re[i] = 0.5 * (L[s + i] + R[s + i]) * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = k * rate / N, p = re[k] * re[k] + im[k] * im[k];
      tot += p; cnum += p * f; cden += p;
      for (let b = 0; b < BANDS.length; b++) if (f >= BANDS[b] / Math.SQRT2 && f < BANDS[b] * Math.SQRT2) { acc[b] += p; break; }
    }
  }
  return { db: Array.from(acc, (p) => 10 * Math.log10(Math.max(p, 1e-20) / Math.max(tot, 1e-20))), centroid: cden ? cnum / cden : 0 };
}

// 左右の相関の最小値（2 秒の窓。無音の窓は除く）
export function minCorr(L, R, rate = 48000) {
  const w = 2 * rate; let mn = 1;
  for (let s = 0; s + w <= L.length; s += rate) {
    let lr = 0, ll = 0, rr = 0;
    for (let i = s; i < s + w; i++) { lr += L[i] * R[i]; ll += L[i] * L[i]; rr += R[i] * R[i]; }
    if (ll / w < 1e-5 || rr / w < 1e-5) continue;
    const c = lr / Math.sqrt(ll * rr); if (c < mn) mn = c;
  }
  return mn;
}

// 最大の 1 標本の段差（クリックの目安）と、その位置
export function maxStep(x, a = 1, b = x.length) { let m = 0, at = 0; for (let i = Math.max(1, a); i < b; i++) { const d = Math.abs(x[i] - x[i - 1]); if (d > m) { m = d; at = i; } } return { step: m, at }; }

export function writeWav(fs, path, L, R, rate) {
  const ch = R ? 2 : 1, n = L.length, buf = Buffer.alloc(44 + n * 2 * ch);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2 * ch, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2 * ch, 28); buf.writeUInt16LE(2 * ch, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2 * ch, 40);
  const q = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  for (let i = 0; i < n; i++) { buf.writeInt16LE(q(L[i]), 44 + i * 2 * ch); if (R) buf.writeInt16LE(q(R[i]), 46 + i * 4); }
  fs.writeFileSync(path, buf);
}
