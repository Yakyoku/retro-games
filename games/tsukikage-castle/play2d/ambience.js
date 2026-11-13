// 月影の魔城 — 背景の空気感（空の星・流れ星・月を横切る蝙蝠・稲光・壁の松明・鎖・旗・蜘蛛の巣・蝋燭・灯の揺らぎ・
// 地面の霧・溶岩の陽炎・水面の月の映り込みと波紋・火の粉・ボス戦の空の色）。すべて決定的な疑似乱数と時刻で動く
const TAU = Math.PI * 2;
const H = (a, b = 0) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---------------------------------------------------------------- 空（盤面の座標ではなく画面の座標）
export function skyExtras(r, ctx, cx, cy) {
  const F = r.field, th = r.th, t = r.time, theme = r.def.theme;
  if (theme === 'cave') return;
  // 瞬く星（遠景より奥。わずかに視差）
  for (let i = 0; i < 70; i++) {
    const x = F.x + ((H(i, 1) * F.w * 1.3 - cx * r.T * 0.02) % F.w + F.w) % F.w, y = F.y + H(i, 2) * F.h * 0.55;
    const tw = 0.5 + 0.5 * Math.sin(t * (1 + H(i, 3) * 3) + i), a = (0.25 + 0.6 * H(i, 4)) * tw;
    ctx.fillStyle = `rgba(220,230,255,${a})`; const s = H(i, 5) < 0.1 ? 2 : 1; ctx.fillRect(Math.round(x), Math.round(y), s, s);
  }
  // 流れ星（数秒に 1 回）
  const k = Math.floor(t / 7), ph = t / 7 - k;
  if (ph < 0.12 && H(k, 9) < 0.7) {
    const sx = F.x + F.w * (0.2 + H(k, 10) * 0.6), sy = F.y + F.h * (0.05 + H(k, 11) * 0.2), q = ph / 0.12;
    const x = sx + q * F.w * 0.18, y = sy + q * F.h * 0.08;
    const g = ctx.createLinearGradient(x, y, x - F.w * 0.06, y - F.h * 0.027); g.addColorStop(0, `rgba(255,255,255,${1 - q})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = g; ctx.lineWidth = Math.max(1, r.T * 0.04); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - F.w * 0.06, y - F.h * 0.027); ctx.stroke();
  }
  // 月を横切る蝙蝠の群れ（墓地・塔・村）
  if (th.moon && (theme === 'graveyard' || theme === 'tower' || theme === 'village')) {
    const cyc = 23, kk = Math.floor(t / cyc), q = (t / cyc - kk);
    if (q < 0.35) {
      const [mx, my] = th.moon, bx = F.x + F.w * (mx - 0.25 + q * 1.6), by = F.y + F.h * (my + 0.04 - q * 0.12);
      ctx.fillStyle = '#05060f';
      for (let i = 0; i < 7; i++) {
        const x = bx - i * r.T * 0.6 - H(kk, i) * r.T, y = by + Math.sin(t * 3 + i) * r.T * 0.3 + H(i, kk) * r.T * 1.2, w = r.T * 0.22, f = Math.sin(t * 22 + i * 2);
        ctx.beginPath(); ctx.moveTo(x - w, y - f * w * 0.6); ctx.lineTo(x, y + w * 0.2); ctx.lineTo(x + w, y - f * w * 0.6); ctx.lineTo(x, y - w * 0.15); ctx.closePath(); ctx.fill();
      }
    }
  }
}
// 稲光（魔城・塔・村でまれに）: 画面全体を一瞬青白く
export function lightning(r, ctx) {
  const theme = r.def.theme, t = r.time;
  if (!(theme === 'citadel' || theme === 'tower' || theme === 'village')) return 0;
  const k = Math.floor(t / 9), ph = t / 9 - k;
  if (H(k, 77) > 0.45 || ph > 0.06) return 0;
  const a = ph < 0.02 ? 0.35 : ph < 0.035 ? 0.08 : ph < 0.05 ? 0.25 : 0.05;
  ctx.fillStyle = `rgba(200,215,255,${a})`; ctx.fillRect(0, 0, r.W, r.H);
  return a;
}

// ---------------------------------------------------------------- 盤面の奥の飾り（地形より奥）
export function backExtras(r, ctx, g) {
  const v = r.view, t = r.time, theme = g.def.theme, T = v.T;
  const X0 = Math.floor(v.x0) - 2, X1 = Math.ceil(v.x1) + 2;
  // 城のテーマ: 壁の松明（10u ごと）・下がる鎖・はためく旗
  if (theme === 'fortress' || theme === 'citadel' || theme === 'tower') {
    for (let x = Math.floor(X0 / 10) * 10 + 4; x <= X1; x += 10) {
      const top = r.def.vertical ? Math.floor(v.y0 / 10) * 10 + 7 : 7;
      for (let ty = top; ty <= (r.def.vertical ? v.y1 : top); ty += 10) {
        r.at(ctx, x, ty);
        ctx.fillStyle = '#2a1a14'; ctx.fillRect(-0.06, -0.35, 0.12, 0.4); ctx.fillRect(-0.15, 0.0, 0.3, 0.08);
        const fl = 0.85 + 0.15 * Math.sin(t * 13 + x) + 0.1 * Math.sin(t * 29 + x * 2);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createRadialGradient(0, 0.25, 0, 0, 0.25, 1.6 * fl); gr.addColorStop(0, 'rgba(255,160,60,0.45)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0.25, 1.6 * fl, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,230,150,0.95)'; ctx.beginPath(); ctx.moveTo(-0.1, 0.08); ctx.quadraticCurveTo(-0.08, 0.3, Math.sin(t * 9 + x) * 0.04, 0.48 * fl); ctx.quadraticCurveTo(0.08, 0.3, 0.1, 0.08); ctx.fill();
        ctx.restore();
      }
    }
    if (!r.def.vertical) for (let x = Math.floor(X0 / 13) * 13 + 9; x <= X1; x += 13) {
      // 鎖（ゆっくり揺れる）
      r.at(ctx, x, 13.5); const sw = Math.sin(t * 0.9 + x) * 0.12;
      ctx.strokeStyle = 'rgba(70,64,80,0.9)'; ctx.lineWidth = 0.05;
      for (let i = 0; i < 9; i++) { const y = -i * 0.32, ox = sw * (i / 9) * (i / 9) * 4; ctx.beginPath(); ctx.ellipse(ox, y, i % 2 ? 0.05 : 0.08, 0.15, 0, 0, TAU); ctx.stroke(); }
      // 旗（城塞は赤、魔城は紫）
      r.at(ctx, x + 5, 11);
      ctx.fillStyle = '#3a2a20'; ctx.fillRect(-0.04, -2.6, 0.08, 2.8);
      ctx.beginPath(); ctx.moveTo(0.04, 0);
      for (let i = 0; i <= 8; i++) { const yy = -i * 0.28, w = 1.1 + Math.sin(t * 3 - i * 0.6 + x) * 0.12; ctx.lineTo(0.04 + w * (1 - i * 0.02), yy); }
      ctx.lineTo(0.6, -2.5); ctx.lineTo(0.04, -2.24); ctx.closePath();
      ctx.fillStyle = theme === 'fortress' ? '#7a1e1a' : '#4a2470'; ctx.fill(); ctx.strokeStyle = 'rgba(216,178,90,0.7)'; ctx.lineWidth = 0.03; ctx.stroke();
      ctx.strokeStyle = 'rgba(216,178,90,0.8)'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(0.6, -1.0, 0.22, 0, TAU); ctx.stroke();
    }
  }
  // 地下墓所・塔: 角の蜘蛛の巣
  if (theme === 'village' || theme === 'tower') {
    for (let x = Math.floor(X0 / 11) * 11 + 3; x <= X1; x += 11) {
      const y = theme === 'village' ? 7.98 : Math.floor(v.y1 / 10) * 10 + 0.98;
      r.at(ctx, x, y); ctx.strokeStyle = 'rgba(210,210,230,0.35)'; ctx.lineWidth = 0.02;
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2) * -1 - 0.1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 1.0, Math.sin(a) * 1.0); ctx.stroke(); }
      for (let k = 1; k <= 3; k++) { ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 - (i / 4) * (Math.PI / 2) - 0.1, rr = k * 0.3 + Math.sin(i * 2) * 0.03; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); } ctx.stroke(); }
    }
  }
  // 墓の蝋燭（墓石のいくつかに）
  if (theme === 'graveyard') for (const d of g.def.deco) {
    if (d.type !== 'grave' || d.x < X0 || d.x > X1 || H(d.x, 5) > 0.55) continue;
    r.at(ctx, d.x + 0.92, d.y);
    ctx.fillStyle = '#e8e0c8'; ctx.fillRect(-0.04, 0, 0.08, 0.22);
    const fl = 0.8 + 0.2 * Math.sin(t * 17 + d.x);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(0, 0.3, 0, 0, 0.3, 0.7 * fl); gr.addColorStop(0, 'rgba(255,190,90,0.5)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0.3, 0.7 * fl, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,180,1)'; ctx.beginPath(); ctx.ellipse(0, 0.3, 0.035, 0.07 * fl, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
}

// ---------------------------------------------------------------- 手前の空気（キャラクターより手前）
export function frontExtras(r, ctx, g) {
  const v = r.view, t = r.time;
  for (const d of g.def.deco) {
    if ((d.type !== 'lava' && d.type !== 'water') || d.x + d.w < v.x0 || d.x > v.x1) continue;
    const surf = d.type === 'water' ? 2 : d.y;
    r.at(ctx, d.x, surf);
    if (d.type === 'lava') {
      // 陽炎（揺らぐ明るい筋）と火の粉
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < d.w * 2; i++) { const x = (i * 0.5 + Math.sin(t * 2 + i) * 0.1), y0 = 0.4 + ((t * 0.8 + H(i, d.x)) % 1) * 2.2; ctx.strokeStyle = `rgba(255,150,60,${0.12 * (1 - y0 / 2.6)})`; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(x, y0); ctx.quadraticCurveTo(x + 0.15 * Math.sin(t * 6 + i), y0 + 0.3, x, y0 + 0.6); ctx.stroke(); }
      for (let i = 0; i < d.w; i++) { const q = (t * 0.45 + H(i, d.x + 7)) % 1; ctx.fillStyle = `rgba(255,${180 - q * 100},60,${1 - q})`; ctx.fillRect(H(i, d.x) * d.w + Math.sin(t * 3 + i) * 0.2, q * 3.5, 0.06, 0.06); }
      ctx.restore();
    } else {
      // 水面に映る月（揺れる短い光の帯）と広がる波紋
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) { const y = -0.08 - i * 0.12, w = (0.6 - i * 0.07) * (1 + Math.sin(t * 3 + i) * 0.2), x = d.w * 0.5 + Math.sin(t * 2 + i * 1.7) * 0.15; ctx.fillStyle = `rgba(220,235,255,${0.35 - i * 0.05})`; ctx.fillRect(x - w / 2, y, w, 0.04); }
      ctx.restore();
      for (let i = 0; i < Math.ceil(d.w / 3); i++) { const q = (t * 0.6 + H(i, d.x)) % 1, x = (i * 3 + 1.5 + H(i, d.x + 1)) % d.w; ctx.strokeStyle = `rgba(200,240,255,${0.5 * (1 - q)})`; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.ellipse(x, -0.03, 0.15 + q * 0.6, 0.03 + q * 0.06, 0, 0, TAU); ctx.stroke(); }
    }
  }
  // 地面を這う霧（墓地・洞窟・魔城）
  const theme = g.def.theme;
  if (theme === 'graveyard' || theme === 'cave' || theme === 'citadel') {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const col = theme === 'cave' ? '120,190,210' : theme === 'citadel' ? '170,120,230' : '170,185,230';
    for (let i = 0; i < 4; i++) {
      const w = r.W * 0.7, x = ((t * (8 + i * 5) * r.T / 20 - (v.x0 + v.x1) * r.T * (0.5 + i * 0.1)) % (r.W + w) + r.W + w) % (r.W + w) - w * 0.5, y = r.H * (0.82 + i * 0.05);
      const gr = ctx.createRadialGradient(x, y, 0, x, y, w * 0.5); gr.addColorStop(0, `rgba(${col},0.10)`); gr.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = gr; ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.18); ctx.translate(-x, -y); ctx.beginPath(); ctx.arc(x, y, w * 0.5, 0, TAU); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }
}

// ボス戦の空の色（赤みを帯び、最終形態はさらに濃く）
export function bossTint(r, ctx, g) {
  if (!g.boss || g.bossState === 'none') return;
  const k = g.boss.type === 'lord' && g.boss.phase >= 3 ? 0.16 : 0.08, pulse = 0.85 + 0.15 * Math.sin(r.time * 2);
  ctx.fillStyle = `rgba(150,20,40,${k * pulse})`; ctx.fillRect(0, 0, r.W, r.H);
}
