// ORBITAL WINGS 2D — 背景（空・星・天体・多層の遠景・地形・前景・大気）。Render2D に混ぜ込んで使う（this は Render2D）
// 重い絵（星雲・天体・遠景の帯・地形の材質・光の玉）は buildStageCache で実解像度のオフスクリーンに焼き、
// 毎フレームは drawImage とパターン塗りと少しのパスだけで描く（4K で 60fps）。
//   bgUtil2d.js   … 色・ノイズ・焼き込み用の小さな絵
//   bgStages2d.js … 面ごとの絵（空・天体・層・仕掛け）
//   bgTerrain2d.js… 地形の材質・縁の細部・壊れない箱
import { VIEW_W, VIEW_H } from '../shared/config.js';
import { hash1 } from '../shared/rng.js';
import { TAU, lerp, clamp, smooth, rgba, mix, canvas, cloudCanvas, tint, grainTile, glowSprite, starSprite } from './bgUtil2d.js';
import { STAGE_ART } from './bgStages2d.js';
import { buildMaterial, drawBlock } from './bgTerrain2d.js';

const SKY_EXTRA = 16;          // 空の絵は盤面より 16u 広く焼いて、ゆっくり流す
const SKY_PAR = 0.025;
const STAR_WRAP = 48;
const BAKE_MAX = 64;           // 焼き込みは 1u = 64px まで（4K でも 1 フレームに参照する絵の総量を抑え、描画命令の途中フラッシュを防ぐ）
const NV = 72;                 // 地形の頂点数（0.5u 刻みで 35.5u ぶん）
const _xs = new Float32Array(NV), _yf = new Float32Array(NV), _yc = new Float32Array(NV);

// 層がどの地形に付いて上下するか（'f' = 床、'c' = 天井、無指定 = どちらか）
const EV = (L, F) => (L.env === 'c' ? F.ec : L.env === 'f' ? F.ef : F.e);

// 面に依らない絵（星・粒子・周辺減光・雲の型）。画面の大きさが変わったら作り直す
function buildCommon(R) {
  const S = R.S;
  const com = { S, bw: R.bw, bh: R.bh };
  com.cloudA = cloudCanvas(256, 11, 0.38, 0.78, 5, 3);
  com.cloudB = cloudCanvas(256, 47, 0.45, 0.8, 5, 4);
  com.cloudC = cloudCanvas(256, 83, 0.5, 0.72, 4, 2, 1.4);
  com.stars = ['#ffffff', '#b4ccff', '#ffd2b0'].map((c) => starSprite(S * 0.9, c));
  com.light = glowSprite(256, '#ffffff', 0, 2.2);
  com.dots = ['#ffffff', '#b4ccff', '#ffd2b0'].map((c) => glowSprite(Math.max(8, S * 0.2), c, 0.55, 2.5));
  com.grain = grainTile(128, 5, 1);
  // 周辺減光（左右の端だけを暗くする帯。上下は Render2D 側の霧が受け持つので、全画面の重ね描きをしない）
  const v = com.edge = canvas(64, 2), c = v.getContext('2d');
  const g = c.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.45, 'rgba(0,0,0,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 2);
  return com;
}

// 空（多段グラデーション＋色のにじみ＋星雲＋塵のような星）を半分の解像度で焼く
function buildSky(B, art, C) {
  const k = 0.5 * B.Sb / B.S, S = B.S, sk = art.sky;
  const w = Math.round((VIEW_W + SKY_EXTRA) * S * k), h = Math.round(B.bh * k);
  const cv = canvas(w, h), c = cv.getContext('2d'), u = h / VIEW_H;
  const g = c.createLinearGradient(0, 0, 0, h);
  for (const [t, col] of sk.stops) g.addColorStop(t, col);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // 色のにじみ（大きな柔らかい光）
  for (const b of sk.blots || []) {
    const x = b.x * u, y = (VIEW_H - b.y) * u, r = b.r * u;
    const rg = c.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, rgba(b.c, b.a)); rg.addColorStop(0.5, rgba(b.c, b.a * 0.4)); rg.addColorStop(1, rgba(b.c, 0));
    c.fillStyle = rg; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 星雲: 雲の型に色を付け、楕円の中だけ残して重ねる
  const tmp = canvas(256, 256), t = tmp.getContext('2d');
  (sk.neb || []).forEach((n, i) => {
    t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, 256, 256);
    const src = [B.com.cloudA, B.com.cloudB, B.com.cloudC][(n.kind ?? i) % 3];
    const ox = hash1(i, 91) * 256, oy = hash1(i, 92) * 256, sc = n.sc || 1;
    for (let a = -1; a < 1 / sc + 1; a++) for (let b = -1; b < 1 / sc + 1; b++) t.drawImage(src, a * 256 * sc + ox * sc, b * 256 * sc + oy * sc, 256 * sc, 256 * sc);
    t.globalCompositeOperation = 'source-in'; t.fillStyle = n.c; t.fillRect(0, 0, 256, 256);
    t.globalCompositeOperation = 'destination-in';
    const rg = t.createRadialGradient(128, 128, 0, 128, 128, 128);
    rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(0.45, 'rgba(0,0,0,0.75)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    t.fillStyle = rg; t.fillRect(0, 0, 256, 256);
    c.save(); c.translate(n.x * u, (VIEW_H - n.y) * u); c.rotate(n.rot || 0);
    c.globalAlpha = n.a; c.globalCompositeOperation = n.dark ? 'source-over' : 'lighter';
    c.drawImage(tmp, -n.rx * u, -n.ry * u, n.rx * 2 * u, n.ry * 2 * u);
    c.restore();
  });
  // 塵のような遠い星（最遠の層。空と一緒に流れる）
  const nd = Math.round(1500 * (sk.dust ?? 1));
  for (let i = 0; i < nd; i++) {
    const x = hash1(i, 301) * w, y = hash1(i, 302) * h, m = hash1(i, 303), col = hash1(i, 304);
    c.fillStyle = col > 0.85 ? `rgba(255,205,170,${0.25 + m * 0.6})` : col > 0.6 ? `rgba(170,200,255,${0.25 + m * 0.6})` : `rgba(255,255,255,${0.15 + m * 0.6})`;
    const s = Math.max(0.5, (0.35 + m * m * 0.9) * S * k / 30);
    c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
  }
  // 階調の縞を防ぐ微かな粒
  c.globalAlpha = 0.035; c.fillStyle = c.createPattern(B.com.grain, 'repeat'); c.fillRect(0, 0, w, h); c.globalAlpha = 1;
  C.sky = { cv, w, h, ppu: S * k };
  // 手前の星 3 層（等級・色温度・またたき）。明るいものは光条つきの絵で描く
  const dens = sk.stars ?? 1, n = Math.round(260 * dens);
  const st = C.stars = { n, x: new Float32Array(n), y: new Float32Array(n), s: new Float32Array(n), ph: new Float32Array(n), L: new Uint8Array(n), col: new Uint8Array(n), big: new Uint8Array(n) };
  for (let i = 0; i < n; i++) {
    const L = i % 3, m = hash1(i, 310) ** 3, cc = hash1(i, 311);
    st.x[i] = hash1(i, 312) * STAR_WRAP; st.y[i] = hash1(i, 313) * VIEW_H; st.L[i] = L; st.ph[i] = hash1(i, 314) * TAU;
    st.col[i] = cc > 0.82 ? 2 : cc > 0.55 ? 1 : 0;
    st.big[i] = m > 0.72 ? 1 : 0;
    st.s[i] = m > 0.72 ? 0.12 + m * 0.5 + L * 0.05 : 0.03 + m * 0.07 + L * 0.012;
  }
}

