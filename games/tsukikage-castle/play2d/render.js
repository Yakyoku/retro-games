// 月影の魔城 — 2D 描画（Canvas 2D）。盤面は常に 16:9（縦 13.5u）で、余白は黒帯＋装飾。HUD とメニューは同じキャンバスに実画素で描く。
// 地形は「タイルの絵」をステージごとに 1 回だけ作り、毎フレームは見えるタイルだけを並べる（4K でも軽い）。
import { T as TT } from '../shared/stages.js';
import { QUALITY } from '../shared/config.js';
import { UI } from '../shared/ui.js';
import { drawKnight, drawShot, drawBurn, drawEnemy, drawEShot, drawItem, drawBoss, fireBlob, PAL } from './art.js';

const TAU = Math.PI * 2;
const VW = 24, VH = 13.5;
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
const lin = (ctx, x0, y0, x1, y1, stops) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c)); return g; };

export const THEMES = {
  graveyard: { sky: ['#070b24', '#17214f', '#3b3f72'], moon: [0.78, 0.2, 1.0], far: '#1a1f3f', mid: '#10142c', fog: 'rgba(150,170,220,0.10)',
    rock: ['#4a3b30', '#33281f', '#211913'], top: ['#3a5a48', '#24392e'], plat: ['#6a5034', '#3e2c1c'], tint: 'rgba(40,60,140,0.16)' },
  village: { sky: ['#140a24', '#3a1d48', '#7a3e52'], moon: [0.2, 0.24, 0.8], far: '#261632', mid: '#1a0f22', fog: 'rgba(220,150,170,0.07)',
    rock: ['#5a4c44', '#3c322c', '#26201c'], top: ['#6a5a4a', '#4a3e34'], plat: ['#7a5a3a', '#4a3420'], tint: 'rgba(90,40,90,0.14)' },
  cave: { sky: ['#03070e', '#0a1824', '#10283a'], moon: null, far: '#0c1a26', mid: '#08121c', fog: 'rgba(90,170,200,0.08)',
    rock: ['#41505e', '#2b3642', '#1a222c'], top: ['#55707a', '#3a4c56'], plat: ['#4a5a68', '#2a3642'], tint: 'rgba(20,80,110,0.18)' },
  tower: { sky: ['#0a0818', '#1c1834', '#2e2648'], moon: [0.5, 0.15, 0.7], far: '#1c1830', mid: '#141022', fog: 'rgba(170,150,220,0.06)',
    rock: ['#5c5868', '#3e3a4a', '#26232e'], top: ['#77728a', '#4c485a'], plat: ['#6a5034', '#3e2c1c'], tint: 'rgba(60,40,120,0.14)' },
  fortress: { sky: ['#1a0604', '#4a140a', '#8a3414'], moon: [0.85, 0.22, 0.9], far: '#2a0e0a', mid: '#1c0806', fog: 'rgba(255,120,60,0.08)',
    rock: ['#5a3430', '#3c2220', '#241412'], top: ['#7a4a3a', '#4a2a22'], plat: ['#5a4038', '#36241e'], tint: 'rgba(140,40,10,0.14)' },
  citadel: { sky: ['#06020e', '#1a0a2e', '#3a1446'], moon: [0.5, 0.18, 1.2], far: '#1a0c28', mid: '#10071a', fog: 'rgba(200,120,255,0.07)',
    rock: ['#3a3048', '#241e30', '#16121e'], top: ['#5a4a70', '#3a2e4a'], plat: ['#4a3a5a', '#2a2036'], tint: 'rgba(80,20,120,0.16)' },
};

