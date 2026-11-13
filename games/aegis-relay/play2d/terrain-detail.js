// AEGIS RELAY 2D — 地表の細部（遺跡・導線・土台・紋様・岩・配管・草など）。帯を焼くときに 1 回だけ描く
// ・光は左上から。背の高いものは右下へ影を落とす
// ・遺跡は「光らない・暗い輪郭線を持たない・彩度が低い」→ 壊せる標的（明るい縁と灯を持つ）と見分けられる
// env = { c: 実解像度の文脈, ec: 発光の層（無いこともある）, th, art, theme, minW: 1 実ピクセルの太さ }
import { TAU, rng, hexRgb, mix3, css } from './util.js';

const SHX = 2.2, SHY = 3; // 影のずれ（左上の光）
function lw(env, w) { return Math.max(w, env.minW); }
// 発光の線（にじみ → 芯）。発光の層へ
function glowStroke(ec, col, w, path) {
  if (!ec) return;
  ec.strokeStyle = css(col, 0.045); ec.lineWidth = w * 6; path(ec); ec.stroke();
  ec.strokeStyle = css(col, 0.1); ec.lineWidth = w * 2.6; path(ec); ec.stroke();
  ec.strokeStyle = css(col, 0.22); ec.lineWidth = w; path(ec); ec.stroke();
}
function glowDot(ec, col, x, y, r, a = 0.8) {
  if (!ec) return; const g = ec.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, css(col, a)); g.addColorStop(0.4, css(col, a * 0.35)); g.addColorStop(1, css(col, 0));
  ec.fillStyle = g; ec.beginPath(); ec.arc(x, y, r, 0, TAU); ec.fill();
}
function shadowed(c, fn) { c.save(); c.translate(SHX, SHY); c.fillStyle = 'rgba(0,0,0,.34)'; fn(); c.fill(); c.restore(); }

