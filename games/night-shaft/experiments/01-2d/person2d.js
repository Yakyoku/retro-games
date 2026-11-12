// 2D 版の人物描画（v2）。座標は y 上向きのワールド座標（m）。
// 改善: 暗所でも読める輪郭線（2 パス描画）／2 段のトゥーン陰影とリムライト／太さの変わる手足／肩と胸の形のある胴／
// かかと・靴底のある靴／親指つきの手袋／スライド・用心金のある拳銃／正しい向きのヘルメット（つば・耳当て・回り込むバイザー・あご紐）／
// 主人公の襟・ラペル・ボタン・二股の裾・髪のハイライト・目と口・まばたき／敵 3 型の体格・肩章・腕章・防弾ベスト・ポーチ・無線機。
import { SKEL } from '../../shared/art/pose.js';

const OUT = '#07090f';
const OW = 0.036; // 輪郭線の太さ（m）

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function drawPerson(c, x, y, faceV, A, look, o = {}) {
  const P = A.pose;
  const sx = Math.sign(faceV || 1) * Math.max(0.22, Math.abs(faceV));
  c.save();
  c.translate(x, y);
  c.scale(sx * (o.scale || 1), o.scale || 1);
  const guard = look.kind === 'guard';
  const bulk = look.vest ? 1.12 : guard ? 1.05 : 1; // 体格
  for (const pass of ['out', 'base']) figure(c, P, A, look, pass, bulk, guard, o);
  c.restore();
}

