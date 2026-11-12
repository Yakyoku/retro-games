// 月影の魔城 — 武器・アイテム・敵の攻撃の見た目（作り直し版）
// 武器は木目の柄と鋼、回る斧は残像、火は芯と炎の舌。敵の弾は「芯・光輪・尾」、雷はジグザグ、衝撃波は破片
import { lit, limb, finish, glowDot, dark } from './figures.js';

const TAU = Math.PI * 2;
const ell = (ctx, x, y, rx, ry, fill, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); ctx.fillStyle = fill; ctx.fill(); };
function add(ctx, fn) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); }
function flame(ctx, x, y, r, time, seed = 0, k = 1) { // 炎の舌（芯は白、外は橙→赤）
  add(ctx, () => {
    for (let i = 0; i < 4; i++) {
      const ph = time * 14 + seed + i * 1.7, h = r * (1.6 + 0.6 * Math.sin(ph)) * k, w = r * (0.75 - i * 0.12);
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w * 0.8, y + h * 0.6, x + Math.sin(ph) * r * 0.3, y + h); ctx.quadraticCurveTo(x + w * 0.8, y + h * 0.5, x + w, y); ctx.quadraticCurveTo(x, y - r * 0.6, x - w, y);
      const g = ctx.createLinearGradient(0, y - r * 0.5, 0, y + h); g.addColorStop(0, 'rgba(255,250,215,0.95)'); g.addColorStop(0.45, 'rgba(255,150,40,0.8)'); g.addColorStop(1, 'rgba(200,40,10,0)');
      ctx.fillStyle = g; ctx.fill();
    }
  });
}
function orb(ctx, r, core, halo, time, swirl) {
  add(ctx, () => { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.6); g.addColorStop(0, `rgba(${halo},0.75)`); g.addColorStop(1, `rgba(${halo},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 2.6, 0, TAU); ctx.fill(); });
  ell(ctx, 0, 0, r, r, `rgb(${core})`); ell(ctx, -r * 0.25, r * 0.25, r * 0.45, r * 0.45, 'rgba(255,255,255,0.9)');
  if (swirl) { ctx.strokeStyle = `rgba(${halo},0.9)`; ctx.lineWidth = r * 0.25; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(0, 0, r * 1.5, time * 9 + i * Math.PI, time * 9 + i * Math.PI + 1.8); ctx.stroke(); } }
}
function tail(ctx, s, r, rgb) { // 進んできた向きの尾
  const v = Math.hypot(s.vx, s.vy) || 1, dx = -s.vx / v, dy = -s.vy / v;
  add(ctx, () => { const g = ctx.createLinearGradient(0, 0, dx * r * 6, dy * r * 6); g.addColorStop(0, `rgba(${rgb},0.6)`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.strokeStyle = g; ctx.lineWidth = r * 1.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dx * r * 6, dy * r * 6); ctx.stroke(); });
}

// ---------------------------------------------------------------- 騎士の武器（飛んでいる）
export function drawShotNew(ctx, s, time) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (s.kind === 'lance') {
    limb(ctx, [-0.68, 0], [0.3, 0], 0.045, 0.04, '#8a6638', { rim: false });
    ctx.strokeStyle = 'rgba(60,35,15,0.6)'; ctx.lineWidth = 0.012; for (const y of [-0.012, 0.014]) { ctx.beginPath(); ctx.moveTo(-0.6, y); ctx.lineTo(0.25, y * 0.6); ctx.stroke(); }
    ctx.beginPath(); ctx.rect(0.22, -0.06, 0.08, 0.12); finish(ctx, '#c8a050', 0.015);
    ctx.beginPath(); ctx.moveTo(0.66, 0); ctx.lineTo(0.3, -0.1); ctx.lineTo(0.36, 0); ctx.lineTo(0.3, 0.1); ctx.closePath(); finish(ctx, lit(ctx, 0.4, 0.1, 0.4, -0.1, '#dfe8f2', 0.8, 0.5), 0.02);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.015; ctx.beginPath(); ctx.moveTo(0.34, 0.03); ctx.lineTo(0.6, 0.005); ctx.stroke();
  } else if (s.kind === 'dagger') {
    ctx.beginPath(); ctx.moveTo(0.42, 0); ctx.lineTo(0.02, -0.075); ctx.lineTo(0.02, 0.075); ctx.closePath(); finish(ctx, lit(ctx, 0.2, 0.08, 0.2, -0.08, '#eef4fb', 0.8, 0.5), 0.02);
    ctx.strokeStyle = 'rgba(120,140,160,0.8)'; ctx.lineWidth = 0.01; ctx.beginPath(); ctx.moveTo(0.04, 0); ctx.lineTo(0.36, 0); ctx.stroke();
    ctx.beginPath(); ctx.rect(-0.01, -0.12, 0.04, 0.24); finish(ctx, '#d8b25a', 0.012); limb(ctx, [-0.25, 0], [-0.02, 0], 0.03, 0.03, '#5a3a22', { rim: false });
    ell(ctx, -0.27, 0, 0.04, 0.04, '#d8b25a');
  } else if (s.kind === 'axe') {
    // 回転の残像（扇形の薄い光）
    add(ctx, () => { ctx.fillStyle = 'rgba(210,225,240,0.18)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 0.42, -s.t * 14 + 0.2, -s.t * 14 + 1.6); ctx.closePath(); ctx.fill(); });
    ctx.save(); ctx.rotate(-s.t * 14);
    limb(ctx, [0, -0.34], [0, 0.34], 0.035, 0.035, '#7a4e26', { rim: false });
    ctx.beginPath(); ctx.moveTo(0, 0.3); ctx.quadraticCurveTo(0.36, 0.44, 0.34, 0.04); ctx.quadraticCurveTo(0.16, 0.12, 0, 0.12); ctx.closePath(); finish(ctx, lit(ctx, 0.3, 0.4, 0, 0.1, '#cfd8e2', 0.85, 0.5), 0.022);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.02; ctx.beginPath(); ctx.moveTo(0.3, 0.36); ctx.quadraticCurveTo(0.36, 0.2, 0.33, 0.07); ctx.stroke();
    ctx.restore();
  } else if (s.kind === 'torch') {
    ctx.save(); ctx.rotate(-s.t * 10); limb(ctx, [0, -0.22], [0, 0.12], 0.04, 0.035, '#6b4320', { rim: false }); ctx.restore();
    flame(ctx, 0, 0.0, 0.14, time, s.t * 3);
  }
}
export function drawBurnNew(ctx, f, time) {
  const k = Math.min(1, f.t / 0.3, (f.life - f.t) / 0.15 + 0.2);
  for (let i = 0; i < 5; i++) flame(ctx, (i - 2) * 0.28 + Math.sin(time * 3 + i) * 0.04, 0, 0.2 + (i % 2) * 0.06, time, i * 2.1, k * 1.6);
  for (let i = 0; i < 4; i++) { const t = (time * 1.4 + i * 0.25) % 1; ell(ctx, (i - 1.5) * 0.3 + Math.sin(time + i) * 0.1, t * 1.6, 0.03, 0.03, `rgba(255,200,90,${(1 - t) * k})`); }
}

// ---------------------------------------------------------------- アイテム
export function drawItemNew(ctx, it, time) {
  const bob = Math.sin(time * 3 + (it.id || 0)) * 0.06 + 0.1;
  ctx.translate(0, bob);
  if (it.kind === 'weapon') {
    // 光の柱の中の壺。壺の口から武器がのぞく
    add(ctx, () => { const g = ctx.createLinearGradient(0, 0, 0, 1.6); g.addColorStop(0, 'rgba(255,220,130,0.35)'); g.addColorStop(1, 'rgba(255,220,130,0)'); ctx.fillStyle = g; ctx.fillRect(-0.3, 0, 0.6, 1.6); });
    ctx.save(); ctx.translate(0.02, 0.55); ctx.rotate(Math.PI / 2 - 0.45 + Math.sin(time * 2) * 0.08); drawHeld(ctx, it.weapon); ctx.restore();
    ctx.beginPath(); ctx.moveTo(-0.2, 0.02); ctx.quadraticCurveTo(-0.34, 0.25, -0.16, 0.42); ctx.lineTo(0.16, 0.42); ctx.quadraticCurveTo(0.34, 0.25, 0.2, 0.02); ctx.closePath(); finish(ctx, lit(ctx, 0.15, 0.4, -0.15, 0, '#b0603a', 0.4, 0.6), 0.025);
    ctx.beginPath(); ctx.ellipse(0, 0.43, 0.17, 0.045, 0, 0, TAU); finish(ctx, '#7a3a20', 0.02);
    ctx.strokeStyle = '#e8c070'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(-0.24, 0.22); ctx.quadraticCurveTo(0, 0.18, 0.24, 0.22); ctx.stroke();
    const tw = 0.5 + 0.5 * Math.sin(time * 5); glowDot(ctx, 0.28, 0.9, 0.025 * tw + 0.01, 'rgba(255,240,180,1)');
  } else if (it.kind === 'treasure') {
    ctx.beginPath(); ctx.rect(-0.34, 0, 0.68, 0.36); finish(ctx, lit(ctx, 0, 0.36, 0, 0, '#a8642a', 0.35, 0.6), 0.025);
    ctx.beginPath(); ctx.moveTo(-0.36, 0.36); ctx.quadraticCurveTo(0, 0.68, 0.36, 0.36); ctx.closePath(); finish(ctx, lit(ctx, 0, 0.6, 0, 0.36, '#c07a34', 0.4, 0.5), 0.025);
    for (const x of [-0.24, 0.24]) { ctx.beginPath(); ctx.rect(x - 0.04, 0, 0.08, 0.36); finish(ctx, lit(ctx, x, 0.36, x, 0, '#8a949e', 0.7, 0.5), 0.015); }
    ctx.beginPath(); ctx.rect(-0.07, 0.24, 0.14, 0.16); finish(ctx, lit(ctx, 0, 0.4, 0, 0.24, '#e0b850', 0.7, 0.4), 0.015); ell(ctx, 0, 0.3, 0.02, 0.03, '#2a1a0a');
    add(ctx, () => { for (let i = 0; i < 3; i++) { const a = time * 2 + i * 2.1, t = (time * 0.8 + i / 3) % 1; ell(ctx, Math.cos(a) * 0.3, 0.45 + t * 0.4, 0.025 * (1 - t), 0.025 * (1 - t), 'rgba(255,230,140,1)'); } });
  } else if (it.kind === 'armor') {
    add(ctx, () => { const g = ctx.createRadialGradient(0, 0.4, 0, 0, 0.4, 0.7); g.addColorStop(0, 'rgba(150,200,255,0.5)'); g.addColorStop(1, 'rgba(150,200,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0.4, 0.7, 0, TAU); ctx.fill(); });
    ctx.beginPath(); ctx.moveTo(-0.3, 0.72); ctx.quadraticCurveTo(0, 0.8, 0.3, 0.72); ctx.quadraticCurveTo(0.34, 0.35, 0.18, 0.12); ctx.quadraticCurveTo(0, 0.05, -0.18, 0.12); ctx.quadraticCurveTo(-0.34, 0.35, -0.3, 0.72); ctx.closePath();
    finish(ctx, lit(ctx, 0.2, 0.75, -0.2, 0.1, '#b8c8de', 0.8, 0.55), 0.025);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(0.05, 0.7); ctx.quadraticCurveTo(0.1, 0.4, 0.04, 0.16); ctx.stroke();
    for (const x of [-0.15, 0.15]) ell(ctx, x, 0.62, 0.02, 0.02, '#e8eef6');
  }
}
export function drawHeld(ctx, w) {
  if (w === 'lance') { limb(ctx, [0, -0.5], [0, 0.55], 0.035, 0.035, '#8a6638', { rim: false }); ctx.beginPath(); ctx.moveTo(0, 0.95); ctx.lineTo(-0.08, 0.55); ctx.lineTo(0.08, 0.55); ctx.closePath(); finish(ctx, lit(ctx, -0.08, 0.7, 0.08, 0.7, '#dfe8f2', 0.8, 0.5), 0.02); }
  else if (w === 'dagger') { ctx.beginPath(); ctx.moveTo(0, 0.48); ctx.lineTo(-0.05, 0.08); ctx.lineTo(0.05, 0.08); ctx.closePath(); finish(ctx, lit(ctx, -0.05, 0.3, 0.05, 0.3, '#eef4fb', 0.8, 0.5), 0.018); ctx.beginPath(); ctx.rect(-0.1, 0.04, 0.2, 0.04); finish(ctx, '#d8b25a', 0.01); limb(ctx, [0, -0.15], [0, 0.04], 0.025, 0.025, '#5a3a22', { rim: false }); }
  else if (w === 'axe') { limb(ctx, [0, -0.25], [0, 0.48], 0.03, 0.03, '#7a4e26', { rim: false }); ctx.beginPath(); ctx.moveTo(0, 0.45); ctx.quadraticCurveTo(0.34, 0.56, 0.32, 0.16); ctx.lineTo(0, 0.26); ctx.closePath(); finish(ctx, lit(ctx, 0.3, 0.5, 0, 0.2, '#cfd8e2', 0.8, 0.5), 0.02); }
  else if (w === 'torch') { limb(ctx, [0, -0.2], [0, 0.25], 0.035, 0.03, '#6b4320', { rim: false }); flame(ctx, 0, 0.27, 0.1, performance.now() / 1000); }
}

// ---------------------------------------------------------------- 敵の攻撃
export function drawEShotNew(ctx, s, time) {
  const k = s.kind;
  ctx.lineCap = 'round';
  if (k === 'bone') { ctx.rotate(s.t * 12); limb(ctx, [-0.16, 0], [0.16, 0], 0.035, 0.035, '#efe6cc', { rim: false }); for (const x of [-0.18, 0.18]) for (const y of [-0.04, 0.04]) { ctx.beginPath(); ctx.arc(x, y, 0.045, 0, TAU); finish(ctx, '#efe6cc', 0.015); } }
  else if (k === 'orb') { tail(ctx, s, 0.2, '190,110,255'); orb(ctx, 0.17, '250,220,255', '170,90,255', time, true); }
  else if (k === 'fireball') { tail(ctx, s, s.r || 0.25, '255,120,40'); flame(ctx, 0, -0.1, (s.r || 0.25) * 0.9, time, s.x); orb(ctx, (s.r || 0.25) * 0.6, '255,245,200', '255,120,40', time, false); }
  else if (k === 'water') { tail(ctx, s, 0.2, '140,210,255'); ctx.rotate(Math.atan2(s.vy, s.vx) - Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, -0.28); ctx.quadraticCurveTo(0.26, 0.05, 0, 0.22); ctx.quadraticCurveTo(-0.26, 0.05, 0, -0.28); finish(ctx, lit(ctx, 0.1, 0.2, -0.1, -0.2, '#6ab8e8', 0.6, 0.4), 0.02); ell(ctx, -0.06, 0.06, 0.05, 0.08, 'rgba(255,255,255,0.85)'); }
  else if (k === 'feather') { ctx.rotate(Math.atan2(s.vy, s.vx)); ctx.beginPath(); ctx.moveTo(0.34, 0); ctx.quadraticCurveTo(0, 0.12, -0.32, 0.03); ctx.lineTo(-0.32, -0.03); ctx.quadraticCurveTo(0, -0.12, 0.34, 0); finish(ctx, lit(ctx, 0, 0.12, 0, -0.12, '#e0a050', 0.4, 0.5), 0.02); ctx.strokeStyle = '#6a4418'; ctx.lineWidth = 0.015; ctx.beginPath(); ctx.moveTo(-0.38, 0); ctx.lineTo(0.3, 0); ctx.stroke(); }
  else if (k === 'clod') { ctx.rotate(s.t * 5); ctx.beginPath(); ctx.moveTo(-0.4, -0.2); ctx.lineTo(-0.1, -0.42); ctx.lineTo(0.35, -0.3); ctx.lineTo(0.42, 0.1); ctx.lineTo(0.1, 0.4); ctx.lineTo(-0.35, 0.25); ctx.closePath(); finish(ctx, lit(ctx, 0.2, 0.4, -0.2, -0.4, '#7a5c3c', 0.4, 0.6), 0.03); ell(ctx, 0.1, 0.1, 0.08, 0.06, 'rgba(160,140,110,0.8)'); }
  else if (k === 'wave') {
    const h = s.box.h, w = s.box.w, dir = Math.sign(s.vx) || 1;
    if (s.fire) { for (let i = 0; i < 4; i++) flame(ctx, (-w / 2 + (i + 0.5) * w / 4) * dir, 0, w / 7, time, i * 1.3 + s.x, h * 1.6); }
    else {
      for (let i = 0; i < 6; i++) { const x = (-w / 2 + (i + 0.5) * w / 6) * dir, hh = h * (0.5 + ((i * 7) % 5) / 8); ctx.beginPath(); ctx.moveTo(x - 0.1, 0); ctx.lineTo(x - 0.02, hh); ctx.lineTo(x + 0.1, hh * 0.7); ctx.lineTo(x + 0.12, 0); ctx.closePath(); finish(ctx, lit(ctx, x, hh, x, 0, i % 2 ? '#8a6a48' : '#a8845a', 0.4, 0.5), 0.02); }
      for (let i = 0; i < 4; i++) { const t = (time * 3 + i * 0.25) % 1; ell(ctx, -dir * (0.3 + t * 0.4), t * 0.6, 0.05 * (1 - t), 0.05 * (1 - t), '#a8845a'); }
    }
  }
  else if (k === 'mark') { const a = 0.5 + 0.5 * Math.sin(time * 20); ctx.strokeStyle = `rgba(255,90,60,${0.5 + 0.5 * a})`; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.ellipse(0, 0.03, 0.55, 0.13, 0, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, 0.03, 0.3 + a * 0.2, 0.07, 0, 0, TAU); ctx.stroke(); ctx.strokeStyle = `rgba(255,90,60,${0.35 * a})`; ctx.beginPath(); ctx.moveTo(0, 0.2); ctx.lineTo(0, 1.2); ctx.stroke(); }
  else if (k === 'pillar') {
    if (!s.active) { const a = 0.3 + 0.3 * Math.sin(time * 25); ctx.fillStyle = `rgba(190,150,255,${a * 0.35})`; ctx.fillRect(-0.5, 0, 1, 12); ctx.strokeStyle = `rgba(230,200,255,${a + 0.2})`; ctx.lineWidth = 0.04; ctx.setLineDash([0.25, 0.15]); ctx.strokeRect(-0.5, 0, 1, 12); ctx.setLineDash([]); ell(ctx, 0, 0.05, 0.6, 0.12, `rgba(220,180,255,${a})`); }
    else add(ctx, () => {
      const g = ctx.createLinearGradient(-0.7, 0, 0.7, 0); g.addColorStop(0, 'rgba(160,100,255,0)'); g.addColorStop(0.5, 'rgba(200,170,255,0.6)'); g.addColorStop(1, 'rgba(160,100,255,0)'); ctx.fillStyle = g; ctx.fillRect(-0.7, 0, 1.4, 12);
      for (let j = 0; j < 2; j++) { ctx.strokeStyle = j ? 'rgba(255,255,255,0.95)' : 'rgba(200,160,255,0.8)'; ctx.lineWidth = j ? 0.06 : 0.16; ctx.beginPath(); let x = 0; ctx.moveTo(0, 12); for (let y = 12; y > 0; y -= 0.6) { x = Math.sin(y * 3.1 + Math.floor(time * 30) + j) * 0.25; ctx.lineTo(x, y); } ctx.lineTo(0, 0); ctx.stroke(); }
      ell(ctx, 0, 0.05, 0.8, 0.18, 'rgba(230,210,255,0.8)');
    });
  }
  else if (k === 'beam') add(ctx, () => {
    const w = s.box.w, h = s.box.h;
    const g = ctx.createLinearGradient(0, -0.1, 0, h + 0.1); g.addColorStop(0, 'rgba(255,60,40,0)'); g.addColorStop(0.3, 'rgba(255,90,60,0.8)'); g.addColorStop(0.5, 'rgba(255,245,230,1)'); g.addColorStop(0.7, 'rgba(255,90,60,0.8)'); g.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = g; ctx.fillRect(-w / 2, -0.1, w, h + 0.2);
    ctx.strokeStyle = 'rgba(255,200,170,0.5)'; ctx.lineWidth = 0.02; for (let i = 0; i < 3; i++) { ctx.beginPath(); for (let x = -w / 2; x <= w / 2; x += 0.15) ctx.lineTo(x, h / 2 + Math.sin(x * 9 + time * 40 + i) * 0.12 * (i + 1)); ctx.stroke(); }
  });
  else { tail(ctx, s, s.r || 0.25, '255,90,70'); orb(ctx, (s.r || 0.25) * 0.7, '255,230,220', '255,90,70', time, false); }
  void dark;
}