function buildStrip(B, L) {
  const S = B.Sb, k = L.k || 1, hgt = L.y1 - L.y0;
  const w = Math.min(4096, Math.round(L.P * S * k)), h = Math.max(2, Math.round(hgt * S * k));
  const mk = (paint) => {
    const cv = canvas(w, h), c = cv.getContext('2d');
    c.setTransform(w / L.P, 0, 0, -h / hgt, 0, h + L.y0 * h / hgt);
    c.lineJoin = 'round'; c.lineCap = 'round';
    paint(c, B, L);
    return cv;
  };
  L.cv = mk(L.paint);
  if (L.paintEmis) L.emis = mk(L.paintEmis);
}
function buildFog(B, L) {
  const n = 512, hh = 192, cv = canvas(n, hh), c = cv.getContext('2d');
  const src = [B.com.cloudA, B.com.cloudB, B.com.cloudC][L.kind || 0];
  const rep = L.rep || 2;
  for (let i = 0; i < rep; i++) c.drawImage(src, 0, (hash1(L.seed || 1, 5) * 0.5) * 256, 256, 128, i * n / rep, 0, n / rep, hh);
  c.globalCompositeOperation = 'source-in'; c.fillStyle = L.c; c.fillRect(0, 0, n, hh);
  c.globalCompositeOperation = 'destination-in';
  const g = c.createLinearGradient(0, 0, 0, hh);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(L.peak ?? 0.5, 'rgba(0,0,0,1)'); g.addColorStop(1, `rgba(0,0,0,${L.floor ?? 0})`);
  c.fillStyle = g; c.fillRect(0, 0, n, hh);
  if (L.solid) { c.globalCompositeOperation = 'destination-over'; const g2 = c.createLinearGradient(0, 0, 0, hh); g2.addColorStop(0, rgba(L.c, 0)); g2.addColorStop(L.peak ?? 0.5, rgba(L.c, L.solid)); g2.addColorStop(1, rgba(L.c, L.solid * (L.floor ?? 0))); c.fillStyle = g2; c.fillRect(0, 0, n, hh); }
  L.cv = cv;
}
function buildBand(B, L) {
  const cv = canvas(4, 256), c = cv.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 256);
  for (const [t, col, a] of L.stops) g.addColorStop(t, rgba(col, a));
  c.fillStyle = g; c.fillRect(0, 0, 4, 256); L.cv = cv;
}
// 斜めの光の筋（ゴッドレイ）
function buildRays(B, L) {
  const w = 480, h = 270, cv = canvas(w, h), c = cv.getContext('2d');
  const sl = L.slant ?? 0.45;
  for (let i = 0; i < (L.n || 9); i++) {
    const x = (hash1(i, L.seed || 7) * 1.3 - 0.15) * w, bw = (0.03 + hash1(i, 8) ** 2 * 0.14) * w, a = 0.25 + hash1(i, 9) * 0.75;
    const g = c.createLinearGradient(x, 0, x + bw, 0);
    g.addColorStop(0, rgba(L.c, 0)); g.addColorStop(0.5, rgba(L.c, a)); g.addColorStop(1, rgba(L.c, 0));
    c.save(); c.transform(1, 0, -sl, 1, sl * h * 0.5, 0); c.fillStyle = g; c.fillRect(x, 0, bw, h); c.restore();
  }
  c.globalCompositeOperation = 'destination-in';
  const g = c.createLinearGradient(0, 0, 0, h);
  if (L.fromBottom) { g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)'); }
  else { g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(Math.min(1, L.reach ?? 0.85), 'rgba(0,0,0,0)'); }
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  L.cv = cv;
}
function buildParts(B, L) {
  const n = L.n;
  L.h = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) L.h[i] = hash1(i, 700 + (L.seed || 0));
  L.spr = L.sprite ? L.sprite(B) : glowSprite(Math.max(12, B.Sb * L.s1 * 1.2), L.c, L.core ?? 0.3, L.fall ?? 2);
}

// 地形が有る割合（0 = 宇宙、1 = 面の中）。遠景の上げ下げに使う
function buildEnv(terrain, mode) {
  const x0 = -40, n = Math.ceil(terrain.length + 140), acc = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) { const x = x0 + i, f = terrain.floorBase(x) > -3, c = terrain.ceilBase(x) < 21; acc[i + 1] = acc[i] + ((mode === 'f' ? f : mode === 'c' ? c : f || c) ? 1 : 0); }
  return (cam) => {
    const a = clamp(Math.round(cam + 6 - x0), 0, n), b = clamp(Math.round(cam + 40 - x0), 0, n);
    return smooth(b > a ? (acc[b] - acc[a]) / (b - a) : 1);
  };
}

