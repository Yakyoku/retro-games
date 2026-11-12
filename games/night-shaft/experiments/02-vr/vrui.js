// VR 内の UI（キャンバスに描いた板）。メニュー・手首の HUD・メッセージ。
// メニューは { title, sub, items: [{ label, sub, val, act, adj, disabled }] } のモデルで、PC 画面の DOM メニューと同じものを使う。
import * as THREE from 'three';

const FONT = '"Hiragino Sans","Noto Sans JP","Yu Gothic UI",system-ui,sans-serif';

export class CanvasPanel {
  constructor(wM, hM, pxW) {
    this.c = document.createElement('canvas'); this.c.width = pxW; this.c.height = Math.round(pxW * hM / wM);
    this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.tex.generateMipmaps = true; this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: true }));
    this.mesh.renderOrder = 5;
    this.wM = wM; this.hM = hM;
  }
  flush() { this.tex.needsUpdate = true; }
}

function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

export class MenuPanel extends CanvasPanel {
  constructor() { super(1.3, 1.0, 1300); this.model = null; this.focus = 0; this.rows = []; }
  show(model) { this.model = model; this.focus = Math.max(0, model.items.findIndex((i) => i.primary && !i.disabled)); this.draw(); this.mesh.visible = true; }
  hide() { this.mesh.visible = false; this.model = null; }
  draw(hover = -1) {
    const g = this.g, W = this.c.width, H = this.c.height, m = this.model;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(10,14,26,0.94)'; rr(g, 4, 4, W - 8, H - 8, 40); g.fill();
    g.strokeStyle = 'rgba(127,224,255,0.35)'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#ffffff'; g.font = `800 58px ${FONT}`; g.textBaseline = 'top'; g.fillText(m.title, 56, 44);
    let y = 120;
    if (m.sub) { g.fillStyle = '#9aa6bb'; g.font = `500 30px ${FONT}`; for (const line of wrap(g, m.sub, W - 112)) { g.fillText(line, 56, y); y += 40; } }
    y += 14;
    const n = m.items.length;
    const rowH = Math.min(96, (H - y - 40) / n - 10);
    this.rows = [];
    m.items.forEach((it, i) => {
      const x = 56, w = W - 112;
      const on = i === hover || i === this.focus;
      g.fillStyle = it.primary ? 'rgba(255,155,58,0.22)' : on ? 'rgba(255,155,58,0.14)' : 'rgba(255,255,255,0.05)';
      rr(g, x, y, w, rowH, 18); g.fill();
      g.strokeStyle = on ? '#ff9b3a' : 'rgba(255,255,255,0.1)'; g.lineWidth = on ? 5 : 2; g.stroke();
      g.globalAlpha = it.disabled ? 0.4 : 1;
      g.fillStyle = '#eef3fa'; g.font = `700 ${Math.round(rowH * 0.4)}px ${FONT}`; g.textBaseline = 'middle';
      g.fillText(it.label, x + 28, y + rowH / 2 - (it.sub ? rowH * 0.14 : 0));
      if (it.sub) { g.fillStyle = '#9aa6bb'; g.font = `500 ${Math.round(rowH * 0.24)}px ${FONT}`; g.fillText(it.sub, x + 28, y + rowH * 0.72); }
      if (it.val != null && it.val !== '') {
        g.fillStyle = '#7fe0ff'; g.font = `800 ${Math.round(rowH * 0.36)}px ${FONT}`; g.textAlign = 'right';
        g.fillText(it.adj ? `◀  ${it.val}  ▶` : it.val, x + w - 28, y + rowH / 2); g.textAlign = 'left';
      }
      g.globalAlpha = 1;
      this.rows.push({ x, y, w, h: rowH, i });
      y += rowH + 10;
    });
    this.flush();
  }
  // uv（0..1）から項目と左右（adj 用）を返す
  hit(uv) {
    if (!this.model) return null;
    const px = uv.x * this.c.width, py = (1 - uv.y) * this.c.height;
    for (const r of this.rows) if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
      const it = this.model.items[r.i];
      let dx = 0;
      if (it.adj) dx = px > r.x + r.w * 0.72 ? 1 : px > r.x + r.w * 0.45 ? 1 : -1;
      if (it.adj && px > r.x + r.w * 0.45 && px < r.x + r.w * 0.6) dx = 1;
      return { index: r.i, item: it, dx: it.adj ? (px < r.x + r.w * 0.6 ? -1 : 1) : 0 };
    }
    return null;
  }
}

function wrap(g, text, maxW) {
  const out = []; let line = '';
  for (const ch of text) { if (g.measureText(line + ch).width > maxW && line) { out.push(line); line = ''; } line += ch; }
  if (line) out.push(line);
  return out.slice(0, 4);
}

