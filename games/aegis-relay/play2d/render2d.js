// AEGIS RELAY — 2D の描画（Canvas 2D）。盤面の論理座標（240×320）→ 画面の実ピクセル
// ・描画バッファは「表示の実寸 × devicePixelRatio × 画質倍率」。CSS で引き伸ばさない（4K なら 4K の画素で描く）
// ・重い絵（星雲・天体・大陸の帯・機体のスプライト・爆発のコマ）は先に焼き、毎フレームは drawImage だけ
// ・描く順: 宇宙 → 大陸 → 地上の標的 → 薄い雲・影 → 空の敵・自機 → 爆発 → 光のにじみ → 敵弾（いちばん上）→ 文字
//   敵弾は光のにじみ（ブルーム）より後に描くので、爆発や明るい地面の上でも白飛びしない
// ・モジュール: bg.js（宇宙）/ terrain.js（大陸）/ actors.js（登場物）/ fx.js（演出）/ atlas.js（焼いた絵）/ sprites/（絵の定義）
import { FIELD, THEMES, AREAS, TUNING } from '../shared/rules.js';
import { buildArea } from '../shared/area-gen.js';
import { ART } from './themes2d.js';
import { clamp, lerp, smooth, createJobs, makeCanvas, freeCanvas, mem } from './util.js';
import { createAtlas } from './atlas.js';
import { createBackdrop } from './bg.js';
import { createTerrain } from './terrain.js';
import { createFx } from './fx.js';
import { createActors } from './actors.js';
import { definePlayer } from './sprites/player.js';
import { defineEnemies } from './sprites/enemies.js';
import { defineGround } from './sprites/ground.js';

const W = FIELD.W, H = FIELD.H;
const AUTO_LEVELS = [1, 0.85, 0.72, 0.6, 0.5]; // 自動画質の段階（描画倍率）

