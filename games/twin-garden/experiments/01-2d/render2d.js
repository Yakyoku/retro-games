// ツイン・ガーデン 2D — Canvas 2D の描画（すべてベクターで、実解像度に直接描く。拡大した画像は使わない）
// 盤面の論理座標（24×18）を、表示領域に収まる倍率 k（CSS px / 単位）× devicePixelRatio で描く。
import { BOARD, C } from '/shared/core/config.js';
import { MARKS } from '/shared/ui/marks.js';
import { makeRng } from '/shared/core/rng.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const FRAME = 0.7; // 盤の縁（単位）

const THEME = {
  meadow: { g1: '#6dbb55', g2: '#4f9c42', g3: '#3c7f34', blade: ['#7fcf62', '#5daa48', '#94dc75'], frame1: '#8a5a34', frame2: '#5e3a1f', flowers: ['#ffffff', '#ffd3ea', '#ffe27a', '#c9e7ff'], sky: '#13241a', tint: null },
  dusk: { g1: '#5c9a6c', g2: '#457f58', g3: '#356748', blade: ['#6fae7b', '#4f8d60', '#86c08c'], frame1: '#6a4f6e', frame2: '#3e2c46', flowers: ['#ffd9a8', '#ffb3c1', '#fff2c2', '#d8c2ff'], sky: '#1d1624', tint: 'rgba(255,140,90,0.10)' },
  moon: { g1: '#3d6b62', g2: '#2f574f', g3: '#23443f', blade: ['#4d8277', '#3a6a60', '#5f9488'], frame1: '#36405e', frame2: '#1f2640', flowers: ['#e6f0ff', '#bfe3ff', '#fff6c8', '#d7c8ff'], sky: '#0a1020', tint: 'rgba(90,130,255,0.10)' },
};

