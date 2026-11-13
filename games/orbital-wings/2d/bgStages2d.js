// ORBITAL WINGS 2D — 面ごとの背景の絵（空・天体・多層の遠景・仕掛け・前景・粒子）
// 各面の build(B) が「何をどの順で重ねるか」を返す。帯（strip）は buildStageCache で焼かれ、post で動く仕掛けを足す。
//   strip: 視差つきの帯 / band: 横いっぱいの色の帯 / fog: 流れる霧 / rays: 光の筋 / parts: 粒子 / hook: 自由に描く
import { VIEW_W, VIEW_H } from '../shared/config.js';
import { hash1 } from '../shared/rng.js';
import { TAU, lerp, clamp, smooth, rgba, mix, lum, canvas, tint, pfbm1, glowSprite, puffSprite, bubbleSprite, planetSprite, cellCanvas } from './bgUtil2d.js';
import { glowStroke, poly, rrect, bevel } from './bgTerrain2d.js';

const H = (i, s) => hash1(i, s);
// 帯の端をまたぐ物を継ぎ目なく描く
const rep3 = (c, P, fn) => { for (const o of [-P, 0, P]) { c.save(); c.translate(o, 0); fn(c); c.restore(); } };
// 周期 P の稜線
function ridge(c, P, base, amp, seed, f0, oct, o = {}) {
  const yBot = o.bot ?? -1, dy = o.dy || 0, st = o.step || 0.25, top = o.top;
  c.beginPath(); c.moveTo(-1, yBot);
  for (let x = -1; x <= P + 1.001; x += st) {
    let y = base + amp * pfbm1(x, P, seed, oct, f0) + (o.extra ? o.extra(((x % P) + P) % P) : 0);
    if (o.quant) y = Math.round(y / o.quant) * o.quant;
    c.lineTo(x, top ? top - y + dy : y + dy);
  }
  c.lineTo(P + 1, yBot); c.closePath(); c.fill();
}
// 尖った岩・塔の並び（稜線に足す高さ）。pow>1 で裾が反った尖塔になる
function peaks(n, x0, dx, jit, h0, h1, w0, w1, pow, seed, P) {
  const xs = [], hs = [], ws = [];
  for (let i = 0; i < n; i++) { xs.push(x0 + i * dx + H(i, seed) * jit); hs.push(lerp(h0, h1, H(i, seed + 1))); ws.push(lerp(w0, w1, H(i, seed + 2))); }
  return (x) => {
    let e = 0;
    for (let i = 0; i < n; i++) { let d = Math.abs(x - xs[i]); if (P && d > P / 2) d = P - d; if (d < ws[i]) { const t = 1 - d / ws[i]; e = Math.max(e, hs[i] * Math.pow(t, pow) * (0.9 + 0.1 * Math.sin(x * 9 + i))); } }
    return e;
  };
}
// 太さが変わる曲線（骨・触手・蔓）
function taper(c, fx, fy, n, w0, w1) {
  const A = [], Bq = [];
  for (let i = 0; i <= n; i++) { const t = i / n, x = fx(t), y = fy(t), dx = fx(t + 0.01) - fx(t - 0.01), dy = fy(t + 0.01) - fy(t - 0.01), l = Math.hypot(dx, dy) || 1, w = lerp(w0, w1, t) / 2; A.push(x - dy / l * w, y + dx / l * w); Bq.push(x + dy / l * w, y - dx / l * w); }
  c.beginPath(); c.moveTo(A[0], A[1]); for (let i = 1; i <= n; i++) c.lineTo(A[i * 2], A[i * 2 + 1]); for (let i = n; i >= 0; i--) c.lineTo(Bq[i * 2], Bq[i * 2 + 1]); c.closePath(); c.fill();
}
// 既に描いた影絵にだけ色を重ねる（大気遠近・霞・照り返し）
function atop(c, y0, y1, stops) {
  c.save(); c.globalCompositeOperation = 'source-atop';
  const g = c.createLinearGradient(0, y0, 0, y1);
  for (const [t, col, a] of stops) g.addColorStop(t, rgba(col, a));
  c.fillStyle = g; c.fillRect(-2, Math.min(y0, y1) - 2, 9999, Math.abs(y1 - y0) + 4); c.restore();
}
function grit(c, B, P, y0, y1, color, a, size = 8) {
  c.save(); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = a;
  const t = tint(B.com.cloudA, color);
  for (let x = 0; x < P; x += size) for (let y = y0; y < y1; y += size) c.drawImage(t, x, y, size, size);
  c.restore();
}
// 帯の上の灯（位置は帯の座標）。blink>0 で点滅、それ以外はゆっくり脈動
function lamps(R, ctx, L, cam, now, list, spr, o = {}) {
  ctx.globalCompositeOperation = 'lighter';
  R.bgTiles(L, cam, (c, xa, xb) => {
    for (let i = 0; i < list.length; i++) {
      const q = list[i]; if (q[0] < xa - 3 || q[0] > xb + 3) continue;
      const s = q[2] || o.size || 1;
      let a = o.blink ? (Math.sin(now * o.blink * (0.8 + (i % 5) * 0.13) + i * 1.9) > (o.duty ?? 0) ? 1 : 0.1) : 0.55 + 0.45 * Math.sin(now * (o.speed || 1.5) * (0.7 + (i % 4) * 0.2) + i * 2.3);
      c.globalAlpha = a * (o.a ?? 1);
      c.drawImage(q[3] || spr, q[0] - s / 2, q[1] - s / 2, s, s);
    }
  });
}

export const STAGE_ART = {
  // ===== 1: 火山帯 — 赤い夜空、噴煙を上げる火山、溶岩の川、舞い上がる火の粉 ===================
  1: { build(B) {
    const p = B.pal, S = B.Sb;
    const vol = [[15, 9.3, 13], [47, 7.4, 10]];
    const volPath = (c, x, h, w) => { c.beginPath(); c.moveTo(x - w, -1); c.lineTo(x - w, 0); c.quadraticCurveTo(x - w * 0.3, h * 0.3, x - 1.2, h); c.lineTo(x - 0.6, h - 0.4); c.lineTo(x + 0.3, h - 0.28); c.lineTo(x + 1.1, h); c.quadraticCurveTo(x + w * 0.3, h * 0.3, x + w, 0); c.lineTo(x + w, -1); c.closePath(); };
    const pools = [[5.5, 1.6, 2.6], [22, 1.3, 3.4], [37.5, 1.9, 2.2], [53, 1.5, 3.0]];
    return {
      sky: { stops: [[0, '#030208'], [0.3, '#0a0510'], [0.55, '#1c0810'], [0.78, '#3a0d0e'], [1, '#5a160c']],
        blots: [{ x: 30, y: 4, r: 16, c: '#7a1c0c', a: 0.5 }, { x: 8, y: 14, r: 12, c: '#2a1040', a: 0.4 }],
        neb: [{ x: 14, y: 13, rx: 13, ry: 6, c: p.neb[0], a: 0.5, rot: -0.2 }, { x: 34, y: 11.5, rx: 12, ry: 5, c: p.neb[1], a: 0.55, rot: 0.25, sc: 0.6 }, { x: 25, y: 15, rx: 9, ry: 3.5, c: p.neb[2], a: 0.22, sc: 0.5 }, { x: 20, y: 12, rx: 7, ry: 2.5, c: '#000000', a: 0.5, dark: true, sc: 0.5, rot: 0.3 }],
        dust: 1, stars: 0.9 },
      bodies: [
        { x: 27, y: 13.6, size: 7, par: 0.035, make: () => planetSprite(7 * S * 0.75, { r: 0.62, base: ['#b4502a', '#5a1c14', '#1a0608'], tex: tint(B.com.cloudA, '#1a0608'), texA: 0.6, craters: 14, cracks: p.glow, atmo: '#ff6a2a', light: [-0.7, -0.45], seed: 4 }) },
        { x: 9.5, y: 15.4, size: 1.8, par: 0.05, make: () => planetSprite(1.8 * S, { r: 0.7, base: ['#e8d8c8', '#8a7a78', '#201820'], craters: 9, light: [-0.7, -0.45], seed: 9 }) },
      ],
      layers: [
        { t: 'strip', par: 0.1, k: 0.5, P: 64, y0: 0, y1: 11.5, rise: -12.5,
          paint(c) {
            // 地平の照り返し（帯ごと焼いて、重ね描きを 1 枚減らす）
            const hz = c.createLinearGradient(0, 11, 0, 0); hz.addColorStop(0, rgba(p.haze, 0)); hz.addColorStop(0.55, rgba(p.haze, 0.42)); hz.addColorStop(1, rgba('#d8501a', 0.7)); c.fillStyle = hz; c.fillRect(-1, 0, 66, 11);
            c.fillStyle = mix(p.far, p.haze, 0.5); ridge(c, 64, 2.6, 4.2, 101, 1 / 16, 4);
            rep3(c, 64, () => vol.forEach(([x, h, w], i) => {
              c.fillStyle = mix(p.glow, p.far, 0.55); volPath(c, x - 0.08, h + 0.06, w); c.fill();
              c.fillStyle = mix(p.far, '#12060c', 0.35 + i * 0.15); volPath(c, x, h, w); c.fill();
              // 山肌を流れ落ちる溶岩の川
              for (let k = 0; k < 4; k++) {
                const sx = x - 0.5 + k * 0.42, dir = k < 2 ? -1 : 1, len = h * (0.5 + H(k + i * 7, 3) * 0.45);
                glowStroke(c, (cc) => { cc.beginPath(); cc.moveTo(sx, h - 0.4); let px = sx, py = h - 0.4; for (let q = 1; q <= 6; q++) { py = h - 0.4 - len * q / 6; px = sx + dir * (q / 6) ** 1.6 * w * (0.25 + H(k * 9 + q + i, 4) * 0.12) + (H(k * 5 + q, 6) - 0.5) * 0.4; cc.lineTo(px, py); } }, p.glow, 0.05, '#ffe9a8');
              }
              c.fillStyle = '#ffd08a'; c.beginPath(); c.ellipse(x - 0.15, h - 0.34, 0.5, 0.1, 0, 0, TAU); c.fill();
            }));
            c.fillStyle = mix(p.far, '#12060c', 0.3); ridge(c, 64, 0.8, 3.4, 131, 1 / 8, 4);
            atop(c, 11, 0, [[0, p.haze, 0], [0.6, p.haze, 0.2], [1, '#c8481a', 0.5]]);
          },
          init(B, L) { L.puff = puffSprite(S * 2.2, '#3a1a1c', 3); L.puffHot = puffSprite(S * 1.6, '#ff6a2a', 5); L.glow = glowSprite(S * 3, '#ff7a2a', 0.2, 1.6); },
          post(R, ctx, L, cam, now) {
            R.bgTiles(L, cam, (c, xa, xb) => {
              for (let v = 0; v < vol.length; v++) {
                const [x, h] = vol[v]; if (x < xa - 12 || x > xb + 12) continue;
                // 噴煙（風で右へ流れながら昇る）
                for (let i = 0; i < 10; i++) {
                  const ph = (now * 0.035 + i / 10 + v * 0.37) % 1, s = 1.4 + ph * 5.2;
                  const px = x - 0.2 + ph * ph * 6 + Math.sin(now * 0.4 + i * 2.1) * 0.25 * ph, py = h - 0.2 + ph * 6.2;
                  c.globalAlpha = Math.min(1, ph * 7) * (1 - ph) * 0.8;
                  c.drawImage(L.puff, px - s / 2, py - s / 2, s, s);
                }
                c.globalCompositeOperation = 'lighter';
                for (let i = 0; i < 4; i++) {
                  const ph = (now * 0.09 + i / 4 + v * 0.2) % 1, s = 1.2 + ph * 2.2;
                  c.globalAlpha = (1 - ph) * 0.45; c.drawImage(L.puffHot, x - 0.2 + ph * 0.8 - s / 2, h - 0.3 + ph * 2.4 - s / 2, s, s);
                }
                const gl = 0.6 + 0.3 * Math.sin(now * 2.3 + v * 2) + 0.1 * Math.sin(now * 7.1 + v);
                c.globalAlpha = gl; c.drawImage(L.glow, x - 2.6, h - 2.4, 5, 5);
                c.globalCompositeOperation = 'source-over';
              }
            });
          } },
        { t: 'fog', y: 3.5, h: 6, w: 48, par: 0.14, drift: 0.25, a: 0.5, c: '#2a1014', rise: -12, kind: 1, seed: 3 },
        { t: 'strip', par: 0.24, k: 0.75, P: 64, y0: 0, y1: 8, rise: -10,
          paint(c) {
            const ex = peaks(11, 2, 5.8, 3, 1.2, 4.6, 0.9, 2.2, 1.9, 5, 64);
            c.fillStyle = mix(p.glow, p.far, 0.35); ridge(c, 64, 1.3, 2.6, 211, 1 / 8, 5, { dy: 0.07, extra: ex, step: 0.125 });
            c.fillStyle = mix(p.far, '#0a0406', 0.5); ridge(c, 64, 1.3, 2.6, 211, 1 / 8, 5, { extra: ex, step: 0.125 });
            // 溶岩の溜まり
            rep3(c, 64, () => pools.forEach(([x, y, w]) => {
              const g = c.createRadialGradient(x, y, 0, x, y, w); g.addColorStop(0, rgba(p.glow, 0.6)); g.addColorStop(1, rgba(p.glow, 0));
              c.save(); c.translate(0, y * 0.6); c.scale(1, 0.4); c.fillStyle = g; c.fillRect(x - w, y - w, w * 2, w * 2); c.restore();
              c.fillStyle = p.glow; c.beginPath(); c.ellipse(x, y, w * 0.55, 0.11, 0, 0, TAU); c.fill();
              c.fillStyle = '#ffe9a8'; c.beginPath(); c.ellipse(x, y, w * 0.36, 0.045, 0, 0, TAU); c.fill();
            }));
            atop(c, 8, 0, [[0, p.haze, 0], [0.7, p.haze, 0.12], [1, '#c8481a', 0.4]]);
            grit(c, B, 64, 0, 8, '#000000', 0.25);
          },
          init(B, L) { L.glow = glowSprite(S * 3, p.glow, 0.15, 1.7); },
          post(R, ctx, L, cam, now) { lamps(R, ctx, L, cam, now, pools.map(([x, y, w]) => [x, y + 0.3, w * 2.2]), L.glow, { speed: 1.9, a: 0.55 }); } },
        // 陽炎: 溶岩の上で揺らぐ熱の筋
        { t: 'hook', draw(R, ctx, cam, now, F, L) {
          if (F.e < 0.05) return;
          const S = R.S; ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(p.glow, 1); ctx.lineWidth = Math.max(1, S * 0.05);
          for (let i = 0; i < 12; i++) {
            let x = (H(i, 31) * 44 - cam * 0.3) % 44; if (x < 0) x += 44; x -= 6;
            const ph = (now * (0.12 + H(i, 32) * 0.1) + H(i, 33)) % 1, y = 1 + ph * 5.5;
            ctx.globalAlpha = F.e * 0.16 * Math.sin(ph * Math.PI);
            ctx.beginPath();
            for (let k = 0; k <= 6; k++) { const yy = y + k * 0.22, xx = x + Math.sin(now * 3.1 + i + k * 0.9) * 0.16; if (k) ctx.lineTo(xx * S, (VIEW_H - yy) * S); else ctx.moveTo(xx * S, (VIEW_H - yy) * S); }
            ctx.stroke();
          }
        } },
        { t: 'parts', n: 70, c: '#ff8a3a', core: 0.5, s0: 0.06, s1: 0.22, par: 0.4, vx: 0.5, vy: 1.3, wob: 0.35, wf: 1.6, a: 0.95, tw: 5, y0: -1, y1: 15, add: true, fadeE: true },
        { t: 'strip', par: 0.5, k: 1, P: 48, y0: 0, y1: 5.2, rise: -7,
          paint(c) {
            const ex = peaks(9, 1, 5.3, 2.5, 0.8, 3.0, 0.8, 2.0, 1.6, 15, 48);
            c.fillStyle = mix(p.glow, '#3a0e08', 0.45); ridge(c, 48, 0.7, 2.0, 311, 1 / 4, 5, { dy: 0.055, extra: ex, step: 0.1 });
            c.fillStyle = '#130608'; ridge(c, 48, 0.7, 2.0, 311, 1 / 4, 5, { extra: ex, step: 0.1 });
            atop(c, 5, 0, [[0, '#000000', 0], [1, '#8a2a10', 0.35]]);
          } },
      ],
      front: [
        { t: 'strip', par: 1.5, k: 0.25, squash: 0.62, P: 64, y0: 0, y1: 2.4, rise: -3.5, env: 'f', a: 0.94,
          paint(c) { const ex = peaks(8, 3, 8, 3, 0.6, 1.5, 1.2, 2.6, 1.3, 25, 64); c.fillStyle = '#0a0304'; ridge(c, 64, 0.1, 0.9, 411, 1 / 4, 4, { extra: ex }); atop(c, 2.4, 0, [[0, p.glow, 0.16], [0.4, p.glow, 0]]); } },
        { t: 'strip', par: 1.5, k: 0.25, squash: 0.62, P: 64, y0: 15.7, y1: 18, rise: 3.5, env: 'c', a: 0.94,
          paint(c) { const ex = peaks(10, 2, 6.4, 3, 0.5, 1.5, 0.5, 1.1, 1.5, 27, 64); c.fillStyle = '#0a0304'; ridge(c, 64, 0.2, 0.7, 431, 1 / 4, 4, { extra: ex, top: 18, bot: 19 }); } },
        { t: 'parts', n: 14, c: '#ffb060', core: 0.6, s0: 0.1, s1: 0.3, par: 1.8, vx: 1.2, vy: 2.2, wob: 0.4, wf: 2, a: 0.8, tw: 6, y0: -1, y1: 19, add: true, fadeE: true, stretch: 1.6 },
      ],
      mood: { dark: '#0a0204', a: 0.45 }, streak: { c: '#ffd0a0', a: 0.2 },
    };
  } },
};