function figure(c, P, A, look, pass, bulk, guard, o) {
  const OL = pass === 'out';
  const fillOf = (col) => (OL ? OUT : col);
  // 太さの変わる部位（端は丸）
  const taper = (a, b, wa, wb, col, hi) => {
    if (OL) { wa += OW; wb += OW; }
    const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1e-4;
    let nx = -dy / L, ny = dx / L;
    if (nx < 0) { nx = -nx; ny = -ny; } // n は前（+x）側
    c.fillStyle = fillOf(col);
    c.beginPath();
    c.moveTo(a[0] + nx * wa / 2, a[1] + ny * wa / 2); c.lineTo(b[0] + nx * wb / 2, b[1] + ny * wb / 2);
    c.lineTo(b[0] - nx * wb / 2, b[1] - ny * wb / 2); c.lineTo(a[0] - nx * wa / 2, a[1] - ny * wa / 2); c.closePath(); c.fill();
    c.beginPath(); c.arc(a[0], a[1], wa / 2, 0, 7); c.fill();
    c.beginPath(); c.arc(b[0], b[1], wb / 2, 0, 7); c.fill();
    if (!OL && hi) { // 前側の明るい帯（光は前上から）
      c.fillStyle = hi;
      c.beginPath();
      c.moveTo(a[0] + nx * wa * 0.42, a[1] + ny * wa * 0.42); c.lineTo(b[0] + nx * wb * 0.42, b[1] + ny * wb * 0.42);
      c.lineTo(b[0] + nx * wb * 0.12, b[1] + ny * wb * 0.12); c.lineTo(a[0] + nx * wa * 0.12, a[1] + ny * wa * 0.12); c.closePath(); c.fill();
    }
  };
  const poly = (pts, col) => {
    c.fillStyle = fillOf(col); c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.fill();
    if (OL) { c.strokeStyle = OUT; c.lineWidth = OW; c.lineJoin = 'round'; c.stroke(); }
  };
  const circle = (p, r, col) => { c.fillStyle = fillOf(col); c.beginPath(); c.arc(p[0], p[1], r + (OL ? OW / 2 : 0), 0, 7); c.fill(); };

  const legDraw = (L, far) => {
    const col = far ? look.pantsDark : look.pants;
    const hi = far ? null : shade(look.pants, 0.16);
    taper(L.hip, L.knee, 0.175 * bulk, 0.125 * bulk, col, hi);
    taper(L.knee, L.ankle, 0.125 * bulk, 0.09, col, hi);
    if (guard) taper([lerp(L.knee[0], L.ankle[0], 0.55), lerp(L.knee[1], L.ankle[1], 0.55)], L.ankle, 0.11, 0.1, far ? shade(look.shoe, 0.05) : shade(look.shoe, 0.15)); // ブーツ
    shoe(L, far);
  };
  const shoe = (L, far) => {
    const a = L.footA; const ca = Math.cos(a), sa = Math.sin(a);
    const O = [L.ankle[0] + sa * SKEL.ankleH, L.ankle[1] - ca * SKEL.ankleH];
    const T = (lx, ly) => [O[0] + lx * ca - ly * sa, O[1] + lx * sa + ly * ca];
    const pts = [T(-0.075, 0.0), T(-0.08, 0.075), T(-0.02, 0.105), T(0.06, 0.085), T(0.17, 0.05), T(0.205, 0.022), T(0.2, 0.0)];
    poly(pts, far ? shade(look.shoe, -0.1) : look.shoe);
    if (!OL) {
      poly([T(-0.075, 0), T(0.2, 0), T(0.2, 0.018), T(-0.075, 0.018)], '#020203'); // 靴底
      c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.ellipse(...T(0.1, 0.06), 0.035, 0.012, a - 0.4, 0, 7); c.fill();
    }
  };
  const armDraw = (Ar, far, withGun) => {
    const col = far ? look.coatDark : look.coat;
    taper(Ar.shoulder, Ar.elbow, 0.125 * bulk, 0.1, col, far ? null : shade(look.coat, 0.14));
    taper(Ar.elbow, Ar.hand, 0.1, 0.082, col, far ? null : shade(look.coat, 0.12));
    if (withGun) gun(Ar.hand, Ar.gunA);
    // 手袋（親指つき）
    const g = look.glove || look.skin;
    circle(Ar.hand, 0.05, far ? shade(g, -0.15) : g);
    const th = [Ar.hand[0] + Math.cos(Ar.gunA + 0.9) * 0.045, Ar.hand[1] + Math.sin(Ar.gunA + 0.9) * 0.045];
    circle(th, 0.022, far ? shade(g, -0.15) : g);
    if (!far && look.band && !OL) { // 腕章
      const m = [lerp(Ar.shoulder[0], Ar.elbow[0], 0.45), lerp(Ar.shoulder[1], Ar.elbow[1], 0.45)];
      const m2 = [lerp(Ar.shoulder[0], Ar.elbow[0], 0.56), lerp(Ar.shoulder[1], Ar.elbow[1], 0.56)];
      const dx = m2[0] - m[0], dy = m2[1] - m[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * 0.067, ny = dx / L * 0.067;
      poly([[m[0] + nx, m[1] + ny], [m2[0] + nx, m2[1] + ny], [m2[0] - nx, m2[1] - ny], [m[0] - nx, m[1] - ny]], look.band);
    }
  };
  const gun = (h, ga) => {
    c.save(); c.translate(h[0], h[1]); c.rotate(ga);
    const g = look.gun, gd = look.gunDark;
    poly([[-0.035, -0.01], [0.0, -0.012], [-0.03, -0.12], [-0.075, -0.115]], gd);          // グリップ
    poly([[-0.05, 0.0], [0.19, 0.0], [0.19, 0.03], [-0.05, 0.03]], gd);                       // フレーム
    poly([[-0.06, 0.028], [0.215, 0.028], [0.215, 0.07], [-0.05, 0.072]], g);                 // スライド
    if (!OL) {
      c.fillStyle = shade(g, 0.35); c.fillRect(-0.04, 0.058, 0.24, 0.01);
      c.strokeStyle = gd; c.lineWidth = 0.012; c.beginPath(); c.arc(0.035, -0.005, 0.03, Math.PI, 2 * Math.PI); c.stroke(); // 用心金
      c.fillStyle = '#000'; c.fillRect(0.205, 0.04, 0.012, 0.018);
    }
    c.restore();
  };

  const lean = P.lean;
  const ux = Math.sin(lean), uy = Math.cos(lean); const fx = Math.cos(lean), fy = -Math.sin(lean);
  const H = P.hip;
  const T = (f, u) => [H[0] + fx * f * bulk + ux * u, H[1] + fy * f * bulk + uy * u];
  const hem = A.hem || 0;

  // 奥の腕・奥の脚・手前の脚
  armDraw(P.arms[1], true, false);
  legDraw(P.legs[1], true);
  legDraw(P.legs[0], false);

  // 胴（上着）。主人公はロングコートで裾が揺れ、二股に割れる
  const longCoat = look.kind === 'agent';
  const hemY = longCoat ? -0.36 : -0.07;
  const body = [T(-0.12, 0.43), T(-0.085, 0.5), T(-0.03, 0.525), T(0.05, 0.515), T(0.13, 0.43), T(0.15, 0.32), T(0.115, 0.15), T(0.125, 0.0),
    T(0.15 + (longCoat ? 0.03 : 0), hemY), T(0.0, hemY - 0.01), T(-0.17 + hem * (longCoat ? 0.6 : 0.1), hemY + (longCoat ? 0.02 : 0)), T(-0.13, 0.0), T(-0.11, 0.18), T(-0.135, 0.34)];
  if (OL) poly(body, OUT);
  else {
    const gr = c.createLinearGradient(T(-0.15, 0.25)[0], T(-0.15, 0.25)[1], T(0.15, 0.25)[0], T(0.15, 0.25)[1]);
    gr.addColorStop(0, look.coatDark); gr.addColorStop(0.42, look.coat); gr.addColorStop(0.82, look.coat); gr.addColorStop(1, look.coatLight);
    c.fillStyle = gr; c.beginPath(); c.moveTo(body[0][0], body[0][1]); for (const q of body) c.lineTo(q[0], q[1]); c.closePath(); c.fill();
    // リムライト（背中側の縁に夜の青い光）
    c.strokeStyle = 'rgba(150,200,255,0.45)'; c.lineWidth = 0.014; c.beginPath();
    for (const [i, q] of [T(-0.085, 0.5), T(-0.12, 0.43), T(-0.135, 0.34), T(-0.11, 0.18)].entries()) i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); c.stroke();
    if (longCoat) {
      // 襟とラペル、ボタン、裾の割れ目
      poly([T(0.04, 0.52), T(0.13, 0.42), T(0.07, 0.3), T(0.0, 0.43)], look.coatLight);
      poly([T(-0.05, 0.525), T(0.03, 0.56), T(0.06, 0.515)], look.coatDark);
      c.fillStyle = '#c9b48a'; for (const u of [0.24, 0.12]) { const q = T(0.1, u); c.beginPath(); c.arc(q[0], q[1], 0.013, 0, 7); c.fill(); }
      c.strokeStyle = look.coatDark; c.lineWidth = 0.014; c.beginPath(); const s0 = T(-0.01, -0.05), s1 = T(-0.02 + hem * 0.3, hemY); c.moveTo(s0[0], s0[1]); c.lineTo(s1[0], s1[1]); c.stroke();
    } else {
      // 制服: 胸ポケット・無線機・肩章
      poly([T(0.03, 0.34), T(0.11, 0.34), T(0.11, 0.26), T(0.03, 0.26)], shade(look.coat, -0.12));
      poly([T(-0.02, 0.42), T(0.04, 0.42), T(0.04, 0.32), T(-0.02, 0.32)], '#1b1d22');
      c.fillStyle = '#ff5a3c'; const q = T(0.01, 0.405); c.fillRect(q[0], q[1], 0.012, 0.012);
    }
    if (look.vest) {
      poly([T(-0.12, 0.42), T(0.1, 0.44), T(0.14, 0.3), T(0.12, 0.08), T(-0.12, 0.06)], look.vest);
      poly([T(-0.06, 0.36), T(0.08, 0.37), T(0.09, 0.27), T(-0.06, 0.26)], look.vestDark);
      c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 0.01; c.beginPath(); const a1 = T(-0.1, 0.2), a2 = T(0.12, 0.2); c.moveTo(a1[0], a1[1]); c.lineTo(a2[0], a2[1]); c.stroke();
    }
    // ベルト・バックル・ポーチ
    const b0 = T(-0.13, 0.05), b1 = T(0.13, 0.05);
    c.strokeStyle = '#121318'; c.lineWidth = 0.05; c.beginPath(); c.moveTo(b0[0], b0[1]); c.lineTo(b1[0], b1[1]); c.stroke();
    c.fillStyle = longCoat ? '#c9b48a' : '#8a8f99'; const bk = T(0.1, 0.05); c.fillRect(bk[0] - 0.02, bk[1] - 0.02, 0.04, 0.04);
    if (guard) poly([T(-0.12, 0.08), T(-0.04, 0.08), T(-0.04, -0.03), T(-0.12, -0.03)], '#22252c');
  }
  if (guard && !OL) { // 肩章（手前の肩）
    const s = P.arms[0].shoulder;
    c.fillStyle = look.vest ? look.vestDark : shade(look.coat, -0.25);
    c.beginPath(); c.ellipse(s[0], s[1] + 0.02, 0.09 * bulk, 0.05, -lean, 0, 7); c.fill();
  }

  // 首・頭
  taper(P.shoulder, P.neck, 0.1, 0.09, look.skinDark);
  if (look.scarf && o.scarf && !OL) {
    // マフラー（首元の結び目は胴の上）
    c.fillStyle = look.scarf; c.beginPath(); c.ellipse(P.neck[0] + 0.01, P.neck[1] - 0.03, 0.105, 0.065, -lean, 0, 7); c.fill();
    c.fillStyle = look.scarfDark; c.beginPath(); c.ellipse(P.neck[0] + 0.06, P.neck[1] - 0.06, 0.04, 0.05, -lean, 0, 7); c.fill();
  }
  head(c, P, A, look, OL, poly, circle, guard, o);

  // 手前の腕と銃（いちばん手前）
  armDraw(P.arms[0], false, true);
}

