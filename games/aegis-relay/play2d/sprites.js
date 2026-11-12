// AEGIS RELAY — 2D の機体・敵・地上物の絵（ベクター。1 単位 = 論理 1px。表示倍率に合わせてキャッシュを作り直す）
// すべて新規デザイン。原点が機体の中心、上（-y）が進行方向。
const TAU = Math.PI * 2;
function poly(c, pts) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); }
function lg(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; }
function rg(c, x, y, r0, r1, stops) { const g = c.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; }
function glow(c, x, y, r, col) { c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = rg(c, x, y, 0, r, [[0, col], [1, 'rgba(0,0,0,0)']]); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore(); }
function edge(c, w, col = 'rgba(5,8,16,.85)') { c.lineWidth = w; c.strokeStyle = col; c.lineJoin = 'round'; c.stroke(); }

// 自機「AEGIS-01」。docked=true で支援機 ARC が左右の翼として付く
export function drawPlayer(c, docked, t) {
  if (docked) {
    for (const s of [-1, 1]) {
      poly(c, [s * 6, -2, s * 17, 3, s * 21, 9, s * 15, 10, s * 7, 6]);
      c.fillStyle = lg(c, 0, -2, 0, 10, [[0, '#fff1c2'], [0.5, '#ffd166'], [1, '#a8741a']]); c.fill(); edge(c, 0.6);
      c.fillStyle = '#5b3d0a'; poly(c, [s * 14, 4, s * 19, 8, s * 15, 9]); c.fill();
      glow(c, s * 17, 11, 4.5, 'rgba(255,200,90,.9)');
    }
  }
  // 主翼
  poly(c, [0, -4, 13, 6, 14, 10, 4, 9, 0, 11, -4, 9, -14, 10, -13, 6]);
  c.fillStyle = lg(c, -14, 0, 14, 0, [[0, '#6f7f99'], [0.5, '#d9e2f0'], [1, '#6f7f99']]); c.fill(); edge(c, 0.7);
  // 前縁の光
  c.strokeStyle = 'rgba(46,197,255,.9)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(-12.5, 6.2); c.lineTo(-1, -2.6); c.moveTo(12.5, 6.2); c.lineTo(1, -2.6); c.stroke();
  // 胴
  poly(c, [0, -14, 3.2, -6, 3.6, 6, 2.4, 11, -2.4, 11, -3.6, 6, -3.2, -6]);
  c.fillStyle = lg(c, -3.6, 0, 3.6, 0, [[0, '#8794ad'], [0.45, '#f5f8ff'], [1, '#7a88a3']]); c.fill(); edge(c, 0.7);
  // 背びれ（2 枚）
  for (const s of [-1, 1]) { poly(c, [s * 2.2, 2, s * 6.5, 9, s * 5.5, 11, s * 2.4, 8]); c.fillStyle = '#4a5874'; c.fill(); }
  // キャノピー
  c.beginPath(); c.ellipse(0, -5.5, 1.8, 4, 0, 0, TAU); c.fillStyle = lg(c, 0, -9, 0, -2, [[0, '#d6fbff'], [0.5, '#2ec5ff'], [1, '#0b3b66']]); c.fill(); edge(c, 0.4);
  // 推進器
  const f = 0.75 + 0.25 * Math.sin(t * 0.9) + 0.1 * Math.sin(t * 2.3);
  for (const x of [-1.6, 1.6]) {
    glow(c, x, 12.5, 4.5 * f, 'rgba(120,220,255,.95)');
    c.fillStyle = 'rgba(255,255,255,.95)'; c.beginPath(); c.ellipse(x, 12, 0.9, 1.8 * f, 0, 0, TAU); c.fill();
  }
}

export function drawPartner(c, t) {
  c.save(); c.rotate(Math.sin(t * 0.05) * 0.15);
  for (const s of [-1, 1]) { poly(c, [0, -6, s * 10, 2, s * 12, 7, s * 4, 5, 0, 8]); c.fillStyle = lg(c, 0, -6, 0, 8, [[0, '#fff3c8'], [0.5, '#ffd166'], [1, '#9a6a14']]); c.fill(); edge(c, 0.6); }
  c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.fillStyle = '#3a2706'; c.fill();
  glow(c, 0, 0, 6 + 2 * Math.sin(t * 0.2), 'rgba(255,210,100,.9)');
  c.restore();
}

