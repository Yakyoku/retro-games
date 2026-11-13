// AEGIS RELAY 2D — 浮遊大陸: 高さマップの陰影・崖・素材・遺跡・導線・紋様を「帯（ストリップ）」に焼いて流す
// ・1 つの島を縦 40 単位の帯に分け、スクロールの先を少しずつ焼き、通り過ぎたら捨てる（4K でもメモリを抑える）
// ・陰影（ImageData）は最大 4 画素/単位で計算して拡大し、その上に実解像度のベクターの細部を重ねる
// ・毎フレームは帯の drawImage だけ。焦げ跡は帯に直接焼き足す（毎フレームの負担なし）
import { FIELD, THEMES, AREAS } from '../shared/rules.js';
import { ART, LIGHT } from './themes2d.js';
import { makeMaterial } from './materials.js';
import { TAU, lerp, clamp, smooth, rng, hexRgb, mix3, css, fbm, makeCanvas, freeCanvas } from './util.js';
import { drawRuin, drawFeature } from './terrain-detail.js';

const EMF = { glyph: 1, crest: 1, plinth: 1, crystal: 1, road: 1, vent: 1, inlay: 1, medal: 1 }; // 発光の層にも描く細部
const W = FIELD.W, H = FIELD.H, STRIP = 40, CLIFF_MAX = 34, RPAD = 2, PAD = 2;

