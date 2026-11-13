// AEGIS RELAY 2D — 演出（爆発・火花・破片・煙・衝撃波・光・数字・環境の粒・縁から落ちる粒・画面の揺れ）
// ・粒はあらかじめ確保した入れ物を使い回す（実行中にメモリを確保しない → GC の引っかかりを出さない）
// ・動きはすべて実時間 dt で計算（60/120/144Hz で同じ速さ）
// ・画面の揺れは減衰する正弦の合成（乱数で震わせない）
import { FIELD } from '../shared/rules.js';
import { TAU, clamp, lerp, easeOut, easeBack, hexRgb, css, makeCanvas } from './util.js';
import { GLOWS } from './atlas.js';

const W = FIELD.W, H = FIELD.H;
const K_GLOW = 0, K_FIRE = 1, K_SMOKE = 2, K_SPARK = 3, K_DEBRIS = 4, K_RING = 5, K_FALL = 6;

export function createFx(R, A) {
  const CAP = 1100, parts = Array.from({ length: CAP }, () => ({ k: 0, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1, s0: 1, s1: 1, rot: 0, vr: 0, spr: null, a: 1, drag: 0, g: 0, sk: 0, fr: 0 }));
  let n = 0;
  const pops = Array.from({ length: 28 }, () => ({ on: false, x: 0, y: 0, cv: null, t: 0, big: false })), timers = [];
  const lights = Array.from({ length: 14 }, () => ({ on: false, x: 0, y: 0, r: 0, t: 0, life: 1, col: 'orange', sk: 0 }));
  const shake = { a: 0, t: 0 }; let flash = 0, flashCol = '255,250,240';
  // 色つきの筋・輪（白い元絵に色をのせて 1 回だけ作る）
  const tint = (src, hex) => { const cv = makeCanvas(src.width, src.height), c = cv.getContext('2d'); c.drawImage(src, 0, 0); c.globalCompositeOperation = 'source-atop'; c.fillStyle = css(hexRgb(hex), 0.78); c.fillRect(0, 0, cv.width, cv.height); return cv; };
  const streaks = {}, rings = {}; for (const [name, hex] of Object.entries(GLOWS)) { streaks[name] = name === 'white' ? A.streak : tint(A.streak, hex); rings[name] = name === 'white' ? A.ring : tint(A.ring, hex); }

  function spawn(k, x, y, vx, vy, life, s0, s1, spr, a = 1) {
    if (n >= (R.low ? CAP * 0.45 : CAP)) { if (k === K_SMOKE || k === K_FALL) return null; n--; } // 満杯: 煙などは出さない。重要な粒は最後の 1 つを上書き
    const p = parts[n++]; p.k = k; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.t = 0; p.life = life; p.s0 = s0; p.s1 = s1; p.spr = spr; p.a = a; p.rot = 0; p.vr = 0; p.drag = 0; p.g = 0; p.sk = 0; p.fr = 0; return p;
  }
  const rnd = Math.random;
  function sparks(x, y, num, col, spd, life, len, sk = 0, dir = null, spread = TAU) {
    if (R.low) num = Math.ceil(num * 0.5);
    for (let i = 0; i < num; i++) { const a = dir == null ? rnd() * TAU : dir + (rnd() - 0.5) * spread, v = spd * (0.25 + rnd() * 0.75), p = spawn(K_SPARK, x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.5 + rnd() * 0.5), len * (0.6 + rnd() * 0.8), 0, streaks[col]); if (p) { p.drag = 3.2; p.sk = sk; p.g = 30; } }
  }
  function glowPuff(x, y, col, r0, r1, life, a = 1, sk = 0) { const p = spawn(K_GLOW, x, y, 0, 0, life, r0, r1, A.glows[col], a); if (p) p.sk = sk; return p; }
  function ring(x, y, col, r0, r1, life, a = 1, sk = 0) { const p = spawn(K_RING, x, y, 0, 0, life, r0, r1, rings[col], a); if (p) p.sk = sk; return p; }
  function fireball(x, y, r, life, vx = 0, vy = 0, sk = 0) { const p = spawn(K_FIRE, x, y, vx, vy, life, r * 0.75, r * 1.25, null, 1); if (p) { p.rot = rnd() * TAU; p.vr = (rnd() - 0.5) * 1.5; p.sk = sk; p.drag = 1.5; } }
  function smokePuff(x, y, r, life, vx, vy, sk = 0, a = 0.55) { const p = spawn(K_SMOKE, x, y, vx, vy, life, r * 0.6, r * 1.7, A.smoke[(rnd() * 4) | 0], a); if (p) { p.rot = rnd() * TAU; p.vr = (rnd() - 0.5) * 0.8; p.sk = sk; p.drag = 1.2; } }
  function debris(x, y, num, spd, vx, vy, sk = 0, gold = false) {
    if (R.low) num = Math.ceil(num * 0.5);
    for (let i = 0; i < num; i++) { const a = rnd() * TAU, v = spd * (0.3 + rnd() * 0.7), p = spawn(K_DEBRIS, x, y, Math.cos(a) * v + vx, Math.sin(a) * v + vy, 0.6 + rnd() * 0.7, 0.7 + rnd() * 0.8, 0, (gold ? 'shardG' : 'shard') + ((rnd() * 3) | 0)); if (p) { p.rot = rnd() * TAU; p.vr = (rnd() - 0.5) * 22; p.drag = 1.4; p.sk = sk; } }
  }
  function light(x, y, r, life, col = 'orange', sk = 0) { for (const l of lights) if (!l.on) { l.on = true; l.x = x; l.y = y; l.r = r; l.t = 0; l.life = life; l.col = col; l.sk = sk; return; } }
  function later(t, f) { timers.push({ t, f }); }
  function addShake(a) { shake.a = Math.min(7, Math.max(shake.a, a)); }
  function addFlash(a, col) { if (a > flash) { flash = a; flashCol = col || '255,250,240'; } }

  // ── 高いレベルの演出 ──
  function hitSpark(x, y, air) { sparks(x, y, 5, 'yellow', 90, 0.22, 5, air ? 0 : 1, -Math.PI / 2, 2.4); glowPuff(x, y, 'white', 2.5, 5, 0.09, 0.9, air ? 0 : 1); }
  // 撃破: 閃光 → 火球 → 火花・破片 → 煙 → 衝撃波。大型は連鎖
  function explode(x, y, r, o = {}) {
    const sk = o.ground ? 1 : 0, vx = (o.vx || 0) * 20, vy = (o.vy || 0) * 20, big = o.big, col = o.col || 'orange';
    glowPuff(x, y, 'white', r * 1.2, r * 3.2, 0.1, 1, sk);
    glowPuff(x, y, col, r * 1.5, r * 3.6, 0.32, 0.8, sk);
    const nf = big ? 5 : 2;
    for (let i = 0; i < nf; i++) { const a = rnd() * TAU, d = i ? rnd() * r * 0.7 : 0; fireball(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (i ? 1.1 + rnd() * 0.7 : 1.9), 0.4 + rnd() * 0.3, vx * 0.5, vy * 0.5, sk); }
    sparks(x, y, big ? 30 : 12, 'yellow', big ? 190 : 140, 0.5, 8, sk);
    sparks(x, y, big ? 12 : 5, col, 90, 0.7, 5, sk);
    debris(x, y, big ? 11 : 4 + (r > 7 ? 2 : 0), big ? 110 : 80, vx, vy, sk, o.gold);
    ring(x, y, 'white', r * 0.5, r * (big ? 4.2 : 2.8), big ? 0.42 : 0.3, 0.8, sk);
    const ns = big ? 6 : 3; for (let i = 0; i < ns; i++) later(0.08 + i * 0.05, () => smokePuff(x + (rnd() - 0.5) * r, y + (rnd() - 0.5) * r + (sk ? 0 : 0), r * (0.8 + rnd() * 0.8), 0.8 + rnd() * 0.6, (rnd() - 0.5) * 16 + vx * 0.3, -8 - rnd() * 14 + vy * 0.3, sk));
    light(x, y, r * (big ? 7 : 4.5), big ? 0.5 : 0.3, col, sk);
    if (big) {
      for (let i = 0; i < 4; i++) later(0.09 + i * 0.09, () => { const a = rnd() * TAU, d = r * (0.4 + rnd() * 0.8), ex = x + Math.cos(a) * d, ey = y + Math.sin(a) * d + (sk ? 0 : 0); fireball(ex, ey, r * (0.8 + rnd() * 0.5), 0.35 + rnd() * 0.2, 0, 0, sk); sparks(ex, ey, 8, 'yellow', 120, 0.4, 6, sk); glowPuff(ex, ey, 'white', r * 0.6, r * 1.8, 0.08, 0.9, sk); });
      addShake(o.shake ?? 2.4); addFlash(o.flash ?? 0.16);
    }
  }
  // エリアコアの撃破: 長い連鎖爆発と大きな輪
  function coreBlast(x, y) {
    explode(x, y, 22, { ground: true, big: true, col: 'pink', shake: 6, flash: 0.6 });
    for (let i = 0; i < 16; i++) later(0.12 + i * 0.11, () => { const a = rnd() * TAU, d = 6 + rnd() * 26; explode(x + Math.cos(a) * d, y + Math.sin(a) * d, 7 + rnd() * 8, { ground: true, col: i % 3 ? 'orange' : 'pink' }); if (i % 4 === 0) addShake(3.5); });
    for (let i = 0; i < 3; i++) later(i * 0.22, () => ring(x, y, i === 1 ? 'pink' : 'white', 10, 130 + i * 30, 0.9, 0.9, 1));
    later(1.0, () => { glowPuff(x, y, 'white', 30, 150, 0.5, 1, 1); addFlash(0.5); addShake(5); });
    light(x, y, 190, 1.8, 'pink', 1);
  }
  function playerDeath(x, y) {
    glowPuff(x, y, 'white', 10, 46, 0.14); glowPuff(x, y, 'cyan', 14, 60, 0.5, 0.9);
    for (let i = 0; i < 4; i++) { const a = rnd() * TAU; fireball(x + Math.cos(a) * 5 * (i > 0), y + Math.sin(a) * 5 * (i > 0), i ? 12 : 18, 0.5 + rnd() * 0.2); }
    sparks(x, y, 40, 'cyan', 210, 0.8, 10); sparks(x, y, 24, 'white', 150, 0.6, 7);
    debris(x, y, 14, 130, 0, 0);
    ring(x, y, 'cyan', 4, 70, 0.55, 0.9); later(0.12, () => ring(x, y, 'white', 4, 46, 0.4, 0.7));
    for (let i = 0; i < 6; i++) later(0.1 + i * 0.06, () => smokePuff(x + (rnd() - 0.5) * 12, y + (rnd() - 0.5) * 12, 9 + rnd() * 6, 1.1, (rnd() - 0.5) * 20, -10 - rnd() * 12));
    addShake(4.5); addFlash(0.34, '200,240,255'); light(x, y, 80, 0.6, 'cyan');
  }
  // 合体: 閃光 → 衝撃波の輪 → 金色の粒（引き寄せと装着は描画側が翼の絵でやる）
  function dockBurst(x, y) {
    ring(x, y, 'gold', 46, 10, 0.26, 0.8);
    later(0.26, () => { glowPuff(x, y, 'white', 8, 34, 0.14); glowPuff(x, y, 'gold', 14, 46, 0.45, 0.9); ring(x, y, 'gold', 6, 64, 0.5, 1); ring(x, y, 'white', 4, 38, 0.32, 0.8); addFlash(0.14, '255,236,180');
      for (let i = 0; i < 26; i++) { const a = rnd() * TAU, v = 30 + rnd() * 90, p = spawn(K_GLOW, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.7 + rnd() * 0.7, 1.6 + rnd() * 1.4, 0.3, A.glows.gold, 1); if (p) { p.drag = 2.2; p.g = -14; } } });
  }
  function goldBurst(x, y, num, sk) { for (let i = 0; i < num; i++) { const a = rnd() * TAU, v = 20 + rnd() * 60, p = spawn(K_GLOW, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.5 + rnd() * 0.5, 1.5 + rnd(), 0.3, A.glows.gold, 1); if (p) { p.drag = 2.4; p.sk = sk; } } }
  function muzzle(x, y, ang, col, size = 1) { // 砲口炎（向き ang へ伸びる光）
    const p = spawn(K_SPARK, x, y, Math.cos(ang) * 30, Math.sin(ang) * 30, 0.07, 9 * size, 0, streaks[col]); if (p) p.fr = 2.2 * size;
    glowPuff(x, y, col, 3.5 * size, 6 * size, 0.08, 0.9);
  }
  function bulletPuff(x, y) { ring(x, y, 'pink', 2.5, 7, 0.2, 0.7); glowPuff(x, y, 'pink', 3, 1, 0.16, 0.6); }
  function warpIn(x, y) { const p = spawn(K_SPARK, x, y - 4, 0, 160, 0.22, 46, 0, streaks.white); if (p) p.fr = 2; glowPuff(x, y, 'white', 3, 12, 0.2, 0.7); }
  function pop(x, y, str, col, big) {
    let q = null; for (const p of pops) if (!p.on) { q = p; break; } if (!q) { q = pops[0]; for (const p of pops) if (p.t > q.t) q = p; }
    q.on = true; q.x = clamp(x, 16, W - 16); q.y = y; q.cv = A.text(str, big ? 7.5 : 5.6, col); q.t = 0; q.big = big;
  }

  // ── 環境の粒（テーマ別）と、縁から落ちる粒 ──
  const AMB = {
    ash:   { col: 'white', n: 42, s: [0.5, 1.1], vy: [14, 30], vx: -9, a: 0.3, add: false, sway: 6 },
    snow:  { col: 'white', n: 54, s: [0.6, 1.5], vy: [10, 26], vx: 5, a: 0.6, add: false, sway: 10 },
    ember: { col: 'orange', n: 40, s: [0.8, 1.7], vy: [-34, -12], vx: 4, a: 0.9, add: true, sway: 9, tw: 1 },
    spark: { col: 'green', n: 22, s: [0.6, 1.2], vy: [-10, 22], vx: 14, a: 0.7, add: true, sway: 3, tw: 1 },
    spore: { col: 'yellow', n: 40, s: [0.9, 2.1], vy: [-8, 8], vx: 4, a: 0.42, add: true, sway: 12 },
    gold:  { col: 'gold', n: 46, s: [0.6, 1.4], vy: [5, 18], vx: -4, a: 0.85, add: true, sway: 7, tw: 1 },
    mote:  { col: 'purple', n: 36, s: [0.8, 1.9], vy: [-6, 10], vx: 3, a: 0.6, add: true, sway: 10 },
    light: { col: 'white', n: 40, s: [0.6, 1.5], vy: [-26, -8], vx: 0, a: 0.6, add: true, sway: 4, tw: 1 },
  };
  const amb = Array.from({ length: 56 }, (_, i) => ({ x: rnd() * W, y: rnd() * H, s: rnd(), v: rnd(), ph: rnd() * TAU, i }));
  function drawAmbient(c, kind, time, dt, dsc) {
    const cf = AMB[kind]; if (!cf) return; const num = R.low ? cf.n >> 1 : cf.n, spr = A.glows[cf.col];
    c.globalCompositeOperation = cf.add ? 'lighter' : 'source-over';
    for (let i = 0; i < num; i++) {
      const p = amb[i], vy = lerp(cf.vy[0], cf.vy[1], p.v);
      p.y += (vy * dt + dsc * 0.9); p.x += (cf.vx + Math.sin(time * 0.02 + p.ph) * cf.sway) * dt;
      if (p.y > H + 4) { p.y = -4; p.x = rnd() * W; } else if (p.y < -4) { p.y = H + 4; p.x = rnd() * W; }
      if (p.x < -4) p.x += W + 8; else if (p.x > W + 4) p.x -= W + 8;
      const s = lerp(cf.s[0], cf.s[1], p.s), tw = cf.tw ? 0.45 + 0.55 * Math.sin(time * 0.11 + p.ph * 7) : 1;
      c.globalAlpha = cf.a * tw * (0.5 + 0.5 * p.s); c.drawImage(spr, p.x - s, p.y - s, s * 2, s * 2);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  const FALLS = { sand: ['yellow', 0.5, 34, 5, 0.5], snow: ['white', 0.75, 18, 3, 0.7], lava: ['orange', 1, 30, 6, 1], spark: ['green', 0.8, 46, 5, 0.9], water: ['cyan', 0.6, 44, 8, 0.6], gold: ['gold', 0.9, 26, 4, 0.9], mote: ['purple', 0.8, 20, 4, 0.8], light: ['white', 0.8, 24, 6, 0.8] };
  // 縁から落ちる粒: 見えている放出点から、実時間の割合で出す
  function emitFalls(metas, kind, sc, dt) {
    const cf = FALLS[kind]; if (!cf || R.low) return;
    for (const m of metas) for (const f of m.falls) {
      const y = sc - f.wy; if (y < -10 || y > H) continue;
      f.acc += dt * (kind === 'water' ? 44 : 20);
      while (f.acc >= 1) { f.acc -= 1; const p = spawn(K_FALL, f.x + (rnd() - 0.5) * 3.4, y + rnd() * 2, (rnd() - 0.5) * 4, cf[2] * (0.4 + rnd() * 0.4), 0.7 + rnd() * 0.5, cf[3] * (0.6 + rnd() * 0.8), 0, streaks[cf[0]], cf[4]); if (p) { p.g = 90; p.sk = 1; p.fr = cf[1]; } }
    }
  }

  function step(dt, dsc) {
    for (let i = timers.length - 1; i >= 0; i--) { const t = timers[i]; t.t -= dt; if (t.t <= 0) { timers.splice(i, 1); t.f(); } }
    for (let i = 0; i < n; i++) {
      const p = parts[i]; p.t += dt;
      if (p.t >= p.life) { const q = parts[--n]; parts[n] = p; parts[i] = q; i--; continue; }
      if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt + dsc * p.sk; p.rot += p.vr * dt;
    }
    for (const q of pops) if (q.on) { q.t += dt; if (q.t > 1.05) q.on = false; }
    for (const l of lights) if (l.on) { l.t += dt; l.y += dsc * l.sk; if (l.t >= l.life) l.on = false; }
    shake.a *= Math.exp(-5.2 * dt); shake.t += dt; flash *= Math.exp(-7 * dt);
  }
  // 画面の揺れ（減衰する正弦を 2 つずつ重ねる）
  function shakeOffset(out, scale) {
    const a = shake.a * scale; if (a < 0.03) { out.x = out.y = 0; return; }
    const t = shake.t; out.x = (Math.sin(t * 31) + 0.6 * Math.sin(t * 47 + 1.3)) * 0.6 * a; out.y = (Math.sin(t * 37 + 0.7) + 0.6 * Math.sin(t * 53 + 2.1)) * 0.6 * a;
  }

  // 地面を照らす光（爆発）。地上物の上に加算で重ねる
  function drawLights(c) {
    c.globalCompositeOperation = 'lighter';
    for (const l of lights) if (l.on) { const k = 1 - l.t / l.life; A.glow(c, l.col, l.x, l.y, l.r * (0.8 + 0.2 * k), k * k * 0.42); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  function drawSprite(c, cv, x, y, rot, sx, sy) { const K = R.K, cs = Math.cos(rot) * K, sn = Math.sin(rot) * K; c.setTransform(cs * sx, sn * sx, -sn * sy, cs * sy, R.bx + x * K, R.by + y * K); c.drawImage(cv, -1, -1, 2, 2); }
  // 粒を描く: 煙（通常合成）→ 光・火・火花・輪（加算）→ 破片
  function draw(c) {
    const K = R.K; let any = false;
    for (let i = 0; i < n; i++) { const p = parts[i]; if (p.k !== K_SMOKE) continue; const u = p.t / p.life, s = lerp(p.s0, p.s1, easeOut(u)); c.globalAlpha = p.a * Math.min(1, u * 6) * (1 - u) * (1 - u); drawSprite(c, p.spr, p.x, p.y, p.rot, s, s); any = true; }
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const p = parts[i], u = p.t / p.life;
      switch (p.k) {
        case K_GLOW: { const s = lerp(p.s0, p.s1, easeOut(u)); c.globalAlpha = p.a * (1 - u * u); c.setTransform(K, 0, 0, K, R.bx, R.by); c.drawImage(p.spr, p.x - s, p.y - s, s * 2, s * 2); break; }
        case K_FIRE: { const s = lerp(p.s0, p.s1, easeOut(u)), f = A.fire[Math.min(13, (u * 14) | 0)]; c.globalAlpha = 1; drawSprite(c, f, p.x, p.y, p.rot, s, s); break; }
        case K_SPARK: case K_FALL: { const v = Math.hypot(p.vx, p.vy), len = p.k === K_FALL ? p.s0 * (0.5 + v * 0.012) : Math.max(1.2, p.s0 * (v * 0.008 + 0.25)) * (1 - u * 0.5), wd = Math.max(1 / K, (p.fr || 0.55) * (p.k === K_FALL ? 1 : 1 - u * 0.6));
          c.globalAlpha = p.a * (p.k === K_FALL ? Math.min(1, u * 5) * (1 - u) : 1 - u * u); const a = Math.atan2(p.vy, p.vx), cs = Math.cos(a) * K, sn = Math.sin(a) * K;
          c.setTransform(cs, sn, -sn, cs, R.bx + p.x * K, R.by + p.y * K); c.drawImage(p.spr, -len, -wd, len, wd * 2); break; }
        case K_RING: { const s = lerp(p.s0, p.s1, easeOut(u)); c.globalAlpha = p.a * (1 - u) * (1 - u); c.setTransform(K, 0, 0, K, R.bx, R.by); c.drawImage(p.spr, p.x - s, p.y - s, s * 2, s * 2); break; }
      }
    }
    c.globalCompositeOperation = 'source-over'; c.setTransform(K, 0, 0, K, R.bx, R.by);
    for (let i = 0; i < n; i++) { const p = parts[i]; if (p.k !== K_DEBRIS) continue; const u = p.t / p.life; c.globalAlpha = Math.min(1, (1 - u) * 3); A.draw(c, A.get(p.spr), p.x, p.y, p.rot, p.s0, p.s0 * (0.55 + 0.45 * Math.cos(p.rot * 1.7))); }
    c.globalAlpha = 1; c.setTransform(K, 0, 0, K, R.bx, R.by);
  }
  // 得点などの文字（ふくらんで現れ、上へ流れて消える）
  function drawPops(c) {
    c.imageSmoothingQuality = 'high';
    for (const q of pops) if (q.on && q.cv) {
      const u = q.t / 1.05, sc = u < 0.14 ? easeBack(u / 0.14) : 1, a = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1, w = q.cv.wu * sc, h = q.cv.hu * sc;
      c.globalAlpha = a; c.drawImage(q.cv, q.x - w / 2, q.y - 6 - u * 16 - h / 2, w, h);
    }
    c.globalAlpha = 1;
  }
  function clear() { n = 0; timers.length = 0; for (const q of pops) q.on = false; for (const l of lights) l.on = false; }
  return { spawn, sparks, glowPuff, ring, fireball, smokePuff, debris, light, later, addShake, addFlash, hitSpark, explode, coreBlast, playerDeath, dockBurst, goldBurst, muzzle, bulletPuff, warpIn, pop,
    drawAmbient, emitFalls, step, shakeOffset, drawLights, draw, drawPops, clear, streaks, rings,
    get count() { return n; }, get flash() { return flash; }, get flashCol() { return flashCol; } };
}
