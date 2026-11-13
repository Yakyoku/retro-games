// ORBITAL WINGS 2D — Canvas 2D の描画の流れ（1 フレームの順序・出来事の受け口・演出）。
// 1u = S px。ワールド座標（y 上向き）をそのまま使えるよう変換行列を設定して描く。
// 絵は分割してある: kit2d.js（塗りの道具・スプライトの置き場）、fx2d.js（粒子・爆発）、
// sprites2d.js（自機・弾・雑魚敵）、bosses2d.js（ボス 7 体）、background2d.js（背景・地形）。
import { VIEW_W, VIEW_H } from '../shared/config.js';
import { BOSS } from '../shared/bosses.js';
import { install as installBg } from './background2d.js';
import { Sprites, lerp, clamp, TAU } from './kit2d.js';
import { Fx, matOf } from './fx2d.js';
import { drawPlayer, drawCapsule, drawShot, drawBullet, drawEnemy } from './sprites2d.js';
import { drawBoss, bossCollapse } from './bosses2d.js';

const R01 = Math.random;

export class Render2D {
  constructor() { this.parts = []; this.scale = 1; this.ft = []; this.lastNow = 0; this.sp = new Sprites(); this.fx = new Fx(); this.capSeen = new Map(); this.warnT = 0; this.dt = 1 / 60; }

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
    // 画面の揺れと閃光の強さ（設定 fx: 'full' | 'weak' | 'off'。未設定は full）
    this.fx.k = s.fx === 'off' ? 0 : s.fx === 'weak' ? 0.4 : 1;
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

  setStage(stage) { this.stage = stage; this.stageCache = null; this.parts = []; this.fx.clear(); this.bossBoom = null; this.capSeen.clear(); if (this.pv) { this.pv.trails.length = 0; this.pv.absorb.length = 0; } }
  chance(rate) { return R01() < rate * this.dt; }

  // ルールからの出来事 → 粒子・揺れ・閃光
  onEvent(ev, g, demo) {
    const fx = this.fx;
    switch (ev.t) {
      case 'explode': {
        const mat = ev.size === 'p' ? 'plasma' : matOf(ev.kind, ev.color);
        fx.explode(ev.x, ev.y, ev.size, mat, ev.kind === 'rock' && ev.color !== 'stone');
        break;
      }
      case 'spark': fx.spark(ev.x, ev.y, ev.armor, ev.big); break;
      case 'bossdown': this.bossBoom = { t: 0, e: g.boss, next: 0 }; fx.shake(0.5); fx.flash(0.25); break;
      case 'vent':            // 噴火口: 熱い噴煙・火の粉（毎 tick 来る）
        if (R01() < 0.3) fx.hot(ev.x + (R01() - 0.5) * 0.8, ev.y + ev.up * 0.2, (R01() - 0.5) * 1.2, ev.up * (2 + R01() * 3), 0.5 + R01() * 0.4, 0.5 + R01() * 0.3, false);
        if (R01() < 0.2) fx.smoke(ev.x + (R01() - 0.5), ev.y + ev.up * 0.3, -0.4 + (R01() - 0.5), ev.up * (1.2 + R01() * 1.5), 0.6 + R01() * 0.5, 1.5, 0.5);
        if (R01() < 0.25) fx.ember(ev.x + (R01() - 0.5) * 0.8, ev.y, (R01() - 0.5) * 3, ev.up * (4 + R01() * 6), 0.06 + R01() * 0.05, 0.8 + R01() * 0.6, 5, ev.up * 5);
        break;
      case 'dust': for (let i = 0; i < 7; i++) fx.smoke(ev.x + (R01() - 0.5) * 1.8, ev.y + R01() * 0.4, (R01() - 0.5), -0.8 - R01(), 0.35 + R01() * 0.2, 0.9, 0.5, 'dust'); for (let i = 0; i < 4; i++) fx.debris(ev.x + (R01() - 0.5) * 1.5, ev.y, (R01() - 0.5) * 2, -1, 0.07, 0.8, 'rock'); break;
      case 'die': fx.ring(ev.x, ev.y, 0.5, 6, 0.7, 1, 0.7); break;
      case 'phase': fx.flash(0.4); fx.shake(0.6); break;
      case 'shieldhit': if (this.pv) { this.pv.hitT = 0; this.pv.hitLeft = ev.left + 1; } fx.spark((this.px ?? 0) + 1.1, this.py ?? 0, true, false); break;
      case 'fire': if (this.pv) { this.pv.muzzle = 0; this.pv.mcol = ev.w === 'laser' ? '#7ad8ff' : '#ffe890'; } break;
      case 'powerup': if (g.player) { fx.ring(g.player.x, g.player.y, 0.3, 2.4, 0.4, ev.item === 'SHIELD' ? 1 : 0, 0.9); fx.glint(g.player.x, g.player.y, 1.6, 0.35); } break;
      case 'bosswarn': this.warnT = 2.2; break;
    }
  }