// 手首の HUD（左手の甲の上）。上下 2 階ずつの敵の位置（気配）も出す
export class WristHud extends CanvasPanel {
  constructor() { super(0.2, 0.14, 720); this.last = ''; }
  draw(game, hi) {
    const g = this.g, W = this.c.width, H = this.c.height;
    const p = game.player, pf = game.playerFloor;
    const key = [game.score, game.docsGot, game.lives, pf, Math.round(p.x * 2), game.enemies.length, Math.floor(performance.now() / 250)].join(',');
    if (key === this.last) return; this.last = key;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,12,22,0.92)'; rr(g, 2, 2, W - 4, H - 4, 30); g.fill(); g.strokeStyle = 'rgba(127,224,255,0.4)'; g.lineWidth = 3; g.stroke();
    g.textBaseline = 'top';
    g.fillStyle = '#9aa6bb'; g.font = `700 24px ${FONT}`; g.fillText('SCORE', 26, 20); g.fillText('書類', 300, 20); g.fillText('現在', 470, 20);
    g.fillStyle = '#fff'; g.font = `800 50px ${FONT}`; g.fillText(game.score.toLocaleString(), 24, 46); g.fillText(`${game.docsGot}/${game.docTotal}`, 298, 46); g.fillText(`${pf}F`, 468, 46);
    for (let i = 0; i < Math.max(0, game.lives - (game.phase === 'dead' ? 1 : 0)); i++) { g.fillStyle = '#ff9b3a'; g.beginPath(); g.arc(640 + (i % 3) * 0 - Math.floor(i) * 0, 0, 0, 0, 0); g.fill(); rr(g, 620 - i * 30, 26, 20, 30, 8); g.fill(); }
    const left = game.remainingDocFloors();
    g.font = `800 26px ${FONT}`;
    let x = 24;
    for (const f of left) { const w = g.measureText(f + 'F').width + 18; g.fillStyle = '#e0414f'; rr(g, x, 112, w, 38, 10); g.fill(); g.fillStyle = '#fff'; g.fillText(f + 'F', x + 9, 117); x += w + 8; }
    if (!left.length) { g.fillStyle = '#36f08a'; g.fillText('全書類回収 → 1F の出口へ', 24, 117); }
    // 上下階の気配（±2 階）
    const top = 170, rowH = 58;
    for (let k = 2; k >= -2; k--) {
      const f = pf + k; const y = top + (2 - k) * rowH;
      if (f < 1 || f > game.stage.floors) continue;
      g.fillStyle = k === 0 ? 'rgba(255,155,58,0.16)' : 'rgba(255,255,255,0.05)'; g.fillRect(70, y, W - 100, rowH - 8);
      g.fillStyle = left.includes(f) ? '#ff7b86' : '#9aa6bb'; g.font = `700 24px ${FONT}`; g.fillText(f + 'F', 20, y + 12);
      const sx = (xx) => 70 + (xx / 24) * (W - 100);
      for (const c of game.cars) if (Math.abs(c.y / 3 + 1 - f) < 0.5) { g.fillStyle = '#b8c2d0'; g.fillRect(sx(c.x) - 10, y + 4, 20, rowH - 16); }
      for (const d of game.byFloor[f].doors) if (d.kind === 'doc' && !d.collected) { g.fillStyle = '#e0414f'; g.fillRect(sx(d.x) - 6, y + 10, 12, rowH - 28); }
      for (const e of game.enemies) if (e.alive && Math.round(e.y / 3) + 1 === f) { g.fillStyle = e.state === 'windup' ? '#ffd040' : '#ff5a4a'; g.beginPath(); g.arc(sx(e.x), y + rowH / 2 - 4, 9, 0, 7); g.fill(); }
      if (k === 0) { g.fillStyle = '#ff9b3a'; g.beginPath(); g.moveTo(sx(p.x), y + 6); g.lineTo(sx(p.x) - 11, y + rowH - 12); g.lineTo(sx(p.x) + 11, y + rowH - 12); g.fill(); }
    }
    this.flush();
  }
}

// 目の前に出るメッセージ（ヒント・通知）。頭に固定せず、ゆっくり追いかける
export class MessagePanel extends CanvasPanel {
  constructor() { super(1.0, 0.2, 1000); this.text = ''; this.t = 0; this.mesh.visible = false; }
  set(text, sec = 3, color = '#ff9b3a') {
    if (text === this.text && this.t > 0.2) { this.t = Math.max(this.t, sec); return; }
    this.text = text; this.t = sec;
    const g = this.g, W = this.c.width, H = this.c.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(10,14,26,0.9)'; rr(g, 4, 4, W - 8, H - 8, 30); g.fill(); g.strokeStyle = color; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#fff'; g.font = `700 44px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = wrap(g, text, W - 80);
    lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * 52));
    g.textAlign = 'left';
    this.flush();
    this.mesh.visible = true;
  }
}