// 空の敵
export const AIR_DRAW = {
  scout(c) {
    poly(c, [0, 9, 8, -6, 3, -4, 0, -8, -3, -4, -8, -6]);
    c.fillStyle = lg(c, 0, -8, 0, 9, [[0, '#4d5d7d'], [0.6, '#a9b8d4'], [1, '#e7eefb']]); c.fill(); edge(c, 0.7);
    c.fillStyle = '#ff5a5a'; c.beginPath(); c.arc(0, 2, 1.6, 0, TAU); c.fill(); glow(c, 0, 2, 4, 'rgba(255,80,80,.8)');
  },
  weaver(c) {
    c.beginPath(); c.arc(0, 0, 7, 0, TAU); c.arc(0, 0, 3.6, 0, TAU, true);
    c.fillStyle = lg(c, -7, -7, 7, 7, [[0, '#a7ffcf'], [0.5, '#2fa36b'], [1, '#0f4a32']]); c.fill('evenodd'); edge(c, 0.6);
    for (let k = 0; k < 3; k++) { c.save(); c.rotate((k * TAU) / 3); poly(c, [0, -6.5, 2, -9.5, -2, -9.5]); c.fillStyle = '#c9ffe4'; c.fill(); c.restore(); }
    glow(c, 0, 0, 4, 'rgba(120,255,190,.9)');
  },
  slicer(c) {
    c.beginPath(); c.arc(0, 0, 8, -0.2, Math.PI + 0.2); c.arc(0, -3, 6, Math.PI + 0.1, -0.1, true); c.closePath();
    c.fillStyle = lg(c, 0, -8, 0, 8, [[0, '#ffe0b0'], [0.5, '#ff8a3d'], [1, '#7a2a08']]); c.fill(); edge(c, 0.7);
    c.fillStyle = '#2a0e04'; c.beginPath(); c.arc(0, 2, 2, 0, TAU); c.fill(); glow(c, 0, 2, 3.5, 'rgba(255,170,80,.9)');
  },
  gunner(c) {
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 6, 0, 3.2, 7, 0, 0, TAU); c.fillStyle = lg(c, s * 3, -7, s * 9, 7, [[0, '#e3c9ff'], [1, '#4b2a7a']]); c.fill(); edge(c, 0.6); c.fillStyle = '#1c0d30'; c.fillRect(s * 6 - 0.9, 5, 1.8, 4); }
    poly(c, [-4, -6, 4, -6, 5, 4, 0, 8, -5, 4]); c.fillStyle = lg(c, 0, -6, 0, 8, [[0, '#b993ff'], [1, '#341a5e']]); c.fill(); edge(c, 0.7);
    glow(c, 0, 1, 4.5, 'rgba(200,140,255,.9)');
  },
  spinner(c) {
    for (let k = 0; k < 4; k++) { c.save(); c.rotate((k * TAU) / 4); poly(c, [0, -8, 2.4, -2, 0, 0, -2.4, -2]); c.fillStyle = lg(c, 0, -8, 0, 0, [[0, '#ffffff'], [1, '#43c8ff']]); c.fill(); edge(c, 0.5); c.restore(); }
    c.beginPath(); c.arc(0, 0, 2.6, 0, TAU); c.fillStyle = '#063a5c'; c.fill(); glow(c, 0, 0, 5, 'rgba(90,210,255,.9)');
  },
  diver(c) {
    poly(c, [0, 10, 6, -2, 9, -8, 3, -5, 0, -9, -3, -5, -9, -8, -6, -2]);
    c.fillStyle = lg(c, 0, -9, 0, 10, [[0, '#5a1424'], [0.5, '#e0405e'], [1, '#ffd0d8']]); c.fill(); edge(c, 0.7);
    c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 3, 1.4, 0, TAU); c.fill(); glow(c, 0, -6, 5, 'rgba(255,90,120,.8)');
  },
  lancer(c) {
    poly(c, [0, 16, 3, 4, 11, -2, 12, -9, 4, -7, 2, -13, -2, -13, -4, -7, -12, -9, -11, -2, -3, 4]);
    c.fillStyle = lg(c, -12, 0, 12, 0, [[0, '#4e4a3a'], [0.5, '#d8cfa8'], [1, '#4e4a3a']]); c.fill(); edge(c, 0.8);
    poly(c, [0, 16, 1.4, 6, -1.4, 6]); c.fillStyle = '#ffe08a'; c.fill();
    for (const s of [-1, 1]) glow(c, s * 8, -9, 4, 'rgba(255,220,120,.9)');
    c.fillStyle = '#20180a'; c.fillRect(-2, -4, 4, 6); glow(c, 0, 8, 5, 'rgba(255,230,140,.8)');
  },
  twinL(c) { twinHalf(c, -1); },
  twinR(c) { twinHalf(c, 1); },
  twinM(c) {
    c.beginPath(); c.arc(0, 0, 15, 0, TAU); c.fillStyle = rg(c, -4, -4, 2, 16, [[0, '#d0d6ff'], [0.6, '#5560b0'], [1, '#1a1d44']]); c.fill(); edge(c, 0.9);
    for (let k = 0; k < 8; k++) { c.save(); c.rotate((k * TAU) / 8); c.fillStyle = '#9aa4ff'; c.fillRect(-1, -14.5, 2, 4); c.restore(); }
    c.beginPath(); c.arc(0, 0, 5, 0, TAU); c.fillStyle = '#ff4fa8'; c.fill(); glow(c, 0, 0, 10, 'rgba(255,80,170,.9)');
  },
};
function twinHalf(c, s) {
  c.beginPath(); c.arc(0, 0, 10, s > 0 ? -Math.PI / 2 : Math.PI / 2, s > 0 ? Math.PI / 2 : Math.PI * 1.5); c.closePath();
  c.fillStyle = rg(c, s * 3, -3, 1, 11, [[0, '#e4e8ff'], [0.6, '#6a74c8'], [1, '#22265a']]); c.fill(); edge(c, 0.8);
  c.fillStyle = 'rgba(255,79,168,.9)'; c.fillRect(s > 0 ? 0 : -1.6, -8, 1.6, 16);
  glow(c, 0, 0, 7, 'rgba(255,79,168,.7)');
}

