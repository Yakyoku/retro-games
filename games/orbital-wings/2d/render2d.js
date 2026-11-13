// ORBITAL WINGS 2D — Canvas 2D の描画。すべてベクターで実解像度に描く（4K でも拡大ぼけしない）。
// 1u = S px。ワールド座標（y 上向き）をそのまま使えるよう変換行列を設定して描く。
import { VIEW_W, VIEW_H, PLAYER, OPTION, SHIELD } from '../shared/config.js';
import { BOSS } from '../shared/bosses.js';
import { fbm, hash1 } from '../shared/rng.js';
import { install as installBg } from './background2d.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export class Render2D {
  constructor() { this.parts = []; this.flashes = []; this.scale = 1; this.ft = []; this.lastNow = 0; this.shakeT = 0; this.boomQ = []; }

  init(app) {
    this.app = app;
    const c = this.canvas = document.createElement('canvas');
    c.className = 'game-canvas';
    app.root.prepend(c);
    this.ctx = c.getContext('2d', { alpha: false, desynchronized: true });
    this.applySettings(app.settings);
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(app.root);
    addEventListener('resize', () => this.resize());
    visualViewport?.addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    setInterval(() => this.resize(), 1000);       // ブラウザの UI の出し入れで resize が来ない場合の見回り
    this.resize();
  }
  applySettings(s) {
    this.quality = s.quality;
    this.qScale = { auto: this.qScale || 1, high: 1, medium: 0.75, low: 0.5 }[s.quality] ?? 1;
    if (s.quality !== 'auto') this.qScale = { high: 1, medium: 0.75, low: 0.5 }[s.quality];
    this.app.root.classList.toggle('retro', !!s.retro);
    this.resize(true);
  }
  resize(force) {
    const r = this.app.root.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 4);
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    // 16:9 の盤面を最大に入れる（縦長なら上下に余白）
    let cw = w, ch = w * 9 / 16; if (ch > h) { ch = h; cw = h * 16 / 9; }
    const k = this.qScale;
    const bw = Math.round(cw * dpr * k), bh = Math.round(ch * dpr * k);
    if (!force && this.bw === bw && this.bh === bh && this.cssW === cw) return;
    this.bw = bw; this.bh = bh; this.cssW = cw; this.cssH = ch; this.dpr = dpr;
    const c = this.canvas;
    c.width = bw; c.height = bh;
    c.style.width = cw + 'px'; c.style.height = ch + 'px';
    c.style.left = (w - cw) / 2 + 'px'; c.style.top = (h - ch) / 2 + 'px';
    this.app.root.style.setProperty('--pw', cw + 'px');
    this.app.root.style.setProperty('--ph', ch + 'px');
    this.app.root.style.setProperty('--px', (w - cw) / 2 + 'px');
    this.app.root.style.setProperty('--py', (h - ch) / 2 + 'px');
    this.S = bw / VIEW_W;
    this.stageCache = null;
  }
  debugText() { return `canvas ${this.bw}×${this.bh} (css ${Math.round(this.cssW)}×${Math.round(this.cssH)} dpr ${this.dpr} q ${this.qScale.toFixed(2)})`; }

  // 自動画質: 描画間隔を見て、継続的に遅いときだけ下げる（下限 0.5、2 秒の窓、余裕が 6 秒続けば戻す）
  autoQuality(dt) {
    if (this.quality !== 'auto' || !dt || dt > 0.25) return;
    this.ft.push(dt); if (this.ft.length > 120) this.ft.shift();
    this.qT = (this.qT || 0) + dt;
    if (this.qT < 2 || this.ft.length < 60) return;
    const avg = this.ft.reduce((a, b) => a + b, 0) / this.ft.length;
    if (avg > 1 / 50 && this.qScale > 0.5) { this.qScale = Math.max(0.5, this.qScale * 0.85); this.qT = 0; this.ft = []; this.good = 0; this.resize(true); }
    else if (avg < 1 / 58) { this.good = (this.good || 0) + this.qT; this.qT = 0; if (this.good > 6 && this.qScale < 1) { this.qScale = Math.min(1, this.qScale + 0.1); this.good = 0; this.resize(true); } }
    else { this.qT = 0; this.good = 0; }
  }

  setStage(stage) { this.stage = stage; this.stageCache = null; this.parts = []; }
  onEvent(ev, g, demo) {
    switch (ev.t) {
      case 'explode': this.explode(ev.x, ev.y, ev.size, ev.kind); break;
      case 'spark': this.spark(ev.x, ev.y, ev.armor, ev.big); break;
      case 'bossdown': this.bossBoom = { t: 0, e: g.boss }; break;
      case 'vent': if (Math.random() < 0.25) this.parts.push({ k: 'smoke', x: ev.x + (Math.random() - 0.5), y: ev.y, vx: -0.3, vy: ev.up * (1 + Math.random()), life: 0, max: 1.6, s: 0.5 + Math.random() * 0.6, c: '#ff7a2a' }); break;
      case 'dust': for (let i = 0; i < 6; i++) this.parts.push({ k: 'smoke', x: ev.x + (Math.random() - 0.5) * 1.5, y: ev.y, vx: 0, vy: -1, life: 0, max: 0.8, s: 0.4, c: '#9a8a6a' }); break;
      case 'die': this.shakeT = 0.25; break;
      case 'phase': this.flashes.push({ life: 0, max: 0.4 }); break;
    }
  }
  explode(x, y, size = 's', kind) {
    const n = { s: 10, m: 18, l: 34, p: 26 }[size] || 10;
    const R = { s: 0.6, m: 1.2, l: 2.4, p: 1.0 }[size] || 0.6;
    const hot = kind === 'flesh' || kind === 'cell' ? ['#ffd0e0', '#ff4a7a', '#8a1030'] : ['#fff6d0', '#ffae3a', '#d8401a'];
    this.parts.push({ k: 'ring', x, y, life: 0, max: 0.35, s: R * 2.2, c: hot[0] });
    this.parts.push({ k: 'flash', x, y, life: 0, max: 0.12, s: R * 2.4, c: '#ffffff' });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = (0.6 + Math.random() * 2.2) * R * 2.4;
      this.parts.push({ k: 'fire', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: -Math.random() * 0.12 * (size === 'l' ? 3 : 1), max: 0.45 + Math.random() * 0.35, s: R * (0.5 + Math.random() * 0.6), c: hot[1], c2: hot[2] });
    }
    for (let i = 0; i < n / 2; i++) {
      const a = Math.random() * TAU, sp = 3 + Math.random() * 7;
      this.parts.push({ k: 'debris', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.5 + Math.random() * 0.5, s: 0.08 + Math.random() * 0.12, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 20, c: kind === 'stonehead' || kind === 'rock' || kind === 'brick' ? '#b8ae98' : '#d8dce8' });
    }
    for (let i = 0; i < n / 3; i++) this.parts.push({ k: 'smoke', x: x + (Math.random() - 0.5) * R, y: y + (Math.random() - 0.5) * R, vx: (Math.random() - 0.5), vy: 0.3 + Math.random() * 0.4, life: -0.1, max: 1.0 + Math.random() * 0.6, s: R * (0.6 + Math.random() * 0.5), c: '#40384a' });
    if (this.parts.length > 1400) this.parts.splice(0, this.parts.length - 1400);
  }
  spark(x, y, armor, big) {
    const n = big ? 8 : 4;
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (Math.random() - 0.5) * 2.4, sp = 4 + Math.random() * 6;
      this.parts.push({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.15 + Math.random() * 0.15, s: 0.06, c: armor ? '#bfe6ff' : '#fff0a0' });
    }
    if (big) this.parts.push({ k: 'flash', x, y, life: 0, max: 0.1, s: 0.9, c: '#ffd080' });
  }

  // ---- 1 フレーム -------------------------------------------------------------
  render(g, alpha, now) {
    const dt = this.lastNow ? Math.min(0.1, now - this.lastNow) : 1 / 60; this.lastNow = now;
    this.autoQuality(dt);
    const ctx = this.ctx, S = this.S;
    if (!g) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.bw, this.bh); return; }
    if (g.stage !== this.stage) this.setStage(g.stage);
    if (!this.stageCache) this.buildStageCache();
    const pal = this.stage.pal;
    const cam = g.camX - (g.scrollD || 0) * (1 - alpha);
    this.cam = cam; this.alpha = alpha; this.now = now; this.g = g;
    let shx = 0, shy = 0;
    if (this.shakeT > 0) { this.shakeT -= dt; shx = Math.sin(now * 90) * 0.12 * this.shakeT * 4; shy = Math.cos(now * 77) * 0.12 * this.shakeT * 4; }
    // ワールド変換（y 上向き）
    const W = (cx) => ctx.setTransform(S, 0, 0, -S, (-cx + shx) * S, (VIEW_H + shy) * S);
    this.W = W;
    this.drawSky(cam, pal, now);
    this.drawFar(cam, pal, now);
    W(cam);
    this.drawTerrain(g, cam, pal);
    // 敵・カプセル・自機・弾
    for (const e of g.enemies) this.drawEnemy(e, g, alpha);
    for (const c of g.capsules) this.drawCapsule(c, alpha, now);
    this.drawPlayer(g, alpha, now);
    for (const s of g.shots) this.drawShot(s, alpha);
    this.drawParticles(dt);
    this.drawFront?.(g, cam, pal, now, dt);     // 前景（背景側の担当。敵弾より下に描く）
    W(cam);
    for (const b of g.ebullets) this.drawBullet(b, alpha, now);
    this.drawBossBoom(g, dt);
    // 画面の閃光（フェーズ移行）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const f of this.flashes) { f.life += dt; ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - f.life / f.max)})`; ctx.fillRect(0, 0, this.bw, this.bh); }
    this.flashes = this.flashes.filter((f) => f.life < f.max);
    // 奥行きの霧（盤面の上下端）
    const vg = ctx.createLinearGradient(0, 0, 0, this.bh);
    vg.addColorStop(0, 'rgba(0,0,0,0.35)'); vg.addColorStop(0.08, 'rgba(0,0,0,0)'); vg.addColorStop(0.92, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, this.bw, this.bh);
  }

  drawPlayer(g, a, now) {
    const p = g.player, ctx = this.ctx;
    // オプション（自機の後ろに続く発光体）
    for (let i = 0; i < g.power.options; i++) {
      const o = g.optionPos(i), po = g.prevOpt?.[i] || o;
      const x = lerp(po.x, o.x, a) - (g.scrollD || 0) * (1 - a) * 0, y = lerp(po.y, o.y, a);
      this.drawOption(x, y, now + i * 0.37);
    }
    if (!p.alive) return;
    const x = lerp(p.px, p.x, a), y = lerp(p.py, p.y, a);
    const blink = p.invuln > 0 && p.enter <= 0;
    this.tilt = lerp(this.tilt || 0, (p.vy || 0) * 0.28, 0.2);
    ctx.save(); ctx.translate(x, y); ctx.rotate(this.tilt * 0.35);
    ctx.scale(1, 1 - Math.abs(this.tilt) * 0.25);
    drawShip(ctx, now, p.vx || 0, p.enter > 0);
    if (blink) {
      // 無敵中: 点滅に加えて輪郭を常に表示
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now * 30);
      ctx.strokeStyle = '#7ff0ff'; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.ellipse(0, 0, 1.25, 0.62, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (g.power.shield > 0) this.drawShield(x, y, g.power.shield, now);
  }
  drawOption(x, y, t) {
    const ctx = this.ctx;
    const r = 0.36 + Math.sin(t * 11) * 0.03;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
    gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.25, 'rgba(255,170,60,0.95)'); gr.addColorStop(0.55, 'rgba(255,70,20,0.45)'); gr.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff8e0'; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, TAU); ctx.fill();
    // 揺らぐ炎の縁
    ctx.strokeStyle = 'rgba(255,200,120,0.7)'; ctx.lineWidth = 0.04; ctx.beginPath();
    for (let k = 0; k <= 24; k++) { const a = k / 24 * TAU, rr = r * (1.05 + 0.18 * Math.sin(a * 5 + t * 14)); k ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.stroke();
  }
  drawShield(x, y, n, now) {
    const ctx = this.ctx;
    // 前方の弧（耐久の数だけ板が光る）
    for (let i = 0; i < 5; i++) {
      const a0 = -0.9 + i * 0.36, a1 = a0 + 0.32;
      ctx.beginPath(); ctx.arc(x, y, SHIELD.radius, a0, a1); ctx.arc(x, y, SHIELD.radius - 0.22, a1, a0, true); ctx.closePath();
      if (i < n) {
        ctx.shadowColor = 'rgba(80,200,255,0.9)'; ctx.shadowBlur = this.S * 0.35;
        ctx.fillStyle = `rgba(90,210,255,${0.7 + 0.25 * Math.sin(now * 8 + i)})`; ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 0.04; ctx.stroke();
      } else { ctx.fillStyle = 'rgba(110,200,255,0.08)'; ctx.fill(); }
    }
  }

  drawCapsule(c, a, now) {
    const ctx = this.ctx, x = lerp(c.px, c.x, a), y = lerp(c.py, c.y, a);
    const pulse = 0.5 + 0.5 * Math.sin(now * 7 + c.id);
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(now * 2 + c.id) * 0.25);
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.2);
    gr.addColorStop(0, `rgba(255,120,60,${0.35 + pulse * 0.25})`); gr.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 1.2, 0, TAU); ctx.fill();
    // 赤いカプセル（両端が丸い）と白い帯
    ctx.beginPath(); roundRect(ctx, -0.62, -0.36, 1.24, 0.72, 0.36);
    const body = ctx.createLinearGradient(0, 0.36, 0, -0.36);
    body.addColorStop(0, '#ffd2b0'); body.addColorStop(0.35, '#ff4a1a'); body.addColorStop(1, '#8a1000');
    ctx.fillStyle = body; ctx.fill();
    ctx.lineWidth = 0.06; ctx.strokeStyle = '#fff2e0'; ctx.stroke();
    ctx.fillStyle = '#2a4cff'; ctx.fillRect(-0.1, -0.36, 0.2, 0.72);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(-0.2, 0.16, 0.25, 0.07, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ---- 弾 -----------------------------------------------------------------
  drawShot(s, a) {
    const ctx = this.ctx;
    const x = lerp(s.px, s.x, a), y = lerp(s.py, s.y, a);
    if (s.kind === 'laser') {
      const len = s.len;
      const gr = ctx.createLinearGradient(x - len, 0, x, 0);
      gr.addColorStop(0, 'rgba(60,180,255,0)'); gr.addColorStop(0.2, 'rgba(80,200,255,0.8)'); gr.addColorStop(1, 'rgba(220,250,255,1)');
      ctx.fillStyle = 'rgba(60,160,255,0.25)'; ctx.fillRect(x - len, y - 0.2, len, 0.4);
      ctx.fillStyle = gr; ctx.fillRect(x - len, y - 0.09, len, 0.18);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - len * 0.9, y - 0.03, len * 0.9, 0.06);
    } else if (s.kind === 'missile') {
      const ang = s.ground ? Math.atan2(0, 1) : Math.atan2(s.vy, s.vx + 0.0001);
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.fillStyle = 'rgba(255,160,60,0.8)'; ctx.beginPath(); ctx.moveTo(-0.3, 0); ctx.lineTo(-0.7 - Math.random() * 0.2, 0.07); ctx.lineTo(-0.7, -0.07); ctx.fill();
      ctx.fillStyle = '#e8ecf4'; ctx.beginPath(); ctx.moveTo(0.35, 0); ctx.lineTo(0.15, 0.1); ctx.lineTo(-0.3, 0.1); ctx.lineTo(-0.3, -0.1); ctx.lineTo(0.15, -0.1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff5a2a'; ctx.fillRect(-0.32, -0.14, 0.12, 0.28);
      ctx.restore();
    } else {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(s.vy, s.vx));
      ctx.fillStyle = 'rgba(255,230,120,0.35)'; ctx.beginPath(); ctx.ellipse(-0.1, 0, 0.55, 0.17, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff8d0'; ctx.beginPath(); ctx.ellipse(0, 0, 0.36, 0.08, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  drawBullet(b, a, now) {
    const ctx = this.ctx;
    const x = lerp(b.px, b.x, a), y = lerp(b.py, b.y, a);
    if (b.kind === 'ring') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(now * 5 + b.id);
      ctx.strokeStyle = 'rgba(120,230,255,0.4)'; ctx.lineWidth = 0.22; ctx.beginPath(); ctx.ellipse(0, 0, b.r, b.r * 0.8, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 0.08; ctx.stroke();
      ctx.restore(); return;
    }
    if (b.kind === 'beam') {
      const v = Math.hypot(b.vx, b.vy) || 1, len = b.len || 2, tx = x - b.vx / v * len, ty = y - b.vy / v * len;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,80,120,0.45)'; ctx.lineWidth = 0.42; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      ctx.strokeStyle = '#fff0f4'; ctx.lineWidth = 0.14; ctx.stroke();
      return;
    }
    if (b.kind === 'homing') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.fillStyle = '#ffcf6a'; ctx.beginPath(); ctx.moveTo(0.4, 0); ctx.lineTo(-0.3, 0.18); ctx.lineTo(-0.3, -0.18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,90,40,${0.6 + 0.4 * Math.sin(now * 40)})`; ctx.beginPath(); ctx.arc(-0.4, 0, 0.14, 0, TAU); ctx.fill();
      ctx.restore(); return;
    }
    // 通常の敵弾: 背景に埋もれない白い芯＋赤紫の縁（自機弾とは色相を分ける）
    const r = b.r;
    ctx.fillStyle = 'rgba(255,60,120,0.35)'; ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff5a96'; ctx.beginPath(); ctx.arc(x, y, r * 1.15, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, TAU); ctx.fill();
  }

  drawParticles(dt) {
    const ctx = this.ctx;
    const keep = [];
    for (const q of this.parts) {
      q.life += dt;
      if (q.life >= q.max) continue;
      keep.push(q);
      if (q.life < 0) continue;
      const k = q.life / q.max;
      if (q.vx !== undefined) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.pow(0.12, dt); q.vy *= Math.pow(0.12, dt); }
      switch (q.k) {
        case 'fire': {
          const r = q.s * (0.6 + k * 0.9);
          const gr = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
          gr.addColorStop(0, `rgba(255,250,220,${1 - k})`); gr.addColorStop(0.4, rgba(q.c, (1 - k) * 0.9)); gr.addColorStop(1, rgba(q.c2, 0));
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU); ctx.fill(); break;
        }
        case 'ring': ctx.strokeStyle = rgba(q.c, (1 - k) * 0.8); ctx.lineWidth = 0.12 * (1 - k); ctx.beginPath(); ctx.arc(q.x, q.y, q.s * k, 0, TAU); ctx.stroke(); break;
        case 'flash': ctx.fillStyle = `rgba(255,255,255,${(1 - k) * 0.9})`; ctx.beginPath(); ctx.arc(q.x, q.y, q.s * (0.5 + k * 0.5), 0, TAU); ctx.fill(); break;
        case 'debris': q.rot += q.vr * dt; q.vy -= 6 * dt; ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = rgba(q.c, 1 - k); ctx.fillRect(-q.s, -q.s * 0.5, q.s * 2, q.s); ctx.restore(); break;
        case 'smoke': ctx.fillStyle = rgba(q.c, 0.35 * (1 - k)); ctx.beginPath(); ctx.arc(q.x, q.y, q.s * (0.6 + k), 0, TAU); ctx.fill(); break;
        case 'spark': ctx.strokeStyle = rgba(q.c, 1 - k); ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03); ctx.stroke(); break;
      }
    }
    this.parts = keep;
  }
  // ボス撃破: 2.5 秒にわたり部位ごとに段階的な爆発
  drawBossBoom(g, dt) {
    const bb = this.bossBoom; if (!bb) return;
    bb.t += dt;
    const e = bb.e;
    if (e && bb.t < 2.4 && Math.random() < 0.35) {
      const ps = e.parts?.length ? e.parts : [{ x: e.x, y: e.y }];
      const q = ps[(Math.random() * ps.length) | 0];
      this.explode(q.x + (Math.random() - 0.5) * 2, q.y + (Math.random() - 0.5) * 2, Math.random() < 0.3 ? 'm' : 's');
    }
    if (bb.t > 2.4 && !bb.final) { bb.final = true; if (e) this.explode(e.x, e.y, 'l'); this.flashes.push({ life: 0, max: 0.5 }); }
    if (bb.t > 3) this.bossBoom = null;
  }

  // ---- 敵 -----------------------------------------------------------------
  drawEnemy(e, g, a) {
    const ctx = this.ctx;
    if (e.dead) {
      // 撃破直後のボス: 崩れながら沈む
      if (!e.boss) return;
    }
    if (e.delay > 0 || (e.ghost && e.type !== 'popper' && e.type !== 'drone')) return;
    const x = lerp(e.px, e.x, a), y = lerp(e.py, e.y, a);
    if (x < this.cam - 8 || x > this.cam + VIEW_W + 10) return;
    const f = e.flash || 0, now = this.now, pal = this.stage.pal;
    const red = e.carrier;
    ctx.save(); ctx.translate(x, y);
    switch (e.type) {
      case 'dart': { ctx.rotate(e.ang); drawDart(ctx, red, f, now + e.id); break; }
      case 'wheel': { ctx.rotate(e.spin || 0); drawWheel(ctx, red, f); break; }
      case 'turret': drawTurret(ctx, e, f, pal); break;
      case 'walker': drawWalker(ctx, e, f, pal); break;
      case 'hatch': drawHatch(ctx, e, f, pal); break;
      case 'drone': ctx.rotate(e.ang); drawDrone(ctx, f, now + e.id); break;
      case 'rock': ctx.rotate(e.spin); drawRock(ctx, e, f, pal); break;
      case 'vent': break;
      case 'heavy': drawHeavy(ctx, e, f, red, now); break;
      case 'brick': drawBrick(ctx, e, f, pal); break;
      case 'popper': drawPopper(ctx, e, f, pal); break;
      case 'stonehead': drawStoneHead(ctx, e, f, pal, now); break;
      case 'pebble': ctx.rotate(e.spin || 0); drawPebble(ctx, f); break;
      case 'piston': drawPiston(ctx, e, pal, now); break;
      case 'tentacle': ctx.restore(); drawTentacle(ctx, e, a, f, pal, now); return;
      case 'spore': drawSpore(ctx, e, f, now, red); break;
      case 'membrane': ctx.restore(); drawMembrane(ctx, e, pal, now); return;
      case 'blob': drawBlob(ctx, e, f, now); break;
      case 'shutter': drawShutter(ctx, e, f, pal); break;
      case 'cannon': drawCannon(ctx, e, f, pal); break;
      case 'zapper': ctx.restore(); drawZapper(ctx, e, pal, now); return;
      case 'slider': drawSlider(ctx, e, pal); break;
      default:
        if (BOSS[e.type]) { ctx.restore(); drawBoss(ctx, e, a, now, pal, g); return; }
    }
    ctx.restore();
  }
}

// =========================================================================
// 形（ローカル座標、1u 単位、y 上向き、+x が前）
function roundRect(ctx, x, y, w, h, r) { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function poly(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
function flashFill(base, f) { return f > 0.05 ? mix(base, '#ffffff', f) : base; }
function mix(a, b, t) {
  t = t > 1 ? 1 : t > 0 ? t : 0;
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t), g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t), bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
function lg(ctx, y0, y1, stops) { const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }

// 自機: 鋭い機首、前進翼の主翼、上下の尾翼、二つの噴射口。白銀の機体に青の差し色
export function drawShip(ctx, now, vx, entering) {
  const fl = 0.55 + (vx > 0 ? 0.35 : vx < 0 ? -0.2 : 0) + Math.sin(now * 60) * 0.08 + (entering ? 0.4 : 0);
  // 噴射炎
  for (const oy of [0.13, -0.13]) {
    const gr = ctx.createLinearGradient(-0.9, 0, -0.9 - fl, 0);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(120,200,255,0.9)'); gr.addColorStop(1, 'rgba(40,80,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(-0.86, oy + 0.09); ctx.lineTo(-0.9 - fl, oy); ctx.lineTo(-0.86, oy - 0.09); ctx.fill();
  }
  // 下の主翼（後退角）
  ctx.fillStyle = lg(ctx, 0, -0.62, [[0, '#c8d0de'], [1, '#5a6478']]);
  poly(ctx, [[0.25, -0.1], [-0.55, -0.62], [-0.85, -0.62], [-0.62, -0.12]]); ctx.fill();
  ctx.strokeStyle = '#2a3346'; ctx.lineWidth = 0.025; ctx.stroke();
  ctx.fillStyle = '#2f6bff'; poly(ctx, [[-0.2, -0.3], [-0.56, -0.56], [-0.72, -0.56], [-0.46, -0.3]]); ctx.fill();
  // 上の尾翼
  ctx.fillStyle = lg(ctx, 0.62, 0, [[0, '#b8c2d4'], [1, '#6a7488']]);
  poly(ctx, [[-0.2, 0.12], [-0.6, 0.5], [-0.82, 0.5], [-0.7, 0.12]]); ctx.fill(); ctx.stroke();
  // 胴体
  ctx.fillStyle = lg(ctx, 0.24, -0.22, [[0, '#ffffff'], [0.45, '#d6dce8'], [1, '#7a8498']]);
  poly(ctx, [[1.02, 0.0], [0.55, 0.11], [0.0, 0.2], [-0.7, 0.22], [-0.9, 0.18], [-0.9, -0.18], [-0.7, -0.2], [0.0, -0.17], [0.55, -0.08]]);
  ctx.fill(); ctx.strokeStyle = '#2a3346'; ctx.lineWidth = 0.03; ctx.stroke();
  // 機首の赤い線・パネル
  ctx.strokeStyle = '#e8402a'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.moveTo(0.6, -0.05); ctx.lineTo(-0.5, -0.12); ctx.stroke();
  ctx.strokeStyle = 'rgba(40,50,70,0.5)'; ctx.lineWidth = 0.015; ctx.beginPath(); ctx.moveTo(-0.2, 0.19); ctx.lineTo(-0.25, -0.16); ctx.moveTo(-0.55, 0.21); ctx.lineTo(-0.55, -0.19); ctx.stroke();
  // 操縦席
  ctx.fillStyle = lg(ctx, 0.2, 0.04, [[0, '#d8fbff'], [0.5, '#38c8ff'], [1, '#0a3a7a']]);
  ctx.beginPath(); ctx.ellipse(0.2, 0.11, 0.3, 0.085, -0.08, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(0.25, 0.14, 0.12, 0.025, -0.1, 0, TAU); ctx.fill();
  // 噴射口
  ctx.fillStyle = '#30384a'; ctx.fillRect(-0.95, 0.04, 0.12, 0.18); ctx.fillRect(-0.95, -0.22, 0.12, 0.18);
  ctx.fillStyle = '#9fd8ff'; ctx.fillRect(-0.95, 0.08, 0.04, 0.1); ctx.fillRect(-0.95, -0.18, 0.04, 0.1);
}
function drawDart(ctx, red, f, t) {
  // 小型編隊機: 前に突き出た二本の爪と丸い胴（形で「突っ込んでくる」ことを示す）
  const body = flashFill(red ? '#e8402a' : '#4aa8c8', f), dark = red ? '#6a1008' : '#163a4c';
  ctx.fillStyle = dark; poly(ctx, [[-0.55, 0.18], [0.05, 0.44], [0.35, 0.2], [0.35, -0.2], [0.05, -0.44], [-0.55, -0.18], [-0.1, 0]]); ctx.fill();
  ctx.fillStyle = body; poly(ctx, [[-0.45, 0.14], [0.05, 0.36], [0.28, 0.16], [0.28, -0.16], [0.05, -0.36], [-0.45, -0.14], [-0.05, 0]]); ctx.fill();
  ctx.fillStyle = '#ffe24a'; ctx.beginPath(); ctx.arc(0.12, 0, 0.12 + Math.sin(t * 8) * 0.02, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-0.3, 0.12, 0.4, 0.04);
}
function drawWheel(ctx, red, f) {
  ctx.fillStyle = flashFill(red ? '#d83a20' : '#8a96b4', f); ctx.beginPath(); ctx.arc(0, 0, 0.6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#20263a'; ctx.beginPath(); ctx.arc(0, 0, 0.42, 0, TAU); ctx.fill();
  ctx.strokeStyle = flashFill('#cfd8ee', f); ctx.lineWidth = 0.1;
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 0.55, Math.sin(a) * 0.55); ctx.stroke(); }
  ctx.fillStyle = '#ff5a3a'; ctx.beginPath(); ctx.arc(0, 0, 0.14, 0, TAU); ctx.fill();
}
function drawTurret(ctx, e, f, pal) {
  const dir = e.anchor === 'f' ? 1 : -1;
  ctx.scale(1, dir);
  // 砲身（照準の向き）
  ctx.save(); ctx.rotate(dir > 0 ? e.aim : -e.aim);
  ctx.fillStyle = '#2a3040'; ctx.fillRect(0, -0.12, 0.95, 0.24); ctx.fillStyle = flashFill('#aab4c8', f); ctx.fillRect(0.1, -0.08, 0.85, 0.16);
  ctx.restore();
  ctx.fillStyle = flashFill('#6a7488', f); ctx.beginPath(); ctx.arc(0, -0.1, 0.55, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#3a4252'; ctx.fillRect(-0.7, -0.55, 1.4, 0.45);
  ctx.fillStyle = '#ff4a2a'; ctx.beginPath(); ctx.arc(0, 0.1, 0.13, 0, TAU); ctx.fill();
}
function drawWalker(ctx, e, f, pal) {
  const dir = e.anchor === 'f' ? 1 : -1; ctx.scale(e.vx < 0 ? 1 : -1, dir);
  const ph = e.walk || 0, cr = (e.crouch > 0 ? 0.2 : 0) + (e.land > 0 ? e.land / 60 : 0);
  ctx.strokeStyle = '#4a5468'; ctx.lineWidth = 0.14; ctx.lineCap = 'round';
  for (const s of [0, Math.PI]) { const k = Math.sin(ph + s); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(k * 0.35 - 0.1, -0.35 + cr); ctx.lineTo(k * 0.45, -0.78 + cr * 0.4); ctx.stroke(); }
  ctx.fillStyle = flashFill('#c8962a', f); ctx.beginPath(); ctx.ellipse(0, 0.12 - cr, 0.55, 0.36, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2a1e0a'; ctx.fillRect(-0.62, 0.0 - cr, 0.35, 0.1);
  ctx.fillStyle = '#ff3a2a'; ctx.beginPath(); ctx.arc(-0.3, 0.2 - cr, 0.1, 0, TAU); ctx.fill();
}
function drawHatch(ctx, e, f, pal) {
  const dir = e.anchor === 'f' ? 1 : -1; ctx.scale(1, dir);
  const flesh = e.color === 'flesh';
  ctx.fillStyle = flashFill(flesh ? '#8a2a40' : '#5a6478', f);
  poly(ctx, [[-1.2, -0.7], [1.2, -0.7], [0.95, 0.35], [-0.95, 0.35]]); ctx.fill();
  ctx.strokeStyle = flesh ? '#ff9ab0' : '#c8d2e6'; ctx.lineWidth = 0.05; ctx.stroke();
  // 扉（開く）
  const o = e.open || 0;
  ctx.fillStyle = flesh ? '#4a0a1a' : '#1a1e2a'; ctx.fillRect(-0.7, 0.35, 1.4, 0.12);
  ctx.fillStyle = flashFill(flesh ? '#c84a66' : '#8a96ae', f);
  ctx.save(); ctx.translate(-0.7, 0.35); ctx.rotate(o * 1.2); ctx.fillRect(0, 0, 0.7, 0.12); ctx.restore();
  ctx.save(); ctx.translate(0.7, 0.35); ctx.rotate(-o * 1.2); ctx.fillRect(-0.7, 0, 0.7, 0.12); ctx.restore();
  if (o > 0.2) { ctx.fillStyle = `rgba(255,120,60,${o * 0.6})`; ctx.beginPath(); ctx.arc(0, 0.4, 0.5 * o, 0, Math.PI); ctx.fill(); }
}
function drawDrone(ctx, f, t) {
  ctx.fillStyle = flashFill('#b85adc', f); poly(ctx, [[0.45, 0], [0, 0.3], [-0.4, 0], [0, -0.3]]); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0.05, 0, 0.1, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(255,150,255,${0.5 + 0.5 * Math.sin(t * 20)})`; ctx.beginPath(); ctx.arc(-0.42, 0, 0.1, 0, TAU); ctx.fill();
}
function drawRock(ctx, e, f, pal) {
  const r = e.r, n = 9;
  const stone = e.color === 'stone';
  ctx.fillStyle = flashFill(stone ? '#8a8270' : '#4a3028', f);
  ctx.beginPath();
  for (let i = 0; i < n; i++) { const a = i / n * TAU, rr = r * (0.82 + hash1(e.id * 13 + i, 4) * 0.3); i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
  if (!stone) { ctx.strokeStyle = '#ff8a2a'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(-r * 0.5, 0); ctx.lineTo(0, r * 0.2); ctx.lineTo(r * 0.3, -r * 0.3); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(-r * 0.25, r * 0.3, r * 0.3, 0, TAU); ctx.fill();
}
function drawHeavy(ctx, e, f, red, now) {
  // 中型機: 厚い装甲の楔形と、前に向いた砲。赤いランプは撃つ前に強く光る
  ctx.fillStyle = '#20283a'; poly(ctx, [[-1.5, 0], [-0.6, 0.85], [1.2, 0.95], [1.5, 0.3], [1.5, -0.3], [1.2, -0.95], [-0.6, -0.85]]); ctx.fill();
  ctx.fillStyle = flashFill(red ? '#c8402a' : '#6a7a9c', f); poly(ctx, [[-1.3, 0], [-0.5, 0.7], [1.1, 0.78], [1.3, 0.25], [1.3, -0.25], [1.1, -0.78], [-0.5, -0.7]]); ctx.fill();
  ctx.fillStyle = '#2a3346'; ctx.fillRect(-1.75, -0.12, 0.6, 0.24); ctx.fillRect(-1.4, 0.4, 0.5, 0.14); ctx.fillRect(-1.4, -0.54, 0.5, 0.14);
  ctx.fillStyle = `rgba(255,80,40,${0.6 + 0.4 * Math.sin(now * 6)})`; ctx.beginPath(); ctx.arc(-0.2, 0, 0.22, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.moveTo(-0.4, 0.6); ctx.lineTo(1.0, 0.68); ctx.stroke();
  ctx.fillStyle = 'rgba(120,200,255,0.8)'; ctx.fillRect(1.3, -0.5, 0.18, 1.0);
}
function drawBrick(ctx, e, f, pal) {
  const s = e.r * 0.98;
  ctx.fillStyle = flashFill(pal.ground[0], f); ctx.fillRect(-s, -s, s * 2, s * 2);
  ctx.strokeStyle = pal.ground[1]; ctx.lineWidth = 0.08; ctx.strokeRect(-s + 0.05, -s + 0.05, s * 2 - 0.1, s * 2 - 0.1);
  ctx.strokeStyle = rgba(pal.ground[2], 0.8); ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.6); ctx.lineTo(0, s * 0.5); ctx.lineTo(s * 0.5, -s * 0.6); ctx.stroke();
  const dmg = 1 - e.hp / e.maxHp; if (dmg > 0) { ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.moveTo(-s * 0.8, s * 0.7); ctx.lineTo(-s * 0.1, 0); ctx.lineTo(-s * 0.5, -s * 0.5 * dmg); ctx.stroke(); }
}
function drawPopper(ctx, e, f, pal) {
  const dir = e.anchor === 'f' ? 1 : -1; ctx.scale(1, dir);
  ctx.fillStyle = flashFill('#4a8a4a', f); ctx.beginPath(); ctx.arc(0, 0, 0.62, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#1a2a1a'; ctx.fillRect(-0.45, 0.15, 0.9, 0.14);
  ctx.fillStyle = '#ffde4a'; ctx.fillRect(-0.36, 0.18, 0.2, 0.08); ctx.fillRect(0.16, 0.18, 0.2, 0.08);
}
function drawStoneHead(ctx, e, f, pal, now) {
  // 巨大石像の顔（左向きの横顔）。深い眉・長い鼻・開閉する口。床なら上向き、天井なら逆さ
  const dir = e.anchor === 'f' ? 1 : -1;
  if (e.shake) ctx.translate(Math.sin(now * 80) * 0.06, 0);
  ctx.scale(1, dir);
  const stone = flashFill('#8c8898', f), dark = '#3a3846', lite = '#c8c4d6';
  ctx.fillStyle = dark; poly(ctx, [[1.6, -1.9], [1.7, 2.3], [-0.6, 2.4], [-1.1, 1.8], [-1.2, 0.9], [-1.75, 0.2], [-1.4, -0.1], [-1.55, -1.0], [-1.1, -1.9]]); ctx.fill();
  ctx.fillStyle = lg(ctx, 2.3, -1.9, [[0, lite], [0.5, stone], [1, dark]]);
  poly(ctx, [[1.5, -1.9], [1.55, 2.2], [-0.55, 2.3], [-1.0, 1.75], [-1.05, 0.95], [-1.6, 0.2], [-1.25, 0.0], [-1.4, -0.95], [-1.0, -1.9]]); ctx.fill();
  // 眉・目
  ctx.fillStyle = dark; poly(ctx, [[-1.05, 1.2], [0.1, 1.45], [0.2, 1.15], [-0.95, 0.95]]); ctx.fill();
  ctx.fillStyle = `rgba(255,120,210,${0.4 + e.mouth * 0.6})`; ctx.beginPath(); ctx.ellipse(-0.4, 0.95, 0.22, 0.08, 0, 0, TAU); ctx.fill();
  // 口（開くと赤い光）
  const m = e.mouth || 0;
  ctx.fillStyle = '#1a1420'; poly(ctx, [[-1.38, -0.2 + 0], [-0.6, -0.1], [-0.6, -0.5 - m * 0.4], [-1.45, -0.5 - m * 0.55]]); ctx.fill();
  if (m > 0.1) { ctx.fillStyle = `rgba(255,80,160,${m * 0.9})`; ctx.beginPath(); ctx.ellipse(-1.05, -0.35 - m * 0.25, 0.35, 0.12 + m * 0.18, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = stone; poly(ctx, [[-1.45, -0.5 - m * 0.55], [-0.6, -0.5 - m * 0.4], [-0.55, -1.0 - m * 0.4], [-1.35, -1.05 - m * 0.55]]); ctx.fill();
  ctx.strokeStyle = 'rgba(40,36,50,0.6)'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(0.4, 2.0); ctx.lineTo(0.5, -1.7); ctx.moveTo(0.9, 1.6); ctx.lineTo(1.0, -1.5); ctx.stroke();
}
function drawPebble(ctx, f) {
  ctx.fillStyle = flashFill('#9a96a8', f); ctx.beginPath(); ctx.arc(0, 0, 0.6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3a3846'; ctx.fillRect(-0.35, 0.1, 0.25, 0.1); ctx.fillRect(0.1, 0.1, 0.25, 0.1); ctx.fillRect(-0.2, -0.3, 0.4, 0.1);
  ctx.fillStyle = '#ff7ad0'; ctx.fillRect(-0.3, 0.12, 0.1, 0.06); ctx.fillRect(0.15, 0.12, 0.1, 0.06);
}
function drawPiston(ctx, e, pal, now) {
  const dir = e.anchor === 'f' ? 1 : -1, len = e.len || 1, w = e.w * 2;
  ctx.translate(0, -e.y + e.root);
  ctx.scale(1, dir);
  const shake = e.warn ? Math.sin(now * 70) * 0.05 : 0;
  ctx.translate(shake, 0);
  ctx.fillStyle = '#2a2420'; ctx.fillRect(-w / 2 - 0.25, -0.4, w + 0.5, 0.9);
  ctx.fillStyle = lg(ctx, 0, len, [[0, '#5a4a3a'], [1, '#a88a5a']]);
  ctx.fillRect(-w / 2 + 0.1, 0, w - 0.2, len);
  // 先端（黄黒の警告帯）
  ctx.fillStyle = '#ffcf2a'; ctx.fillRect(-w / 2, len - 0.55, w, 0.55);
  ctx.fillStyle = '#1a1410'; for (let k = -w / 2; k < w / 2; k += 0.5) { ctx.beginPath(); ctx.moveTo(k, len - 0.55); ctx.lineTo(k + 0.25, len - 0.55); ctx.lineTo(k + 0.5, len); ctx.lineTo(k + 0.25, len); ctx.fill(); }
  if (e.warn) { ctx.fillStyle = `rgba(255,80,40,${0.5 + 0.5 * Math.sin(now * 30)})`; ctx.fillRect(-w / 2, len, w, 0.12); }
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.05; for (let y = 0.6; y < len - 0.6; y += 0.8) { ctx.beginPath(); ctx.moveTo(-w / 2 + 0.1, y); ctx.lineTo(w / 2 - 0.1, y); ctx.stroke(); }
}
function drawTentacle(ctx, e, a, f, pal, now) {
  const ps = e.parts;
  ctx.lineCap = 'round';
  for (let i = 0; i < ps.length; i++) {
    const q = ps[i], x = lerp(q.px, q.x, a), y = lerp(q.py, q.y, a), r = 0.48 + 0.2 * (1 - i / ps.length);
    ctx.fillStyle = mix('#7a2a3a', '#d86a7a', (Math.sin(now * 4 - i * 0.6) + 1) * 0.25);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,210,0.25)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y + r * 0.3, r * 0.4, 0, TAU); ctx.fill();
  }
  const x = lerp(e.px, e.x, a), y = lerp(e.py, e.y, a);
  ctx.fillStyle = flashFill('#ff6a8a', f); ctx.beginPath(); ctx.arc(x, y, 0.7, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3a0a18'; ctx.beginPath(); ctx.arc(x, y, 0.35 + Math.sin(now * 6 + e.id) * 0.08, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffe0a0'; ctx.beginPath(); ctx.arc(x, y, 0.12, 0, TAU); ctx.fill();
}
function drawSpore(ctx, e, f, now, red) {
  const r = 0.5 + Math.sin(now * 5 + e.id) * 0.04;
  ctx.fillStyle = red ? 'rgba(255,80,40,0.35)' : 'rgba(255,140,190,0.3)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = flashFill(red ? '#ff5a2a' : '#ffb0d0', f); ctx.lineWidth = 0.06; ctx.stroke();
  ctx.fillStyle = red ? '#ffcf6a' : '#ff4a8a'; ctx.beginPath(); ctx.arc(0.08, 0.05, 0.18, 0, TAU); ctx.fill();
}
function drawMembrane(ctx, e, pal, now) {
  for (const c of e.cells) {
    if (c.hp <= 0) { // 再生中の跡
      const k = c.regen / (e.regenT ?? 300);
      ctx.strokeStyle = `rgba(160,255,220,${0.1 + k * 0.25})`; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.arc(e.x, c.y, 0.7 * k, 0, TAU); ctx.stroke(); continue;
    }
    const x = e.x + Math.sin(c.y * 1.7 + e.t * 0.05) * 0.12, r = 0.7 * (c.grow ?? 1);
    ctx.fillStyle = c.hp < 2 ? 'rgba(200,255,180,0.6)' : 'rgba(90,220,160,0.55)'; ctx.beginPath(); ctx.arc(x, c.y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#c8ffe8'; ctx.lineWidth = 0.05; ctx.stroke();
    ctx.fillStyle = '#1a6a4a'; ctx.beginPath(); ctx.arc(x + 0.12, c.y + 0.05, r * 0.32, 0, TAU); ctx.fill();
  }
}
function drawBlob(ctx, e, f, now) {
  const r = e.r * (1 + Math.sin(now * 4 + e.id) * 0.06);
  ctx.fillStyle = 'rgba(120,255,200,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.95, now + e.id, 0, TAU); ctx.fill();
  ctx.strokeStyle = flashFill('#c8ffe8', f); ctx.lineWidth = 0.06; ctx.stroke();
  ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.arc(r * 0.15, 0, r * 0.35, 0, TAU); ctx.fill();
}
function drawShutter(ctx, e, f, pal) {
  const s = e.r * 0.98;
  ctx.fillStyle = flashFill('#5a6680', f); ctx.fillRect(-s * 0.7, -s, s * 1.4, s * 2);
  ctx.strokeStyle = '#bfe0ff'; ctx.lineWidth = 0.05; ctx.strokeRect(-s * 0.7, -s, s * 1.4, s * 2);
  ctx.fillStyle = '#20283a'; for (const y of [-s * 0.6, s * 0.6]) { ctx.beginPath(); ctx.arc(0, y, 0.08, 0, TAU); ctx.fill(); }
  ctx.fillStyle = `rgba(80,180,255,${0.3 + 0.5 * (1 - e.hp / e.maxHp)})`; ctx.fillRect(-0.06, -s * 0.4, 0.12, s * 0.8);
}
function drawCannon(ctx, e, f, pal) {
  const dir = e.anchor === 'f' ? 1 : -1;
  ctx.save(); ctx.rotate(e.aim);
  ctx.fillStyle = '#20283a'; ctx.fillRect(0, -0.24, 1.4, 0.48); ctx.fillStyle = flashFill('#8898ba', f); ctx.fillRect(0.2, -0.16, 1.2, 0.32);
  if (e.charge) { ctx.fillStyle = '#ffde6a'; ctx.beginPath(); ctx.arc(1.4, 0, 0.22, 0, TAU); ctx.fill(); }
  ctx.restore();
  ctx.scale(1, dir);
  ctx.fillStyle = flashFill('#4a5670', f); ctx.beginPath(); ctx.arc(0, 0, 0.9, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2a3346'; ctx.fillRect(-1.2, -1.0, 2.4, 0.4);
  ctx.fillStyle = '#4ab0ff'; ctx.beginPath(); ctx.arc(0, 0, 0.25, 0, TAU); ctx.fill();
}
function drawZapper(ctx, e, pal, now) {
  for (const y of [e.y0, e.y1]) {
    ctx.fillStyle = '#3a4256'; ctx.beginPath(); ctx.arc(e.x, y, 0.75, 0, TAU); ctx.fill();
    ctx.fillStyle = e.warn || e.beam ? '#ff4a6a' : '#4ab0ff'; ctx.beginPath(); ctx.arc(e.x, y, 0.3, 0, TAU); ctx.fill();
  }
  if (e.warn) { ctx.strokeStyle = `rgba(255,80,110,${0.4 + 0.3 * Math.sin(now * 30)})`; ctx.lineWidth = 0.05; ctx.setLineDash([0.3, 0.2]); ctx.beginPath(); ctx.moveTo(e.x, e.y0); ctx.lineTo(e.x, e.y1); ctx.stroke(); ctx.setLineDash([]); }
  if (e.beam) {
    ctx.strokeStyle = 'rgba(255,60,110,0.45)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(e.x, e.y0); ctx.lineTo(e.x, e.y1); ctx.stroke();
    ctx.strokeStyle = '#ffe8ee'; ctx.lineWidth = 0.22 + Math.sin(now * 50) * 0.05; ctx.stroke();
  }
}
function drawSlider(ctx, e, pal) {
  const h = e.h ?? 3;
  ctx.fillStyle = lg(ctx, -h / 2, h / 2, [[0, '#3a4256'], [0.5, '#7a88a8'], [1, '#3a4256']]);
  ctx.fillRect(-1, -h / 2, 2, h);
  ctx.strokeStyle = '#ffcf6a'; ctx.lineWidth = 0.08; ctx.strokeRect(-0.95, -h / 2 + 0.05, 1.9, h - 0.1);
  ctx.fillStyle = '#ffcf6a'; ctx.fillRect(-0.15, -h / 2 + 0.3, 0.3, h - 0.6);
}

// ---- ボス ----------------------------------------------------------------
function partXY(q, a) { return [lerp(q.px, q.x, a), lerp(q.py, q.y, a)]; }
function drawBoss(ctx, e, a, now, pal, g) {
  const x = lerp(e.px, e.x, a), y = lerp(e.py, e.y, a);
  const dead = e.dead;
  ctx.save();
  if (dead) { const k = Math.min(1, (160 - (e.linger || 0)) / 160); ctx.translate(Math.sin(now * 60) * 0.1 * k, -k * 2); ctx.globalAlpha = 1 - k * 0.6; }
  if (e.shake) ctx.translate(Math.sin(now * 70) * 0.08, 0);
  const P = (name) => e.parts.filter((q) => q.name === name);
  const fl = (q) => (q.flash = Math.max(0, (q.flash || 0) - 0.08), q.flash);
  switch (e.type) {
    case 'ignis': {
      ctx.translate(x, y);
      // 船体: 上下に張り出した装甲と後部の噴射
      for (const s of [1, -1]) {
        ctx.fillStyle = '#2a3042'; poly(ctx, [[-1.6, s * 0.9], [-0.6, s * 3.0], [2.6, s * 4.4], [3.6, s * 3.2], [3.4, s * 1.0], [2.0, s * 0.4]]); ctx.fill();
        ctx.fillStyle = lg(ctx, s * 4, 0, [[0, '#b8c2d8'], [1, '#5a6480']]); poly(ctx, [[-1.4, s * 1.0], [-0.5, s * 2.8], [2.5, s * 4.1], [3.3, s * 3.1], [3.1, s * 1.1], [1.9, s * 0.55]]); ctx.fill();
        ctx.fillStyle = '#e8402a'; poly(ctx, [[-0.4, s * 2.4], [2.2, s * 3.6], [2.4, s * 3.2], [-0.2, s * 2.1]]); ctx.fill();
        // 光線の発射口（予告で光る）
        for (const oy of [1.3, 2.6]) { ctx.fillStyle = e.charge ? `rgba(255,${120 + 120 * e.charge},200,${0.4 + e.charge * 0.6})` : '#3a4458'; ctx.beginPath(); ctx.arc(-1.4, s * oy, 0.28 + (e.charge || 0) * 0.2, 0, TAU); ctx.fill(); }
      }
      ctx.fillStyle = '#3a4458'; ctx.fillRect(-0.6, -0.95, 3.2, 1.9);
      ctx.fillStyle = 'rgba(80,160,255,0.7)'; ctx.fillRect(3.0, -0.7, 0.5 + Math.sin(now * 40) * 0.1, 1.4);
      ctx.restore(); ctx.save();
      // 装甲板とコア
      for (const q of P('plate')) if (q.alive) {
        const [px, py] = partXY(q, a), dmg = 1 - q.hp / q.maxHp;
        ctx.fillStyle = '#1a2030'; ctx.fillRect(px - 0.24, py - 0.82, 0.48, 1.64);
        ctx.fillStyle = flashFill(mix('#c8d2e8', '#ff8a5a', dmg * 0.7), fl(q)); ctx.fillRect(px - 0.18, py - 0.76, 0.36, 1.52);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(px - 0.14, py - 0.7, 0.06, 1.4);
      }
      const c = P('core')[0]; const [cx, cy] = partXY(c, a); const open = c.isOpen(e);
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, 0.9); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, open ? '#5ad8ff' : '#2a6a9a'); gr.addColorStop(1, 'rgba(40,120,255,0)');
      ctx.fillStyle = flashFill('#3ab0ff', fl(c)); ctx.beginPath(); ctx.arc(cx, cy, 0.62, 0, TAU); ctx.fill();
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, 0.9 + Math.sin(now * 8) * 0.06, 0, TAU); ctx.fill();
      break;
    }
    case 'warden': {
      ctx.translate(x, y);
      const o = e.open;
      ctx.fillStyle = '#3a3428'; ctx.fillRect(1.4, -7, 2.6, 14);
      ctx.fillStyle = lg(ctx, 7, -7, [[0, '#d8ccaa'], [1, '#6e6650']]); ctx.fillRect(1.6, -6.8, 2.2, 13.6);
      ctx.strokeStyle = 'rgba(40,30,20,0.6)'; ctx.lineWidth = 0.06; for (let yy = -6; yy < 7; yy += 1.4) { ctx.beginPath(); ctx.moveTo(1.6, yy); ctx.lineTo(3.8, yy); ctx.stroke(); }
      // 目
      const eye = P('eye')[0];
      ctx.fillStyle = '#100a06'; ctx.beginPath(); ctx.ellipse(0.2, 0, 1.4, 0.4 + o * 1.4, 0, 0, TAU); ctx.fill();
      if (o > 0.1) { ctx.fillStyle = flashFill('#58d2ff', fl(eye)); ctx.beginPath(); ctx.arc(0.0, 0, 0.9 * o, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-0.25, 0, 0.3 * o, 0, TAU); ctx.fill(); }
      // 顎（上下）
      for (const s of [1, -1]) {
        const jy = s * (1.0 + o * 2.2);
        ctx.fillStyle = '#4a4232'; poly(ctx, [[-2.1, jy], [-0.4, jy + s * 0.3], [1.8, jy + s * 1.6], [1.8, jy + s * 3.6], [-0.8, jy + s * 2.4]]); ctx.fill();
        ctx.fillStyle = lg(ctx, jy + s * 3, jy, [[0, '#c8bc96'], [1, '#8a8064']]); poly(ctx, [[-1.9, jy + s * 0.1], [-0.4, jy + s * 0.4], [1.6, jy + s * 1.6], [1.6, jy + s * 3.3], [-0.7, jy + s * 2.2]]); ctx.fill();
        ctx.fillStyle = '#e8dcae'; for (let k = 0; k < 4; k++) poly(ctx, [[-1.7 + k * 0.5, jy + s * 0.2], [-1.45 + k * 0.5, jy - s * 0.35], [-1.2 + k * 0.5, jy + s * 0.28]]), ctx.fill();
      }
      break;
    }
    case 'colossus': {
      ctx.translate(x, y);
      const m = e.mouth;
      const stone = '#8c8898', dark = '#2a2834', lite = '#d8d2ea';
      ctx.fillStyle = dark; poly(ctx, [[5.6, 5], [5.6, -5], [1.6, -5.2], [-0.4, -4.4], [-1.4, -3.2], [-1.6, -1.6 - m], [-2.6, -1.4 - m * 0.6], [-2.0, -0.6], [-2.8, 0.6], [-1.6, 1.4], [-2.0, 2.8], [-0.8, 4.4], [1.4, 5.4]]); ctx.fill();
      ctx.fillStyle = lg(ctx, 5, -5, [[0, lite], [0.45, stone], [1, '#4a4656']]); poly(ctx, [[5.4, 4.8], [5.4, -4.8], [1.6, -5.0], [-0.3, -4.2], [-1.2, -3.1], [-1.4, -1.7 - m], [-2.3, -1.45 - m * 0.6], [-1.8, -0.6], [-2.5, 0.6], [-1.4, 1.35], [-1.8, 2.7], [-0.7, 4.2], [1.4, 5.2]]); ctx.fill();
      // 眉と目（光線の予告で赤く）
      ctx.fillStyle = dark; poly(ctx, [[-1.9, 2.0], [0.6, 2.4], [0.7, 1.7], [-1.6, 1.5]]); ctx.fill();
      ctx.fillStyle = `rgba(255,${120 - e.eyes * 80},${200 - e.eyes * 150},${0.5 + e.eyes * 0.5})`; ctx.beginPath(); ctx.ellipse(-0.9, 1.3, 0.55 + e.eyes * 0.2, 0.2 + e.eyes * 0.1, 0, 0, TAU); ctx.fill();
      // 口
      const mo = P('mouth')[0];
      ctx.fillStyle = '#120c18'; poly(ctx, [[-2.3, -0.7], [-0.6, -0.6], [-0.6, -1.6 - m * 0.9], [-2.4, -1.5 - m * 0.9]]); ctx.fill();
      if (m > 0.05) { ctx.fillStyle = flashFill('#ff4ab0', fl(mo)); ctx.globalAlpha *= 0.4 + m * 0.6; ctx.beginPath(); ctx.ellipse(-1.6, -1.15 - m * 0.45, 0.6, 0.25 + m * 0.35, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = dead ? ctx.globalAlpha : 1; }
      ctx.strokeStyle = 'rgba(30,26,40,0.55)'; ctx.lineWidth = 0.08;
      for (const xx of [1.2, 2.4, 3.6]) { ctx.beginPath(); ctx.moveTo(xx, 4.6); ctx.lineTo(xx + 0.2, -4.6); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.moveTo(-1.2, 3.8); ctx.quadraticCurveTo(1.6, 4.8, 4.6, 4.2); ctx.stroke();
      break;
    }
    case 'crusher': {
      ctx.translate(x, y);
      ctx.fillStyle = '#2a2420'; poly(ctx, [[-0.8, 1.2], [0.4, 3.0], [3.4, 3.0], [3.6, -3.0], [0.4, -3.0], [-0.8, -1.2]]); ctx.fill();
      ctx.fillStyle = lg(ctx, 3, -3, [[0, '#c8a070'], [1, '#5a4430']]); poly(ctx, [[-0.6, 1.1], [0.5, 2.8], [3.2, 2.8], [3.4, -2.8], [0.5, -2.8], [-0.6, -1.1]]); ctx.fill();
      ctx.fillStyle = '#ffcf2a'; ctx.fillRect(2.2, -2.6, 0.3, 5.2);
      // コアのシャッター
      const c = P('core')[0], s = e.shutter;
      ctx.fillStyle = flashFill('#ff8a3a', fl(c)); ctx.beginPath(); ctx.arc(-0.4, 0, 0.75, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff0c0'; ctx.beginPath(); ctx.arc(-0.4, 0, 0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4a3a2a'; ctx.fillRect(-1.3, 0.12 + s * 0.8, 1.8, 0.8 - s * 0.3); ctx.fillRect(-1.3, -0.92 - s * 0.5, 1.8, 0.8 - s * 0.3);
      ctx.restore(); ctx.save();
      // 腕（予告の線）
      if (e.warn) {
        const ax = g.camX + e.armX;
        ctx.strokeStyle = `rgba(255,80,40,${0.35 + 0.3 * Math.sin(now * 25)})`; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, VIEW_H); ctx.stroke();
        ctx.strokeStyle = '#ffde6a'; ctx.lineWidth = 0.06; ctx.setLineDash([0.4, 0.3]); ctx.beginPath(); ctx.moveTo(ax - 1.4, e.clampY); ctx.lineTo(ax + 1.4, e.clampY); ctx.stroke(); ctx.setLineDash([]);
      }
      for (const arm of ['armT', 'armB']) {
        const qs = P(arm); const head = qs[0]; const [hx, hy] = partXY(head, a);
        const s2 = arm === 'armT' ? 1 : -1;
        const tail = qs[qs.length - 1]; const [, ty] = partXY(tail, a);
        ctx.fillStyle = lg(ctx, hy, ty, [[0, '#d8b070'], [1, '#6a5030']]);
        ctx.fillRect(hx - 1.05, Math.min(hy, ty + s2 * 1.1), 2.1, Math.abs(ty - hy) + 1.1);
        ctx.fillStyle = '#ffcf2a'; ctx.fillRect(hx - 1.2, hy - s2 * 1.0, 2.4, 0.5 * s2);
        ctx.fillStyle = '#1a1410'; for (let k = -1.2; k < 1.2; k += 0.4) ctx.fillRect(hx + k, hy - s2 * 1.0, 0.2, 0.5 * s2);
      }
      break;
    }
    case 'hydra': {
      // 触手
      for (const arm of e.arms) {
        for (const q of arm.segs) { if (!q.alive) continue; const [qx, qy] = partXY(q, a); ctx.fillStyle = mix('#7a2a3a', '#c85a6a', 0.5 + 0.5 * Math.sin(now * 3 + qx)); ctx.beginPath(); ctx.arc(qx, qy, q.r + 0.1, 0, TAU); ctx.fill(); }
        if (arm.tip.alive) { const [tx, ty] = partXY(arm.tip, a); ctx.fillStyle = flashFill('#ff6a8a', fl(arm.tip)); ctx.beginPath(); ctx.arc(tx, ty, 0.68, 0, TAU); ctx.fill(); ctx.fillStyle = '#2a0610'; ctx.beginPath(); ctx.arc(tx, ty, 0.32, 0, TAU); ctx.fill(); }
      }
      ctx.translate(x, y);
      const pu = 1 + (e.pulse || 0) * 0.12 + Math.sin(now * 2) * 0.03;
      ctx.scale(pu, pu);
      ctx.fillStyle = '#5a1a2a'; ctx.beginPath(); ctx.ellipse(1.0, 0, 3.2, 3.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = lg(ctx, 3.5, -3.5, [[0, '#ff9ab0'], [0.5, '#c84a66'], [1, '#5a1a2a']]); ctx.beginPath(); ctx.ellipse(1.0, 0, 3.0, 3.6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(90,10,30,0.6)'; ctx.lineWidth = 0.1;
      for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.moveTo(-1.5, -3 + k); ctx.bezierCurveTo(0, -2.2 + k + Math.sin(now + k) * 0.3, 1.5, -3.2 + k, 3.8, -2.6 + k); ctx.stroke(); }
      const eye = P('eye')[0], o = e.eye;
      ctx.fillStyle = '#2a0610'; ctx.beginPath(); ctx.ellipse(-1.4, 0, 1.0, 0.15 + o * 0.85, 0, 0, TAU); ctx.fill();
      if (o > 0.1) { ctx.fillStyle = flashFill('#ffe24a', fl(eye)); ctx.beginPath(); ctx.ellipse(-1.45, 0, 0.6 * o, 0.6 * o, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#1a0408'; ctx.beginPath(); ctx.ellipse(-1.5, 0, 0.14, 0.45 * o, 0, 0, TAU); ctx.fill(); }
      break;
    }
    case 'nucleus': {
      for (const q of e.parts) if (q.free) {
        const [qx, qy] = partXY(q, a);
        if (!q.alive) { ctx.strokeStyle = 'rgba(160,255,220,0.15)'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.arc(qx, qy, 0.72 * Math.min(1, q.regen / 380), 0, TAU); ctx.stroke(); continue; }
        ctx.fillStyle = flashFill('#5adca0', fl(q)); ctx.globalAlpha = 0.75; ctx.beginPath(); ctx.arc(qx, qy, 0.74, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#d8fff0'; ctx.lineWidth = 0.05; ctx.stroke();
      }
      ctx.translate(x, y);
      const gl = e.glow || 0;
      ctx.fillStyle = `rgba(90,255,190,${0.12 + gl * 0.25})`; ctx.beginPath(); ctx.arc(0, 0, 3.3, 0, TAU); ctx.fill();
      const c = P('core')[0];
      const gr = ctx.createRadialGradient(-0.3, 0.3, 0, 0, 0, 1.3); gr.addColorStop(0, '#fff6c0'); gr.addColorStop(0.5, flashFill('#ff9a3a', fl(c))); gr.addColorStop(1, '#8a2a0a');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 1.15 + Math.sin(now * 5) * 0.05, 0, TAU); ctx.fill();
      break;
    }
    case 'omega': {
      ctx.translate(x, y);
      if (e.phase < 3) {
        ctx.fillStyle = '#141822'; ctx.fillRect(0.4, -7.5, 4.6, 15);
        ctx.fillStyle = lg(ctx, 7, -7, [[0, '#8898ba'], [0.5, '#4a5670'], [1, '#2a3346']]); ctx.fillRect(0.6, -7.3, 4.2, 14.6);
        ctx.strokeStyle = 'rgba(190,224,255,0.4)'; ctx.lineWidth = 0.06; for (let yy = -6.6; yy < 7; yy += 1.1) { ctx.beginPath(); ctx.moveTo(0.8, yy); ctx.lineTo(4.6, yy); ctx.stroke(); }
        for (const oy of [-3.9, 0, 3.9]) { ctx.fillStyle = e.charge ? `rgba(255,${200 * e.charge},120,${0.4 + 0.6 * e.charge})` : '#2a3346'; ctx.beginPath(); ctx.arc(0.5, oy, 0.4 + (e.charge || 0) * 0.2, 0, TAU); ctx.fill(); }
      }
      ctx.restore(); ctx.save();
      for (const q of P('gun')) if (q.alive) { const [qx, qy] = partXY(q, a); ctx.fillStyle = '#20283a'; ctx.fillRect(qx - 1.3, qy - 0.25, 1.4, 0.5); ctx.fillStyle = flashFill('#8898ba', fl(q)); ctx.beginPath(); ctx.arc(qx, qy, 0.85, 0, TAU); ctx.fill(); ctx.fillStyle = '#4ab0ff'; ctx.beginPath(); ctx.arc(qx, qy, 0.3, 0, TAU); ctx.fill(); }
      const core = P('core')[0];
      if (core.alive) {
        const [cx, cy] = partXY(core, a);
        const ph2 = e.phase >= 2;
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, 1.6); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, ph2 ? '#4ab0ff' : '#2a4a7a'); gr.addColorStop(1, 'rgba(40,120,255,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, 1.6, 0, TAU); ctx.fill();
        ctx.fillStyle = flashFill(ph2 ? '#bfe0ff' : '#6a7a9a', fl(core)); ctx.beginPath(); ctx.arc(cx, cy, 0.8, 0, TAU); ctx.fill();
        if (!ph2) { ctx.strokeStyle = '#8898ba'; ctx.lineWidth = 0.2; ctx.beginPath(); ctx.arc(cx, cy, 1.0, 0, TAU); ctx.stroke(); }
      }
      for (const q of P('bar')) if (q.vis) { const [qx, qy] = partXY(q, a); ctx.fillStyle = '#ffcf6a'; ctx.beginPath(); ctx.arc(qx, qy, 0.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#5a4020'; ctx.beginPath(); ctx.arc(qx, qy, 0.22, 0, TAU); ctx.fill(); }
      const h = P('heart')[0];
      if (h.vis && h.alive) {
        const [hx, hy] = partXY(h, a);
        const beat = 1 + Math.max(0, Math.sin(now * 7)) * 0.12;
        ctx.fillStyle = 'rgba(255,60,110,0.3)'; ctx.beginPath(); ctx.arc(hx, hy, 1.6 * beat, 0, TAU); ctx.fill();
        ctx.fillStyle = flashFill('#ff3a6a', fl(h)); ctx.beginPath(); ctx.arc(hx, hy, 0.85 * beat, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ffd0dc'; ctx.lineWidth = 0.06; for (let k = 0; k < 6; k++) { const an = k / 6 * TAU + now; ctx.beginPath(); ctx.moveTo(hx + Math.cos(an) * 0.9, hy + Math.sin(an) * 0.9); ctx.lineTo(hx + Math.cos(an) * 1.4, hy + Math.sin(an) * 1.4); ctx.stroke(); }
      }
      break;
    }
  }
  ctx.restore();
}
installBg(Render2D);
