// 2D 版の描画。すべてベクターで描く（解像度を上げても粗くならない・素材の拡大劣化が無い）。
// ワールド座標（m、y 上向き）のまま setTransform で描き、文字だけ画面座標に戻して描く。
import { W, CAR_W, FLOOR_H, level, floorOf } from '../../shared/core/const.js';
import { computePose, playerPoseKind, enemyPoseKind, SKEL } from '../../shared/art/pose.js';
import { LOOK, THEME } from '../../shared/art/palette.js';
import { makeRng } from '../../shared/core/rng.js';

const VIEW_W = 26.4; // 見える幅（ビル 24m + 両側の外）

export class Renderer2D {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.fx = []; this.popups = []; this.scarf = null; this.shake = 0; this.camY = null; this.bg = null;
    this.vp = { x: 0, y: 0, w: 1, h: 1 };
    this.deco = new Map();
  }

  // vp: ゲームを描く範囲（CSS px）、dpr: 描画倍率
  resize(cssW, cssH, dpr, vp) {
    const w = Math.max(1, Math.round(cssW * dpr)), h = Math.max(1, Math.round(cssH * dpr));
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; this.bg = null; }
    this.dpr = dpr;
    this.vp = { x: vp.x * dpr, y: vp.y * dpr, w: vp.w * dpr, h: vp.h * dpr };
    this.s = this.vp.w / VIEW_W;
    // 縦長画面でも見える階数が増えすぎないよう上限（最大 7 階ぶん）
    const maxH = 7 * FLOOR_H * this.s;
    if (this.vp.h > maxH) { this.vp.y += (this.vp.h - maxH) / 2; this.vp.h = maxH; }
  }
  get bufferSize() { return [this.cv.width, this.cv.height]; }

  // ---- 効果 ----
  spark(x, y, color, n = 8, speed = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random());
      this.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 1, life: 0.35 + Math.random() * 0.3, t: 0, color, size: 0.04 + Math.random() * 0.03, g: 9 });
    }
  }
  popup(x, y, text, color = '#fff') { this.popups.push({ x, y, text, color, t: 0 }); }
  onEvents(game, events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'shot': this.fx.push({ kind: 'flash', x: ev.x + ev.dir * 0.62, y: ev.y, t: 0, life: 0.06, dir: ev.dir }); break;
        case 'eshot': this.fx.push({ kind: 'flash', x: ev.x + Math.sign(game.player.x - ev.x) * 0.6, y: ev.y, t: 0, life: 0.08, dir: 0, enemy: true }); break;
        case 'kill': this.spark(ev.x, ev.y + 1.1, '#ffd27a', 14, 4); this.popup(ev.x, ev.y + 2.1, '+' + ev.pts, ev.cause === 'env' ? '#7fe0ff' : ev.cause === 'kick' ? '#ffb36b' : '#ffffff'); break;
        case 'lightHit': this.spark(ev.x, level(ev.floor) + 2.35, '#fff6c8', 16, 3); break;
        case 'lightCrash': this.spark(ev.x, level(ev.floor) + 0.1, '#d8f2ff', 22, 3.5); this.shake = Math.max(this.shake, 0.08); break;
        case 'bulletCover': this.spark(ev.x, ev.y, '#ffcf8a', 6, 2.5); break;
        case 'bulletWall': this.spark(ev.x, ev.y, '#ffe9a0', 4, 1.8); break;
        case 'doc': this.popup(ev.x, ev.y != null ? ev.y : level(ev.floor) + 2.5, `書類 ${ev.got}/${ev.total}  +${ev.pts}`, '#ffd36b'); break;
        case 'miss': this.shake = 0.15; break;
        default: break;
      }
    }
  }

  // ---- メイン ----
  draw(game, t, dt, opts = {}) {
    const c = this.ctx; const s = this.s; const vp = this.vp;
    const st = game.stage; const th = THEME[st.theme] || THEME.office;
    const p = game.player;
    // カメラ: 縦だけ追う（階の切り替わりで急に跳ばないよう減衰）。回転・強い揺れはしない
    const targetY = p.y + 1.4;
    if (this.camY == null || opts.snap) this.camY = targetY;
    this.camY += (targetY - this.camY) * Math.min(1, dt * 6);
    const viewH = vp.h / s;
    const topY = Math.min(level(st.floors) + FLOOR_H + 2.2, this.camY + viewH / 2);
    const camB = Math.max(-1.0, topY - viewH);
    const sh = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.3 : 0;
    this.shake = Math.max(0, this.shake - dt);
    const x0 = -(VIEW_W - W) / 2;
    this.view = { x0, y0: camB, s, vp };

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#05060b'; c.fillRect(0, 0, this.cv.width, this.cv.height);
    this.drawSky(camB, viewH);
    c.save();
    c.beginPath(); c.rect(vp.x, vp.y, vp.w, vp.h); c.clip();
    c.setTransform(s, 0, 0, -s, vp.x - x0 * s + sh * s, vp.y + vp.h + camB * s);

    const fTop = Math.min(st.floors, floorOf(camB + viewH) + 1), fBot = Math.max(1, floorOf(camB) - 1);
    this.drawExterior(game, th, camB, viewH);
    for (let f = fTop; f >= fBot; f--) this.drawFloorBack(game, f, th, t);
    for (const car of game.cars) this.drawShaft(game, car, fBot, fTop, th, t);
    c.save(); c.beginPath(); c.rect(0, -1, W, level(st.floors) + FLOOR_H + 1); c.clip();
    for (let f = fTop; f >= fBot; f--) this.drawFloorProps(game, f, th, t);
    c.restore();
    for (const car of game.cars) this.drawCar(game, car, t);
    for (const e of game.enemies) if (e.y > camB - 3 && e.y < camB + viewH + 1) this.drawEnemy(game, e, t);
    this.drawPlayer(game, t, dt);
    for (let f = fTop; f >= fBot; f--) this.drawCovers(game, f, th);
    this.drawBullets(game, t);
    this.drawFx(dt);
    for (let f = fTop; f >= fBot; f--) this.drawDark(game, f);
    for (let f = fTop; f >= fBot; f--) this.drawSlab(game, f, th);
    if (st.floors >= fTop && fTop === st.floors) this.drawRoof(game, th);
    c.restore();
    this.drawLabels(game, fBot, fTop, t);
    this.drawPopups(dt);
  }

  wx(x) { return this.vp.x + (x - this.view.x0) * this.s; }
  wy(y) { return this.vp.y + this.vp.h - (y - this.view.y0) * this.s; }

  drawSky(camB, viewH) {
    const c = this.ctx; const vp = this.vp;
    if (!this.bg) this.bg = this.makeCity();
    const off = ((camB * 0.18) % 30 + 30) % 30;
    const bh = this.bg.height;
    const y = vp.y + vp.h - bh + off * this.s * 0.25;
    c.drawImage(this.bg, vp.x, Math.min(vp.y, y), vp.w, bh);
  }

  makeCity() {
    const w = Math.max(64, Math.round(this.vp.w)), h = Math.max(64, Math.round(this.vp.h * 1.4));
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#060814'); g.addColorStop(0.55, '#121a3a'); g.addColorStop(0.85, '#2a2350'); g.addColorStop(1, '#3d2a4a');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const r = makeRng(42);
    for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`; const z = r() * 1.6 + 0.4; c.fillRect(r() * w, r() * h * 0.5, z, z); }
    // 月
    c.fillStyle = 'rgba(255,246,220,0.9)'; c.beginPath(); c.arc(w * 0.82, h * 0.12, h * 0.035, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,246,220,0.08)'; c.beginPath(); c.arc(w * 0.82, h * 0.12, h * 0.09, 0, 7); c.fill();
    for (const [layer, col, win] of [[0, '#0d1226', 0.25], [1, '#0a0e1d', 0.45]]) {
      let x = -20;
      while (x < w) {
        const bw = (40 + r() * 90) * (w / 1600) * (layer ? 1.3 : 1);
        const bh2 = h * (0.25 + r() * 0.5) * (layer ? 0.8 : 1);
        c.fillStyle = col; c.fillRect(x, h - bh2, bw, bh2);
        const cs = Math.max(3, bw / 9);
        for (let yy = h - bh2 + cs; yy < h - cs; yy += cs * 1.6) for (let xx = x + cs * 0.6; xx < x + bw - cs; xx += cs * 1.5) {
          if (r() < win) { c.fillStyle = r() < 0.8 ? `rgba(255,214,140,${0.35 + r() * 0.4})` : `rgba(140,200,255,${0.35 + r() * 0.4})`; c.fillRect(xx, yy, cs * 0.7, cs * 0.8); }
        }
        x += bw + r() * 12;
      }
    }
    return cv;
  }

  drawExterior(game, th, camB, viewH) {
    const c = this.ctx; const st = game.stage;
    const top = level(st.floors) + FLOOR_H;
    // 外壁の柱
    const g = c.createLinearGradient(-0.6, 0, 0, 0);
    g.addColorStop(0, '#15181f'); g.addColorStop(1, '#2b303a');
    c.fillStyle = g; c.fillRect(-0.6, -1, 0.6, top + 1.2);
    const g2 = c.createLinearGradient(W, 0, W + 0.6, 0);
    g2.addColorStop(0, '#2b303a'); g2.addColorStop(1, '#15181f');
    c.fillStyle = g2; c.fillRect(W, -1, 0.6, top + 1.2);
    // 地面
    c.fillStyle = '#0b0c10'; c.fillRect(-3, -3, W + 6, 3);
    c.fillStyle = '#2b2d33'; c.fillRect(-3, -0.08, W + 6, 0.08);
  }

  drawFloorBack(game, f, th, t) {
    const c = this.ctx; const L = level(f);
    const g = c.createLinearGradient(0, L, 0, L + FLOOR_H);
    g.addColorStop(0, th.wallLow); g.addColorStop(0.32, th.wallLow); g.addColorStop(0.33, th.wall); g.addColorStop(1, th.wallTop);
    c.fillStyle = g; c.fillRect(0, L, W, FLOOR_H);
    // 腰の見切り・幅木
    c.fillStyle = th.trim; c.globalAlpha = 0.55; c.fillRect(0, L + 0.96, W, 0.04); c.globalAlpha = 1;
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, L, W, 0.12);
    // 天井の影
    const g2 = c.createLinearGradient(0, L + FLOOR_H - 0.5, 0, L + FLOOR_H);
    g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,0.4)');
    c.fillStyle = g2; c.fillRect(0, L + FLOOR_H - 0.5, W, 0.5);
    this.drawDeco(game, f, th);
    // 壁の大きな階数
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = 'rgba(255,255,255,0.07)';
    c.font = `800 ${Math.round(this.s * 1.25)}px "Inter", "Noto Sans JP", system-ui, sans-serif`;
    c.textBaseline = 'middle';
    c.fillText(String(f), this.wx(0.35), this.wy(L + 2.15));
    c.restore();
  }

  drawDeco(game, f, th) {
    const key = game.stage.id + ':' + f;
    let d = this.deco.get(key);
    if (!d) {
      const r = makeRng(f * 977 + game.stage.id.length * 31);
      d = [];
      const busy = [...game.byFloor[f].doors.map((q) => q.x), ...game.cars.filter((q) => f >= q.lo - 1 && f <= q.hi + 1).map((q) => q.x)];
      for (let x = 1.5; x < W - 1; x += 1.7 + r() * 1.6) {
        if (busy.some((b) => Math.abs(b - x) < 1.7)) continue;
        d.push({ x, kind: r.pick(['panel', 'panel', 'frame', 'vent', 'plant', 'sign']), v: r() });
      }
      this.deco.set(key, d);
    }
    const c = this.ctx; const L = level(f);
    for (const o of d) {
      if (o.kind === 'panel') { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(o.x - 0.5, L + 1.3, 1.0, 1.1); c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 0.025; c.strokeRect(o.x - 0.5, L + 1.3, 1.0, 1.1); }
      else if (o.kind === 'frame') {
        c.fillStyle = '#1b1d22'; c.fillRect(o.x - 0.42, L + 1.45, 0.84, 0.62);
        const hue = th === THEME.lab ? 190 : th === THEME.security ? 5 : 30;
        c.fillStyle = `hsl(${hue + o.v * 40},35%,${35 + o.v * 20}%)`; c.fillRect(o.x - 0.36, L + 1.51, 0.72, 0.5);
        c.fillStyle = 'rgba(255,255,255,0.15)'; c.beginPath(); c.moveTo(o.x - 0.36, L + 1.51); c.lineTo(o.x, L + 1.85); c.lineTo(o.x + 0.36, L + 1.51); c.fill();
      } else if (o.kind === 'vent') { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(o.x - 0.3, L + 2.5, 0.6, 0.25); c.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 4; i++) c.fillRect(o.x - 0.27, L + 2.53 + i * 0.055, 0.54, 0.02); }
      else if (o.kind === 'plant') {
        c.fillStyle = '#3a2c25'; c.fillRect(o.x - 0.18, L, 0.36, 0.42);
        c.fillStyle = '#2f5a3a'; for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(o.x + (i - 2.5) * 0.08, L + 0.6 + (i % 3) * 0.12, 0.09, 0.26, (i - 2.5) * 0.3, 0, 7); c.fill(); }
      } else if (o.kind === 'sign') {
        c.fillStyle = th.accent; c.globalAlpha = 0.25; c.fillRect(o.x - 0.45, L + 2.2, 0.9, 0.22); c.globalAlpha = 1;
      }
    }
    if (th.deco === 'stripes') { c.fillStyle = 'rgba(242,194,48,0.3)'; for (let x = 0; x < W; x += 0.6) c.fillRect(x, L + 0.12, 0.3, 0.06); }
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
    const c = this.ctx; const x = l.x;
    if (l.state === 'broken') {
      c.strokeStyle = '#555'; c.lineWidth = 0.02; c.beginPath(); c.moveTo(x, L + FLOOR_H); c.lineTo(x + 0.05, L + 2.6); c.stroke();
      c.fillStyle = '#9aa6b2'; for (let i = 0; i < 5; i++) c.fillRect(x - 0.4 + i * 0.18, L, 0.1, 0.03);
      return;
    }
    const y = l.state === 'falling' ? L + l.fy : L + 2.3;
    c.strokeStyle = '#333a44'; c.lineWidth = 0.025;
    if (l.state === 'on') { c.beginPath(); c.moveTo(x, L + FLOOR_H); c.lineTo(x, y + 0.25); c.stroke(); }
    if (l.state === 'on') {
      const g = c.createRadialGradient(x, y, 0.05, x, y - 0.5, 3.2);
      g.addColorStop(0, 'rgba(255,236,190,0.45)'); g.addColorStop(0.4, 'rgba(255,220,160,0.12)'); g.addColorStop(1, 'rgba(255,220,160,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(x - 0.2, y); c.lineTo(x - 2.4, L); c.lineTo(x + 2.4, L); c.lineTo(x + 0.2, y); c.fill();
    }
    c.fillStyle = '#2b313b'; c.beginPath(); c.moveTo(x - 0.28, y); c.lineTo(x + 0.28, y); c.lineTo(x + 0.12, y + 0.25); c.lineTo(x - 0.12, y + 0.25); c.fill();
    c.fillStyle = l.state === 'on' ? '#fff3cf' : '#777'; c.beginPath(); c.ellipse(x, y, 0.2, 0.05, 0, 0, 7); c.fill();
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
    const c = this.ctx; const top = level(game.stage.floors) + FLOOR_H;
    c.fillStyle = th.floor; c.fillRect(-0.6, top - 0.32, W + 1.2, 0.32);
    c.fillStyle = '#3a404b'; c.fillRect(-0.6, top, W + 1.2, 0.5);
    c.fillStyle = '#4b5260'; c.fillRect(0.2, top + 0.5, 2.6, 2.0); c.fillStyle = '#20252e'; c.fillRect(0.75, top + 0.5, 0.9, 1.7);
    c.strokeStyle = '#4b5260'; c.lineWidth = 0.06; c.beginPath(); c.moveTo(19, top + 0.5); c.lineTo(19, top + 4); c.moveTo(18.4, top + 3); c.lineTo(19.6, top + 3); c.stroke();
    const blink = (performance.now() / 1000) % 1.4 < 0.15;
    c.fillStyle = blink ? '#ff3b30' : '#5a1512'; c.beginPath(); c.arc(19, top + 4.05, 0.08, 0, 7); c.fill();
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

  // ---- 人物 ----
  drawPlayer(game, t, dt) {
    const p = game.player;
    if (p.state === 'door') return this.drawDoorWalk(game, p, t);
    if (p.inv > 0 && p.state === 'play' && Math.floor(t * 14) % 2 === 0) return; // 無敵の点滅
    const kind = playerPoseKind(p);
    const pose = computePose(kind, { phase: p.walkPhase, t: kind === 'dead' ? p.t : t, shootT: p.shootT, hitT: p.hitT, airT: p.airT });
    if (p.state === 'dead') p.t += dt;
    this.updateScarf(p, pose, dt);
    this.drawPerson(p.x, p.y, p.face, pose, LOOK.agent, { scarf: this.scarf });
  }
  drawDoorWalk(game, p, t) {
    // ドアに入って出てくる（0.3 秒で消え、0.3 秒で現れる）
    const k = p.t > 0.8 ? (1.1 - p.t) / 0.3 : p.t < 0.3 ? 1 - p.t / 0.3 : 1;
    const c = this.ctx; c.save(); c.globalAlpha = 1 - Math.min(1, k);
    const pose = computePose('door', { t });
    this.drawPerson(p.x, p.y, p.face, pose, LOOK.agent, {});
    c.restore();
  }
  drawEnemy(game, e, t) {
    const look = LOOK.guard[e.type] || LOOK.guard[0];
    const kind = enemyPoseKind(e);
    if (kind === 'dead' && e.deadT > 1.0 && Math.floor(e.deadT * 16) % 2) return;
    const pose = computePose(kind, { phase: e.walkPhase, t: kind === 'dead' ? e.deadT : t + e.id, shootT: e.shootT, hitT: e.hitT });
    const c = this.ctx;
    if (e.state === 'spawn') { c.save(); c.globalAlpha = Math.max(0.2, 1 - e.spawnT / 0.35); }
    this.drawPerson(e.x, e.y, e.dir, pose, look, { windup: e.state === 'windup' ? 1 - Math.max(0, e.t) / game.D.windup : 0, low: e.lowShot });
    if (e.state === 'spawn') c.restore();
  }

  updateScarf(p, pose, dt) {
    const nx = p.x + pose.neck[0] * p.face, ny = p.y + pose.neck[1] - 0.05;
    if (!this.scarf) this.scarf = Array.from({ length: 5 }, () => ({ x: nx, y: ny, vx: 0, vy: 0 }));
    const pts = this.scarf;
    pts[0].x = nx; pts[0].y = ny;
    for (let i = 1; i < pts.length; i++) {
      const q = pts[i];
      q.vy -= 3 * dt; q.vx += (-p.face * 1.5 - (p.vx || 0) * 0.6) * dt;
      q.vx *= 0.9; q.vy *= 0.9;
      q.x += q.vx * dt * 8; q.y += q.vy * dt * 8;
      const a = pts[i - 1]; const dx = q.x - a.x, dy = q.y - a.y; const d = Math.hypot(dx, dy) || 1;
      const L = 0.11; q.x = a.x + dx / d * L; q.y = a.y + dy / d * L;
    }
  }

  drawPerson(x, y, face, P, look, o = {}) {
    const c = this.ctx;
    c.save();
    c.translate(x, y); c.scale(face, 1);
    const limb = (a, b, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); };
    const leg = (L, dark) => {
      limb(L.hip, L.knee, 0.17, dark ? look.pantsDark : look.pants);
      limb(L.knee, L.ankle, 0.14, dark ? look.pantsDark : look.pants);
      c.fillStyle = look.shoe; c.beginPath();
      c.moveTo(L.ankle[0] - 0.06, L.ankle[1] + 0.04); c.lineTo(L.toe[0], L.toe[1] + 0.02); c.lineTo(L.toe[0], L.toe[1] - 0.02);
      c.lineTo(L.ankle[0] - 0.08, L.toe[1] - 0.02); c.closePath(); c.fill();
    };
    const armDraw = (A, dark, gun) => {
      const sleeve = dark ? look.coatDark : look.coat;
      limb(A.shoulder, A.elbow, 0.13, sleeve);
      limb(A.elbow, A.hand, 0.11, sleeve);
      c.fillStyle = look.glove || look.skin; c.beginPath(); c.arc(A.hand[0], A.hand[1], 0.055, 0, 7); c.fill();
      if (gun) {
        c.save(); c.translate(A.hand[0], A.hand[1]); c.rotate(-(A.foreAngle - Math.PI / 2));
        c.fillStyle = look.gunDark; c.fillRect(-0.03, -0.11, 0.07, 0.11);
        c.fillStyle = look.gun; c.fillRect(-0.03, -0.01, 0.27, 0.07);
        c.fillStyle = look.gunDark; c.fillRect(0.2, 0.0, 0.05, 0.05);
        c.restore();
      }
    };
    // 奥の腕・脚
    armDraw(P.arms[1], true, false);
    leg(P.legs[1], true);
    // マフラーの後ろ側
    if (o.scarf && look.scarf) {
      c.save(); c.scale(face, 1); c.translate(-x, -y);
      c.strokeStyle = look.scarfDark; c.lineWidth = 0.09; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(o.scarf[0].x, o.scarf[0].y); for (const q of o.scarf) c.lineTo(q.x, q.y); c.stroke();
      c.restore();
    }
    // 胴（上着）
    const lean = P.lean; const hip = P.hip, sh = P.shoulder;
    const ox = Math.cos(lean), oy = -Math.sin(lean);
    const hem = look.kind === 'agent' ? 0.3 : 0.1;
    c.fillStyle = look.coat;
    c.beginPath();
    c.moveTo(sh[0] - ox * 0.15, sh[1] - oy * 0.15);
    c.quadraticCurveTo(sh[0] + ox * 0.2, sh[1] + oy * 0.2 + 0.02, sh[0] + ox * 0.16, sh[1] + oy * 0.16 - 0.04);
    c.lineTo(hip[0] + ox * 0.16 + Math.sin(lean) * -hem + 0.05, hip[1] - hem);
    c.lineTo(hip[0] - ox * 0.18 - 0.06, hip[1] - hem - 0.02);
    c.closePath(); c.fill();
    c.fillStyle = look.coatLight; c.globalAlpha = 0.5;
    c.beginPath(); c.moveTo(sh[0] + ox * 0.1, sh[1] + oy * 0.1 - 0.03); c.lineTo(hip[0] + ox * 0.13 + 0.03, hip[1] - hem + 0.05); c.lineTo(hip[0] + ox * 0.06, hip[1] - hem + 0.05); c.closePath(); c.fill();
    c.globalAlpha = 1;
    if (look.vest) { c.fillStyle = look.vest; c.beginPath(); c.moveTo(sh[0] - ox * 0.13, sh[1] - 0.08); c.lineTo(sh[0] + ox * 0.15, sh[1] - 0.08); c.lineTo(hip[0] + ox * 0.15, hip[1] + 0.12); c.lineTo(hip[0] - ox * 0.15, hip[1] + 0.12); c.fill(); }
    // ベルト
    c.strokeStyle = look.kind === 'agent' ? '#11151f' : '#1c1418'; c.lineWidth = 0.05;
    c.beginPath(); c.moveTo(hip[0] - ox * 0.17, hip[1] + 0.07); c.lineTo(hip[0] + ox * 0.16, hip[1] + 0.07); c.stroke();
    // 手前の脚
    leg(P.legs[0], false);
    // 頭
    const hd = P.head; const r = SKEL.headR;
    limb(P.shoulder, P.neck, 0.1, look.skinDark);
    c.fillStyle = look.skin; c.beginPath(); c.ellipse(hd[0], hd[1], r * 0.92, r, -lean * 0.5, 0, 7); c.fill();
    if (look.kind === 'agent') {
      c.fillStyle = look.hair;
      c.beginPath(); c.moveTo(hd[0] - r * 1.0, hd[1] - r * 0.1);
      c.quadraticCurveTo(hd[0] - r * 1.05, hd[1] + r * 1.15, hd[0] + r * 0.25, hd[1] + r * 1.08);
      c.quadraticCurveTo(hd[0] + r * 1.05, hd[1] + r * 0.9, hd[0] + r * 0.95, hd[1] + r * 0.35);
      c.quadraticCurveTo(hd[0] + r * 0.4, hd[1] + r * 0.62, hd[0] - r * 0.2, hd[1] + r * 0.45);
      c.quadraticCurveTo(hd[0] - r * 0.45, hd[1] + r * 0.1, hd[0] - r * 0.55, hd[1] - r * 0.45);
      c.closePath(); c.fill();
      c.fillStyle = '#1a1a1a'; c.beginPath(); c.ellipse(hd[0] + r * 0.55, hd[1] + r * 0.05, r * 0.09, r * 0.13, 0, 0, 7); c.fill();
      c.strokeStyle = look.skinDark; c.lineWidth = 0.012; c.beginPath(); c.moveTo(hd[0] + r * 0.88, hd[1] - r * 0.05); c.lineTo(hd[0] + r * 1.02, hd[1] - r * 0.28); c.lineTo(hd[0] + r * 0.86, hd[1] - r * 0.33); c.stroke();
      c.fillStyle = look.skinDark; c.beginPath(); c.ellipse(hd[0] - r * 0.15, hd[1] - r * 0.05, r * 0.14, r * 0.2, 0, 0, 7); c.fill();
    } else {
      // ヘルメットとバイザー（構えると光る＝撃ってくる合図）
      c.fillStyle = look.helmet;
      c.beginPath(); c.ellipse(hd[0] - r * 0.05, hd[1] + r * 0.2, r * 1.08, r * 0.95, 0, Math.PI * 0.95, Math.PI * 2.05); c.fill();
      c.fillRect(hd[0] - r * 1.1, hd[1] + r * 0.05, r * 0.5, r * 0.3);
      const glow = o.windup ? 0.4 + 0.6 * o.windup : 0;
      c.fillStyle = glow ? `rgba(255,${Math.round(220 - glow * 160)},${Math.round(150 - glow * 120)},1)` : look.visor;
      c.beginPath(); c.moveTo(hd[0] + r * 0.05, hd[1] + r * 0.18); c.lineTo(hd[0] + r * 1.0, hd[1] + r * 0.18); c.lineTo(hd[0] + r * 0.9, hd[1] - r * 0.12); c.lineTo(hd[0] + r * 0.1, hd[1] - r * 0.1); c.fill();
      if (glow) { c.fillStyle = `rgba(255,120,60,${glow * 0.35})`; c.beginPath(); c.arc(hd[0] + r * 0.6, hd[1], r * 1.2, 0, 7); c.fill(); }
      c.strokeStyle = look.helmetDark; c.lineWidth = 0.02; c.beginPath(); c.moveTo(hd[0] - r * 0.2, hd[1] - r * 0.05); c.lineTo(hd[0] + r * 0.4, hd[1] - r * 0.95); c.stroke();
    }
    // 手前の腕と銃
    armDraw(P.arms[0], false, true);
    if (look.band) { const A = P.arms[0]; c.strokeStyle = look.band; c.lineWidth = 0.14; c.beginPath(); const m = [(A.shoulder[0] * 0.6 + A.elbow[0] * 0.4), (A.shoulder[1] * 0.6 + A.elbow[1] * 0.4)]; c.moveTo(m[0] - 0.02, m[1]); c.lineTo(m[0] + 0.02, m[1]); c.stroke(); }
    // マフラーの前側（首元）
    if (o.scarf && look.scarf) { c.fillStyle = look.scarf; c.beginPath(); c.ellipse(P.neck[0] + 0.01, P.neck[1] - 0.04, 0.1, 0.06, -lean, 0, 7); c.fill(); }
    if (o.windup && o.low) { c.fillStyle = 'rgba(255,170,60,0.9)'; c.beginPath(); c.moveTo(0.35, 0.18); c.lineTo(0.55, 0.28); c.lineTo(0.55, 0.08); c.fill(); }
    c.restore();
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
    const c = this.ctx;
    for (const f of this.fx) {
      f.t += dt;
      if (f.kind === 'flash') {
        const a = 1 - f.t / f.life;
        c.fillStyle = f.enemy ? `rgba(255,150,80,${a})` : `rgba(255,245,190,${a})`;
        c.beginPath(); c.arc(f.x, f.y, 0.16 * (1 + f.t * 8), 0, 7); c.fill();
        continue;
      }
      f.vy -= f.g * dt; f.x += f.vx * dt; f.y += f.vy * dt;
      c.fillStyle = f.color; c.globalAlpha = Math.max(0, 1 - f.t / f.life);
      c.fillRect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size);
      c.globalAlpha = 1;
    }
    this.fx = this.fx.filter((f) => f.t < f.life);
    if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400);
  }

  drawLabels(game, fBot, fTop, t) {
    const c = this.ctx; const s = this.s;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.beginPath(); c.rect(this.vp.x, this.vp.y, this.vp.w, this.vp.h); c.clip();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const docFloors = new Set(game.remainingDocFloors());
    for (let f = fBot; f <= fTop; f++) {
      const L = level(f);
      const x = this.wx(-0.3), y = this.wy(L + 1.5);
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