// キャッシュが持つオフスクリーンの絵をすべて解放する（大きさを 0 にすると裏の画像メモリがすぐ返る）
function freeCanvases(o, depth = 0, seen = new Set()) {
  if (!o || typeof o !== 'object' || depth > 5 || seen.has(o)) return;
  seen.add(o);
  if (typeof HTMLCanvasElement !== 'undefined' && o instanceof HTMLCanvasElement) { o.width = 0; o.height = 0; return; }
  if (ArrayBuffer.isView(o)) return;
  for (const k of Object.keys(o)) { if (k === 'B' || k === 'com' || k === 'ctx' || k === 'stage' || k === 'pal' || k === 'art') continue; freeCanvases(o[k], depth + 1, seen); }
}

export class Bg2D {
  // ---- 焼き込み ---------------------------------------------------------------
  buildStageCache() {
    const st = this.stage, S = this.S, pal = st.pal;
    // 焼いた絵は「世界の単位」で描くので解像度に依らない。同じ面で解像度が少し変わっただけ（画質の自動調整・小さな
    // リサイズ・同じ面のやり直し）なら作り直さずに使い回す。大きく変わったときと面が変わったときだけ焼き直す
    const prev = this.bgPrev, fits = (s0) => S <= s0 * 1.25 && S >= s0 * 0.4;
    if (prev && prev.stage === st && fits(prev.S) && this.bgCommon && fits(this.bgCommon.S)) { this.stageCache = prev; return; }
    // 前の絵はすぐ手放す（GC 待ちにするとメモリが膨らむ）
    if (prev) { freeCanvases(prev); this.bgPrev = null; }
    if (!this.bgCommon || !fits(this.bgCommon.S)) { if (this.bgCommon) freeCanvases(this.bgCommon); this.bgCommon = buildCommon(this); }
    const art = STAGE_ART[st.id] || STAGE_ART[1];
    // 焼き込みの解像度の上限（4K では遠景を少し粗く焼く。巨大なテクスチャで GPU のキャッシュがあふれるのを防ぐ。地形の材質は実解像度のまま）
    const B = { S, Sb: Math.min(S, BAKE_MAX), pal, id: st.id, stage: st, bw: this.bw, bh: this.bh, com: this.bgCommon, ctx: this.ctx };
    const C = this.stageCache = {
      S, id: st.id, stage: st, art, pal, B, steps: [], buildMs: 0, maxStep: 0, nSteps: 0, log: [],
      sky: null, stars: null, bodies: [], mat: null, layers: [], front: [],
      env: buildEnv(st.terrain), envF: buildEnv(st.terrain, 'f'), envC: buildEnv(st.terrain, 'c'),
      F: { now: 0, dt: 0, e: 1, out: 0, xb: 1e9, mood: 0, warn: 0, spd: 0, shx: 0, shy: 0, allIn: false, allOut: false, clip: false, flash: 0 },
      lights: Array.from({ length: 6 }, () => ({ on: false, x: 0, y: 0, r: 0, a: 0, life: 0, max: 1, c: 0 })),
    };
    this.bgPrev = C;
    const def = art.build(B);
    C.def = def; C.portal = def.portal || null;
    C.steps.push(() => {
      const M = C.mat = buildMaterial(B);
      const pm = new DOMMatrix([M.TW / M.tile.width, 0, 0, -M.TW / M.tile.height, 0, 0]);
      M.pat = this.ctx.createPattern(M.tile, 'repeat'); M.pat.setTransform(pm);
      if (M.emis) { M.epat = this.ctx.createPattern(M.emis, 'repeat'); M.epat.setTransform(new DOMMatrix([M.TW / M.emis.width, 0, 0, -M.TW / M.emis.height, 0, 0])); }
    });
    C.steps.push(() => buildSky(B, def, C));
    const reg = (list, out) => {
      for (const L of list) {
        out.push(L);
        const add = (fn, tag) => { fn.tag = tag; C.steps.push(fn); };
        if (L.t === 'strip') add(() => buildStrip(B, L), 'strip' + L.par);
        else if (L.t === 'fog') add(() => buildFog(B, L), 'fog');
        else if (L.t === 'band') add(() => buildBand(B, L), 'band');
        else if (L.t === 'rays') add(() => buildRays(B, L), 'rays');
        else if (L.t === 'parts') add(() => buildParts(B, L), 'parts');
        if (L.init) add(() => { L.init(B, L); L.inited = true; }, 'init');
      }
    };
    for (const b of def.bodies || []) { C.bodies.push(b); C.steps.push(() => { b.cv = b.make(B); }); }
    reg(def.layers, C.layers);
    reg(def.front || [], C.front);
    C.lightSpr = [tint(this.bgCommon.light, '#ffd9a0'), tint(this.bgCommon.light, pal.glow)];
    this.bgPump(0, 2);       // 地形の材質と空はすぐ要る。残りは次のフレームから少しずつ
  }
  // 焼き込みの残りを進める（1 フレームに budget ms まで。最低 1 個）
  bgPump(budget, min = 1) {
    const C = this.stageCache, t0 = performance.now();
    let n = 0;
    while (C.steps.length && (n < min || performance.now() - t0 < budget)) {
      const t = performance.now(), fn = C.steps.shift(); fn(); const d = performance.now() - t;
      C.buildMs += d; C.maxStep = Math.max(C.maxStep, d); C.nSteps++; n++; C.log.push((fn.tag || 'step') + ':' + d.toFixed(0));
    }
  }
  bgStat() { const C = this.stageCache; return C ? { buildMs: +C.buildMs.toFixed(1), maxStep: +C.maxStep.toFixed(1), steps: C.nSteps, pending: C.steps.length, log: C.log.join(' ') } : null; }