function head(c, P, A, look, OL, poly, circle, guard, o) {
  const r = SKEL.headR;
  c.save();
  c.translate(P.head[0], P.head[1]);
  c.rotate(-(P.lean + P.headTilt) * 0.55);
  // 頭とあご
  poly([[-0.1, 0.07], [-0.02, 0.125], [0.08, 0.1], [0.12, 0.03], [0.125, -0.03], [0.1, -0.08], [0.05, -0.115], [-0.02, -0.11], [-0.09, -0.06], [-0.115, 0.0]], look.skin);
  if (!OL) {
    c.fillStyle = look.skinDark; c.beginPath(); c.moveTo(-0.115, 0); c.lineTo(-0.09, -0.06); c.lineTo(-0.02, -0.11); c.lineTo(-0.03, -0.02); c.closePath(); c.fill(); // 影
    c.beginPath(); c.ellipse(-0.035, -0.005, 0.022, 0.032, 0, 0, 7); c.fill(); // 耳
  }
  if (look.kind === 'agent') {
    // 横分けの髪（上と後ろ）とハイライト、もみあげ
    poly([[-0.125, -0.02], [-0.12, 0.08], [-0.06, 0.135], [0.03, 0.145], [0.1, 0.115], [0.13, 0.07], [0.09, 0.075], [0.05, 0.095], [-0.01, 0.07], [-0.05, 0.03], [-0.07, -0.04], [-0.1, -0.06]], look.hair);
    if (!OL) {
      c.strokeStyle = 'rgba(160,170,200,0.45)'; c.lineWidth = 0.012; c.beginPath(); c.moveTo(-0.07, 0.12); c.quadraticCurveTo(0.0, 0.14, 0.07, 0.115); c.stroke();
      face(c, A, look, 0.07);
    }
  } else {
    // ヘルメット（頭の上にかぶる）・つば・耳当て・回り込むバイザー・あご紐
    const dome = []; for (let i = 0; i <= 12; i++) { const th = Math.PI * i / 12; dome.push([0.0 + Math.cos(th) * 0.145, 0.03 + Math.sin(th) * 0.13]); }
    dome.push([-0.15, -0.035], [-0.09, -0.04], [-0.07, 0.02]);
    if (!OL) { c.strokeStyle = '#2a2d33'; c.lineWidth = 0.008; c.beginPath(); c.moveTo(-0.04, -0.03); c.lineTo(-0.02, -0.11); c.lineTo(0.06, -0.115); c.stroke(); } // あご紐
    poly(dome, look.helmet);
    poly([[0.1, 0.035], [0.185, 0.015], [0.18, 0.0], [0.1, 0.012]], look.helmetDark); // つば
    if (!OL) {
      c.fillStyle = 'rgba(255,255,255,0.28)'; c.beginPath(); c.ellipse(0.03, 0.12, 0.06, 0.02, -0.25, 0, 7); c.fill();
      c.fillStyle = look.helmetDark; c.fillRect(-0.04, 0.03, 0.012, 0.11);
      const glow = o.windup || 0;
      const vcol = glow ? `rgb(255,${Math.round(225 - glow * 165)},${Math.round(160 - glow * 130)})` : look.visor;
      poly([[0.0, 0.01], [0.128, 0.012], [0.124, -0.035], [0.0, -0.03]], vcol);
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(0.05, -0.002, 0.06, 0.008);
      if (glow) { c.fillStyle = `rgba(255,110,60,${glow * 0.35})`; c.beginPath(); c.arc(0.09, -0.01, 0.16, 0, 7); c.fill(); }
      c.strokeStyle = look.skinDark; c.lineWidth = 0.008; c.beginPath(); c.moveTo(0.055, -0.08); c.lineTo(0.09, -0.078); c.stroke(); // 口
    }
  }
  c.restore();
}

