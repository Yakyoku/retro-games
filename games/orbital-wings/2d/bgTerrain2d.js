// ORBITAL WINGS 2D — 地形の材質（面ごとの高精細な模様と発光）・縁の細部・壊れない箱
// 材質は 8u 四方の継ぎ目のない絵に焼き、パターンとして地形の形に塗る。形は当たり判定そのまま。
import { VIEW_H } from '../shared/config.js';
import { hash1 } from '../shared/rng.js';
import { TAU, lerp, rgba, mix, lum, canvas, tint, pfbm1, glowSprite } from './bgUtil2d.js';

const TW = 8;
function mkTile(B, paint, k = 1) {
  const T = Math.min(1024, Math.max(128, Math.round(TW * B.S * k)));
  const cv = canvas(T, T), c = cv.getContext('2d');
  c.setTransform(T / TW, 0, 0, -T / TW, 0, T); c.lineJoin = 'round'; c.lineCap = 'round';
  paint(c);
  return cv;
}
// 端をまたぐ模様を継ぎ目なく描く（9 回ずらして描く）
function wrap(c, fn) { for (let ox = -TW; ox <= TW; ox += TW) for (let oy = -TW; oy <= TW; oy += TW) { c.save(); c.translate(ox, oy); fn(c); c.restore(); } }
function mottle(c, src, color, a, reps) {
  const t = tint(src, color), s = TW / reps;
  c.globalAlpha = a;
  for (let i = 0; i < reps; i++) for (let j = 0; j < reps; j++) c.drawImage(t, i * s, j * s, s, s);
  c.globalAlpha = 1;
}
const H = (i, s) => hash1(i, s);
// 光る線（外側のにじみ → 色 → 白い芯）
export function glowStroke(c, path, color, w, core = '#fff4d0') {
  for (const [k, a, col] of [[4.2, 0.1, color], [2.2, 0.22, color], [1, 0.85, color], [0.35, 0.9, core]]) { c.strokeStyle = rgba(col, a); c.lineWidth = w * k; path(c); c.stroke(); }
}
export function poly(c, pts) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); }
export function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
// 面取りした板（左上が明るく右下が暗い）
export function bevel(c, x, y, w, h, light, dark, t = 0.05) {
  c.fillStyle = light; c.fillRect(x, y + h - t, w, t); c.fillRect(x, y, t, h);
  c.fillStyle = dark; c.fillRect(x, y, w, t); c.fillRect(x + w - t, y, t, h);
}
// 縁の細部の小さな絵（床向きに描く。y = h - up が地表）
function spr(B, w, h, up, paint, o = {}) {
  const cv = canvas(w * B.S, h * B.S), c = cv.getContext('2d');
  c.setTransform(cv.width / w, 0, 0, -cv.height / h, 0, cv.height); c.lineJoin = 'round'; c.lineCap = 'round';
  paint(c, w, h, h - up);
  return { cv, w, h, up, maxSlope: o.maxSlope ?? 0.5, side: o.side };
}