// ===== 2: 古代遺跡 — 青い夜、崩れた神殿・列柱・アーチ、青い霧、漂う光の粒 ======================
function temple(c, x, yb, w, h, n, seed) {
  for (let k = 0; k < 3; k++) c.fillRect(x - w / 2 - (2 - k) * 0.22, yb + k * h * 0.05, w + (2 - k) * 0.44, h * 0.05 + 0.02);
  const y0 = yb + h * 0.15, ch = h * 0.52, cw = w / (n * 2.1);
  for (let i = 0; i < n; i++) { const f = seed && H(i + seed, 91) < 0.28 ? 0.3 + H(i + seed, 92) * 0.5 : 1; c.fillRect(x - w / 2 + (i + 0.5) * w / n - cw / 2, y0, cw, ch * f + 0.02); if (f === 1) c.fillRect(x - w / 2 + (i + 0.5) * w / n - cw * 0.75, y0 + ch - h * 0.03, cw * 1.5, h * 0.03); }
  const br = seed ? H(seed, 93) : 1;
  if (br > 0.35) { c.fillRect(x - w / 2 - 0.1, y0 + ch, w + 0.2, h * 0.1); poly(c, [x - w / 2 - 0.2, y0 + ch + h * 0.1, x + w / 2 + 0.2, y0 + ch + h * 0.1, x, yb + h]); c.fill(); }
  else { c.fillRect(x - w / 2 - 0.1, y0 + ch, w * 0.55, h * 0.1); poly(c, [x - w / 2 - 0.2, y0 + ch + h * 0.1, x - w * 0.05, y0 + ch + h * 0.1, x - w * 0.12, yb + h * 0.9]); c.fill(); }
}
function arcade(c, x0, n, span, yb, h, pier, seed) {
  for (let i = 0; i < n; i++) {
    const x = x0 + i * span;
    if (H(i, seed) < 0.22) { c.fillRect(x, yb, pier / 2, h * (0.25 + H(i, seed + 1) * 0.4)); c.fillRect(x + span - pier / 2, yb, pier / 2, h * (0.2 + H(i, seed + 2) * 0.5)); continue; }
    const ya = yb + h * 0.5, r = (span - pier) / 2;
    c.beginPath(); c.rect(x, yb, span, h); c.moveTo(x + pier / 2, yb); c.lineTo(x + pier / 2, ya); c.arc(x + span / 2, ya, r, Math.PI, 0, true); c.lineTo(x + span - pier / 2, yb); c.closePath(); c.fill('evenodd');
    c.fillRect(x - 0.06, yb + h, span + 0.12, h * 0.07);
  }
}
function column(c, x, yb, h, w, cap = true) {
  c.fillRect(x - w / 2, yb, w, h); c.fillRect(x - w * 0.75, yb, w * 1.5, 0.22);
  if (cap) { c.fillRect(x - w * 0.7, yb + h - 0.18, w * 1.4, 0.18); c.fillRect(x - w * 0.9, yb + h, w * 1.8, 0.2); }
  else poly(c, [x - w / 2, yb + h, x + w / 2, yb + h, x + w / 2, yb + h + w * 0.5, x, yb + h + w * 0.15, x - w / 2, yb + h + w * 0.7]), c.fill();
}
STAGE_ART[2] = { build(B) {
  const p = B.pal, S = B.Sb;
  const orbs = [[20, 8.25, 2.6], [51.5, 6.65, 1.8]];
  return {
    sky: { stops: [[0, '#01040a'], [0.35, '#04101e'], [0.62, '#0a2238'], [0.84, '#103a52'], [1, '#165064']],
      blots: [{ x: 24, y: 13.4, r: 11, c: '#3a8ab8', a: 0.4 }, { x: 40, y: 5, r: 14, c: '#1a5a70', a: 0.4 }],
      neb: [{ x: 12, y: 12, rx: 12, ry: 5, c: p.neb[0], a: 0.5, rot: 0.2 }, { x: 36, y: 14, rx: 12, ry: 4.5, c: p.neb[1], a: 0.6, rot: -0.15, sc: 0.6 }, { x: 28, y: 10, rx: 10, ry: 3, c: p.neb[2], a: 0.16, sc: 0.5 }],
      dust: 0.9, stars: 0.7 },
    bodies: [
      { x: 24.5, y: 13.4, size: 5, par: 0.03, make: () => planetSprite(5 * S, { r: 0.56, base: ['#f4fbff', '#a8cce0', '#1c3448'], tex: tint(B.com.cloudB, '#5a88a8'), texA: 0.5, craters: 12, atmo: '#8ad4ff', light: [0.75, -0.3], seed: 6 }) },
      { x: 7.5, y: 15, size: 3.4, par: 0.045, make: () => planetSprite(3.4 * S, { r: 0.42, base: ['#c8e8f0', '#3a7a98', '#04141e'], tex: tint(B.com.cloudA, '#0a2a3a'), texA: 0.5, bands: true, ring: { c: '#9ad8f0', c2: '#e8f8ff', rIn: 1.35, rOut: 2.2, a: 0.6, tilt: -0.4 }, atmo: '#6ac8f0', light: [0.75, -0.3] }) },
    ],
    layers: [
      { t: 'strip', par: 0.09, k: 0.5, P: 64, y0: 0, y1: 11, rise: -12,
        paint(c) {
          const hz = c.createLinearGradient(0, 10.5, 0, 0); hz.addColorStop(0, rgba(p.haze, 0)); hz.addColorStop(0.55, rgba(p.haze, 0.48)); hz.addColorStop(1, rgba('#3a98b0', 0.66)); c.fillStyle = hz; c.fillRect(-1, 0, 66, 10.5);
          c.fillStyle = mix(p.far, p.haze, 0.62); ridge(c, 64, 2.2, 3.6, 201, 1 / 16, 4, { quant: 0.3 });
          c.fillStyle = mix(p.far, p.haze, 0.45);
          rep3(c, 64, () => {
            // 段々の神殿（頂に光）と、切妻の神殿
            for (let k = 0; k < 6; k++) c.fillRect(20 - 5 + k * 0.75, 1.2 + k * 1.0, 10 - k * 1.5, 1.02);
            c.fillRect(19.4, 7.2, 1.2, 0.7); temple(c, 20, 7.2, 2.2, 1.9, 4, 0);
            temple(c, 39, 2.4, 7.5, 4.6, 8, 7); temple(c, 51.5, 3.6, 4.6, 3.6, 5, 0); temple(c, 4.5, 2.6, 5.5, 3.6, 6, 13);
            for (let i = 0; i < 9; i++) column(c, 27 + i * 1.1 + H(i, 5) * 0.3, 2.2, 1.6 + H(i, 6) * 2.4, 0.3, H(i, 7) > 0.5);
            for (let i = 0; i < 6; i++) column(c, 57 + i * 1.2, 2.0, 1.4 + H(i, 8) * 2.0, 0.28, H(i, 9) > 0.6);
          });
          c.fillStyle = mix(p.far, p.haze, 0.32); ridge(c, 64, 0.8, 2.4, 231, 1 / 8, 4, { quant: 0.25 });
          atop(c, 11, 0, [[0, p.haze, 0], [0.55, p.haze, 0.16], [1, '#4ab0c8', 0.45]]);
        },
        init(B, L) { L.glow = glowSprite(S * 2, p.glow, 0.3, 1.8); },
        post(R, ctx, L, cam, now) { lamps(R, ctx, L, cam, now, orbs, L.glow, { speed: 1.1, a: 0.8 }); } },
      { t: 'fog', y: 0.5, h: 6.5, w: 44, par: 0.12, drift: 0.2, a: 0.3, c: p.mist, rise: -10, kind: 0, add: true, breath: 0.5 },
      { t: 'strip', par: 0.22, k: 0.75, P: 64, y0: 0, y1: 12.5, rise: -14,
        paint(c) {
          const all = () => {
            ridge(c, 64, 0.9, 1.6, 251, 1 / 8, 4, { quant: 0.35 });
            arcade(c, 2, 7, 3.3, 1.2, 4.6, 0.9, 31); arcade(c, 2, 7, 3.3, 6.1, 2.6, 0.7, 33);
            arcade(c, 36, 5, 4.2, 1.4, 6.4, 1.2, 37);
            for (let i = 0; i < 5; i++) column(c, 27 + i * 1.6, 1.6, 3 + H(i, 41) * 5, 0.5, H(i, 42) > 0.45);
            temple(c, 60.5, 1.5, 5.2, 7.5, 5, 21);
          };
          rep3(c, 64, () => { c.save(); c.translate(0.06, 0.06); c.fillStyle = mix(p.mist, p.far, 0.35); all(); c.restore(); c.fillStyle = mix(p.far, '#040a12', 0.45); all(); });
          atop(c, 12.5, 0, [[0, '#000000', 0.15], [0.6, p.haze, 0.1], [1, '#3a90a8', 0.5]]);
          grit(c, B, 64, 0, 12.5, '#000000', 0.25);
        } },
      { t: 'rays', c: '#7ad0f0', a: 0.24, slant: 0.55, seed: 3, fadeE: true },
      { t: 'fog', y: 0, h: 5, w: 36, par: 0.3, drift: -0.35, a: 0.34, c: p.mist, rise: -8, kind: 1, add: true },
      { t: 'parts', n: 54, c: '#8ae4ff', core: 0.5, s0: 0.07, s1: 0.26, par: 0.35, vx: 0.1, vy: 0.22, wob: 0.6, wf: 0.7, a: 0.9, tw: 2.2, y0: 0, y1: 18, add: true, fadeE: true },
      { t: 'strip', par: 0.5, k: 1, P: 48, y0: 0, y1: 6.5, rise: -8,
        paint(c) {
          const all = () => {
            ridge(c, 48, 0.5, 1.2, 261, 1 / 4, 4, { quant: 0.3 });
            column(c, 6, 0.8, 4.4, 1.3, false); column(c, 9.2, 0.8, 2.0, 1.3, false); column(c, 30, 0.6, 5.2, 1.4, true); column(c, 41, 0.7, 3.2, 1.2, false);
            c.save(); c.translate(19, 1.2); c.rotate(0.1); for (let k = 0; k < 4; k++) c.fillRect(-3.2 + k * 1.62, 0, 1.5, 1.2); c.fillRect(3.3, -0.2, 0.4, 1.6); c.restore();
            for (let i = 0; i < 9; i++) { c.save(); c.translate(13 + i * 3.7 + H(i, 51) * 2, 0.7 + H(i, 52) * 0.5); c.rotate((H(i, 53) - 0.5) * 0.7); c.fillRect(-0.5, -0.3, 0.7 + H(i, 54) * 0.7, 0.5 + H(i, 55) * 0.4); c.restore(); }
          };
          rep3(c, 48, () => { c.save(); c.translate(0.05, 0.06); c.fillStyle = '#4a98b8'; all(); c.restore(); c.fillStyle = '#070e16'; all(); });
          atop(c, 6.5, 0, [[0, '#000000', 0], [1, '#1a5068', 0.4]]);
        } },
      { t: 'strip', par: 0.5, k: 1, P: 48, y0: 12.6, y1: 18, rise: 7, env: 'c',
        paint(c) {
          const all = () => {
            ridge(c, 48, 0.3, 1.3, 271, 1 / 4, 4, { quant: 0.3, top: 18, bot: 19 });
            for (const [x, w, d] of [[8, 7, 3.4], [26, 9, 4.4], [41, 6, 2.8]]) { c.beginPath(); c.moveTo(x - w / 2 - 0.9, 19); c.lineTo(x - w / 2 - 0.9, 18 - d * 0.35); c.lineTo(x - w / 2, 18 - d * 0.35); c.arc(x, 18 - d * 0.35 + 0, w / 2, Math.PI, 0, true); c.lineTo(x + w / 2 + 0.9, 18 - d * 0.35); c.lineTo(x + w / 2 + 0.9, 19); c.closePath(); c.fill(); c.fillRect(x - w / 2 - 1.1, 18 - d * 0.35 - 0.3, 1.3, 0.3); c.fillRect(x + w / 2 - 0.2, 18 - d * 0.35 - 0.3, 1.3, 0.3); c.fillRect(x - w / 2 - 0.8, 18 - d * 0.35 - d * 0.55, 0.7, d * 0.3); }
          };
          rep3(c, 48, () => { c.save(); c.translate(0.04, -0.06); c.fillStyle = '#2a6a88'; all(); c.restore(); c.fillStyle = '#060c14'; all(); });
        } },
    ],
    front: [
      { t: 'strip', par: 1.5, k: 0.25, squash: 0.62, P: 64, y0: 0, y1: 2.5, rise: -3.5, env: 'f', a: 0.94,
        paint(c) { c.fillStyle = '#03070c'; ridge(c, 64, 0.1, 0.8, 281, 1 / 4, 3, { quant: 0.25 }); rep3(c, 64, () => { for (let i = 0; i < 6; i++) column(c, 5 + i * 10.5 + H(i, 61) * 4, 0, 1.0 + H(i, 62) * 1.3, 1.5, false); }); atop(c, 2.5, 0, [[0, p.glow, 0.12], [0.5, p.glow, 0]]); } },
      { t: 'strip', par: 1.5, k: 0.25, squash: 0.62, P: 64, y0: 15.8, y1: 18, rise: 3.5, env: 'c', a: 0.94,
        paint(c) { c.fillStyle = '#03070c'; ridge(c, 64, 0.2, 0.7, 291, 1 / 4, 3, { quant: 0.25, top: 18, bot: 19 }); rep3(c, 64, () => { for (let i = 0; i < 7; i++) c.fillRect(3 + i * 9 + H(i, 63) * 4, 18 - 0.8 - H(i, 64) * 1.2, 1.6 + H(i, 65), 2.2); }); } },
      { t: 'parts', n: 8, c: '#bff0ff', core: 0.2, fall: 1.5, s0: 0.3, s1: 0.8, par: 1.8, vx: 0.2, vy: 0.3, wob: 0.5, wf: 0.6, a: 0.3, tw: 1.4, y0: 0, y1: 18, add: true, fadeE: true },
    ],
    mood: { dark: '#02040c', a: 0.45 }, streak: { c: '#bfe8ff', a: 0.18 },
  };
} };

