// 月影の魔城 — ボス 6 体（作り直し版）。騎士・魔物と同じ描き方: 曲面の塊・3 段の陰影・月光の縁・光る目・状態ごとの表情と構え
// 座標: 足元中央が原点、y 上、x は向いている方向が +。
import { lit, limb, finish, glowDot, lite, dark, OUT } from './figures.js';

const TAU = Math.PI * 2;
const st = (b, s) => b.st === s;
const k = (b, s, d) => (b.st === s ? Math.min(1, b.t / d) : 0);
const ell = (ctx, x, y, rx, ry, fill, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); ctx.fillStyle = fill; ctx.fill(); };
const eye = (ctx, x, y, r, red) => glowDot(ctx, x, y, r, red ? 'rgba(255,70,40,1)' : 'rgba(255,214,80,1)');
function blob(ctx, pts, fill, lw = 0.05) { // 点列を通るなめらかな閉曲線
  ctx.beginPath();
  const n = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let m = mid(pts[n - 1], pts[0]); ctx.moveTo(...m);
  for (let i = 0; i < n; i++) { const p = pts[i], q = mid(p, pts[(i + 1) % n]); ctx.quadraticCurveTo(p[0], p[1], q[0], q[1]); }
  ctx.closePath(); finish(ctx, fill, lw);
}
function rimArc(ctx, x, y, rx, ry, a0, a1, w = 0.05) { ctx.strokeStyle = 'rgba(170,205,255,0.8)'; ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, a0, a1); ctx.stroke(); }
function stars(ctx, x, y, time) { for (let i = 0; i < 4; i++) { const a = time * 5 + i * 1.57; glowDot(ctx, x + Math.cos(a) * 0.55, y + Math.sin(a) * 0.12, 0.05, 'rgba(255,225,77,1)'); } }

export function drawBossNew(ctx, b, time) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (b.st === 'dying') { const d = Math.min(1, b.deadT / 2.4); ctx.globalAlpha = 1 - d * 0.85; ctx.translate(Math.sin(time * 50) * 0.08 * d, -d * 0.6); ctx.rotate(d * 0.25); }
  const br = 1 + Math.sin(time * 1.8 + (b.x0 || 0)) * 0.018; ctx.scale(1 / Math.sqrt(br), br); // 呼吸
  ART[b.type](ctx, b, time);
  if (b.hitT > 0) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = `rgba(255,255,255,${(b.hitT / 0.1) * 0.65})`; ctx.fillRect(-5, -3, 10, 10); ctx.globalCompositeOperation = 'source-over'; }
  ctx.globalAlpha = 1;
}