export class Renderer2D {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.game = null;
    this.fx = [];       // 塗り・輪の演出
    this.parts = [];    // 粒子
    this.pops = [];     // 得点の文字
    this.ghosts = [];   // 捕まえた対象が跳ねて消える
    this.shake = 0;
    this.t = 0;
    this.scaleMul = 1;  // 自動画質のときだけ下げる
    this.bgKey = '';
    this.rect = { x: 0, y: 0, w: 1, h: 1 };
    this.stats = { w: 0, h: 0, dpr: 1 };
  }

  setGame(g) { this.game = g; this.fx.length = 0; this.parts.length = 0; this.pops.length = 0; this.ghosts.length = 0; }

  /** 表示領域（CSS px）を受け取り、描画バッファを実解像度にする */
  layout(area, dpr) {
    const cv = this.cv;
    const bw = BOARD.w + FRAME * 2, bh = BOARD.h + FRAME * 2;
    const k = Math.min(area.w / bw, area.h / bh);
    const w = bw * k, h = bh * k;
    this.cssRect = { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h, k };
    cv.style.left = this.cssRect.x + 'px'; cv.style.top = this.cssRect.y + 'px';
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const s = dpr * this.scaleMul;
    const pw = Math.max(1, Math.round(w * s)), ph = Math.max(1, Math.round(h * s));
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; this.bgKey = ''; }
    this.px = pw / bw; // 描画バッファの px / 単位
    this.stats = { cssW: Math.round(w), cssH: Math.round(h), w: pw, h: ph, dpr, scale: s };
  }

  /** 画面上の点（CSS px）→ 盤面座標 */
  toBoard(cx, cy) { const r = this.cssRect; return { x: (cx - r.x) / r.k - FRAME, y: (cy - r.y) / r.k - FRAME }; }

  onEvents(ev, g) {
    for (const e of ev) {
      if (e.type === 'capture') {
        this.fx.push({ kind: 'capture', poly: e.poly, t: 0, life: e.items.length ? 0.75 : 0.35, rich: e.items.length > 0 });
        for (const it of e.items) {
          const col = it.kind === 'mush' ? '#ffcf6b' : it.kind === 'plant' ? '#9cff8a' : it.kind === 'gem' ? MARKS[it.mark].color : it.kind === 'chest' ? '#ffe28a' : '#ff8a8a';
          this.burst(it.x, it.y, col, it.kind === 'chest' ? 40 : 14);
          if (it.kind === 'mush' || it.kind === 'patrol' || it.kind === 'chaser') this.ghosts.push({ ...it, t: 0 });
        }
        if (e.points > 0) {
          const c = centroid(e.poly);
          this.pops.push({ x: c.x, y: c.y, text: `+${e.points}`, sub: e.mult > 1 ? `×${e.mult.toFixed(2)}` : '', t: 0 });
        }
      } else if (e.type === 'hint') this.fx.push({ kind: 'hint', poly: e.poly, t: 0, life: 1.4, tooBig: !!e.tooBig });
      else if (e.type === 'miss') {
        this.shake = 0.5;
        const p = e.who === 'blue' ? g.blue : g.red;
        this.burst(p.x, p.y, '#ff6b6b', 40);
        if (e.who === 'both') this.burst(g.blue.x, g.blue.y, '#ff6b6b', 30);
        this.fx.push({ kind: 'flash', t: 0, life: 0.5, color: 'rgba(255,60,60,' });
      } else if (e.type === 'power') this.fx.push({ kind: 'flash', t: 0, life: 0.6, color: 'rgba(255,220,120,' });
      else if (e.type === 'plant') { const p = g.plants[e.id]; this.pops.push({ x: p.x, y: p.y - 0.4, text: `+${e.heal}`, sub: 'エネルギー', t: 0, color: '#aaffaa' }); }
      else if (e.type === 'gemsOut') this.burst(g.chest.x, g.chest.y, '#fff6b0', 50);
      else if (e.type === 'bonusHit') { this.burst(e.x, e.y, '#fff6b0', 40); this.pops.push({ x: e.x, y: e.y, text: `+${e.points}`, sub: '', t: 0 }); }
      else if (e.type === 'clear') this.fx.push({ kind: 'flash', t: 0, life: 0.8, color: 'rgba(255,255,220,' });
    }
  }

  burst(x, y, color, n) {
    const r = makeRng((x * 1000 + y * 7 + this.parts.length) | 0);
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 700) this.parts.shift();
      const a = r.next() * TAU, s = 1.5 + r.next() * 4.5;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: 0, max: 0.5 + r.next() * 0.6, color, size: 0.05 + r.next() * 0.09 });
    }
  }

  render(g, alpha, dt) {
    this.t += dt;
    const ctx = this.ctx, px = this.px;
    const theme = THEME[g ? g.def.theme : 'meadow'] || THEME.meadow;
    const key = `${this.cv.width}x${this.cv.height}:${g ? g.def.theme : 'meadow'}:${g ? (g.kind === 'bonus' ? 'b' : g.def.number) : 0}`;
    if (key !== this.bgKey) { this.bg = this.paintBackground(theme, g); this.bgKey = key; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let sx = 0, sy = 0;
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); const a = this.shake * 0.25 * px; sx = Math.sin(this.t * 61) * a; sy = Math.cos(this.t * 47) * a; }
    ctx.drawImage(this.bg, sx, sy);
    ctx.setTransform(px, 0, 0, px, (FRAME * px) + sx, (FRAME * px) + sy);
    if (!g) { this.drawIdle(ctx); return; }

    const ip = (o) => ({ x: lerp(o.px, o.x, alpha), y: lerp(o.py, o.y, alpha) });
    const t = this.t;
    // 植物
    for (const p of g.plants) this.drawPlant(ctx, p, t);
    // ボーナスの目印
    if (g.kind === 'bonus') this.drawBonus(ctx, g, t);
    // 演出（塗り）
    for (const f of this.fx) if (f.kind !== 'flash') this.drawFx(ctx, f);
    // 杭
    const anchored = new Set(g.rope.anchors.map((a) => a.peg));
    for (let i = 0; i < g.pegs.length; i++) this.drawPeg(ctx, g.pegs[i], anchored.has(i), t);
    // 宝箱・宝
    if (g.chest) this.drawChest(ctx, g.chest, t);
    for (const gm of g.gems) if (gm.alive) this.drawGem(ctx, ip(gm), gm.mark, t + gm.id);
    // 回収対象
    for (const m of g.mush) if (m.alive) this.drawMush(ctx, ip(m), m, t);
    // 敵
    for (const e of g.enemies) if (e.alive) { const p = ip(e); if (e.kind === 'patrol') this.drawBeetle(ctx, p, e.h, t + e.id); else this.drawBurr(ctx, p, e.h, t + e.id); }
    // 捕まえたもの（跳ねて消える）
    for (const gh of this.ghosts) this.drawGhost(ctx, gh, dt);
    this.ghosts = this.ghosts.filter((gh) => gh.t < 0.6);
    // ライン
    const red = ip(g.red), blue = ip(g.blue);
    this.drawRope(ctx, g, red, blue, t);
    // 自機
    const blink = g.invulnT > 0 && Math.floor(t * 12) % 2 === 0;
    const power = g.powerT > 0;
    if (g.phase !== 'miss' || Math.floor(t * 8) % 2) {
      this.drawRed(ctx, red, g.red, t, power, blink);
      this.drawBlue(ctx, blue, g.blue, t, power, blink);
    }
    // 粒子・文字
    this.drawParticles(ctx, dt);
    this.drawPops(ctx, dt);
    // 強化中の縁の光
    if (power) {
      const a = 0.35 + 0.2 * Math.sin(t * 10);
      ctx.save(); ctx.lineWidth = 0.22; ctx.strokeStyle = `rgba(255,215,110,${a})`; ctx.strokeRect(0.1, 0.1, BOARD.w - 0.2, BOARD.h - 0.2); ctx.restore();
    }
    // 画面全体の光（ミス・強化・クリア）
    for (const f of this.fx) if (f.kind === 'flash') { ctx.fillStyle = f.color + (0.28 * (1 - f.t / f.life)).toFixed(3) + ')'; ctx.fillRect(-FRAME, -FRAME, BOARD.w + 2 * FRAME, BOARD.h + 2 * FRAME); }
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.life);
  }

  // ───────── 背景（面ごとに 1 回、実解像度で焼く） ─────────
  paintBackground(th, g) {
    const W = this.cv.width, H = this.cv.height, px = this.px;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.fillStyle = th.sky; c.fillRect(0, 0, W, H);
    c.setTransform(px, 0, 0, px, FRAME * px, FRAME * px);
    // 縁（木の枠）
    const fr = c.createLinearGradient(0, -FRAME, 0, BOARD.h + FRAME);
    fr.addColorStop(0, th.frame1); fr.addColorStop(1, th.frame2);
    c.fillStyle = fr; roundRect(c, -FRAME + 0.05, -FRAME + 0.05, BOARD.w + FRAME * 2 - 0.1, BOARD.h + FRAME * 2 - 0.1, 0.6); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 0.05; roundRect(c, -FRAME + 0.15, -FRAME + 0.15, BOARD.w + FRAME * 2 - 0.3, BOARD.h + FRAME * 2 - 0.3, 0.5); c.stroke();
    // 木目
    const r = makeRng(g ? g.def.number * 31 + 7 : 3);
    c.save(); c.globalAlpha = 0.18; c.strokeStyle = '#000'; c.lineWidth = 0.025;
    for (let i = 0; i < 40; i++) { const y = -FRAME + r.next() * (BOARD.h + 2 * FRAME); c.beginPath(); c.moveTo(-FRAME, y); c.bezierCurveTo(6, y + r.range(-0.2, 0.2), 18, y + r.range(-0.2, 0.2), BOARD.w + FRAME, y); c.stroke(); }
    c.restore();
    // 芝
    c.save();
    roundRect(c, 0, 0, BOARD.w, BOARD.h, 0.25); c.clip();
    const gg = c.createRadialGradient(BOARD.w / 2, BOARD.h / 2, 2, BOARD.w / 2, BOARD.h / 2, 16);
    gg.addColorStop(0, th.g1); gg.addColorStop(0.7, th.g2); gg.addColorStop(1, th.g3);
    c.fillStyle = gg; c.fillRect(0, 0, BOARD.w, BOARD.h);
    // 芝刈りの縞
    c.globalAlpha = 0.06; c.fillStyle = '#fff';
    for (let x = 0; x < BOARD.w; x += 2) c.fillRect(x, 0, 1, BOARD.h);
    c.globalAlpha = 1;
    // 葉（細い線を多数）
    const n = Math.min(9000, Math.round(BOARD.w * BOARD.h * 14));
    c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = r.next() * BOARD.w, y = r.next() * BOARD.h, l = 0.08 + r.next() * 0.16, a = -Math.PI / 2 + r.range(-0.6, 0.6);
      c.strokeStyle = th.blade[i % 3]; c.globalAlpha = 0.35 + r.next() * 0.4; c.lineWidth = 0.018 + r.next() * 0.02;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 0.03, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
    }
    c.globalAlpha = 1;
    // 小花とクローバー
    for (let i = 0; i < 70; i++) {
      const x = r.next() * BOARD.w, y = r.next() * BOARD.h, col = th.flowers[i % th.flowers.length];
      c.fillStyle = col; c.globalAlpha = 0.75;
      for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; c.beginPath(); c.arc(x + Math.cos(a) * 0.06, y + Math.sin(a) * 0.06, 0.045, 0, TAU); c.fill(); }
      c.fillStyle = '#ffd34d'; c.beginPath(); c.arc(x, y, 0.035, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
    // 池（夕暮れ）・月明かり
    if (th === THEME.dusk) { c.fillStyle = 'rgba(60,120,160,0.16)'; for (const [x, y, rr] of [[3, 15.5, 1.6], [21.5, 2.2, 1.3]]) { c.beginPath(); c.ellipse(x, y, rr * 1.3, rr * 0.8, 0.3, 0, TAU); c.fill(); } }
    if (th.tint) { c.fillStyle = th.tint; c.fillRect(0, 0, BOARD.w, BOARD.h); }
    if (th === THEME.moon) { const m = c.createRadialGradient(18, 3, 0, 18, 3, 14); m.addColorStop(0, 'rgba(200,220,255,0.18)'); m.addColorStop(1, 'rgba(200,220,255,0)'); c.fillStyle = m; c.fillRect(0, 0, BOARD.w, BOARD.h); }
    // 周辺減光
    const v = c.createRadialGradient(BOARD.w / 2, BOARD.h / 2, 8, BOARD.w / 2, BOARD.h / 2, 16);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.28)');
    c.fillStyle = v; c.fillRect(0, 0, BOARD.w, BOARD.h);
    c.restore();
    // 内側の影
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.12; roundRect(c, 0.04, 0.04, BOARD.w - 0.08, BOARD.h - 0.08, 0.25); c.stroke();
    return cv;
  }

  drawIdle(ctx) {
    // タイトル中: 赤と青がゆっくり回る
    const t = this.t;
    const red = { x: 12 + Math.cos(t * 0.6) * 5, y: 9 + Math.sin(t * 0.6) * 3.5 }, blue = { x: 12 - Math.cos(t * 0.6) * 5, y: 9 - Math.sin(t * 0.6) * 3.5 };
    ctx.save(); ctx.globalAlpha = 0.55;
    this.drawPeg(ctx, { x: 12, y: 9 }, false, t);
    ctx.lineWidth = 0.14; ctx.strokeStyle = this.ropeGrad(ctx, red, blue); ctx.beginPath(); ctx.moveTo(red.x, red.y); ctx.lineTo(blue.x, blue.y); ctx.stroke();
    this.drawRed(ctx, red, { px: red.x, py: red.y, x: red.x, y: red.y }, t, false, false);
    this.drawBlue(ctx, blue, { px: blue.x, py: blue.y, x: blue.x, y: blue.y }, t, false, false);
    ctx.restore();
  }

  // ───────── 部品 ─────────
  ropeGrad(ctx, a, b) {
    const gr = ctx.createLinearGradient(a.x, a.y, b.x + 1e-3, b.y + 1e-3);
    gr.addColorStop(0, '#ff6a6f'); gr.addColorStop(0.5, '#f4e6ff'); gr.addColorStop(1, '#5fb4ff');
    return gr;
  }

  drawRope(ctx, g, red, blue, t) {
    const pts = [red, ...g.rope.anchors.map((a) => g.pegs[a.peg]), blue];
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const path = () => { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); };
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 0.2; ctx.translate(0.08, 0.12); path(); ctx.stroke(); ctx.translate(-0.08, -0.12);
    ctx.globalAlpha = 0.35; ctx.lineWidth = 0.34; ctx.strokeStyle = this.ropeGrad(ctx, red, blue); path(); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 0.13; path(); ctx.stroke();
    ctx.lineWidth = 0.045; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; path(); ctx.stroke();
    // 流れる光の粒（ラインが生きている感じ）
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(l); total += l; }
    if (total > 0.1) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let k = 0; k < Math.min(24, Math.floor(total / 1.5)); k++) {
        let d = ((t * 2.2 + k * 1.5) % total), i = 0;
        while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
        const u = seg[i] ? d / seg[i] : 0;
        const x = lerp(pts[i].x, pts[i + 1].x, u), y = lerp(pts[i].y, pts[i + 1].y, u);
        ctx.beginPath(); ctx.arc(x, y, 0.045, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  drawPeg(ctx, p, on, t) {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(0.12, 0.16, 0.34, 0.24, 0, 0, TAU); ctx.fill();
    if (on) { ctx.fillStyle = `rgba(255,240,200,${0.25 + 0.15 * Math.sin(t * 8)})`; ctx.beginPath(); ctx.arc(0, 0, 0.52, 0, TAU); ctx.fill(); }
    const gr = ctx.createRadialGradient(-0.09, -0.1, 0.02, 0, 0, 0.3);
    gr.addColorStop(0, '#f2e6cf'); gr.addColorStop(0.55, '#b89a74'); gr.addColorStop(1, '#6b5238');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 0.28, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,20,0.7)'; ctx.lineWidth = 0.035; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.arc(0, 0, 0.17, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#5a442e'; ctx.beginPath(); ctx.arc(0, 0, 0.06, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawPlayerBase(ctx, p, o, t, power, blink, color, dark, shape, mark) {
    const vx = o.x - o.px, vy = o.y - o.py, moving = Math.hypot(vx, vy) > 1e-4;
    const bob = Math.sin(t * (moving ? 14 : 4) + (shape === 'round' ? 0 : 1.3)) * (moving ? 0.04 : 0.025);
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0.08, 0.3, 0.38, 0.17, 0, 0, TAU); ctx.fill();
    if (power) { const a = 0.4 + 0.25 * Math.sin(t * 12); ctx.fillStyle = `rgba(255,220,110,${a})`; ctx.beginPath(); ctx.arc(0, bob, 0.68, 0, TAU); ctx.fill(); }
    if (blink) ctx.globalAlpha = 0.35;
    ctx.translate(0, bob - 0.05);
    const sq = moving ? 0.06 : 0;
    ctx.scale(1 + sq, 1 - sq);
    const gr = ctx.createRadialGradient(-0.14, -0.16, 0.04, 0, 0, 0.5);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, color); gr.addColorStop(1, dark);
    ctx.fillStyle = gr; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.04;
    ctx.beginPath();
    if (shape === 'round') ctx.arc(0, 0, 0.42, 0, TAU); else roundRect(ctx, -0.39, -0.39, 0.78, 0.78, 0.2);
    ctx.fill(); ctx.stroke();
    // 目（進む向きを見る）
    const l = Math.hypot(vx, vy) || 1, ex = moving ? (vx / l) * 0.07 : 0, ey = moving ? (vy / l) * 0.05 : 0;
    ctx.fillStyle = '#fff';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.13 + ex, -0.08 + ey, 0.075, 0.095, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#1a1420';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 0.13 + ex * 1.5, -0.07 + ey * 1.5, 0.04, 0, TAU); ctx.fill(); }
    // 印（色だけでなく形で見分ける）
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    if (mark === 'tri') { ctx.beginPath(); ctx.moveTo(0, 0.08); ctx.lineTo(0.12, 0.29); ctx.lineTo(-0.12, 0.29); ctx.closePath(); ctx.fill(); }
    else { ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(0, 0.2, 0.085, 0, TAU); ctx.stroke(); }
    // 頭の飾り
    if (shape === 'round') { ctx.fillStyle = '#4fbf5a'; ctx.beginPath(); ctx.ellipse(0.06, -0.47, 0.07, 0.15, 0.6, 0, TAU); ctx.fill(); }
    else { ctx.fillStyle = '#ffe48a'; ctx.beginPath(); ctx.arc(0, -0.45, 0.07, 0, TAU); ctx.fill(); ctx.fillRect(-0.015, -0.45, 0.03, 0.08); }
    ctx.restore();
  }
  drawRed(ctx, p, o, t, pw, bl) { this.drawPlayerBase(ctx, p, o, t, pw, bl, '#ff5a5f', '#8e1c24', 'round', 'tri'); }
  drawBlue(ctx, p, o, t, pw, bl) { this.drawPlayerBase(ctx, p, o, t, pw, bl, '#4aa8ff', '#13417e', 'square', 'ring'); }

  drawMush(ctx, p, m, t) {
    const hop = Math.abs(Math.sin(t * 3.2 + m.id * 1.7)) * 0.12;
    const caps = [['#ff6b4a', '#9c2a1a'], ['#ffa94a', '#a5521a'], ['#e85d8c', '#86203f']];
    const [c1, c2] = caps[m.id % 3];
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0.04, 0.2, 0.26 - hop * 0.6, 0.1, 0, 0, TAU); ctx.fill();
    ctx.translate(0, -hop);
    const sq = 1 + (0.12 - hop) * 0.5;
    ctx.scale(sq, 2 - sq);
    ctx.fillStyle = '#fff1d6'; roundRect(ctx, -0.13, -0.05, 0.26, 0.26, 0.09); ctx.fill();
    ctx.fillStyle = '#2a1a14'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 0.055, 0.07, 0.025, 0, TAU); ctx.fill(); }
    const gr = ctx.createRadialGradient(-0.08, -0.18, 0.02, 0, -0.06, 0.32);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, c1); gr.addColorStop(1, c2);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, -0.06, 0.3, 0.22, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.025; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [x, y, r] of [[-0.14, -0.13, 0.045], [0.04, -0.2, 0.055], [0.17, -0.1, 0.04]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  drawBeetle(ctx, p, h, t) {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(0.07, 0.18, 0.44, 0.24, 0, 0, TAU); ctx.fill();
    ctx.rotate(h + Math.PI / 2);
    // 脚
    ctx.strokeStyle = '#2a1636'; ctx.lineWidth = 0.05; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const w = Math.sin(t * 14 + i * 2 + (s > 0 ? Math.PI : 0)) * 0.06; ctx.beginPath(); ctx.moveTo(s * 0.15, -0.12 + i * 0.13); ctx.lineTo(s * 0.4, -0.18 + i * 0.16 + w); ctx.stroke(); }
    // とげ
    ctx.fillStyle = '#ffd1f0';
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 0.26, Math.sin(a) * 0.33); ctx.lineTo(Math.cos(a + 0.18) * 0.4, Math.sin(a + 0.18) * 0.47); ctx.lineTo(Math.cos(a + 0.36) * 0.26, Math.sin(a + 0.36) * 0.33); ctx.fill(); }
    const gr = ctx.createRadialGradient(-0.08, -0.1, 0.03, 0, 0, 0.4);
    gr.addColorStop(0, '#d38cff'); gr.addColorStop(0.5, '#7a2fb0'); gr.addColorStop(1, '#311046');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, 0, 0.3, 0.37, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.03; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.moveTo(0, -0.3); ctx.lineTo(0, 0.34); ctx.stroke();
    ctx.fillStyle = '#ffef5a'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 0.1, -0.27, 0.05, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  drawBurr(ctx, p, h, t) {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0.06, 0.24, 0.36, 0.16, 0, 0, TAU); ctx.fill();
    const fl = Math.sin(t * 6) * 0.04;
    ctx.translate(0, -0.08 + fl);
    ctx.save(); ctx.rotate(t * 2.4);
    ctx.fillStyle = '#ff9a3c';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.2) * 0.22, Math.sin(a - 0.2) * 0.22); ctx.lineTo(Math.cos(a) * 0.46, Math.sin(a) * 0.46); ctx.lineTo(Math.cos(a + 0.2) * 0.22, Math.sin(a + 0.2) * 0.22); ctx.fill(); }
    ctx.restore();
    const gr = ctx.createRadialGradient(-0.07, -0.08, 0.02, 0, 0, 0.3);
    gr.addColorStop(0, '#ffe08a'); gr.addColorStop(0.45, '#ff5a2a'); gr.addColorStop(1, '#7a1408');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 0.27, 0, TAU); ctx.fill();
    // 怒った目（追ってくる向きを見る）
    const ex = Math.cos(h) * 0.05, ey = Math.sin(h) * 0.05;
    ctx.fillStyle = '#fff'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.1 + ex, -0.02 + ey, 0.06, 0.05, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#200'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 0.1 + ex * 1.6, -0.01 + ey * 1.6, 0.03, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = '#3a0800'; ctx.lineWidth = 0.035; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 0.18, -0.1); ctx.lineTo(s * 0.04, -0.06); ctx.stroke(); }
    ctx.restore();
  }

  drawPlant(ctx, p, t) {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = '#6b4a2e'; ctx.beginPath(); ctx.ellipse(0, 0.1, 0.36, 0.16, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(-0.08, 0.05, 0.16, 0.05, 0, 0, TAU); ctx.fill();
    const sway = Math.sin(t * 2 + p.id) * 0.12;
    if (p.grow === 0) { ctx.fillStyle = '#c9a06a'; ctx.beginPath(); ctx.ellipse(0, 0.05, 0.06, 0.04, 0, 0, TAU); ctx.fill(); }
    else {
      const s = p.grow === 1 ? 0.6 : 1;
      ctx.rotate(sway * 0.4); ctx.scale(s, s);
      ctx.strokeStyle = '#2f7d32'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(0, 0.08); ctx.quadraticCurveTo(0.05, -0.3, 0, -0.55); ctx.stroke();
      ctx.fillStyle = '#5ccf5a';
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sd * 0.17, -0.18, 0.18, 0.08, sd * -0.5, 0, TAU); ctx.fill(); }
      if (p.grow === 2) {
        const bloom = 1 + Math.sin(t * 3 + p.id) * 0.06;
        ctx.translate(0, -0.6); ctx.scale(bloom, bloom);
        ctx.fillStyle = '#ff8fc8';
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + t * 0.3; ctx.beginPath(); ctx.ellipse(Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0.13, 0.08, a, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.arc(0, 0, 0.1, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(-0.03, -0.03, 0.035, 0, TAU); ctx.fill();
      } else { ctx.fillStyle = '#a6f58a'; ctx.beginPath(); ctx.ellipse(0, -0.6, 0.07, 0.11, 0, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }

  drawChest(ctx, ch, t) {
    const open = Math.min(1, ch.t / 48);
    ctx.save(); ctx.translate(ch.x, ch.y);
    const glow = ctx.createRadialGradient(0, -0.2, 0, 0, -0.2, 1.2);
    glow.addColorStop(0, `rgba(255,240,170,${0.55 * open})`); glow.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, -0.2, 1.2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0.06, 0.32, 0.55, 0.18, 0, 0, TAU); ctx.fill();
    const wood = ctx.createLinearGradient(0, -0.2, 0, 0.32); wood.addColorStop(0, '#b0733b'); wood.addColorStop(1, '#6a3d1a');
    ctx.fillStyle = wood; roundRect(ctx, -0.48, -0.12, 0.96, 0.44, 0.06); ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.fillRect(-0.48, -0.02, 0.96, 0.06); ctx.fillRect(-0.06, -0.12, 0.12, 0.44);
    // ふた（開く）
    ctx.save(); ctx.translate(0, -0.12); ctx.scale(1, 1 - open * 1.7);
    ctx.fillStyle = '#c4874a'; ctx.beginPath(); ctx.moveTo(-0.48, 0); ctx.quadraticCurveTo(0, -0.42, 0.48, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.fillRect(-0.06, -0.3, 0.12, 0.3);
    ctx.restore();
    ctx.restore();
  }

  drawGem(ctx, p, mark, t) {
    const m = MARKS[mark];
    ctx.save(); ctx.translate(p.x, p.y - 0.1 + Math.sin(t * 4) * 0.06);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 0.32, 0.22, 0.08, 0, 0, TAU); ctx.fill();
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.6); glow.addColorStop(0, m.color + 'aa'); glow.addColorStop(1, m.color + '00');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 0.6, 0, TAU); ctx.fill();
    ctx.scale(0.34, 0.34);
    ctx.beginPath(); m.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    ctx.fillStyle = m.color; ctx.fill(); ctx.lineWidth = 0.14; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
  }

  drawBonus(ctx, g, t) {
    const b = g.bonus;
    if (b.type === 'memory' && b.showT > 0) {
      const s = b.spot, a = Math.min(1, b.showT / 30);
      ctx.save(); ctx.globalAlpha = a;
      const gl = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 1.6); gl.addColorStop(0, 'rgba(255,245,170,0.9)'); gl.addColorStop(1, 'rgba(255,245,170,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(s.x, s.y, 1.6, 0, TAU); ctx.fill();
      this.drawChest(ctx, { x: s.x, y: s.y, t: 0 }, t);
      ctx.restore();
    }
    if (b.type === 'precision' && b.k < b.def.targets.length) {
      const p = b.def.targets[b.k], r = Math.sqrt(b.def.maxArea / Math.PI);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.setLineDash([0.2, 0.15]); ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      this.drawPlant(ctx, { x: p.x, y: p.y, grow: 2, id: b.k }, t);
    }
  }

  drawFx(ctx, f) {
    const u = f.t / f.life;
    ctx.save();
    ctx.beginPath(); f.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
    if (f.kind === 'capture') {
      ctx.fillStyle = f.rich ? `rgba(255,248,200,${0.55 * (1 - u)})` : `rgba(255,255,255,${0.25 * (1 - u)})`; ctx.fill('evenodd');
      ctx.strokeStyle = `rgba(255,255,255,${1 - u})`; ctx.lineWidth = 0.08 + u * 0.3; ctx.lineJoin = 'round'; ctx.stroke();
    } else {
      const a = 0.35 * (1 - u) * (0.6 + 0.4 * Math.sin(f.t * 18));
      ctx.fillStyle = f.tooBig ? `rgba(255,170,90,${a})` : `rgba(90,220,255,${a})`; ctx.fill('evenodd');
      const c = centroid(f.poly);
      ctx.fillStyle = `rgba(255,255,255,${1 - u})`; ctx.font = `800 1.1px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(f.tooBig ? '大' : '？', c.x, c.y - u * 0.6);
    }
    ctx.restore();
  }

  drawGhost(ctx, gh, dt) {
    gh.t += dt;
    const u = gh.t / 0.6;
    ctx.save(); ctx.globalAlpha = 1 - u; ctx.translate(gh.x, gh.y - u * 1.2); ctx.scale(1 + u * 0.4, 1 + u * 0.4);
    ctx.fillStyle = gh.kind === 'mush' ? '#ffcf6b' : '#ff9a9a'; ctx.beginPath(); ctx.arc(0, 0, 0.25, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '800 0.32px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', 0, 0.01);
    ctx.restore();
  }

  drawParticles(ctx, dt) {
    for (const p of this.parts) {
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 6 * dt; p.vx *= 1 - dt * 2;
      const a = 1 - p.life / p.max;
      if (a <= 0) continue;
      ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.parts = this.parts.filter((p) => p.life < p.max);
  }

  drawPops(ctx, dt) {
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of this.pops) {
      p.t += dt;
      const u = p.t / 1.2, a = u < 0.8 ? 1 : 1 - (u - 0.8) / 0.2;
      const y = p.y - 0.6 - u * 0.8, s = 1 + Math.max(0, 0.3 - p.t) * 1.5;
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = `900 ${0.75 * s}px system-ui, sans-serif`;
      ctx.lineWidth = 0.14; ctx.strokeStyle = 'rgba(20,10,0,0.75)'; ctx.strokeText(p.text, p.x, y);
      ctx.fillStyle = p.color || '#ffe27a'; ctx.fillText(p.text, p.x, y);
      if (p.sub) { ctx.font = `800 0.42px system-ui, sans-serif`; ctx.lineWidth = 0.1; ctx.strokeText(p.sub, p.x, y + 0.6); ctx.fillStyle = '#fff'; ctx.fillText(p.sub, p.x, y + 0.6); }
    }
    ctx.restore();
    this.pops = this.pops.filter((p) => p.t < 1.2);
  }
}

function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
export function centroid(poly) { let x = 0, y = 0; for (const p of poly) { x += p.x; y += p.y; } return { x: x / poly.length, y: y / poly.length }; }
export { FRAME };