function face(c, A, look, ex) {
  // 目（まばたき）・眉・鼻・口
  if (A.blink) { c.strokeStyle = '#2a1a14'; c.lineWidth = 0.008; c.beginPath(); c.moveTo(ex - 0.014, 0.012); c.lineTo(ex + 0.018, 0.012); c.stroke(); }
  else {
    c.fillStyle = '#f6f2ea'; c.beginPath(); c.ellipse(ex + 0.004, 0.012, 0.017, 0.012, 0, 0, 7); c.fill();
    c.fillStyle = '#1a1210'; c.beginPath(); c.arc(ex + 0.011, 0.011, 0.0085, 0, 7); c.fill();
  }
  c.strokeStyle = look.hair; c.lineWidth = 0.011; c.beginPath(); c.moveTo(ex - 0.02, 0.04); c.lineTo(ex + 0.025, 0.045); c.stroke();
  c.fillStyle = look.skin; c.beginPath(); c.moveTo(0.118, 0.0); c.lineTo(0.138, -0.03); c.lineTo(0.116, -0.035); c.fill();
  c.strokeStyle = look.skinDark; c.lineWidth = 0.007; c.beginPath(); c.moveTo(0.075, -0.068); c.lineTo(0.105, -0.066); c.stroke();
}

function lerp(a, b, k) { return a + (b - a) * k; }