// ---- 面ごとの材質 -----------------------------------------------------------------
const MATS = {
  // 1: 火山岩（層理・割れ・気泡）＋溶岩の割れ目
  1(B) {
    const p = B.pal;
    const tile = mkTile(B, (c) => {
      c.fillStyle = p.ground[0]; c.fillRect(0, 0, TW, TW);
      mottle(c, B.com.cloudA, p.ground[2], 0.75, 1); mottle(c, B.com.cloudB, mix(p.ground[0], p.ground[1], 0.55), 0.3, 2);
      for (let i = 0; i < 12; i++) {
        const y0 = (i + 0.2 + H(i, 3) * 0.6) * TW / 12, amp = 0.1 + H(i, 4) * 0.2;
        const path = (dy) => { c.beginPath(); for (let x = 0; x <= TW + 0.01; x += 0.2) { const y = y0 + dy + (pfbm1(x, TW, 20 + i, 3, 0.5) - 0.5) * amp * 2; if (x) c.lineTo(x, y); else c.moveTo(x, y); } };
        path(0); c.strokeStyle = rgba(p.ground[2], 0.6); c.lineWidth = 0.05 + H(i, 5) * 0.08; c.stroke();
        path(-0.075); c.strokeStyle = rgba(p.ground[1], 0.2); c.lineWidth = 0.035; c.stroke();
      }
      wrap(c, () => {
        for (let i = 0; i < 26; i++) {       // 角ばった岩の面
          const x = H(i, 31) * TW, y = H(i, 32) * TW, r = 0.25 + H(i, 33) * 0.55, n = 5 + (H(i, 34) * 3 | 0), pts = [];
          for (let k = 0; k < n; k++) { const a = k / n * TAU + H(i * 9 + k, 35) * 0.6, rr = r * (0.6 + H(i * 9 + k, 36) * 0.5); pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7); }
          poly(c, pts); c.fillStyle = rgba(H(i, 37) > 0.5 ? p.ground[1] : p.ground[2], 0.1 + H(i, 38) * 0.12); c.fill();
          c.strokeStyle = rgba(p.ground[2], 0.35); c.lineWidth = 0.03; c.stroke();
          c.beginPath(); c.moveTo(pts[0], pts[1]); c.lineTo(pts[2], pts[3]); c.lineTo(pts[4], pts[5]); c.strokeStyle = rgba(p.ground[1], 0.3); c.lineWidth = 0.03; c.stroke();
        }
        for (let i = 0; i < 110; i++) {      // 気泡の穴
          const x = H(i, 41) * TW, y = H(i, 42) * TW, r = 0.02 + H(i, 43) ** 2 * 0.09;
          c.fillStyle = rgba(p.ground[2], 0.75); c.beginPath(); c.ellipse(x, y, r * 1.3, r, 0, 0, TAU); c.fill();
          c.strokeStyle = rgba(p.ground[1], 0.3); c.lineWidth = 0.015; c.beginPath(); c.arc(x, y - r * 0.4, r * 1.2, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
        }
        c.strokeStyle = rgba('#000000', 0.5); c.lineWidth = 0.03;
        for (let i = 0; i < 12; i++) { let x = H(i, 51) * TW, y = H(i, 52) * TW; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (H(i * 7 + k, 53) - 0.5) * 0.7; y -= H(i * 7 + k, 54) * 0.45; c.lineTo(x, y); } c.stroke(); }
      });
    });
    const emis = mkTile(B, (c) => wrap(c, () => {
      for (let i = 0; i < 7; i++) {
        const pts = []; let x = H(i, 61) * TW, y = H(i, 62) * TW, d = H(i, 63) * TAU;
        for (let k = 0; k < 9; k++) { pts.push(x, y); d += (H(i * 11 + k, 64) - 0.5) * 1.5; x += Math.cos(d) * 0.42; y += Math.sin(d) * 0.3; }
        glowStroke(c, (cc) => { cc.beginPath(); cc.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) cc.lineTo(pts[k], pts[k + 1]); }, p.glow, 0.035 + H(i, 65) * 0.04, '#ffe9a8');
        const bx = pts[8], by = pts[9];
        glowStroke(c, (cc) => { cc.beginPath(); cc.moveTo(bx, by); cc.lineTo(bx + 0.4, by - 0.5); cc.lineTo(bx + 0.3, by - 0.95); }, p.glow, 0.03, '#ffe9a8');
      }
    }), 0.5);
    const decor = [
      spr(B, 1.5, 0.95, 0.12, (c, w, h, s) => {      // 埋まった岩
        const pts = []; for (let k = 0; k < 9; k++) { const a = k / 9 * TAU, rr = 0.8 + H(k, 71) * 0.25; pts.push(w / 2 + Math.cos(a) * w * 0.46 * rr, h * 0.5 + Math.sin(a) * h * 0.47 * rr); }
        poly(c, pts); const g = c.createLinearGradient(0, h, 0, 0); g.addColorStop(0, mix(p.ground[1], p.ground[0], 0.35)); g.addColorStop(0.5, p.ground[0]); g.addColorStop(1, p.ground[2]); c.fillStyle = g; c.fill();
        c.strokeStyle = rgba('#000000', 0.55); c.lineWidth = 0.06; c.stroke();
        c.strokeStyle = rgba(p.edge, 0.55); c.lineWidth = 0.035; c.beginPath(); c.moveTo(pts[4], pts[5]); c.lineTo(pts[6], pts[7]); c.lineTo(pts[8], pts[9]); c.stroke();
        c.strokeStyle = rgba(p.ground[2], 0.7); c.lineWidth = 0.03; c.beginPath(); c.moveTo(w * 0.5, h * 0.85); c.lineTo(w * 0.42, h * 0.5); c.lineTo(w * 0.6, h * 0.2); c.moveTo(w * 0.42, h * 0.5); c.lineTo(w * 0.2, h * 0.4); c.stroke();
      }),
      spr(B, 1.3, 0.75, 0.15, (c, w, h, s) => {      // 黒曜石の結晶（地表から少しだけ覗く）
        for (let k = 0; k < 5; k++) {
          const x = 0.2 + k * 0.22 + H(k, 73) * 0.06, hh = 0.32 + H(k, 74) * 0.36, ww = 0.13 + H(k, 75) * 0.05, lean = (H(k, 76) - 0.5) * 0.18, y0 = s - 0.5 + H(k, 77) * 0.08, top = Math.min(h - 0.01, y0 + hh);
          poly(c, [x - ww, y0, x + ww, y0, x + ww * 0.7 + lean, top - 0.12, x + lean, top, x - ww * 0.7 + lean, top - 0.16]); c.fillStyle = '#1c0a10'; c.fill();
          poly(c, [x - ww, y0, x, y0, x + lean, top, x - ww * 0.7 + lean, top - 0.16]); c.fillStyle = '#4a1c1c'; c.fill();
          c.strokeStyle = rgba(p.edge, 0.85); c.lineWidth = 0.03; c.beginPath(); c.moveTo(x - ww * 0.7 + lean, top - 0.16); c.lineTo(x + lean, top); c.lineTo(x + ww * 0.7 + lean, top - 0.12); c.stroke();
        }
        c.fillStyle = rgba(p.ground[2], 0.9); c.beginPath(); c.ellipse(w / 2, s - 0.5, w * 0.46, 0.09, 0, 0, TAU); c.fill();
      }, { maxSlope: 0.35 }),
      spr(B, 1.3, 0.6, 0, (c, w, h, s) => {          // 溶岩の覗く裂け目
        const g = c.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, w * 0.5); g.addColorStop(0, rgba(p.glow, 0.5)); g.addColorStop(1, rgba(p.glow, 0));
        c.save(); c.translate(0, h * 0.25); c.scale(1, 0.5); c.fillStyle = g; c.fillRect(0, 0, w, h * 2); c.restore();
        c.fillStyle = '#120606'; c.beginPath(); c.ellipse(w / 2, h * 0.5, w * 0.36, h * 0.2, 0, 0, TAU); c.fill();
        c.fillStyle = p.glow; c.beginPath(); c.ellipse(w / 2, h * 0.47, w * 0.28, h * 0.11, 0, 0, TAU); c.fill();
        c.fillStyle = '#ffe9a8'; c.beginPath(); c.ellipse(w / 2, h * 0.46, w * 0.16, h * 0.045, 0, 0, TAU); c.fill();
      }, { maxSlope: 0.3 }),
    ];
    return {
      tile, emis, decor,
      spots: { spr: glowSprite(B.S * 1.2, p.glow, 0.25, 1.8), step: 1.3, p: 0.5, d0: 0.5, d1: 1.9, s0: 0.5, s1: 1.3, a0: 0.25, speed: 1.7 },
      cfg: { emis: [0.45, 0.55, 1.3], aoCol: '#0a0204', ao: [[0.9, 0.2], [2.0, 0.24], [3.4, 0.3]], top: [0.2, rgba(p.edge, 0.42), 0.26, rgba(p.ground[1], 0.2)], under: [0.2, rgba(p.glow, 0.26), 0.26, rgba('#000000', 0.28)],
        decorStep: 1.7, decorP: 0.52, outline: '#150606', rimW: 0.07, rimF: p.edge, rimC: mix(p.edge, p.glow, 0.6), line2: [0.5, rgba('#000000', 0.35), 0.05] },
    };
  },
  // 2: 石積み（段ごとの石・面取り・苔）＋光る紋様
  2(B) {
    const p = B.pal, CH = 0.8;
    const blocks = [];
    for (let r = 0; r < 10; r++) { let x = H(r, 3) * 1.2; while (x < TW + 0.01) { const w = Math.min(0.9 + H(blocks.length, 4) * 1.5, TW + H(r, 3) * 1.2 - x); if (w < 0.5) break; blocks.push([x % TW, r * CH, w, r]); x += w; } }
    const tile = mkTile(B, (c) => {
      c.fillStyle = p.ground[2]; c.fillRect(0, 0, TW, TW);
      wrap(c, () => blocks.forEach(([x, y, w], i) => {
        const g = 0.04, v = H(i, 7);
        c.fillStyle = mix(mix(p.ground[0], p.ground[2], 0.25), p.ground[1], v * 0.28); c.fillRect(x + g, y + g, w - g * 2, CH - g * 2);
        bevel(c, x + g, y + g, w - g * 2, CH - g * 2, rgba(p.ground[1], 0.5), rgba('#000000', 0.38), 0.06);
        if (H(i, 8) > 0.72) { c.strokeStyle = rgba(p.ground[2], 0.8); c.lineWidth = 0.025; c.beginPath(); let cx = x + w * (0.3 + H(i, 9) * 0.4), cy = y + CH - g; c.moveTo(cx, cy); for (let k = 0; k < 4; k++) { cx += (H(i * 5 + k, 10) - 0.5) * 0.3; cy -= CH / 4.2; c.lineTo(cx, cy); } c.stroke(); }
        if (H(i, 11) > 0.8 && w > 1.2) {             // 浅い浮き彫り（渦）
          c.strokeStyle = rgba('#000000', 0.3); c.lineWidth = 0.04; c.beginPath();
          for (let k = 0; k <= 22; k++) { const a = k * 0.55, rr = 0.03 + k * 0.011; const px = x + w / 2 + Math.cos(a) * rr, py = y + CH / 2 + Math.sin(a) * rr; if (k) c.lineTo(px, py); else c.moveTo(px, py); }
          c.stroke();
        }
      }));
      mottle(c, B.com.cloudA, '#000000', 0.3, 1); mottle(c, B.com.cloudC, '#2e6a5a', 0.16, 2); mottle(c, B.com.cloudB, p.ground[1], 0.1, 2);
    });
    const emis = mkTile(B, (c) => wrap(c, () => blocks.forEach(([x, y, w], i) => {
      if (H(i, 13) < 0.86 || w < 1.0) return;
      const cx = x + w / 2, cy = y + CH / 2, s = 0.2, P3 = (k) => [cx + ((k % 3) - 1) * s, cy + (((k / 3) | 0) - 1) * s];
      glowStroke(c, (cc) => { cc.beginPath(); let k = (H(i, 14) * 9) | 0; cc.moveTo(...P3(k)); for (let j = 0; j < 4; j++) { k = (k + 1 + ((H(i * 3 + j, 15) * 7) | 0)) % 9; cc.lineTo(...P3(k)); } }, p.glow, 0.03, '#e8fbff');
    })), 0.5);
    const decor = [
      spr(B, 1.3, 0.95, 0, (c, w, h) => {            // 紋様の石板
        c.fillStyle = rgba('#000000', 0.45); c.fillRect(0.05, 0.05, w - 0.1, h - 0.1);
        c.fillStyle = mix(p.ground[0], p.ground[1], 0.3); c.fillRect(0.12, 0.12, w - 0.24, h - 0.24);
        bevel(c, 0.12, 0.12, w - 0.24, h - 0.24, rgba(p.edge, 0.6), rgba('#000000', 0.45), 0.05);
        c.strokeStyle = rgba(p.ground[2], 0.85); c.lineWidth = 0.05;
        c.beginPath(); c.arc(w / 2, h / 2, 0.22, 0, TAU); c.moveTo(w / 2 - 0.4, h / 2); c.lineTo(w / 2 - 0.22, h / 2); c.moveTo(w / 2 + 0.22, h / 2); c.lineTo(w / 2 + 0.4, h / 2); c.moveTo(w / 2, h / 2 - 0.1); c.lineTo(w / 2, h / 2 + 0.1); c.stroke();
        c.fillStyle = rgba(p.glow, 0.9); c.beginPath(); c.arc(w / 2, h / 2, 0.06, 0, TAU); c.fill();
      }, { maxSlope: 0.2 }),
      spr(B, 1.4, 0.55, 0.14, (c, w, h, s) => {      // 崩れた石くれ
        for (let k = 0; k < 6; k++) { const x = 0.08 + k * 0.21, ww = 0.18 + H(k, 21) * 0.1, hh = 0.14 + H(k, 22) * 0.16, y0 = s - 0.2 + H(k, 23) * 0.06; c.save(); c.translate(x + ww / 2, y0); c.rotate((H(k, 24) - 0.5) * 0.5);
          c.fillStyle = mix(p.ground[0], p.ground[1], H(k, 25) * 0.4); c.fillRect(-ww / 2, 0, ww, hh); bevel(c, -ww / 2, 0, ww, hh, rgba(p.edge, 0.55), rgba('#000000', 0.5), 0.03); c.restore(); }
      }, { maxSlope: 0.25 }),
      spr(B, 1.2, 0.9, 0.15, (c, w, h, s) => {       // 苔と蔓
        for (let k = 0; k < 16; k++) { const x = 0.1 + H(k, 27) * (w - 0.2), len = 0.2 + H(k, 28) * 0.55; c.strokeStyle = rgba(k % 3 ? '#3f8f78' : '#7fd8c0', 0.75); c.lineWidth = 0.03 + H(k, 29) * 0.03;
          c.beginPath(); c.moveTo(x, s + 0.1 * H(k, 30)); c.quadraticCurveTo(x + (H(k, 31) - 0.5) * 0.3, s - len * 0.5, x + (H(k, 32) - 0.5) * 0.25, s - len); c.stroke(); }
        c.fillStyle = rgba('#58b89a', 0.7); for (let k = 0; k < 9; k++) { c.beginPath(); c.ellipse(0.12 + k * 0.12, s + 0.03, 0.09, 0.07 + H(k, 33) * 0.05, 0, 0, TAU); c.fill(); }
      }),
    ];
    return {
      tile, emis, decor,
      spots: { spr: glowSprite(B.S * 1.0, p.glow, 0.3, 2), step: 2.1, p: 0.4, d0: 0.45, d1: 1.6, s0: 0.35, s1: 0.8, a0: 0.1, speed: 0.9 },
      cfg: { emis: [0.3, 0.7, 0.8], aoCol: '#02060c', ao: [[0.85, 0.16], [1.8, 0.22], [3.0, 0.3]], top: [0.16, rgba(p.edge, 0.6), 0.22, rgba(p.ground[1], 0.22)], under: [0.16, rgba(p.glow, 0.22), 0.3, rgba('#000000', 0.3)],
        decorStep: 1.9, decorP: 0.55, outline: '#0c0e12', rimW: 0.07, rimF: '#fff6d8', rimC: mix(p.edge, p.glow, 0.45), line2: [0.42, rgba('#000000', 0.4), 0.05] },
    };
  },
  // 3: 巨石（大きな石板・回紋の帯・風化の筋）＋金の象嵌
  3(B) {
    const p = B.pal;
    const meander = (c, y, hgt) => { c.beginPath(); const u = hgt / 3; for (let x = 0; x < TW; x += u * 4) { c.moveTo(x, y); c.lineTo(x, y + u * 3); c.lineTo(x + u * 3, y + u * 3); c.lineTo(x + u * 3, y + u); c.lineTo(x + u * 1.5, y + u); c.lineTo(x + u * 1.5, y + u * 2); c.moveTo(x + u * 3, y); c.lineTo(x + u * 4, y); } };
    const tile = mkTile(B, (c) => {
      c.fillStyle = p.ground[0]; c.fillRect(0, 0, TW, TW);
      mottle(c, B.com.cloudA, p.ground[2], 0.55, 1); mottle(c, B.com.cloudB, p.ground[1], 0.16, 2);
      const rows = [[0, 2.6], [2.6, 0.8], [3.4, 2.4], [5.8, 2.2]];
      rows.forEach(([y, hh], r) => {
        if (r === 1) { c.fillStyle = rgba(p.ground[2], 0.45); c.fillRect(0, y, TW, hh); c.strokeStyle = rgba('#000000', 0.5); c.lineWidth = 0.07; meander(c, y + 0.14, hh - 0.28); c.stroke(); c.save(); c.translate(0.03, 0.03); c.strokeStyle = rgba(p.ground[1], 0.35); c.lineWidth = 0.03; meander(c, y + 0.14, hh - 0.28); c.stroke(); c.restore(); return; }
        let x = H(r, 3) * 2; const xs = [];
        while (x < TW + H(r, 3) * 2 - 0.5) { const w = 1.6 + H(xs.length + r * 9, 4) * 2; xs.push([x, Math.min(w, TW + H(r, 3) * 2 - x)]); x += w; }
        wrap(c, () => xs.forEach(([bx, w], i) => {
          c.fillStyle = rgba(H(i + r * 5, 5) > 0.5 ? p.ground[1] : p.ground[2], 0.08 + H(i, 6) * 0.1); c.fillRect(bx + 0.04, y + 0.04, w - 0.08, hh - 0.08);
          bevel(c, bx + 0.04, y + 0.04, w - 0.08, hh - 0.08, rgba(p.ground[1], 0.42), rgba('#000000', 0.4), 0.06);
          for (let k = 0; k < 5; k++) { const sx = bx + 0.2 + H(i * 7 + k + r * 31, 7) * (w - 0.4), len = 0.3 + H(i * 7 + k, 8) * (hh - 0.5); const g = c.createLinearGradient(0, y + hh, 0, y + hh - len); g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(sx, y + hh - len, 0.05 + H(k + i, 9) * 0.08, len); }
        }));
      });
      wrap(c, () => { for (let i = 0; i < 70; i++) { const x = H(i, 41) * TW, y = H(i, 42) * TW, r = 0.02 + H(i, 43) ** 2 * 0.07; c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); } });
    });
    const emis = mkTile(B, (c) => {
      glowStroke(c, (cc) => { cc.beginPath(); cc.moveTo(0, 2.63); cc.lineTo(TW, 2.63); cc.moveTo(0, 3.37); cc.lineTo(TW, 3.37); }, p.glow, 0.02, '#fff6d8');
      wrap(c, () => { for (let i = 0; i < 4; i++) { const x = 1 + i * 2 + H(i, 3) * 0.6, y = i % 2 ? 6.9 : 1.3; glowStroke(c, (cc) => { cc.beginPath(); cc.ellipse(x, y, 0.3, 0.14, 0, 0, TAU); cc.moveTo(x + 0.07, y); cc.arc(x, y, 0.07, 0, TAU); cc.moveTo(x, y - 0.14); cc.lineTo(x, y - 0.4); }, p.glow, 0.022, '#fff6d8'); } });
    }, 0.5);
    const decor = [
      spr(B, 1.4, 1.0, 0, (c, w, h) => {             // 目の浮き彫り
        c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(0.04, 0.04, w - 0.08, h - 0.08);
        c.fillStyle = mix(p.ground[0], p.ground[1], 0.22); c.fillRect(0.1, 0.1, w - 0.2, h - 0.2); bevel(c, 0.1, 0.1, w - 0.2, h - 0.2, rgba(p.edge, 0.5), 'rgba(0,0,0,0.45)', 0.05);
        c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 0.05; c.beginPath(); c.moveTo(0.3, h / 2); c.quadraticCurveTo(w / 2, h * 0.86, w - 0.3, h / 2); c.quadraticCurveTo(w / 2, h * 0.14, 0.3, h / 2); c.stroke();
        c.fillStyle = rgba(p.glow, 0.85); c.beginPath(); c.arc(w / 2, h / 2, 0.1, 0, TAU); c.fill(); c.fillStyle = '#1a1420'; c.beginPath(); c.arc(w / 2, h / 2, 0.045, 0, TAU); c.fill();
      }, { maxSlope: 0.2 }),
      spr(B, 1.5, 0.6, 0.13, (c, w, h, s) => {       // 段の石
        [[0.1, 0.5, 0.26], [0.55, 0.45, 0.4], [0.95, 0.45, 0.2]].forEach(([x, ww, hh], k) => { const y0 = s - 0.28; c.fillStyle = mix(p.ground[0], p.ground[1], 0.15 + k * 0.12); c.fillRect(x, y0, ww, hh); bevel(c, x, y0, ww, hh, rgba(p.edge, 0.6), 'rgba(0,0,0,0.5)', 0.035); });
      }, { maxSlope: 0.25 }),
      spr(B, 0.7, 1.1, 0.18, (c, w, h, s) => {       // 小さな方尖の根
        poly(c, [0.12, 0.05, w - 0.12, 0.05, w - 0.22, h - 0.1, w / 2, h - 0.01, 0.22, h - 0.1]); c.fillStyle = mix(p.ground[0], p.ground[2], 0.3); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 0.05; c.stroke();
        c.strokeStyle = rgba(p.edge, 0.6); c.lineWidth = 0.03; c.beginPath(); c.moveTo(0.16, 0.1); c.lineTo(0.25, h - 0.12); c.lineTo(w / 2, h - 0.03); c.stroke();
        c.strokeStyle = rgba(p.glow, 0.7); c.lineWidth = 0.025; c.beginPath(); c.moveTo(w / 2, 0.25); c.lineTo(w / 2, h - 0.3); c.moveTo(w / 2 - 0.1, 0.5); c.lineTo(w / 2 + 0.1, 0.5); c.stroke();
      }, { maxSlope: 0.3 }),
    ];
    return {
      tile, emis, decor,
      spots: { spr: glowSprite(B.S * 0.9, p.glow, 0.3, 2.2), step: 2.6, p: 0.35, d0: 0.5, d1: 1.4, s0: 0.3, s1: 0.7, a0: 0.15, speed: 0.7 },
      cfg: { emis: [0.3, 0.6, 0.6], aoCol: '#06040c', ao: [[0.9, 0.16], [1.9, 0.22], [3.2, 0.3]], top: [0.18, rgba(p.edge, 0.5), 0.24, rgba(p.ground[1], 0.2)], under: [0.18, rgba(p.glow, 0.16), 0.3, 'rgba(0,0,0,0.3)'],
        decorStep: 2.3, decorP: 0.5, outline: '#0c0a14', rimW: 0.07, rimF: '#f4eeff', rimC: mix(p.edge, p.glow, 0.4), line2: [0.46, 'rgba(0,0,0,0.38)', 0.05] },
    };
  },
  // 4: 鉄板（リベット・警告の縞・格子・錆）＋表示灯
  4(B) {
    const p = B.pal, PW = 2, PH = 1.6;
    const tile = mkTile(B, (c) => {
      c.fillStyle = p.ground[0]; c.fillRect(0, 0, TW, TW);
      mottle(c, B.com.cloudA, p.ground[2], 0.5, 2); mottle(c, B.com.cloudB, p.ground[1], 0.1, 2);
      for (let r = 0; r < 5; r++) for (let q = 0; q < 4; q++) {
        const x = q * PW + (r % 2) * 1, y = r * PH, i = r * 4 + q, kind = H(i, 3);
        wrap(c, () => {
          c.fillStyle = rgba(kind > 0.5 ? p.ground[1] : '#000000', 0.05 + H(i, 4) * 0.1); c.fillRect(x + 0.03, y + 0.03, PW - 0.06, PH - 0.06);
          bevel(c, x + 0.03, y + 0.03, PW - 0.06, PH - 0.06, rgba(p.ground[1], 0.5), 'rgba(0,0,0,0.5)', 0.045);
          for (const [rx, ry] of [[0.16, 0.16], [PW - 0.16, 0.16], [0.16, PH - 0.16], [PW - 0.16, PH - 0.16], [PW / 2, 0.16], [PW / 2, PH - 0.16]]) { c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.arc(x + rx + 0.012, y + ry - 0.012, 0.05, 0, TAU); c.fill(); c.fillStyle = rgba(p.ground[1], 0.85); c.beginPath(); c.arc(x + rx, y + ry, 0.04, 0, TAU); c.fill(); }
          if (kind > 0.74) { for (let k = 0; k < 5; k++) { c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x + 0.4, y + 0.36 + k * 0.19, PW - 0.8, 0.09); c.fillStyle = rgba(p.ground[1], 0.35); c.fillRect(x + 0.4, y + 0.34 + k * 0.19, PW - 0.8, 0.025); } }
          else if (kind < 0.2) { c.save(); c.beginPath(); c.rect(x + 0.32, y + 0.55, PW - 0.64, 0.34); c.clip(); c.fillStyle = '#16120c'; c.fillRect(x, y, PW, PH); c.fillStyle = rgba('#d8a030', 0.75); for (let k = -2; k < 9; k++) poly(c, [x + k * 0.36, y + 0.5, x + k * 0.36 + 0.18, y + 0.5, x + k * 0.36 + 0.5, y + 0.95, x + k * 0.36 + 0.32, y + 0.95]), c.fill(); c.restore(); }
          else if (kind > 0.5 && kind < 0.6) { c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 0.05; c.beginPath(); c.arc(x + PW / 2, y + PH / 2, 0.38, 0, TAU); c.stroke(); c.strokeStyle = rgba(p.ground[1], 0.5); c.lineWidth = 0.025; c.beginPath(); c.arc(x + PW / 2, y + PH / 2, 0.33, 0, TAU); c.moveTo(x + PW / 2 - 0.33, y + PH / 2); c.lineTo(x + PW / 2 + 0.33, y + PH / 2); c.stroke(); }
        });
      }
      wrap(c, () => { for (let i = 0; i < 26; i++) { const x = H(i, 21) * TW, y = H(i, 22) * TW, len = 0.4 + H(i, 23) * 1.3; const g = c.createLinearGradient(0, y, 0, y - len); g.addColorStop(0, rgba('#a04a1a', 0.34)); g.addColorStop(1, rgba('#a04a1a', 0)); c.fillStyle = g; c.fillRect(x, y - len, 0.06 + H(i, 24) * 0.14, len); } });
    });
    const emis = mkTile(B, (c) => wrap(c, () => {
      for (let i = 0; i < 9; i++) { const x = ((i * 3 + 1) % 8) + 0.9, y = ((i * 5 + 2) % 5) * PH + 1.25; glowStroke(c, (cc) => { cc.beginPath(); cc.moveTo(x, y); cc.lineTo(x + (i % 3 ? 0.14 : 0.5), y); }, p.glow, 0.035, '#fff0c0'); }
    }), 0.5);
    const decor = [
      spr(B, 2.0, 0.62, 0.1, (c, w, h, s) => {       // 表面を這う配管
        const y = s - 0.22, r = 0.17;
        const g = c.createLinearGradient(0, y + r, 0, y - r); g.addColorStop(0, mix(p.ground[1], '#ffffff', 0.15)); g.addColorStop(0.35, p.ground[1]); g.addColorStop(1, p.ground[2]);
        c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0.05, y - r - 0.05, w - 0.1, r * 2 + 0.06);
        c.fillStyle = g; c.fillRect(0.08, y - r, w - 0.16, r * 2);
        for (const fx of [0.08, w / 2 - 0.08, w - 0.24]) { c.fillStyle = mix(p.ground[0], p.ground[1], 0.5); c.fillRect(fx, y - r - 0.05, 0.16, r * 2 + 0.1); bevel(c, fx, y - r - 0.05, 0.16, r * 2 + 0.1, rgba(p.edge, 0.6), 'rgba(0,0,0,0.5)', 0.03); }
      }, { maxSlope: 0.15 }),
      spr(B, 1.15, 0.95, 0, (c, w, h) => {           // ボルト留めの点検口
        c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0.04, 0.04, w - 0.08, h - 0.08);
        c.fillStyle = mix(p.ground[0], p.ground[1], 0.25); c.fillRect(0.1, 0.1, w - 0.2, h - 0.2); bevel(c, 0.1, 0.1, w - 0.2, h - 0.2, rgba(p.edge, 0.55), 'rgba(0,0,0,0.5)', 0.045);
        for (const [x, y] of [[0.2, 0.2], [w - 0.2, 0.2], [0.2, h - 0.2], [w - 0.2, h - 0.2]]) { c.fillStyle = p.ground[2]; c.beginPath(); c.arc(x, y, 0.055, 0, TAU); c.fill(); c.fillStyle = rgba(p.edge, 0.7); c.beginPath(); c.arc(x - 0.012, y + 0.012, 0.03, 0, TAU); c.fill(); }
        c.fillStyle = '#120c06'; c.fillRect(0.34, h / 2 - 0.08, w - 0.68, 0.16); c.fillStyle = rgba(p.glow, 0.95); c.fillRect(0.38, h / 2 - 0.04, 0.2, 0.08);
      }, { maxSlope: 0.15 }),
      spr(B, 1.3, 0.7, 0.08, (c, w, h, s) => {       // 排気の格子
        c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0.06, 0.08, w - 0.12, s - 0.1);
        for (let k = 0; k < 4; k++) { c.fillStyle = mix(p.ground[0], p.ground[1], 0.45); c.fillRect(0.12, 0.14 + k * 0.125, w - 0.24, 0.07); c.fillStyle = rgba(p.edge, 0.45); c.fillRect(0.12, 0.19 + k * 0.125, w - 0.24, 0.02); }
        c.fillStyle = mix(p.ground[0], p.ground[1], 0.5); c.fillRect(0.02, s - 0.06, w - 0.04, 0.13); bevel(c, 0.02, s - 0.06, w - 0.04, 0.13, rgba(p.edge, 0.7), 'rgba(0,0,0,0.5)', 0.03);
      }, { maxSlope: 0.15 }),
    ];
    return {
      tile, emis, decor,
      spots: { spr: glowSprite(B.S * 0.9, '#ff5a1a', 0.35, 2), step: 3.0, p: 0.55, d0: 0.4, d1: 0.9, s0: 0.5, s1: 0.8, a0: 0, blink: 2.4 },
      cfg: { emis: [0.35, 0.65, 2.2], aoCol: '#040607', ao: [[0.8, 0.16], [1.7, 0.22], [2.9, 0.3]], top: [0.16, rgba(p.edge, 0.5), 0.2, rgba(p.ground[1], 0.2)], under: [0.16, rgba(p.glow, 0.2), 0.26, 'rgba(0,0,0,0.3)'],
        decorStep: 2.4, decorP: 0.55, outline: '#0a0806', rimW: 0.07, rimF: '#fff0c8', rimC: mix(p.edge, p.glow, 0.5), line2: [0.4, 'rgba(0,0,0,0.42)', 0.06] },
    };
  },
  // 5: 肉の壁（皺・濡れた艶・血管）＋発光斑
  5(B) {
    const p = B.pal;
    const tile = mkTile(B, (c) => {
      c.fillStyle = p.ground[0]; c.fillRect(0, 0, TW, TW);
      mottle(c, B.com.cloudA, p.ground[2], 0.8, 1); mottle(c, B.com.cloudB, p.ground[1], 0.22, 2); mottle(c, B.com.cloudC, '#3a1438', 0.4, 1);
      wrap(c, () => {
        for (let i = 0; i < 46; i++) {       // 皺（暗い溝と隣の明るい盛り上がり）
          const x = H(i, 3) * TW, y = H(i, 4) * TW, len = 0.8 + H(i, 5) * 1.8, a = (H(i, 6) - 0.5) * 0.9, bend = (H(i, 7) - 0.5) * 0.9;
          const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len, mx = (x + x1) / 2 - Math.sin(a) * bend, my = (y + y1) / 2 + Math.cos(a) * bend;
          c.strokeStyle = rgba(p.ground[2], 0.7); c.lineWidth = 0.07 + H(i, 8) * 0.07; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(mx, my, x1, y1); c.stroke();
          c.strokeStyle = rgba(p.ground[1], 0.36); c.lineWidth = 0.05; c.beginPath(); c.moveTo(x, y + 0.1); c.quadraticCurveTo(mx, my + 0.11, x1, y1 + 0.1); c.stroke();
        }
        for (let i = 0; i < 40; i++) {       // こぶと濡れた艶
          const x = H(i, 11) * TW, y = H(i, 12) * TW, r = 0.18 + H(i, 13) * 0.42;
          const g = c.createRadialGradient(x - r * 0.25, y + r * 0.3, 0, x, y, r); g.addColorStop(0, rgba(p.ground[1], 0.42)); g.addColorStop(0.7, rgba(p.ground[1], 0.06)); g.addColorStop(1, rgba(p.ground[2], 0.4));
          c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
          c.fillStyle = rgba('#ffe8d8', 0.38); c.beginPath(); c.ellipse(x - r * 0.3, y + r * 0.38, r * 0.2, r * 0.09, -0.5, 0, TAU); c.fill();
        }
        for (let i = 0; i < 9; i++) {        // 青黒い血管
          let x = H(i, 21) * TW, y = H(i, 22) * TW, d = H(i, 23) * TAU; c.strokeStyle = rgba('#2c1640', 0.75); c.lineWidth = 0.05 + H(i, 24) * 0.05; c.beginPath(); c.moveTo(x, y);
          for (let k = 0; k < 8; k++) { d += (H(i * 9 + k, 25) - 0.5) * 1.3; x += Math.cos(d) * 0.4; y += Math.sin(d) * 0.4; c.lineTo(x, y); } c.stroke();
        }
      });
    });
    const emis = mkTile(B, (c) => wrap(c, () => {
      for (let i = 0; i < 6; i++) {
        let x = H(i, 31) * TW, y = H(i, 32) * TW, d = H(i, 33) * TAU; const pts = [];
        for (let k = 0; k < 8; k++) { pts.push(x, y); d += (H(i * 9 + k, 34) - 0.5) * 1.4; x += Math.cos(d) * 0.4; y += Math.sin(d) * 0.4; }
        glowStroke(c, (cc) => { cc.beginPath(); cc.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) cc.lineTo(pts[k], pts[k + 1]); }, p.glow, 0.022, '#fff0c8');
        const g = c.createRadialGradient(pts[0], pts[1], 0, pts[0], pts[1], 0.3); g.addColorStop(0, rgba('#fff0c8', 0.9)); g.addColorStop(0.3, rgba(p.glow, 0.7)); g.addColorStop(1, rgba(p.glow, 0)); c.fillStyle = g; c.fillRect(pts[0] - 0.3, pts[1] - 0.3, 0.6, 0.6);
      }
    }), 0.5);
    const decor = [
      spr(B, 1.4, 0.7, 0.14, (c, w, h, s) => {       // ポリープのこぶ
        for (let k = 0; k < 6; k++) { const x = 0.2 + k * 0.2, r = 0.13 + H(k, 41) * 0.1, y = s - r * 0.55 + H(k, 42) * 0.04;
          const g = c.createRadialGradient(x - r * 0.3, y + r * 0.35, 0, x, y, r); g.addColorStop(0, mix(p.ground[1], '#ffe0d0', 0.3)); g.addColorStop(0.6, p.ground[0]); g.addColorStop(1, p.ground[2]);
          c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.strokeStyle = 'rgba(20,4,10,0.6)'; c.lineWidth = 0.03; c.stroke(); }
      }, { maxSlope: 0.4 }),
      spr(B, 1.2, 0.75, 0.18, (c, w, h, s) => {      // 骨の棘
        for (let k = 0; k < 5; k++) { const x = 0.16 + k * 0.22, hh = 0.3 + H(k, 43) * 0.3, lean = (k - 2) * 0.05;
          poly(c, [x - 0.08, s - 0.4, x + 0.08, s - 0.4, x + lean, Math.min(h - 0.01, s - 0.4 + hh + 0.25)]); c.fillStyle = k % 2 ? '#d8c8b0' : '#b8a48c'; c.fill(); c.strokeStyle = 'rgba(30,8,12,0.6)'; c.lineWidth = 0.025; c.stroke(); }
        c.fillStyle = p.ground[0]; c.beginPath(); c.ellipse(w / 2, s - 0.4, w * 0.46, 0.12, 0, 0, TAU); c.fill();
      }, { maxSlope: 0.35 }),
      spr(B, 0.9, 0.7, 0, (c, w, h) => {             // 吸盤のような孔
        c.fillStyle = p.ground[2]; c.beginPath(); c.ellipse(w / 2, h / 2, 0.36, 0.26, 0, 0, TAU); c.fill();
        c.strokeStyle = rgba(p.ground[1], 0.75); c.lineWidth = 0.06; c.stroke();
        c.fillStyle = '#12040a'; c.beginPath(); c.ellipse(w / 2, h / 2 - 0.02, 0.2, 0.13, 0, 0, TAU); c.fill();
        c.fillStyle = rgba(p.glow, 0.8); c.beginPath(); c.ellipse(w / 2, h / 2 - 0.03, 0.09, 0.05, 0, 0, TAU); c.fill();
      }, { maxSlope: 0.4 }),
    ];
    return {
      tile, emis, decor,
      spots: { spr: glowSprite(B.S * 1.2, p.glow, 0.3, 1.8), step: 1.5, p: 0.55, d0: 0.45, d1: 1.5, s0: 0.5, s1: 1.2, a0: 0.12, sync: true },
      cfg: { emis: [0.25, 0.75, 3.0], aoCol: '#0c0206', ao: [[0.9, 0.18], [1.9, 0.24], [3.2, 0.3]], top: [0.2, rgba(p.edge, 0.4), 0.3, rgba(p.ground[1], 0.24)], under: [0.2, rgba(p.edge, 0.3), 0.3, rgba(p.ground[1], 0.16)],
        decorStep: 1.5, decorP: 0.6, outline: '#16040a', rimW: 0.08, rimF: p.edge, rimC: mix(p.edge, p.ground[1], 0.3), line2: [0.55, 'rgba(20,2,8,0.45)', 0.07] },
    };
  },
  // 6: 細胞膜（詰まった細胞・核・小器官）＋核の発光
  6(B) {
    const p = B.pal, cells = [];
    for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) cells.push([(i + 0.5 + (H(j * 7 + i, 3) - 0.5) * 0.7 + (j % 2) * 0.5) * TW / 7, (j + 0.5 + (H(j * 7 + i, 4) - 0.5) * 0.7) * TW / 7, 0.42 + H(j * 7 + i, 5) * 0.34]);
    const tile = mkTile(B, (c) => {
      c.fillStyle = mix(p.ground[0], p.ground[2], 0.5); c.fillRect(0, 0, TW, TW);
      mottle(c, B.com.cloudA, p.ground[2], 0.6, 1);
      wrap(c, () => cells.forEach(([x, y, r], i) => {
        const g = c.createRadialGradient(x - r * 0.2, y + r * 0.25, 0, x, y, r); g.addColorStop(0, mix(p.ground[0], p.ground[1], 0.5)); g.addColorStop(0.75, p.ground[0]); g.addColorStop(1, mix(p.ground[0], p.ground[2], 0.4));
        c.fillStyle = g; c.beginPath(); c.ellipse(x, y, r, r * (0.82 + H(i, 6) * 0.18), H(i, 7) * 3, 0, TAU); c.fill();
        c.strokeStyle = rgba(p.ground[2], 0.8); c.lineWidth = 0.07; c.stroke(); c.strokeStyle = rgba(p.ground[1], 0.6); c.lineWidth = 0.025; c.stroke();
        const nx = x + (H(i, 8) - 0.5) * r * 0.5, ny = y + (H(i, 9) - 0.5) * r * 0.5;
        c.fillStyle = rgba(p.ground[2], 0.75); c.beginPath(); c.arc(nx, ny, r * 0.3, 0, TAU); c.fill();
        c.fillStyle = rgba(p.ground[1], 0.5); c.beginPath(); c.arc(nx - r * 0.06, ny + r * 0.07, r * 0.12, 0, TAU); c.fill();
        for (let k = 0; k < 4; k++) { const a = H(i * 5 + k, 10) * TAU, d = r * (0.5 + H(i * 5 + k, 11) * 0.3); c.fillStyle = rgba(p.edge, 0.3); c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.03, 0, TAU); c.fill(); }
        c.strokeStyle = rgba('#ffffff', 0.22); c.lineWidth = 0.03; c.beginPath(); c.arc(x, y, r * 0.8, 1.9, 2.9); c.stroke();
      }));
    });
    const emis = mkTile(B, (c) => wrap(c, () => cells.forEach(([x, y, r], i) => {
      if (H(i, 13) < 0.6) return;
      const g = c.createRadialGradient(x, y, 0, x, y, r * 0.7); g.addColorStop(0, rgba(p.glow, 0.75)); g.addColorStop(0.4, rgba(p.glow, 0.25)); g.addColorStop(1, rgba(p.glow, 0)); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    })), 0.5);
    const decor = [
      spr(B, 1.2, 0.8, 0.2, (c, w, h, s) => {        // 繊毛
        for (let k = 0; k < 15; k++) { const x = 0.12 + k * 0.07, len = 0.22 + H(k, 21) * 0.2; c.strokeStyle = rgba(k % 2 ? p.edge : p.ground[1], 0.7); c.lineWidth = 0.022; c.beginPath(); c.moveTo(x, s - 0.25); c.quadraticCurveTo(x + 0.06, s, x + (H(k, 22) - 0.3) * 0.2, Math.min(h - 0.01, s - 0.22 + len + 0.2)); c.stroke(); }
        c.fillStyle = p.ground[0]; c.beginPath(); c.ellipse(w / 2, s - 0.26, w * 0.46, 0.1, 0, 0, TAU); c.fill();
      }),
      spr(B, 1.3, 0.7, 0.1, (c, w, h, s) => {        // 小胞の房
        for (let k = 0; k < 8; k++) { const x = 0.16 + (k % 4) * 0.3 + H(k, 23) * 0.08, y = s - 0.14 - ((k / 4) | 0) * 0.22, r = 0.1 + H(k, 24) * 0.07;
          const g = c.createRadialGradient(x - r * 0.3, y + r * 0.3, 0, x, y, r); g.addColorStop(0, rgba(p.edge, 0.85)); g.addColorStop(0.5, rgba(p.ground[1], 0.6)); g.addColorStop(1, rgba(p.ground[0], 0.9)); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.strokeStyle = rgba(p.ground[2], 0.7); c.lineWidth = 0.02; c.stroke(); }
      }),
      spr(B, 0.9, 0.7, 0, (c, w, h) => {             // 膜の孔
        c.strokeStyle = rgba(p.ground[2], 0.9); c.lineWidth = 0.09; c.beginPath(); c.ellipse(w / 2, h / 2, 0.3, 0.2, 0, 0, TAU); c.stroke();
        c.strokeStyle = rgba(p.edge, 0.7); c.lineWidth = 0.03; c.stroke(); c.fillStyle = rgba(p.ground[2], 0.8); c.fill(); c.fillStyle = rgba(p.glow, 0.6); c.beginPath(); c.arc(w / 2, h / 2, 0.07, 0, TAU); c.fill();
      }),
    ];
    return {
      tile, emis, decor,
      spots: { spr: glowSprite(B.S * 1.2, p.glow, 0.25, 1.8), step: 1.6, p: 0.5, d0: 0.5, d1: 1.6, s0: 0.5, s1: 1.3, a0: 0.1, sync: true },
      cfg: { emis: [0.2, 0.6, 1.4], aoCol: '#02100c', ao: [[0.9, 0.18], [1.9, 0.24], [3.2, 0.32]], top: [0.22, rgba(p.edge, 0.34), 0.3, rgba(p.ground[1], 0.26)], under: [0.22, rgba(p.edge, 0.3), 0.3, rgba(p.ground[1], 0.2)],
        decorStep: 1.6, decorP: 0.55, outline: '#041a12', rimW: 0.08, rimF: p.edge, rimC: mix(p.edge, p.ground[1], 0.3), line2: [0.6, rgba(p.edge, 0.3), 0.05] },
    };
  },
  // 7: 装甲板（大小のパネル・継ぎ目・通気口・配線の溝）＋走る表示灯
  7(B) {
    const p = B.pal, panels = [];
    const used = new Uint8Array(16);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      if (used[j * 4 + i]) continue;
      let w = 1, h = 1; const r = H(j * 4 + i, 3);
      if (r > 0.6 && i < 3 && !used[j * 4 + i + 1]) w = 2; else if (r < 0.25 && j < 3) h = 2;
      for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) used[(j + b) * 4 + i + a] = 1;
      panels.push([i * 2, j * 2, w * 2, h * 2]);
    }
    const tile = mkTile(B, (c) => {
      c.fillStyle = p.ground[0]; c.fillRect(0, 0, TW, TW);
      mottle(c, B.com.cloudA, p.ground[2], 0.45, 2); mottle(c, B.com.cloudB, p.ground[1], 0.1, 1);
      panels.forEach(([x, y, w, h], i) => {
        c.fillStyle = rgba(H(i, 5) > 0.5 ? p.ground[1] : '#000000', 0.04 + H(i, 6) * 0.1); c.fillRect(x + 0.04, y + 0.04, w - 0.08, h - 0.08);
        c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x, y, w, 0.04); c.fillRect(x, y, 0.04, h);
        bevel(c, x + 0.04, y + 0.04, w - 0.08, h - 0.08, rgba(p.ground[1], 0.55), 'rgba(0,0,0,0.5)', 0.05);
        c.strokeStyle = rgba(p.ground[2], 0.6); c.lineWidth = 0.03; c.strokeRect(x + 0.28, y + 0.28, w - 0.56, h - 0.56);
        c.strokeStyle = rgba(p.ground[1], 0.2); c.lineWidth = 0.02; c.strokeRect(x + 0.31, y + 0.25, w - 0.56, h - 0.56);
        for (const [bx, by] of [[0.15, 0.15], [w - 0.15, 0.15], [0.15, h - 0.15], [w - 0.15, h - 0.15]]) { c.fillStyle = 'rgba(0,0,0,0.6)'; c.beginPath(); c.arc(x + bx, y + by, 0.045, 0, TAU); c.fill(); c.fillStyle = rgba(p.ground[1], 0.7); c.beginPath(); c.arc(x + bx - 0.01, y + by + 0.01, 0.025, 0, TAU); c.fill(); }
        const k = H(i, 7);
        if (k > 0.66) for (let s = 0; s < 4; s++) { c.fillStyle = 'rgba(0,0,0,0.65)'; c.fillRect(x + 0.5, y + 0.52 + s * 0.2, w - 1.0, 0.1); c.fillStyle = rgba(p.ground[1], 0.3); c.fillRect(x + 0.5, y + 0.5 + s * 0.2, w - 1.0, 0.02); }
        else if (k < 0.3) { c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x + 0.45, y + h / 2 - 0.12, w - 0.9, 0.24); c.strokeStyle = rgba(p.ground[1], 0.5); c.lineWidth = 0.035; for (let s = 0; s < 3; s++) { c.beginPath(); c.moveTo(x + 0.45, y + h / 2 - 0.07 + s * 0.07); c.bezierCurveTo(x + w * 0.4, y + h / 2 + 0.05 - s * 0.03, x + w * 0.6, y + h / 2 - 0.1 + s * 0.06, x + w - 0.45, y + h / 2 - 0.07 + s * 0.07); c.stroke(); } }
      });
    });
    const emis = mkTile(B, (c) => panels.forEach(([x, y, w, h], i) => {
      const k = H(i, 9);
      if (k > 0.55) glowStroke(c, (cc) => { cc.beginPath(); cc.moveTo(x + 0.5, y + 0.4); cc.lineTo(x + w - 0.5, y + 0.4); }, p.glow, 0.022, '#e8f8ff');
      else if (k < 0.3) for (let s = 0; s < 3; s++) glowStroke(c, (cc) => { cc.beginPath(); cc.moveTo(x + 0.45 + s * 0.16, y + h - 0.45); cc.lineTo(x + 0.5 + s * 0.16, y + h - 0.45); }, s === 1 ? '#ffb040' : p.glow, 0.03, '#ffffff');
    }), 0.5);
    const decor = [
      spr(B, 1.2, 0.95, 0, (c, w, h) => {            // 灯の付いた点検口
        c.fillStyle = 'rgba(0,0,0,0.55)'; rrect(c, 0.05, 0.05, w - 0.1, h - 0.1, 0.12); c.fill();
        c.fillStyle = mix(p.ground[0], p.ground[1], 0.28); rrect(c, 0.1, 0.1, w - 0.2, h - 0.2, 0.1); c.fill(); c.strokeStyle = rgba(p.edge, 0.5); c.lineWidth = 0.03; c.stroke();
        c.fillStyle = '#080c14'; c.fillRect(0.3, h / 2 - 0.1, w - 0.6, 0.2); c.fillStyle = rgba(p.glow, 0.95); c.fillRect(0.34, h / 2 - 0.05, w - 0.68, 0.1); c.fillStyle = '#e8f8ff'; c.fillRect(0.4, h / 2 - 0.015, w - 0.8, 0.03);
      }, { maxSlope: 0.1 }),
      spr(B, 0.9, 0.85, 0.18, (c, w, h, s) => {      // 感知器
        c.fillStyle = mix(p.ground[0], p.ground[1], 0.4); poly(c, [0.15, s - 0.35, w - 0.15, s - 0.35, w - 0.25, s + 0.05, 0.25, s + 0.05]); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 0.04; c.stroke();
        c.strokeStyle = rgba(p.edge, 0.7); c.lineWidth = 0.03; c.beginPath(); c.moveTo(0.27, s + 0.04); c.lineTo(w - 0.27, s + 0.04); c.stroke();
        c.strokeStyle = p.ground[1]; c.lineWidth = 0.03; c.beginPath(); c.moveTo(w / 2, s + 0.05); c.lineTo(w / 2, h - 0.04); c.stroke();
        c.fillStyle = rgba(p.glow, 1); c.beginPath(); c.arc(w / 2, h - 0.05, 0.04, 0, TAU); c.fill(); c.fillStyle = '#080c14'; c.fillRect(0.3, s - 0.24, w - 0.6, 0.1); c.fillStyle = rgba(p.glow, 0.8); c.fillRect(0.33, s - 0.22, 0.12, 0.06);
      }, { maxSlope: 0.1 }),
      spr(B, 1.6, 0.6, 0.06, (c, w, h, s) => {       // 配線の留め具
        for (let k = 0; k < 3; k++) { c.strokeStyle = k === 1 ? rgba(p.glow, 0.55) : rgba(p.ground[1], 0.75); c.lineWidth = 0.05; c.beginPath(); c.moveTo(0.05, s - 0.2 - k * 0.08); c.bezierCurveTo(w * 0.35, s - 0.3 - k * 0.08, w * 0.65, s - 0.12 - k * 0.08, w - 0.05, s - 0.2 - k * 0.08); c.stroke(); }
        for (const x of [0.25, w - 0.4]) { c.fillStyle = mix(p.ground[0], p.ground[1], 0.5); c.fillRect(x, s - 0.44, 0.15, 0.5); bevel(c, x, s - 0.44, 0.15, 0.5, rgba(p.edge, 0.6), 'rgba(0,0,0,0.5)', 0.03); }
      }, { maxSlope: 0.1 }),
    ];
    return {
      tile, emis, decor,
      spots: { spr: glowSprite(B.S * 0.8, p.glow, 0.4, 2), step: 1.2, p: 0.92, d0: 0.34, d1: 0.34, s0: 0.42, s1: 0.42, a0: 0.06, chase: 3.2 },
      cfg: { emis: [0.4, 0.6, 1.8], aoCol: '#02040a', ao: [[0.8, 0.14], [1.7, 0.2], [2.9, 0.3]], top: [0.14, rgba(p.edge, 0.55), 0.2, rgba(p.ground[1], 0.22)], under: [0.14, rgba(p.glow, 0.3), 0.24, 'rgba(0,0,0,0.3)'],
        decorStep: 2.6, decorP: 0.5, outline: '#04060c', rimW: 0.07, rimF: '#f0f8ff', rimC: mix(p.edge, p.glow, 0.5), line2: [0.62, 'rgba(0,0,0,0.45)', 0.06] },
    };
  },
};

