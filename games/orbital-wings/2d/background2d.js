// ORBITAL WINGS 2D — 背景（空・星・遠景・地形・前景）。Render2D に混ぜ込んで使う（this は Render2D）
import { VIEW_W, VIEW_H } from '../shared/config.js';
import { fbm, hash1 } from '../shared/rng.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export class Bg2D {
  // 空と星（最背面）。変換は this.W(カメラ x) で設定する
  drawSky(cam, pal, now) {
    const ctx = this.ctx, W = this.W;
    // 空
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, this.bh);
    sky.addColorStop(0, pal.sky[0]); sky.addColorStop(0.55, pal.sky[1]); sky.addColorStop(1, pal.sky[0]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, this.bw, this.bh);
    // 星（3 層の視差）
    W(0);
    for (const s of this.stageCache.stars) {
      const par = [0.05, 0.12, 0.25][s.L];
      let x = ((s.x - cam * par) % 80 + 80) % 80 - 24;
      if (x < -1 || x > VIEW_W + 1) continue;
      const tw = 0.55 + 0.45 * Math.sin(now * (1.5 + s.L) + s.tw);
      ctx.fillStyle = s.c > 0.8 ? `rgba(255,200,170,${tw})` : s.c > 0.6 ? `rgba(170,200,255,${tw})` : `rgba(255,255,255,${tw * 0.9})`;
      if (s.s < 0.06) ctx.fillRect(x, s.y, s.s, s.s); else { ctx.beginPath(); ctx.arc(x, s.y, s.s * 0.5, 0, TAU); ctx.fill(); }
    }
  }
  buildStageCache() {
    const st = this.stage, ctx = this.ctx;
    const pal = st.pal;
    // 地形の模様（タイル）。ステージごとに作る
    const tile = document.createElement('canvas'); tile.width = tile.height = 256;
    const t = tile.getContext('2d');
    t.fillStyle = pal.ground[0]; t.fillRect(0, 0, 256, 256);
    const id = st.id;
    for (let i = 0; i < 900; i++) {
      const x = hash1(i, id * 7) * 256, y = hash1(i + 999, id * 7) * 256, v = hash1(i + 3333, id);
      t.fillStyle = rgba(v > 0.5 ? pal.ground[1] : pal.ground[2], 0.05 + v * 0.08);
      const s = 2 + hash1(i, 5) * (id === 6 ? 26 : 14);
      if (id === 2 || id === 4 || id === 7) t.fillRect(x, y, s * 1.6, s * 0.6);
      else { t.beginPath(); t.arc(x, y, s * 0.6, 0, TAU); t.fill(); }
    }
    t.strokeStyle = rgba(pal.ground[2], 0.55); t.lineWidth = 2;
    if (id === 2) { for (let y = 0; y < 256; y += 32) { t.beginPath(); t.moveTo(0, y); t.lineTo(256, y); t.stroke(); for (let x = ((y / 32) % 2) * 32; x < 256; x += 64) { t.beginPath(); t.moveTo(x, y); t.lineTo(x, y + 32); t.stroke(); } } }
    if (id === 7) { t.strokeStyle = rgba(pal.edge, 0.18); for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) { t.strokeRect(x + 4, y + 4, 56, 56); t.fillStyle = rgba(pal.edge, 0.25); t.fillRect(x + 8, y + 8, 4, 4); t.fillRect(x + 52, y + 52, 4, 4); } }
    if (id === 4) { t.strokeStyle = rgba(pal.edge, 0.12); for (let x = -256; x < 256; x += 24) { t.beginPath(); t.moveTo(x, 256); t.lineTo(x + 256, 0); t.stroke(); } }
    if (id === 1 || id === 5) { t.strokeStyle = rgba(pal.glow, id === 1 ? 0.35 : 0.28); t.lineWidth = 2.5; for (let i = 0; i < 9; i++) { t.beginPath(); let x = hash1(i, 77) * 256, y = hash1(i, 78) * 256; t.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (hash1(i * 9 + k, 3) - 0.5) * 50; y += hash1(i * 9 + k, 4) * 30; t.lineTo(x, y); } t.stroke(); } }
    if (id === 6) { t.strokeStyle = rgba(pal.edge, 0.18); for (let i = 0; i < 26; i++) { t.beginPath(); t.arc(hash1(i, 9) * 256, hash1(i, 10) * 256, 8 + hash1(i, 11) * 20, 0, TAU); t.stroke(); } }
    if (id === 3) { t.strokeStyle = rgba(pal.ground[2], 0.35); for (let y = 0; y < 256; y += 48) { t.beginPath(); t.moveTo(0, y + 10); t.bezierCurveTo(80, y, 170, y + 22, 256, y + 10); t.stroke(); } }
    const pattern = ctx.createPattern(tile, 'repeat');
    // 星
    const stars = [];
    for (let L = 0; L < 3; L++) for (let i = 0; i < 90 * (pal.stars + 0.2); i++) stars.push({ L, x: hash1(i * 3 + L, 1) * 80, y: hash1(i * 3 + L, 2) * VIEW_H, s: (0.03 + hash1(i, L + 4) * 0.05) * (L + 1) * 0.6, tw: hash1(i, 9) * TAU, c: hash1(i, 12) });
    this.stageCache = { pattern, stars, tileS: 256 };
  }

  // 遠景（ステージごとの影絵。視差 0.3）
  drawFar(cam, pal, now) {
    const ctx = this.ctx, id = this.stage.id, par = 0.3, off = cam * par;
    this.W(off);
    ctx.fillStyle = rgba(pal.far, 0.95);
    ctx.beginPath();
    const x0 = Math.floor(off) - 2, x1 = off + VIEW_W + 2;
    if (id === 1) {
      ctx.moveTo(x0, 0);
      for (let x = x0; x <= x1; x += 0.5) ctx.lineTo(x, 2.5 + fbm(x * 0.05, 101) * 6 + Math.max(0, 4 - Math.abs(((x % 60) + 60) % 60 - 30) * 0.4) * 1.2);
      ctx.lineTo(x1, 0); ctx.fill();
      // 遠い溶岩の川
      ctx.strokeStyle = rgba(pal.glow, 0.35 + 0.1 * Math.sin(now * 2)); ctx.lineWidth = 0.08;
      for (let k = Math.floor(x0 / 60) * 60 + 30; k < x1; k += 60) { ctx.beginPath(); ctx.moveTo(k, 7.4); ctx.quadraticCurveTo(k + 1.4, 5, k + 0.5, 2); ctx.stroke(); }
    } else if (id === 2 || id === 3) {
      ctx.moveTo(x0, 0);
      for (let x = x0; x <= x1; x += 0.5) ctx.lineTo(x, 1.5 + fbm(x * 0.04, 202) * 3);
      ctx.lineTo(x1, 0); ctx.fill();
      // 遠くの柱や像
      for (let k = Math.floor(x0 / 14) * 14; k < x1; k += 14) {
        const h = 3 + hash1(k, 7) * 5, w = id === 3 ? 2.2 : 0.9;
        ctx.fillRect(k, 1.5, w, h);
        if (id === 3) { ctx.beginPath(); ctx.ellipse(k + w / 2, 1.5 + h + 0.9, 1.3, 1.3, 0, 0, TAU); ctx.fill(); }
        else ctx.fillRect(k - 0.3, 1.5 + h, w + 0.6, 0.35);
      }
    } else if (id === 4 || id === 7) {
      for (let k = Math.floor(x0 / 3) * 3; k < x1; k += 3) {
        const h = 2 + hash1(k, id) * 6;
        ctx.fillRect(k, 0, 2.4, h); ctx.fillRect(k + 0.8, h, 0.8, hash1(k, 3) * 2);
        ctx.fillRect(k, VIEW_H - h * 0.7, 2.4, h * 0.7);
      }
      ctx.fillStyle = rgba(pal.glow, 0.25 + 0.15 * Math.sin(now * 3));
      for (let k = Math.floor(x0 / 3) * 3; k < x1; k += 3) if (hash1(k, 99) > 0.6) ctx.fillRect(k + 1, 1 + hash1(k, 5) * 4, 0.25, 0.25);
    } else {
      // 生体・細胞: 漂う大きな影
      for (let k = Math.floor(x0 / 8) * 8; k < x1; k += 8) {
        const r = 1.5 + hash1(k, 4) * 3, y = 2 + hash1(k, 6) * 14;
        ctx.globalAlpha = 0.45;
        ctx.beginPath(); ctx.arc(k + Math.sin(now * 0.3 + k) * 0.5, y, r, 0, TAU); ctx.fill();
        if (id === 6) { ctx.strokeStyle = rgba(pal.edge, 0.12); ctx.lineWidth = 0.08; ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
    }
  }

  drawTerrain(g, cam, pal) {
    const ctx = this.ctx, t = g.terrain, tk = g.stageTick;
    const x0 = Math.floor(cam * 2) / 2 - 1, x1 = cam + VIEW_W + 1;
    const pat = this.stageCache.pattern;
    const S = this.S;
    pat.setTransform?.(new DOMMatrix([1 / 256 * 6, 0, 0, -1 / 256 * 6, 0, 0]));
    const edgeGlow = pal.edge;
    for (const side of ['f', 'c']) {
      const at = side === 'f' ? (x) => g.floorAt(x) : (x) => g.ceilAt(x);
      // 地形が無い区間は飛ばす
      ctx.beginPath();
      let open = false;
      const base = side === 'f' ? -1 : VIEW_H + 1;
      let started = false;
      for (let x = x0; x <= x1 + 0.01; x += 0.5) {
        const y = at(x);
        const none = side === 'f' ? y < -1 : y > VIEW_H + 1;
        if (none) { if (started) { ctx.lineTo(x, base); ctx.closePath(); started = false; } continue; }
        if (!started) { ctx.moveTo(x, base); started = true; }
        ctx.lineTo(x, y);
      }
      if (started) { ctx.lineTo(x1 + 0.5, base); ctx.closePath(); }
      ctx.fillStyle = pal.ground[0]; ctx.fill();
      ctx.fillStyle = pat; ctx.fill();
      // 陰影（縁から内側へ暗く）
      const gr = ctx.createLinearGradient(0, side === 'f' ? 6 : VIEW_H - 6, 0, side === 'f' ? 0 : VIEW_H);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = gr; ctx.fill();
      // 縁の光
      ctx.beginPath(); started = false;
      for (let x = x0; x <= x1 + 0.01; x += 0.5) {
        const y = at(x); const none = side === 'f' ? y < -1 : y > VIEW_H + 1;
        if (none) { started = false; continue; }
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.lineJoin = 'round';
      ctx.strokeStyle = rgba(pal.ground[1], 0.9); ctx.lineWidth = 0.14; ctx.stroke();
      ctx.strokeStyle = rgba(edgeGlow, 0.55); ctx.lineWidth = 0.04; ctx.stroke();
    }
    // 壊れない箱（柱・金属塊・細胞塊）
    for (const b of t.blocks) {
      if (b.x1 < cam - 1 || b.x0 > cam + VIEW_W + 1) continue;
      ctx.fillStyle = pal.ground[0]; ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      ctx.fillStyle = pat; ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      ctx.strokeStyle = rgba(pal.ground[1], 0.9); ctx.lineWidth = 0.12; ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      if (b.kind === 'pillar') { ctx.fillStyle = rgba(pal.ground[2], 0.5); for (let x = b.x0 + 0.35; x < b.x1 - 0.2; x += 0.6) ctx.fillRect(x, b.y0 + 0.2, 0.12, b.y1 - b.y0 - 0.4); }
      if (b.kind === 'metal') { ctx.strokeStyle = rgba(pal.glow, 0.5); ctx.lineWidth = 0.05; ctx.strokeRect(b.x0 + 0.3, b.y0 + 0.3, b.x1 - b.x0 - 0.6, b.y1 - b.y0 - 0.6); }
    }
  }

  // ---- 自機・オプション・シールド -----------------------------------------------
}
// Render2D に混ぜ込む
export function install(Target) { for (const k of Object.getOwnPropertyNames(Bg2D.prototype)) if (k !== 'constructor') Target.prototype[k] = Bg2D.prototype[k]; }
