// AEGIS RELAY 2D — 焼いた絵の置き場（スプライト・光の玉・爆発のコマ・文字）
// ・機体などのベクターの絵は「いまの表示倍率 × 上乗せ（低解像度では 2 倍）」で焼き、高品質に縮小して使う（輪郭がなめらか）
// ・光の玉・火球・煙・輪はやわらかい絵なので固定解像度で 1 回だけ焼く
// ・白い影絵（被弾の閃光用）は必要になったときに作る
import { TAU, clamp, smooth, hexRgb, css, fbm, makeCanvas, freeCanvas, mem } from './util.js';

export const GLOWS = { white: '#ffffff', cyan: '#7fe6ff', blue: '#3f8cff', gold: '#ffd166', orange: '#ff9a3d', red: '#ff5040', pink: '#ff4fa8', green: '#7dffb0', purple: '#c08cff', yellow: '#fff2a0' };

export function createAtlas(R) {
  const defs = new Map(), baked = new Map(), whites = new Map(), texts = new Map();
  const glows = {}, fire = [], smoke = [];
  let ring = null, streak = null, softDisc = null, crack = null;

  function define(key, ext, draw) { defs.set(key, { ext, draw }); }
  const ss = () => (R.K < 2.5 ? 2 : R.K < 4.5 ? 1.5 : 1);
  function bake(key) {
    const d = defs.get(key); if (!d) throw new Error('sprite 未定義: ' + key);
    const sc = Math.min(R.K * ss(), 620 / (d.ext * 2)), px = Math.ceil(d.ext * 2 * sc);
    const cv = makeCanvas(px, px), c = cv.getContext('2d');
    c.setTransform(sc, 0, 0, sc, px / 2, px / 2); c.lineJoin = 'round'; c.lineCap = 'round';
    d.draw(c, 1 / sc); cv.ext = d.ext; baked.set(key, cv); return cv;
  }
  const get = (key) => baked.get(key) || bake(key);
  function white(key) {
    let w = whites.get(key); if (w) return w;
    const s = get(key); w = makeCanvas(s.width, s.height); const c = w.getContext('2d');
    c.drawImage(s, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = '#fff'; c.fillRect(0, 0, w.width, w.height); w.ext = s.ext; whites.set(key, w); return w;
  }
  // 倍率が変わった: 倍率に合わせて焼いたものを捨てる
  function invalidate() { for (const m of [baked, whites, texts]) { for (const cv of m.values()) freeCanvas(cv); m.clear(); } }
  // 全部の絵を先に焼いておく仕事（初めて出る敵で引っかからない）
  function* prewarm() { for (const key of defs.keys()) { if (!baked.has(key)) bake(key); yield; } }

  // スプライトを描く（盤面の座標。回転・拡大つき）。回転しても補間品質は高いまま
  function draw(c, cv, x, y, rot = 0, sx = 1, sy = sx) {
    const e = cv.ext;
    if (!rot && sx === 1 && sy === 1) { c.drawImage(cv, x - e, y - e, e * 2, e * 2); return; }
    const K = R.K, cs = Math.cos(rot) * K, sn = Math.sin(rot) * K;
    c.setTransform(cs * sx, sn * sx, -sn * sy, cs * sy, R.bx + x * K, R.by + y * K); c.drawImage(cv, -e, -e, e * 2, e * 2); c.setTransform(K, 0, 0, K, R.bx, R.by);
  }
  const spr = (c, key, x, y, rot, sx, sy) => draw(c, get(key), x, y, rot, sx, sy);
  // 光の玉（加算で使う。合成モードは呼ぶ側でまとめて切り替える）
  function glow(c, col, x, y, r, a = 1) { if (a <= 0.004) return; c.globalAlpha = a > 1 ? 1 : a; c.drawImage(glows[col], x - r, y - r, r * 2, r * 2); }

  function bakeFixed() {
    for (const [name, hex] of Object.entries(GLOWS)) {
      const n = 96, cv = makeCanvas(n, n), c = cv.getContext('2d'), col = hexRgb(hex), g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      g.addColorStop(0, css([255, 255, 255], 1)); g.addColorStop(0.12, css(col.map((v) => v * 0.5 + 127), 0.95)); g.addColorStop(0.3, css(col, 0.55)); g.addColorStop(0.55, css(col, 0.2)); g.addColorStop(0.8, css(col, 0.05)); g.addColorStop(1, css(col, 0));
      c.fillStyle = g; c.fillRect(0, 0, n, n); glows[name] = cv;
    }
    // 火球 14 コマ（白 → 黄 → 橙 → 暗い赤。フラクタルノイズで縁がちぎれる）
    const N = 14, S = 96;
    for (let f = 0; f < N; f++) {
      const t = f / (N - 1), cv = makeCanvas(S, S), c = cv.getContext('2d'), img = c.createImageData(S, S), d = img.data, Rr = 0.42 + 0.58 * Math.sqrt(t);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1, dd = Math.sqrt(dx * dx + dy * dy) / Rr;
        const nn = fbm(x * 3.2 + f * 7, y * 3.2 - f * 13) - 0.5, n2 = fbm(x * 7 + 90 - f * 5, y * 7 + f * 9) - 0.5;
        const heat = ((1 - dd) * 1.5 + nn * (1.1 + t) + n2 * 0.5) * (1.9 - t * 1.75) - t * 0.35, o = (y * S + x) * 4;
        if (heat <= 0 || dd > 1.25) continue;
        d[o] = 255 * clamp(heat * 3.2); d[o + 1] = 255 * clamp(heat * 1.5 - 0.22); d[o + 2] = 255 * clamp(heat * 1.4 - 0.75); d[o + 3] = 255 * smooth(0, 0.22, heat) * smooth(1.2, 0.9, dd);
      }
      c.putImageData(img, 0, 0); fire.push(cv);
    }
    // 煙 4 種
    for (let v = 0; v < 4; v++) {
      const cv = makeCanvas(64, 64), c = cv.getContext('2d'), img = c.createImageData(64, 64), d = img.data;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const dx = x / 32 - 1, dy = y / 32 - 1, dd = Math.sqrt(dx * dx + dy * dy), nn = fbm(x * 4 + v * 131, y * 4 + v * 57), a = smooth(0.45, 0.9, nn * 0.8 + (1 - dd) * 0.75) * smooth(1, 0.6, dd), o = (y * 64 + x) * 4;
        const sh = 60 + 70 * smooth(0.3, 0.8, nn - dy * 0.2 - dx * 0.2); d[o] = sh; d[o + 1] = sh * 0.96; d[o + 2] = sh * 0.94; d[o + 3] = a * 235;
      }
      c.putImageData(img, 0, 0); smoke.push(cv);
    }
    { // 衝撃波の輪
      const n = 192, cv = ring = makeCanvas(n, n), c = cv.getContext('2d'), g = c.createRadialGradient(n / 2, n / 2, n * 0.3, n / 2, n / 2, n / 2);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.62, 'rgba(255,255,255,.1)'); g.addColorStop(0.86, 'rgba(255,255,255,1)'); g.addColorStop(0.93, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, n, n); }
    { // 火花・残像の筋（左が尾、右が頭）
      const cv = streak = makeCanvas(64, 12), c = cv.getContext('2d'), g = c.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(255,255,255,.7)'); g.addColorStop(1, '#fff'); c.fillStyle = g; c.fillRect(0, 0, 64, 12);
      c.globalCompositeOperation = 'destination-in'; const g2 = c.createLinearGradient(0, 0, 0, 12); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(0.5, '#000'); g2.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g2; c.fillRect(0, 0, 64, 12); }
    { // やわらかい黒い円（影）
      const n = 64, cv = softDisc = makeCanvas(n, n), c = cv.getContext('2d'), g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); g.addColorStop(0, 'rgba(0,0,0,.75)'); g.addColorStop(0.5, 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, n, n); }
    { // 損傷の亀裂の光
      const n = 96, cv = crack = makeCanvas(n, n), c = cv.getContext('2d'); c.translate(n / 2, n / 2); c.lineCap = 'round'; let s = 5;
      const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      for (const [w, col] of [[7, 'rgba(255,120,30,.25)'], [3, 'rgba(255,170,60,.6)'], [1.2, 'rgba(255,245,200,1)']]) { s = 5; c.strokeStyle = col; c.lineWidth = w;
        for (let k = 0; k < 4; k++) { let a = k * 1.7 + rnd(), x = 0, y = 0; c.beginPath(); c.moveTo(x + (rnd() - 0.5) * 16, y + (rnd() - 0.5) * 16); for (let i = 0; i < 4; i++) { a += (rnd() - 0.5) * 1.6; x += Math.cos(a) * 9; y += Math.sin(a) * 9; c.lineTo(x, y); } c.stroke(); } } }
  }
  bakeFixed();

  // 文字の絵（得点・番号）。同じ文字は使い回す
  function text(str, size, col) {
    const key = str + '|' + size + '|' + col; let cv = texts.get(key); if (cv) return cv;
    if (texts.size > 90) { for (const t of texts.values()) mem.px -= t.width * t.height; texts.clear(); } // 表示中の文字が使っているかもしれないので、絵そのものは消さない
    const sc = R.K * (R.K < 3 ? 2 : 1.25), font = `800 ${size * sc}px 'AR Sans', sans-serif`, m = makeCanvas(1, 1).getContext('2d'); m.font = font;
    const w = Math.ceil(m.measureText(str).width + size * sc * 0.8), h = Math.ceil(size * sc * 1.7);
    cv = makeCanvas(w, h); const c = cv.getContext('2d'); c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.lineWidth = size * sc * 0.34; c.strokeStyle = 'rgba(4,6,14,.9)'; c.strokeText(str, w / 2, h / 2); c.fillStyle = col; c.fillText(str, w / 2, h / 2);
    cv.wu = w / sc; cv.hu = h / sc; texts.set(key, cv); return cv;
  }
  return { define, get, white, invalidate, prewarm, draw, spr, glow, text, glows, fire, smoke, has: (k) => defs.has(k), keys: () => [...defs.keys()],
    get ring() { return ring; }, get streak() { return streak; }, get softDisc() { return softDisc; }, get crack() { return crack; } };
}