// ===== 3: 巨大石像 — 紫の夕空、沈む恒星、流れる雲、遠くに並ぶ巨像 ==============================
function colossus(c, x, yb, h, v) {
  const w = h * 0.3;
  poly(c, [x - w * 1.3, yb, x + w * 1.3, yb, x + w * 1.12, yb + h * 0.07, x - w * 1.12, yb + h * 0.07]); c.fill();
  poly(c, [x - w * 0.98, yb + h * 0.07, x + w * 0.98, yb + h * 0.07, x + w * 0.74, yb + h * 0.57, x - w * 0.74, yb + h * 0.57]); c.fill();
  poly(c, [x - w * 0.8, yb + h * 0.55, x + w * 0.8, yb + h * 0.55, x + w * 1.06, yb + h * 0.74, x + w * 0.84, yb + h * 0.8, x - w * 0.84, yb + h * 0.8, x - w * 1.06, yb + h * 0.74]); c.fill();
  if (v !== 3) c.fillRect(x - w * 1.12, yb + h * 0.4, w * 0.27, h * 0.36);
  if (v === 1) { poly(c, [x + w * 0.84, yb + h * 0.74, x + w * 1.1, yb + h * 0.74, x + w * 1.7, yb + h * 0.98, x + w * 1.48, yb + h * 1.0]); c.fill(); }
  else c.fillRect(x + w * 0.85, yb + h * 0.4, w * 0.27, h * 0.36);
  if (v === 3) return;                                   // 頭の欠けた像
  c.fillRect(x - w * 0.2, yb + h * 0.78, w * 0.4, h * 0.06);
  poly(c, [x - w * 0.34, yb + h * 0.82, x + w * 0.34, yb + h * 0.82, x + w * 0.42, yb + h * 0.93, x - w * 0.42, yb + h * 0.93]); c.fill();
  if (v === 0) { poly(c, [x - w * 0.42, yb + h * 0.925, x + w * 0.42, yb + h * 0.925, x + w * 0.62, yb + h, x - w * 0.62, yb + h]); c.fill(); }
  else if (v === 1) { for (let k = -1; k <= 1; k++) poly(c, [x + k * w * 0.3 - w * 0.14, yb + h * 0.925, x + k * w * 0.3 + w * 0.14, yb + h * 0.925, x + k * w * 0.36, yb + h * (k ? 0.985 : 1.01)]), c.fill(); }
  else { c.beginPath(); c.arc(x, yb + h * 0.955, w * 0.62, 0, TAU); c.arc(x, yb + h * 0.955, w * 0.47, 0, TAU, true); c.fill('evenodd'); c.fillRect(x - w * 0.42, yb + h * 0.925, w * 0.84, h * 0.02); }
  if (v === 2) { c.fillRect(x + w * 1.3, yb + h * 0.07, w * 0.09, h * 0.86); c.beginPath(); c.arc(x + w * 1.345, yb + h * 0.96, w * 0.2, 0, TAU); c.fill(); }
}
STAGE_ART[3] = { build(B) {
  const p = B.pal, S = B.Sb;
  const giants = [[7, 1.2, 9.4, 0], [22.5, 1.0, 11.2, 2], [38, 1.3, 8.6, 3], [53, 1.1, 10.4, 1]];
  const eyes = [];
  for (const [x, yb, h, v] of giants) if (v !== 3) { const w = h * 0.3; eyes.push([x - w * 0.16, yb + h * 0.885, 0.9], [x + w * 0.16, yb + h * 0.885, 0.9]); if (v === 2) eyes.push([x + w * 1.345, yb + h * 0.96, 2.4]); }
  return {
    sky: { stops: [[0, '#05030c'], [0.28, '#120a24'], [0.5, '#2c153c'], [0.68, '#5a2444'], [0.83, '#a04a3a'], [1, '#e89040']],
      blots: [{ x: 22, y: 3.4, r: 15, c: '#ffb050', a: 0.55 }, { x: 34, y: 12, r: 12, c: '#3a1c5a', a: 0.45 }],
      neb: [{ x: 14, y: 14.5, rx: 13, ry: 4, c: p.neb[0], a: 0.5, rot: 0.1 }, { x: 38, y: 13.5, rx: 11, ry: 4, c: p.neb[1], a: 0.5, sc: 0.6, rot: -0.2 }],
      dust: 1.1, stars: 0.8 },
    bodies: [
      { x: 9, y: 13.2, size: 8, par: 0.028, make: () => planetSprite(8 * S * 0.75, { r: 0.44, base: ['#e8c0d8', '#7a4a88', '#160a26'], tex: tint(B.com.cloudA, '#3a1c50'), texA: 0.55, bands: true, bandTilt: -0.3, ring: { c: '#e8b8a0', c2: '#fff0e0', rIn: 1.3, rOut: 2.15, a: 0.55, tilt: -0.3 }, atmo: '#d890c8', light: [0.45, 0.75] }) },
      { x: 22, y: 3.3, size: 9, par: 0.02, add: true, rise: -2.5, make: () => { const px = Math.round(9 * S * 0.5), cv = canvas(px, px), c = cv.getContext('2d'), r = px / 2; let g = c.createRadialGradient(r, r, 0, r, r, r); g.addColorStop(0, 'rgba(255,220,150,0.9)'); g.addColorStop(0.12, 'rgba(255,170,80,0.55)'); g.addColorStop(0.4, 'rgba(255,120,60,0.16)'); g.addColorStop(1, 'rgba(255,100,60,0)'); c.fillStyle = g; c.fillRect(0, 0, px, px); g = c.createRadialGradient(r, r, 0, r, r, r * 0.13); g.addColorStop(0, '#fffbe8'); g.addColorStop(0.8, '#fff0c0'); g.addColorStop(1, 'rgba(255,230,160,0)'); c.fillStyle = g; c.fillRect(0, 0, px, px); return cv; } },
    ],
    layers: [
      // 流れる雲（下から夕日に照らされる）
      { t: 'hook',
        init(B, L) {
          L.cl = [0, 1, 2].map((k) => { const cv = canvas(384, 128), c = cv.getContext('2d'); c.drawImage([B.com.cloudB, B.com.cloudA, B.com.cloudC][k], 0, k * 40, 256, 96, 0, 0, 384, 128);
            c.globalCompositeOperation = 'source-in'; const g = c.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#3a2250'); g.addColorStop(0.55, '#7a3a5a'); g.addColorStop(1, '#ffa050'); c.fillStyle = g; c.fillRect(0, 0, 384, 128);
            c.globalCompositeOperation = 'destination-in'; c.save(); c.translate(192, 64); c.scale(1, 1 / 3); const rg = c.createRadialGradient(0, 0, 0, 0, 0, 192); rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(0.6, 'rgba(0,0,0,0.8)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = rg; c.fillRect(-192, -192, 384, 384); c.restore(); return cv; });
        },
        draw(R, ctx, cam, now, F, L) {
          const S = R.S;
          for (let i = 0; i < 9; i++) {
            let x = (H(i, 41) * 80 - cam * 0.06 - now * (0.25 + H(i, 42) * 0.35)) % 80; if (x < 0) x += 80; x -= 24;
            const w = 14 + H(i, 43) * 12, h = w * 0.2, y = 5.5 + H(i, 44) * 8.5;
            ctx.globalAlpha = 0.75 + 0.25 * H(i, 45);
            ctx.drawImage(L.cl[i % 3], x * S, (VIEW_H - y - h) * S + F.shy, w * S, h * S);
          }
        } },
      { t: 'strip', par: 0.08, k: 0.5, P: 64, y0: 0, y1: 9, rise: -10,
        paint(c) {
          c.fillStyle = mix(p.far, p.haze, 0.6); ridge(c, 64, 1.6, 3.6, 301, 1 / 16, 3, { quant: 0.7, step: 0.5 });
          c.fillStyle = mix(p.far, p.haze, 0.45);
          rep3(c, 64, () => { for (let i = 0; i < 9; i++) colossus(c, 4 + i * 7.1, 1.6 + H(i, 5) * 0.6, 3.2 + H(i, 6) * 2.2, i % 4); });
          c.fillStyle = mix(p.far, p.haze, 0.3); ridge(c, 64, 0.6, 2.0, 321, 1 / 8, 4, { quant: 0.35 });
          atop(c, 9, 0, [[0, p.haze, 0.05], [0.5, p.haze, 0.3], [1, '#f09848', 0.75]]);
        } },
      { t: 'band', y0: 0, y1: 7, rise: -8, stops: [[0, '#e08040', 0], [1, '#e08040', 0.38]] },
      { t: 'strip', par: 0.2, k: 0.75, P: 64, y0: 0, y1: 13.5, rise: -15,
        paint(c) {
          const all = () => { ridge(c, 64, 0.7, 1.2, 331, 1 / 8, 3, { quant: 0.4 }); giants.forEach(([x, yb, h, v]) => colossus(c, x, yb, h, v)); for (let i = 0; i < 6; i++) { const x = 14.5 + i * 10.4, hh = 2.5 + H(i, 9) * 2.5; poly(c, [x - 0.45, 0.8, x + 0.45, 0.8, x + 0.3, 0.8 + hh, x, 1.3 + hh, x - 0.3, 0.8 + hh]); c.fill(); } };
          rep3(c, 64, () => {
            c.save(); c.translate(-0.09, 0.03); c.fillStyle = '#e88a48'; all(); c.restore();
            c.fillStyle = mix(p.far, '#0c0818', 0.3); all();
            // 顔と衣の刻み
            c.strokeStyle = 'rgba(8,4,16,0.6)'; c.lineWidth = 0.06;
            giants.forEach(([x, yb, h, v]) => { const w = h * 0.3; c.beginPath(); for (let k = -2; k <= 2; k++) { c.moveTo(x + k * w * 0.3, yb + h * 0.1); c.lineTo(x + k * w * 0.24, yb + h * 0.54); } c.moveTo(x - w * 0.8, yb + h * 0.6); c.lineTo(x + w * 0.8, yb + h * 0.6); if (v !== 3) { c.moveTo(x, yb + h * 0.84); c.lineTo(x, yb + h * 0.875); c.moveTo(x - w * 0.12, yb + h * 0.845); c.lineTo(x + w * 0.12, yb + h * 0.845); } c.stroke(); });
          });
          atop(c, 13.5, 0, [[0, '#1a0c28', 0.1], [0.55, p.haze, 0.12], [1, '#e88a48', 0.5]]);
          grit(c, B, 64, 0, 13.5, '#000000', 0.22);
        },
        init(B, L) { L.glow = glowSprite(S * 1.2, p.glow, 0.35, 2); },
        post(R, ctx, L, cam, now) { lamps(R, ctx, L, cam, now, eyes, L.glow, { speed: 0.8, a: 0.85 }); } },
      { t: 'rays', c: '#ffb060', a: 0.13, slant: -0.5, seed: 11, n: 7, fromBottom: true, fadeE: true },
      { t: 'fog', y: 0, h: 5, w: 40, par: 0.26, drift: -0.5, a: 0.4, c: '#b06a58', rise: -7, kind: 1 },
      { t: 'parts', n: 50, c: '#ffd8b0', core: 0.2, s0: 0.04, s1: 0.13, par: 0.5, vx: -1.6, vy: 0.12, wob: 0.25, wf: 1.1, a: 0.6, tw: 3, y0: 0, y1: 18, add: true, fadeE: true },
      { t: 'strip', par: 0.5, k: 1, P: 48, y0: 0, y1: 6.5, rise: -8,
        paint(c) {
          const all = () => {
            ridge(c, 48, 0.5, 1.1, 341, 1 / 4, 3, { quant: 0.3 });
            // 倒れた巨像の頭・手・傾いた方尖
            c.save(); c.translate(11, 2.4); c.rotate(-1.25); colossus(c, 0, -8.2, 10, 0); c.restore();
            c.save(); c.translate(31, 0.6); c.rotate(0.14); poly(c, [-0.8, 0, 0.8, 0, 0.5, 4.6, 0, 5.4, -0.5, 4.6]); c.fill(); c.restore();
            c.save(); c.translate(40, 0.5); c.rotate(-0.3); poly(c, [-0.6, 0, 0.6, 0, 0.4, 2.8, -0.4, 2.8]); c.fill(); c.restore();
            for (let k = 0; k < 4; k++) c.fillRect(21.5 + k * 0.55, 0.6, 0.42, 1.6 + (k % 2) * 0.5 + (k === 1 ? 0.5 : 0)); c.fillRect(21.2, 0.5, 2.6, 1.0);
            for (let k = 0; k < 5; k++) c.fillRect(44 + k * 0.7, 0.4, 3.6 - k * 0.7, 0.5 + k * 0.4);
          };
          rep3(c, 48, () => { c.save(); c.translate(-0.07, 0.05); c.fillStyle = '#f09a50'; all(); c.restore(); c.fillStyle = '#0c0814'; all(); });
          atop(c, 6.5, 0, [[0, '#000000', 0], [1, '#a04a38', 0.4]]);
        } },
    ],
    front: [
      { t: 'strip', par: 1.5, k: 0.25, squash: 0.62, P: 64, y0: 0, y1: 2.5, rise: -3.5, env: 'f', a: 0.94,
        paint(c) { c.fillStyle = '#07050c'; ridge(c, 64, 0.1, 0.8, 351, 1 / 4, 3, { quant: 0.3 }); rep3(c, 64, () => { for (let i = 0; i < 6; i++) { const x = 5 + i * 10.6 + H(i, 71) * 4, hh = 1.2 + H(i, 72) * 1.2; poly(c, [x - 0.9, 0, x + 0.9, 0, x + 0.6, hh, x, hh + 0.5, x - 0.6, hh]); c.fill(); } }); atop(c, 2.5, 0, [[0, '#e88a48', 0.16], [0.5, '#e88a48', 0]]); } },
      { t: 'strip', par: 1.5, k: 0.25, squash: 0.62, P: 64, y0: 15.8, y1: 18, rise: 3.5, env: 'c', a: 0.94,
        paint(c) { c.fillStyle = '#07050c'; ridge(c, 64, 0.2, 0.9, 361, 1 / 4, 3, { quant: 0.35, top: 18, bot: 19 }); } },
      { t: 'parts', n: 10, c: '#ffe0c0', core: 0.2, fall: 1.6, s0: 0.2, s1: 0.5, par: 2, vx: -2.6, vy: 0.2, wob: 0.3, wf: 1, a: 0.3, y0: 0, y1: 18, add: true, fadeE: true, stretch: 2.2 },
    ],
    mood: { dark: '#08040e', a: 0.48 }, streak: { c: '#ffe0c8', a: 0.18 },
  };
} };

// ===== 4: 地形の難所 — 巨大な機械の峡谷（梁・配管・回る歯車・警告灯・蒸気） =========================
function gearSprite(px, col, rim, teeth = 14) {
  px = Math.round(px); const cv = canvas(px, px), c = cv.getContext('2d'), r = px / 2;
  const shape = (R) => { c.beginPath(); for (let i = 0; i < teeth * 4; i++) { const a = i / (teeth * 4) * TAU, rr = (i % 4 < 2 ? R : R * 0.86); c.lineTo(r + Math.cos(a) * rr, r + Math.sin(a) * rr); } c.closePath(); for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.3; c.moveTo(r + Math.cos(a) * R * 0.5 + R * 0.17, r + Math.sin(a) * R * 0.5); c.arc(r + Math.cos(a) * R * 0.5, r + Math.sin(a) * R * 0.5, R * 0.17, 0, TAU); } };
  c.fillStyle = rim; c.save(); c.translate(-px * 0.012, -px * 0.012); shape(r * 0.97); c.fill('evenodd'); c.restore();
  c.fillStyle = col; shape(r * 0.97); c.fill('evenodd');
  c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = px * 0.02; c.beginPath(); c.arc(r, r, r * 0.74, 0, TAU); c.stroke();
  c.fillStyle = rim; c.beginPath(); c.arc(r, r, r * 0.2, 0, TAU); c.fill(); c.fillStyle = 'rgba(0,0,0,0.6)'; c.beginPath(); c.arc(r, r, r * 0.1, 0, TAU); c.fill();
  return cv;
}
// トラス（斜材の入った梁）。水平 or 垂直
function truss(c, x, y, w, h, seg, vert) {
  const t = Math.min(w, h) * 0.16;
  c.fillRect(x, y, vert ? t : w, vert ? h : t); c.fillRect(vert ? x + w - t : x, vert ? y : y + h - t, vert ? t : w, vert ? h : t);
  c.lineWidth = t * 0.8; c.beginPath();
  const n = Math.max(1, Math.round((vert ? h : w) / seg));
  for (let i = 0; i < n; i++) {
    if (vert) { const y0 = y + i * h / n, y1 = y + (i + 1) * h / n; c.moveTo(x + t / 2, y0); c.lineTo(x + w - t / 2, y1); c.moveTo(x + w - t / 2, y0); c.lineTo(x + t / 2, y1); c.moveTo(x, y1); c.lineTo(x + w, y1); }
    else { const x0 = x + i * w / n, x1 = x + (i + 1) * w / n; c.moveTo(x0, y + t / 2); c.lineTo(x1, y + h - t / 2); c.moveTo(x0, y + h - t / 2); c.lineTo(x1, y + t / 2); c.moveTo(x1, y); c.lineTo(x1, y + h); }
  }
  c.stroke();
}
function skyline(c, P, seed, base, amp, top) {
  const Y = (y) => (top ? top - y : y), R = (x, y, w, h) => (top ? c.fillRect(x, top - y - h, w, h) : c.fillRect(x, y, w, h));
  ridge(c, P, base, amp, seed, 1 / 8, 3, top ? { quant: 0.5, step: 0.5, top, bot: top + 1 } : { quant: 0.5, step: 0.5 });
  rep3(c, P, () => {
    for (let i = 0; i < 22; i++) {
      const x = i * P / 22 + H(i, seed + 3) * 1.5, k = H(i, seed + 4), hh = base + amp * (0.4 + H(i, seed + 5) * 1.0);
      if (k < 0.3) { R(x, 0, 1.2, hh); R(x + 0.35, hh, 0.5, 0.8 + H(i, seed + 6)); R(x + 0.5, hh + 0.8, 0.2, 1 + H(i, seed + 7)); }         // 塔
      else if (k < 0.5) { R(x, 0, 2.2, hh * 0.7); c.beginPath(); c.arc(x + 1.1, Y(hh * 0.7), 1.1, 0, TAU); c.fill(); }                    // 貯槽
      else if (k < 0.7) { R(x, 0, 0.45, hh * 1.25); R(x - 0.12, hh * 1.25, 0.7, 0.18); }                                                  // 煙突
      else { R(x, 0, 2.6, hh * 0.55); R(x + 0.3, hh * 0.55, 2.0, 0.3); for (let q = 0; q < 3; q++) R(x + 0.5 + q * 0.7, hh * 0.55 + 0.3, 0.12, 0.6); }
    }
  });
}
STAGE_ART[4] = { build(B) {
  const p = B.pal, S = B.Sb;
  const towers = [6, 27.5, 48.5];
  const gears = [[15.5, 5.6, 5.4, 0.35], [19.4, 3.5, 3.0, -0.63], [38, 13.0, 4.6, -0.3], [41.3, 14.6, 2.6, 0.53], [58, 5.0, 3.8, 0.4]];
  const warn = []; towers.forEach((x) => { warn.push([x + 1.1, 4.5, 1.6], [x + 1.1, 13.7, 1.6], [x + 1.1, 9.1, 1.2]); });
  const vents = [[9, 3.6], [26, 2.9], [39.5, 3.9]];
  return {
    sky: { stops: [[0, '#020405'], [0.3, '#07100f'], [0.5, '#132420'], [0.68, '#1c3028'], [1, '#081210']],
      blots: [{ x: 18, y: 9, r: 15, c: '#4a6a50', a: 0.35 }, { x: 27, y: 9.6, r: 8, c: '#c8b060', a: 0.28 }],
      neb: [{ x: 12, y: 10, rx: 14, ry: 4, c: p.neb[0], a: 0.5 }, { x: 36, y: 8.5, rx: 13, ry: 3.5, c: p.neb[2], a: 0.3, sc: 0.6 }],
      dust: 0.5, stars: 0.35 },
    starA: 0.7,
    bodies: [{ x: 27, y: 9.6, size: 7, par: 0.02, add: true, make: () => glowSprite(7 * S * 0.5, '#d8c878', 0.12, 2.6) }],
    layers: [
      { t: 'strip', par: 0.08, k: 0.5, P: 64, y0: 0, y1: 8, rise: -9,
        paint(c) { c.fillStyle = mix(p.far, p.haze, 0.55); skyline(c, 64, 401, 2.2, 3.2); c.fillStyle = '#ffd890'; rep3(c, 64, () => { for (let i = 0; i < 90; i++) c.fillRect(H(i, 11) * 64, 0.8 + H(i, 12) * 3.2, 0.09, 0.07); }); atop(c, 8, 0, [[0, p.haze, 0.1], [1, '#5a8a70', 0.5]]); } },
      { t: 'strip', par: 0.08, k: 0.5, P: 64, y0: 10, y1: 18, rise: 9,
        paint(c) { c.fillStyle = mix(p.far, p.haze, 0.5); skyline(c, 64, 431, 2.0, 3.0, 18); c.fillStyle = '#ffd890'; rep3(c, 64, () => { for (let i = 0; i < 70; i++) c.fillRect(H(i, 13) * 64, 14.4 + H(i, 14) * 2.8, 0.09, 0.07); }); atop(c, 10, 18, [[0, p.haze, 0.1], [1, '#3a5a50', 0.45]]); } },
      { t: 'fog', y: 4.5, h: 9, w: 48, par: 0.1, drift: 0.15, a: 0.34, c: p.mist, kind: 1, fadeE: true },
      { t: 'strip', par: 0.2, k: 0.6, P: 64, y0: 0, y1: 18, fadeE: true,
        paint(c) {
          const all = () => {
            towers.forEach((x) => { truss(c, x, 0, 2.2, 18, 1.8, true); c.fillRect(x - 0.5, 4.0, 3.2, 0.4); c.fillRect(x - 0.5, 13.3, 3.2, 0.4); });
            truss(c, 0, 13.6, 64, 1.0, 1.5, false); truss(c, 0, 3.3, 64, 0.8, 1.4, false);
            // 配管の束
            for (const [y, w] of [[1.7, 0.5], [2.4, 0.3], [15.9, 0.45], [16.6, 0.3]]) { c.fillRect(0, y, 64, w); for (let x = 1; x < 64; x += 4.2) c.fillRect(x, y - 0.08, 0.25, w + 0.16); }
            for (let i = 0; i < 5; i++) { const x = 11 + i * 12.3; c.fillRect(x, 0, 0.4, 1.8); c.fillRect(x + 0.6, 16.3, 0.4, 1.8); }
            // 歯車の受け
            gears.forEach(([x, y, d]) => { c.fillRect(x - 0.3, y < 9 ? 0 : y, 0.6, y < 9 ? y : 18 - y); });
          };
          c.strokeStyle = mix(p.mist, p.far, 0.3);
          rep3(c, 64, () => { c.save(); c.translate(-0.05, 0.05); c.fillStyle = c.strokeStyle = mix(p.mist, p.far, 0.3); all(); c.restore(); c.fillStyle = c.strokeStyle = mix(p.far, '#060a0a', 0.35); all(); });
          atop(c, 18, 0, [[0, '#000000', 0.25], [0.5, p.haze, 0.22], [1, '#000000', 0.25]]);
        },
        init(B, L) { L.gear = gearSprite(S * 3.2, mix(p.far, '#0a1010', 0.15), mix(p.mist, p.far, 0.25)); L.lamp = glowSprite(S * 1.6, '#ff4a1a', 0.3, 1.8); },
        post(R, ctx, L, cam, now, F) {
          R.bgTiles(L, cam, (c, xa, xb) => {
            c.globalAlpha = F.e;
            for (const [x, y, d, sp] of gears) { if (x < xa - 4 || x > xb + 4) continue; c.save(); c.translate(x, y); c.rotate(now * sp); c.drawImage(L.gear, -d / 2, -d / 2, d, d); c.restore(); }
          });
          lamps(R, ctx, L, cam, now, warn, L.lamp, { blink: 2.2, duty: 0.3, a: F.e });
        } },
      { t: 'rays', c: '#d8c878', a: 0.12, slant: 0.7, seed: 13, n: 8, reach: 1.1, fadeE: true },
      { t: 'fog', y: 0, h: 5.5, w: 36, par: 0.3, drift: 0.5, a: 0.3, c: '#8aa898', kind: 0, fadeE: true },
      { t: 'parts', n: 36, c: '#c8e0d0', core: 0, s0: 0.05, s1: 0.14, par: 0.4, vx: -0.4, vy: 0.15, wob: 0.3, wf: 0.8, a: 0.4, tw: 2, y0: 0, y1: 18, fadeE: true },
      { t: 'parts', n: 24, c: '#ffb050', core: 0.6, s0: 0.06, s1: 0.16, par: 0.5, vx: -0.8, vy: -3.2, wob: 0.1, wf: 3, a: 1, tw: 9, y0: 0, y1: 18, add: true, fadeE: true },
      { t: 'strip', par: 0.5, k: 1, P: 48, y0: 0, y1: 5.2, rise: -7,
        paint(c) {
          const all = () => {
            ridge(c, 48, 0.9, 1.4, 441, 1 / 4, 2, { quant: 0.45, step: 0.5 });
            rrect(c, 3, 0.5, 4.2, 3.2, 0.8); c.fill(); c.fillRect(4.6, 3.6, 1.0, 0.6); c.fillRect(8.7, 0, 0.6, 3.6); c.fillRect(8.4, 3.5, 1.2, 0.35);
            c.fillRect(14, 1.9, 10, 0.7); c.fillRect(15, 0, 0.4, 2); c.fillRect(22.5, 0, 0.4, 2); c.beginPath(); c.arc(19, 2.9, 0.75, 0, TAU); c.fill();
            c.fillRect(25.4, 0, 1.2, 2.9); c.fillRect(25.1, 2.8, 1.8, 0.3);
            rrect(c, 29, 0.4, 6.2, 2.2, 0.3); c.fill(); for (let k = 0; k < 4; k++) c.fillRect(29.8 + k * 1.3, 2.6, 0.5, 0.9 + (k % 2) * 0.5);
            c.fillRect(39, 0, 0.7, 3.9); c.fillRect(38.7, 3.8, 1.3, 0.3); c.fillRect(42, 1.2, 5.4, 0.55); c.fillRect(42, 2.1, 5.4, 0.35); c.fillRect(44.4, 0, 0.5, 2.4);
          };
          rep3(c, 48, () => { c.save(); c.translate(-0.04, 0.06); c.fillStyle = '#b88440'; all(); c.restore(); c.fillStyle = '#070c0c'; all(); });
          atop(c, 5.2, 0, [[0, '#000000', 0], [1, '#3a5a48', 0.35]]);
        },
        init(B, L) { L.puff = puffSprite(S * 2, '#b8d0c4', 7); },
        post(R, ctx, L, cam, now) {
          R.bgTiles(L, cam, (c, xa, xb) => { for (let v = 0; v < vents.length; v++) { const [x, y] = vents[v]; if (x < xa - 4 || x > xb + 4) continue; const cyc = (now * 0.22 + v * 0.37) % 1; if (cyc > 0.6) continue;
            for (let i = 0; i < 6; i++) { const ph = (now * 0.55 + i / 6 + v * 0.3) % 1, s = 0.5 + ph * 2.4; c.globalAlpha = (1 - ph) * 0.4 * Math.min(1, (0.6 - cyc) * 8, cyc * 12); c.drawImage(L.puff, x - 0.35 * ph - s / 2 + 0.3, y + ph * 3.4 - s / 2, s, s); } } });
        } },
      { t: 'strip', par: 0.5, k: 1, P: 48, y0: 13, y1: 18, rise: 7, env: 'c',
        paint(c) {
          const all = () => {
            ridge(c, 48, 0.8, 1.3, 451, 1 / 4, 2, { quant: 0.45, step: 0.5, top: 18, bot: 19 });
            c.fillRect(4, 15.4, 9, 0.8); c.fillRect(5, 16.2, 0.4, 2); c.fillRect(11.5, 16.2, 0.4, 2); for (let k = 0; k < 5; k++) c.fillRect(5.2 + k * 1.5, 14.9, 0.7, 0.5);
            c.fillRect(18, 13.9, 0.5, 4.2); poly(c, [17.3, 13.9, 19.2, 13.9, 18.9, 13.3, 18.25, 13.6, 17.6, 13.3]); c.fill();
            rrect(c, 24, 15.2, 6, 2.4, 0.4); c.fill(); c.fillRect(26.5, 14.6, 1.0, 0.7);
            c.fillRect(34, 16.0, 12, 0.5); c.fillRect(34, 15.3, 12, 0.3); c.fillRect(37, 14.2, 0.45, 3.9); c.fillRect(43, 14.8, 0.45, 3.3);
          };
          rep3(c, 48, () => { c.save(); c.translate(-0.04, -0.06); c.fillStyle = '#6a5a38'; all(); c.restore(); c.fillStyle = '#070c0c'; all(); });
          c.lineWidth = 0.12; c.strokeStyle = '#070c0c'; rep3(c, 48, () => { for (let i = 0; i < 5; i++) { const x = 1 + i * 9.6; c.beginPath(); c.moveTo(x, 18); c.quadraticCurveTo(x + 3.2, 14.6 - H(i, 5), x + 6.4, 18); c.stroke(); } });
        } },
    ],
    front: [
      { t: 'strip', par: 1.5, k: 0.25, squash: 0.62, P: 64, y0: 0, y1: 2.5, rise: -3.5, env: 'f', a: 0.94,
        paint(c) { c.fillStyle = '#040707'; c.fillRect(-1, 0.3, 66, 0.9); rep3(c, 64, () => { for (let i = 0; i < 8; i++) { const x = 3 + i * 8; c.fillRect(x, 0, 0.9, 1.9); c.fillRect(x - 0.3, 1.8, 1.5, 0.25); if (i % 3 === 0) { c.fillRect(x + 2, 0, 3, 1.6 + H(i, 3)); } } }); atop(c, 2.5, 0, [[0, p.glow, 0.12], [0.5, p.glow, 0]]); } },
      { t: 'strip', par: 1.5, k: 0.25, squash: 0.62, P: 64, y0: 15.6, y1: 18, rise: 3.5, env: 'c', a: 0.94,
        paint(c) { c.fillStyle = '#040707'; c.strokeStyle = '#040707'; c.fillRect(-1, 17.2, 66, 1); c.lineWidth = 0.22; rep3(c, 64, () => { for (let i = 0; i < 6; i++) { const x = i * 10.7; c.beginPath(); c.moveTo(x, 17.6); c.quadraticCurveTo(x + 5.3, 14.6 + H(i, 9) * 1.4, x + 10.7, 17.6); c.stroke(); c.fillRect(x - 0.4, 16.4, 0.8, 1.6); } }); } },
      { t: 'parts', n: 8, c: '#ffc060', core: 0.7, s0: 0.1, s1: 0.2, par: 1.8, vx: -1.5, vy: -5, wob: 0.05, a: 0.9, tw: 11, y0: 0, y1: 18, add: true, fadeE: true },
    ],
    mood: { dark: '#020506', a: 0.48 }, streak: { c: '#d8f0e0', a: 0.18 },
  };
} };

// ===== 5: 生体要塞 — 脈打つ血管網、肋骨の列、漂う胞子 ==========================================
function veinNet(seed, n, P, steps = 14) {
  const out = [];
  const walk = (x, y, d, w, len, depth, id) => {
    const pts = [x, y];
    for (let k = 0; k < len; k++) {
      d += (H(id * 31 + k, seed) - 0.5) * 1.1; x += Math.cos(d) * 1.1; y += Math.sin(d) * 0.9; pts.push(x, y);
      if (depth < 2 && H(id * 17 + k, seed + 3) > 0.72) walk(x, y, d + (H(id + k, seed + 4) > 0.5 ? 0.9 : -0.9), w * 0.55, Math.round(len * 0.55), depth + 1, id * 7 + k + 1);
    }
    out.push({ pts, w });
  };
  for (let i = 0; i < n; i++) walk(H(i, seed + 1) * P, H(i, seed + 2) * 18, H(i, seed + 5) * TAU, 0.3 + H(i, seed + 6) * 0.25, steps, 0, i + 1);
  return out;
}
const pathOf = (c, pts) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) c.lineTo(pts[k], pts[k + 1]); };
// 鼓動（二拍）。ph は位相（ラジアン）
const beat = (ph) => { const a = Math.max(0, Math.sin(ph)), b = Math.max(0, Math.sin(ph - 0.9)); return a ** 8 + 0.6 * b ** 8; };
STAGE_ART[5] = { build(B) {
  const p = B.pal, S = B.Sb;
  const veins = veinNet(51, 9, 64);
  const pulse = B.stage.terrain.pulse ? B.stage.terrain.pulse[0].speed : 0.05;
  const pust = [];
  const stalk = (c, x, yb, h, lean, r, top) => {
    const Y = (y) => (top ? 18 - y : y);
    taper(c, (t) => x + lean * t * t, (t) => Y(yb + h * t), 8, r * 0.9, r * 0.45);
    c.beginPath(); c.ellipse(x + lean, Y(yb + h), r, r * 0.82, 0, 0, TAU); c.fill();
  };
  const polyps = (top, seed, out) => { const L = []; for (let i = 0; i < 15; i++) { const x = 1.5 + i * 3.2 + H(i, seed) * 1.6, h = 1.0 + H(i, seed + 1) * 2.6, lean = (H(i, seed + 2) - 0.5) * 1.4, r = 0.35 + H(i, seed + 3) * 0.5; L.push([x, h, lean, r]); if (out && H(i, seed + 4) > 0.45) out.push([x + lean, top ? 18 - 0.4 - h : 0.4 + h, r * 3.2]); } return L; };
  const pb = polyps(false, 71, pust), pt = polyps(true, 81, null);
  return {
    sky: { stops: [[0, '#060108'], [0.5, '#1a0612'], [1, '#2a0818']],
      blots: [{ x: 30, y: 7, r: 14, c: '#6a1420', a: 0.5 }],
      neb: [{ x: 12, y: 11, rx: 12, ry: 6, c: p.neb[0], a: 0.55, rot: 0.3 }, { x: 4, y: 5, rx: 9, ry: 5, c: p.neb[1], a: 0.6, sc: 0.6 }, { x: 20, y: 15, rx: 9, ry: 3, c: p.neb[2], a: 0.2, sc: 0.5 }],
      dust: 0.8, stars: 0.6 },
    bodies: [{ x: 6.5, y: 13.5, size: 4, par: 0.03, make: () => planetSprite(4 * S, { r: 0.6, base: ['#d8a090', '#6a2a3a', '#14060c'], tex: tint(B.com.cloudA, '#2a0a14'), texA: 0.6, cracks: p.glow, atmo: '#ff7a60', light: [0.7, -0.4], seed: 8 }) }],
    portal: { xa: 14, w: 2.8, shape: (y) => 1.5 * Math.sin(y * 0.62 + 0.4) + 0.7 * Math.sin(y * 1.7 + 1) + 0.25 * Math.sin(y * 4.1), c0: '#1c060c', c1: '#3c1220', rim: p.edge,
      deco(R, ctx, ex, sg, now) { ctx.fillStyle = '#8a5a5a'; for (let i = 0; i < 24; i++) { const y = 0.3 + i * 0.75, x = ex(y) + sg * 0.1; ctx.beginPath(); ctx.moveTo(x, y - 0.16); ctx.lineTo(x - sg * (0.3 + (i % 3) * 0.12), y); ctx.lineTo(x, y + 0.16); ctx.closePath(); ctx.fill(); } } },
    layers: [
      { t: 'strip', inside: true, par: 0.1, k: 0.5, P: 64, y0: 0, y1: 18,
        paint(c) {
          const g = c.createLinearGradient(0, 0, 0, 18); g.addColorStop(0, '#42101e'); g.addColorStop(0.3, '#1c0610'); g.addColorStop(0.5, '#12040a'); g.addColorStop(0.7, '#1c0610'); g.addColorStop(1, '#42101e'); c.fillStyle = g; c.fillRect(0, 0, 64, 18);
          const t1 = tint(B.com.cloudA, '#5a1828'), t2 = tint(B.com.cloudC, '#0a0206'), t3 = tint(B.com.cloudB, '#3a1238');
          c.globalAlpha = 0.5; for (let x = 0; x < 64; x += 16) c.drawImage(t1, x, 1, 16, 16); c.globalAlpha = 0.65; for (let x = 0; x < 64; x += 32) c.drawImage(t2, x, -7, 32, 32); c.globalAlpha = 0.4; for (let x = 0; x < 64; x += 16) c.drawImage(t3, x, 2, 16, 14); c.globalAlpha = 1;
          rep3(c, 64, () => {
            for (let i = 0; i < 16; i++) {       // 筋の束
              const x = H(i, 3) * 64, y = H(i, 4) * 18, w = 6 + H(i, 5) * 9; c.strokeStyle = rgba(i % 2 ? '#5a1c2c' : '#08020a', 0.3); c.lineWidth = 0.25 + H(i, 6) * 0.5;
              c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + w * 0.3, y + 3 * (H(i, 7) - 0.5) * 2, x + w * 0.7, y - 3 * (H(i, 8) - 0.5) * 2, x + w, y + (H(i, 9) - 0.5) * 3); c.stroke();
            }
            for (let i = 0; i < 20; i++) { const x = H(i, 13) * 64, y = H(i, 14) * 18, r = 1 + H(i, 15) * 2.4; const rg = c.createRadialGradient(x - r * 0.3, y + r * 0.3, 0, x, y, r); rg.addColorStop(0, 'rgba(120,40,56,0.34)'); rg.addColorStop(0.7, 'rgba(60,16,30,0.1)'); rg.addColorStop(1, 'rgba(6,0,4,0.3)'); c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
            for (const v of veins) { c.strokeStyle = 'rgba(8,2,10,0.5)'; c.lineWidth = v.w * 1.5; pathOf(c, v.pts); c.stroke(); c.strokeStyle = '#261232'; c.lineWidth = v.w; c.stroke(); c.save(); c.translate(0, v.w * 0.22); c.strokeStyle = 'rgba(96,64,112,0.32)'; c.lineWidth = v.w * 0.22; pathOf(c, v.pts); c.stroke(); c.restore(); }
          });
        },
        paintEmis(c) { rep3(c, 64, () => { for (const v of veins) { c.strokeStyle = rgba('#c84a08', 0.09); c.lineWidth = v.w * 1.6; pathOf(c, v.pts); c.stroke(); c.strokeStyle = rgba('#ff9a20', 0.34); c.lineWidth = v.w * 0.24; c.stroke(); const g = c.createRadialGradient(v.pts[0], v.pts[1], 0, v.pts[0], v.pts[1], 1.2); g.addColorStop(0, rgba(p.glow, 0.5)); g.addColorStop(1, rgba(p.glow, 0)); c.fillStyle = g; c.fillRect(v.pts[0] - 1.2, v.pts[1] - 1.2, 2.4, 2.4); } }); },
        post(R, ctx, L, cam, now, F) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.12 + 0.55 * beat(F.tick * pulse); R.bgStrip(L, cam, L.emis, F); } },
      { t: 'strip', inside: true, par: 0.26, k: 0.6, P: 64, y0: 0, y1: 18,
        paint(c) {
          const bone = (dx, dy, col) => { c.fillStyle = col; rep3(c, 64, () => { for (let i = 0; i < 6; i++) { const x = 4 + i * 10.6 + dx, h = 6.2 + H(i, 21) * 1.4, bow = 3 + H(i, 22) * 1.6;
            taper(c, (t) => x + bow * Math.sin(t * 2.2) + t * 1.4, (t) => 18 + dy - h * t, 16, 1.5, 0.22); taper(c, (t) => x + 0.8 + bow * Math.sin(t * 2.2) + t * 1.4, (t) => dy + h * t, 16, 1.5, 0.22); } }); };
          // 肋骨の間に張る膜
          rep3(c, 64, () => { for (let i = 0; i < 6; i++) { const x = 4 + i * 10.6; for (const top of [0, 1]) { const Y = (y) => (top ? 18 - y : y); const g = c.createLinearGradient(0, Y(0), 0, Y(4.4)); g.addColorStop(0, 'rgba(110,34,50,0.75)'); g.addColorStop(1, 'rgba(110,34,50,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(x, Y(0)); c.quadraticCurveTo(x + 5.3, Y(7.5), x + 10.6, Y(0)); c.closePath(); c.fill(); } } });
          bone(0.1, 0.07, '#d8aaa0'); bone(0, 0, mix('#b8948c', p.far, 0.5));
          atop(c, 18, 0, [[0, '#2a0a14', 0.25], [0.5, '#0c0206', 0.45], [1, '#2a0a14', 0.25]]);
          grit(c, B, 64, 0, 18, '#12040a', 0.3);
        } },
      { t: 'fog', inside: true, y: 0, h: 6, w: 40, par: 0.3, drift: 0.3, a: 0.34, c: p.mist, kind: 1, breath: 1.5 },
      { t: 'fog', inside: true, y: 12, h: 6, w: 44, par: 0.33, drift: -0.25, a: 0.3, c: p.mist, kind: 0, peak: 0.5, breath: 1.2 },
      { t: 'parts', inside: true, n: 46, c: '#ffd9a0', core: 0.15, fall: 1.6, s0: 0.08, s1: 0.34, par: 0.4, vx: -0.25, vy: 0.14, wob: 0.7, wf: 0.6, a: 0.75, tw: 1.6, y0: 0, y1: 18, add: true },
      { t: 'strip', inside: true, par: 0.55, k: 1, P: 48, y0: 0, y1: 4.6,
        paint(c) { const all = () => { ridge(c, 48, 0.4, 0.9, 541, 1 / 4, 3); pb.forEach(([x, h, lean, r]) => stalk(c, x, 0.3, h, lean, r, false)); };
          rep3(c, 48, () => { c.save(); c.translate(-0.05, 0.06); c.fillStyle = '#a04a50'; all(); c.restore(); c.fillStyle = '#16040a'; all(); c.fillStyle = rgba(p.glow, 0.85); pust.forEach(([x, y, s]) => { c.beginPath(); c.arc(x, y, s * 0.09, 0, TAU); c.fill(); }); }); },
        init(B, L) { L.glow = glowSprite(S * 1.6, p.glow, 0.2, 1.8); },
        post(R, ctx, L, cam, now, F) { const b = 0.3 + 0.7 * beat(F.tick * pulse - 0.5); ctx.globalCompositeOperation = 'lighter'; R.bgTiles(L, cam, (c, xa, xb) => { c.globalAlpha = b; for (const q of pust) { if (q[0] < xa - 2 || q[0] > xb + 2) continue; c.drawImage(L.glow, q[0] - q[2] / 2, q[1] - q[2] / 2, q[2], q[2]); } }); } },
      { t: 'strip', inside: true, par: 0.55, k: 1, P: 48, y0: 13.4, y1: 18,
        paint(c) { const all = () => { ridge(c, 48, 0.4, 0.9, 551, 1 / 4, 3, { top: 18, bot: 19 }); pt.forEach(([x, h, lean, r]) => stalk(c, x, 0.3, h, lean, r, true)); };
          rep3(c, 48, () => { c.save(); c.translate(-0.05, -0.06); c.fillStyle = '#7a3440'; all(); c.restore(); c.fillStyle = '#16040a'; all(); }); } },
    ],
    front: [
      { t: 'strip', inside: true, par: 1.5, k: 0.25, squash: 0.62, P: 64, y0: 0, y1: 2.5, a: 0.94,
        paint(c) { c.fillStyle = '#0c0206'; ridge(c, 64, 0.2, 0.8, 561, 1 / 4, 3); rep3(c, 64, () => { for (let i = 0; i < 9; i++) { const x = 3 + i * 7.1 + H(i, 91) * 3; taper(c, (t) => x + Math.sin(t * 3) * 0.8, (t) => t * (1.3 + H(i, 92)), 8, 1.1, 0.15); } }); } },
      { t: 'strip', inside: true, par: 1.5, k: 0.25, squash: 0.62, P: 64, y0: 15.6, y1: 18, a: 0.94,
        paint(c) { c.fillStyle = '#0c0206'; ridge(c, 64, 0.2, 0.8, 571, 1 / 4, 3, { top: 18, bot: 19 }); rep3(c, 64, () => { for (let i = 0; i < 9; i++) { const x = 1 + i * 7.1 + H(i, 93) * 3; taper(c, (t) => x + Math.sin(t * 3 + 1) * 0.7, (t) => 18 - t * (1.2 + H(i, 94)), 8, 1.0, 0.15); } }); } },
      { t: 'parts', inside: true, n: 9, c: '#ffe0b0', core: 0.1, fall: 1.4, s0: 0.3, s1: 0.8, par: 1.8, vx: -0.4, vy: 0.2, wob: 0.6, wf: 0.5, a: 0.26, tw: 1.2, y0: 0, y1: 18, add: true },
    ],
    mood: { dark: '#0a0206', a: 0.4 }, streak: { c: '#ffd8c0', a: 0.14 },
  };
} };

// ===== 6: 細胞空間 — 浮遊する細胞・核・繊毛、屈折する泡、光の網 ====================================
function cell(c, x, y, r, seed, col, a) {
  const g = c.createRadialGradient(x - r * 0.25, y + r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, rgba(col.hi, 0.34 * a)); g.addColorStop(0.7, rgba(col.mid, 0.22 * a)); g.addColorStop(0.94, rgba(col.mid, 0.34 * a)); g.addColorStop(1, rgba(col.hi, 0.0));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  if (H(seed, 1) > 0.55) { c.strokeStyle = rgba(col.hi, 0.4 * a); c.lineWidth = Math.max(0.03, r * 0.025); c.beginPath(); for (let k = 0; k < 36; k++) { const an = k / 36 * TAU + H(seed, 2); c.moveTo(x + Math.cos(an) * r * 0.97, y + Math.sin(an) * r * 0.97); c.lineTo(x + Math.cos(an + 0.12) * r * (1.1 + H(seed + k, 3) * 0.14), y + Math.sin(an + 0.12) * r * (1.1 + H(seed + k, 3) * 0.14)); } c.stroke(); }
  c.strokeStyle = rgba(col.hi, 0.6 * a); c.lineWidth = r * 0.045; c.beginPath(); c.arc(x, y, r * 0.96, 0, TAU); c.stroke();
  c.strokeStyle = rgba(col.lo, 0.5 * a); c.lineWidth = r * 0.03; c.beginPath(); c.arc(x, y, r * 0.88, 0, TAU); c.stroke();
  for (let k = 0; k < 7; k++) { const an = H(seed + k, 4) * TAU, d = r * (0.3 + H(seed + k, 5) * 0.45), rr = r * (0.05 + H(seed + k, 6) * 0.09); c.fillStyle = rgba(k % 2 ? col.hi : col.lo, 0.3 * a); c.beginPath(); c.ellipse(x + Math.cos(an) * d, y + Math.sin(an) * d, rr * 1.6, rr, an, 0, TAU); c.fill(); }
  const nx = x + (H(seed, 7) - 0.5) * r * 0.4, ny = y + (H(seed, 8) - 0.5) * r * 0.4;
  c.fillStyle = rgba(col.lo, 0.7 * a); c.beginPath(); c.arc(nx, ny, r * 0.3, 0, TAU); c.fill();
  c.strokeStyle = rgba(col.hi, 0.35 * a); c.lineWidth = r * 0.025; c.stroke();
  c.fillStyle = rgba(col.hi, 0.5 * a); c.beginPath(); c.arc(nx - r * 0.06, ny + r * 0.07, r * 0.11, 0, TAU); c.fill();
  c.strokeStyle = rgba('#ffffff', 0.25 * a); c.lineWidth = r * 0.04; c.beginPath(); c.arc(x, y, r * 0.78, 1.9, 2.8); c.stroke();
  return [nx, ny];
}
STAGE_ART[6] = { build(B) {
  const p = B.pal, S = B.Sb;
  const cellsA = [], cellsB = [], nuc = [];
  for (let i = 0; i < 16; i++) cellsA.push([2 + i * 4 + H(i, 3) * 2.5, 1.5 + H(i, 4) * 15, 0.9 + H(i, 5) ** 2 * 2.2]);
  for (let i = 0; i < 9; i++) cellsB.push([3.5 + i * 7.1 + H(i, 6) * 3, i % 2 ? 1.2 + H(i, 7) * 4.5 : 12.3 + H(i, 7) * 4.5, 1.5 + H(i, 8) * 2.0]);
  const frond = (c, x, n, h, top, seed) => { for (let k = 0; k < n; k++) { const sp = (k - (n - 1) / 2) / n, hh = h * (0.6 + H(seed + k, 1) * 0.5), cv = sp * 2.2 + (H(seed + k, 2) - 0.5) * 0.8; taper(c, (t) => x + sp * 0.8 + cv * t * t + Math.sin(t * 5 + k) * 0.08, (t) => (top ? 18 - hh * t : hh * t), 8, 0.3, 0.05); } };
  return {
    sky: { stops: [[0, '#010807'], [0.5, '#04201a'], [1, '#062c22']],
      blots: [{ x: 12, y: 10, r: 14, c: '#0e5a48', a: 0.45 }],
      neb: [{ x: 10, y: 12, rx: 12, ry: 6, c: p.neb[0], a: 0.6, rot: 0.2 }, { x: 32, y: 8, rx: 13, ry: 6, c: p.neb[1], a: 0.5, sc: 0.6, rot: -0.2 }, { x: 22, y: 14, rx: 10, ry: 3, c: p.neb[2], a: 0.14, sc: 0.5 }],
      dust: 0.9, stars: 0.7 },
    bodies: [
      { x: 6.5, y: 11.5, size: 9, par: 0.03, make: () => planetSprite(9 * S * 0.75, { r: 0.42, base: ['#d0ffe8', '#2a9a78', '#03201a'], tex: tint(B.com.cloudA, '#0a4a3a'), texA: 0.5, bands: true, bandTilt: 0.25, ring: { c: '#9af0d0', c2: '#f0fff8', rIn: 1.3, rOut: 2.1, a: 0.5, tilt: 0.25 }, atmo: '#6affc8', light: [0.6, -0.5] }) },
      { x: 35.5, y: 12.5, size: 6, par: 0.03, make: () => planetSprite(6 * S * 0.75, { r: 0.6, base: ['#c8f0ff', '#2a6a8a', '#04141e'], tex: tint(B.com.cloudB, '#0a2a3a'), texA: 0.5, craters: 8, atmo: '#6ac8f0', light: [-0.6, -0.5] }) },
    ],
    portal: { xa: 14, xb: 452, w: 2.6, shape: (y) => 1.8 * Math.sin(y * 0.55 + 1) + 0.6 * Math.sin(y * 1.6), c0: '#04201a', c1: '#0c4636', rim: p.edge,
      deco(R, ctx, ex, sg, now) { ctx.strokeStyle = rgba(p.edge, 0.5); ctx.lineWidth = 0.05; ctx.beginPath(); for (let i = 0; i < 40; i++) { const y = i * 0.46, x = ex(y) + sg * 2.6; ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sg * 0.5, y + 0.3 * Math.sin(now * 2 + i), x + sg * (0.8 + (i % 3) * 0.25), y + 0.4 * Math.sin(now * 2 + i)); } ctx.stroke(); } },
    layers: [
      { t: 'strip', inside: true, par: 0.06, k: 0.33, P: 64, y0: 0, y1: 18,
        paint(c) {
          const g = c.createLinearGradient(0, 0, 0, 18); g.addColorStop(0, '#02100c'); g.addColorStop(0.35, '#083228'); g.addColorStop(0.55, '#0a3a2e'); g.addColorStop(0.8, '#062a22'); g.addColorStop(1, '#03140f'); c.fillStyle = g; c.fillRect(0, 0, 64, 18);
          const t1 = tint(B.com.cloudA, '#16705a'), t2 = tint(B.com.cloudC, '#010a08');
          c.globalAlpha = 0.4; for (let x = 0; x < 64; x += 32) c.drawImage(t1, x, -7, 32, 32); c.globalAlpha = 0.55; for (let x = 0; x < 64; x += 16) c.drawImage(t2, x, 1, 16, 16); c.globalAlpha = 1;
          rep3(c, 64, () => { for (let i = 0; i < 60; i++) { const x = H(i, 31) * 64, y = H(i, 32) * 18, r = 0.4 + H(i, 33) ** 2 * 2.2; c.fillStyle = rgba('#3ab090', 0.05 + H(i, 34) * 0.07); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.strokeStyle = rgba('#7adcae', 0.1); c.lineWidth = 0.06; c.stroke(); } });
        } },
      // 光の網（コースティクス）: 継ぎ目のない網目の絵 2 枚を、逆向きに流しながら重ねる
      { t: 'hook', inside: true,
        init(B, L) { L.c1 = tint(cellCanvas(256, 61, 5, 0.42, 2.0), '#8affd8'); L.c2 = tint(cellCanvas(256, 67, 4, 0.36, 2.4), '#5ad8ff'); },
        draw(R, ctx, cam, now, F, L) {
          const S = R.S; ctx.globalCompositeOperation = 'lighter';
          const lay = (img, w, h, ox, oy, a) => {
            ctx.globalAlpha = a; ox = ((ox % w) + w) % w; oy = ((oy % h) + h) % h;
            // 画素の境目に合わせて並べる（加算なので重なりも隙間も線になって見える）
            for (let y = -oy; y < VIEW_H; y += h) { const y0 = Math.round(y * S), y1 = Math.round((y + h) * S); for (let x = -ox; x < VIEW_W; x += w) { const x0 = Math.round(x * S), x1 = Math.round((x + w) * S); ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0); } }
          };
          lay(L.c1, 11, 6.6, cam * 0.1 + now * 0.35, now * 0.12, 0.1 + 0.03 * Math.sin(now * 0.9));
          if (!F.lite) lay(L.c2, 15, 8.6, cam * 0.14 - now * 0.22, -now * 0.17, 0.075);
        } },
      { t: 'strip', inside: true, par: 0.16, k: 0.5, P: 64, y0: -1, y1: 19, bob: [0.3, 0.45, 0],
        paint(c) { rep3(c, 64, () => cellsA.forEach(([x, y, r], i) => cell(c, x, y, r, i * 13 + 5, { hi: '#7adcae', mid: '#1c7a60', lo: '#052a20' }, 0.75))); } },
      { t: 'strip', inside: true, par: 0.32, k: 0.75, P: 64, y0: -1, y1: 19, bob: [0.4, 0.38, 2],
        paint(c) {
          rep3(c, 64, () => {
            cellsB.forEach(([x, y, r], i) => cell(c, x, y, r, i * 29 + 7, { hi: '#a8f0d0', mid: '#2a8a6a', lo: '#04261c' }, 1.0));
            for (let i = 0; i < 7; i++) { let x = 6 + i * 8.6, y = 6 + H(i, 41) * 6, d = H(i, 42) * TAU; for (let k = 0; k < 6; k++) { cell(c, x, y, 0.28, i * 7 + k, { hi: '#c8ffe8', mid: '#3ab090', lo: '#063a2c' }, 0.8); d += (H(i * 9 + k, 43) - 0.5) * 1.2; x += Math.cos(d) * 0.55; y += Math.sin(d) * 0.55; } }
          });
        },
        init(B, L) { L.glow = glowSprite(S * 2, p.glow, 0.1, 1.8); cellsB.forEach(([x, y, r], i) => nuc.push([x + (H(i * 29 + 7, 7) - 0.5) * r * 0.4, y + (H(i * 29 + 7, 8) - 0.5) * r * 0.4, r * 1.4])); },
        post(R, ctx, L, cam, now) { lamps(R, ctx, L, cam, now, nuc, L.glow, { speed: 1.2, a: 0.5 }); } },
      { t: 'parts', inside: true, n: 60, c: '#b8ffe0', core: 0.3, s0: 0.04, s1: 0.14, par: 0.35, vx: -0.2, vy: 0.1, wob: 0.5, wf: 0.8, a: 0.7, tw: 2.5, y0: 0, y1: 18, add: true },
      { t: 'parts', inside: true, n: 34, sprite: (B) => bubbleSprite(B.Sb * 0.8, '#c8ffe8'), s0: 0.12, s1: 0.7, par: 0.45, vx: -0.1, vy: 0.9, wob: 0.3, wf: 1.3, a: 0.8, y0: -1, y1: 19 },
      { t: 'strip', inside: true, par: 0.6, k: 1, P: 48, y0: 0, y1: 4.2,
        paint(c) { const all = () => { ridge(c, 48, 0.3, 0.7, 641, 1 / 4, 3); for (let i = 0; i < 12; i++) frond(c, 2 + i * 4 + H(i, 51) * 2, 5 + (i % 3) * 2, 1.6 + H(i, 52) * 2.2, false, i * 11); };
          rep3(c, 48, () => { c.save(); c.translate(-0.04, 0.05); c.fillStyle = '#3ab090'; all(); c.restore(); c.fillStyle = '#03140f'; all(); }); } },
      { t: 'strip', inside: true, par: 0.6, k: 1, P: 48, y0: 13.8, y1: 18,
        paint(c) { const all = () => { ridge(c, 48, 0.3, 0.7, 651, 1 / 4, 3, { top: 18, bot: 19 }); for (let i = 0; i < 12; i++) frond(c, 4 + i * 4 + H(i, 53) * 2, 5 + (i % 3) * 2, 1.4 + H(i, 54) * 2.2, true, i * 13 + 3); };
          rep3(c, 48, () => { c.save(); c.translate(-0.04, -0.05); c.fillStyle = '#2a8a6a'; all(); c.restore(); c.fillStyle = '#03140f'; all(); }); } },
    ],
    front: [
      { t: 'strip', inside: true, par: 1.5, k: 0.25, squash: 0.62, P: 64, y0: 0, y1: 2.5, a: 0.92,
        paint(c) { c.fillStyle = '#020c09'; ridge(c, 64, 0.2, 0.6, 661, 1 / 4, 3); rep3(c, 64, () => { for (let i = 0; i < 10; i++) frond(c, 3 + i * 6.4, 7, 1.4 + H(i, 95) * 0.9, false, i * 17); }); } },
      { t: 'strip', inside: true, par: 1.5, k: 0.25, squash: 0.62, P: 64, y0: 15.6, y1: 18, a: 0.92,
        paint(c) { c.fillStyle = '#020c09'; ridge(c, 64, 0.2, 0.6, 671, 1 / 4, 3, { top: 18, bot: 19 }); rep3(c, 64, () => { for (let i = 0; i < 10; i++) frond(c, 6 + i * 6.4, 7, 1.3 + H(i, 96) * 0.9, true, i * 19); }); } },
      { t: 'parts', inside: true, n: 7, sprite: (B) => bubbleSprite(B.Sb * 1.2, '#c8ffe8'), s0: 0.6, s1: 1.3, par: 1.7, vx: -0.2, vy: 1.4, wob: 0.4, wf: 1, a: 0.32, y0: -2, y1: 20 },
    ],
    mood: { dark: '#010806', a: 0.42 }, streak: { c: '#c8ffe8', a: 0.14 },
  };
} };

// ===== 7: 機械要塞 — 内壁のパネル・配線・走る光・巨大な換気扇・遠くの砲列 ===========================
function fanSprite(px, col, rim) {
  px = Math.round(px); const cv = canvas(px, px), c = cv.getContext('2d'), r = px / 2;
  for (let k = 0; k < 6; k++) {
    c.save(); c.translate(r, r); c.rotate(k / 6 * TAU);
    c.beginPath(); c.moveTo(r * 0.14, -r * 0.05); c.quadraticCurveTo(r * 0.55, -r * 0.42, r * 0.94, -r * 0.2); c.lineTo(r * 0.94, r * 0.12); c.quadraticCurveTo(r * 0.5, r * 0.02, r * 0.14, r * 0.08); c.closePath();
    c.fillStyle = col; c.fill(); c.strokeStyle = rim; c.lineWidth = px * 0.012; c.beginPath(); c.moveTo(r * 0.14, -r * 0.05); c.quadraticCurveTo(r * 0.55, -r * 0.42, r * 0.94, -r * 0.2); c.stroke();
    c.restore();
  }
  c.fillStyle = col; c.beginPath(); c.arc(r, r, r * 0.2, 0, TAU); c.fill(); c.strokeStyle = rim; c.lineWidth = px * 0.015; c.stroke();
  return cv;
}
STAGE_ART[7] = { build(B) {
  const p = B.pal, S = B.Sb;
  const fans = [[16, 9, 3.4, 1.1], [48, 9, 3.4, -0.9]];
  const pyl = [4, 20, 36, 52];
  const guns = []; const status = [];
  for (let i = 0; i < 8; i++) { const x = 8.5 + i * 8 + (i % 2) * 1.2, top = i % 2; guns.push([x, top]); status.push([x - 0.2, top ? 14.1 : 3.9, 0.7]); }
  pyl.forEach((x) => { status.push([x + 0.8, 9, 0.9]); });
  return {
    sky: { stops: [[0, '#010206'], [0.5, '#050a1a'], [1, '#0a1630']],
      blots: [{ x: 6, y: 3, r: 14, c: '#1c3a80', a: 0.5 }],
      neb: [{ x: 10, y: 13, rx: 12, ry: 5, c: p.neb[0], a: 0.6, rot: -0.2 }, { x: 4, y: 8, rx: 9, ry: 5, c: p.neb[1], a: 0.5, sc: 0.6 }, { x: 16, y: 15, rx: 9, ry: 2.6, c: p.neb[2], a: 0.16, sc: 0.5 }],
      dust: 1.2, stars: 1 },
    bodies: [
      { x: 6, y: 1.0, size: 18, par: 0.02, make: () => planetSprite(18 * S * 0.5, { r: 0.74, base: ['#b8dcff', '#2a4f94', '#050a1c'], tex: tint(B.com.cloudA, '#e8f4ff'), tex2: tint(B.com.cloudB, '#0a1c40'), texA: 0.4, atmo: '#6ab4ff', light: [0.55, -0.6] }) },
      { x: 4.2, y: 14.6, size: 1.6, par: 0.04, make: () => planetSprite(1.6 * S, { r: 0.7, base: ['#e8f0ff', '#7888a8', '#10141e'], craters: 8, light: [0.55, -0.6] }) },
    ],
    portal: { xa: 9, w: 3.2, shape: (y) => { const d = Math.abs(y - 9); return d < 3 ? 0 : d < 6 ? (d - 3) * 0.9 : 2.7 + (d - 6) * 0.15; }, c0: '#080c18', c1: '#1a2440', rim: p.edge,
      deco(R, ctx, ex, sg, now) { for (let i = 0; i < 9; i++) { const y = 1 + i * 2, x = ex(y) + sg * 1.6; ctx.fillStyle = '#04060c'; ctx.fillRect(x - 0.5, y - 0.35, 1, 0.7); ctx.fillStyle = rgba(i % 2 ? '#ffb040' : p.glow, Math.sin(now * 4 - i * 0.8) > 0 ? 0.95 : 0.2); ctx.fillRect(x - 0.34, y - 0.2, 0.68, 0.4); } } },
    layers: [
      { t: 'strip', inside: true, par: 0.1, k: 0.5, P: 64, y0: 0, y1: 18,
        paint(c) {
          const g = c.createLinearGradient(0, 0, 0, 18); g.addColorStop(0, '#182240'); g.addColorStop(0.32, '#0c1226'); g.addColorStop(0.5, '#070b18'); g.addColorStop(0.68, '#0c1226'); g.addColorStop(1, '#182240'); c.fillStyle = g; c.fillRect(0, 0, 64, 18);
          const t1 = tint(B.com.cloudA, '#000208'); c.globalAlpha = 0.5; for (let x = 0; x < 64; x += 16) c.drawImage(t1, x, 1, 16, 16); c.globalAlpha = 1;
          // 装甲パネル（上下の帯）と中央の凹んだ帯
          for (const [y0, hh] of [[0, 3], [3, 2.6], [12.4, 2.6], [15, 3]]) for (let i = 0; i < 16; i++) {
            const x = i * 4 + ((y0 * 10) % 3), w = 4, k = H(i + y0 * 7, 3);
            c.fillStyle = rgba(k > 0.5 ? '#8898ba' : '#000000', 0.04 + H(i, 4 + y0) * 0.08); c.fillRect(x + 0.06, y0 + 0.06, w - 0.12, hh - 0.12);
            bevel(c, x + 0.06, y0 + 0.06, w - 0.12, hh - 0.12, 'rgba(136,152,186,0.3)', 'rgba(0,0,0,0.5)', 0.07);
            if (k > 0.7) for (let s = 0; s < 4; s++) { c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x + 0.8, y0 + 0.6 + s * 0.35, w - 1.6, 0.16); }
            else if (k < 0.2) { c.fillStyle = 'rgba(232,176,48,0.3)'; for (let s = 0; s < 5; s++) poly(c, [x + 0.7 + s * 0.55, y0 + 0.5, x + 0.95 + s * 0.55, y0 + 0.5, x + 1.25 + s * 0.55, y0 + 1.0, x + 1.0 + s * 0.55, y0 + 1.0]), c.fill(); }
          }
          c.fillStyle = 'rgba(0,0,0,0.42)'; c.fillRect(0, 6.4, 64, 5.2);
          for (let x = 0; x < 64; x += 2) { c.fillStyle = 'rgba(136,152,186,0.12)'; c.fillRect(x, 6.4, 0.12, 5.2); c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x + 0.12, 6.4, 0.1, 5.2); }
          // 配線の溝
          for (const y of [5.75, 11.85]) { c.fillStyle = '#04060c'; c.fillRect(0, y, 64, 0.5); c.fillStyle = 'rgba(136,152,186,0.4)'; c.fillRect(0, y + 0.5, 64, 0.06); for (let k = 0; k < 3; k++) { c.fillStyle = k === 1 ? 'rgba(74,176,255,0.3)' : 'rgba(136,152,186,0.3)'; c.fillRect(0, y + 0.08 + k * 0.14, 64, 0.06); } for (let x = 1; x < 64; x += 3.2) { c.fillStyle = '#1c2640'; c.fillRect(x, y - 0.08, 0.3, 0.66); } }
          // 換気扇の枠
          fans.forEach(([x, y, r]) => {
            c.fillStyle = '#1c2844'; c.beginPath(); c.arc(x, y, r + 0.55, 0, TAU); c.fill(); c.strokeStyle = 'rgba(136,170,220,0.5)'; c.lineWidth = 0.1; c.stroke();
            const rg = c.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, '#5aa8e8'); rg.addColorStop(0.5, '#1c4a88'); rg.addColorStop(1, '#060c1c'); c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
            c.strokeStyle = '#04060c'; c.lineWidth = 0.16; c.stroke();
            for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; c.fillStyle = '#8898ba'; c.beginPath(); c.arc(x + Math.cos(a) * (r + 0.3), y + Math.sin(a) * (r + 0.3), 0.09, 0, TAU); c.fill(); }
          });
          // 小さな窓の灯
          for (let i = 0; i < 70; i++) { c.fillStyle = rgba(i % 5 ? '#4ab0ff' : '#ffb040', 0.5); c.fillRect(H(i, 21) * 64, H(i, 22) > 0.5 ? 0.6 + H(i, 23) * 4.6 : 12.8 + H(i, 23) * 4.6, 0.16, 0.08); }
        },
        init(B, L) { L.blade = fanSprite(S * 3.4 * 0.75, '#060a14', 'rgba(120,170,230,0.6)'); L.dot = glowSprite(S * 0.9, p.glow, 0.5, 2); L.glow = glowSprite(S * 4, '#4ab0ff', 0.05, 1.5); },
        post(R, ctx, L, cam, now) {
          R.bgTiles(L, cam, (c, xa, xb) => {
            for (const [x, y, r, sp] of fans) {
              if (x < xa - 5 || x > xb + 5) continue;
              c.save(); c.translate(x, y); c.rotate(now * sp); c.drawImage(L.blade, -r, -r, r * 2, r * 2); c.restore();
              c.strokeStyle = '#0a1020'; c.lineWidth = 0.14; c.beginPath(); c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); c.stroke();
              c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.3 + 0.08 * Math.sin(now * 3 + x); c.drawImage(L.glow, x - r * 1.5, y - r * 1.5, r * 3, r * 3); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
            }
            // 溝を走る光
            c.globalCompositeOperation = 'lighter';
            for (let k = 0; k < 2; k++) for (let i = 0; i < 8; i++) { const x = ((now * (k ? -4.5 : 6) + i * 8) % 64 + 64) % 64; if (x < xa - 2 || x > xb + 2) continue; const y = k ? 12.1 : 6.0; c.globalAlpha = 0.8; c.drawImage(L.dot, x - 0.3, y - 0.3, 0.6, 0.6); c.globalAlpha = 0.4; c.drawImage(L.dot, x - (k ? -0.5 : 0.5) - 0.25, y - 0.25, 0.5, 0.5); c.globalAlpha = 0.18; c.drawImage(L.dot, x - (k ? -1.0 : 1.0) - 0.22, y - 0.22, 0.44, 0.44); }
            c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
          });
        } },
      { t: 'fog', inside: true, y: 4, h: 10, w: 48, par: 0.15, drift: 0.2, a: 0.22, c: p.mist, kind: 1 },
      { t: 'strip', inside: true, par: 0.25, k: 0.6, P: 64, y0: 0, y1: 18,
        paint(c) {
          const all = () => {
            pyl.forEach((x) => {
              c.beginPath(); c.rect(x, 0, 1.7, 18); for (let y = 1.4; y < 17; y += 2.2) { c.moveTo(x + 0.45, y); c.lineTo(x + 0.45, y + 1.3); c.lineTo(x + 1.25, y + 1.3); c.lineTo(x + 1.25, y); c.closePath(); } c.fill('evenodd');
              poly(c, [x - 1.6, 0, x + 3.3, 0, x + 1.7, 2.6, x, 2.6]); c.fill(); poly(c, [x - 1.6, 18, x + 3.3, 18, x + 1.7, 15.4, x, 15.4]); c.fill();
            });
            c.fillRect(0, 3.3, 64, 0.22); c.fillRect(0, 14.5, 64, 0.22);
            for (let x = 0.4; x < 64; x += 1.6) { c.fillRect(x, 3.5, 0.07, 0.6); c.fillRect(x, 13.9, 0.07, 0.6); } c.fillRect(0, 4.05, 64, 0.07); c.fillRect(0, 13.86, 64, 0.07);
            // 砲列
            guns.forEach(([x, top]) => { const Y = (y) => (top ? 18 - y : y), sg = top ? -1 : 1;
              c.fillRect(x - 0.9, top ? 14.72 : 2.5, 1.8, 0.8); c.beginPath(); c.arc(x, Y(3.5), 0.75, 0, TAU); c.fill();
              c.save(); c.translate(x, Y(3.7)); c.rotate(sg * 0.5); c.fillRect(0, -0.16, 2.3, 0.32); c.fillRect(2.1, -0.24, 0.4, 0.48); c.restore(); });
          };
          rep3(c, 64, () => { c.save(); c.translate(-0.06, 0.05); c.fillStyle = '#3a6ab0'; all(); c.restore(); c.fillStyle = mix(p.far, '#04060c', 0.4); all(); });
          // 垂れ下がる配線
          c.strokeStyle = mix(p.far, '#04060c', 0.5); c.lineWidth = 0.09; rep3(c, 64, () => { for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) { const x = pyl[i] + 1.7; c.beginPath(); c.moveTo(x, 16.6 - k * 0.5); c.quadraticCurveTo(x + 7.1, 13.2 - k * 1.1 - H(i, 5), x + 14.3, 16.6 - k * 0.5); c.stroke(); } });
          atop(c, 18, 0, [[0, '#000000', 0.2], [0.5, p.haze, 0.3], [1, '#000000', 0.2]]);
        },
        init(B, L) { L.lamp = glowSprite(S * 1, '#ffb040', 0.4, 2); },
        post(R, ctx, L, cam, now) { lamps(R, ctx, L, cam, now, status, L.lamp, { blink: 1.6, duty: -0.2 }); } },
      { t: 'rays', inside: true, c: '#4ab0ff', a: 0.1, slant: 0.2, seed: 9, n: 6 },
      { t: 'parts', inside: true, n: 34, c: '#bfe0ff', core: 0, s0: 0.04, s1: 0.12, par: 0.4, vx: -0.5, vy: 0.08, wob: 0.25, wf: 0.8, a: 0.45, tw: 2.4, y0: 0, y1: 18 },
      { t: 'parts', inside: true, n: 14, c: '#9ad8ff', core: 0.7, s0: 0.06, s1: 0.15, par: 0.5, vx: -0.6, vy: -3.6, wob: 0.08, wf: 3, a: 1, tw: 10, y0: 0, y1: 18, add: true },
      { t: 'strip', inside: true, par: 0.55, k: 1, P: 48, y0: 0, y1: 4.6,
        paint(c) {
          const all = () => {
            c.fillRect(-1, 0, 50, 0.9);
            for (let i = 0; i < 8; i++) { const x = 1 + i * 6, k = i % 4;
              if (k === 0) { c.fillRect(x, 0, 3.6, 2.4); poly(c, [x, 2.4, x + 3.6, 2.4, x + 3.0, 3.1, x + 0.6, 3.1]); c.fill(); c.fillRect(x + 1.7, 3.1, 0.12, 1.2); }
              else if (k === 1) { c.fillRect(x, 0, 0.5, 3.4); c.fillRect(x + 1.2, 0, 0.5, 2.6); c.fillRect(x - 0.3, 1.6, 2.4, 0.4); c.fillRect(x + 2.6, 0, 1.8, 1.7); }
              else if (k === 2) { rrect(c, x, 0.2, 4.4, 1.9, 0.5); c.fill(); for (let q = 0; q < 3; q++) c.fillRect(x + 0.7 + q * 1.2, 2.0, 0.6, 0.5); }
              else { c.fillRect(x + 0.4, 0, 0.8, 3.8); poly(c, [x - 0.4, 3.8, x + 2.0, 3.8, x + 1.4, 4.3, x + 0.2, 4.3]); c.fill(); c.fillRect(x + 2.4, 0, 2.4, 1.3); }
            }
          };
          rep3(c, 48, () => { c.save(); c.translate(-0.04, 0.06); c.fillStyle = '#4a80c8'; all(); c.restore(); c.fillStyle = '#04060c'; all(); c.fillStyle = rgba(p.glow, 0.9); for (let i = 0; i < 16; i++) c.fillRect(1.5 + i * 3 + H(i, 31), 0.5 + H(i, 32) * 1.2, 0.3, 0.09); });
        } },
      { t: 'strip', inside: true, par: 0.55, k: 1, P: 48, y0: 13.4, y1: 18,
        paint(c) {
          const all = () => {
            c.fillRect(-1, 17.1, 50, 1);
            for (let i = 0; i < 8; i++) { const x = 3 + i * 6, k = i % 4;
              if (k === 0) { c.fillRect(x, 15.4, 3.2, 2.7); c.fillRect(x + 0.5, 14.9, 2.2, 0.5); }
              else if (k === 1) { c.fillRect(x, 14.2, 0.45, 3.9); poly(c, [x - 0.7, 14.2, x + 1.15, 14.2, x + 0.8, 13.7, x + 0.22, 13.95, x - 0.35, 13.7]); c.fill(); }
              else if (k === 2) { c.fillRect(x, 16.2, 5, 0.5); c.fillRect(x, 15.5, 5, 0.3); c.fillRect(x + 1, 15.2, 0.4, 3); c.fillRect(x + 3.6, 15.2, 0.4, 3); }
              else { rrect(c, x, 15.6, 3.8, 2.2, 0.4); c.fill(); c.fillRect(x + 1.5, 15.0, 0.8, 0.7); }
            }
          };
          rep3(c, 48, () => { c.save(); c.translate(-0.04, -0.06); c.fillStyle = '#2a5a98'; all(); c.restore(); c.fillStyle = '#04060c'; all(); c.fillStyle = rgba('#ffb040', 0.85); for (let i = 0; i < 12; i++) c.fillRect(2.5 + i * 4 + H(i, 33), 16.4 + H(i, 34) * 1.0, 0.3, 0.09); });
        } },
    ],
    front: [
      { t: 'strip', inside: true, par: 1.5, k: 0.25, squash: 0.62, P: 64, y0: 0, y1: 2.5, a: 0.94,
        paint(c) { c.fillStyle = '#020308'; c.fillRect(-1, 0, 66, 0.8); rep3(c, 64, () => { for (let i = 0; i < 7; i++) { const x = 4 + i * 9.1; poly(c, [x - 1.6, 0, x + 1.6, 0, x + 0.7, 2.0, x - 0.7, 2.0]); c.fill(); c.fillRect(x - 1.1, 1.9, 2.2, 0.3); } }); atop(c, 2.5, 0, [[0, p.glow, 0.14], [0.5, p.glow, 0]]); } },
      { t: 'strip', inside: true, par: 1.5, k: 0.25, squash: 0.62, P: 64, y0: 15.6, y1: 18, a: 0.94,
        paint(c) { c.fillStyle = '#020308'; c.strokeStyle = '#020308'; c.fillRect(-1, 17.3, 66, 0.8); c.lineWidth = 0.2; rep3(c, 64, () => { for (let i = 0; i < 6; i++) { const x = i * 10.7; c.beginPath(); c.moveTo(x, 17.6); c.quadraticCurveTo(x + 5.3, 14.8 + H(i, 9) * 1.2, x + 10.7, 17.6); c.stroke(); poly(c, [x - 1.2, 18, x + 1.2, 18, x + 0.5, 16.4, x - 0.5, 16.4]); c.fill(); } }); } },
    ],
    mood: { dark: '#01030a', a: 0.42 }, streak: { c: '#bfe0ff', a: 0.2 },
  };
} };