  // 爆発などの出来事を背景の光にする（Render2D.onEvent から呼ぶ）
  bgOnEvent(ev, g) {
    const C = this.stageCache; if (!C || !ev || ev === this._bgLastEv) return;
    this._bgLastEv = ev;
    let x = ev.x, y = ev.y, r = 0, a = 0, max = 0.5, col = 0;
    if (ev.t === 'explode') {
      if (ev.size === 'l') { r = 11; a = 0.85; max = 0.7; } else if (ev.size === 'p') { r = 9; a = 0.8; max = 0.6; } else if (ev.size === 'm') { r = 5.5; a = 0.5; max = 0.4; } else return;
    } else if (ev.t === 'bossdown') { const b = g?.boss; x = b ? b.x : this.cam + 24; y = b ? b.y : 9; r = 20; a = 1; max = 1.6; }
    else if (ev.t === 'phase') { const b = g?.boss; if (!b) return; x = b.x; y = b.y; r = 13; a = 0.7; max = 0.6; col = 1; }
    else if (ev.t === 'die') { const p = g?.player; if (!p) return; x = p.x; y = p.y; r = 10; a = 0.9; max = 0.7; }
    else return;
    if (x == null || y == null) return;
    let best = C.lights[0];
    for (const l of C.lights) { if (!l.on) { best = l; break; } if (l.a * (1 - l.life / l.max) < best.a * (1 - best.life / best.max)) best = l; }
    best.on = true; best.x = x; best.y = y; best.r = r; best.a = a; best.life = 0; best.max = max; best.c = col;
    C.F.flash = Math.max(C.F.flash, a * (r / 20));
  }