export function buildMaterial(B) {
  const M = (MATS[B.id] || MATS[1])(B);
  M.TW = TW;
  M.glow = glowSprite(B.S * 1.6, B.pal.glow, 0.3, 2);
  return M;
}

// ---- 壊れない箱（柱・金属塊・細胞塊）。形は矩形の当たり判定そのまま ---------------------------
export function drawBlock(R, ctx, b, pal, M, now, cam) {
  const x = b.x0, y = b.y0, w = b.x1 - b.x0, h = b.y1 - b.y0;
  if (b.kind === 'pillar') {
    const hang = b.y1 >= VIEW_H - 0.01, stand = b.y0 <= 0.01;
    ctx.fillStyle = M.pat; ctx.fillRect(x, y, w, h);
    // 胴の溝（明暗の縦縞）と継ぎ目
    const sx = x + 0.14, sw = w - 0.28;
    for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? 'rgba(0,0,0,0.2)' : rgba(pal.ground[1], 0.16); ctx.fillRect(sx + k * sw / 6, y, sw / 6, h); }
    ctx.fillStyle = rgba(pal.edge, 0.2); ctx.fillRect(sx, y, sw * 0.12, h);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(sx + sw * 0.72, y, sw * 0.28, h); ctx.fillRect(x, y, 0.14, h); ctx.fillRect(x + w - 0.14, y, 0.14, h);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let yy = Math.ceil(y / 1.7) * 1.7; yy < y + h; yy += 1.7) ctx.fillRect(sx, yy, sw, 0.05);
    // 柱頭（空いている側）と台座
    const cap = (cy, dir) => {
      ctx.fillStyle = mix(pal.ground[0], pal.ground[1], 0.55); ctx.fillRect(x, dir > 0 ? cy - 0.3 : cy, w, 0.3);
      ctx.fillStyle = mix(pal.ground[0], pal.ground[1], 0.3); ctx.fillRect(x + 0.08, dir > 0 ? cy - 0.52 : cy + 0.3, w - 0.16, 0.22);
      ctx.fillStyle = mix(pal.ground[0], pal.ground[2], 0.3); ctx.fillRect(x + 0.04, dir > 0 ? cy - 0.66 : cy + 0.52, w - 0.08, 0.14);
      ctx.fillStyle = rgba(pal.edge, 0.9); ctx.fillRect(x, dir > 0 ? cy - 0.07 : cy, w, 0.07);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x, dir > 0 ? cy - 0.33 : cy + 0.3, w, 0.035); ctx.fillRect(x + 0.04, dir > 0 ? cy - 0.55 : cy + 0.52, w - 0.08, 0.03);
      // 光る紋様の帯
      ctx.fillStyle = rgba(pal.glow, 0.45 + 0.4 * Math.sin(now * 1.6 + b.x0));
      for (let k = 0; k < 5; k++) ctx.fillRect(x + 0.3 + k * (w - 0.6) / 4.6, dir > 0 ? cy - 0.92 : cy + 0.82, 0.13, 0.1);
    };
    if (!hang) cap(b.y1, 1);
    if (!stand) cap(b.y0, -1);
    ctx.strokeStyle = '#0c0e12'; ctx.lineWidth = 0.07; ctx.strokeRect(x + 0.035, y + 0.035, w - 0.07, h - 0.07);
    ctx.strokeStyle = rgba(pal.edge, 0.5); ctx.lineWidth = 0.035; ctx.beginPath(); ctx.moveTo(x + 0.09, y + 0.05); ctx.lineTo(x + 0.09, y + h - 0.05); ctx.stroke();
  } else if (b.kind === 'metal') {
    ctx.fillStyle = M.pat; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(4,8,16,0.35)'; ctx.fillRect(x, y, w, h);
    // 枠と面取り
    ctx.fillStyle = mix(pal.ground[0], pal.ground[1], 0.35); ctx.fillRect(x, y, w, 0.3); ctx.fillRect(x, y + h - 0.3, w, 0.3); ctx.fillRect(x, y, 0.3, h); ctx.fillRect(x + w - 0.3, y, 0.3, h);
    ctx.fillStyle = rgba(pal.edge, 0.75); ctx.fillRect(x, y + h - 0.07, w, 0.07); ctx.fillRect(x, y, 0.06, h);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, 0.07); ctx.fillRect(x + w - 0.07, y, 0.07, h); ctx.fillRect(x + 0.3, y + 0.3, w - 0.6, 0.05); ctx.fillRect(x + 0.3, y + 0.3, 0.05, h - 0.6);
    // 警告の縞（上下の帯）
    for (const yy of [y + 0.42, y + h - 0.66]) {
      ctx.fillStyle = '#14100a'; ctx.fillRect(x + 0.42, yy, w - 0.84, 0.24);
      ctx.fillStyle = 'rgba(232,176,48,0.85)';
      for (let k = 0; k < 5; k++) { const sx = x + 0.48 + k * (w - 0.96) / 5; ctx.beginPath(); ctx.moveTo(sx, yy); ctx.lineTo(sx + 0.16, yy); ctx.lineTo(sx + 0.3, yy + 0.24); ctx.lineTo(sx + 0.14, yy + 0.24); ctx.closePath(); ctx.fill(); }
    }
    // ボルト
    for (const [bx, by] of [[0.15, 0.15], [w - 0.15, 0.15], [0.15, h - 0.15], [w - 0.15, h - 0.15]]) { ctx.fillStyle = '#05070c'; ctx.beginPath(); ctx.arc(x + bx, y + by, 0.085, 0, TAU); ctx.fill(); ctx.fillStyle = rgba(pal.ground[1], 0.9); ctx.beginPath(); ctx.arc(x + bx - 0.015, y + by + 0.015, 0.05, 0, TAU); ctx.fill(); }
    // 中央の灯（脈動）
    const pl = 0.55 + 0.45 * Math.sin(now * 2.4 + b.x0 * 0.7), cy = y + h / 2;
    ctx.fillStyle = '#05070c'; ctx.fillRect(x + 0.6, cy - 0.5, w - 1.2, 1.0);
    ctx.fillStyle = rgba(pal.glow, 0.35 + 0.6 * pl); ctx.fillRect(x + 0.72, cy - 0.38, w - 1.44, 0.76);
    ctx.fillStyle = rgba('#e8f8ff', 0.5 + 0.5 * pl); ctx.fillRect(x + 0.9, cy - 0.06, w - 1.8, 0.12);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; for (let k = 1; k < 4; k++) ctx.fillRect(x + 0.72, cy - 0.38 + k * 0.19, w - 1.44, 0.035);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.3 * pl; ctx.drawImage(M.glow, x + w / 2 - 1.6, cy - 1.6, 3.2, 3.2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  } else {
    // 細胞塊: 膜に包まれた長い塊。核が並んで脈打つ
    const r = 0.32;
    rrect(ctx, x, y, w, h, r); ctx.fillStyle = M.pat; ctx.fill();
    ctx.fillStyle = 'rgba(2,20,14,0.3)'; ctx.fill();
    rrect(ctx, x + 0.3, y + 0.3, w - 0.6, h - 0.6, 0.3); ctx.fillStyle = 'rgba(2,16,12,0.34)'; ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    for (let nx = Math.max(x + 1.5, Math.ceil((cam - 2) / 3) * 3); nx < Math.min(x + w - 1, cam + 36); nx += 3) {
      const pl = 0.5 + 0.5 * Math.sin(now * 2 + nx * 0.8);
      ctx.globalAlpha = 0.35 + 0.5 * pl; ctx.drawImage(M.glow, nx - 1.1, y + h / 2 - 1.1, 2.2, 2.2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    for (let nx = Math.max(x + 1.5, Math.ceil((cam - 2) / 3) * 3); nx < Math.min(x + w - 1, cam + 36); nx += 3) {
      ctx.fillStyle = rgba(pal.ground[2], 0.85); ctx.beginPath(); ctx.ellipse(nx, y + h / 2, 0.62, 0.5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(pal.edge, 0.55); ctx.lineWidth = 0.04; ctx.stroke();
      ctx.fillStyle = rgba(pal.glow, 0.75); ctx.beginPath(); ctx.arc(nx - 0.08, y + h / 2 + 0.06, 0.2, 0, TAU); ctx.fill();
    }
    rrect(ctx, x + 0.05, y + 0.05, w - 0.1, h - 0.1, r); ctx.strokeStyle = '#041a12'; ctx.lineWidth = 0.14; ctx.stroke();
    ctx.strokeStyle = pal.edge; ctx.lineWidth = 0.06; ctx.stroke();
    rrect(ctx, x + 0.26, y + 0.26, w - 0.52, h - 0.52, 0.22); ctx.strokeStyle = rgba(pal.edge, 0.3); ctx.lineWidth = 0.04; ctx.stroke();
  }
}
