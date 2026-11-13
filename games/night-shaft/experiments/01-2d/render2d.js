// 2D 版の描画。すべてベクターで描く（解像度を上げても粗くならない・素材の拡大劣化が無い）。
// ワールド座標（m、y 上向き）のまま setTransform で描き、文字だけ画面座標に戻して描く。
import { W, CAR_W, FLOOR_H, level, floorOf } from '../../shared/core/const.js';
import { Animator, playerAnimState, enemyAnimState } from '../../shared/art/pose.js';
import { drawPerson } from './person2d.js';
import { LOOK, THEME } from '../../shared/art/palette.js';
import { makeRng } from '../../shared/core/rng.js';
import { FloorCache, CX0, CX1, themeOf, makeSkyLayers } from './backdrop2d.js';

const VIEW_FAR = 26.4; // 全体表示（ビル全体の幅）
const VIEW_NEAR = 16.5; // 寄り（既定）: 人物が大きく見え、プレイヤーを横にも追う

export class Renderer2D {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.fx = []; this.popups = []; this.anims = new Map(); this.steps = []; this.scarf = null; this.shake = 0; this.camY = null; this.camX = null; this.bg = null;
    this.vp = { x: 0, y: 0, w: 1, h: 1 };
    this.cache = new FloorCache(); this.zoom = 'near'; this.flash = 0; this.lightning = 0; this.nextBolt = 6;
    this.rain = Array.from({ length: 140 }, (_, i) => ({ x: Math.random(), y: Math.random(), v: 0.8 + Math.random() * 0.6 }));
    this.dust = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), p: Math.random() * 6 }));
    this.post = null;
  }

  // vp: ゲームを描く範囲（CSS px）、dpr: 描画倍率
  resize(cssW, cssH, dpr, vp) {
    const w = Math.max(1, Math.round(cssW * dpr)), h = Math.max(1, Math.round(cssH * dpr));
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    this.dpr = dpr;
    this.vp = { x: vp.x * dpr, y: vp.y * dpr, w: vp.w * dpr, h: vp.h * dpr };
    const viewW = this.zoom === 'near' ? VIEW_NEAR : VIEW_FAR;
    // 縦長の画面では横幅を詰めすぎない（最低でも 3.2 階ぶんの高さは見せる）
    this.viewW = Math.min(viewW, Math.max(10.5, this.vp.w / (this.vp.h / (3.2 * FLOOR_H))));
    if (this.zoom !== 'near') this.viewW = VIEW_FAR;
    this.s = this.vp.w / this.viewW;
    const maxH = 7 * FLOOR_H * this.s;
    if (this.vp.h > maxH) { this.vp.y += (this.vp.h - maxH) / 2; this.vp.h = maxH; }
    this.sky = null; this.post = null; this.cache.reset();
  }
  setZoom(z) { this.zoom = z; }
  get bufferSize() { return [this.cv.width, this.cv.height]; }

  // ---- 効果 ----
  spark(x, y, color, n = 8, speed = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random());
      this.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 1, life: 0.35 + Math.random() * 0.3, t: 0, color, size: 0.04 + Math.random() * 0.03, g: 9, glow: true });
    }
  }
  dustPuff(x, y, n = 4, k = 1) { for (let i = 0; i < n; i++) this.fx.push({ kind: 'dust', x: x + (Math.random() - 0.5) * 0.3, y: y + 0.03, vx: (Math.random() - 0.5) * 0.8 * k, vy: 0.2 + Math.random() * 0.3, life: 0.5 + Math.random() * 0.3, t: 0, r: 0.06 + Math.random() * 0.06 }); }
  popup(x, y, text, color = '#fff') { this.popups.push({ x, y, text, color, t: 0 }); }
  onEvents(game, events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'shot':
          this.fx.push({ kind: 'flash', x: ev.x + ev.dir * 0.66, y: ev.y, t: 0, life: 0.07, dir: ev.dir });
          this.fx.push({ kind: 'shell', x: ev.x + ev.dir * 0.25, y: ev.y + 0.06, vx: -ev.dir * (1.2 + Math.random()), vy: 2.2 + Math.random(), rot: 0, vr: 18, t: 0, life: 1.4, floorY: level(Math.floor((ev.y + 0.01) / FLOOR_H) + 1), bounced: 0 });
          this.muzzleT = 0;
          break;
        case 'eshot': this.fx.push({ kind: 'flash', x: ev.x + Math.sign(game.player.x - ev.x) * 0.62, y: ev.y, t: 0, life: 0.09, dir: Math.sign(game.player.x - ev.x), enemy: true }); break;
        case 'kill': this.spark(ev.x, ev.y + 1.1, '#ffd27a', 16, 4); this.fx.push({ kind: 'ring', x: ev.x, y: ev.y + 1.1, t: 0, life: 0.3 }); this.popup(ev.x, ev.y + 2.1, '+' + ev.pts, ev.cause === 'env' ? '#7fe0ff' : ev.cause === 'kick' ? '#ffb36b' : '#ffffff'); this.hitFlash = this.hitFlash || {}; this.hitFlash[ev.id] = 0.12; this.dustPuff(ev.x, ev.y, 6, 1.5); break;
        case 'lightHit': this.spark(ev.x, level(ev.floor) + 2.35, '#fff6c8', 20, 3.5); this.fx.push({ kind: 'ring', x: ev.x, y: level(ev.floor) + 2.35, t: 0, life: 0.25, col: '255,246,200' }); break;
        case 'lightCrash': this.spark(ev.x, level(ev.floor) + 0.1, '#d8f2ff', 26, 3.5); this.dustPuff(ev.x, level(ev.floor), 10, 2.5); this.shake = Math.max(this.shake, 0.1); break;
        case 'bulletCover': this.spark(ev.x, ev.y, '#ffcf8a', 7, 2.5); break;
        case 'bulletWall': this.spark(ev.x, ev.y, '#ffe9a0', 4, 1.8); break;
        case 'land': if (ev.drop > 0.4) this.dustPuff(game.player.x, game.player.y, 6, 1.4); break;
        case 'doc': this.popup(ev.x, ev.y != null ? ev.y : level(ev.floor) + 2.5, `書類 ${ev.got}/${ev.total}  +${ev.pts}`, '#ffd36b'); this.fx.push({ kind: 'ring', x: ev.x, y: level(ev.floor) + 1.3, t: 0, life: 0.45, col: '255,210,110', big: true }); break;
        case 'miss': this.shake = 0.18; this.flash = 0.35; break;
        case 'spot': this.fx.push({ kind: 'alert', id: ev.id, t: 0, life: 0.7 }); break;
        default: break;
      }
    }
  }

  // ---- メイン ----
  draw(game, t, dt, opts = {}) {
    const c = this.ctx; const s = this.s; const vp = this.vp;
    const st = game.stage; const th = THEME[st.theme] || THEME.office; const bt = themeOf(st.theme);
    const p = game.player;
    // カメラ: 縦はプレイヤーの階を、横は（寄りのとき）向いている方を少し先まで見せて追う。回転・強い揺れはしない
    const targetY = p.y + 1.35;
    if (this.camY == null || opts.snap) this.camY = targetY;
    this.camY += (targetY - this.camY) * Math.min(1, dt * 6);
    const viewW = this.viewW;
    const x0min = -1.2, x0max = W + 1.2 - viewW;
    const look = this.zoom === 'near' ? (p.face || 1) * 2.4 : 0;
    const targetX = Math.max(x0min, Math.min(x0max, p.x + look - viewW / 2));
    if (this.camX == null || opts.snap) this.camX = targetX;
    this.camX += (targetX - this.camX) * Math.min(1, dt * 3.2);
    const x0 = viewW >= W + 2 ? -(viewW - W) / 2 : this.camX;
    const viewH = vp.h / s;
    const topY = Math.min(level(st.floors) + FLOOR_H + 2.6, this.camY + viewH / 2);
    const camB = Math.max(-1.0, topY - viewH);
    const sh = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.3 : 0;
    this.shake = Math.max(0, this.shake - dt);
    this.view = { x0, y0: camB, s, vp, w: viewW };
    this.t = t; this.dt = dt; this.game = game;

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#05060b'; c.fillRect(0, 0, this.cv.width, this.cv.height);
    this.drawSky(game, x0, camB, viewH, dt);
    c.save();
    c.beginPath(); c.rect(vp.x, vp.y, vp.w, vp.h); c.clip();
    c.setTransform(s, 0, 0, -s, vp.x - x0 * s + sh * s, vp.y + vp.h + camB * s);

    const fTop = Math.min(st.floors, floorOf(camB + viewH) + 1), fBot = Math.max(1, floorOf(camB) - 1);
    // 1) 保存した階の背景（下の階から描く＝床のスラブが下の階の天井に重なる）
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    for (let f = fBot; f <= fTop; f++) { const e = this.cache.get(game, f, s); c.drawImage(e.cv, Math.round(this.wx(CX0) + sh * s), Math.round(this.wy(e.y1)), e.cv.width, e.cv.height); }
    c.restore();
    // 2) 動く背景（モニター・LED・監視カメラ・回転灯・時計）
    for (let f = fTop; f >= fBot; f--) this.drawFloorDynamic(game, f, t);
    for (const car of game.cars) this.drawShaft(game, car, fBot, fTop, th, t);
    c.save(); c.beginPath(); c.rect(0, -1, W, level(st.floors) + FLOOR_H + 1); c.clip();
    for (let f = fTop; f >= fBot; f--) this.drawFloorProps(game, f, th, t);
    c.restore();
    for (const car of game.cars) this.drawCar(game, car, t);
    this.lastDt = dt;
    // 3) 人物（接地影 → 人物）
    for (const e of game.enemies) if (e.y > camB - 3 && e.y < camB + viewH + 1) this.drawEnemy(game, e, t);
    this.drawPlayer(game, t, dt);
    for (let f = fTop; f >= fBot; f--) this.drawCovers(game, f, th);
    this.drawBullets(game, t);
    this.drawFx(dt);
    // 4) 暗がり → 光の筋とほこり（加算）
    for (let f = fTop; f >= fBot; f--) this.drawDark(game, f);
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let f = fTop; f >= fBot; f--) this.drawLightVolumes(game, f, t, bt);
    this.drawGlows(game, t);
    c.restore();
    if (fTop === st.floors) this.drawRoof(game, th);
    c.restore();
    // 5) 後処理（雨・稲光・周辺減光・色調・粒子感）
    this.drawPost(game, bt, dt, t);
    this.drawLabels(game, fBot, fTop, t);
    this.drawPopups(dt);
  }

  wx(x) { return this.vp.x + (x - this.view.x0) * this.s; }
  wy(y) { return this.vp.y + this.vp.h - (y - this.view.y0) * this.s; }

  // 夜空・3 層の街（視差）・動く車の光・探照灯・飛行機の灯・（警備棟）雨と稲光
  drawSky(game, x0, camB, viewH, dt) {
    const c = this.ctx; const vp = this.vp; const t = this.t;
    if (!this.sky) this.sky = makeSkyLayers(Math.round(vp.w), Math.round(vp.h));
    c.drawImage(this.sky.sky, vp.x, vp.y, vp.w, vp.h);
    // 探照灯
    c.save(); c.beginPath(); c.rect(vp.x, vp.y, vp.w, vp.h); c.clip();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) {
      const bx = vp.x + vp.w * (0.25 + i * 0.5) - (x0 * this.s * 0.05) % vp.w; const by = vp.y + vp.h;
      const a = -Math.PI / 2 + Math.sin(t * 0.25 + i * 2.1) * 0.55;
      const g = c.createLinearGradient(bx, by, bx + Math.cos(a) * vp.h, by + Math.sin(a) * vp.h);
      g.addColorStop(0, 'rgba(160,190,255,0.10)'); g.addColorStop(1, 'rgba(160,190,255,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + Math.cos(a - 0.06) * vp.h * 1.2, by + Math.sin(a - 0.06) * vp.h * 1.2); c.lineTo(bx + Math.cos(a + 0.06) * vp.h * 1.2, by + Math.sin(a + 0.06) * vp.h * 1.2); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    for (const L of this.sky.layers) {
      const off = ((x0 * this.s * L.depth) % L.w + L.w) % L.w;
      const yo = Math.max(-vp.h * 0.2, Math.min(vp.h * 0.4, -(camB - 45) * this.s * L.depth * 0.15));
      c.drawImage(L.cv, vp.x - off, vp.y + yo, L.w, vp.h); c.drawImage(L.cv, vp.x - off + L.w, vp.y + yo, L.w, vp.h);
    }
    // 遠くの道路を走る車の光
    const roadY = vp.y + vp.h * 0.96;
    for (let i = 0; i < 18; i++) {
      const dir = i % 2 ? 1 : -1; const sp = 0.03 + (i % 5) * 0.008;
      const xx = vp.x + (((i * 0.137 + t * sp * dir) % 1 + 1) % 1) * vp.w;
      c.fillStyle = dir > 0 ? 'rgba(255,240,200,0.9)' : 'rgba(255,60,50,0.9)';
      c.fillRect(xx, roadY + (i % 2) * 3, Math.max(2, vp.w / 600), Math.max(1.5, vp.w / 1000));
    }
    // 飛行機の点滅灯
    const ax = vp.x + ((t * 0.012) % 1.2 - 0.1) * vp.w, ay = vp.y + vp.h * 0.12;
    if (Math.floor(t * 1.4) % 2 === 0) { c.fillStyle = '#ff4d4d'; c.fillRect(ax, ay, 3, 3); }
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(ax + 6, ay + 1, 2, 2);
    // 稲光（警備棟）
    if (game.stage.theme === 'security') {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.lightning = 0.5; this.nextBolt = 7 + Math.random() * 9; }
      if (this.lightning > 0) { this.lightning -= dt; const k = Math.max(0, this.lightning) * (Math.sin(this.lightning * 60) > 0 ? 1 : 0.4); c.fillStyle = `rgba(200,210,255,${k * 0.5})`; c.fillRect(vp.x, vp.y, vp.w, vp.h); }
    }
    c.restore();
  }

  // 動く背景
  drawFloorDynamic(game, f, t) {
    const c = this.ctx; const e = this.cache.get(game, f, this.s); const d = e.dyn;
    const amb = game.lightAmount ? 1 : 1; void amb;
    for (const m of d.monitors) {
      const flick = 0.85 + 0.15 * Math.sin(t * 9 + m.seed * 20);
      c.fillStyle = `hsla(${m.hue},70%,${40 * flick}%,0.95)`; c.fillRect(m.x, m.y, m.w, m.h);
      c.fillStyle = 'rgba(255,255,255,0.35)'; const lines = 5; for (let i = 0; i < lines; i++) { const ww = (0.3 + ((Math.sin(m.seed * 50 + i * 7 + Math.floor(t * 0.7)) + 1) / 2) * 0.6) * m.w; c.fillRect(m.x + 0.03, m.y + m.h - 0.06 - i * 0.05, ww * 0.85, 0.018); }
    }
    for (const s of d.screens) {
      c.fillStyle = s.kind === 'cctv' ? '#1a2a22' : '#06181e'; c.fillRect(s.x, s.y, s.w, s.h);
      if (s.kind === 'wave') {
        c.strokeStyle = '#5fffe0'; c.lineWidth = 0.012; c.beginPath();
        for (let i = 0; i <= 30; i++) { const u = i / 30; const yy = s.y + s.h / 2 + Math.sin(u * 14 + t * 4 + s.seed * 9) * s.h * 0.25 * Math.sin(u * 3.1); i ? c.lineTo(s.x + u * s.w, yy) : c.moveTo(s.x, yy); } c.stroke();
      } else {
        const k = Math.floor(t * 12 + s.seed * 99); const rr = makeRng(k);
        c.fillStyle = 'rgba(140,200,160,0.18)'; for (let i = 0; i < 14; i++) c.fillRect(s.x + rr() * s.w, s.y + rr() * s.h, s.w * 0.25, 0.012);
        c.fillStyle = 'rgba(120,180,140,0.5)'; c.fillRect(s.x + s.w * 0.3, s.y + s.h * 0.1, s.w * 0.12, s.h * 0.4);
        c.fillStyle = Math.floor(t * 1.5 + s.seed * 5) % 2 ? '#ff4040' : 'rgba(255,64,64,0.2)'; c.fillRect(s.x + s.w - 0.06, s.y + s.h - 0.06, 0.03, 0.03);
      }
    }
    for (const l of d.leds) {
      const on = l.rate < 0.5 ? 1 : (Math.sin(t * l.rate * 6.28 + l.seed * 30) > 0 ? 1 : 0.2);
      c.fillStyle = l.col; c.globalAlpha = on; c.fillRect(l.x - 0.012, l.y - 0.012, 0.024, 0.024); c.globalAlpha = 1;
      if (l.bubbles) { c.fillStyle = 'rgba(220,255,250,0.5)'; for (let i = 0; i < 6; i++) { const yy = l.y - l.h / 2 + (((t * 0.25 + i / 6 + l.seed) % 1) * l.h); c.beginPath(); c.arc(l.x + Math.sin(i * 3 + t) * l.w * 0.3, yy, 0.02, 0, 7); c.fill(); } }
    }
    for (const k of d.clocks) {
      const sec = (Date.now() / 1000) % 60, min = (Date.now() / 60000) % 60;
      c.strokeStyle = '#1a1612'; c.lineWidth = 0.022; c.beginPath(); c.moveTo(k.x, k.y); c.lineTo(k.x + Math.sin(min / 60 * 6.283) * k.r * 0.7, k.y + Math.cos(min / 60 * 6.283) * k.r * 0.7); c.stroke();
      c.strokeStyle = '#c33'; c.lineWidth = 0.01; c.beginPath(); c.moveTo(k.x, k.y); c.lineTo(k.x + Math.sin(sec / 60 * 6.283) * k.r * 0.85, k.y + Math.cos(sec / 60 * 6.283) * k.r * 0.85); c.stroke();
    }
    for (const m of d.cams) {
      const a = Math.sin(t * 0.6 + m.seed * 10) * 0.6;
      c.fillStyle = '#2a2f36'; c.fillRect(m.x - 0.03, m.y, 0.06, 0.2);
      c.save(); c.translate(m.x, m.y); c.rotate(a - 0.3); c.fillStyle = '#d6dae0'; c.fillRect(-0.05, -0.08, 0.3, 0.12); c.fillStyle = '#111'; c.fillRect(0.22, -0.07, 0.05, 0.1);
      c.fillStyle = Math.floor(t * 2) % 2 ? '#ff3030' : '#601010'; c.fillRect(0.0, -0.06, 0.03, 0.03); c.restore();
    }
    for (const b of d.beacons) { c.fillStyle = '#3a1210'; c.fillRect(b.x - 0.08, b.y, 0.16, 0.12); c.fillStyle = '#ff3b30'; c.beginPath(); c.arc(b.x, b.y, 0.08, Math.PI, 0, true); c.fill(); }
  }

  // 光の筋（体積光）と漂うほこり。加算合成
  drawLightVolumes(game, f, t, bt) {
    const c = this.ctx; const L = level(f);
    const warm = game.stage.theme === 'office' ? '255,214,160' : game.stage.theme === 'lab' ? '190,240,255' : game.stage.theme === 'security' ? '255,236,210' : '255,240,210';
    for (const l of game.byFloor[f].lights) {
      if (l.state !== 'on') continue;
      const flick = game.stage.theme === 'lab' && Math.sin(t * 37 + l.id) > 0.995 ? 0.4 : 1;
      const y = L + 2.25;
      const g = c.createLinearGradient(0, y, 0, L);
      g.addColorStop(0, `rgba(${warm},${0.2 * flick})`); g.addColorStop(1, `rgba(${warm},0)`);
      c.fillStyle = g; c.beginPath(); c.moveTo(l.x - 0.2, y); c.lineTo(l.x - 1.9, L + 0.1); c.lineTo(l.x + 1.9, L + 0.1); c.lineTo(l.x + 0.2, y); c.fill();
      // 床の照り返し
      const rg = c.createRadialGradient(l.x, L + 0.12, 0.05, l.x, L + 0.12, 1.6); rg.addColorStop(0, `rgba(${warm},${0.16 * flick})`); rg.addColorStop(1, `rgba(${warm},0)`);
      c.fillStyle = rg; c.fillRect(l.x - 1.6, L, 3.2, 0.3);
      // 電球のにじみ
      const bg = c.createRadialGradient(l.x, y, 0.02, l.x, y, 0.55); bg.addColorStop(0, `rgba(${warm},${0.55 * flick})`); bg.addColorStop(1, `rgba(${warm},0)`);
      c.fillStyle = bg; c.fillRect(l.x - 0.55, y - 0.55, 1.1, 1.1);
      if (this.lowFx) continue;
      // ほこり
      c.fillStyle = `rgba(${warm},0.5)`;
      for (let i = 0; i < 7; i++) { const u = ((t * 0.04 + i * 0.137 + l.id * 0.31) % 1); const yy = L + 0.2 + u * 2.0; const spread = (yy - L) / 2.25; const xx = l.x + Math.sin(t * 0.5 + i * 2.3) * 1.5 * (1 - spread * 0.85); c.fillRect(xx, yy, 0.014, 0.014); }
    }
  }
  // 発光物のにじみ（敵のバイザー・弾・銃口）
  drawGlows(game, t) {
    const c = this.ctx;
    for (const e of game.enemies) {
      if (!e.alive || e.state !== 'windup') continue;
      const k = 1 - Math.max(0, e.t) / game.D.windup;
      const hx = e.x + e.dir * 0.12, hy = e.y + (e.stance === 'crouch' ? 1.12 : 1.62);
      const g = c.createRadialGradient(hx, hy, 0.01, hx, hy, 0.45 + k * 0.35); g.addColorStop(0, `rgba(255,120,60,${0.5 * k})`); g.addColorStop(1, 'rgba(255,120,60,0)');
      c.fillStyle = g; c.fillRect(hx - 0.8, hy - 0.8, 1.6, 1.6);
      // 予兆の光の線（どの高さに撃つか）
      const gy = e.y + (e.lowShot ? 0.42 : 1.35);
      const lg2 = c.createLinearGradient(e.x, 0, e.x + e.dir * 3.5, 0); lg2.addColorStop(0, `rgba(255,80,60,${0.25 * k})`); lg2.addColorStop(1, 'rgba(255,80,60,0)');
      c.fillStyle = lg2; c.fillRect(Math.min(e.x, e.x + e.dir * 3.5), gy - 0.01, 3.5, 0.02);
    }
    for (const b of game.eBullets) { const g = c.createRadialGradient(b.x, b.y, 0.01, b.x, b.y, 0.4); g.addColorStop(0, 'rgba(255,110,60,0.55)'); g.addColorStop(1, 'rgba(255,110,60,0)'); c.fillStyle = g; c.fillRect(b.x - 0.4, b.y - 0.4, 0.8, 0.8); }
    for (const b of game.pBullets) { const g = c.createRadialGradient(b.x, b.y, 0.01, b.x, b.y, 0.3); g.addColorStop(0, 'rgba(255,240,160,0.45)'); g.addColorStop(1, 'rgba(255,240,160,0)'); c.fillStyle = g; c.fillRect(b.x - 0.3, b.y - 0.3, 0.6, 0.6); }
    const ex = game.stage.exit; if (game.docsGot >= game.docTotal) { const L = level(ex.floor); const g = c.createRadialGradient(ex.x, L + 1.2, 0.1, ex.x, L + 1.2, 2.2); g.addColorStop(0, `rgba(60,255,140,${0.22 + 0.08 * Math.sin(t * 4)})`); g.addColorStop(1, 'rgba(60,255,140,0)'); c.fillStyle = g; c.fillRect(ex.x - 2.2, L, 4.4, 3); }
  }

  // 後処理
  drawPost(game, bt, dt, t) {
    const c = this.ctx; const vp = this.vp;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.beginPath(); c.rect(vp.x, vp.y, vp.w, vp.h); c.clip();
    if (game.stage.theme === 'security') { // 雨（画面の手前を斜めに）
      c.strokeStyle = 'rgba(170,190,230,0.16)'; c.lineWidth = Math.max(1, this.s * 0.012); c.beginPath();
      for (const d of this.rain) { d.y += d.v * dt * 1.6; d.x += d.v * dt * 0.25; if (d.y > 1) { d.y -= 1; d.x = Math.random(); } const x = vp.x + (d.x % 1) * vp.w, y = vp.y + d.y * vp.h; c.moveTo(x, y); c.lineTo(x + this.s * 0.06, y + this.s * 0.38); }
      c.stroke();
    }
    if (this.lowFx) { c.restore(); return; }
    if (!this.post) this.post = makePost(Math.round(vp.w), Math.round(vp.h));
    c.globalCompositeOperation = 'soft-light'; c.fillStyle = bt.tint.replace(/[\d.]+\)$/, (m) => String(Math.min(1, parseFloat(m) * 4)) + ')'); c.fillRect(vp.x, vp.y, vp.w, vp.h);
    c.globalCompositeOperation = 'source-over';
    c.drawImage(this.post.vig, vp.x, vp.y, vp.w, vp.h);
    c.globalAlpha = 0.05; const ox = Math.floor(Math.random() * 128), oy = Math.floor(Math.random() * 128);
    c.fillStyle = this.post.grainPat || (this.post.grainPat = c.createPattern(this.post.grain, 'repeat')); c.translate(vp.x - ox, vp.y - oy); c.fillRect(ox, oy, vp.w, vp.h); c.globalAlpha = 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (this.flash > 0) { c.fillStyle = `rgba(255,40,30,${this.flash * 0.5})`; c.fillRect(vp.x, vp.y, vp.w, vp.h); this.flash -= dt; }
    c.restore();
  }

  drawShaft(game, car, fBot, fTop, th, t) {
    const c = this.ctx;
    const lo = Math.max(car.lo, fBot), hi = Math.min(car.hi, fTop);
    if (lo > hi) return;
    const x0 = car.x - CAR_W / 2;
    const yb = level(lo), yt = level(hi) + FLOOR_H;
    c.fillStyle = '#0a0d13'; c.fillRect(x0, yb - (car.lo === lo ? 1.0 : 0), CAR_W, yt - yb + (car.lo === lo ? 1.0 : 0));
    // ガイドレールとロープ
    c.fillStyle = '#20262f'; c.fillRect(x0 + 0.08, yb - 1, 0.07, yt - yb + 1); c.fillRect(x0 + CAR_W - 0.15, yb - 1, 0.07, yt - yb + 1);
    c.strokeStyle = 'rgba(160,170,185,0.35)'; c.lineWidth = 0.025;
    c.beginPath(); c.moveTo(car.x - 0.15, car.y + FLOOR_H); c.lineTo(car.x - 0.15, yt); c.moveTo(car.x + 0.15, car.y + FLOOR_H); c.lineTo(car.x + 0.15, yt); c.stroke();
    for (let f = lo; f <= hi; f++) {
      const L = level(f);
      // 乗り場の枠
      c.fillStyle = '#3a4250'; c.fillRect(x0 - 0.12, L, 0.12, 2.55); c.fillRect(x0 + CAR_W, L, 0.12, 2.55); c.fillRect(x0 - 0.12, L + 2.45, CAR_W + 0.24, 0.12);
      // 階表示
      const here = Math.abs(car.y - L) < 0.02;
      c.fillStyle = here ? '#7fffb0' : '#ff6a5a';
      c.globalAlpha = 0.9; c.fillRect(car.x - 0.18, L + 2.62, 0.36, 0.12); c.globalAlpha = 1;
      const pit = !(Math.abs(car.y - L) < 0.02) && !(Math.abs(car.y + FLOOR_H - L) < 0.02);
      if (pit) { // 穴の縁の警告
        for (const ex of [x0 - 0.5, x0 + CAR_W]) {
          for (let k = 0; k < 5; k++) { c.fillStyle = k % 2 ? '#111' : '#f2c230'; c.fillRect(ex + k * 0.1, L - 0.05, 0.1, 0.08); }
        }
      }
      if (car.auto) { c.fillStyle = 'rgba(127,224,255,0.75)'; c.fillRect(x0 - 0.08, L + 2.3, 0.04, 0.12); c.fillRect(x0 + CAR_W + 0.04, L + 2.3, 0.04, 0.12); }
    }
  }

  drawCar(game, car, t) {
    const c = this.ctx;
    const x0 = car.x - CAR_W / 2, y = car.y;
    if (y > this.view.y0 + 40 || y + FLOOR_H < this.view.y0 - 1) return;
    // 箱
    const g = c.createLinearGradient(x0, 0, x0 + CAR_W, 0);
    g.addColorStop(0, '#4a5262'); g.addColorStop(0.5, '#8a94a6'); g.addColorStop(1, '#4a5262');
    c.fillStyle = g; c.fillRect(x0, y + 2.6, CAR_W, 0.4); c.fillRect(x0, y - 0.12, CAR_W, 0.14);
    // 中（明るい）
    const gi = c.createLinearGradient(0, y, 0, y + 2.6);
    gi.addColorStop(0, '#5b5547'); gi.addColorStop(1, '#a79c80');
    c.fillStyle = gi; c.fillRect(x0 + 0.06, y, CAR_W - 0.12, 2.6);
    c.fillStyle = 'rgba(255,240,200,0.35)'; c.fillRect(x0 + 0.3, y + 2.5, CAR_W - 0.6, 0.06);
    // 手すりと操作盤
    c.fillStyle = '#c7ced8'; c.fillRect(x0 + 0.1, y + 0.95, CAR_W - 0.2, 0.04);
    c.fillStyle = '#20242c'; c.fillRect(car.x + 0.45, y + 1.15, 0.16, 0.36);
    c.fillStyle = '#ffd36b'; c.fillRect(car.x + 0.49, y + 1.38, 0.08, 0.05); c.fillRect(car.x + 0.49, y + 1.22, 0.08, 0.05);
    // 扉（左右）。開き具合 car.doors
    const open = car.doors;
    for (const side of [-1, 1]) {
      const ex = side < 0 ? x0 : x0 + CAR_W;
      const hgt = 2.6 * (1 - open);
      c.fillStyle = '#6f7888'; c.fillRect(ex - 0.05, y + 2.6 - hgt, 0.1, hgt);
      if (car.state === 'moving') { c.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 6; k++) c.fillRect(ex - 0.05, y + k * 0.43, 0.1, 0.05); }
    }
    // 屋根
    c.fillStyle = '#2a2f38'; c.fillRect(x0, y + FLOOR_H - 0.04, CAR_W, 0.04);
    if (car.auto) {
      const warn = car.state === 'stopped' && car.wait < 0.7;
      c.fillStyle = warn && Math.sin(t * 30) > 0 ? '#ff5040' : '#7fe0ff';
      c.fillRect(car.x - 0.25, y + 2.75, 0.5, 0.08);
    }
  }

  drawFloorProps(game, f, th, t) {
    const c = this.ctx; const L = level(f); const fl = game.byFloor[f]; const st = game.stage;
    // エスカレーター（この階が下の乗り口）
    for (const e of st.escalators) if (e.upper - 1 === f) this.drawEscalator(e, L, t);
    // ドア
    for (const d of fl.doors) this.drawDoor(game, d, L, t);
    // 照明
    for (const l of fl.lights) this.drawLight(l, L, t);
    // 屋上からの入口・出口
    if (f === st.start.floor) { c.fillStyle = '#20252e'; c.fillRect(st.start.x - 0.55, L, 1.1, 2.3); c.fillStyle = '#39414e'; c.fillRect(st.start.x - 0.48, L, 0.96, 2.22); c.fillStyle = '#9fb3c8'; c.fillRect(st.start.x - 0.3, L + 2.4, 0.6, 0.18); }
    if (f === st.exit.floor) {
      const ex = st.exit.x;
      c.fillStyle = '#0c1a12'; c.fillRect(ex - 0.8, L, 1.6, 2.4);
      const g = c.createLinearGradient(ex - 0.8, 0, ex + 0.8, 0); g.addColorStop(0, 'rgba(60,255,140,0.05)'); g.addColorStop(1, 'rgba(60,255,140,0.35)');
      c.fillStyle = g; c.fillRect(ex - 0.8, L, 1.6, 2.4);
      const all = game.docsGot >= game.docTotal;
      c.fillStyle = all ? '#36f08a' : '#5b6b62'; c.fillRect(ex - 0.55, L + 2.5, 1.1, 0.32);
      c.fillStyle = all ? 'rgba(54,240,138,0.25)' : 'rgba(0,0,0,0)';
      c.beginPath(); c.moveTo(ex - 1.6, L + 0.01); c.lineTo(ex - 0.9, L + 0.01); c.lineTo(ex - 0.9, L + 0.1); c.lineTo(ex - 1.6, L + 0.1); c.fill();
    }
  }

  drawEscalator(e, L, t) {
    const c = this.ctx;
    const ax = e.xBot, ay = L, bx = e.xTop, by = L + FLOOR_H;
    const dir = Math.sign(bx - ax);
    const len = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    const nx = -uy * dir, ny = ux * dir; // 上向きの法線
    // 下の骨組み
    c.fillStyle = '#2a2f37';
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(bx, by - 0.55); c.lineTo(ax + dir * 0.9, ay); c.closePath(); c.fill();
    // 段
    c.fillStyle = '#7b8492';
    const steps = 16; const off = (t * 1.6) % 1;
    for (let i = 0; i < steps; i++) {
      const u = (i + off) / steps;
      const px = ax + (bx - ax) * u, py = ay + (by - ay) * u;
      c.fillRect(px - 0.1, py - 0.02, 0.2, 0.05);
    }
    c.strokeStyle = '#a7b0bd'; c.lineWidth = 0.05; c.beginPath(); c.moveTo(ax, ay + 0.02); c.lineTo(bx, by + 0.02); c.stroke();
    // 手すり（ガラスの欄干）
    c.fillStyle = 'rgba(170,210,240,0.14)';
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(bx + nx * 0.95, by + ny * 0.95); c.lineTo(ax + nx * 0.95, ay + ny * 0.95); c.fill();
    c.strokeStyle = '#1b1e24'; c.lineWidth = 0.07; c.beginPath(); c.moveTo(ax + nx * 0.95, ay + ny * 0.95); c.lineTo(bx + nx * 0.95, by + ny * 0.95); c.stroke();
    // 乗り口の目印
    for (const [x, y] of [[ax, ay], [bx, by]]) { c.fillStyle = 'rgba(127,224,255,0.6)'; c.fillRect(x - 0.45, y + 0.005, 0.9, 0.05); }
  }

  drawDoor(game, d, L, t) {
    const c = this.ctx; const x = d.x;
    const doc = d.kind === 'doc';
    // 枠
    c.fillStyle = '#1a1d23'; c.fillRect(x - 0.62, L, 1.24, 2.45);
    let col = doc ? (d.collected ? '#1f4650' : '#c4313d') : '#3d4b5e';
    const g = c.createLinearGradient(x - 0.55, 0, x + 0.55, 0);
    g.addColorStop(0, shade(col, -0.18)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.25));
    // 出現の予兆: 少しずつ開いて光が漏れる
    const tele = d.tele > 0 ? 1 - d.tele / game.D.spawnTele : 0;
    const open = Math.max(tele * 0.35, d.open > 0 ? Math.min(1, d.open * 2) * 0.9 : 0);
    if (open > 0) {
      c.fillStyle = '#fff2c0'; c.fillRect(x - 0.55, L, 1.1, 2.38);
      c.fillStyle = 'rgba(255,240,190,0.25)'; c.beginPath(); c.moveTo(x - 0.55, L); c.lineTo(x - 1.6, L); c.lineTo(x - 0.55, L + 2.38); c.fill();
      c.beginPath(); c.moveTo(x + 0.55, L); c.lineTo(x + 1.6, L); c.lineTo(x + 0.55, L + 2.38); c.fill();
    }
    c.fillStyle = g; c.fillRect(x - 0.55, L, 1.1 * (1 - open), 2.38);
    c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(x - 0.5, L + 0.1, 0.03, 2.2);
    c.fillStyle = '#d7dde6'; c.fillRect(x + 0.32 - open * 1.1, L + 1.05, 0.12, 0.05);
    if (doc) {
      // 書類マーク（形でも区別: 右上の角が折れた紙＋三角の旗）
      if (!d.collected) {
        c.fillStyle = '#fff4e6';
        c.beginPath(); c.moveTo(x - 0.22, L + 1.35); c.lineTo(x + 0.12, L + 1.35); c.lineTo(x + 0.22, L + 1.45); c.lineTo(x + 0.22, L + 1.85); c.lineTo(x - 0.22, L + 1.85); c.closePath(); c.fill();
        c.fillStyle = '#c4313d'; for (let i = 0; i < 3; i++) c.fillRect(x - 0.15, L + 1.47 + i * 0.1, 0.28, 0.03);
        const pulse = 0.5 + 0.5 * Math.sin(t * 4);
        c.fillStyle = `rgba(255,90,90,${0.25 + pulse * 0.35})`; c.beginPath(); c.moveTo(x - 0.62, L + 2.5); c.lineTo(x + 0.62, L + 2.5); c.lineTo(x, L + 2.85); c.fill();
      } else {
        c.strokeStyle = '#7fffd0'; c.lineWidth = 0.07; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x - 0.18, L + 1.6); c.lineTo(x - 0.04, L + 1.45); c.lineTo(x + 0.22, L + 1.8); c.stroke();
      }
    } else {
      c.fillStyle = 'rgba(160,200,230,0.25)'; c.fillRect(x - 0.3, L + 1.6, 0.6 * (1 - open), 0.4);
    }
    if (d.tele > 0) { // 「!」
      const blink = Math.sin(t * 24) > 0;
      c.fillStyle = blink ? '#ffcc33' : '#ff7a33';
      c.fillRect(x - 0.06, L + 2.6, 0.12, 0.3); c.fillRect(x - 0.06, L + 2.5, 0.12, 0.07);
    }
  }

  drawLight(l, L, t) {
    const c = this.ctx; const x = l.x; const style = themeOf(this.game.stage.theme).light;
    if (l.state === 'broken') {
      c.strokeStyle = '#555'; c.lineWidth = 0.02; c.beginPath(); c.moveTo(x, L + FLOOR_H - 0.2); c.lineTo(x + 0.05, L + 2.6); c.stroke();
      if (Math.sin(t * 23 + x) > 0.93) { c.fillStyle = '#bfe6ff'; c.fillRect(x + 0.03, L + 2.58, 0.04, 0.04); } // 切れた配線の火花
      c.fillStyle = '#9aa6b2'; for (let i = 0; i < 6; i++) c.fillRect(x - 0.45 + i * 0.17, L + 0.02, 0.09, 0.025);
      return;
    }
    const on = l.state === 'on';
    const y = l.state === 'falling' ? L + l.fy : L + 2.3;
    c.strokeStyle = '#2a3038'; c.lineWidth = 0.022;
    if (on) { c.beginPath(); c.moveTo(x - 0.1, L + FLOOR_H - 0.22); c.lineTo(x - 0.1, y + 0.2); c.moveTo(x + 0.1, L + FLOOR_H - 0.22); c.lineTo(x + 0.1, y + 0.2); c.stroke(); }
    if (style === 'tube') {
      c.fillStyle = '#c9d3d9'; c.fillRect(x - 0.55, y + 0.05, 1.1, 0.1); c.fillStyle = on ? '#eaffff' : '#667'; c.fillRect(x - 0.5, y, 1.0, 0.06);
    } else if (style === 'cage') {
      c.fillStyle = '#2b2f2a'; c.fillRect(x - 0.18, y + 0.14, 0.36, 0.1);
      c.fillStyle = on ? '#fff0c8' : '#666'; c.beginPath(); c.ellipse(x, y + 0.06, 0.12, 0.1, 0, 0, 7); c.fill();
      c.strokeStyle = '#1b1d1a'; c.lineWidth = 0.015; for (const dx of [-0.08, 0, 0.08]) { c.beginPath(); c.moveTo(x + dx, y + 0.15); c.lineTo(x + dx * 1.3, y - 0.04); c.stroke(); }
    } else {
      c.fillStyle = lg2(c, x - 0.3, 0, x + 0.3, 0, '#20252c', '#3a414c'); c.beginPath(); c.moveTo(x - 0.3, y); c.lineTo(x + 0.3, y); c.lineTo(x + 0.13, y + 0.26); c.lineTo(x - 0.13, y + 0.26); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(x - 0.12, y + 0.2, 0.08, 0.04);
      c.fillStyle = on ? '#fff3cf' : '#777'; c.beginPath(); c.ellipse(x, y, 0.21, 0.05, 0, 0, 7); c.fill();
    }
  }

  drawCovers(game, f, th) {
    const c = this.ctx; const L = level(f);
    for (const cv of game.byFloor[f].covers) {
      const x0 = cv.x - cv.w / 2;
      if (th.cover === 'desk') {
        c.fillStyle = '#5a3d2a'; c.fillRect(x0, L + cv.h - 0.08, cv.w, 0.08);
        c.fillStyle = '#3f2a1d'; c.fillRect(x0 + 0.04, L, cv.w - 0.08, cv.h - 0.08);
        c.fillStyle = '#6b4a34'; c.fillRect(x0 + 0.1, L + 0.55, cv.w - 0.2, 0.04);
      } else if (th.cover === 'cabinet') {
        c.fillStyle = '#8796a0'; c.fillRect(x0, L, cv.w, cv.h); c.fillStyle = '#5e6b74';
        for (let i = 0; i < 3; i++) c.fillRect(x0 + 0.06, L + 0.08 + i * 0.31, cv.w - 0.12, 0.26);
        c.fillStyle = '#c8d4dc'; for (let i = 0; i < 3; i++) c.fillRect(cv.x - 0.1, L + 0.2 + i * 0.31, 0.2, 0.03);
      } else if (th.cover === 'barricade') {
        c.fillStyle = '#3b3f37'; c.fillRect(x0, L, cv.w, cv.h);
        for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#d9b23a' : '#1c1d1a'; c.beginPath(); c.moveTo(x0 + i * 0.25, L + cv.h); c.lineTo(x0 + i * 0.25 + 0.2, L + cv.h); c.lineTo(x0 + i * 0.25 + 0.05, L + cv.h - 0.2); c.lineTo(x0 + i * 0.25 - 0.15, L + cv.h - 0.2); c.fill(); }
      } else {
        c.fillStyle = '#7a5a36'; c.fillRect(x0, L, cv.w, cv.h); c.strokeStyle = '#4a3420'; c.lineWidth = 0.05; c.strokeRect(x0 + 0.03, L + 0.03, cv.w - 0.06, cv.h - 0.06);
        c.beginPath(); c.moveTo(x0 + 0.05, L + 0.05); c.lineTo(x0 + cv.w - 0.05, L + cv.h - 0.05); c.stroke();
      }
    }
  }

  drawSlab(game, f, th) {
    const c = this.ctx; const L = level(f);
    // その階の床（昇降路の穴は空ける。かごが居れば、かごの床・屋根が見える）
    const pits = game.cars.filter((q) => f >= q.lo && f <= q.hi).map((q) => q.x).sort((a, b) => a - b);
    let x = -0.6;
    const segs = [];
    for (const px of pits) { segs.push([x, px - CAR_W / 2]); x = px + CAR_W / 2; }
    segs.push([x, W + 0.6]);
    for (const [a, b] of segs) {
      c.fillStyle = th.floor; c.fillRect(a, L - 0.32, b - a, 0.32);
      c.fillStyle = th.floorTop; c.fillRect(a, L - 0.035, b - a, 0.035);
    }
    // 上の階の床＝この階の天井（最上階の上は屋上で描く）
  }

  drawRoof(game, th) {
    const c = this.ctx; const top = level(game.stage.floors) + FLOOR_H; const t = this.t;
    // 屋上のスラブ（防水層）とパラペット
    c.fillStyle = lg2(c, 0, top - 0.35, 0, top, '#0e0f12', '#2d3036'); c.fillRect(CX0, top - 0.35, CX1 - CX0, 0.35);
    c.fillStyle = '#2b313b'; c.fillRect(CX0, top, CX1 - CX0, 0.12);
    c.fillStyle = lg2(c, 0, top, 0, top + 0.75, '#3a414c', '#252a32'); c.fillRect(-1.6, top, 0.35, 0.75); c.fillRect(W + 1.25, top, 0.35, 0.75);
    c.fillStyle = '#596270'; c.fillRect(-1.6, top + 0.72, 0.35, 0.05); c.fillRect(W + 1.25, top + 0.72, 0.35, 0.05);
    // 手すり
    c.strokeStyle = '#5a6270'; c.lineWidth = 0.035; c.beginPath(); c.moveTo(-1.25, top + 1.05); c.lineTo(W + 1.25, top + 1.05); c.moveTo(-1.25, top + 0.55); c.lineTo(W + 1.25, top + 0.55); c.stroke();
    c.lineWidth = 0.03; for (let x = -1.2; x < W + 1.25; x += 1.5) { c.beginPath(); c.moveTo(x, top + 0.12); c.lineTo(x, top + 1.05); c.stroke(); }
    // 階段室（スタートの扉がある小屋）
    c.fillStyle = lg2(c, 0.1, 0, 3.0, 0, '#3c434e', '#535c69'); c.fillRect(0.1, top + 0.12, 2.9, 2.5);
    c.fillStyle = '#2a2f37'; c.fillRect(0.0, top + 2.6, 3.1, 0.14);
    c.fillStyle = '#1d222a'; c.fillRect(0.7, top + 0.12, 1.0, 2.05); c.fillStyle = 'rgba(255,220,150,0.5)'; c.fillRect(0.78, top + 1.6, 0.84, 0.35);
    c.fillStyle = '#ffd36b'; c.beginPath(); c.arc(2.4, top + 2.2, 0.08, 0, 7); c.fill();
    // 空調の室外機（ファンが回る）
    for (const ax of [6.5, 8.2, 14.8]) {
      c.fillStyle = lg2(c, ax, 0, ax + 1.4, 0, '#5d6672', '#7b8592'); c.fillRect(ax, top + 0.12, 1.4, 1.0);
      c.fillStyle = '#20252c'; c.beginPath(); c.arc(ax + 0.7, top + 0.62, 0.36, 0, 7); c.fill();
      c.save(); c.translate(ax + 0.7, top + 0.62); c.rotate(t * 9 + ax); c.fillStyle = '#4a525e'; for (let k = 0; k < 4; k++) { c.rotate(Math.PI / 2); c.fillRect(-0.04, 0, 0.08, 0.32); } c.restore();
      c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 0.012; for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(ax + 0.06, top + 0.2 + k * 0.15); c.lineTo(ax + 0.2, top + 0.2 + k * 0.15); c.stroke(); }
    }
    // 給水タンク
    c.fillStyle = '#4b5462'; c.fillRect(10.6, top + 0.12, 0.08, 1.2); c.fillRect(12.4, top + 0.12, 0.08, 1.2);
    c.fillStyle = lg2(c, 10.4, 0, 12.7, 0, '#5a6372', '#8a94a3'); c.fillRect(10.4, top + 1.3, 2.3, 1.6); c.fillStyle = '#3a414c'; c.fillRect(10.3, top + 2.85, 2.5, 0.12);
    // アンテナと航空障害灯
    c.strokeStyle = '#4b5260'; c.lineWidth = 0.06; c.beginPath(); c.moveTo(19, top + 0.12); c.lineTo(19, top + 4.4); c.moveTo(18.3, top + 3.2); c.lineTo(19.7, top + 3.2); c.moveTo(18.5, top + 3.8); c.lineTo(19.5, top + 3.8); c.stroke();
    const blink = (t % 1.4) < 0.18;
    c.fillStyle = blink ? '#ff3b30' : '#5a1512'; c.beginPath(); c.arc(19, top + 4.45, 0.09, 0, 7); c.fill();
    if (blink) { c.save(); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(19, top + 4.45, 0.02, 19, top + 4.45, 0.9); g.addColorStop(0, 'rgba(255,60,50,0.6)'); g.addColorStop(1, 'rgba(255,60,50,0)'); c.fillStyle = g; c.fillRect(18.1, top + 3.55, 1.8, 1.8); c.restore(); }
    // ヘリポートの標示（屋上の面の縁）
    c.fillStyle = 'rgba(242,194,48,0.85)'; c.fillRect(20.6, top + 0.12, 2.6, 0.03); c.fillStyle = 'rgba(255,255,255,0.75)'; c.fillRect(21.7, top + 0.12, 0.4, 0.03);
  }

  drawDark(game, f) {
    const c = this.ctx; const L = level(f);
    const g = c.createLinearGradient(0, 0, W, 0);
    let any = false;
    for (let x = 0; x <= W; x += 0.6) {
      const a = 1 - game.lightAmount(f, x);
      if (a > 0.01) any = true;
      g.addColorStop(x / W, `rgba(4,6,18,${(a * 0.92).toFixed(3)})`);
    }
    if (!any) return;
    c.fillStyle = g; c.fillRect(0, L, W, FLOOR_H);
  }

  // ---- 人物（v2: Animator で動きを作り、person2d.js で描く） ----
  anim(key, seed) { let a = this.anims.get(key); if (!a) { a = new Animator(seed); this.anims.set(key, a); } a.seen = this.frameNo; return a; }
  drawPlayer(game, t, dt) {
    const p = game.player;
    if (game !== this.animGame) { this.anims = new Map(); this.animGame = game; this.scarf = null; this.pool = []; }
    this.frameNo = (this.frameNo || 0) + 1;
    const A = this.anim('p', 3).update(dt, { ...playerAnimState(p, t), deadT: undefined });
    if (A.step) { this.steps.push({ x: p.x, y: p.y, gain: 0.6 + A.run * 0.5, player: true }); if (A.run > 0.5) this.dustPuff(p.x - (p.face || 1) * 0.15, p.y, 2, 0.6); }
    let alpha = 1;
    if (p.state === 'door') alpha = p.t > 0.8 ? 1 - (1.1 - p.t) / 0.3 : p.t < 0.3 ? 1 - p.t / 0.3 : 0;
    this.muzzleT = (this.muzzleT ?? 9) + dt;
    this.updateScarf(p, A, dt);
    const inv = p.inv > 0 && p.state === 'play' ? 0.5 + 0.5 * Math.sin(t * 14) : 0;
    this.drawShadow(game, p.x, p.y, A);
    if (alpha > 0.01) this.drawCharacter(game, 'p', p.x, p.y, A, LOOK.agent, { scarf: true }, { alpha, inv, muzzle: Math.max(0, 1 - this.muzzleT / 0.07), scarfPts: this.scarf, hitFlash: p.hitT != null && p.hitT < 0.1 ? 1 - p.hitT / 0.1 : 0 });
    if (this.frameNo % 120 === 0) for (const [k, a] of this.anims) if (a.seen < this.frameNo - 60) this.anims.delete(k);
  }
  drawEnemy(game, e, t) {
    if (game !== this.animGame) { this.anims = new Map(); this.animGame = game; this.pool = []; }
    const look = LOOK.guard[e.type] || LOOK.guard[0];
    const A = this.anim(e.id, e.id).update(this.lastDt || 1 / 60, enemyAnimState(e, game, t));
    if (A.step) this.steps.push({ x: e.x, y: e.y, gain: 0.35 });
    const spawning = e.state === 'spawn';
    let alpha = spawning ? Math.max(0.15, 1 - e.spawnT / 0.35) : 1;
    if (!e.alive && e.deadT > 1.0) alpha = Math.max(0, 1 - (e.deadT - 1.0) / 0.4);
    const hf = this.hitFlash && this.hitFlash[e.id] > 0 ? this.hitFlash[e.id] / 0.12 : (e.hitT < 0.1 ? 1 - e.hitT / 0.1 : 0);
    if (this.hitFlash && this.hitFlash[e.id] > 0) this.hitFlash[e.id] -= this.lastDt || 0.016;
    if (alpha < 0.01) return;
    if (e.alive || e.deadT < 1.2) this.drawShadow(game, e.x, e.y, A);
    this.drawCharacter(game, e.id, e.x, e.y, A, look, { windup: e.state === 'windup' ? 1 - Math.max(0, e.t) / game.D.windup : 0, scale: spawning ? 0.9 + 0.1 * (1 - e.spawnT / 0.35) : 1 }, { alpha, hitFlash: hf, silhouette: spawning ? 1 - Math.min(1, (0.35 - e.spawnT) / 0.25) : 0 });
  }
  // 接地影（足元の楕円。倒れている時は横長）
  drawShadow(game, x, y, A) {
    const c = this.ctx; const P = A.pose; const lying = P.kind === 'dead';
    const lx = (P.legs[0].ankle[0] + P.legs[1].ankle[0]) / 2 * (A.faceV >= 0 ? 1 : -1);
    const lift = Math.min(P.legs[0].ankle[1], P.legs[1].ankle[1]);
    const k = Math.max(0.25, 1 - lift * 1.2);
    const g = c.createRadialGradient(x + lx, y + 0.06, 0.02, x + lx, y + 0.06, lying ? 1.0 : 0.5);
    g.addColorStop(0, `rgba(0,0,0,${0.5 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save(); c.translate(x + lx, y + 0.06); c.scale(1, 0.16); c.translate(-(x + lx), -(y + 0.06));
    c.fillStyle = g; c.fillRect(x + lx - 1.1, y + 0.06 - 1.1, 2.2, 2.2); c.restore();
  }
  // 人物を作業用キャンバスに描き、形の内側にだけ照明・被弾の光を重ねてから貼る
  drawCharacter(game, key, x, y, A, look, o, fx) {
    if (this.lowFx) { const m = this.ctx; m.save(); m.globalAlpha = fx.alpha ?? 1; drawPerson(m, x, y, A.faceV, A, look, o); m.restore(); return; }
    const s = this.s; const W2 = 1.9, H2 = 2.7, HB = 0.25;
    const pw = Math.ceil(W2 * 2 * s), ph = Math.ceil((H2 + HB) * s);
    let oc = this.charCv && this.charCv.width >= pw && this.charCv.height >= ph ? this.charCv : null;
    if (!oc) { oc = this.charCv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(pw, ph) : Object.assign(document.createElement('canvas'), { width: pw, height: ph }); this.charCtx = oc.getContext('2d'); }
    const c = this.charCtx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, pw, ph);
    c.setTransform(s, 0, 0, -s, W2 * s, H2 * s);
    if (fx.scarfPts) { // マフラーの尾（布の帯）
      for (const [col, w] of [['#07090f', 0.13], [look.scarfDark, 0.095], [look.scarf, 0.055]]) {
        c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); fx.scarfPts.forEach((q, i) => (i ? c.lineTo(q.x - x, q.y - y) : c.moveTo(q.x - x, q.y - y))); c.stroke();
      }
    }
    drawPerson(c, 0, 0, A.faceV, A, look, o);
    // 照明: その場所の明るさと、いちばん近い点灯中の照明の方向
    const f = Math.floor((y + 0.6) / FLOOR_H) + 1;
    const amt = game.lightAmount(f, x);
    let lamp = null; for (const l of (game.byFloor[f] ? game.byFloor[f].lights : [])) if (l.state === 'on' && (!lamp || Math.abs(l.x - x) < Math.abs(lamp.x - x))) lamp = l;
    c.globalCompositeOperation = 'source-atop';
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (lamp && Math.abs(lamp.x - x) < 5) {
      const dir = Math.sign(lamp.x - x) || 1; const k = Math.max(0, 1 - Math.abs(lamp.x - x) / 5) * 0.4;
      const gx0 = W2 * s + dir * 0.45 * s, gx1 = W2 * s - dir * 0.35 * s;
      const gr = c.createLinearGradient(gx0, 0, gx1, 0); gr.addColorStop(0, `rgba(255,225,170,${k})`); gr.addColorStop(1, 'rgba(255,225,170,0)');
      c.fillStyle = gr; c.fillRect(0, 0, pw, ph);
      const top = c.createLinearGradient(0, (H2 - 2.0) * s, 0, (H2 - 0.8) * s); top.addColorStop(0, `rgba(255,235,200,${k * 0.6})`); top.addColorStop(1, 'rgba(255,235,200,0)');
      c.fillStyle = top; c.fillRect(0, 0, pw, ph);
    }
    // 暗がりでは青い月明かりの縁取り
    const rim = c.createLinearGradient(W2 * s - 0.5 * s, 0, W2 * s + 0.1 * s, 0); rim.addColorStop(0, `rgba(110,160,255,${0.22 * (1.3 - amt)})`); rim.addColorStop(1, 'rgba(110,160,255,0)');
    c.fillStyle = rim; c.fillRect(0, 0, pw, ph);
    if (fx.muzzle > 0) { const mg = c.createRadialGradient(W2 * s + (A.faceV >= 0 ? 0.6 : -0.6) * s, (H2 - 1.3) * s, 0, W2 * s + (A.faceV >= 0 ? 0.6 : -0.6) * s, (H2 - 1.3) * s, 1.0 * s); mg.addColorStop(0, `rgba(255,220,140,${0.7 * fx.muzzle})`); mg.addColorStop(1, 'rgba(255,220,140,0)'); c.fillStyle = mg; c.fillRect(0, 0, pw, ph); }
    if (fx.hitFlash > 0) { c.fillStyle = `rgba(255,255,255,${0.85 * fx.hitFlash})`; c.fillRect(0, 0, pw, ph); }
    if (fx.silhouette > 0) { c.fillStyle = `rgba(10,12,20,${fx.silhouette})`; c.fillRect(0, 0, pw, ph); } // 扉の光を背にした影から現れる
    // 貼り付け
    const m = this.ctx; m.save(); m.setTransform(1, 0, 0, 1, 0, 0);
    const sx = this.wx(x) - W2 * s, sy = this.wy(y) - H2 * s;
    m.globalAlpha = fx.alpha ?? 1;
    if (fx.inv > 0) { m.shadowColor = `rgba(110,220,255,${0.9 * fx.inv})`; m.shadowBlur = 0.25 * s; }
    m.drawImage(oc, 0, 0, pw, ph, sx, sy, pw, ph);
    m.restore();
  }
  updateScarf(p, A, dt) {
    const P = A.pose; const f = A.faceV >= 0 ? 1 : -1;
    const nx = p.x + P.neck[0] * f - 0.04 * f, ny = p.y + P.neck[1] - 0.06;
    if (!this.scarf) this.scarf = Array.from({ length: 6 }, () => ({ x: nx, y: ny, vx: 0, vy: 0 }));
    const pts = this.scarf;
    pts[0].x = nx; pts[0].y = ny;
    const wind = -f * (0.6 + A.speed * 0.5);
    for (let i = 1; i < pts.length; i++) {
      const q = pts[i];
      q.vy += (-2.2 + Math.sin(performance.now() / 160 + i) * 0.8 * (0.3 + A.speed * 0.3)) * dt; q.vx += wind * dt * 3;
      q.vx *= 0.88; q.vy *= 0.88;
      q.x += q.vx * dt * 8; q.y += q.vy * dt * 8;
      const a = pts[i - 1]; const dx = q.x - a.x, dy = q.y - a.y; const d = Math.hypot(dx, dy) || 1;
      const L = 0.085; q.x = a.x + dx / d * L; q.y = a.y + dy / d * L;
    }
  }
  drawScarfTail(look) {
    const c = this.ctx; const pts = this.scarf; if (!pts) return;
    for (const [col, w] of [['#07090f', 0.13], [look.scarfDark, 0.095], [look.scarf, 0.055]]) {
      c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (const q of pts) c.lineTo(q.x, q.y); c.stroke();
    }
  }

  drawBullets(game, t) {
    const c = this.ctx;
    for (const b of game.pBullets) {
      const g = c.createLinearGradient(b.x - b.dir * 0.5, 0, b.x, 0);
      g.addColorStop(0, 'rgba(255,240,150,0)'); g.addColorStop(1, 'rgba(255,250,210,1)');
      c.fillStyle = g; c.fillRect(Math.min(b.x, b.x - b.dir * 0.5), b.y - 0.025, 0.5, 0.05);
    }
    for (const b of game.eBullets) {
      c.fillStyle = 'rgba(255,90,50,0.25)'; c.beginPath(); c.arc(b.x, b.y, 0.16, 0, 7); c.fill();
      const g = c.createLinearGradient(b.x - b.dir * 0.7, 0, b.x, 0);
      g.addColorStop(0, 'rgba(255,80,40,0)'); g.addColorStop(1, 'rgba(255,140,80,0.9)');
      c.fillStyle = g; c.fillRect(Math.min(b.x, b.x - b.dir * 0.7), b.y - 0.04, 0.7, 0.08);
      c.fillStyle = '#fff1d6'; c.beginPath(); c.arc(b.x, b.y, 0.065, 0, 7); c.fill();
    }
  }

  drawFx(dt) {
    const c = this.ctx; const g = this.game;
    for (const f of this.fx) {
      f.t += dt;
      const a = Math.max(0, 1 - f.t / f.life);
      if (f.kind === 'flash') { // 銃口の閃光（星形＋にじみ）
        c.save(); c.globalCompositeOperation = 'lighter';
        const col = f.enemy ? '255,140,70' : '255,240,180';
        const rg = c.createRadialGradient(f.x, f.y, 0.01, f.x, f.y, 0.5); rg.addColorStop(0, `rgba(${col},${a})`); rg.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = rg; c.fillRect(f.x - 0.5, f.y - 0.5, 1, 1);
        c.fillStyle = `rgba(255,255,230,${a})`; c.beginPath(); const d = f.dir || 1;
        c.moveTo(f.x - d * 0.05, f.y); c.lineTo(f.x + d * 0.1, f.y + 0.09); c.lineTo(f.x + d * 0.42, f.y); c.lineTo(f.x + d * 0.1, f.y - 0.09); c.closePath(); c.fill();
        c.restore(); continue;
      }
      if (f.kind === 'shell') { // 薬莢（跳ねて転がる）
        f.vy -= 14 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
        if (f.y < f.floorY + 0.02 && f.vy < 0) { f.y = f.floorY + 0.02; f.vy *= -0.38; f.vx *= 0.6; f.vr *= 0.5; f.bounced++; }
        c.save(); c.translate(f.x, f.y); c.rotate(f.rot); c.fillStyle = `rgba(214,170,80,${Math.min(1, a * 2)})`; c.fillRect(-0.025, -0.012, 0.05, 0.024); c.restore(); continue;
      }
      if (f.kind === 'dust') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.96; f.r += dt * 0.25; c.fillStyle = `rgba(190,180,170,${0.28 * a})`; c.beginPath(); c.arc(f.x, f.y, f.r, 0, 7); c.fill(); continue; }
      if (f.kind === 'ring') { c.strokeStyle = `rgba(${f.col || '255,220,150'},${a * 0.8})`; c.lineWidth = 0.04 * a; c.beginPath(); c.arc(f.x, f.y, (f.big ? 1.4 : 0.6) * (1 - a * a) + 0.1, 0, 7); c.stroke(); continue; }
      if (f.kind === 'alert') { // 敵が気づいた（頭上の「!」）
        const e = g && g.enemies.find((q) => q.id === f.id); if (!e || !e.alive) { f.t = f.life; continue; }
        const pop = Math.min(1, f.t / 0.1); const y = e.y + 2.25 + (1 - pop) * 0.2;
        c.save(); c.translate(e.x, y); c.scale(pop, pop);
        c.fillStyle = `rgba(255,70,50,${a})`; c.beginPath(); c.moveTo(0, 0.28); c.lineTo(0.17, -0.02); c.lineTo(-0.17, -0.02); c.closePath(); c.fill();
        c.fillStyle = `rgba(255,255,255,${a})`; c.fillRect(-0.022, 0.06, 0.044, 0.15); c.fillRect(-0.022, 0.0, 0.044, 0.035);
        c.restore(); continue;
      }
      f.vy -= f.g * dt; f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.glow) { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = f.color; c.globalAlpha = a; c.lineWidth = f.size * 0.8; c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(f.x - f.vx * 0.02, f.y - f.vy * 0.02); c.stroke(); c.restore(); }
      else { c.fillStyle = f.color; c.globalAlpha = a; c.fillRect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size); c.globalAlpha = 1; }
    }
    this.fx = this.fx.filter((f) => f.t < f.life);
    if (this.fx.length > 500) this.fx.splice(0, this.fx.length - 500);
  }

  drawLabels(game, fBot, fTop, t) {
    const c = this.ctx; const s = this.s;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.beginPath(); c.rect(this.vp.x, this.vp.y, this.vp.w, this.vp.h); c.clip();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const docFloors = new Set(game.remainingDocFloors());
    for (let f = fBot; f <= fTop; f++) {
      const L = level(f);
      const x = Math.max(this.wx(-0.3), this.vp.x + s * 0.4), y = this.wy(L + 1.5);
      c.fillStyle = docFloors.has(f) ? '#c4313d' : '#262b35';
      roundRect(c, x - s * 0.27, y - s * 0.24, s * 0.54, s * 0.48, s * 0.08); c.fill();
      c.fillStyle = '#e9eef5'; c.font = `700 ${Math.round(s * 0.26)}px "Inter","Noto Sans JP",system-ui,sans-serif`;
      c.fillText(String(f), x, y + s * 0.01);
    }
    // チュートリアルのヒント・必要な操作の吹き出し
    const p = game.player;
    if (p.ctx && p.state === 'play' && !this.noPrompts) {
      const label = { door: '↑ 書類を回収', escDown: '↓ エスカレーターで下へ', escUp: '↑ エスカレーターで上へ', call: '↑ かごを呼ぶ', car: '↑↓ かごを動かす' }[p.ctx.kind];
      if (label) {
        const x = this.wx(p.x), y = this.wy(p.y + 2.35);
        c.font = `700 ${Math.round(s * 0.24)}px "Noto Sans JP",system-ui,sans-serif`;
        const w = c.measureText(label).width + s * 0.3;
        c.fillStyle = 'rgba(10,14,24,0.82)'; roundRect(c, x - w / 2, y - s * 0.2, w, s * 0.4, s * 0.1); c.fill();
        c.strokeStyle = 'rgba(127,224,255,0.6)'; c.lineWidth = Math.max(1, s * 0.015); c.stroke();
        c.fillStyle = '#e9f6ff'; c.fillText(label, x, y + s * 0.01);
      }
    }
    c.restore();
  }

  drawPopups(dt) {
    const c = this.ctx; const s = this.s;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const q of this.popups) {
      q.t += dt;
      const a = Math.max(0, 1 - q.t / 1.2);
      c.globalAlpha = a; c.fillStyle = q.color;
      c.font = `800 ${Math.round(s * 0.3)}px "Inter","Noto Sans JP",system-ui,sans-serif`;
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = Math.max(2, s * 0.05);
      const x = this.wx(q.x), y = this.wy(q.y + q.t * 0.6);
      c.strokeText(q.text, x, y); c.fillText(q.text, x, y);
    }
    c.restore();
    this.popups = this.popups.filter((q) => q.t < 1.2);
  }
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

function lg2(c, x0, y0, x1, y1, a, b) { const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
function makePost(w, h) {
  const mk = (ww, hh) => { const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(ww, hh) : Object.assign(document.createElement('canvas'), { width: ww, height: hh }); return [cv, cv.getContext('2d')]; };
  const [vig, v] = mk(Math.max(1, w), Math.max(1, h));
  const g = v.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)'); v.fillStyle = g; v.fillRect(0, 0, w, h);
  const [grain, gc] = mk(128, 128); const id = gc.createImageData(128, 128);
  for (let i = 0; i < id.data.length; i += 4) { const n = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = n; id.data[i + 3] = 255; }
  gc.putImageData(id, 0, 0);
  return { vig, grain };
}