const ART = {
  // ---- 墓守ガルム: 猫背の巨人の墓掘り。頭巾から突き出た禿げ頭、つぎはぎの外套、縄の帯に頭蓋、錆びた大シャベル、緑の鬼火のランタン
  gravekeeper(ctx, b, time) {
    const wind = k(b, 'chargeWind', 0.8), slamW = k(b, 'slamWind', 0.7), charge = st(b, 'charge'), stun = st(b, 'stun');
    const walk = Math.sin(time * 5), C = '#6e5c48';
    ctx.translate(0, -wind * 0.22);
    // 脚
    for (const [x, back] of [[-0.45, true], [0.4, false]]) {
      const sw = charge ? Math.sin(time * 18 + (back ? 0 : 3)) * 0.4 : walk * 0.12 * (back ? 1 : -1);
      limb(ctx, [x, 1.2], [x + sw * 0.6, 0.55], 0.24, 0.2, back ? dark(C, 0.35) : dark(C, 0.15));
      limb(ctx, [x + sw * 0.6, 0.55], [x + sw, 0.08], 0.2, 0.18, back ? '#2e2620' : '#3e342a');
      blob(ctx, [[x + sw - 0.25, 0.0], [x + sw + 0.38, 0.0], [x + sw + 0.35, 0.2], [x + sw - 0.2, 0.22]], lit(ctx, 0, 0.2, 0, 0, '#2a201a', 0.3, 0.5));
    }
    // 外套の胴（大きく前へ曲がった背中）
    ctx.save(); ctx.translate(0, 1.0); ctx.rotate(-0.12 - (charge ? 0.25 : 0) - wind * 0.1);
    blob(ctx, [[-1.15, 0.0], [-1.35, 1.2], [-0.75, 2.15], [0.2, 2.3], [0.95, 1.85], [1.15, 1.0], [1.05, 0.0], [0.0, -0.15]], lit(ctx, 0.6, 2.2, -0.6, 0.0, C, 0.35, 0.65), 0.06);
    // つぎはぎと縫い目
    for (const [x, y, w, h, c] of [[-0.75, 1.1, 0.42, 0.36, '#5a4a6a'], [0.25, 0.45, 0.36, 0.3, '#6a5a3a'], [-0.35, 0.35, 0.3, 0.26, '#4a5a4a']]) {
      ctx.beginPath(); ctx.rect(x, y, w, h); finish(ctx, lit(ctx, x, y + h, x, y, c, 0.3, 0.4), 0.025);
      ctx.strokeStyle = '#d8c8a0'; ctx.lineWidth = 0.02; ctx.setLineDash([0.04, 0.04]); ctx.strokeRect(x + 0.03, y + 0.03, w - 0.06, h - 0.06); ctx.setLineDash([]);
    }
    rimArc(ctx, -0.3, 1.1, 1.0, 1.1, Math.PI * 0.55, Math.PI * 0.95, 0.06);
    // 縄の帯と頭蓋の飾り
    ctx.strokeStyle = '#8a7348'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(-1.1, 0.35); ctx.quadraticCurveTo(0, 0.2, 1.08, 0.4); ctx.stroke();
    ell(ctx, 0.55, 0.15, 0.16, 0.15, '#e8e0c8'); ell(ctx, 0.5, 0.17, 0.04, 0.05, '#140c0c'); ell(ctx, 0.62, 0.17, 0.04, 0.05, '#140c0c');
    ctx.restore();
    // 後ろの腕とランタン（緑の鬼火）
    const lx = -0.95, ly = 1.35 + Math.sin(time * 3) * 0.06;
    limb(ctx, [-0.55, 2.4], [-0.9, 1.75], 0.18, 0.15, dark(C, 0.35));
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(-0.9, 1.75); ctx.lineTo(lx, ly + 0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lx - 0.18, ly - 0.26); ctx.lineTo(lx + 0.18, ly - 0.26); ctx.lineTo(lx + 0.22, ly + 0.2); ctx.lineTo(lx - 0.22, ly + 0.2); ctx.closePath(); finish(ctx, '#252528', 0.03);
    glowDot(ctx, lx, ly - 0.03, 0.12 + wind * 0.08 + Math.sin(time * 13) * 0.015, 'rgba(120,255,150,0.95)');
    ctx.strokeStyle = '#3a3a40'; ctx.lineWidth = 0.025; for (const x of [-0.08, 0.08]) { ctx.beginPath(); ctx.moveTo(lx + x, ly - 0.26); ctx.lineTo(lx + x * 1.2, ly + 0.2); ctx.stroke(); }
    // 頭巾と顔
    ctx.save(); ctx.translate(0.65 + (charge ? 0.2 : 0), 2.95 - wind * 0.1); ctx.rotate(stun ? Math.sin(time * 8) * 0.25 : wind * 0.3);
    blob(ctx, [[-0.55, -0.35], [-0.65, 0.25], [-0.2, 0.62], [0.35, 0.5], [0.5, 0.0], [0.2, -0.4]], lit(ctx, 0.2, 0.6, -0.3, -0.3, '#3e3226', 0.3, 0.6));
    blob(ctx, [[-0.05, -0.32], [-0.1, 0.22], [0.25, 0.36], [0.55, 0.12], [0.55, -0.22], [0.25, -0.42]], lit(ctx, 0.4, 0.35, 0.0, -0.4, '#d2bfa0', 0.25, 0.5), 0.035);
    ell(ctx, 0.36, 0.02, 0.09, 0.1, '#1a0e08'); ell(ctx, 0.13, 0.05, 0.07, 0.08, '#1a0e08');
    eye(ctx, 0.37, 0.02, 0.05, wind || charge); eye(ctx, 0.14, 0.05, 0.04, wind || charge);
    ctx.strokeStyle = '#3a2010'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.moveTo(0.05, 0.16); ctx.lineTo(0.22, 0.12 + wind * 0.04); ctx.moveTo(0.3, 0.12 + wind * 0.04); ctx.lineTo(0.48, 0.15); ctx.stroke();
    blob(ctx, [[0.08, -0.22], [0.3, -0.3 - wind * 0.08], [0.55, -0.24], [0.5, -0.16], [0.1, -0.15]], '#3a1a12', 0.02);
    ctx.fillStyle = '#f2e8cc'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0.14 + i * 0.1, -0.17); ctx.lineTo(0.17 + i * 0.1, -0.24 - (i % 2) * 0.04); ctx.lineTo(0.2 + i * 0.1, -0.17); ctx.fill(); }
    if (wind || charge) for (const s of [0, 1]) { const t = (time * 3 + s * 0.5) % 1; ell(ctx, 0.62 + t * 0.4, -0.05 + t * 0.1, 0.06 + t * 0.12, 0.05 + t * 0.08, `rgba(220,220,230,${0.6 * (1 - t)})`); }
    ctx.restore();
    // 前の腕と大シャベル
    const sh = slamW ? -2.5 * slamW : st(b, 'slam') || st(b, 'recover') ? 0.9 : charge ? 1.2 : 0.35;
    ctx.save(); ctx.translate(0.9, 2.15); ctx.rotate(-sh);
    limb(ctx, [0, 0], [0.05, -0.75], 0.2, 0.17, C, { spec: true });
    blob(ctx, [[-0.1, -0.68], [0.18, -0.7], [0.2, -0.92], [-0.12, -0.92]], '#c2a888', 0.03);
    limb(ctx, [0.04, -0.3], [0.04, -2.15], 0.06, 0.06, '#7a5a34', { rim: false });
    ctx.beginPath(); ctx.moveTo(-0.38, -2.0); ctx.lineTo(0.42, -2.0); ctx.quadraticCurveTo(0.44, -2.6, 0.04, -2.95); ctx.quadraticCurveTo(-0.38, -2.6, -0.38, -2.0); ctx.closePath();
    finish(ctx, lit(ctx, 0.4, -2.0, -0.3, -2.9, '#8a949e', 0.6, 0.6), 0.04);
    for (const [x, y, r] of [[-0.12, -2.4, 0.08], [0.18, -2.55, 0.06], [0.0, -2.75, 0.05]]) ell(ctx, x, y, r, r * 0.7, 'rgba(140,70,30,0.6)');
    ctx.restore();
    if (stun) stars(ctx, 0.7, 3.6, time);
  },
  // ---- 宵の魔女ヘクセ: 箒に横座りの老婆。緑の肌・鉤鼻・白い乱れ髪・曲がった尖り帽、裂けた裾、鉤爪の指、詠唱の光
  witch(ctx, b, time) {
    const fan = k(b, 'fanWind', 0.8), land = st(b, 'landed'), dive = st(b, 'dive') || st(b, 'diveWind');
    ctx.translate(0, Math.sin(time * 4) * 0.05);
    if (dive) ctx.rotate(-0.35);
    if (!land) {
      limb(ctx, [-1.05, 0.52], [1.05, 0.72], 0.055, 0.045, '#7a5a34', { rim: false });
      ctx.beginPath(); ctx.moveTo(-1.0, 0.6); for (let i = 0; i <= 8; i++) { const t = i / 8; ctx.lineTo(-1.7 - Math.sin(time * 10 + i) * 0.05, 0.25 + t * 0.62); } ctx.lineTo(-1.0, 0.48); ctx.closePath();
      finish(ctx, lit(ctx, -1.3, 0.9, -1.3, 0.2, '#c2a050', 0.3, 0.5), 0.03);
      ctx.strokeStyle = '#6a4a20'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(-1.02, 0.42); ctx.lineTo(-1.02, 0.66); ctx.stroke();
    }
    // 衣（裂けた裾がはためく）
    ctx.beginPath(); ctx.moveTo(-0.45, 0.55); ctx.quadraticCurveTo(-0.55, 1.3, -0.05, 1.58); ctx.quadraticCurveTo(0.4, 1.5, 0.48, 0.65);
    for (let i = 0; i < 6; i++) ctx.lineTo(0.48 - i * 0.2, 0.5 - (i % 2) * 0.25 - Math.sin(time * 8 + i) * 0.06);
    ctx.closePath(); finish(ctx, lit(ctx, 0.3, 1.5, -0.3, 0.3, '#33245a', 0.3, 0.65));
    ctx.strokeStyle = 'rgba(170,205,255,0.6)'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.moveTo(-0.45, 0.6); ctx.quadraticCurveTo(-0.52, 1.25, -0.08, 1.55); ctx.stroke();
    // 後ろの腕
    limb(ctx, [-0.05, 1.32], [-0.38, 0.95], 0.07, 0.06, '#7a9a6a');
    // 頭（髪 → 顔 → 帽子）
    ctx.save(); ctx.translate(0.1, 1.75); ctx.rotate(land ? Math.sin(time * 6) * 0.2 : 0);
    ctx.strokeStyle = '#e8e4f0'; ctx.lineWidth = 0.035;
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.moveTo(-0.1, 0.05); ctx.quadraticCurveTo(-0.3 - i * 0.03, -0.05 - i * 0.04 + Math.sin(time * 6 + i) * 0.04, -0.35 - i * 0.04, -0.3 - i * 0.06); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(0.05, 0.0, 0.22, 0.24, 0.1, 0, TAU); finish(ctx, lit(ctx, 0.2, 0.2, -0.1, -0.2, '#9cc28a', 0.3, 0.5));
    blob(ctx, [[0.18, 0.06], [0.5, -0.12], [0.44, -0.16], [0.2, -0.05]], lit(ctx, 0.4, 0.0, 0.3, -0.2, '#8ab07a', 0.3, 0.4), 0.025);
    eye(ctx, 0.14, 0.07, 0.035, fan > 0); ctx.strokeStyle = '#1a2a12'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(0.06, 0.14); ctx.lineTo(0.2, 0.11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.02, -0.12); ctx.quadraticCurveTo(0.12, -0.2 - fan * 0.05, 0.22, -0.12); ctx.strokeStyle = '#2a1010'; ctx.lineWidth = 0.03; ctx.stroke();
    ell(ctx, 0.1, -0.15, 0.025, 0.02, '#f0ead0');
    // 帽子（つば・曲がった先・帯と留め金）
    ctx.beginPath(); ctx.ellipse(0.0, 0.16, 0.5, 0.08, -0.05, 0, TAU); finish(ctx, lit(ctx, 0, 0.24, 0, 0.08, '#2a1d48', 0.3, 0.5), 0.03);
    ctx.beginPath(); ctx.moveTo(-0.24, 0.18); ctx.quadraticCurveTo(-0.15, 0.6, 0.05, 0.85); ctx.quadraticCurveTo(0.2, 1.05, -0.12, 1.1 + Math.sin(time * 3) * 0.05); ctx.quadraticCurveTo(0.12, 0.85, 0.24, 0.18); ctx.closePath();
    finish(ctx, lit(ctx, 0.2, 0.9, -0.2, 0.2, '#2a1d48', 0.35, 0.55), 0.03);
    ctx.beginPath(); ctx.rect(-0.22, 0.2, 0.44, 0.09); finish(ctx, '#7a2a5a', 0.02); ctx.beginPath(); ctx.rect(-0.04, 0.2, 0.09, 0.09); finish(ctx, '#d8b25a', 0.015);
    ctx.restore();
    // 前の腕と詠唱の光
    const hx = 0.58 + fan * 0.2, hy = 1.25 + fan * 0.22;
    limb(ctx, [0.18, 1.32], [hx, hy], 0.075, 0.06, '#9cc28a');
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = '#2a3a1a'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(hx + 0.08, hy + 0.06 - i * 0.05, hx + 0.13, hy + 0.02 - i * 0.07); ctx.stroke(); }
    glowDot(ctx, hx + 0.15, hy, 0.1 + fan * 0.18 + Math.sin(time * 20) * 0.02, 'rgba(220,140,255,0.95)');
    if (fan > 0) { ctx.strokeStyle = `rgba(230,170,255,${fan})`; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.arc(hx + 0.15, hy, 1.4 - fan * 1.1, 0, TAU); ctx.stroke(); }
    if (land) stars(ctx, 0.1, 2.55, time);
  },
  // ---- 沼獣ヌマヅチ: ぬめる鯰と山椒魚の合いの子。膜の背びれ・飛び出た目・揺れるひげ・岸では水かきの前足、口を開けて水を吐く
  riverbeast(ctx, b, time) {
    if (st(b, 'submerged') || st(b, 'ripple')) return;
    const land = st(b, 'onLand'), open = land && b.t > 0.75 && b.t < 1.3 ? 1 : 0, S = '#3f7a74', sw = Math.sin(time * 6) * 0.08;
    if (land) for (const x of [-0.7, 0.75]) { limb(ctx, [x, 0.6], [x + 0.2, 0.1], 0.16, 0.12, dark(S, 0.25)); ell(ctx, x + 0.3, 0.05, 0.22, 0.07, dark(S, 0.35)); }
    // 背びれ（膜とトゲ）
    ctx.beginPath(); ctx.moveTo(-1.2, 1.4); for (let i = 0; i <= 6; i++) { const x = -1.2 + i * 0.33; ctx.lineTo(x + 0.08, 2.05 + Math.sin(time * 5 + i) * 0.08 - Math.abs(i - 3) * 0.06); ctx.lineTo(x + 0.2, 1.65); } ctx.lineTo(0.9, 1.4); ctx.closePath();
    finish(ctx, lit(ctx, 0, 2.1, 0, 1.4, '#6a3a4a', 0.3, 0.5), 0.035);
    // 胴
    blob(ctx, [[-1.55 + sw, 0.25], [-1.6 + sw, 1.0], [-0.7, 1.7], [0.6, 1.8], [1.35, 1.25], [1.45, 0.55], [0.9, 0.1], [-0.4, 0.05]], lit(ctx, 0.5, 1.8, -0.4, 0.1, S, 0.35, 0.65), 0.06);
    blob(ctx, [[-0.9, 0.2], [0.0, 0.08], [1.1, 0.3], [0.6, 0.62], [-0.5, 0.6]], lit(ctx, 0.3, 0.6, 0.3, 0.1, '#cfcf94', 0.25, 0.4), 0.03);
    for (let i = 0; i < 9; i++) ell(ctx, -1.1 + (i % 5) * 0.42, 1.0 + Math.floor(i / 5) * 0.3, 0.07, 0.05, 'rgba(20,50,40,0.55)');
    ell(ctx, 0.2, 1.55, 0.45, 0.07, 'rgba(255,255,255,0.45)', -0.15); // ぬめりの光
    // 口（開くと牙）
    ctx.beginPath(); ctx.moveTo(1.4, 0.75); ctx.quadraticCurveTo(0.9, 0.62 - open * 0.45, 0.35, 0.78); ctx.strokeStyle = '#0a1414'; ctx.lineWidth = 0.08; ctx.stroke();
    if (open) { blob(ctx, [[0.45, 0.72], [1.35, 0.72], [1.1, 0.25], [0.6, 0.3]], '#5a1a2a', 0.03); ctx.fillStyle = '#f4ecd6'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(0.6 + i * 0.15, 0.72); ctx.lineTo(0.66 + i * 0.15, 0.6); ctx.lineTo(0.72 + i * 0.15, 0.72); ctx.fill(); } }
    // 目（飛び出た半球）
    ctx.beginPath(); ctx.arc(0.85, 1.45, 0.24, 0, TAU); finish(ctx, lit(ctx, 0.9, 1.65, 0.8, 1.25, '#f6f4cc', 0.2, 0.3), 0.04);
    ell(ctx, 0.92, 1.45, 0.1, 0.16, '#0c0c0c'); ell(ctx, 0.96, 1.52, 0.035, 0.035, '#fff');
    // ひげ
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(1.3, 0.85); ctx.bezierCurveTo(1.7, 0.85 + s * 0.2 + sw, 1.9, 0.6 + s * 0.5, 2.2, 0.55 + s * 0.6 + Math.sin(time * 4 + s) * 0.1); ctx.strokeStyle = OUT; ctx.lineWidth = 0.06; ctx.stroke(); ctx.strokeStyle = '#2a5a54'; ctx.lineWidth = 0.035; ctx.stroke(); }
    if (land) for (let i = 0; i < 3; i++) { const t = (time * 1.5 + i / 3) % 1; ell(ctx, -1 + i * 0.9, 0.4 - t * 0.35, 0.04, 0.06, `rgba(150,220,255,${1 - t})`); }
  },
  // ---- 翼の守護者: 青銅の羽根の梟頭の戦士。3 段の羽根の翼、刻みの入った胸当て、鉤爪。狙うと目が赤く光る
  warden(ctx, b, time) {
    const dw = k(b, 'diveWind', 0.8), perch = st(b, 'perch'), dive = st(b, 'dive') || st(b, 'impact');
    const flap = perch ? 0.1 : dive ? -0.6 : Math.sin(time * 9) * 0.6 + dw * 0.8, BR = '#c88a3a';
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(0, 1.5); ctx.rotate(s * (0.25 + flap * 0.5)); ctx.scale(s, 1);
      for (let row = 2; row >= 0; row--) for (let i = 5; i >= 0; i--) {
        const x0 = 0.15 + i * 0.3 - row * 0.05, len = 0.55 + i * 0.12 - row * 0.12;
        ctx.save(); ctx.translate(x0, -row * 0.18); ctx.rotate(-0.5 - i * 0.12 + row * 0.15);
        ctx.beginPath(); ctx.moveTo(0, 0.07); ctx.quadraticCurveTo(len * 0.6, 0.1, len, 0); ctx.quadraticCurveTo(len * 0.6, -0.1, 0, -0.07); ctx.closePath();
        finish(ctx, lit(ctx, 0, 0.1, 0, -0.1, row === 2 ? BR : row === 1 ? dark(BR, 0.2) : dark(BR, 0.4), 0.4, 0.5), 0.02);
        ctx.restore();
      }
      ctx.restore();
    }
    for (const x of [-0.22, 0.22]) { limb(ctx, [x, 0.5], [x * 1.2, 0.12], 0.08, 0.06, '#5a4020'); for (let t = -1; t <= 1; t++) { ctx.beginPath(); ctx.moveTo(x * 1.2, 0.12); ctx.quadraticCurveTo(x * 1.2 + t * 0.1 + 0.08, 0.05, x * 1.2 + t * 0.12 + 0.12, -0.05); ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 0.035; ctx.stroke(); } }
    blob(ctx, [[-0.5, 0.45], [0.5, 0.45], [0.62, 1.2], [0.4, 1.9], [0, 2.05], [-0.4, 1.9], [-0.62, 1.2]], lit(ctx, 0.3, 2.0, -0.3, 0.4, '#d8a858', 0.4, 0.6), 0.05);
    ctx.strokeStyle = 'rgba(90,50,10,0.6)'; ctx.lineWidth = 0.03;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 1.0 + i * 0.22, 0.32, 0.25, Math.PI - 0.25); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,240,200,0.7)'; ctx.beginPath(); ctx.moveTo(0.15, 0.6); ctx.lineTo(0.35, 1.7); ctx.stroke();
    ctx.save(); ctx.translate(0, 2.15);
    blob(ctx, [[-0.45, -0.2], [-0.5, 0.25], [-0.3, 0.42], [0.3, 0.42], [0.5, 0.25], [0.45, -0.2], [0, -0.35]], lit(ctx, 0.2, 0.4, -0.2, -0.3, '#e0b060', 0.4, 0.6));
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 0.32, 0.3); ctx.lineTo(s * 0.5, 0.7); ctx.lineTo(s * 0.18, 0.38); ctx.closePath(); finish(ctx, dark('#e0b060', 0.3), 0.025); }
    for (const x of [-0.17, 0.17]) { ctx.beginPath(); ctx.arc(x, 0.04, 0.16, 0, TAU); finish(ctx, lit(ctx, x, 0.2, x, -0.1, '#fff0c0', 0.2, 0.3), 0.03); if (dw > 0) eye(ctx, x + 0.03, 0.04, 0.06, true); else ell(ctx, x + 0.03, 0.04, 0.07, 0.07, '#140e08'); }
    ctx.beginPath(); ctx.moveTo(0, -0.04); ctx.lineTo(0.08, -0.14); ctx.lineTo(0, -0.32); ctx.lineTo(-0.08, -0.14); ctx.closePath(); finish(ctx, '#3a2a18', 0.02);
    ctx.restore();
    if (dw > 0) { ctx.strokeStyle = `rgba(255,80,60,${0.3 + 0.4 * dw})`; ctx.lineWidth = 0.05; ctx.setLineDash([0.2, 0.15]); ctx.beginPath(); ctx.moveTo(0, 1.4); ctx.lineTo((b.tx - b.x) * (b.face || 1), -(b.y - b.floor)); ctx.stroke(); ctx.setLineDash([]); }
    if (perch) for (let i = 0; i < 3; i++) ell(ctx, (i - 1) * 0.3, 2.8 + Math.sin(time * 4 + i) * 0.1, 0.05, 0.05, 'rgba(255,255,255,0.55)');
  },
  // ---- 炎騎士ヴァルグ: 黒鉄の鎧の割れ目から溶岩の光、炎のたてがみ、燃える大剣
  flameknight(ctx, b, time) {
    const ww = k(b, 'waveWind', 0.7), bw = k(b, 'ballWind', 0.6), sw = k(b, 'slashWind', 0.5), slash = st(b, 'slash'), rec = st(b, 'recover');
    const walk = st(b, 'walk') ? Math.sin(time * 7) : 0, IR = '#3a3036';
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) { const ph = time * 8 + i * 1.3, x = (i - 3.5) * 0.18, h = 0.7 + 0.3 * Math.sin(ph); ctx.beginPath(); ctx.moveTo(x - 0.18, 1.6); ctx.quadraticCurveTo(x, 1.6 + h * 1.4, x + Math.sin(ph) * 0.15, 2.9 + h * 0.6); ctx.quadraticCurveTo(x + 0.1, 2.0, x + 0.18, 1.6); ctx.fillStyle = 'rgba(255,110,30,0.3)'; ctx.fill(); }
    ctx.restore();
    const crack = (pts) => { ctx.strokeStyle = 'rgba(255,140,40,0.95)'; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.stroke(); };
    for (const [x, back] of [[-0.25, true], [0.22, false]]) {
      const s = walk * (back ? 1 : -1) * 0.2;
      limb(ctx, [x, 1.1], [x + s * 0.5, 0.55], 0.17, 0.14, back ? dark(IR, 0.4) : IR, { spec: !back }); limb(ctx, [x + s * 0.5, 0.55], [x + s, 0.08], 0.14, 0.12, back ? dark(IR, 0.4) : IR, { spec: !back });
      blob(ctx, [[x + s - 0.15, 0.0], [x + s + 0.28, 0.0], [x + s + 0.25, 0.14], [x + s - 0.12, 0.16]], '#241c22', 0.03);
    }
    blob(ctx, [[-0.5, 1.0], [0.52, 1.0], [0.62, 1.6], [0.5, 2.15], [0.15, 2.3], [-0.35, 2.25], [-0.6, 1.7]], lit(ctx, 0.4, 2.3, -0.4, 1.0, '#4a4048', 0.5, 0.65), 0.05);
    crack([[-0.3, 2.0], [-0.1, 1.75], [0.05, 1.8], [0.3, 1.45]]); crack([[0.1, 1.2], [0.25, 1.35], [0.4, 1.3]]);
    for (const [x, y] of [[-0.2, 1.1], [0.2, 1.1]]) ell(ctx, x, y, 0.035, 0.035, '#8a8088');
    ctx.save(); ctx.translate(0.12, 2.55);
    blob(ctx, [[-0.3, -0.25], [0.32, -0.25], [0.38, 0.1], [0.2, 0.36], [-0.15, 0.36], [-0.32, 0.12]], lit(ctx, 0.2, 0.35, -0.2, -0.25, '#4a4048', 0.5, 0.6), 0.04);
    ctx.fillStyle = '#ff7a2a'; ctx.fillRect(0.04, -0.03, 0.32, 0.07); glowDot(ctx, 0.25, 0.0, 0.03, 'rgba(255,200,80,1)');
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 0.18, 0.3); ctx.quadraticCurveTo(s * 0.45, 0.55, s * 0.4, 0.85); ctx.quadraticCurveTo(s * 0.3, 0.55, s * 0.08, 0.32); ctx.closePath(); finish(ctx, '#2a2228', 0.025); }
    ctx.restore();
    const ang = slash ? 1.6 : sw ? -1.2 * sw : ww ? -2.8 * ww : bw ? -2.0 * bw : rec ? 1.3 : 0.5;
    ctx.save(); ctx.translate(0.45, 1.95); ctx.rotate(-ang);
    limb(ctx, [0, 0.2], [0, -0.35], 0.13, 0.11, IR, { spec: true });
    ctx.beginPath(); ctx.rect(-0.22, -0.42, 0.44, 0.08); finish(ctx, '#d8b25a', 0.02);
    ctx.beginPath(); ctx.moveTo(-0.09, -0.42); ctx.lineTo(0.09, -0.42); ctx.lineTo(0.06, -1.7); ctx.lineTo(0, -1.88); ctx.lineTo(-0.06, -1.7); ctx.closePath();
    finish(ctx, lit(ctx, -0.1, -1, 0.1, -1, '#ffb050', 0.8, 0.3), 0.025);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,120,40,0.5)'; ctx.lineWidth = 0.18; ctx.beginPath(); ctx.moveTo(0, -0.45); ctx.lineTo(0, -1.8); ctx.stroke(); ctx.restore();
    if (ww || bw) glowDot(ctx, 0, -1.7, 0.2 + (ww + bw) * 0.2, 'rgba(255,170,60,0.95)');
    ctx.restore();
    if (slash) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 3; i++) { ctx.strokeStyle = `rgba(255,${180 - i * 40},80,${0.8 - i * 0.2})`; ctx.lineWidth = 0.14 - i * 0.03; ctx.beginPath(); ctx.arc(0.5, 1.4, 1.5 + i * 0.12, -1.0, 1.1); ctx.stroke(); } ctx.restore(); }
  },
  // ---- 魔城の主ノクス: 骨の冠の大きな影の魔導師。内側の赤い外套、多眼の青白い顔、骨の手、渦巻く宝珠。段階ごとに目が増え、外套が裂けて光る
  lord(ctx, b, time) {
    const ph = b.phase, ring = k(b, 'ringWind', 0.8), sweepW = k(b, 'sweepWind', 1.0), tired = st(b, 'tired');
    let alpha = 1; if (st(b, 'warpOut')) alpha = 1 - Math.min(1, b.t / 0.45); if (st(b, 'warpIn')) alpha = Math.min(1, b.t / 0.4);
    ctx.globalAlpha *= alpha;
    const spread = 1 + Math.sin(time * 2) * 0.05 + ring * 0.25;
    // 外套の裏地（赤）→ 表（黒紫）
    ctx.beginPath(); ctx.moveTo(0, 3.25); ctx.bezierCurveTo(-1.5 * spread, 2.9, -2.05 * spread, 1.2, -1.95 * spread, 0.1);
    for (let i = 0; i <= 8; i++) ctx.lineTo(-1.95 * spread + i * 0.49 * spread, 0.1 + (i % 2) * 0.32 + Math.sin(time * 5 + i) * 0.06);
    ctx.bezierCurveTo(2.05 * spread, 1.2, 1.5 * spread, 2.9, 0, 3.25); ctx.closePath();
    finish(ctx, lit(ctx, 0, 3.2, 0, 0, ph >= 3 ? '#5a1424' : '#2a1a4a', 0.35, 0.7), 0.06);
    blob(ctx, [[-0.9, 0.3], [-0.55, 2.4], [0, 2.9], [0.55, 2.4], [0.9, 0.3], [0, 0.6]], lit(ctx, 0, 2.6, 0, 0.3, '#7a1428', 0.3, 0.6), 0.04);
    ctx.strokeStyle = ph >= 2 ? 'rgba(255,80,110,0.85)' : 'rgba(150,110,230,0.8)'; ctx.lineWidth = 0.045;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-1.4 + i * 0.95, 0.35); ctx.quadraticCurveTo(-0.7 + i * 0.45, 1.6, -0.35 + i * 0.25, 2.6); ctx.stroke(); }
    if (ph >= 3) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,90,60,0.8)'; ctx.lineWidth = 0.04; for (const [x, y] of [[-1.2, 1.0], [1.1, 1.4], [-0.6, 0.6]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.2, y + 0.3); ctx.lineTo(x + 0.05, y + 0.5); ctx.stroke(); } ctx.restore(); }
    ctx.strokeStyle = 'rgba(170,205,255,0.7)'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(0, 3.2); ctx.bezierCurveTo(-1.45 * spread, 2.85, -2.0 * spread, 1.2, -1.92 * spread, 0.2); ctx.stroke();
    // 骨の手
    for (const s of [-1, 1]) { const hx = s * (0.95 + ring * 0.3), hy = 1.6 + ring * 0.3; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + s * (0.15 + i * 0.03), hy + 0.25 - i * 0.12); ctx.strokeStyle = OUT; ctx.lineWidth = 0.07; ctx.stroke(); ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = 0.04; ctx.stroke(); } }
    // 頭
    ctx.save(); ctx.translate(0, 3.35);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 0.25, 0.35); ctx.quadraticCurveTo(s * 0.75, 0.75, s * 0.7, 1.35); ctx.quadraticCurveTo(s * 0.5, 0.8, s * 0.1, 0.45); ctx.closePath(); finish(ctx, lit(ctx, s * 0.5, 1.2, s * 0.3, 0.4, '#d8d0c0', 0.3, 0.6), 0.035); }
    blob(ctx, [[-0.45, -0.35], [-0.52, 0.2], [-0.3, 0.55], [0.3, 0.55], [0.52, 0.2], [0.45, -0.35], [0, -0.55]], lit(ctx, 0.2, 0.5, -0.2, -0.5, '#dcd4ec', 0.25, 0.6));
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-0.38 + i * 0.19, 0.45); ctx.lineTo(-0.3 + i * 0.19, 0.78 + (i === 2 ? 0.22 : 0)); ctx.lineTo(-0.22 + i * 0.19, 0.45); ctx.closePath(); finish(ctx, lit(ctx, 0, 0.9, 0, 0.45, '#d8b25a', 0.6, 0.4), 0.02); }
    const eyes = ph >= 2 ? [[-0.2, 0.05], [0.2, 0.05], [0, 0.25]] : [[-0.18, 0.05], [0.18, 0.05]];
    if (ph >= 3) eyes.push([-0.33, 0.22], [0.33, 0.22]);
    for (const [x, y] of eyes) { ell(ctx, x, y, 0.08, 0.07, '#140818'); eye(ctx, x, y, 0.05 + sweepW * 0.03, !!sweepW); }
    ctx.beginPath(); ctx.moveTo(-0.22, -0.28); ctx.quadraticCurveTo(0, -0.42 - ring * 0.1, 0.22, -0.28); ctx.strokeStyle = '#1a0a10'; ctx.lineWidth = 0.05; ctx.stroke();
    ctx.restore();
    // 宝珠（渦）
    const oy = 1.75, orR = 0.25 + ring * 0.3 + Math.sin(time * 6) * 0.03;
    glowDot(ctx, 0, oy, orR, ph >= 3 ? 'rgba(255,80,100,0.95)' : 'rgba(170,100,255,0.95)');
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.03; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, oy, orR * (1.2 + i * 0.35), time * (2 + i) + i, time * (2 + i) + i + 1.6); ctx.stroke(); }
    if (sweepW) { ctx.strokeStyle = `rgba(255,70,50,${0.4 + 0.5 * Math.sin(time * 30) ** 2})`; ctx.lineWidth = 0.06; const y = b.low ? 0.45 - (b.y - b.floor) : 1.33 - (b.y - b.floor); ctx.setLineDash([0.3, 0.2]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(30 * (b.dir * (b.face || 1)), y); ctx.stroke(); ctx.setLineDash([]); }
    if (tired) for (let i = 0; i < 3; i++) ell(ctx, (i - 1) * 0.45, 4.4 + Math.sin(time * 4 + i) * 0.1, 0.06, 0.06, 'rgba(255,255,255,0.5)');
    void lite;
  },
};