export function drawRuin(env, ru, x, y) {
  const { c, th } = env, s = ru.s, base = hexRgb(th.ruin), hi = css(mix3(base, [255, 255, 255], 0.3)), mid = css(base), lo = css(mix3(base, [0, 0, 0], 0.45)), floor = css(mix3(base, [0, 0, 0], 0.3), 0.45);
  c.save(); c.translate(x, y);
  if (ru.kind === 'pillar') { // 柱列: 敷石の上に 4 本の柱（1 本は折れている）
    c.rotate(ru.rot * 0.25 - 0.4);
    c.fillStyle = floor; c.fillRect(-13 * s, -3.4 * s, 26 * s, 6.8 * s);
    c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = lw(env, 0.3); c.strokeRect(-13 * s, -3.4 * s, 26 * s, 6.8 * s);
    for (let k = 0; k < 4; k++) {
      const px = (-9.6 + k * 6.4) * s, broken = k === (Math.floor(ru.x) & 3), sh = broken ? 0.45 : 1;
      c.fillStyle = 'rgba(0,0,0,.36)'; c.beginPath(); c.moveTo(px - 1.6 * s, 0); c.lineTo(px + SHX * 2.2 * sh * s - 1.2 * s, SHY * 2.2 * sh * s); c.lineTo(px + SHX * 2.2 * sh * s + 1.8 * s, SHY * 2.2 * sh * s - 0.6 * s); c.lineTo(px + 1.7 * s, -0.6 * s); c.closePath(); c.fill();
      c.fillStyle = lo; c.fillRect(px - 2.4 * s, -2.4 * s, 4.8 * s, 4.8 * s);
      c.fillStyle = broken ? mid : hi; c.beginPath(); c.arc(px, 0, 1.9 * s, 0, TAU); c.fill();
      c.fillStyle = broken ? lo : mid; c.beginPath(); c.arc(px + 0.35 * s, 0.4 * s, 1.35 * s, 0, TAU); c.fill();
      if (!broken) { c.fillStyle = 'rgba(255,255,255,.28)'; c.beginPath(); c.arc(px - 0.5 * s, -0.55 * s, 0.6 * s, 0, TAU); c.fill(); }
    }
  } else if (ru.kind === 'slab') { // 階段: 左上ほど高い段
    c.rotate(ru.rot * 0.3 - 0.5);
    shadowed(c, () => { c.beginPath(); c.rect(-9 * s, -5 * s, 18 * s, 10 * s); });
    for (let k = 0; k < 5; k++) { const t = k / 4; c.fillStyle = css(mix3(mix3(base, [255, 255, 255], 0.32), mix3(base, [0, 0, 0], 0.4), t)); c.fillRect((-9 + k * 3.6) * s, -5 * s, 3.7 * s, 10 * s); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect((-9 + k * 3.6 + 3.3) * s, -5 * s, 0.4 * s, 10 * s); }
    c.fillStyle = lo; c.fillRect(-9 * s, -5.9 * s, 18 * s, 0.9 * s); c.fillRect(-9 * s, 5 * s, 18 * s, 0.9 * s);
  } else if (ru.kind === 'arch') { // アーチ: 2 本の橋脚と梁。地面に弓形の影
    c.rotate(ru.rot * 0.3 - 0.45);
    c.strokeStyle = 'rgba(0,0,0,.34)'; c.lineWidth = 2.2 * s; c.beginPath(); c.moveTo(-8 * s + SHX, SHY); c.quadraticCurveTo(SHX * 4.2, SHY * 4.4, 8 * s + SHX, SHY); c.stroke();
    c.fillStyle = mid; c.fillRect(-8 * s, -1.2 * s, 16 * s, 2.4 * s);
    c.fillStyle = hi; c.fillRect(-8 * s, -1.2 * s, 16 * s, 0.9 * s);
    for (const sx of [-1, 1]) { c.fillStyle = lo; c.fillRect(sx * 8 * s - 2.6 * s, -2.8 * s, 5.2 * s, 5.6 * s); c.fillStyle = hi; c.fillRect(sx * 8 * s - 2.6 * s, -2.8 * s, 4.4 * s, 4.6 * s); c.fillStyle = mid; c.fillRect(sx * 8 * s - 1.6 * s, -1.8 * s, 3.4 * s, 3.6 * s); }
  } else { // 回廊: 欠けた円形の壁と、内側の床
    const r0 = 5.2 * s, r1 = 8 * s, gap = ru.rot;
    c.fillStyle = floor; c.beginPath(); c.arc(0, 0, r1, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.34)'; c.lineWidth = r1 - r0; c.beginPath(); c.arc(SHX * 0.9, SHY * 0.9, (r0 + r1) / 2, gap + 0.7, gap + TAU - 0.5); c.stroke();
    c.strokeStyle = mid; c.beginPath(); c.arc(0, 0, (r0 + r1) / 2, gap + 0.7, gap + TAU - 0.5); c.stroke();
    c.strokeStyle = hi; c.lineWidth = (r1 - r0) * 0.45; c.beginPath(); c.arc(-0.3 * s, -0.4 * s, (r0 + r1) / 2, gap + 0.7, gap + TAU - 0.5); c.stroke();
    c.fillStyle = lo; for (let k = 0; k < 8; k++) { const a = gap + 0.9 + (k / 8) * (TAU - 1.5); c.beginPath(); c.arc(Math.cos(a) * (r0 + r1) / 2, Math.sin(a) * (r0 + r1) / 2, 0.55 * s, 0, TAU); c.fill(); }
    c.fillStyle = mid; c.beginPath(); c.arc(0, 0, 1.6 * s, 0, TAU); c.fill(); c.fillStyle = hi; c.beginPath(); c.arc(-0.3 * s, -0.3 * s, 0.9 * s, 0, TAU); c.fill();
  }
  c.restore();
}