export function createTerrain(R) {
  let def = null, area = -1, theme = 'ash', th = THEMES.ash, art = ART.ash, mat = null, metas = [];
  const strips = new Map();
  let scorches = [], grainPat = null, grainKey = '', scorchSpr = null, tmpA = null, tmpB = null, tmpE = null;
  let eL = 0, eR = 0;

  // ── 島の輪郭（なめらかな補間＋細かいゆらぎ＋丸い両端）──
  function edge(m, wy) {
    if (wy < m.wyA || wy > m.wyB) return false;
    const isl = m.isl, Lf = isl.left, Rt = isl.right, n = Lf.length - 1;
    let l, r;
    if (wy < isl.wy0) { const t = (isl.wy0 - wy) / m.cap0, k = Math.sqrt(Math.max(0, 1 - t * t)), c = (Lf[0] + Rt[0]) / 2, hw = (Rt[0] - Lf[0]) / 2 * k; l = c - hw; r = c + hw; }
    else if (wy > m.wyE) { const t = (wy - m.wyE) / m.cap1, k = Math.sqrt(Math.max(0, 1 - t * t)), c = (Lf[n] + Rt[n]) / 2, hw = (Rt[n] - Lf[n]) / 2 * k; l = c - hw; r = c + hw; }
    else {
      const f = (wy - isl.wy0) / isl.step, i = Math.min(n - 1, Math.floor(f)), t = f - i, i0 = Math.max(0, i - 1), i3 = Math.min(n, i + 2);
      const cr = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
      l = cr(Lf[i0], Lf[i], Lf[i + 1], Lf[i3]); r = cr(Rt[i0], Rt[i], Rt[i + 1], Rt[i3]);
    }
    const wob = Math.min(1, (r - l) / 30);
    eL = l + (fbm(wy * 3.3 + m.seed, m.seed * 1.7) - 0.5) * 8 * wob; eR = r + (fbm(wy * 3.3 + m.seed + 211, 91.5) - 0.5) * 8 * wob;
    return eR > eL;
  }
  const cliffH = (m, x) => Math.min(CLIFF_MAX - 1, (11 + 20 * fbm(x * 5 + m.seed, 50 + m.seed)) * (0.5 + 0.5 * fbm(x * 21 + 3, 7.5)) + 3);
  // その点が島の上か（0..1。縁の近くで薄くなる）。影を「地面にだけ」落とすのに使う
  function landAlpha(x, wy) {
    let a = 0;
    for (const m of metas) if (edge(m, wy)) a = Math.max(a, clamp(Math.min(x - eL, eR - x) / 5));
    return a;
  }

  // ── エリアの準備（島ごとの飾りの一覧を、決まった乱数で作る）──
  function setArea(g) {
    reset();
    def = g.def; area = g.area; theme = AREAS[area].theme; th = THEMES[theme]; art = ART[theme];
    mat = makeMaterial(theme, th, area + 1);
    metas = def.islands.map((isl, idx) => buildMeta(isl, idx, idx === def.islands.length - 1));
  }
  function buildMeta(isl, idx, isCore) {
    const n = isl.left.length - 1, cap0 = Math.max(6, (isl.right[0] - isl.left[0]) * 0.42), cap1 = Math.max(6, (isl.right[n] - isl.left[n]) * 0.42);
    const m = { isl, idx, isCore, seed: (idx * 37.7 + area * 91.3) % 400, cap0, cap1, wyE: isl.wy0 + n * isl.step, feats: [], lamps: [], glints: [], falls: [], craters: [] };
    m.wyA = isl.wy0 - cap0; m.wyB = m.wyE + cap1;
    let x0 = 1e9, x1 = -1e9; for (let i = 0; i <= n; i++) { x0 = Math.min(x0, isl.left[i]); x1 = Math.max(x1, isl.right[i]); }
    m.x0 = Math.floor(Math.max(-3, x0 - 6)); m.x1 = Math.ceil(Math.min(W + 3, x1 + 6));
    m.base = Math.floor((m.wyA - CLIFF_MAX - 4) / STRIP) * STRIP; m.nStrips = Math.ceil((m.wyB + 2 - m.base) / STRIP);
    const r = rng(Math.round(isl.wy0 * 13 + area * 7 + idx * 101)), len = m.wyB - m.wyA;
    const inside = (x, wy, mg) => edge(m, wy) && x > eL + mg && x < eR - mg;
    const pick = (mg, tries = 12) => { for (let k = 0; k < tries; k++) { const wy = m.wyA + r() * len; if (!edge(m, wy)) continue; if (eR - eL < mg * 2 + 4) continue; const x = eL + mg + r() * (eR - eL - mg * 2); if (m.isCore && Math.hypot(x - 120, wy - def.coreWy) < 72) continue; return [x, wy]; } return null; };
    const add = (f) => { m.feats.push(f); return f; };
    // 標的の土台と、それをつなぐ導線（砲台・トーチカ・格納庫）
    const pads = def.ground.filter((d) => (d.type === 'turret' || d.type === 'bunker' || d.type === 'dock') && inside(d.x, d.wy, 4)).sort((a, b) => a.wy - b.wy);
    if (pads.length || m.isCore) {
      const pts = []; let sx = (isl.left[0] + isl.right[0]) / 2;
      pts.push([sx, isl.wy0 - cap0 * 0.3]);
      for (const p of pads) pts.push([p.x, p.wy]);
      if (m.isCore) pts.push([120, def.coreWy - 70]); else { const e2 = (isl.left[n] + isl.right[n]) / 2; pts.push([e2, m.wyE + cap1 * 0.3]); }
      // 直線ではなく、途中に折れ点を入れた道筋にする
      const path = [pts[0]];
      for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if (Math.abs(b[1] - a[1]) > 18) { const my = (a[1] + b[1]) / 2; path.push([a[0], my], [b[0], my]); } path.push(b); }
      add({ t: 'road', pts: path, wy: (path[0][1] + path[path.length - 1][1]) / 2, r: len });
    }
    for (const p of pads) add({ t: 'pad', x: p.x, wy: p.wy, r: p.type === 'turret' ? 12 : 15, kind: p.type });
    for (const ru of isl.ruins) { if (m.isCore && Math.hypot(ru.x - 120, ru.wy - def.coreWy) < 74) continue; add({ t: 'ruin', x: ru.x, wy: ru.wy, r: 26 * ru.s, ru }); }
    // 脈動する紋様
    for (let k = 0; k < Math.max(1, Math.round(len / 85)); k++) { const p = pick(14); if (p && !pads.some((q) => Math.hypot(q.x - p[0], q.wy - p[1]) < 24)) add({ t: 'glyph', x: p[0], wy: p[1], r: 8 + r() * 4, v: Math.floor(r() * 4), rot: r() * TAU }); }
    // テーマ別の細部
    const cnt = (per) => Math.round((len * (isl.hw / 80)) / per);
    const many = (num, mg, fn) => { for (let k = 0; k < num; k++) { const p = pick(mg); if (p) fn(p[0], p[1]); } };
    if (theme === 'ash') { many(cnt(16), 9, (x, wy) => m.craters.push({ x, wy, r: 3 + r() * r() * 9 })); many(cnt(9), 4, (x, wy) => add({ t: 'rock', x, wy, r: 1 + r() * 2.2, sd: r() * 99 })); }
    if (theme === 'ice') { many(cnt(15), 6, (x, wy) => add({ t: 'crack', x, wy, r: 14 + r() * 12, sd: Math.floor(r() * 9999) })); many(cnt(22), 5, (x, wy) => add({ t: 'shard', x, wy, r: 2 + r() * 2.5, sd: r() * 99, col: 'ice' })); }
    if (theme === 'ember') { many(cnt(12), 4, (x, wy) => add({ t: 'rock', x, wy, r: 1.2 + r() * 2.6, sd: r() * 99, dark: 1 })); many(cnt(60), 8, (x, wy) => { add({ t: 'vent', x, wy, r: 2.2 }); m.lamps.push({ x, wy, col: 'orange', ph: r() * TAU, sp: 0.03 + r() * 0.03, s: 5 }); }); }
    if (theme === 'mech') {
      many(cnt(26), 8, (x, wy) => add({ t: 'pipe', x, wy, r: 30, len: 16 + r() * 34, hz: r() < 0.5, sd: r() * 99 }));
      many(cnt(34), 7, (x, wy) => add({ t: 'grille', x, wy, r: 5, s: 2.6 + r() * 2 }));
      many(cnt(30), 6, (x, wy) => { add({ t: 'lampBase', x, wy, r: 1.5 }); m.lamps.push({ x, wy, col: r() < 0.3 ? 'red' : 'green', ph: r() * TAU, sp: 0.05 + r() * 0.08, s: 3.2, blink: 1 }); });
    }
    if (theme === 'moss') { many(cnt(5), 4, (x, wy) => { if (!mat.water(x, wy, Math.min(x - eL, eR - x))) add({ t: 'tuft', x, wy, r: 2.5, sd: r() * 99 }); }); many(cnt(26), 6, (x, wy) => { if (!mat.water(x, wy, 99)) add({ t: 'bush', x, wy, r: 2 + r() * 2.4, sd: r() * 99 }); });
      many(cnt(7), 10, (x, wy) => { if (mat.water(x, wy, 99)) m.glints.push({ x, wy, ph: r() * TAU, sp: 0.04 + r() * 0.06 }); }); }
    if (theme === 'gold') { many(cnt(40), 12, (x, wy) => add({ t: 'inlay', x, wy, r: 40, len: 18 + r() * 30, hz: r() < 0.5, gold: 1 })); many(cnt(60), 12, (x, wy) => add({ t: 'medal', x, wy, r: 5 + r() * 3 })); }
    if (theme === 'obsid') many(cnt(14), 5, (x, wy) => add({ t: 'shard', x, wy, r: 2.4 + r() * 3.2, sd: r() * 99, col: 'obs' }));
    if (theme === 'zenith') { many(cnt(48), 12, (x, wy) => add({ t: 'crest', x, wy, r: 7 + r() * 4, rot: r() * TAU })); many(cnt(50), 12, (x, wy) => add({ t: 'inlay', x, wy, r: 40, len: 22 + r() * 30, hz: r() < 0.5 })); }
    if (m.isCore) add({ t: 'plinth', x: 120, wy: def.coreWy, r: 80 });
    // 崖の下の結晶・根、縁から落ちるもの（南向きの縁を探す）
    for (let x = m.x0 + 4; x < m.x1 - 4; x += 5 + r() * 7) {
      let rim = null; for (let wy = m.wyA; wy < m.wyA + Math.min(len * 0.5, 120); wy += 1.5) if (edge(m, wy) && x > eL + 1 && x < eR - 1) { rim = wy; break; }
      if (rim == null) continue;
      const ch = cliffH(m, x);
      if (r() < 0.4) add({ t: 'crystal', x, wy: rim - ch * (0.72 + r() * 0.2), r: 9, s: 0.7 + r() * 0.9, sd: r() * 99, cliff: 1 });
      if (r() < 0.2 && m.falls.length < 4) m.falls.push({ x, wy: rim - 1, acc: r() });
    }
    return m;
  }

  function reset() {
    R.jobs.cancel((k) => typeof k === 'string' && k.startsWith('strip:'));
    for (const s of strips.values()) { freeCanvas(s.cv); freeCanvas(s.em); }
    strips.clear(); scorches = []; metas = [];
  }
  function dropCanvases() { // 倍率が変わった: 帯を捨てて焼き直す（島の一覧は残す）
    R.jobs.cancel((k) => typeof k === 'string' && k.startsWith('strip:'));
    for (const s of strips.values()) { freeCanvas(s.cv); freeCanvas(s.em); } strips.clear();
    freeCanvas(tmpA); freeCanvas(tmpB); freeCanvas(tmpE); tmpA = tmpB = tmpE = null; grainPat = null; freeCanvas(scorchSpr); scorchSpr = null;
  }

  // 地面の細かい粒（実解像度で 1 回だけ作る 64 単位の繰り返し模様）
  function grain() {
    const key = theme + R.K.toFixed(3); if (grainPat && grainKey === key) return grainPat;
    const size = Math.max(32, Math.round(64 * R.K)), cv = document.createElement('canvas'); cv.width = cv.height = size;
    const c = cv.getContext('2d'), r = rng(theme.charCodeAt(0) * 131 + 7), u = size / 64, nS = Math.round(size * size / 70);
    for (let i = 0; i < nS; i++) { const x = r() * size, y = r() * size, d = Math.max(1, u * (0.18 + r() * 0.3)); c.fillStyle = r() < 0.55 ? `rgba(0,0,0,${0.05 + r() * 0.13})` : `rgba(255,255,255,${0.04 + r() * 0.09})`; c.fillRect(x, y, d, d); }
    for (let i = 0; i < 34; i++) { const x = r() * (size - 8 * u) + 4 * u, y = r() * (size - 8 * u) + 4 * u, rad = (0.35 + r() * 0.9) * u, a = r() * TAU; c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(x + 0.3 * u, y + 0.35 * u, rad, rad * 0.7, a, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.13)'; c.beginPath(); c.ellipse(x, y, rad, rad * 0.7, a, 0, TAU); c.fill(); }
    grainPat = c.createPattern(cv, 'repeat'); grainPat.size = size; grainKey = key; return grainPat;
  }
  function scorchSprite() {
    if (scorchSpr) return scorchSpr;
    const n = 96, cv = scorchSpr = makeCanvas(n, n), c = cv.getContext('2d'), img = c.createImageData(n, n), d = img.data;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const dx = x / n * 2 - 1, dy = y / n * 2 - 1, rr = Math.sqrt(dx * dx + dy * dy), nn = fbm(x * 3 + 20, y * 3 + 60), a = smooth(1, 0.25, rr + (nn - 0.5) * 0.5), o = (y * n + x) * 4; d[o] = 12; d[o + 1] = 8; d[o + 2] = 8; d[o + 3] = a * (0.55 + nn * 0.35) * 255; }
    c.putImageData(img, 0, 0); return cv;
  }

  // ── 帯を焼く ──
  const o = { r: 0, g: 0, b: 0, ks: 0, kp: 8, e: 0, flat: 0 };
  function* bakeStrip(s) {
    const m = metas[s.mi], K = R.K, RK = Math.round(STRIP * Math.min(K, R.low ? 2 : 4)) / STRIP;
    const wU = m.x1 - m.x0, rw = Math.ceil(wU * RK), rh = STRIP * RK + RPAD * 2, x0 = m.x0, w1 = s.w1;
    const below = new Float32Array(rw).fill(1e9), chh = new Float32Array(rw);
    const xu = new Float32Array(rw); for (let i = 0; i < rw; i++) xu[i] = x0 + (i + 0.5) / RK;
    const wyOf = (j) => w1 + (RPAD - j - 0.5) / RK;
    // 崖: 上の行から「縁を出てからの距離」を列ごとに数える（帯の上の CLIFF_MAX ぶん手前から）
    const pre = Math.ceil(CLIFF_MAX * RK);
    const track = (wy) => {
      const ok = edge(m, wy), l = eL + 0.6 / RK, r = eR - 0.6 / RK;
      for (let i = 0; i < rw; i++) { if (ok && xu[i] > l && xu[i] < r) below[i] = 0; else { if (below[i] === 0) chh[i] = cliffH(m, xu[i]) * RK; below[i]++; } }
    };
    for (let j = -pre; j < 0; j++) track(wyOf(j));
    yield;
    const hg = new Float32Array(rw * rh), ed = new Float32Array(rw * rh), cl = new Float32Array(rw * rh), cmax = new Float32Array(rw * rh);
    const crs = m.craters.filter((c) => c.wy - c.r * 1.5 < w1 + 2 && c.wy + c.r * 1.5 > s.w0 - 2), core = m.isCore ? def.coreWy : null;
    for (let j = 0; j < rh; j++) {
      const wy = wyOf(j), ok = edge(m, wy), l = eL, r = eR, row = j * rw;
      track(wy);
      for (let i = 0; i < rw; i++) {
        const x = xu[i], e = ok ? Math.min(x - l, r - x) : -1;
        ed[row + i] = e; cl[row + i] = below[i]; cmax[row + i] = chh[i];
        if (e > -1.5 / RK) {
          let h = mat.h(x, wy, e) + smooth(0, 6.5, e) * 2.6;
          for (const c of crs) { const dd = Math.hypot(x - c.x, wy - c.wy) / c.r; if (dd < 1.5) h += (dd < 1 ? -(1 - dd * dd) * Math.min(1.6, c.r * 0.3) : 0) + Math.exp(-((dd - 1) * (dd - 1)) / 0.03) * Math.min(0.9, c.r * 0.16); }
          if (core != null) { const rc = Math.hypot(x - 120, wy - core); if (rc < 70) h = h * smooth(30, 70, rc) * 0.6 + 2 + smooth(67, 65, rc) * 0.9 + smooth(51, 49, rc) * 0.9 + smooth(35.5, 33.5, rc) * 0.9; }
          hg[row + i] = h;
        }
      }
      if ((j & 15) === 15) yield;
    }
    // 陰影
    if (!tmpA || tmpA.width < rw || tmpA.height < rh) { freeCanvas(tmpA); freeCanvas(tmpB); freeCanvas(tmpE); tmpA = makeCanvas(Math.ceil((W + 8) * RK) + 2, rh); tmpB = makeCanvas(tmpA.width, rh); tmpE = makeCanvas(tmpA.width, rh); }
    const ca = tmpA.getContext('2d'), cb = tmpB.getContext('2d'), ce = tmpE.getContext('2d');
    const imA = ca.createImageData(rw, rh), imB = cb.createImageData(rw, rh), imE = mat.em ? ce.createImageData(rw, rh) : null, dA = imA.data, dB = imB.data, dE = imE && imE.data;
    const side = mix3(hexRgb(th.side), hexRgb(th.land), 0.25), sideHi = mix3(hexRgb(th.land), hexRgb(th.landHi), 0.35), glowC = hexRgb(th.glow);
    const Lx = LIGHT.x, Ly = LIGHT.y, Lz = LIGHT.z, Hx = Lx, Hy = Ly, Hz = Lz + 1, Hl = Math.hypot(Hx, Hy, Hz), ZS = 1.25 * RK * 0.5;
    const ringLine = core != null;
    for (let j = 0; j < rh; j++) {
      const wy = wyOf(j), row = j * rw, jm = Math.max(0, j - 1) * rw, jp = Math.min(rh - 1, j + 1) * rw;
      for (let i = 0; i < rw; i++) {
        const k = row + i, e = ed[k], p = k * 4, x = xu[i];
        if (e > 0) {
          const im = Math.max(0, i - 1), ip = Math.min(rw - 1, i + 1);
          const hl = ed[row + im] > -1.5 / RK ? hg[row + im] : hg[k], hr = ed[row + ip] > -1.5 / RK ? hg[row + ip] : hg[k], hu = ed[jm + i] > -1.5 / RK ? hg[jm + i] : hg[k], hd = ed[jp + i] > -1.5 / RK ? hg[jp + i] : hg[k];
          mat.col(x, wy, hg[k], o, e);
          const fl = 1 - o.flat * 0.85; let nx = -(hr - hl) * ZS * fl, ny = -(hd - hu) * ZS * fl; const nl = 1 / Math.sqrt(nx * nx + ny * ny + 1); nx *= nl; ny *= nl;
          const dif = Math.max(0, nx * Lx + ny * Ly + nl * Lz), back = Math.max(0, nx * 0.55 + ny * 0.6 + nl * 0.3);
          let sh = 0.26 + 0.88 * dif; const sp = o.ks * Math.pow(Math.max(0, (nx * Hx + ny * Hy + nl * Hz) / Hl), o.kp) * 150;
          if (e < 0.9) sh += 0.16; // 縁の明るい線
          let r = o.r, g = o.g, b = o.b;
          if (ringLine) { const dx = x - 120, dy = wy - core, rc = Math.hypot(dx, dy); if (rc < 68) { const a = Math.atan2(dy, dx), gr = Math.abs(Math.sin(a * 6)) * rc < 0.55 && rc > 24 ? 0.6 : 1; const t = smooth(70, 60, rc) * 0.55; r = lerp(r, side[0] * 1.9, t) * gr; g = lerp(g, side[1] * 1.9, t) * gr; b = lerp(b, side[2] * 2.1, t) * gr; } }
          r = r * sh + sp + 8 * back; g = g * sh + sp + 14 * back; b = b * sh + sp + 30 * back;
          const mx = Math.max(r, g, b); if (mx > 150 && o.e < 0.5) { const kk = (150 + (mx - 150) * 0.42) / mx; r *= kk; g *= kk; b *= kk; } // 明るすぎる地面は抑える（弾・機体を目立たせる）
          dA[p] = r; dA[p + 1] = g; dA[p + 2] = b; dA[p + 3] = clamp(e * RK + 0.5) * 255;
          if (dE && o.e > 0.01) { dE[p] = mat.em[0]; dE[p + 1] = mat.em[1]; dE[p + 2] = mat.em[2]; dE[p + 3] = o.e * 255; }
        }
        if (e < 1.5 / RK) { // 崖（上面の半透明の縁の下にも入れておく）
          const bl = cl[k], cm = cmax[k];
          if (bl < cm && bl < 1e8) {
            const t = bl / cm, du = bl / RK, st = fbm(x * 2.2 + 31, du * 9 + fbm(x * 1.3, 5) * 30), vs = fbm(x * 26 + 9, du * 1.6 + 40);
            let sh = (1.3 - t * 0.95) * (0.55 + 0.6 * st) * (0.62 + 0.7 * vs); if (du < 0.8) sh *= 0.5; // 上面の庇の陰
            const c = t < 0.4 ? mix3(sideHi, side, t / 0.4) : side, ug = t * t * 0.22;
            dB[p] = c[0] * sh + glowC[0] * ug * 0.3; dB[p + 1] = c[1] * sh + glowC[1] * ug * 0.3; dB[p + 2] = c[2] * sh + glowC[2] * ug * 0.4 + 10 * t; dB[p + 3] = clamp(cm - bl) * 255;
          }
        }
      }
      if ((j & 15) === 15) yield;
    }
    // 実解像度の帯へ合成
    const cw = Math.ceil(wU * K), chp = Math.ceil(STRIP * K) + PAD * 2;
    const cv = makeCanvas(cw, chp), c = cv.getContext('2d');
    cb.clearRect(0, 0, tmpB.width, rh); cb.putImageData(imB, 0, 0); ca.clearRect(0, 0, tmpA.width, rh); ca.putImageData(imA, 0, 0);
    const sc = K / RK; c.imageSmoothingQuality = 'high';
    c.drawImage(tmpB, 0, 0, rw, rh, 0, PAD - RPAD * sc, rw * sc, rh * sc); c.drawImage(tmpA, 0, 0, rw, rh, 0, PAD - RPAD * sc, rw * sc, rh * sc);
    let em = null, ec = null, EK = 0;
    // 発光の層。素材が光らないテーマでは、光るもの（紋様・導線・結晶など）がある横の範囲だけを持つ（加算で重ねる面積を減らす）
    let ex0 = 1e9, ex1 = -1e9;
    if (imE) { ex0 = x0; ex1 = m.x1; }
    else for (const f of m.feats) {
      if (!EMF[f.t] || f.wy + f.r < s.w0 || f.wy - f.r > w1) continue;
      if (f.t === 'road') { for (let i = 1; i < f.pts.length; i++) { const a = f.pts[i - 1], b = f.pts[i]; if (Math.max(a[1], b[1]) < s.w0 - 3 || Math.min(a[1], b[1]) > w1 + 3) continue; ex0 = Math.min(ex0, a[0] - 4, b[0] - 4); ex1 = Math.max(ex1, a[0] + 4, b[0] + 4); } }
      else { const rr = f.t === 'inlay' ? (f.hz ? f.len / 2 + 3 : 3) : f.r * 1.5; ex0 = Math.min(ex0, f.x - rr); ex1 = Math.max(ex1, f.x + rr); }
    }
    if (ex1 > ex0) {
      ex0 = Math.max(x0, Math.floor(ex0)); ex1 = Math.min(m.x1, Math.ceil(ex1));
      EK = Math.round(STRIP * Math.min(RK, 3)) / STRIP; em = makeCanvas(Math.ceil((ex1 - ex0) * EK), STRIP * EK); ec = em.getContext('2d');
      if (imE) { ce.clearRect(0, 0, tmpE.width, rh); ce.putImageData(imE, 0, 0); ec.drawImage(tmpE, 0, RPAD, rw, rh - RPAD * 2, 0, 0, rw * EK / RK, STRIP * EK); }
      ec.setTransform(EK, 0, 0, EK, -ex0 * EK, 0); ec.lineCap = 'round'; ec.lineJoin = 'round';
    }
    yield;
    // ベクターの細部（上面だけに切り抜く。崖の下の結晶は切り抜かない）
    c.setTransform(K, 0, 0, K, -x0 * K, PAD); c.lineJoin = 'round'; c.lineCap = 'round';
    const Y = (wy) => w1 - wy, env = { c, ec, Y, th, art, theme, K, minW: 1 / K, w1 };
    const lpts = [], rpts = [];
    for (let wy = w1 + 3; wy >= s.w0 - 3.01; wy -= 1.5) if (edge(m, wy)) { lpts.push(eL, Y(wy)); rpts.push(eR, Y(wy)); }
    const feats = m.feats.filter((f) => f.wy + f.r > s.w0 - 1 && f.wy - f.r < w1 + 1);
    if (lpts.length >= 4) {
      c.save(); c.beginPath(); c.moveTo(lpts[0], lpts[1]); for (let i = 2; i < lpts.length; i += 2) c.lineTo(lpts[i], lpts[i + 1]); for (let i = rpts.length - 2; i >= 0; i -= 2) c.lineTo(rpts[i], rpts[i + 1]); c.closePath(); c.clip();
      const pat = grain(); pat.setTransform(new DOMMatrix().translate(-x0 * K, PAD + w1 * K)); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = mat.grain; c.fillStyle = pat; c.fillRect(0, 0, cw, chp); c.globalAlpha = 1; c.setTransform(K, 0, 0, K, -x0 * K, PAD);
      for (const pass of ['road', 'pad', 'plinth', 'flat', 'tall']) for (const f of feats) {
        const cls = f.t === 'road' || f.t === 'pad' || f.t === 'plinth' ? f.t : f.t === 'ruin' || f.t === 'rock' || f.t === 'shard' || f.t === 'bush' || f.t === 'pipe' ? 'tall' : f.cliff ? 'none' : 'flat';
        if (cls !== pass) continue;
        if (f.t === 'ruin') drawRuin(env, f.ru, f.x, Y(f.wy)); else drawFeature(env, f, f.x, Y(f.wy));
      }
      c.restore();
    }
    for (const f of feats) if (f.cliff) drawFeature(env, f, f.x, Y(f.wy));
    s.cv = cv; s.c = c; s.em = em; s.EK = EK; s.ex0 = ex0; s.ready = true;
    for (const q of scorches) stamp(s, q);
  }

  function stamp(s, q) {
    if (!s.ready || q.wy + q.r < s.w0 - 1 || q.wy - q.r > s.w1 + 1) return;
    const m = metas[s.mi], c = s.c; c.save(); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = 0.9;
    c.translate(q.x, s.w1 - q.wy); c.rotate(q.rot); c.drawImage(scorchSprite(), -q.r, -q.r, q.r * 2, q.r * 2); c.restore();
  }
  // 焦げ跡（爆発のあと）。帯に直接焼き足す
  function scorch(x, wy, r) {
    const q = { x, wy, r, rot: Math.random() * TAU }; scorches.push(q); if (scorches.length > 90) scorches.shift();
    for (const s of strips.values()) if (x + r > metas[s.mi].x0 && x - r < metas[s.mi].x1) stamp(s, q);
  }

  // スクロール位置に合わせて、要る帯を焼き始め、通り過ぎた帯を捨てる
  function update(sc) {
    if (!def) return;
    const lo = sc - H - 30, hi = sc + 150;
    for (const m of metas) {
      if (m.wyB < lo || m.base > hi) continue;
      const k0 = Math.max(0, Math.floor((lo - m.base) / STRIP)), k1 = Math.min(m.nStrips - 1, Math.floor((hi - m.base) / STRIP));
      for (let k = k0; k <= k1; k++) {
        const key = m.idx + ':' + k; if (strips.has(key)) continue;
        const s = { key, mi: m.idx, k, w0: m.base + k * STRIP, w1: m.base + (k + 1) * STRIP, cv: null, em: null, ready: false };
        strips.set(key, s); R.jobs.add('strip:' + key, bakeStrip(s));
      }
    }
    for (const [key, s] of strips) if (s.w1 < lo - 40 || s.w0 > hi + 500) { R.jobs.cancel((k) => k === 'strip:' + key); freeCanvas(s.cv); freeCanvas(s.em); strips.delete(key); }
  }
  // 見えている帯を描く。まだ焼けていない帯が見えていたら、その場で仕上げる（1 フレームの上限つき）
  const vis = [];
  function draw(c, sc) {
    const K = R.K, t0 = performance.now(); vis.length = 0;
    c.imageSmoothingQuality = 'low';
    for (const s of strips.values()) {
      const y = sc - s.w1; if (y > H + 1 || y + STRIP < -1) continue;
      if (!s.ready) { if (performance.now() - t0 < 10) R.jobs.finish('strip:' + s.key); if (!s.ready) continue; }
      const m = metas[s.mi]; vis.push(s);
      c.drawImage(s.cv, m.x0, y - PAD / K, s.cv.width / K, s.cv.height / K);
    }
  }
  function drawEmissive(c, sc, time) {
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = (0.62 + 0.38 * Math.sin(time * 0.045)) * (mat.emA || 1);
    for (const s of vis) if (s.em) c.drawImage(s.em, s.ex0, sc - s.w1, s.em.width / s.EK, STRIP);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  return { setArea, reset, dropCanvases, update, draw, drawEmissive, scorch, landAlpha, get metas() { return metas; }, get count() { return strips.size; },
    get pendingVisible() { return vis.length; } };
}
