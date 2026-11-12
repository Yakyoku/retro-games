// Sky Climber VR — VR 内の UI。キャンバスに描いた板を空間に置き、コントローラーの光線とトリガーで選ぶ。
// 文字が読める大きさ: 板は幅 0.9m を 0.85m 先に置く（視角でおよそ 56°）。本文 30px 相当以上。
import * as THREE from 'three';
const FONT = '"Noto Sans JP","Hiragino Sans","Yu Gothic","Meiryo",sans-serif';

export class VRPanel {
  constructor(w = 0.9, h = 0.6, px = 1024) {
    this.cv = document.createElement('canvas'); this.cv.width = px; this.cv.height = Math.round(px * h / w);
    this.ctx = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.mesh.renderOrder = 20; this.w = w; this.h = h; this.items = []; this.hover = -1; this.spec = null;
  }
  draw(spec) {
    this.spec = spec; const c = this.ctx, W = this.cv.width, H = this.cv.height;
    c.clearRect(0, 0, W, H);
    rr(c, 4, 4, W - 8, H - 8, 36); c.fillStyle = 'rgba(10,16,28,0.92)'; c.fill(); c.lineWidth = 4; c.strokeStyle = 'rgba(140,200,255,0.55)'; c.stroke();
    let y = 78;
    if (spec.title) { c.fillStyle = '#ffffff'; c.font = `900 56px ${FONT}`; c.textAlign = 'center'; c.fillText(spec.title, W / 2, y); y += 54; }
    if (spec.sub) { c.fillStyle = '#9fd4ff'; c.font = `700 30px ${FONT}`; c.textAlign = 'center'; c.fillText(spec.sub, W / 2, y); y += 46; }
    c.textAlign = 'left';
    for (const line of spec.lines || []) { c.fillStyle = line.color || '#dfe9f3'; c.font = `${line.bold ? 800 : 500} ${line.size || 30}px ${FONT}`; wrap(c, line.text, 60, y, W - 120, (line.size || 30) * 1.35).forEach((l, i, a) => { c.fillText(l, 60, y); y += (line.size || 30) * 1.35; }); }
    this.items = [];
    const btns = spec.buttons || [];
    if (btns.length) {
      const cols = spec.cols || 1, bw = (W - 120 - (cols - 1) * 24) / cols, bh = spec.bh || 78;
      let by = Math.max(y + 12, spec.btnTop || 0);
      btns.forEach((b, i) => {
        const col = i % cols, row = Math.floor(i / cols), bx = 60 + col * (bw + 24), yy = by + row * (bh + 16);
        const hov = i === this.hover;
        rr(c, bx, yy, bw, bh, 18); c.fillStyle = b.disabled ? 'rgba(60,70,80,0.6)' : hov ? '#ffd34a' : b.sel ? 'rgba(80,170,255,0.55)' : 'rgba(40,64,96,0.9)'; c.fill();
        c.strokeStyle = hov ? '#fff' : 'rgba(160,210,255,0.5)'; c.lineWidth = 3; c.stroke();
        c.fillStyle = hov ? '#111' : b.disabled ? '#8a96a0' : '#fff'; c.font = `800 ${b.sub ? 32 : 36}px ${FONT}`; c.textAlign = 'center';
        c.fillText(b.label, bx + bw / 2, yy + (b.sub ? bh * 0.44 : bh * 0.62));
        if (b.sub) { c.font = `500 22px ${FONT}`; c.fillStyle = hov ? '#333' : '#b8cde0'; c.fillText(b.sub, bx + bw / 2, yy + bh * 0.8); }
        this.items.push({ ...b, x: bx / W, y: yy / H, w: bw / W, h: bh / H });
      });
    }
    if (spec.footer) { c.fillStyle = '#c9d6e2'; c.font = `500 24px ${FONT}`; c.textAlign = 'center'; c.fillText(spec.footer, W / 2, H - 30); }
    this.tex.needsUpdate = true;
  }
  // 光線（ワールド座標）との交差 → ボタン番号
  hit(origin, dir) {
    const rc = new THREE.Raycaster(origin, dir, 0, 5);
    const h = rc.intersectObject(this.mesh, false)[0]; if (!h || !h.uv) return { index: -1, point: null };
    const u = h.uv.x, v = 1 - h.uv.y;
    const i = this.items.findIndex((b) => !b.disabled && u >= b.x && u <= b.x + b.w && v >= b.y && v <= b.y + b.h);
    return { index: i, point: h.point };
  }
  setHover(i) { if (i !== this.hover) { this.hover = i; if (this.spec) this.draw(this.spec); return true; } return false; }
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function wrap(c, text, x, y, maxW) { const out = []; let line = ''; for (const ch of text) { if (c.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch; } if (line) out.push(line); return out; }

// 手首の HUD（左手の甲の上の小さな板）: 高さ・得点・残機・コンボ
export class WristHUD {
  constructor() {
    this.cv = document.createElement('canvas'); this.cv.width = 512; this.cv.height = 256; this.ctx = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthWrite: false }));
    this.mesh.renderOrder = 15; this.last = '';
  }
  draw(d) {
    const key = JSON.stringify(d); if (key === this.last) return; this.last = key;
    const c = this.ctx; c.clearRect(0, 0, 512, 256); rr(c, 4, 4, 504, 248, 28); c.fillStyle = 'rgba(8,14,24,0.88)'; c.fill(); c.strokeStyle = 'rgba(255,211,74,0.8)'; c.lineWidth = 4; c.stroke();
    c.fillStyle = '#fff'; c.font = `900 64px ${FONT}`; c.textAlign = 'left'; c.fillText(`${d.height}m`, 28, 92);
    c.font = `700 34px ${FONT}`; c.fillStyle = '#ffd34a'; c.fillText(`${d.score.toLocaleString()} 点`, 28, 150);
    c.fillStyle = '#ff6b6b'; c.fillText('♥'.repeat(Math.max(0, Math.min(9, d.lives))) || '—', 28, 210);
    if (d.combo >= 2) { c.textAlign = 'right'; c.fillStyle = '#7dffb0'; c.font = `900 44px ${FONT}`; c.fillText(`×${d.combo}`, 484, 92); }
    c.textAlign = 'right'; c.fillStyle = '#9fd4ff'; c.font = `600 28px ${FONT}`; c.fillText(d.label || '', 484, 210);
    this.tex.needsUpdate = true;
  }
}