export function drawFeature(env, f, x, y) {
  const { c, ec, th, art, theme, Y } = env, glow = hexRgb(th.glow);
  switch (f.t) {
    case 'road': { // 導線: 標的どうしをつなぐ（テーマで道・溝・回路に見える）
      const path = (cc) => { cc.beginPath(); f.pts.forEach((p, i) => (i ? cc.lineTo(p[0], Y(p[1])) : cc.moveTo(p[0], Y(p[1])))); };
      const circuit = theme === 'mech' || theme === 'obsid' || theme === 'zenith' || theme === 'gold';
      c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = circuit ? 4.4 : 5.4; path(c); c.stroke();
      c.strokeStyle = css(mix3(hexRgb(th.side), hexRgb(th.land), circuit ? 0.25 : 0.7), circuit ? 0.9 : 0.55); c.lineWidth = circuit ? 3.2 : 4; path(c); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.1)'; c.lineWidth = lw(env, 0.35); c.save(); c.translate(-1.4, -1.4); path(c); c.stroke(); c.restore();
      c.setLineDash([1.6, 4.4]); c.strokeStyle = css(glow, 0.42); c.lineWidth = lw(env, 0.5); path(c); c.stroke(); c.setLineDash([]);
      if (ec) { ec.setLineDash([1.6, 4.4]); ec.strokeStyle = css(glow, 0.22); ec.lineWidth = 1.4; path(ec); ec.stroke(); ec.setLineDash([]); }
      break;
    }
    case 'pad': { // 標的の土台（装甲板の円盤・四角）
      const r = f.r;
      c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.arc(x + 1.2, y + 1.6, r + 0.8, 0, TAU); c.fill();
      const pb = mix3(mix3(hexRgb(th.side), hexRgb(th.land), 0.45), [70, 76, 90], 0.4), g = c.createLinearGradient(x - r, y - r, x + r, y + r); g.addColorStop(0, css(mix3(pb, [255, 255, 255], 0.3))); g.addColorStop(0.5, css(pb)); g.addColorStop(1, css(mix3(pb, [0, 0, 0], 0.5)));
      c.fillStyle = g; c.beginPath(); if (f.kind === 'dock') c.roundRect(x - r, y - r * 0.8, r * 2, r * 1.6, 3); else c.arc(x, y, r, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = lw(env, 0.4); c.beginPath(); c.arc(x, y, r - 0.5, Math.PI * 0.9, Math.PI * 1.7); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.arc(x, y, r - 0.5, -0.1 * Math.PI, 0.7 * Math.PI); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = lw(env, 0.3); for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + 0.39; c.beginPath(); c.moveTo(x + Math.cos(a) * (r - 3.2), y + Math.sin(a) * (r - 3.2)); c.lineTo(x + Math.cos(a) * (r - 0.8), y + Math.sin(a) * (r - 0.8)); c.stroke(); }
      if (f.kind === 'dock') { c.fillStyle = 'rgba(255,200,60,.5)'; for (let k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(x + k * 3.4, y + r * 0.8 - 1.8); c.lineTo(x + k * 3.4 + 1.6, y + r * 0.8 - 1.8); c.lineTo(x + k * 3.4 + 0.6, y + r * 0.8 - 0.4); c.lineTo(x + k * 3.4 - 1, y + r * 0.8 - 0.4); c.fill(); } }
      break;
    }
    case 'plinth': { // エリアコアの基壇: 同心円の縁どりと放射の導線
      for (const rr of [33.5, 49, 65]) {
        c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = lw(env, 0.5); c.beginPath(); c.arc(x, y, rr - 0.3, Math.PI * 0.85, Math.PI * 1.75); c.stroke();
        c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = lw(env, 0.7); c.beginPath(); c.arc(x, y, rr + 0.5, -0.15 * Math.PI, 0.75 * Math.PI); c.stroke();
      }
      const rad = (cc) => { cc.beginPath(); for (let k = 0; k < 12; k++) { const a = k * TAU / 12 + TAU / 24; cc.moveTo(x + Math.cos(a) * 27, y + Math.sin(a) * 27); cc.lineTo(x + Math.cos(a) * 63, y + Math.sin(a) * 63); } };
      c.strokeStyle = css(glow, 0.4); c.lineWidth = lw(env, 0.45); rad(c); c.stroke(); glowStroke(ec, glow, 0.5, rad);
      for (const rr of [41, 57]) { const ring = (cc) => { cc.beginPath(); cc.arc(x, y, rr, 0, TAU); }; c.setLineDash([3, 2.2]); c.strokeStyle = css(glow, 0.4); c.lineWidth = lw(env, 0.5); ring(c); c.stroke(); c.setLineDash([]); if (ec) { ec.setLineDash([3, 2.2]); glowStroke(ec, glow, 0.5, ring); ec.setLineDash([]); } }
      for (let k = 0; k < 12; k++) { const a = k * TAU / 12; c.fillStyle = '#1a1e28'; c.beginPath(); c.arc(x + Math.cos(a) * 65, y + Math.sin(a) * 65, 2.1, 0, TAU); c.fill(); c.fillStyle = css(glow, 0.8); c.beginPath(); c.arc(x + Math.cos(a) * 65, y + Math.sin(a) * 65, 0.9, 0, TAU); c.fill(); glowDot(ec, glow, x + Math.cos(a) * 65, y + Math.sin(a) * 65, 3.4, 0.5); }
      break;
    }
    case 'glyph': case 'crest': { // 脈動する紋様（地面に刻んだ線＋発光の層）
      const r = f.r, big = f.t === 'crest', col = big ? [235, 240, 255] : glow;
      const path = (cc) => {
        cc.beginPath(); cc.arc(x, y, r, 0, TAU); cc.moveTo(x + r * 0.72, y); cc.arc(x, y, r * 0.72, 0, TAU);
        const n = big ? 8 : [3, 4, 6, 8][f.v], st = big ? 3 : f.v === 3 ? 3 : 1;
        for (let k = 0; k <= n; k++) { const a = f.rot + (k * st * TAU) / n, px = x + Math.cos(a) * r * 0.72, py = y + Math.sin(a) * r * 0.72; k ? cc.lineTo(px, py) : cc.moveTo(px, py); }
        for (let k = 0; k < (big ? 16 : 8); k++) { const a = f.rot + (k * TAU) / (big ? 16 : 8); cc.moveTo(x + Math.cos(a) * r * 1.08, y + Math.sin(a) * r * 1.08); cc.lineTo(x + Math.cos(a) * r * 1.25, y + Math.sin(a) * r * 1.25); }
      };
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = lw(env, 0.75); c.save(); c.translate(0.25, 0.3); path(c); c.stroke(); c.restore();
      c.strokeStyle = css(col, big ? 0.5 : 0.38); c.lineWidth = lw(env, 0.36); path(c); c.stroke();
      glowStroke(ec, col, 0.6, path); glowDot(ec, col, x, y, r * 1.3, 0.1);
      break;
    }
    case 'rock': { // 岩（影つき）
      const r = rng(Math.floor(f.sd * 977) + 1), pts = [], n = 6 + Math.floor(r() * 3); for (let k = 0; k < n; k++) { const a = (k / n) * TAU, rad = f.r * (0.7 + r() * 0.5); pts.push(x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.8); }
      const path = () => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) c.lineTo(pts[k], pts[k + 1]); c.closePath(); };
      c.save(); c.translate(f.r * 0.45, f.r * 0.6); c.fillStyle = 'rgba(0,0,0,.36)'; path(); c.fill(); c.restore();
      const b = f.dark ? [52, 34, 30] : mix3(hexRgb(th.land), [255, 255, 255], 0.12), g = c.createLinearGradient(x - f.r, y - f.r, x + f.r, y + f.r); g.addColorStop(0, css(mix3(b, [255, 255, 255], 0.4))); g.addColorStop(0.55, css(b)); g.addColorStop(1, css(mix3(b, [0, 0, 0], 0.55)));
      c.fillStyle = g; path(); c.fill();
      break;
    }
    case 'crack': { // 氷の亀裂（枝分かれする折れ線）
      const r = rng(f.sd + 1), segs = []; const grow = (px, py, a, len, depth) => { let pts = [px, py]; for (let k = 0; k < len; k++) { a += (r() - 0.5) * 1.1; px += Math.cos(a) * (1.6 + r() * 2.4); py += Math.sin(a) * (1.6 + r() * 2.4); pts.push(px, py); if (depth < 2 && r() < 0.28) grow(px, py, a + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6), Math.floor(len * 0.5), depth + 1); } segs.push(pts); };
      grow(x, y, r() * TAU, 7, 0); grow(x, y, r() * TAU, 6, 0);
      const path = () => { c.beginPath(); for (const p of segs) { c.moveTo(p[0], p[1]); for (let k = 2; k < p.length; k += 2) c.lineTo(p[k], p[k + 1]); } };
      c.strokeStyle = 'rgba(16,54,92,.6)'; c.lineWidth = lw(env, 0.4); path(); c.stroke();
      c.save(); c.translate(0.3, 0.35); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = lw(env, 0.22); path(); c.stroke(); c.restore();
      break;
    }
    case 'shard': { // 結晶の群れ（氷・黒曜石）
      const r = rng(Math.floor(f.sd * 733) + 3), ice = f.col === 'ice';
      for (let k = 0; k < 3; k++) {
        const a = -2.2 + (r() - 0.5) * 1.2, len = f.r * (0.8 + r() * 0.9), bx = x + (r() - 0.5) * f.r, by = y + (r() - 0.5) * f.r * 0.6, wd = f.r * 0.36, tx = bx + Math.cos(a) * len, ty = by + Math.sin(a) * len, nx = Math.cos(a + Math.PI / 2) * wd, ny = Math.sin(a + Math.PI / 2) * wd;
        c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.moveTo(bx - nx, by - ny); c.lineTo(bx + nx, by + ny); c.lineTo(bx + len * 0.9, by + len * 0.7); c.fill();
        c.fillStyle = ice ? '#eaf8ff' : '#6a5a92'; c.beginPath(); c.moveTo(bx - nx, by - ny); c.lineTo(tx, ty); c.lineTo(bx, by); c.fill();
        c.fillStyle = ice ? '#7fb4d6' : '#1c1630'; c.beginPath(); c.moveTo(bx + nx, by + ny); c.lineTo(tx, ty); c.lineTo(bx, by); c.fill();
        if (!ice) { c.strokeStyle = 'rgba(210,170,255,.7)'; c.lineWidth = lw(env, 0.2); c.beginPath(); c.moveTo(bx, by); c.lineTo(tx, ty); c.stroke(); }
      }
      break;
    }
    case 'vent': { // 噴気孔（溶岩の光が中に見える）
      c.fillStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.arc(x, y, 2.2, 0, TAU); c.fill();
      const g = c.createRadialGradient(x, y, 0, x, y, 1.6); g.addColorStop(0, '#fff0c0'); g.addColorStop(0.5, '#ff8a30'); g.addColorStop(1, '#5a1a08'); c.fillStyle = g; c.beginPath(); c.arc(x + 0.2, y + 0.25, 1.5, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.2)'; c.lineWidth = lw(env, 0.3); c.beginPath(); c.arc(x, y, 2.2, 0.2, 1.8); c.stroke();
      glowDot(ec, [255, 130, 50], x, y, 5, 0.6);
      break;
    }
    case 'pipe': { // 配管（影・光沢・継ぎ目）
      const L = f.len, hz = f.hz, wd = 1.5;
      c.save(); c.translate(x, y); if (!hz) c.rotate(Math.PI / 2);
      c.fillStyle = 'rgba(0,0,0,.36)'; c.fillRect(-L / 2 + (hz ? SHX * 0.6 : SHY * 0.6), -wd / 2 + (hz ? SHY * 0.6 : -SHX * 0.6), L, wd);
      const g = c.createLinearGradient(0, -wd / 2, 0, wd / 2); const a = hz ? ['#c2d2d0', '#6c7c7a', '#2c3434'] : ['#aab8b6', '#5c6a68', '#262c2c']; g.addColorStop(0, a[0]); g.addColorStop(0.45, a[1]); g.addColorStop(1, a[2]);
      c.fillStyle = g; c.fillRect(-L / 2, -wd / 2, L, wd);
      for (let k = -L / 2; k <= L / 2; k += 7) { c.fillStyle = '#39423f'; c.fillRect(k - 0.5, -wd / 2 - 0.4, 1, wd + 0.8); c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(k - 0.5, -wd / 2 - 0.4, 1, 0.3); }
      c.restore();
      break;
    }
    case 'grille': { // 排気口
      const s = f.s; c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.roundRect(x - s + 0.4, y - s + 0.5, s * 2, s * 2, 0.6); c.fill();
      c.fillStyle = '#20282a'; c.beginPath(); c.roundRect(x - s, y - s, s * 2, s * 2, 0.6); c.fill();
      c.fillStyle = '#0a0e10'; for (let k = 0; k < 4; k++) c.fillRect(x - s + 0.6, y - s + 0.6 + k * (s * 2 - 1.2) / 4, s * 2 - 1.2, (s * 2 - 1.2) / 8);
      c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = lw(env, 0.3); c.beginPath(); c.moveTo(x - s, y + s - 0.6); c.lineTo(x - s, y - s + 0.6); c.lineTo(x + s - 0.6, y - s); c.stroke();
      break;
    }
    case 'lampBase': c.fillStyle = '#12161a'; c.beginPath(); c.arc(x, y, 1.3, 0, TAU); c.fill(); c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = lw(env, 0.25); c.beginPath(); c.arc(x, y, 1.3, 2.6, 5); c.stroke(); break;
    case 'tuft': { // 草むら
      const r = rng(Math.floor(f.sd * 311) + 5); c.lineWidth = lw(env, 0.28);
      for (let k = 0; k < 7; k++) { const a = -1.9 + (r() - 0.5) * 1.6, l = 1.4 + r() * 1.6, bx = x + (r() - 0.5) * 2.6, by = y + (r() - 0.5) * 1.4; c.strokeStyle = r() < 0.5 ? 'rgba(190,230,130,.75)' : 'rgba(40,80,40,.75)'; c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + Math.cos(a) * l * 0.5 + 0.3, by + Math.sin(a) * l * 0.5, bx + Math.cos(a) * l, by + Math.sin(a) * l); c.stroke(); }
      break;
    }
    case 'bush': { // 低木（葉のかたまり・影）
      const r = rng(Math.floor(f.sd * 517) + 9), bl = []; for (let k = 0; k < 5; k++) bl.push([x + (r() - 0.5) * f.r * 1.3, y + (r() - 0.5) * f.r, f.r * (0.45 + r() * 0.35)]);
      c.fillStyle = 'rgba(0,0,0,.34)'; for (const b of bl) { c.beginPath(); c.arc(b[0] + f.r * 0.45, b[1] + f.r * 0.6, b[2], 0, TAU); c.fill(); }
      for (const b of bl) { c.fillStyle = '#24481f'; c.beginPath(); c.arc(b[0], b[1], b[2], 0, TAU); c.fill(); }
      for (const b of bl) { c.fillStyle = '#4f8a3a'; c.beginPath(); c.arc(b[0] - b[2] * 0.2, b[1] - b[2] * 0.25, b[2] * 0.72, 0, TAU); c.fill(); c.fillStyle = 'rgba(200,240,140,.55)'; c.beginPath(); c.arc(b[0] - b[2] * 0.35, b[1] - b[2] * 0.4, b[2] * 0.32, 0, TAU); c.fill(); }
      break;
    }
    case 'inlay': { // 象嵌の線（金・銀）。両端にひし形
      const L = f.len, a0 = f.hz ? [x - L / 2, y] : [x, y - L / 2], a1 = f.hz ? [x + L / 2, y] : [x, y + L / 2];
      const path = (cc) => { cc.beginPath(); cc.moveTo(a0[0], a0[1]); cc.lineTo(a1[0], a1[1]); };
      c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 1.1; path(c); c.stroke();
      c.strokeStyle = f.gold ? '#a8771c' : '#7c86c8'; c.lineWidth = 0.75; path(c); c.stroke();
      c.strokeStyle = f.gold ? '#ffe9a0' : '#f0f3ff'; c.lineWidth = lw(env, 0.28); c.save(); c.translate(-0.12, -0.14); path(c); c.stroke(); c.restore();
      for (const p of [a0, a1]) { c.fillStyle = f.gold ? '#d8a838' : '#aab4ee'; c.beginPath(); c.moveTo(p[0], p[1] - 1.5); c.lineTo(p[0] + 1.5, p[1]); c.lineTo(p[0], p[1] + 1.5); c.lineTo(p[0] - 1.5, p[1]); c.fill(); c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.moveTo(p[0], p[1] - 1.5); c.lineTo(p[0] - 1.5, p[1]); c.lineTo(p[0], p[1]); c.fill(); }
      if (ec) { ec.strokeStyle = css(f.gold ? [255, 210, 110] : [200, 210, 255], 0.16); ec.lineWidth = 2.6; path(ec); ec.stroke(); }
      break;
    }
    case 'medal': { // 金の円形の象嵌
      const r = f.r; c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.arc(x + 0.3, y + 0.4, r, 0, TAU); c.fill();
      const g = c.createLinearGradient(x - r, y - r, x + r, y + r); g.addColorStop(0, '#fff0b0'); g.addColorStop(0.45, '#d09a2c'); g.addColorStop(1, '#6a4410'); c.strokeStyle = g; c.lineWidth = 0.9; c.beginPath(); c.arc(x, y, r - 0.5, 0, TAU); c.stroke();
      c.lineWidth = lw(env, 0.4); c.beginPath(); for (let k = 0; k <= 8; k++) { const a = (k * 3 * TAU) / 8; k ? c.lineTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72) : c.moveTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72); } c.stroke();
      glowDot(ec, [255, 210, 110], x, y, r * 1.2, 0.2);
      break;
    }
    case 'crystal': { // 崖の下にぶら下がる結晶（苔のエリアは根も垂れる）
      const r = rng(Math.floor(f.sd * 911) + 11), col = hexRgb(art.crystal), s = f.s;
      if (theme === 'moss' || theme === 'ash') { c.strokeStyle = theme === 'moss' ? 'rgba(30,54,26,.9)' : 'rgba(30,32,40,.9)'; c.lineWidth = lw(env, 0.35); for (let k = 0; k < 4; k++) { const bx = x + (r() - 0.5) * 7, l = 3 + r() * 6; c.beginPath(); c.moveTo(bx, y - 5); c.bezierCurveTo(bx + (r() - 0.5) * 3, y - 5 + l * 0.4, bx + (r() - 0.5) * 3, y - 5 + l * 0.8, bx + (r() - 0.5) * 2, y - 5 + l); c.stroke(); } }
      for (let k = 0; k < 3; k++) {
        const bx = x + (k - 1) * 1.7 * s + (r() - 0.5), l = (3 + r() * 4.5) * s, wd = (0.7 + r() * 0.5) * s, by = y - 2 * s;
        const g = c.createLinearGradient(bx, by, bx, by + l); g.addColorStop(0, css(mix3(col, [0, 0, 0], 0.55))); g.addColorStop(0.6, css(col)); g.addColorStop(1, '#ffffff');
        c.fillStyle = g; c.beginPath(); c.moveTo(bx - wd, by); c.lineTo(bx + wd, by); c.lineTo(bx + wd * 0.2, by + l); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.moveTo(bx - wd, by); c.lineTo(bx - wd * 0.3, by); c.lineTo(bx + wd * 0.2, by + l); c.closePath(); c.fill();
      }
      glowDot(ec, col, x, y + 2 * s, 6 * s, 0.4);
      break;
    }
  }
}
