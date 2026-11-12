// AEGIS RELAY — 2D の描画（Canvas 2D）。盤面の論理座標（240×320）→ 画面の実ピクセル
// ・描画バッファは「表示の実寸 × devicePixelRatio × 画質倍率」。CSS で引き伸ばさない（4K なら 4K の画素で描く）
// ・機体・敵はベクターの絵を、いまの倍率でキャッシュに描き直して使う（拡大してもにじまない）
// ・敵弾は桃色＋白い芯＋暗い縁取りで、どの背景・爆発の上でも見える。爆発は弾の下に描く
import { FIELD, THEMES, AREAS, TUNING, COLORS } from '../shared/rules.js';
import { islandSpanAt } from '../shared/area-gen.js';
import { drawPlayer, drawPartner, AIR_DRAW, GROUND_DRAW, drawRuin, glow, rg, lg, TAU } from './sprites.js';

const lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function createRenderer2D(canvas, app) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let lay = null, dpr = 1, rs = 1, K = 1; // K = 論理 1px あたりの実ピクセル
  let sprites = new Map(), sky = null, skyArea = -1, islandDetail = new Map();
  const fx = { parts: [], pops: [], scorch: [], shake: 0, flash: 0, ring: [] };
  const stars = []; { const r = rng(7); for (let i = 0; i < 220; i++) stars.push({ x: r() * FIELD.W, y: r() * FIELD.H * 2, z: 0.15 + r() * 0.85, b: r() }); }
  let fpsEMA = 60, slowT = 0, autoScale = 1;

  function qualityScale() {
    const q = app.settings.quality;
    if (q === 'big') return Math.min(3, dpr) / dpr;          // 実寸どおり（最大 3 倍の高 DPI まで）
    if (q === 'light') return Math.min(1, 1 / dpr) * 0.75 + 0.25 / dpr;
    if (q === 'quest') return 1;
    if (q === 'manual') return app.settings.renderScale;
    return autoScale;
  }
  function resize(layout) {
    lay = layout; dpr = window.devicePixelRatio || 1; rs = qualityScale();
    canvas.width = Math.max(1, Math.round(lay.w * dpr * rs)); canvas.height = Math.max(1, Math.round(lay.h * dpr * rs));
    K = lay.u * dpr * rs; sprites.clear(); sky = null;
  }
  function sprite(key, ext, draw) {
    let s = sprites.get(key);
    if (!s) {
      const px = Math.ceil(ext * 2 * K) + 2; s = document.createElement('canvas'); s.width = s.height = px;
      const c = s.getContext('2d'); c.setTransform(px / (ext * 2), 0, 0, px / (ext * 2), px / 2, px / 2); draw(c); s.ext = ext; sprites.set(key, s);
    }
    return s;
  }
  function blit(c, s, x, y, rot = 0, sc = 1, flash = 0) {
    c.save(); c.translate(x, y); if (rot) c.rotate(rot); if (sc !== 1) c.scale(sc, sc);
    c.drawImage(s, -s.ext, -s.ext, s.ext * 2, s.ext * 2);
    if (flash > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, flash); c.drawImage(s, -s.ext, -s.ext, s.ext * 2, s.ext * 2); }
    c.restore();
  }

  // 星雲の空（エリアごとに 1 回だけ、盤面の 2 倍の高さで焼く）
  function buildSky(area) {
    const th = THEMES[AREAS[area].theme];
    const w = Math.ceil(FIELD.W * K), h = Math.ceil(FIELD.H * 2 * K);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
    c.setTransform(K, 0, 0, K, 0, 0);
    c.fillStyle = lg(c, 0, 0, 0, FIELD.H * 2, [[0, th.sky[0]], [0.5, th.sky[1]], [1, th.sky[0]]]); c.fillRect(0, 0, FIELD.W, FIELD.H * 2);
    const r = rng(area * 101 + 5);
    for (let i = 0; i < 26; i++) {
      // 上下の端でつながるよう、端の近くの雲は反対側にも描く
      const x = r() * FIELD.W, y = r() * FIELD.H * 2, rad = 30 + r() * 90, col = i % 3 === 0 ? th.sky[2] : th.sky[1];
      for (const oy of [0, -FIELD.H * 2, FIELD.H * 2]) {
        c.globalAlpha = 0.18 + r() * 0.0; c.fillStyle = rg(c, x, y + oy, 0, rad, [[0, col], [1, 'rgba(0,0,0,0)']]);
        c.beginPath(); c.arc(x, y + oy, rad, 0, TAU); c.fill();
      }
    }
    c.globalAlpha = 1;
    for (let i = 0; i < 500; i++) { const x = r() * FIELD.W, y = r() * FIELD.H * 2, s = r() < 0.92 ? 0.35 : 0.7; c.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.5})`; c.fillRect(x, y, s, s); }
    return cv;
  }

  function detailFor(isl, area) {
    let d = islandDetail.get(isl); if (d) return d;
    const r = rng(Math.round(isl.wy0 * 13 + area * 7)); d = [];
    const n = Math.round((isl.wy1 - isl.wy0) / 9);
    for (let k = 0; k < n; k++) {
      const wy = isl.wy0 + r() * (isl.wy1 - isl.wy0), sp = islandSpanAt(isl, wy); if (!sp) continue;
      const x = sp[0] + r() * (sp[1] - sp[0]);
      d.push({ t: r() < 0.55 ? 'crater' : r() < 0.7 ? 'rock' : 'crack', x, wy, s: 1.5 + r() * 5, a: r() * TAU });
    }
    islandDetail.set(isl, d); return d;
  }

  // 地面の細かい素材（粒・まだら・ひび・小石）。テーマごと・倍率ごとに 1 回だけ作る
  const grains = new Map();
  function grain(th) {
    const key = th.land + K.toFixed(3);
    let p = grains.get(key); if (p) return p;
    const size = Math.min(2048, Math.max(64, Math.round(128 * K)));
    const cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d');
    const r = rng(th.land.charCodeAt(1) * 131 + 7), u = size / 128; // u = 1 単位の画素数
    const wrap = (fn) => { for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) { c.save(); c.translate(ox, oy); fn(); c.restore(); } };
    for (let i = 0; i < 70; i++) { const x = r() * size, y = r() * size, rad = (6 + r() * 26) * u, dark = r() < 0.5; wrap(() => { c.fillStyle = rg(c, x, y, 0, rad, [[0, dark ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.07)'], [1, 'rgba(0,0,0,0)']]); c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill(); }); }
    const nSpeck = Math.round(size * size / 90);
    for (let i = 0; i < nSpeck; i++) { const x = r() * size, y = r() * size, q = r(); c.fillStyle = q < 0.5 ? `rgba(0,0,0,${0.06 + r() * 0.12})` : `rgba(255,255,255,${0.04 + r() * 0.08})`; const d = Math.max(1, u * (0.25 + r() * 0.35)); c.fillRect(x, y, d, d); }
    for (let i = 0; i < 60; i++) { const x = r() * size, y = r() * size, rad = (0.6 + r() * 1.6) * u, a = r() * TAU; wrap(() => { c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(x + 0.3 * u, y + 0.4 * u, rad, rad * 0.7, a, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.ellipse(x, y, rad, rad * 0.7, a, 0, TAU); c.fill(); }); }
    c.lineCap = 'round';
    for (let i = 0; i < 26; i++) { let x = r() * size, y = r() * size, a = r() * TAU; const pts = [[x, y]]; for (let k = 0; k < 6; k++) { a += (r() - 0.5) * 1.2; x += Math.cos(a) * (2 + r() * 4) * u; y += Math.sin(a) * (2 + r() * 4) * u; pts.push([x, y]); } wrap(() => { c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 0.35 * u; c.beginPath(); pts.forEach(([px, py], k) => (k ? c.lineTo(px, py) : c.moveTo(px, py))); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.07)'; c.translate(0.3 * u, 0.3 * u); c.stroke(); }); }
    p = c.createPattern(cv, 'repeat'); p.size = size; grains.set(key, p); if (grains.size > 24) grains.clear();
    return p;
  }

  function islandPath(c, isl, sc) {
    c.beginPath();
    for (let i = 0; i < isl.left.length; i++) { const wy = isl.wy0 + i * isl.step; const y = sc - wy; i ? c.lineTo(isl.left[i], y) : c.moveTo(isl.left[i], y); }
    for (let i = isl.right.length - 1; i >= 0; i--) { const wy = isl.wy0 + i * isl.step; c.lineTo(isl.right[i], sc - wy); }
    c.closePath();
  }

  function drawIslands(c, g, sc, th) {
    for (const isl of g.def.islands) {
      if (sc - isl.wy1 > FIELD.H + 30 || sc - isl.wy0 < -30) continue;
      // 影（空に落ちる）→ 崖（厚み）→ 上面
      c.save(); c.translate(7, 16); islandPath(c, isl, sc); c.fillStyle = 'rgba(0,0,0,.35)'; c.fill(); c.restore();
      for (let k = 3; k >= 1; k--) { c.save(); c.translate(0, k * 2.6); islandPath(c, isl, sc); c.fillStyle = k === 3 ? '#0c0d12' : th.side; c.fill(); c.restore(); }
      islandPath(c, isl, sc);
      const y0 = sc - isl.wy1, y1 = sc - isl.wy0;
      c.fillStyle = lg(c, isl.cx - isl.hw, y0, isl.cx + isl.hw, y1, [[0, th.landHi], [0.35, th.land], [1, th.side]]); c.fill();
      c.save(); c.clip();
      // 地面の模様（表示倍率ちょうどの解像度で焼いた 128 単位の繰り返し）。スクロールに合わせて動かす
      const pat = grain(th);
      pat.setTransform(new DOMMatrix().translate(0, sc % 128).scale(128 / pat.size));
      c.fillStyle = pat; c.fillRect(-40, -40, FIELD.W + 80, FIELD.H + 80);
      // 縁の内側の陰（台地の厚みの手がかり）
      c.lineWidth = 9; c.strokeStyle = 'rgba(0,0,0,.16)'; islandPath(c, isl, sc); c.stroke();
      c.lineWidth = 3.5; c.strokeStyle = 'rgba(0,0,0,.14)'; islandPath(c, isl, sc); c.stroke();
      for (const d of detailFor(isl, g.area)) {
        const y = sc - d.wy; if (y < -10 || y > FIELD.H + 10) continue;
        if (d.t === 'crater') { c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.arc(d.x, y, d.s, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.08)'; c.beginPath(); c.arc(d.x - d.s * 0.25, y - d.s * 0.25, d.s * 0.7, 0, TAU); c.fill(); }
        else if (d.t === 'rock') { c.fillStyle = 'rgba(255,255,255,.07)'; c.beginPath(); c.ellipse(d.x, y, d.s, d.s * 0.6, d.a, 0, TAU); c.fill(); }
        else { c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(d.x, y); c.lineTo(d.x + Math.cos(d.a) * d.s * 2, y + Math.sin(d.a) * d.s * 2); c.lineTo(d.x + Math.cos(d.a + 0.7) * d.s * 3, y + Math.sin(d.a + 0.7) * d.s * 3); c.stroke(); }
      }
      for (const s of fx.scorch) { const y = sc - s.wy; if (y > -20 && y < FIELD.H + 20) { c.fillStyle = rg(c, s.x, y, 0, s.r, [[0, 'rgba(10,6,4,.55)'], [1, 'rgba(10,6,4,0)']]); c.beginPath(); c.arc(s.x, y, s.r, 0, TAU); c.fill(); } }
      for (const r of isl.ruins) { const y = sc - r.wy; if (y < -20 || y > FIELD.H + 20) continue; c.save(); c.translate(r.x, y); drawRuin(c, r, th); c.restore(); }
      c.restore();
      // 縁の明るい線
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 0.7; islandPath(c, isl, sc); c.stroke();
    }
  }

  // ── できごと → 演出 ──
  function burst(x, y, n, col, spd, life, size, kind = 'spark') {
    const r = Math.random;
    for (let i = 0; i < n; i++) { const a = r() * TAU, v = spd * (0.3 + r() * 0.7); fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: size * (0.5 + r()), col, kind, rot: r() * TAU, vr: (r() - 0.5) * 0.4 }); }
  }
  function onEvents(evs, g) {
    for (const e of evs) {
      switch (e.t) {
        case 'hit': burst(e.x, e.y, 4, '#fff6c0', 60, 12, 1.2); break;
        case 'kill': {
          const big = e.big;
          burst(e.x, e.y, big ? 34 : 14, big ? '#ffb070' : '#ffe0a0', big ? 120 : 80, big ? 40 : 24, big ? 2.2 : 1.4);
          burst(e.x, e.y, big ? 10 : 5, '#ff8040', 30, big ? 46 : 30, big ? 9 : 5, 'puff');
          burst(e.x, e.y, big ? 10 : 4, '#8a8f9a', 70, 40, 1.8, 'debris');
          fx.ring.push({ x: e.x, y: e.y, r: 2, max: big ? 34 : 16, life: big ? 30 : 18, t: 0 });
          if (e.ground) fx.scorch.push({ x: e.x, wy: g.scroll - e.y, r: big ? 22 : 11 });
          if (big) { fx.shake = Math.max(fx.shake, e.type === 'core' ? 5 : 2.5); fx.flash = Math.max(fx.flash, e.type === 'core' ? 0.55 : 0.18); }
          break;
        }
        case 'die': burst(e.x, e.y, 60, '#bfefff', 150, 60, 2); burst(e.x, e.y, 14, '#2ec5ff', 40, 60, 10, 'puff'); fx.ring.push({ x: e.x, y: e.y, r: 2, max: 50, life: 40, t: 0 }); fx.shake = 4; fx.flash = 0.35; break;
        case 'dock': fx.ring.push({ x: e.x, y: e.y, r: 20, max: 2, life: 26, t: 0, col: '#ffd166' }); burst(e.x, e.y, 24, '#ffd166', 70, 30, 1.4); break;
        case 'partnerFree': burst(e.x, e.y, 18, '#ffd166', 50, 30, 1.6); break;
        case 'twinBreak': burst(e.x, e.y, 40, '#ff9fd2', 140, 50, 2); fx.flash = Math.max(fx.flash, 0.25); break;
        case 'twinLocked': fx.ring.push({ x: e.x, y: e.y, r: 4, max: 40, life: 30, t: 0, col: '#ff4fa8' }); break;
        case 'chainStep': burst(e.x, e.y, 8, '#7ff3ff', 50, 20, 1.2); break;
        case 'chainBonus': burst(e.x, e.y, 50, '#7ff3ff', 130, 50, 1.8); break;
        case 'chainFail': fx.pops.push({ x: e.x, y: e.y, text: 'CHAIN BREAK', t: 0, col: '#ff8fa3' }); break;
        case 'sigilPing': burst(e.x, e.y, 5, '#ffffff', 30, 16, 1); break;
        case 'sigil': burst(e.x, e.y, 60, '#ffffff', 110, 70, 1.6); fx.ring.push({ x: e.x, y: e.y, r: 2, max: 60, life: 50, t: 0, col: '#ffffff' }); fx.sigils = (fx.sigils || []).concat([{ x: e.x, wy: e.wy, t: 0 }]); break;
        case 'score': fx.pops.push({ x: e.x, y: e.y, text: (e.label ? e.label + ' ' : '') + e.pts, t: 0, col: e.pts >= 1000 ? '#ffd166' : '#e8eefc', big: e.pts >= 1000 }); break;
        case 'extend': fx.pops.push({ x: g.player.x, y: g.player.y - 24, text: 'EXTEND +1', t: 0, col: '#8affc1', big: true }); break;
        case 'areaStart': fx.scorch.length = 0; fx.sigils = []; islandDetail.clear(); break;
      }
    }
    if (fx.parts.length > 700) fx.parts.splice(0, fx.parts.length - 700);
  }

  function stepFx(dt) {
    const k = dt * 60;
    for (const p of fx.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96 ** k; p.vy *= 0.96 ** k; p.life -= k; p.rot += p.vr * k; }
    fx.parts = fx.parts.filter((p) => p.life > 0);
    for (const p of fx.pops) p.t += k; fx.pops = fx.pops.filter((p) => p.t < 60);
    for (const r of fx.ring) r.t += k; fx.ring = fx.ring.filter((r) => r.t < r.life);
    fx.shake *= 0.86 ** k; fx.flash *= 0.85 ** k;
    if (fx.scorch.length > 60) fx.scorch.splice(0, fx.scorch.length - 60);
  }

  // ── 1 フレーム ──
  let time = 0;
  function frame(alpha, dt) {
    time += dt * 60;
    fpsEMA += ((1 / Math.max(1e-3, dt)) - fpsEMA) * 0.05;
    if (app.settings.quality === 'auto' && app.screen === 'play') {
      if (fpsEMA < 50) { slowT += dt; if (slowT > 2 && autoScale > 0.5) { autoScale = Math.max(0.5, autoScale * 0.85); slowT = 0; resize(lay); } } else slowT = 0;
    }
    stepFx(dt);
    const c = ctx; const g = app.game;
    c.setTransform(1, 0, 0, 1, 0, 0);
    // 盤面の外（左右の飾り）
    const W = canvas.width, H = canvas.height;
    c.fillStyle = '#04060d'; c.fillRect(0, 0, W, H);
    const S = dpr * rs;
    const ox = lay.fx * S, oy = lay.fy * S, fw = lay.fw * S, fh = lay.fh * S;
    c.fillStyle = lg(c, 0, 0, W, 0, [[0, '#070b18'], [0.5, '#04060d'], [1, '#070b18']]); c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(120,180,255,.06)'; c.lineWidth = 1;
    const gs = 40 * S; c.beginPath(); for (let x = (ox % gs); x < W; x += gs) { if (x > ox && x < ox + fw) continue; c.moveTo(x, 0); c.lineTo(x, H); } for (let y = 0; y < H; y += gs) { c.moveTo(0, y); c.lineTo(ox, y); c.moveTo(ox + fw, y); c.lineTo(W, y); } c.stroke();

    // 盤面
    let shx = 0, shy = 0;
    if (fx.shake > 0.05 && app.settings.shake > 0) { const a = fx.shake * app.settings.shake; shx = (Math.sin(time * 1.7) + Math.sin(time * 2.9)) * 0.5 * a; shy = (Math.sin(time * 2.3) + Math.sin(time * 3.7)) * 0.5 * a; }
    c.save();
    c.beginPath(); c.rect(ox, oy, fw, fh); c.clip();
    c.setTransform(K, 0, 0, K, ox + shx * K, oy + shy * K);
    const area = g ? g.area : 0, th = THEMES[AREAS[area].theme];
    if (!sky || skyArea !== area) { sky = buildSky(area); skyArea = area; }
    const sc = g ? g.scroll - (1 - alpha) * TUNING.scroll / 60 : time * 0.5;
    const skyY = ((sc * 0.12) % (FIELD.H * 2));
    c.drawImage(sky, 0, skyY - FIELD.H * 2, FIELD.W, FIELD.H * 2); c.drawImage(sky, 0, skyY, FIELD.W, FIELD.H * 2);
    for (const s of stars) { const y = ((s.y + sc * s.z * 0.5) % (FIELD.H * 2)) - FIELD.H * 0.5; if (y < 0 || y > FIELD.H) continue; c.fillStyle = `rgba(220,235,255,${0.25 + s.b * 0.6 * s.z})`; const sz = 0.3 + s.z * 0.7; c.fillRect(s.x, y, sz, sz * (1 + s.z * 2)); }

    if (g) drawWorld(c, g, alpha, sc, th);
    else drawAttract(c, th);

    // 光の輪・破片・数字（弾より下）
    for (const r of fx.ring) { const k = r.t / r.life; c.strokeStyle = r.col || 'rgba(255,220,180,1)'; c.globalAlpha = 1 - k; c.lineWidth = 1.5 * (1 - k) + 0.3; c.beginPath(); c.arc(r.x, r.y, lerp(r.r, r.max, 1 - (1 - k) ** 2), 0, TAU); c.stroke(); }
    c.globalAlpha = 1;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const p of fx.parts) {
      const k = p.life / p.max;
      if (p.kind === 'spark') { c.strokeStyle = p.col; c.globalAlpha = k; c.lineWidth = p.size * 0.6; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); c.stroke(); }
      else if (p.kind === 'puff') { c.globalAlpha = k * 0.7; c.fillStyle = rg(c, p.x, p.y, 0, p.size * (1.6 - k), [[0, '#fff4d0'], [0.35, p.col], [1, 'rgba(60,20,10,0)']]); c.beginPath(); c.arc(p.x, p.y, p.size * (1.6 - k), 0, TAU); c.fill(); }
    }
    c.restore();
    for (const p of fx.parts) if (p.kind === 'debris') { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.globalAlpha = Math.min(1, p.life / 20); c.fillStyle = p.col; c.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8); c.restore(); }
    c.globalAlpha = 1;
    if (g) drawBullets(c, g, alpha);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const p of fx.pops) { c.globalAlpha = p.t < 40 ? 1 : 1 - (p.t - 40) / 20; c.font = `800 ${p.big ? 7.5 : 5.5}px 'AR Sans', sans-serif`; c.lineWidth = 1.6; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText(p.text, p.x, p.y - p.t * 0.25); c.fillStyle = p.col; c.fillText(p.text, p.x, p.y - p.t * 0.25); }
    c.globalAlpha = 1;
    if (fx.flash > 0.01 && app.settings.flash > 0) { c.fillStyle = `rgba(255,250,240,${fx.flash * app.settings.flash * 0.6})`; c.fillRect(-10, -10, FIELD.W + 20, FIELD.H + 20); }
    if (app.settings.crt > 0) { c.fillStyle = `rgba(0,0,0,${0.22 * app.settings.crt})`; for (let y = 0; y < FIELD.H; y += 1) c.fillRect(0, y + 0.5, FIELD.W, 0.4); }
    c.restore();
    // 盤面の縁
    c.setTransform(1, 0, 0, 1, 0, 0); c.strokeStyle = 'rgba(46,197,255,.35)'; c.lineWidth = Math.max(1, S); c.strokeRect(ox - 0.5, oy - 0.5, fw + 1, fh + 1);
    if (app.debug) debugText(c, g);
  }

  function drawAttract(c, th) {
    // タイトル画面の背景: 星と、ゆっくり回る自機
    c.save(); c.translate(FIELD.W / 2, FIELD.H * 0.9); blit(c, sprite('player0', 24, (cc) => drawPlayer(cc, false, 0)), 0, 0, 0, 1.6); c.restore();
    glow(c, FIELD.W / 2, FIELD.H * 0.9 + 22, 18, 'rgba(46,197,255,.25)');
  }

  function drawWorld(c, g, a, sc, th) {
    drawIslands(c, g, sc, th);
    // シジルのかすかな光（ヒント）と、現れた印
    for (const o of g.ground.values()) {
      if (o.type === 'sigil' && o.hidden) {
        const ph = (g.tick + o.gid * 37) % TUNING.sigil.hintEvery;
        if (ph < 26) { const k = Math.sin((ph / 26) * Math.PI); glow(c, o.x, lerp(o.py, o.y, a), 6 * k + 1, `rgba(255,255,255,${0.22 * k})`); }
      }
    }
    for (const s of fx.sigils || []) { const y = sc - s.wy; s.t++; c.save(); c.translate(s.x, y); c.rotate(s.t * 0.02); c.strokeStyle = `rgba(255,255,255,${Math.max(0.25, 1 - s.t / 300)})`; c.lineWidth = 0.9; c.beginPath(); for (let k = 0; k < 6; k++) { const an = (k * TAU * 2) / 6; c.lineTo(Math.cos(an) * 9, Math.sin(an) * 9); } c.closePath(); c.stroke(); glow(c, 0, 0, 12, 'rgba(255,255,255,.35)'); c.restore(); }
    // 地上の標的
    const p = g.player, ppx = lerp(p.px, p.x, a), ppy = lerp(p.py, p.y, a);
    for (const o of g.ground.values()) {
      if (o.type === 'sigil') continue;
      const x = o.x, y = lerp(o.py, o.y, a), fl = o.flash / 6;
      if (o.type === 'turret') { blit(c, sprite('turret' + th.glow, 10, (cc) => GROUND_DRAW.turret(cc, th)), x, y, 0, 1, fl); blit(c, sprite('barrel', 10, GROUND_DRAW.turretBarrel), x, y, Math.atan2(ppy - y, ppx - x) - Math.PI / 2); }
      else if (o.type === 'bunker') blit(c, sprite('bunker' + th.glow, 13, (cc) => GROUND_DRAW.bunker(cc, th)), x, y, Math.atan2(ppy - y, ppx - x) - Math.PI / 2, 1, fl);
      else if (o.type === 'dock') { blit(c, sprite('dock', 14, GROUND_DRAW.dock), x, y, 0, 1, fl); glow(c, x, y, 10 + 3 * Math.sin(g.tick * 0.12), 'rgba(255,209,102,.35)'); }
      else if (o.type === 'panel') {
        const ch = g.chains[o.chainId];
        blit(c, sprite('panel' + th.glow, 8, (cc) => GROUND_DRAW.panel(cc, th)), x, y, 0, 1, fl);
        if (ch && ch.state === 'run') { c.fillStyle = '#7ff3ff'; c.font = "800 5px 'AR Sans', sans-serif"; c.textAlign = 'center'; c.fillText(String(o.chainIdx + 1), x, y - 9); }
      } else if (o.type === 'core') {
        blit(c, sprite('core' + th.glow + (g.tick >> 2) % 64, 26, (cc) => GROUND_DRAW.core(cc, th, (g.tick >> 2) % 64 * 4)), x, y, 0, 1, fl);
        const hpMax = 40 + Math.min(24, g.loop * 8);
        c.strokeStyle = '#ff4fa8'; c.lineWidth = 1.6; c.beginPath(); c.arc(x, y, 25, -Math.PI / 2, -Math.PI / 2 + TAU * (o.hp / hpMax)); c.stroke();
      }
    }
    if (sprites.size > 400) sprites.clear();
    // 空の敵の影（地面に落ちる。高さの手がかり）
    c.fillStyle = 'rgba(0,0,0,.28)';
    for (const e of g.enemies) { const x = lerp(e.px, e.x, a), y = lerp(e.py, e.y, a); c.beginPath(); c.ellipse(x + 6, y + 11, e.r * 0.8, e.r * 0.45, 0, 0, TAU); c.fill(); }
    if (p.alive) { c.beginPath(); c.ellipse(ppx + 7, ppy + 13, 9, 4, 0, 0, TAU); c.fill(); }
    // 空の敵
    for (const e of g.enemies) {
      const x = lerp(e.px, e.x, a), y = lerp(e.py, e.y, a), fl = e.flash / 6;
      let rot = 0;
      if (e.type === 'slicer' || e.type === 'spinner') rot = g.tick * (e.type === 'spinner' ? 0.12 : 0.2);
      else if (e.type === 'scout' || e.type === 'diver' || e.type === 'weaver') rot = Math.atan2(e.y - e.py || 1, e.x - e.px) - Math.PI / 2;
      if (e.type === 'scout' || e.type === 'diver') rot = Math.max(-0.8, Math.min(0.8, rot));
      blit(c, sprite(e.type, e.r + 8, AIR_DRAW[e.type]), x, y, e.type === 'weaver' ? g.tick * 0.05 : rot, 1, fl);
      if (e.telegraph) { c.strokeStyle = `rgba(255,80,120,${0.5 + 0.5 * Math.sin(g.tick * 0.6)})`; c.lineWidth = 0.9; c.beginPath(); c.arc(x, y, 13, 0, TAU); c.stroke(); }
      if (e.mv === 'twin') { c.strokeStyle = 'rgba(255,79,168,.8)'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, 14, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - (e.mergeK || 0))); c.stroke(); }
    }
    // 支援機
    if (g.partner) { const q = g.partner; const x = lerp(q.px, q.x, a), y = lerp(q.py, q.y, a); blit(c, sprite('partner' + (g.tick >> 1) % 32, 16, (cc) => drawPartner(cc, ((g.tick >> 1) % 32) * 2)), x, y); c.strokeStyle = `rgba(255,209,102,${0.4 + 0.3 * Math.sin(g.tick * 0.2)})`; c.lineWidth = 0.7; c.beginPath(); c.arc(x, y, TUNING.partner.dockR, 0, TAU); c.stroke(); }
    // 自機の弾
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const s of g.shots) { const x = lerp(s.px, s.x, a), y = lerp(s.py, s.y, a); c.fillStyle = lg(c, x, y - 7, x, y + 6, [[0, '#ffffff'], [0.4, COLORS.playerShot], [1, 'rgba(46,197,255,0)']]); c.beginPath(); c.roundRect(x - 1.3, y - 7, 2.6, 13, 1.3); c.fill(); }
    c.restore();
    // 自機
    if (p.alive) {
      const blink = p.invuln > 0 && (g.tick >> 2) % 2 === 0;
      if (!blink) {
        const bank = Math.max(-0.25, Math.min(0.25, (p.x - p.px) * 0.15));
        const dockPulse = p.dockAnim > 0 ? 1 + 0.25 * Math.sin((p.dockAnim / TUNING.partner.dockTicks) * Math.PI) : 1;
        blit(c, sprite('player' + (p.docked ? 1 : 0) + ((g.tick >> 1) % 16), 24, (cc) => drawPlayer(cc, p.docked, ((g.tick >> 1) % 16) * 2)), ppx, ppy, bank * 0.4, dockPulse);
      }
      if (app.settings.hitbox) { c.strokeStyle = '#00ff88'; c.lineWidth = 0.5; c.beginPath(); c.arc(ppx, ppy, TUNING.player.hitR, 0, TAU); c.stroke(); }
    }
    if (app.settings.hitbox) {
      c.strokeStyle = 'rgba(255,255,0,.8)'; c.lineWidth = 0.4;
      for (const e of g.enemies) { c.beginPath(); c.arc(e.x, e.y, e.r, 0, TAU); c.stroke(); }
      for (const o of g.ground.values()) { c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.stroke(); }
    }
  }

  function drawBullets(c, g, a) {
    // 暗い縁 → 桃色の光 → 白い芯（爆発の上・地形の上でも読める）
    for (const b of g.bullets) {
      const x = lerp(b.px, b.x, a), y = lerp(b.py, b.y, a), born = Math.min(1, (g.tick - (b.born || 0)) / 6), r = b.r * (0.6 + 0.4 * born);
      c.fillStyle = 'rgba(20,0,12,.85)'; c.beginPath(); c.arc(x, y, r + 1.1, 0, TAU); c.fill();
      c.fillStyle = COLORS.enemyBullet; c.beginPath(); c.arc(x, y, r + 0.3, 0, TAU); c.fill();
      c.fillStyle = COLORS.enemyBulletCore; c.beginPath(); c.arc(x, y, r * 0.5, 0, TAU); c.fill();
    }
    if (app.settings.hitbox) { c.strokeStyle = '#00ff88'; c.lineWidth = 0.3; for (const b of g.bullets) { c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.stroke(); } }
  }

  function debugText(c, g) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.font = `${12 * dpr}px monospace`; c.fillStyle = '#9cffd0'; c.textAlign = 'left';
    const lines = [`FPS ${fpsEMA.toFixed(1)}  出力 ${Math.round(lay.w * dpr)}×${Math.round(lay.h * dpr)}  内部 ${canvas.width}×${canvas.height}  倍率 ${rs.toFixed(2)}`,
      g ? `敵 ${g.enemies.length} 弾 ${g.bullets.length} 地上 ${g.ground.size} 粒子 ${fx.parts.length} scroll ${g.scroll.toFixed(0)}/${g.def.coreWy}` : ''];
    lines.forEach((l, i) => c.fillText(l, 10 * dpr, (20 + i * 16) * dpr));
  }

  return { resize, frame, onEvents, get stats() { return { fps: fpsEMA, w: canvas.width, h: canvas.height, rs, out: [Math.round(lay.w * dpr), Math.round(lay.h * dpr)] }; } };
}