export function createRenderer2D(canvas, app) {
  // 低遅延のヒント: 合成を待たずに表示へ回す（対応していないブラウザは無視する）
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const R = { K: 1, bx: 0, by: 0, low: false, jobs: createJobs(), skip: {} }; // skip は検証用（層ごとの描画コストを測るために層を外せる）
  const A = createAtlas(R); definePlayer(A); defineEnemies(A); defineGround(A);
  const sky = createBackdrop(R), terrain = createTerrain(R), fx = createFx(R, A), actors = createActors(R, A, fx, terrain);
  let lay = null, dpr = 1, rs = 1, S = 1, frameNo = 0, marginDirty = true;
  let time = 0, lastDef = null, lastSc = 0, lastAlpha = 0, lastTick = -1, attract = null;
  let vignette = null, scan = null, scanK = 0, bl0 = null, bl1 = null, bl2 = null, bl3 = null, bloomOn = true;
  const F = { g: null, a: 0, time: 0, dt: 0, sc: 0, ppx: 0, ppy: 0 }, sh = { x: 0, y: 0 };

  // ── 画質 ──
  // 自動画質: フレーム間隔の中央値で判断する。下げるのは 1 秒続けて遅いとき。上げるのは長く余裕が続いたときだけで、
  // 上げた直後にまた下がったら、次に上げるまでの待ち時間を倍にする（行ったり来たりしない）
  const auto = { level: 0, buf: new Float32Array(120), cost: new Float32Array(120), i: 0, n: 0, slow: 0, good: 0, hold: 3, upWait: 20, sinceUp: 1e9, med: 1 / 60, costMed: 0, lastNow: 0 };
  function median(arr, n) { const t = Array.prototype.slice.call(arr, 0, n).sort((a, b) => a - b); return t[n >> 1] || 0; }
  function qualityScale() {
    const q = app.settings.quality;
    if (q === 'big') return Math.min(3, dpr) / dpr;          // 実寸どおり（最大 3 倍の高 DPI まで）
    if (q === 'light') return Math.min(1, 1 / dpr) * 0.75 + 0.25 / dpr;
    if (q === 'quest') return 1;
    if (q === 'manual') return app.settings.renderScale;
    return AUTO_LEVELS[auto.level];
  }
  function autoQuality(now, cost) {
    const dtReal = auto.lastNow ? (now - auto.lastNow) / 1000 : 1 / 60; auto.lastNow = now;
    auto.buf[auto.i] = dtReal; auto.cost[auto.i] = cost; auto.i = (auto.i + 1) % 120; auto.n = Math.min(120, auto.n + 1);
    if (frameNo % 30) return;
    auto.med = median(auto.buf, auto.n); auto.costMed = median(auto.cost, auto.n);
    if (app.settings.quality !== 'auto' || app.screen !== 'play' || auto.n < 60) { auto.slow = auto.good = 0; return; }
    auto.sinceUp += 0.5 * (auto.med * 60); if (auto.hold > 0) { auto.hold -= 0.5; return; }
    if (auto.med > 1 / 52) {
      auto.good = 0;
      if (++auto.slow >= 2 && auto.level < AUTO_LEVELS.length - 1) { if (auto.sinceUp < 12) auto.upWait = Math.min(320, auto.upWait * 2); auto.level++; auto.slow = 0; auto.hold = 3; auto.n = 0; resize(lay); }
    } else {
      auto.slow = 0;
      if (auto.med < 1 / 57 && auto.costMed < 5.5 && auto.level > 0) { auto.good += 0.5; if (auto.good >= auto.upWait) { auto.level--; auto.good = 0; auto.hold = 3; auto.sinceUp = 0; auto.n = 0; resize(lay); } } else auto.good = 0;
    }
  }

  function resize(layout) {
    lay = layout; dpr = window.devicePixelRatio || 1; rs = qualityScale(); S = dpr * rs;
    canvas.width = Math.max(1, Math.round(lay.w * S)); canvas.height = Math.max(1, Math.round(lay.h * S));
    const K = lay.u * S, low = app.settings.quality === 'light';
    bloomOn = !low && !(app.settings.quality === 'auto' && auto.level >= 2);
    if (Math.abs(K - R.K) > 1e-6 || low !== R.low) {
      R.K = K; R.low = low;
      fx.clear(); A.invalidate(); terrain.dropCanvases(); sky.reset();
      R.jobs.cancel((k) => k === 'prewarm'); R.jobs.add('prewarm', A.prewarm());
      bakePost();
    }
    sky.bakeMargin(lay, canvas.width, canvas.height, S); marginDirty = true;
  }
  // 周辺減光（ディザー入り）・走査線・ブルーム用の小さなバッファ
  function bakePost() {
    freeCanvas(vignette); freeCanvas(bl0); freeCanvas(bl1); freeCanvas(bl2); freeCanvas(bl3); freeCanvas(scan); scan = null;
    const vw = 120, vh = 160; vignette = makeCanvas(vw, vh); const vc = vignette.getContext('2d'), img = vc.createImageData(vw, vh), d = img.data; let seed = 99;
    for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) { const dx = (x + 0.5) / vw * 2 - 1, dy = (y + 0.5) / vh * 2 - 1, r = Math.sqrt(dx * dx * 0.9 + dy * dy * 0.8); seed = (seed * 1664525 + 1013904223) >>> 0; d[(y * vw + x) * 4 + 3] = clamp(smooth(0.62, 1.32, r) * 0.5) * 255 + seed / 4294967296 - 0.5; }
    vc.putImageData(img, 0, 0);
    const fw = Math.round(W * R.K), fh = Math.round(H * R.K);
    bl0 = makeCanvas(fw / 2, fh / 2); bl1 = makeCanvas(fw / 4, fh / 4); bl2 = makeCanvas(fw / 8, fh / 8); bl3 = makeCanvas(fw / 16, fh / 16);
  }
  function scanlines() {
    if (scan && scanK === R.K) return scan; freeCanvas(scan); scanK = R.K;
    const hpx = Math.round(H * R.K); scan = makeCanvas(2, hpx); const c = scan.getContext('2d'); c.fillStyle = '#000';
    for (let y = 0; y < H; y++) c.fillRect(0, (y + 0.5) * R.K, 2, Math.max(1, 0.4 * R.K));
    return scan;
  }
  // 光のにじみ: 盤面を 1/2 → 1/4 と縮め、自分自身と 3 回乗算して明るいところだけ残し、さらに縮めてから加算で戻す
  function bloom(c, ox, oy, fw, fh) {
    const b0 = bl0.getContext('2d'), b1 = bl1.getContext('2d'), b2 = bl2.getContext('2d'), b3 = bl3.getContext('2d');
    b0.globalCompositeOperation = 'copy'; b0.drawImage(canvas, ox, oy, fw, fh, 0, 0, bl0.width, bl0.height);
    b1.globalCompositeOperation = 'copy'; b1.drawImage(bl0, 0, 0, bl1.width, bl1.height);
    b1.globalCompositeOperation = 'multiply'; b1.drawImage(bl1, 0, 0); b1.drawImage(bl1, 0, 0); b1.drawImage(bl1, 0, 0);
    b2.globalCompositeOperation = 'copy'; b2.drawImage(bl1, 0, 0, bl2.width, bl2.height);
    b3.globalCompositeOperation = 'copy'; b3.drawImage(bl2, 0, 0, bl3.width, bl3.height);
    b2.globalCompositeOperation = 'source-over'; b2.globalAlpha = 0.5; b2.drawImage(bl3, 0, 0, bl2.width, bl2.height); b2.globalAlpha = 1;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.8; c.imageSmoothingQuality = 'low';
    c.drawImage(bl2, ox, oy, fw, fh); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }

  function onEvents(evs, g) {
    for (const e of evs) {
      if (e.t === 'areaStart') { fx.addFlash(0.4, '220,235,255'); }
      else if (e.t === 'coreMiss') fx.addFlash(0.45, '220,235,255');
      else if (e.t === 'loop') fx.addFlash(0.6, '255,255,255');
    }
    syncArea(g); actors.onEvents(evs, g);
  }
  // エリアが変わった（または新しいゲーム）: 地形・演出・状態を作り直す
  function syncArea(g) {
    if (g.def === lastDef) return;
    lastDef = g.def; terrain.setArea(g); actors.reset(); fx.clear(); lastSc = g.scroll; lastTick = -1;
    sky.ensure(g.area, g.loop);
  }

  // ── 1 フレーム ──
  function frame(alpha, dt) {
    const t0 = performance.now(); frameNo++;
    const c = ctx, playing = app.screen === 'play';
    let g = app.game;
    if (!playing && g) { alpha = lastAlpha; } else lastAlpha = alpha;   // ポーズ中は最後の補間位置のまま止める
    const fdt = g && !playing ? 0 : Math.min(dt, 0.05);                 // ポーズ中は演出も止める
    time += fdt;
    // 重い焼き込みを少しずつ進める（導入中・タイトルでは多めに）
    R.jobs.run(!g || g.phase === 'intro' ? 7 : 3.5);

    let sc, area, loop, warpK = 0;
    if (g) {
      attract = null; syncArea(g);
      const ps = g.pscroll == null || Math.abs(g.scroll - g.pscroll) > 2 ? g.scroll : g.pscroll;
      sc = lerp(ps, g.scroll, alpha); area = g.area; loop = g.loop;
      if (g.tick !== lastTick) { lastTick = g.tick; actors.onTick(g); }
      const pt = g.phaseT + alpha;
      if (g.phase === 'clear') { warpK = smooth(50, 190, pt); if (pt > 60) sky.ensure((g.area + 1) % AREAS.length, g.area + 1 >= AREAS.length ? g.loop + 1 : g.loop); } // 次の空を先に焼く
      else if (g.phase === 'intro') warpK = 1 - smooth(0, 100, pt);
    } else {
      // タイトル: エリアを順に流す（背景として）
      if (!attract || attract.scroll > attract.def.coreWy - 420) { const k = attract ? (attract.area + 3) % AREAS.length : 0; attract = { def: buildArea(k), area: k, loop: 0, scroll: 140, ground: new Map() }; }
      attract.scroll += fdt * TUNING.scroll;
      if (attract.def !== lastDef) { lastDef = attract.def; terrain.setArea(attract); actors.reset(); fx.clear(); lastSc = attract.scroll; }
      sc = attract.scroll; area = attract.area; loop = 0;
    }
    let dsc = sc - lastSc; if (Math.abs(dsc) > 6) dsc = 0; lastSc = sc;
    fx.step(fdt, dsc);
    const th = THEMES[AREAS[area].theme], art = ART[AREAS[area].theme];

    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    const Wp = canvas.width, Hp = canvas.height;
    const ox = lay.fx * S, oy = lay.fy * S, fw = lay.fw * S, fh = lay.fh * S, K = R.K;
    // 盤面の外は数フレームに 1 回だけ描き直す（動く線はゆっくりなので足りる）
    if (marginDirty || (frameNo % 4 === 0 && !R.skip.margin)) { sky.drawMargin(c, lay, Wp, Hp, S, time * 60); marginDirty = false; }

    // 盤面
    fx.shakeOffset(sh, app.settings.shake);
    c.save(); c.beginPath(); c.rect(ox, oy, fw, fh); c.clip();
    R.bx = ox + sh.x * K; R.by = oy + sh.y * K; c.setTransform(K, 0, 0, K, R.bx, R.by);
    F.g = g; F.a = alpha; F.time = time; F.dt = fdt; F.sc = sc;
    if (!R.skip.sky) sky.draw(c, area, loop, sc, time * 60, fdt, warpK);
    terrain.update(sc); if (!R.skip.terrain) { terrain.draw(c, sc); if (!R.skip.emis) terrain.drawEmissive(c, sc, time * 60); }
    drawGroundLights(c, sc);
    fx.emitFalls(terrain.metas, art.fall, sc, fdt);
    if (g) {
      const p = g.player; F.ppx = lerp(p.px, p.x, alpha); F.ppy = lerp(p.py, p.y, alpha);
      actors.drawGround(c, g, F); fx.drawLights(c);
      if (!R.skip.upper) sky.drawUpper(c, sc, time * 60, warpK);
      actors.drawAir(c, g, F); actors.drawPartner(c, g, F); actors.drawShots(c, g, F); actors.drawPlayer(c, g, F, app.settings.hitbox);
    } else { sky.drawUpper(c, sc, time * 60, 0); actors.drawAttractShip(c, F); }
    if (!R.skip.fx) fx.draw(c);
    if (!R.skip.amb) fx.drawAmbient(c, art.amb, time * 60, fdt, dsc);
    c.restore(); c.save(); c.beginPath(); c.rect(ox, oy, fw, fh); c.clip();
    if (bloomOn && !R.skip.bloom) bloom(c, Math.round(ox), Math.round(oy), Math.round(fw), Math.round(fh));
    c.setTransform(K, 0, 0, K, ox, oy);
    if (!R.low && !R.skip.vig) { c.imageSmoothingQuality = 'low'; c.drawImage(vignette, 0, 0, W, H); }
    c.setTransform(K, 0, 0, K, R.bx, R.by);
    if (g) { actors.drawBullets(c, g, F, app.settings.hitbox); c.setTransform(K, 0, 0, K, R.bx, R.by); if (app.settings.hitbox) actors.drawHitboxes(c, g); }
    fx.drawPops(c);
    if (fx.flash > 0.01 && app.settings.flash > 0) { c.fillStyle = `rgba(${fx.flashCol},1)`; c.globalAlpha = Math.min(0.7, fx.flash * app.settings.flash * 0.7); c.fillRect(-10, -10, W + 20, H + 20); c.globalAlpha = 1; }
    if (app.settings.crt > 0) { c.setTransform(K, 0, 0, K, ox, oy); c.globalAlpha = 0.22 * app.settings.crt; c.imageSmoothingEnabled = false; c.drawImage(scanlines(), 0, 0, W, H); c.imageSmoothingEnabled = true; c.globalAlpha = 1; }
    c.restore();
    const cost = performance.now() - t0;
    autoQuality(t0, cost);
    if (app.debug) debugText(c, g);
  }

  // 地面の灯（歯車の残骸の点滅する灯・溶岩の噴気孔）と水面のきらめき
  function drawGroundLights(c, sc) {
    const t = time * 60; let any = false;
    for (const m of terrain.metas) {
      if (!m.lamps.length && !m.glints.length) continue;
      if (!any) { c.globalCompositeOperation = 'lighter'; any = true; }
      for (const l of m.lamps) { const y = sc - l.wy; if (y < -6 || y > H + 6) continue; const k = l.blink ? (Math.sin(t * l.sp + l.ph) > 0.2 ? 1 : 0.12) : 0.55 + 0.45 * Math.sin(t * l.sp + l.ph); A.glow(c, l.col, l.x, y, l.s, k * 0.9); }
      for (const q of m.glints) { const y = sc - q.wy; if (y < -6 || y > H + 6) continue; const k = Math.max(0, Math.sin(t * q.sp + q.ph)) ** 6; if (k > 0.02) A.glow(c, 'white', q.x + Math.sin(t * 0.01 + q.ph) * 2, y, 1.2 + 2.6 * k, k); }
    }
    if (any) { c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
  }

  function debugText(c, g) {
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
    const fs = 12 * S, lines = [`FPS ${(1 / Math.max(1e-3, auto.med)).toFixed(1)}  出力 ${Math.round(lay.w * dpr)}×${Math.round(lay.h * dpr)}  内部 ${canvas.width}×${canvas.height}  倍率 ${rs.toFixed(2)}`,
      `描画 ${auto.costMed.toFixed(1)}ms  焼き ${(mem.px * 4 / 1048576).toFixed(0)}MB  帯 ${terrain.count}  仕事 ${R.jobs.pending}  粒 ${fx.count}  にじみ ${bloomOn ? 'on' : 'off'}`,
      g ? `敵 ${g.enemies.length} 弾 ${g.bullets.length} 地上 ${g.ground.size} scroll ${g.scroll.toFixed(0)}/${g.def.coreWy}` : ''];
    c.fillStyle = '#04060d'; c.fillRect(0, 0, Math.min(lay.fx * S - 4, 46 * fs), (8 + lines.length * 16) * S);
    c.font = `${fs}px monospace`; c.fillStyle = '#9cffd0'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    lines.forEach((l, i) => c.fillText(l, 10 * S, (20 + i * 16) * S));
  }

  return { resize, frame, onEvents, _R: R, _A: A,
    get stats() { return { fps: 1 / Math.max(1e-3, auto.med), w: canvas.width, h: canvas.height, rs, out: [Math.round(lay.w * dpr), Math.round(lay.h * dpr)], cost: auto.costMed, bakedMB: mem.px * 4 / 1048576, strips: terrain.count, jobs: R.jobs.pending, parts: fx.count, bloom: bloomOn, level: auto.level }; } };
}