  // ---- 空・星・天体（最背面） -----------------------------------------------------
  drawSky(cam, pal, now) {
    const C = this.stageCache, ctx = this.ctx, S = this.S, g = this.g, F = C.F;
    if (C.steps.length) this.bgPump(5);
    // このフレームの共通の値
    F.dt = F.now ? clamp(now - F.now, 0, 0.1) : 1 / 60; F.now = now; F.cam = cam;
    this.W(0); const m = ctx.getTransform(); F.shx = m.e; F.shy = m.f - VIEW_H * S;
    F.e = C.env(cam); F.ef = C.envF(cam); F.ec = C.envC(cam);
    const fight = !!g && g.state !== 'clear' && g.state !== 'stageclear' && ((g.boss && !g.boss.dead) || g.bossWarn > 0);
    F.mood += ((fight ? 1 : 0) - F.mood) * Math.min(1, F.dt * 2.2);
    F.warn += ((fight && !g.boss ? 1 : 0) - F.warn) * Math.min(1, F.dt * 5);
    F.spd += (((g && g.scrollV) || 0) - F.spd) * Math.min(1, F.dt * 3);
    F.flash = Math.max(0, F.flash - F.dt * 2.5);
    F.tick = g ? g.stageTick : 0;
    F.lite = (this.qScale || 1) <= 0.55;
    for (const l of C.lights) if (l.on) { l.life += F.dt; if (l.life >= l.max) l.on = false; }
    // 面クリア: 遠景が沈み（屋外）、内壁の縁が流れ去って（屋内）宇宙へ抜ける
    F.out = g && g.state === 'stageclear' ? smooth((g.clearTimer || 0) / 220) : 0;
    if (F.out > 0) { F.e *= 1 - F.out; F.ef *= 1 - F.out; F.ec *= 1 - F.out; }
    const P = C.portal;
    F.allIn = false; F.allOut = false; F.clip = false;
    if (P) {
      F.xb = P.xb ?? (F.out > 0 ? cam + VIEW_W + P.w + 5 - F.out * (VIEW_W + 2 * P.w + 10) : 1e9);
      const xa = P.xa, xb = F.xb, m2 = P.w + 4;
      if (cam + VIEW_W + 1 < xa - m2 || cam - 1 > xb + m2) F.allOut = true;
      else if (cam - 1 > xa + m2 && cam + VIEW_W + 1 < xb - m2) F.allIn = true;
      else F.clip = true;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (F.allIn) { if (!C.layers.some((L) => L.inside && L.t === 'strip' && L.cv)) { ctx.fillStyle = pal.sky[0]; ctx.fillRect(0, 0, this.bw, this.bh); } return; }
    const sk = C.sky;
    if (sk) {
      const off = clamp(cam * SKY_PAR, 0, SKY_EXTRA) * sk.ppu, sw = VIEW_W * sk.ppu;
      ctx.drawImage(sk.cv, off, 0, sw, sk.h, 0, 0, this.bw, this.bh);
    } else { ctx.fillStyle = pal.sky[0]; ctx.fillRect(0, 0, this.bw, this.bh); }
    // 星（3 層の視差。最遠の層は空に焼いてある）
    const st = C.stars, com = this.bgCommon;
    if (st) {
      const sa = C.def.starA ?? 1;
      for (let i = 0; i < st.n; i++) {
        const L = st.L[i];
        let x = (st.x[i] - cam * (0.05 + L * 0.055)) % STAR_WRAP; if (x < 0) x += STAR_WRAP; x -= 4;
        if (x > VIEW_W + 1) continue;
        const tw = 0.62 + 0.38 * Math.sin(now * (1.3 + L * 0.9 + (i % 7) * 0.21) + st.ph[i]);
        const sz = st.s[i] * S, px = x * S, py = (VIEW_H - st.y[i]) * S;
        ctx.globalAlpha = tw * sa;
        if (st.big[i]) ctx.drawImage(com.stars[st.col[i]], px - sz / 2, py - sz / 2, sz, sz);
        else ctx.drawImage(com.dots[st.col[i]], px - sz, py - sz, sz * 2, sz * 2);
      }
      ctx.globalAlpha = 1;
    }
    // 天体
    for (const b of C.bodies) {
      if (!b.cv) continue;
      const sz = b.size * S, x = (b.x - cam * b.par) * S - sz / 2, y = (VIEW_H - b.y - (b.rise || 0) * (1 - F.e)) * S - sz / 2;
      if (x > this.bw || x + sz < 0) continue;
      if (b.add) ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(b.cv, x, y, sz, sz);
      if (b.add) ctx.globalCompositeOperation = 'source-over';
    }
  }

  // 「中」の層だけを切り抜く（入口・出口の縁の形）
  bgClip(cam) {
    const C = this.stageCache, P = C.portal, ctx = this.ctx;
    this.W(cam);
    ctx.save(); ctx.beginPath();
    const xa = P.xa, xb = C.F.xb;
    const left = xa > cam - P.w - 4, right = xb < cam + VIEW_W + P.w + 4;
    if (left) { ctx.moveTo(xa + P.shape(-1), -1); for (let y = -0.5; y <= VIEW_H + 1; y += 0.5) ctx.lineTo(xa + P.shape(y), y); } else { ctx.moveTo(cam - 2, -1); ctx.lineTo(cam - 2, VIEW_H + 1); }
    if (right) { for (let y = VIEW_H + 1; y >= -1; y -= 0.5) ctx.lineTo(xb - P.shape(y), y); } else { ctx.lineTo(cam + VIEW_W + 2, VIEW_H + 1); ctx.lineTo(cam + VIEW_W + 2, -1); }
    ctx.closePath(); ctx.clip();
  }
  // 入口・出口の縁（分厚い枠）
  bgPortalRim(cam, now) {
    const C = this.stageCache, P = C.portal, ctx = this.ctx, pal = C.pal;
    this.W(cam);
    for (const side of [0, 1]) {
      const X = side ? C.F.xb : P.xa;
      if (X < cam - P.w - 4 || X > cam + VIEW_W + P.w + 4) continue;
      const sg = side ? 1 : -1;
      const ex = (y) => X - sg * P.shape(y);
      const band = (d0, d1, fill) => {
        ctx.beginPath(); ctx.moveTo(ex(-1) + sg * d0, -1);
        for (let y = -0.5; y <= VIEW_H + 1; y += 0.5) ctx.lineTo(ex(y) + sg * d0, y);
        for (let y = VIEW_H + 1; y >= -1; y -= 0.5) ctx.lineTo(ex(y) + sg * d1, y);
        ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
      };
      band(-2.2, 0, 'rgba(0,0,0,0.28)'); band(-1.0, 0, 'rgba(0,0,0,0.3)');      // 内側へ落ちる影
      band(0, P.w, P.c0); band(P.w * 0.28, P.w * 0.72, P.c1);
      band(0, 0.14, P.rim); band(P.w - 0.1, P.w, rgba(P.rim, 0.5));
      if (P.deco) P.deco(this, ctx, ex, sg, now);
    }
  }

  // ---- 遠景（多層の視差） -----------------------------------------------------------
  bgStrip(L, cam, cv, F) {
    const S = this.S, ctx = this.ctx, off = cam * L.par + (L.drift ? F.now * L.drift : 0);
    const dy = (L.rise || 0) * (1 - EV(L, F)) + (L.bob ? Math.sin(F.now * L.bob[1] + (L.bob[2] || 0)) * L.bob[0] : 0);
    let py = (VIEW_H - L.y1 - dy) * S + F.shy, ph = (L.y1 - L.y0) * S;
    const pw = L.P * S;
    if (L.squash) { if (L.y0 <= 0) py += ph * (1 - L.squash); ph *= L.squash; }     // 前景は画面の端へ寄せて低くする（自機の通り道を隠さない）
    if (py > this.bh || py + ph < 0) return;
    const i0 = Math.floor(off / L.P);
    for (let i = i0; i <= i0 + 1; i++) {
      const px = (i * L.P - off) * S + F.shx;
      if (px > this.bw || px + pw < 0) continue;
      ctx.drawImage(cv, px, py, pw + 1, ph);
    }
  }
  // 層の座標系で仕掛けを描く（帯の複製ごとに fn を呼ぶ。x は 0..P、y は盤面の高さ）
  bgTiles(L, cam, fn) {
    const S = this.S, ctx = this.ctx, F = this.stageCache.F, off = cam * L.par + (L.drift ? F.now * L.drift : 0);
    const dy = (L.rise || 0) * (1 - EV(L, F)) + (L.bob ? Math.sin(F.now * L.bob[1] + (L.bob[2] || 0)) * L.bob[0] : 0);
    const i0 = Math.floor(off / L.P);
    for (let i = i0; i <= i0 + 1; i++) {
      const ox = i * L.P - off;
      if (ox > VIEW_W || ox + L.P < 0) continue;
      ctx.setTransform(S, 0, 0, -S, ox * S + F.shx, (VIEW_H - dy) * S + F.shy);
      fn(ctx, -ox, VIEW_W - ox, i);
    }
  }
  bgFog(L, cam, F) {
    const S = this.S, ctx = this.ctx, off = cam * L.par + F.now * (L.drift || 0);
    const a = L.a * (L.fadeE ? EV(L, F) : 1) * (L.breath ? 0.8 + 0.2 * Math.sin(F.now * L.breath) : 1);
    if (a <= 0.003) return;
    const dy = (L.rise || 0) * (1 - EV(L, F));
    ctx.globalAlpha = a; if (L.add) ctx.globalCompositeOperation = 'lighter';
    const py = (VIEW_H - L.y - L.h - dy) * S + F.shy, pw = L.w * S, i0 = Math.floor(off / L.w);
    for (let i = i0; i <= i0 + Math.ceil(VIEW_W / L.w); i++) ctx.drawImage(L.cv, (i * L.w - off) * S, py, pw + 1, L.h * S);
    ctx.globalAlpha = 1; if (L.add) ctx.globalCompositeOperation = 'source-over';
  }
  bgParts(L, cam, F) {
    const S = this.S, ctx = this.ctx, n = L.n, h = L.h, now = F.now, WR = 40, H = L.y1 - L.y0;
    const fade = (L.fadeE ? EV(L, F) : 1) * (L.moodA != null ? lerp(1, L.moodA, F.mood) : 1);
    if (fade <= 0.01) return;
    const spr = L.spr, str = L.stretch || 1, vx = L.vx || 0, vy = L.vy || 0, wob = L.wob || 0, wf = L.wf || 1;
    if (L.add) ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a = h[i * 4], b = h[i * 4 + 1], c = h[i * 4 + 2], d = h[i * 4 + 3];
      let x = (a * WR - cam * L.par * (0.6 + 0.8 * c) + now * vx * (0.5 + d)) % WR; if (x < 0) x += WR; x -= 4;
      if (x > VIEW_W + 1) continue;
      let y = (b * H + now * vy * (0.5 + c)) % H; if (y < 0) y += H;
      let al = L.a * fade * (0.45 + 0.55 * d);
      if (vy) { const ty = y / H; al *= Math.min(1, ty * 5, (1 - ty) * 5); }
      if (L.tw) al *= 0.5 + 0.5 * Math.sin(now * L.tw * (0.5 + b) + c * 30);
      if (al <= 0.01) continue;
      y += L.y0;
      if (wob) { x += Math.sin(now * wf * (0.5 + d) + a * 40) * wob; y += Math.cos(now * wf * (0.7 + a) + b * 40) * wob * 0.6; }
      const sz = lerp(L.s0, L.s1, d * d) * S;
      ctx.globalAlpha = al;
      ctx.drawImage(spr, x * S - sz * str / 2 + F.shx, (VIEW_H - y) * S - sz / 2 + F.shy, sz * str, sz);
    }
    ctx.globalAlpha = 1; if (L.add) ctx.globalCompositeOperation = 'source-over';
  }
  bgRays(L, cam, F) {
    const ctx = this.ctx, now = F.now, a0 = L.a * (L.fadeE ? EV(L, F) : 1) * lerp(1, 0.4, F.mood);
    if (a0 <= 0.003) return;
    ctx.globalCompositeOperation = 'lighter';
    // 1 枚をゆっくり左右に振りながら明滅させる（全画面の重ね描きは 1 回だけ）
    const sway = Math.sin(now * 0.11 + cam * (L.par ?? 0.02)) * this.bw * 0.06;
    ctx.globalAlpha = a0 * (0.72 + 0.28 * Math.sin(now * 0.37));
    ctx.drawImage(L.cv, -this.bw * 0.08 + sway, 0, this.bw * 1.16, this.bh);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  bgList(list, cam, F) {
    const C = this.stageCache, ctx = this.ctx;
    let clipped = false;
    for (const L of list) {
      if (C.portal ? (L.inside ? F.allOut : F.allIn) : false) continue;
      if (F.lite && (L.t === 'rays' || (L.t === 'parts' && list === C.front))) continue;   // 画質を下げたときは重ね描きを減らす
      if (L.inside && F.clip && !clipped) { this.bgClip(cam); clipped = true; }
      else if (!L.inside && clipped) { ctx.restore(); clipped = false; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      switch (L.t) {
        case 'strip':
          if (!L.cv) break;
          if (L.fadeE) { const ev = EV(L, F); if (ev < 0.02) break; ctx.globalAlpha = (L.a ?? 1) * ev; } else if (L.a != null) ctx.globalAlpha = L.a;
          this.bgStrip(L, cam, L.cv, F);
          ctx.globalAlpha = 1;
          if (L.post && (!L.init || L.inited)) { L.post(this, ctx, L, cam, F.now, F); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
          break;
        case 'band': {
          if (!L.cv) break;
          const dy = (L.rise || 0) * (1 - EV(L, F)), a = (L.a ?? 1) * (L.fadeE ? EV(L, F) : 1) * (L.pulse ? 1 - L.pulse + L.pulse * Math.sin(F.now * (L.pf || 1)) : 1);
          ctx.globalAlpha = a; if (L.add) ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(L.cv, 0, (VIEW_H - L.y1 - dy) * this.S + F.shy, this.bw, (L.y1 - L.y0) * this.S);
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'fog': if (L.cv) this.bgFog(L, cam, F); break;
        case 'rays': if (L.cv) this.bgRays(L, cam, F); break;
        case 'parts': if (L.spr) this.bgParts(L, cam, F); break;
        case 'hook': if (L.init && !L.inited) break; L.draw(this, ctx, cam, F.now, F, L); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; break;
      }
    }
    if (clipped) ctx.restore();
  }
  drawFar(cam, pal, now) {
    const C = this.stageCache, ctx = this.ctx, F = C.F, g = this.g;
    this.bgList(C.layers, cam, F);
    if (C.portal && F.clip) this.bgPortalRim(cam, now);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // ボス戦の空気: 背景を沈め、警告中は赤く脈打ち、ボスの背に光を置く
    if (F.mood > 0.01) {
      const md = C.def.mood || {};
      ctx.fillStyle = rgba(md.dark || '#04020a', (md.a ?? 0.42) * F.mood); ctx.fillRect(0, 0, this.bw, this.bh);
      if (F.warn > 0.01) { ctx.fillStyle = `rgba(150,8,20,${0.2 * F.warn * (0.5 + 0.5 * Math.sin(now * 9))})`; ctx.fillRect(0, 0, this.bw, this.bh); }
      const b = g && g.boss;
      if (b && !b.dead) {
        const r = (md.r || 13) * (1 + 0.05 * Math.sin(now * 2.1)) * this.S;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (md.halo ?? 0.34) * F.mood * (0.8 + 0.2 * Math.sin(now * 3.3));
        ctx.drawImage(C.lightSpr[1], (b.x - cam) * this.S - r + F.shx, (VIEW_H - b.y) * this.S - r + F.shy, r * 2, r * 2);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    }
    // 大きな爆発で空が一瞬照らされる
    if (F.flash > 0.01) { ctx.fillStyle = `rgba(255,214,160,${Math.min(0.22, F.flash * 0.2)})`; ctx.fillRect(0, 0, this.bw, this.bh); }
  }

  // ---- 地形（当たり判定と同じ形。脈動する壁も含む） ----------------------------------------
  drawTerrain(g, cam, pal) {
    const C = this.stageCache, ctx = this.ctx, M = C.mat, F = C.F, now = F.now, tk = g.stageTick, t = g.terrain;
    const x0 = Math.floor(cam * 2) / 2 - 1;
    for (let i = 0; i < NV; i++) { const x = x0 + i * 0.5; _xs[i] = x; _yf[i] = g.floorAt(x); _yc[i] = g.ceilAt(x); }
    const T = M.cfg;
    const pulse = t.pulse ? t.pulse[0] : null;
    for (let side = 0; side < 2; side++) {
      const ys = side ? _yc : _yf, sg = side ? 1 : -1, base = side ? VIEW_H + 1.5 : -1.5;
      // 地形が有る区間ごとに描く
      let a = 0;
      while (a < NV) {
        while (a < NV && (side ? ys[a] > VIEW_H + 1 : ys[a] < -1)) a++;
        if (a >= NV) break;
        let b = a; while (b + 1 < NV && !(side ? ys[b + 1] > VIEW_H + 1 : ys[b + 1] < -1)) b++;
        const a0 = Math.max(0, a - 1), b0 = Math.min(NV - 1, b + 1);     // 端は画面の外へ抜ける標本まで含める
        const poly = (d) => { ctx.beginPath(); ctx.moveTo(_xs[a0], base); for (let i = a0; i <= b0; i++) ctx.lineTo(_xs[i], ys[i] + sg * d); ctx.lineTo(_xs[b0], base); ctx.closePath(); };
        const band = (d0, d1) => { ctx.beginPath(); ctx.moveTo(_xs[a0], ys[a0] + sg * d0); for (let i = a0 + 1; i <= b0; i++) ctx.lineTo(_xs[i], ys[i] + sg * d0); for (let i = b0; i >= a0; i--) ctx.lineTo(_xs[i], ys[i] + sg * d1); ctx.closePath(); };
        const line = (d) => { ctx.beginPath(); ctx.moveTo(_xs[a0], ys[a0] + sg * d); for (let i = a0 + 1; i <= b0; i++) ctx.lineTo(_xs[i], ys[i] + sg * d); };
        // 材質
        poly(0); ctx.fillStyle = M.pat; ctx.fill();
        // 発光する模様（溶岩の割れ目・紋様・表示灯・発光斑）が脈動
        if (M.epat) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = T.emis[0] + T.emis[1] * (0.5 + 0.5 * Math.sin(now * T.emis[2] + side * 1.7)) + F.flash * 0.3;
          ctx.fillStyle = M.epat; ctx.fill();
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
        // 奥を暗く落とす（環境遮蔽）。縁の形に沿った段で深さを出す
        for (const [d, al] of T.ao) { poly(d); ctx.fillStyle = rgba(T.aoCol, al); ctx.fill(); }
        // 表面の帯（上面のハイライト／天井は照り返し）
        const tp = side ? T.under : T.top;
        band(0, tp[0]); ctx.fillStyle = tp[1]; ctx.fill();
        band(tp[0], tp[0] + tp[2]); ctx.fillStyle = tp[3]; ctx.fill();
        // 縁に沿う細部と発光斑（x から決定的に配置）
        this.bgDecor(g, side, _xs[a0], _xs[b0], M, T, pulse, tk, now);
        // 二重の縁取り
        ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
        line(T.rimW * 0.5 + 0.02); ctx.strokeStyle = T.outline; ctx.lineWidth = T.rimW + 0.1; ctx.stroke();
        ctx.strokeStyle = side ? T.rimC : T.rimF; ctx.lineWidth = T.rimW; ctx.stroke();
        line(T.line2[0]); ctx.strokeStyle = T.line2[1]; ctx.lineWidth = T.line2[2]; ctx.stroke();
        // 爆発の照り返し（縁が一瞬光る）
        for (const l of C.lights) {
          if (!l.on || l.x + l.r < _xs[a0] || l.x - l.r > _xs[b0]) continue;
          const k = 1 - l.life / l.max, i0 = clamp(Math.floor((l.x - l.r - x0) * 2), a0, b0), i1 = clamp(Math.ceil((l.x + l.r - x0) * 2), a0, b0);
          if (i1 <= i0) continue;
          for (let pass = 0; pass < 2; pass++) {
            const rr = pass ? l.r * 0.45 : l.r, j0 = clamp(Math.floor((l.x - rr - x0) * 2), a0, b0), j1 = clamp(Math.ceil((l.x + rr - x0) * 2), a0, b0);
            if (j1 <= j0) continue;
            ctx.beginPath(); ctx.moveTo(_xs[j0], ys[j0] + sg * 0.08); for (let i = j0 + 1; i <= j1; i++) ctx.lineTo(_xs[i], ys[i] + sg * 0.08);
            ctx.strokeStyle = `rgba(255,236,190,${l.a * k * k * (pass ? 0.75 : 0.4)})`; ctx.lineWidth = pass ? 0.16 : 0.3; ctx.stroke();
          }
        }
        a = b + 1;
      }
    }
    // 壊れない箱（柱・金属塊・細胞塊）
    for (const b of t.blocks) {
      if (b.x1 < cam - 1 || b.x0 > cam + VIEW_W + 1) continue;
      drawBlock(this, ctx, b, pal, M, now, cam);
    }
    // 爆発の光が周りを照らす
    let any = false;
    for (const l of C.lights) {
      if (!l.on) continue;
      if (!any) { ctx.globalCompositeOperation = 'lighter'; any = true; }
      const k = 1 - l.life / l.max, r = l.r * (0.55 + 0.45 * (l.life / l.max));
      ctx.globalAlpha = l.a * k * k * 0.62;
      ctx.drawImage(C.lightSpr[l.c], l.x - r, l.y - r, r * 2, r * 2);
    }
    if (any) { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  }
  // 縁の細部（埋まった岩・結晶・配管・リベットなど）と発光斑
  bgDecor(g, side, xa, xb, M, T, pulse, tk, now) {
    const ctx = this.ctx, D = M.decor, st = T.decorStep, sid = this.stage.id * 10 + side;
    if (D.length) for (let k = Math.ceil(xa / st); k * st <= xb; k++) {
      const h = hash1(k, 500 + sid);
      if (h > T.decorP) continue;
      const d = D[(hash1(k, 510 + sid) * D.length) | 0];
      if (d.side != null && d.side !== side) continue;
      const x = k * st + (hash1(k, 520 + sid) - 0.5) * st * 0.6, y = side ? g.ceilAt(x) : g.floorAt(x);
      if (side ? y > VIEW_H + 0.5 : y < -0.5) continue;
      // 急な段には置かない（宙に浮いて見えるため）
      const y2 = side ? g.ceilAt(x + d.w * 0.4) : g.floorAt(x + d.w * 0.4), y3 = side ? g.ceilAt(x - d.w * 0.4) : g.floorAt(x - d.w * 0.4);
      const yy = side ? Math.max(y, y2, y3) : Math.min(y, y2, y3);
      if (Math.abs(y2 - y3) > d.maxSlope) continue;
      if (side) ctx.drawImage(d.cv, x - d.w / 2, yy - d.up, d.w, d.h); else ctx.drawImage(d.cv, x - d.w / 2, yy + d.up, d.w, -d.h);
    }
    const sp = M.spots;
    if (sp) {
      ctx.globalCompositeOperation = 'lighter';
      for (let k = Math.ceil(xa / sp.step); k * sp.step <= xb; k++) {
        const h = hash1(k, 600 + sid);
        if (h > sp.p) continue;
        const x = k * sp.step + (hash1(k, 610 + sid) - 0.5) * sp.step * 0.7, y = side ? g.ceilAt(x) : g.floorAt(x);
        const dep = lerp(sp.d0, sp.d1, hash1(k, 620 + sid)), sz = lerp(sp.s0, sp.s1, hash1(k, 630 + sid));
        // 生体・細胞の面は壁のうねりに合わせて光る。ほかは斑ごとの周期
        let pl;
        if (pulse && sp.sync) pl = 0.5 + 0.5 * Math.sin(tk * pulse.speed + (side ? x + 3.1 : x) * pulse.freq);
        else if (sp.chase) pl = Math.max(0, Math.sin(now * sp.chase - k * 0.9)) ** 3;
        else if (sp.blink) pl = Math.sin(now * sp.blink * (0.7 + h) + k * 2.1) > 0.2 ? 1 : 0.12;
        else pl = 0.5 + 0.5 * Math.sin(now * sp.speed * (0.6 + h * 1.6) + k * 1.3);
        ctx.globalAlpha = sp.a0 + (1 - sp.a0) * pl;
        ctx.drawImage(sp.spr, x - sz / 2, y + (side ? dep : -dep) - sz / 2, sz, sz);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---- 前景（敵弾より下。暗い影・粒子・スピード線・仕上げ） ----------------------------------
  drawFront(g, cam, pal, now, dt) {
    const C = this.stageCache, ctx = this.ctx, F = C.F, S = this.S;
    this.bgList(C.front, cam, F);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // スクロール速度に応じたスピード線（手前を流れる塵）
    const v = F.spd;
    if (v > 0.05) {
      const sd = C.def.streak || {}, n = sd.n ?? 26;
      ctx.fillStyle = sd.c || '#cfe0ff';
      for (let i = 0; i < n; i++) {
        const par = 2.6 + hash1(i, 801) * 3.2;
        let x = (hash1(i, 802) * 44 - cam * par) % 44; if (x < 0) x += 44; x -= 6;
        const len = Math.min(3, v * par * 0.05), y = hash1(i, 803) * VIEW_H;
        ctx.globalAlpha = Math.min(1, v / 2.4) * (sd.a ?? 0.2) * 1.5 * (0.4 + 0.6 * hash1(i, 804));
        ctx.fillRect(x * S + F.shx, y * S + F.shy, len * S, Math.max(1, S * (0.02 + 0.025 * hash1(i, 805))));
      }
      ctx.globalAlpha = 1;
    }
    // 周辺減光（ボス戦は少し強く）と微かな粒子
    const com = this.bgCommon;
    const vw = this.bw * 0.2;
    ctx.globalAlpha = 0.8 + 0.2 * F.mood;
    ctx.drawImage(com.edge, 0, 0, vw, this.bh);
    ctx.setTransform(-1, 0, 0, 1, this.bw, 0); ctx.drawImage(com.edge, 0, 0, vw, this.bh); ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (F.lite) { ctx.globalAlpha = 1; return; }
    const gs = Math.max(1, Math.round(S / 50));
    if (!C.grainPat) C.grainPat = ctx.createPattern(com.grain, 'repeat');
    const ox = ((now * 977) | 0) % 128, oy = ((now * 613) | 0) % 128;
    ctx.setTransform(gs, 0, 0, gs, -ox * gs, -oy * gs);
    ctx.globalAlpha = 0.05; ctx.fillStyle = C.grainPat; ctx.fillRect(ox, oy, this.bw / gs + 1, this.bh / gs + 1);
    ctx.globalAlpha = 1;
  }
}
// Render2D に混ぜ込む。爆発などの出来事は onEvent を包んで bgOnEvent へ渡す（Render2D 側で直接呼んでも二重にはならない）
export function install(Target) {
  for (const k of Object.getOwnPropertyNames(Bg2D.prototype)) if (k !== 'constructor') Target.prototype[k] = Bg2D.prototype[k];
  const orig = Target.prototype.onEvent;
  if (orig && !orig.__bg) {
    const wrapped = function (ev, g, demo) { try { this.bgOnEvent(ev, g); } catch (e) { /* 背景の光は無くても進める */ } return orig.call(this, ev, g, demo); };
    wrapped.__bg = true; Target.prototype.onEvent = wrapped;
  }
}