// 地上の標的（壊せるものは明るい輪郭と光を持つ。飾りの遺跡は光らない）
export const GROUND_DRAW = {
  turret(c, th) {
    poly(c, [-6, -8, 6, -8, 9, -3, 9, 3, 6, 8, -6, 8, -9, 3, -9, -3]);
    c.fillStyle = lg(c, 0, -8, 0, 8, [[0, '#6b7280'], [1, '#2a2e36']]); c.fill(); edge(c, 0.8);
    c.strokeStyle = th.glow; c.lineWidth = 0.8; c.beginPath(); c.arc(0, 0, 6.2, 0, TAU); c.stroke();
    c.beginPath(); c.arc(0, 0, 4, 0, TAU); c.fillStyle = '#9aa3b2'; c.fill();
  },
  turretBarrel(c) { c.fillStyle = '#c6ccd6'; c.fillRect(-1.1, 0, 2.2, 9); c.fillStyle = '#ff7a3d'; c.fillRect(-1.1, 8, 2.2, 1.6); },
  bunker(c, th) {
    poly(c, [0, -11, 9.5, -5.5, 9.5, 5.5, 0, 11, -9.5, 5.5, -9.5, -5.5]);
    c.fillStyle = lg(c, -9, -9, 9, 9, [[0, '#8a909c'], [1, '#30343c']]); c.fill(); edge(c, 0.9);
    c.beginPath(); c.arc(0, 0, 6, 0, TAU); c.fillStyle = rg(c, -2, -2, 1, 7, [[0, '#c9ced8'], [1, '#4a505c']]); c.fill();
    c.strokeStyle = th.glow; c.lineWidth = 0.9; c.beginPath(); c.arc(0, 0, 8.4, 0, TAU); c.stroke();
    for (let k = 0; k < 3; k++) { c.save(); c.rotate(Math.PI / 2 + (k - 1) * 0.5); c.fillStyle = '#e2e6ee'; c.fillRect(-0.9, 4, 1.8, 7); c.restore(); }
  },
  dock(c) {
    c.beginPath(); c.roundRect(-11, -8, 22, 16, 5); c.fillStyle = lg(c, 0, -8, 0, 8, [[0, '#fff0b8'], [0.5, '#e0aa3a'], [1, '#6e4a0e']]); c.fill(); edge(c, 0.9);
    c.strokeStyle = '#5b3d0a'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(0, -7); c.lineTo(0, 7); c.moveTo(-9, 0); c.lineTo(9, 0); c.stroke();
    c.strokeStyle = '#ffd166'; c.lineWidth = 0.9; c.beginPath(); c.roundRect(-12.5, -9.5, 25, 19, 6); c.stroke();
  },
  panel(c, th) {
    c.beginPath(); c.roundRect(-6.5, -6.5, 13, 13, 2); c.fillStyle = lg(c, -6, -6, 6, 6, [[0, '#2a3a4a'], [1, '#101820']]); c.fill(); edge(c, 0.6);
    c.strokeStyle = '#7ff3ff'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(-4, -4); c.lineTo(0, -4); c.lineTo(0, 0); c.lineTo(4, 0); c.lineTo(4, 4); c.moveTo(-4, 2); c.lineTo(-2, 4); c.stroke();
    c.strokeStyle = th.glow; c.lineWidth = 0.8; c.beginPath(); c.roundRect(-6.5, -6.5, 13, 13, 2); c.stroke();
  },
  core(c, th, t) {
    c.beginPath(); c.arc(0, 0, 22, 0, TAU); c.fillStyle = rg(c, -6, -6, 3, 24, [[0, '#8f96a8'], [1, '#1e212a']]); c.fill(); edge(c, 1.2);
    c.save(); c.rotate(t * 0.01);
    for (let k = 0; k < 6; k++) { c.save(); c.rotate((k * TAU) / 6); c.beginPath(); c.arc(0, 0, 17, -0.4, 0.4); c.lineWidth = 4; c.strokeStyle = '#596071'; c.stroke(); c.restore(); }
    c.restore();
    c.strokeStyle = th.glow; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, 21, 0, TAU); c.stroke();
    c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.fillStyle = rg(c, 0, 0, 1, 9, [[0, '#ffffff'], [0.4, '#ff4fa8'], [1, '#4a0420']]); c.fill();
    glow(c, 0, 0, 14, 'rgba(255,79,168,.6)');
  },
};

// 遺跡（飾り。光らず、輪郭線も描かない → 壊せる標的と見分けられる）
export function drawRuin(c, r, th) {
  c.fillStyle = th.ruin; c.globalAlpha = 0.75;
  const s = r.s;
  if (r.kind === 'pillar') { c.fillRect(-3 * s, -3 * s, 6 * s, 6 * s); c.fillStyle = th.side; c.fillRect(-3 * s, 3 * s, 6 * s, 2.5 * s); }
  else if (r.kind === 'slab') { c.rotate(r.rot); c.fillRect(-9 * s, -3 * s, 18 * s, 6 * s); c.fillStyle = th.side; c.fillRect(-9 * s, -0.4 * s, 18 * s, 0.8 * s); }
  else if (r.kind === 'arch') { c.rotate(r.rot); c.beginPath(); c.arc(0, 0, 8 * s, Math.PI, 0); c.arc(0, 0, 5 * s, 0, Math.PI, true); c.fill(); }
  else { c.beginPath(); c.arc(0, 0, 7 * s, 0, TAU); c.arc(0, 0, 4.5 * s, 0, TAU, true); c.fill('evenodd'); }
  c.globalAlpha = 1;
}
export { glow, rg, lg, TAU };