export class Renderer2D {
  constructor(canvas, app) {
    this.cv = canvas; this.ctx = canvas.getContext('2d', { alpha: false }); this.app = app; this.ui = new UI();
    this.parts = []; this.shake = 0; this.time = 0; this.quality = app.save.quality; this.reserve = { bottom: 0, right: 0 };
    this.fps = 60; this.frameMs = []; this.tiles = null; this.def = null;
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  setQuality(q) { this.quality = q; this.resize(); }
  resize() {
    const dpr = window.devicePixelRatio || 1, cw = Math.max(1, this.cv.clientWidth), ch = Math.max(1, this.cv.clientHeight);
    let q = this.quality === 'auto' ? this.autoQ || 'ultra' : this.quality;
    const Q = QUALITY[q] || QUALITY.ultra;
    let scale = dpr * Q.scale;
    if (cw * ch * scale * scale > Q.maxPixels) scale = Math.sqrt(Q.maxPixels / (cw * ch));
    const W = Math.round(cw * scale), H = Math.round(ch * scale);
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    this.W = W; this.H = H; this.pxScale = scale;
    // 16:9 の盤面
    let fw = W, fh = (W * 9) / 16; if (fh > H) { fh = H; fw = (H * 16) / 9; }
    this.field = { x: Math.round((W - fw) / 2), y: Math.round((H - fh) / 2), w: Math.round(fw), h: Math.round(fh) };
    this.T = this.field.h / VH;
    this.info = { css: `${cw}×${ch}`, dpr, internal: `${W}×${H}`, field: `${this.field.w}×${this.field.h}`, tilePx: this.T.toFixed(1), quality: q };
    if (this.def) this.buildStage(this.def);
  }
  setStage(g) { if (this.def !== g.def || !this.tiles) { this.def = g.def; this.buildStage(g.def); } this.parts = []; }
  // ---------------------------------------------------------------- ステージの準備（タイルの絵・背景）
  buildStage(def) {
    const th = THEMES[def.theme], T = Math.ceil(this.T);
    this.th = th;
    const mk = (fn) => { const c = document.createElement('canvas'); c.width = c.height = T; const x = c.getContext('2d'); x.scale(T, T); fn(x); return c; };
    const r = rng(def.id * 977);
    const solid = (top) => (x) => {
      x.fillStyle = lin(x, 0, 0, 0, 1, [th.rock[0], th.rock[1]]); x.fillRect(0, 0, 1, 1);
      // 石積み（テーマごとに形を変える）
      const brick = def.theme === 'tower' || def.theme === 'fortress' || def.theme === 'citadel' || def.theme === 'village';
      x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 0.04;
      if (brick) { x.beginPath(); x.moveTo(0, 0.5); x.lineTo(1, 0.5); x.moveTo(0.5 + (r() - 0.5) * 0.1, 0); x.lineTo(0.5, 0.5); x.moveTo(0.15, 0.5); x.lineTo(0.15, 1); x.stroke(); x.strokeStyle = 'rgba(255,255,255,0.09)'; x.beginPath(); x.moveTo(0.02, 0.54); x.lineTo(0.98, 0.54); x.stroke(); }
      else for (let i = 0; i < 5; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + r() * 0.08})`; x.beginPath(); x.ellipse(r(), r(), 0.08 + r() * 0.14, 0.05 + r() * 0.08, r() * 3, 0, TAU); x.fill(); }
      if (def.theme === 'citadel') { x.fillStyle = 'rgba(216,178,90,0.25)'; x.fillRect(0, 0.96, 1, 0.04); }
      if (top) {
        x.fillStyle = lin(x, 0, 0, 0, 0.28, [th.top[0], th.top[1]]); x.fillRect(0, 0, 1, 0.24);
        x.fillStyle = 'rgba(200,220,255,0.28)'; x.fillRect(0, 0, 1, 0.035); // 月光の縁
        if (def.theme === 'graveyard') for (let i = 0; i < 6; i++) { x.fillStyle = r() < 0.5 ? '#2a4a38' : '#4a6a52'; const gx = r(); x.beginPath(); x.moveTo(gx - 0.04, 0.02); x.lineTo(gx, -0.12 - r() * 0.1); x.lineTo(gx + 0.04, 0.02); x.fill(); }
      }
    };
    this.tiles = {
      top: [0, 1, 2].map(() => mk(solid(true))), mid: [0, 1, 2].map(() => mk(solid(false))),
      plat: mk((x) => {
        x.fillStyle = lin(x, 0, 0, 0, 0.35, th.plat); x.fillRect(0, 0, 1, 0.32);
        x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 0.04; x.strokeRect(0.02, 0.02, 0.96, 0.28);
        x.fillStyle = 'rgba(255,240,220,0.18)'; x.fillRect(0, 0, 1, 0.04);
        x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0.1, 0.32, 0.08, 0.2); x.fillRect(0.82, 0.32, 0.08, 0.2);
      }),
      ladder: mk((x) => {
        x.fillStyle = '#6a4a2a'; x.fillRect(0.14, 0, 0.12, 1); x.fillRect(0.74, 0, 0.12, 1);
        x.fillStyle = '#8a6a40'; for (const y of [0.2, 0.7]) x.fillRect(0.14, y, 0.72, 0.09);
        x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(0.14, 0, 0.03, 1); x.fillRect(0.74, 0, 0.03, 1);
      }),
    };
    this.bg = this.buildBackground(def);
    // 墓石など、飾りの絵が地形の代わりになるタイル（地形の四角を描かない）
    this.skip = new Set();
    for (const d of def.deco || []) if (d.type === 'grave') for (let k = 0; k < (d.h || 1); k++) this.skip.add((d.y + k) * def.W + d.x);
  }
  buildBackground(def) {
    // 遠景・中景を「横に繰り返せる」1 枚ずつのキャンバスに焼く（高さは盤面の 1.6 倍で縦スクロールにも対応）
    const th = this.th, fw = this.field.w, fh = this.field.h;
    const W = Math.round(fw * 1.5), H = Math.round(fh * 1.6);
    const layer = (fn) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); fn(x, W, H); return c; };
    const r = rng(def.id * 131 + 7);
    const far = layer((x, W, H) => {
      x.fillStyle = th.far;
      const base = H * 0.72;
      x.beginPath(); x.moveTo(0, H);
      for (let i = 0; i <= 24; i++) { const px = (i / 24) * W; x.lineTo(px, base - (Math.sin(i * 0.9 + def.id) * 0.5 + 0.5) * H * 0.12 - (i % 5 === 2 ? H * 0.05 : 0)); }
      x.lineTo(W, H); x.closePath(); x.fill();
      // 遠くの魔城（どのステージからも見える目標）
      if (def.theme !== 'cave' && def.theme !== 'tower') {
        const cx = W * 0.68, cy = base - H * 0.1, s = H * 0.24;
        x.fillStyle = th.far;
        for (const [dx, w, h] of [[-0.35, 0.12, 0.7], [-0.15, 0.1, 1.0], [0, 0.16, 1.25], [0.18, 0.1, 0.85], [0.33, 0.12, 0.6]]) {
          x.fillRect(cx + dx * s - (w * s) / 2, cy - h * s, w * s, h * s + H * 0.1);
          x.beginPath(); x.moveTo(cx + dx * s - (w * s) / 2 - s * 0.02, cy - h * s); x.lineTo(cx + dx * s, cy - h * s - s * 0.25); x.lineTo(cx + dx * s + (w * s) / 2 + s * 0.02, cy - h * s); x.fill();
        }
        x.fillStyle = 'rgba(255,200,120,0.55)'; for (let i = 0; i < 9; i++) x.fillRect(cx + (r() - 0.5) * s * 0.7, cy - r() * s * 0.9, s * 0.012, s * 0.03);
      }
      if (def.theme === 'cave') { x.fillStyle = 'rgba(90,200,255,0.25)'; for (let i = 0; i < 30; i++) { const px = r() * W, py = H * (0.3 + r() * 0.5); x.beginPath(); x.moveTo(px, py); x.lineTo(px + 6, py - 18); x.lineTo(px + 12, py); x.fill(); } }
    });
    const mid = layer((x, W, H) => {
      x.fillStyle = th.mid;
      const base = H * 0.86, U = fh / VH;
      const t = def.theme;
      const wrap = (fn) => { for (const off of [-W, 0, W]) { x.save(); x.translate(off, 0); fn(); x.restore(); } };
      wrap(() => {
        const rr = rng(def.id * 53);
        if (t === 'graveyard') {
          for (let i = 0; i < 9; i++) { const px = rr() * W, h = U * (3 + rr() * 3); deadTree(x, px, base, h, rr); }
          for (let i = 0; i < 26; i++) { const px = rr() * W, h = U * (0.6 + rr() * 0.6); if (rr() < 0.5) { x.fillRect(px, base - h, U * 0.12, h); x.fillRect(px - U * 0.25, base - h * 0.75, U * 0.62, U * 0.12); } else { x.beginPath(); x.moveTo(px, base); x.lineTo(px, base - h); x.arc(px + U * 0.3, base - h, U * 0.3, Math.PI, 0); x.lineTo(px + U * 0.6, base); x.fill(); } }
        } else if (t === 'village') {
          for (let i = 0; i < 8; i++) { const px = rr() * W, w = U * (3 + rr() * 3), h = U * (3 + rr() * 3); x.fillRect(px, base - h, w, h); x.beginPath(); x.moveTo(px - U * 0.4, base - h); x.lineTo(px + w * 0.5, base - h - U * (1.5 + rr())); x.lineTo(px + w + U * 0.4, base - h); x.fill(); x.fillStyle = 'rgba(255,180,90,0.35)'; if (rr() < 0.6) x.fillRect(px + w * 0.3, base - h * 0.6, U * 0.4, U * 0.5); x.fillStyle = th.mid; }
        } else if (t === 'cave') {
          for (let i = 0; i < 16; i++) { const px = rr() * W, h = U * (2 + rr() * 5); x.beginPath(); x.moveTo(px - U, base); x.lineTo(px, base - h); x.lineTo(px + U, base); x.fill(); x.beginPath(); x.moveTo(px - U * 0.7, 0); x.lineTo(px + U * 0.3, h * 0.8); x.lineTo(px + U, 0); x.fill(); }
        } else if (t === 'tower') {
          x.fillStyle = '#1a1628'; x.fillRect(0, 0, W, H);
          x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 2; for (let yy = 0; yy < H; yy += U * 0.8) { x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke(); }
          for (let i = 0; i < 6; i++) { const px = (i + 0.5) * (W / 6), py = H * (0.15 + (i % 3) * 0.28); x.fillStyle = '#2e3870'; x.beginPath(); x.moveTo(px - U * 0.6, py + U * 1.6); x.lineTo(px - U * 0.6, py); x.arc(px, py, U * 0.6, Math.PI, 0); x.lineTo(px + U * 0.6, py + U * 1.6); x.fill(); x.fillStyle = 'rgba(200,220,255,0.6)'; x.beginPath(); x.arc(px + U * 0.15, py + U * 0.2, U * 0.18, 0, TAU); x.fill(); }
        } else if (t === 'fortress') {
          for (let i = 0; i < 7; i++) { const px = rr() * W, w = U * (3 + rr() * 4), h = U * (4 + rr() * 4); x.fillRect(px, base - h, w, h); for (let k = 0; k < w / U; k += 1) x.fillRect(px + k * U, base - h - U * 0.6, U * 0.55, U * 0.6); x.fillStyle = 'rgba(255,120,40,0.4)'; x.fillRect(px + w * 0.4, base - h * 0.5, U * 0.3, U * 0.6); x.fillStyle = th.mid; }
        } else if (t === 'citadel') {
          for (let i = 0; i < 7; i++) { const px = (i / 7) * W, w = U * 1.4, h = H * 0.8; x.fillRect(px, base - h, w, h); x.beginPath(); x.arc(px + W / 14 + w / 2, base - h, W / 14, Math.PI, 0); x.lineWidth = U * 0.6; x.strokeStyle = th.mid; x.stroke(); }
          x.fillStyle = 'rgba(200,120,255,0.25)'; for (let i = 0; i < 14; i++) x.fillRect(rr() * W, base - rr() * H * 0.6, U * 0.08, U * 0.3);
        }
      });
    });
    return { far, mid, W, H };
  }

  // ---------------------------------------------------------------- 毎フレーム
  render(g, alpha, dt) {
    const t0 = performance.now();
    this.time += dt;
    const ctx = this.ctx, F = this.field;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05050a'; ctx.fillRect(0, 0, this.W, this.H);
    if (!g || !this.def) { this.drawTitleBack(ctx); }
    else {
      const cx = g.pcam.x + (g.cam.x - g.pcam.x) * alpha, cy = g.pcam.y + (g.cam.y - g.pcam.y) * alpha;
      this.shake = Math.max(0, this.shake - dt);
      const sh = this.shake > 0 ? this.shake * 0.5 : 0;
      const T = this.T;
      ctx.save(); ctx.beginPath(); ctx.rect(F.x, F.y, F.w, F.h); ctx.clip();
      this.drawSky(ctx, cx, cy);
      const ox = Math.round(F.x + F.w / 2 - cx * T + Math.sin(this.time * 70) * sh * T * 0.3), oy = Math.round(F.y + F.h / 2 + cy * T + Math.cos(this.time * 63) * sh * T * 0.3);
      this.view = { ox, oy, T, x0: cx - VW / 2 - 1, x1: cx + VW / 2 + 1, y0: cy - VH / 2 - 1, y1: cy + VH / 2 + 1 };
      this.drawWorld(ctx, g, alpha);
      ctx.restore();
      // 盤面の外（黒帯）: 細い金の線
      ctx.strokeStyle = 'rgba(243,200,106,0.25)'; ctx.lineWidth = Math.max(1, this.T * 0.02); ctx.strokeRect(F.x + 0.5, F.y + 0.5, F.w - 1, F.h - 1);
    }
    // HUD・メニュー（盤面の範囲に描く。タッチ操作の範囲は避ける）
    const rect = this.app.screen === 'play' || this.app.screen === 'paused' || this.app.screen === 'gameover' ? F : { x: 0, y: 0, w: this.W, h: this.H };
    this.ui.draw(ctx, this.app, rect, { reserveBottom: this.reserve.bottom * this.pxScale, reserveRight: 0, debugText: this.debugText(g) });
    const ms = performance.now() - t0;
    this.frameMs.push(ms); if (this.frameMs.length > 120) this.frameMs.shift();
  }
  debugText(g) {
    if (!this.app.debug) return '';
    const avg = this.frameMs.reduce((a, b) => a + b, 0) / (this.frameMs.length || 1);
    return `FPS ${this.fps.toFixed(0)}  描画 ${avg.toFixed(1)}ms\n画面 ${this.info.css}(css) dpr ${this.info.dpr} → 内部 ${this.info.internal}  盤面 ${this.info.field}  1u=${this.info.tilePx}px  ${this.info.quality}` +
      (g ? `\n敵 ${g.enemies.length} 弾 ${g.eshots.length} 粒子 ${this.parts.length} x ${g.player.x.toFixed(2)} y ${g.player.y.toFixed(2)} ${g.player.state}` : '');
  }
  // 空（グラデーション・月・暈）と、手前の霧・夜の色味・周辺減光は、盤面の大きさの絵に 1 回だけ焼く（毎フレームの全画面塗りを減らす）
  bakeSky() {
    const F = this.field, th = this.th, c = document.createElement('canvas'); c.width = F.w; c.height = F.h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = lin(ctx, 0, 0, 0, F.h, th.sky); ctx.fillRect(0, 0, F.w, F.h);
    if (th.moon) {
      const [mx, my, ms] = th.moon, R = F.h * 0.09 * ms, x = F.w * mx, y = F.h * my;
      const halo = ctx.createRadialGradient(x, y, R * 0.8, x, y, R * 4); halo.addColorStop(0, 'rgba(200,220,255,0.35)'); halo.addColorStop(1, 'rgba(200,220,255,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, R * 4, 0, TAU); ctx.fill();
      const mg = ctx.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.1, x, y, R); mg.addColorStop(0, '#fffdf2'); mg.addColorStop(1, this.def.theme === 'fortress' ? '#ff9a6a' : '#c8d4f0');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(120,130,170,0.25)'; for (const [a, b, r] of [[0.3, -0.2, 0.2], [-0.35, 0.25, 0.14], [0.1, 0.4, 0.1]]) { ctx.beginPath(); ctx.arc(x + a * R, y + b * R, r * R, 0, TAU); ctx.fill(); }
    }
    this.skyImg = c;
    const o = document.createElement('canvas'); o.width = F.w; o.height = F.h; const x = o.getContext('2d');
    const fg = x.createLinearGradient(0, F.h * 0.45, 0, F.h); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, th.fog);
    x.fillStyle = fg; x.fillRect(0, F.h * 0.45, F.w, F.h * 0.55);
    this.fogImg = o;
    const v = document.createElement('canvas'); v.width = F.w; v.height = F.h; const y2 = v.getContext('2d');
    y2.fillStyle = th.tint; y2.fillRect(0, 0, F.w, F.h);
    const vg = y2.createRadialGradient(F.w / 2, F.h / 2, F.h * 0.45, F.w / 2, F.h / 2, F.w * 0.65); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,10,0.5)');
    y2.fillStyle = vg; y2.fillRect(0, 0, F.w, F.h);
    this.tintImg = v;
  }
  drawSky(ctx, cx, cy) {
    const F = this.field, th = this.th, bg = this.bg;
    if (!this.skyImg || this.skyImg.width !== F.w || this.skyTheme !== th) { this.bakeSky(); this.skyTheme = th; }
    ctx.drawImage(this.skyImg, F.x, F.y);
    // 雲（ゆっくり流れる）
    ctx.fillStyle = 'rgba(160,170,210,0.07)';
    for (let i = 0; i < 5; i++) { const w = F.w * 0.4, x = F.x + ((((i * 0.31 + this.time * 0.004 - cx * 0.002) % 1) + 1) % 1) * (F.w + w) - w, y = F.y + F.h * (0.12 + i * 0.07); ctx.beginPath(); ctx.ellipse(x + w / 2, y, w / 2, F.h * 0.02, 0, 0, TAU); ctx.fill(); }
    const T = this.T, vert = this.def.vertical;
    const par = (img, k, ky) => {
      const off = ((-(cx * T * k) % bg.W) + bg.W) % bg.W;
      const yy = F.y + F.h - bg.H + (vert ? ((cy * T * ky) % (bg.H * 0.375)) : (cy - VH / 2) * T * ky) + bg.H * 0.32;
      for (let x = F.x + off - bg.W; x < F.x + F.w; x += bg.W) ctx.drawImage(img, Math.round(x), Math.round(yy));
    };
    par(bg.far, 0.12, 0.05); par(bg.mid, 0.35, vert ? 0.35 : 0.15);
    ctx.drawImage(this.fogImg, F.x, F.y);
  }
  // ワールド座標（u）→ 画面の変換を設定。face で左右反転
  at(ctx, x, y, face = 1, s = 1) { const v = this.view; ctx.setTransform(v.T * face * s, 0, 0, -v.T * s, v.ox + x * v.T, v.oy - y * v.T); }
  drawWorld(ctx, g, alpha) {
    const v = this.view, def = g.def, time = this.time;
    const lerpP = (o) => [o.px + (o.x - o.px) * alpha, o.py + (o.y - o.py) * alpha];
    // 背景側の飾り（地下墓所の壁・塔の柱など）
    for (const d of def.deco) if (d.x + (d.w || 3) > v.x0 - 3 && d.x < v.x1 + 3) this.decoBack(ctx, d, g);
    this.drawTiles(ctx, g);
    this.drawLiquids(ctx, g);
    for (const d of def.deco) if (d.x + (d.w || 3) > v.x0 - 3 && d.x < v.x1 + 3) this.decoFront(ctx, d, g);
    // 移動床
    for (const m of g.movers) { const x = m.pcx + (m.cx - m.pcx) * alpha, y = m.pcy + (m.cy - m.pcy) * alpha; this.at(ctx, x, y); this.moverArt(ctx, m); }
    // 炎の柱
    for (const j of g.jets) this.jetArt(ctx, j, time);
    // アイテム
    for (const it of g.items) { this.at(ctx, it.x, it.y); drawItem(ctx, it, time); }
    // 燃える火
    for (const f of g.burns) { this.at(ctx, f.x, f.y); drawBurn(ctx, f, time); }
    // 敵
    for (const e of g.enemies) {
      const [x, y] = lerpP(e);
      if (e.type === 'hopper' && e.st === 'hop' && e.landX != null) { this.at(ctx, e.landX, Math.round(e.home ? e.home.y : y)); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0.02, 0.5, 0.1, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(255,120,80,0.6)'; ctx.lineWidth = 0.03; ctx.stroke(); }
      this.at(ctx, x, y, e.face || 1); drawEnemy(ctx, e, time);
    }
    // ボス
    const b = g.boss;
    if (b) {
      if (b.type === 'riverbeast' && b.st === 'ripple') { this.at(ctx, b.wx, 2); for (let i = 0; i < 3; i++) { const k = ((time * 1.5 + i / 3) % 1); ctx.strokeStyle = `rgba(200,240,255,${1 - k})`; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.ellipse(0, 0, 0.3 + k * 1.2, 0.08 + k * 0.2, 0, 0, TAU); ctx.stroke(); } for (let i = 0; i < 5; i++) { const k = (time * 2 + i * 0.2) % 1; ctx.fillStyle = 'rgba(220,250,255,0.8)'; ctx.beginPath(); ctx.arc((i - 2) * 0.3, k * 1.2, 0.06 * (1 - k) + 0.02, 0, TAU); ctx.fill(); } }
      const [x, y] = lerpP(b); this.at(ctx, x, y, b.face || -1); drawBoss(ctx, b, time);
    }
    // プレイヤー
    const p = g.player;
    if (!(p.inv > 0 && g.mode === 'play' && Math.floor(time * 20) % 2 === 0)) {
      const [x, y] = lerpP(p);
      this.at(ctx, x, y, p.face); drawKnight(ctx, p, time, { weapon: g.weapon });
    }
    // 弾
    for (const s of g.shots) { const [x, y] = lerpP(s); this.at(ctx, x, y, s.face); drawShot(ctx, s, time); }
    for (const s of g.eshots) { const [x, y] = lerpP(s); this.at(ctx, x, y, s.kind === 'beam' || s.kind === 'wave' ? 1 : 1); drawEShot(ctx, s, time); }
    // 粒子と得点
    this.drawParticles(ctx, alpha);
    for (const f of g.fx) if (f.kind === 'score') { this.at(ctx, f.x, f.y + (0.9 - f.t) * 0.8); ctx.scale(1, -1); ctx.globalAlpha = Math.min(1, f.t * 3); ctx.font = '700 0.42px ui-monospace,Consolas,monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#000'; ctx.fillText(f.n, 0.03, 0.03); ctx.fillStyle = '#ffe9a0'; ctx.fillText(f.n, 0, 0); ctx.globalAlpha = 1; }
    else if (f.kind === 'shake') this.shake = Math.max(this.shake, f.t);
    // 夜の色味と周辺減光
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const F = this.field;
    ctx.drawImage(this.tintImg, F.x, F.y);
    if (g.mode === 'dying' && g.player.deadT > 0.5) { ctx.fillStyle = `rgba(0,0,0,${Math.min(0.6, (g.player.deadT - 0.5) * 1.2)})`; ctx.fillRect(F.x, F.y, F.w, F.h); }
  }
  drawTiles(ctx, g) {
    const v = this.view, def = g.def, W = def.W, Tp = v.T, tl = this.tiles;
    const x0 = Math.max(0, Math.floor(v.x0)), x1 = Math.min(W - 1, Math.ceil(v.x1)), y0 = Math.max(0, Math.floor(v.y0)), y1 = Math.min(def.H - 1, Math.ceil(v.y1));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sz = Math.ceil(Tp) + 1;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const t = g.tiles[ty * W + tx];
      if (!t || this.skip.has(ty * W + tx)) continue;
      const sx = Math.floor(v.ox + tx * Tp), sy = Math.floor(v.oy - (ty + 1) * Tp);
      if (t === TT.SOLID) {
        const above = ty + 1 < def.H ? g.tiles[(ty + 1) * W + tx] : 0;
        const vi = (tx * 7 + ty * 13) % 3;
        ctx.drawImage(above === TT.SOLID ? tl.mid[vi] : tl.top[vi], sx, sy, sz, sz);
        // 横の縁（空いている側を暗く）
        if (tx > 0 && g.tiles[ty * W + tx - 1] !== TT.SOLID) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(sx, sy, Tp * 0.08, sz); }
        if (tx < W - 1 && g.tiles[ty * W + tx + 1] !== TT.SOLID) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(sx + Tp * 0.92, sy, Tp * 0.08 + 1, sz); }
      } else if (t === TT.PLAT) ctx.drawImage(tl.plat, sx, sy, sz, sz);
      else if (t === TT.LADDER) ctx.drawImage(tl.ladder, sx, sy, sz, sz);
    }
  }
  drawLiquids(ctx, g) {
    const v = this.view, time = this.time;
    for (const d of g.def.deco) {
      if (d.type !== 'lava' && d.type !== 'water') continue;
      if (d.x + d.w < v.x0 || d.x > v.x1) continue;
      const surf = d.type === 'water' ? 2 : d.y;
      this.at(ctx, d.x, 0);
      if (d.type === 'water') {
        ctx.fillStyle = lin(ctx, 0, surf, 0, -1, ['rgba(40,120,150,0.9)', 'rgba(5,20,40,1)']); ctx.fillRect(0, -1.5, d.w, surf + 1.5);
        ctx.strokeStyle = 'rgba(190,240,255,0.7)'; ctx.lineWidth = 0.05; ctx.beginPath();
        for (let x = 0; x <= d.w; x += 0.25) ctx.lineTo(x, surf - 0.05 + Math.sin(x * 3 + time * 3) * 0.05);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; for (let i = 0; i < d.w; i++) ctx.fillRect(i + ((time * 0.6 + i * 0.37) % 1) * 0.7, surf - 0.25, 0.3, 0.03);
      } else {
        ctx.fillStyle = lin(ctx, 0, surf, 0, -1, ['#ffcf4a', '#ff5a1a', '#7a1004']); ctx.fillRect(0, -1.5, d.w, surf + 1.5);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const gl = ctx.createLinearGradient(0, surf, 0, surf + 2.5); gl.addColorStop(0, 'rgba(255,120,30,0.45)'); gl.addColorStop(1, 'rgba(255,60,10,0)');
        ctx.fillStyle = gl; ctx.fillRect(0, surf, d.w, 2.5);
        for (let i = 0; i < d.w * 1.5; i++) { const k = (time * 0.7 + i * 0.61) % 1; ctx.fillStyle = `rgba(255,240,180,${1 - k})`; ctx.beginPath(); ctx.arc((i * 0.67) % d.w, surf - 0.1 + k * 0.4, 0.08 * (1 - k) + 0.03, 0, TAU); ctx.fill(); }
        ctx.restore();
        ctx.strokeStyle = '#fff2a0'; ctx.lineWidth = 0.05; ctx.beginPath(); for (let x = 0; x <= d.w; x += 0.25) ctx.lineTo(x, surf - 0.04 + Math.sin(x * 2.3 + time * 2) * 0.05); ctx.stroke();
      }
    }
  }
  decoBack(ctx, d, g) {
    const th = this.th;
    this.at(ctx, d.x, d.y);
    if (d.type === 'catacomb') {
      ctx.fillStyle = 'rgba(20,16,22,0.92)'; ctx.fillRect(0, 0, d.w, d.h);
      for (let x = 1; x < d.w; x += 3) { ctx.fillStyle = '#0a080c'; ctx.beginPath(); ctx.moveTo(x, 1.4); ctx.lineTo(x, 2.6); ctx.arc(x + 0.6, 2.6, 0.6, Math.PI, 0, true); ctx.lineTo(x + 1.2, 1.4); ctx.fill(); ctx.fillStyle = 'rgba(230,220,190,0.55)'; ctx.beginPath(); ctx.arc(x + 0.6, 1.75, 0.2, 0, TAU); ctx.fill(); ctx.fillStyle = '#0a080c'; ctx.fillRect(x + 0.48, 1.7, 0.09, 0.08); ctx.fillRect(x + 0.63, 1.7, 0.09, 0.08); }
      for (let x = 2; x < d.w; x += 9) { const fl = 0.8 + 0.2 * Math.sin(this.time * 9 + x); fireBlob(ctx, x, 3.3, 0.12 * fl, this.time, 0.9); ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x - 0.05, 2.9, 0.1, 0.35); }
    } else if (d.type === 'house') {
      ctx.fillStyle = 'rgba(40,30,36,0.95)'; ctx.fillRect(0, 0, d.w, d.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.05; for (let y = 0.6; y < d.h; y += 0.6) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(d.w, y); ctx.stroke(); }
      ctx.fillStyle = '#20141a'; ctx.beginPath(); ctx.moveTo(-0.6, d.h); ctx.lineTo(d.w / 2, d.h + 2.4); ctx.lineTo(d.w + 0.6, d.h); ctx.fill();
      if (d.broken) { ctx.fillStyle = this.th.sky[1]; ctx.beginPath(); ctx.moveTo(d.w * 0.55, d.h + 1.8); ctx.lineTo(d.w * 0.7, d.h + 0.4); ctx.lineTo(d.w * 0.9, d.h + 0.9); ctx.lineTo(d.w * 0.8, d.h + 1.6); ctx.fill(); }
      for (let i = 1; i < d.w - 1; i += 3) { ctx.fillStyle = 'rgba(255,190,100,0.55)'; ctx.fillRect(i, 1.2, 0.8, 1.0); ctx.fillStyle = '#20141a'; ctx.fillRect(i + 0.37, 1.2, 0.06, 1.0); }
    } else if (d.type === 'crypt') {
      ctx.fillStyle = lin(ctx, 0, d.h, 0, 0, ['#6a6470', '#3a3640']); ctx.fillRect(0, 0, d.w, d.h);
      ctx.fillStyle = '#16121a'; ctx.beginPath(); ctx.moveTo(1.6, 0); ctx.lineTo(1.6, 1.8); ctx.arc(2.5, 1.8, 0.9, Math.PI, 0, true); ctx.lineTo(3.4, 0); ctx.fill();
      ctx.fillStyle = '#8a8490'; ctx.fillRect(-0.2, d.h - 0.3, d.w + 0.4, 0.3);
      ctx.fillStyle = '#4a4650'; ctx.beginPath(); ctx.moveTo(2.2, d.h); ctx.lineTo(2.5, d.h + 0.9); ctx.lineTo(2.8, d.h); ctx.fill(); ctx.fillRect(2.45, d.h, 0.1, 1.1); ctx.fillRect(2.2, d.h + 0.65, 0.6, 0.1);
    } else if (d.type === 'battlement' || d.type === 'pillars') {
      // 盤面の奥の壁（数 u ごと）
      const v = this.view, x0 = Math.floor((v.x0 - d.x) / 6) * 6;
      for (let x = Math.max(0, x0); x < Math.min(d.w, v.x1 - d.x + 6); x += 6) {
        if (d.type === 'battlement') { ctx.fillStyle = 'rgba(30,10,8,0.85)'; ctx.fillRect(x, 0, 4, 6); for (let k = 0; k < 4; k += 1.4) ctx.fillRect(x + k, 6, 0.8, 0.7); ctx.fillStyle = 'rgba(255,140,50,0.35)'; ctx.fillRect(x + 1.7, 3, 0.5, 1); }
        else { ctx.fillStyle = 'rgba(24,14,34,0.9)'; ctx.fillRect(x + 1, 0, 1.2, 12); ctx.fillStyle = 'rgba(216,178,90,0.25)'; ctx.fillRect(x + 0.9, 11.6, 1.4, 0.3); ctx.fillRect(x + 0.9, 0, 1.4, 0.3); }
      }
    } else if (d.type === 'stalactites') {
      const v = this.view;
      for (let x = Math.max(0, Math.floor(v.x0 - d.x)); x < Math.min(d.w, v.x1 - d.x); x++) { const h = 0.4 + ((x * 37) % 7) / 7; ctx.fillStyle = th.rock[1]; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 0.5, -h); ctx.lineTo(x + 1, 0); ctx.fill(); }
    } else if (d.type === 'tree') {
      ctx.fillStyle = '#120e14';
      const s = d.s || 1;
      deadTreeU(ctx, 0, 0, 4 * s, rng(d.x * 31 + 5));
    } else if (d.type === 'fence') {
      ctx.fillStyle = '#16121a'; for (let x = 0; x < d.w; x += 0.5) { ctx.fillRect(x, 0, 0.08, 1.1); ctx.beginPath(); ctx.moveTo(x - 0.06, 1.1); ctx.lineTo(x + 0.04, 1.3); ctx.lineTo(x + 0.14, 1.1); ctx.fill(); } ctx.fillRect(0, 0.75, d.w, 0.07); ctx.fillRect(0, 0.3, d.w, 0.07);
    } else if (d.type === 'well') {
      ctx.fillStyle = '#4a4040'; ctx.fillRect(-0.3, 0, 0.3, 1); ctx.fillRect(d.w, 0, 0.3, 1); ctx.fillStyle = '#2a2020'; ctx.fillRect(-0.1, 1, 0.12, 1.6); ctx.fillRect(d.w, 1, 0.12, 1.6); ctx.fillRect(-0.4, 2.6, d.w + 0.8, 0.2);
    }
  }
  decoFront(ctx, d, g) {
    this.at(ctx, d.x, d.y);
    if (d.type === 'grave') {
      const h = d.h || 1, v = d.v;
      ctx.fillStyle = lin(ctx, 0, h, 0, 0, ['#a8a4b4', '#5a5666']);
      ctx.beginPath();
      if (v === 0) { ctx.moveTo(0.08, 0); ctx.lineTo(0.08, h * 0.75); ctx.arc(0.5, h * 0.75, 0.42, Math.PI, 0, true); ctx.lineTo(0.92, 0); }
      else if (v === 1) { ctx.rect(0.4, 0, 0.2, h + 0.35); ctx.rect(0.15, h * 0.75, 0.7, 0.18); }
      else { ctx.moveTo(0.05, 0); ctx.lineTo(0.1, h); ctx.lineTo(0.9, h + 0.1); ctx.lineTo(0.95, 0); }
      ctx.fill(); ctx.strokeStyle = PAL.outline; ctx.lineWidth = 0.04; ctx.stroke();
      ctx.fillStyle = 'rgba(210,225,255,0.3)'; ctx.fillRect(0.12, h * 0.2, 0.05, h * 0.5);
      ctx.fillStyle = 'rgba(40,60,40,0.7)'; ctx.fillRect(0.1, 0, 0.8, 0.08);
    } else if (d.type === 'gate') {
      const closed = g.lockCam ? 1 : 0;
      this.gateK = (this.gateK ?? 0) + (closed - (this.gateK ?? 0)) * 0.12;
      const k = this.gateK;
      ctx.fillStyle = '#3a3440'; ctx.fillRect(-0.6, 0, 0.5, 6); ctx.fillRect(1.1, 0, 0.5, 6); ctx.fillRect(-0.6, 5.6, 2.2, 0.6);
      ctx.strokeStyle = '#1a1820'; ctx.lineWidth = 0.1;
      const top = 5.6, bottom = top - k * 5.6;
      for (let x = -0.05; x < 1.1; x += 0.28) { ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); }
      for (let y = top - 0.5; y > bottom; y -= 0.9) { ctx.beginPath(); ctx.moveTo(-0.1, y); ctx.lineTo(1.1, y); ctx.stroke(); }
      if (k > 0.05) { ctx.fillStyle = '#8a8490'; for (let x = -0.05; x < 1.1; x += 0.28) { ctx.beginPath(); ctx.moveTo(x - 0.06, bottom); ctx.lineTo(x, bottom - 0.25); ctx.lineTo(x + 0.06, bottom); ctx.fill(); } }
    } else if (d.type === 'rubble') {
      ctx.fillStyle = '#4a3e3a'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse((i % 3) + 0.5, Math.floor(i / 3) * 1.2 + 0.5, 0.6, 0.45, i, 0, TAU); ctx.fill(); }
    }
  }
  moverArt(ctx, m) {
    const th = this.th;
    ctx.fillStyle = lin(ctx, 0, 0, 0, -0.5, th.plat); ctx.fillRect(0, -0.45, m.w, 0.45);
    ctx.fillStyle = 'rgba(255,240,220,0.2)'; ctx.fillRect(0, -0.05, m.w, 0.05);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.05; ctx.strokeRect(0, -0.45, m.w, 0.45);
    ctx.fillStyle = '#2a2a30'; for (const x of [0.25, m.w - 0.25]) { ctx.beginPath(); ctx.arc(x, -0.22, 0.09, 0, TAU); ctx.fill(); }
    if (m.ay) { ctx.strokeStyle = 'rgba(30,30,36,0.8)'; ctx.lineWidth = 0.04; for (const x of [0.3, m.w - 0.3]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 12); ctx.stroke(); } }
  }
  jetArt(ctx, j, time) {
    this.at(ctx, j.x, j.y);
    ctx.fillStyle = '#2a1a18'; ctx.fillRect(0.15, -0.05, 0.7, 0.18); ctx.fillStyle = '#ff6a20'; ctx.fillRect(0.3, 0.06, 0.4, 0.05);
    if (j.warn) { for (let i = 0; i < 5; i++) { const k = (time * 3 + i * 0.2) % 1; ctx.fillStyle = `rgba(255,200,90,${1 - k})`; ctx.fillRect(0.4 + Math.sin(i * 7 + time * 10) * 0.25, 0.1 + k * 0.9, 0.06, 0.06); } }
    if (j.on) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) { const ph = time * 20 + i; const w = 0.45 + 0.1 * Math.sin(ph); const g = ctx.createLinearGradient(0, 0, 0, j.h); g.addColorStop(0, 'rgba(255,250,210,0.95)'); g.addColorStop(0.5, 'rgba(255,140,40,0.75)'); g.addColorStop(1, 'rgba(200,30,10,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0.5 - w / 2, 0); ctx.quadraticCurveTo(0.5 + Math.sin(ph) * 0.2, j.h * 0.6, 0.5, j.h + 0.3); ctx.quadraticCurveTo(0.5 - Math.sin(ph) * 0.2, j.h * 0.5, 0.5 + w / 2, 0); ctx.fill(); }
      ctx.restore();
    }
  }
  drawTitleBack(ctx) {
    if (!this.titleDef) { this.titleDef = { id: 1, theme: 'graveyard', vertical: false, deco: [], W: 200, H: 20 }; this.def = this.titleDef; this.buildStage(this.titleDef); this.def = null; }
    const keep = this.def; this.def = this.titleDef; this.th = THEMES.graveyard;
    ctx.save(); this.fieldBackup = this.field; this.field = { x: 0, y: 0, w: this.W, h: this.H }; const skyKeep = [this.skyImg, this.fogImg, this.tintImg, this.skyTheme]; [this.skyImg, this.fogImg, this.tintImg, this.skyTheme] = this.titleSky || [];
    if (!this.titleBg || this.titleBg.W !== Math.round(this.W * 1.5)) { const T0 = this.T; this.T = this.H / VH; this.titleBg = this.buildBackground(this.titleDef); this.T = T0; }
    const bgKeep = this.bg; this.bg = this.titleBg;
    this.drawSky(ctx, this.time * 0.6, VH / 2);
    this.titleSky = [this.skyImg, this.fogImg, this.tintImg, this.skyTheme]; [this.skyImg, this.fogImg, this.tintImg, this.skyTheme] = skyKeep;
    this.bg = bgKeep; this.field = this.fieldBackup; this.def = keep;
    ctx.fillStyle = 'rgba(0,0,10,0.25)'; ctx.fillRect(0, 0, this.W, this.H);
    ctx.restore();
  }
  // ---------------------------------------------------------------- 粒子（出来事から作る）
  onEvents(evs, g) {
    for (const e of evs) {
      if (e.type === 'enemyDie') this.burst(e.x, e.y, e.strong ? 26 : 16, ['#d8d0e0', '#8a7a9a', '#ffe9a0'], 5, 'puff');
      else if (e.type === 'enemyHit' || e.type === 'bossHit') this.burst(e.x ?? g.boss.x, e.y ?? g.boss.y + 1, 6, ['#fff6d0', '#ffcf6a'], 6, 'spark');
      else if (e.type === 'armorBreak') { this.burst(e.x, e.y, 14, ['#eef4ff', '#9fb2c8', '#5a6a80'], 8, 'shard'); this.shake = 0.2; }
      else if (e.type === 'bossDie') { for (let i = 0; i < 6; i++) setTimeout(() => this.burst(e.x + (Math.random() - 0.5) * 3, e.y + (Math.random() - 0.5) * 3, 24, ['#fff6d0', '#ff9a40', '#ff4020'], 9, 'puff'), i * 280); this.shake = 1.2; }
      else if (e.type === 'ghoulEmerge') this.burst(e.x, e.y + 0.1, 10, ['#6a5238', '#4b3a2a'], 4, 'dirt');
      else if (e.type === 'splash') this.burst(e.x, e.y, 14, ['#cfefff', '#7ac8ff'], 6, 'drop');
      else if (e.type === 'clink') this.burst(e.x, e.y, 5, ['#ffffff', '#ffe9a0'], 4, 'spark');
      else if (e.type === 'death' && (e.cause === 'enemy' || e.cause === 'shot' || e.cause === 'boss' || e.cause === 'fire')) this.burst(e.x, e.y + 0.8, 16, ['#d23a3a', '#ffe9a0', '#cfe0ff'], 6, 'spark');
      else if (e.type === 'burn') this.burst(e.x, e.y + 0.2, 8, ['#ffcf6a', '#ff6a20'], 3, 'spark');
    }
  }
  burst(x, y, n, cols, sp, kind) {
    for (let i = 0; i < n && this.parts.length < 400; i++) {
      const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7);
      this.parts.push({ x, y, px: x, py: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + (kind === 'shard' || kind === 'dirt' || kind === 'drop' ? 3 : 0), t: 0, life: kind === 'puff' ? 0.6 + Math.random() * 0.4 : 0.5 + Math.random() * 0.6,
        c: cols[i % cols.length], s: kind === 'puff' ? 0.15 + Math.random() * 0.25 : kind === 'shard' ? 0.12 + Math.random() * 0.1 : 0.06, kind, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20 });
    }
  }
  drawParticles(ctx, alpha) {
    const dt = 1 / 60;
    for (const q of this.parts) {
      q.t += dt * (this.app.screen === 'play' ? 1 : 0);
      const grav = q.kind === 'puff' ? -1 : q.kind === 'spark' ? 6 : 18;
      q.vy -= grav * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      if (q.kind === 'puff') { q.vx *= 0.94; q.vy *= 0.94; }
      const k = 1 - q.t / q.life;
      this.at(ctx, q.x, q.y);
      ctx.globalAlpha = Math.max(0, k);
      if (q.kind === 'puff') { ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(0, 0, q.s * (1.5 - k), 0, TAU); ctx.fill(); }
      else if (q.kind === 'shard') { ctx.rotate(q.rot); ctx.fillStyle = q.c; ctx.beginPath(); ctx.moveTo(-q.s, -q.s * 0.5); ctx.lineTo(q.s, -q.s * 0.3); ctx.lineTo(0, q.s); ctx.fill(); }
      else { ctx.fillStyle = q.c; ctx.fillRect(-q.s / 2, -q.s / 2, q.s, q.s); }
      ctx.globalAlpha = 1;
    }
    this.parts = this.parts.filter((q) => q.t < q.life);
  }
}

function deadTree(x, px, base, h, r) {
  x.save(); x.translate(px, base); x.scale(h / 4, -h / 4); deadTreeU(x, 0, 0, 4, r); x.restore();
}
// 枯れ木（u 単位。上向き）
function deadTreeU(ctx, x, y, h, r) {
  const br = (x0, y0, ang, len, w, depth) => {
    const x1 = x0 + Math.sin(ang) * len, y1 = y0 + Math.cos(ang) * len;
    ctx.beginPath(); ctx.moveTo(x0 - w / 2, y0); ctx.quadraticCurveTo(x0 + Math.sin(ang) * len * 0.5 + (r() - 0.5) * 0.3, y0 + Math.cos(ang) * len * 0.5, x1, y1); ctx.lineTo(x0 + w / 2, y0); ctx.fill();
    if (depth > 0) { const n = 2 + (r() < 0.4 ? 1 : 0); for (let i = 0; i < n; i++) br(x1, y1, ang + (r() - 0.5) * 1.6, len * (0.55 + r() * 0.2), w * 0.55, depth - 1); }
  };
  br(x, y, (r() - 0.5) * 0.2, h * 0.45, h * 0.09, 4);
}