  // ---- 1 フレーム -------------------------------------------------------------
  render(g, alpha, now) {
    const dt = this.lastNow ? clamp(now - this.lastNow, 0, 0.1) : 1 / 60; this.lastNow = now;
    this.autoQuality(dt);
    const ctx = this.ctx, S = this.S, fx = this.fx;
    if (!g) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.bw, this.bh); return; }
    if (g.stage !== this.stage) this.setStage(g.stage);
    if (!this.stageCache) this.buildStageCache();
    this.sp.setScale(S);
    const pal = this.stage.pal;
    const cam = g.camX - (g.scrollD || 0) * (1 - alpha);
    this.cam = cam; this.alpha = alpha; this.now = now; this.g = g; this.dt = dt; this.pal = pal; this.tickN = g.tickN;
    // 画面の揺れ（控えめ。設定で弱められる）
    const sh = fx.shakeA * 0.16, shx = Math.sin(now * 91) * sh, shy = Math.cos(now * 77) * sh;
    // ワールド変換（y 上向き）
    const W = (cx) => ctx.setTransform(S, 0, 0, -S, (-cx + shx) * S, (VIEW_H + shy) * S);
    this.W = W;
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    this.drawSky(cam, pal, now);
    this.drawFar(cam, pal, now);
    W(cam);
    this.drawTerrain(g, cam, pal);
    W(cam); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 敵 → 煙・破片 → カプセル → 火・光 → 自機 → 自機の弾 →（前景）→ 敵弾。自機と敵弾は効果より上
    for (const e of g.enemies) this.drawEnemy(e, g, alpha);
    fx.update(dt);
    const tx = (-cam + shx) * S, ty = (VIEW_H + shy) * S;
    fx.draw(ctx, 0, cam - 3, cam + VIEW_W + 3, S, tx, ty);
    this.trackCapsules(g);
    for (const c of g.capsules) drawCapsule(this, c);
    fx.draw(ctx, 1, cam - 3, cam + VIEW_W + 3, S, tx, ty);
    drawPlayer(this, g);
    for (const s of g.shots) drawShot(this, s);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    this.drawFront?.(g, cam, pal, now, dt);     // 前景（背景側の担当。敵弾より下に描く）
    W(cam); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    for (const b of g.ebullets) drawBullet(this, b);
    this.updateBossBoom(g, dt);
    // 画面全体の効果: 閃光・ボス接近の赤い縁・上下端の暗がり
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fx.flashA > 0.004) { ctx.globalAlpha = Math.min(0.6, fx.flashA); ctx.fillStyle = fx.flashC; ctx.fillRect(0, 0, this.bw, this.bh); ctx.globalAlpha = 1; }
    if (this.warnT > 0) { this.warnT -= dt; ctx.globalAlpha = clamp(this.warnT, 0, 1) * (0.3 + 0.25 * Math.sin(now * 9)) * (0.4 + 0.6 * fx.k); ctx.drawImage(this.edgeCanvas('#ff2030'), 0, 0, this.bw, this.bh); ctx.globalAlpha = 1; }
    ctx.drawImage(this.edgeCanvas('#000000'), 0, 0, this.bw, this.bh);
  }
  // 上下端のぼかし帯（縦 1 列の小さな絵を引き伸ばす）
  edgeCanvas(col) {
    const m = this.edges || (this.edges = {});
    if (m[col]) return m[col];
    const cv = document.createElement('canvas'); cv.width = 2; cv.height = 256;
    const c = cv.getContext('2d'), n = parseInt(col.slice(1), 16), rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`, a = col === '#000000' ? 0.35 : 0.8, w = col === '#000000' ? 0.08 : 0.2;
    const vg = c.createLinearGradient(0, 0, 0, 256);
    vg.addColorStop(0, `rgba(${rgb},${a})`); vg.addColorStop(w, `rgba(${rgb},0)`); vg.addColorStop(1 - w, `rgba(${rgb},0)`); vg.addColorStop(1, `rgba(${rgb},${a})`);
    c.fillStyle = vg; c.fillRect(0, 0, 2, 256);
    return (m[col] = cv);
  }
  // カプセルが消えた時、自機の近くなら取得とみなして吸い込みの演出を出す
  trackCapsules(g) {
    const seen = this.capSeen, p = g.player;
    for (const c of g.capsules) { const q = seen.get(c.id); if (q) { q[0] = c.x; q[1] = c.y; q[2] = g.tickN; } else seen.set(c.id, [c.x, c.y, g.tickN]); }
    for (const [id, q] of seen) if (q[2] !== g.tickN) { seen.delete(id); if (p.alive && this.pv && Math.hypot(q[0] - p.x, q[1] - p.y) < 3) this.pv.absorb.push({ x: q[0], y: q[1], t: 0 }); }
  }

  // ボス撃破（C30）: 約 2.5 秒、部位ごとに誘爆が広がり、最後に大爆発
  updateBossBoom(g, dt) {
    const bb = this.bossBoom; if (!bb) return;
    bb.t += dt;
    const e = bb.e;
    if (e && bb.t < 2.4) {
      bb.next -= dt;
      if (bb.next <= 0) { bb.next = 0.16 - bb.t * 0.04; bossCollapse(this, e, bb.t / 2.4); }
      this.fx.shake(0.12 + bb.t * 0.08);
    }
    if (bb.t > 2.4 && !bb.final) { bb.final = true; if (e) bossCollapse(this, e, 1, true); this.fx.flash(0.55); this.fx.shake(1); }
    if (bb.t > 3) this.bossBoom = null;
  }

  drawEnemy(e, g, a) {
    if (e.dead && !e.boss) return;
    if (e.delay > 0 || (e.ghost && e.type !== 'popper' && e.type !== 'drone')) return;
    const x = lerp(e.px, e.x, a), y = lerp(e.py, e.y, a);
    if (x < this.cam - 8 || x > this.cam + VIEW_W + 10) return;
    if (drawEnemy(this, e, x, y)) return;
    if (BOSS[e.type]) drawBoss(this, e, x, y);
  }
}
installBg(Render2D);
