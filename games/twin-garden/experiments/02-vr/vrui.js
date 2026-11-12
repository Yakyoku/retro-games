// ツイン・ガーデン VR — ヘッドセット内のメニュー・HUD・お知らせ（キャンバスを板に貼る）
// 文字は [漢字|かな] を読みがなつきで描く。メニューは左右どちらのレーザーでも選べる（行の位置を UV から求める）。
import * as THREE from 'three';
import { C } from '/shared/core/config.js';
import { MARKS, MARK_ORDER } from '/shared/ui/marks.js';
import { rubyAuto } from '/shared/ui/dom-ui.js';

const FONT = '"Hiragino Sans","Yu Gothic UI","Noto Sans JP","Noto Sans CJK JP",system-ui,sans-serif';

function segs(s) {
  const out = []; let last = 0; const re = /\[([^|\]]+)\|([^\]]+)\]/g; let m;
  while ((m = re.exec(s))) { if (m.index > last) out.push({ t: s.slice(last, m.index) }); out.push({ t: m[1], r: m[2] }); last = re.lastIndex; }
  if (last < s.length) out.push({ t: s.slice(last) });
  return out;
}
/** 読みがなつきの 1 行を描く。戻り値は幅 */
export function rubyText(g, s, x, y, size, align = 'left', color = '#fff', weight = 700) {
  const parts = segs(s);
  g.font = `${weight} ${size}px ${FONT}`;
  const widths = parts.map((p) => g.measureText(p.t).width);
  const W = widths.reduce((a, b) => a + b, 0);
  let cx = align === 'center' ? x - W / 2 : align === 'right' ? x - W : x;
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  parts.forEach((p, i) => {
    g.font = `${weight} ${size}px ${FONT}`; g.fillStyle = color; g.fillText(p.t, cx, y);
    if (p.r) { g.font = `600 ${size * 0.42}px ${FONT}`; g.textAlign = 'center'; g.fillText(p.r, cx + widths[i] / 2, y - size * 0.92); g.textAlign = 'left'; }
    cx += widths[i];
  });
  return W;
}

function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

class Panel {
  constructor(w, h, meters) {
    this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h;
    this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.tex.generateMipmaps = true; this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, h / w), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: true, toneMapped: false }));
    this.mesh.scale.setScalar(meters); this.mesh.renderOrder = 20;
    this.key = '';
  }
  resize(h) { if (this.c.height !== h) { this.c.height = h; this.mesh.geometry.dispose(); this.mesh.geometry = new THREE.PlaneGeometry(1, h / this.c.width); this.tex.dispose(); this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8; this.mesh.material.map = this.tex; } }
}

export class VRUI {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.menu = new Panel(1024, 1024, 0.9); this.group.add(this.menu.mesh);
    this.hudP = new Panel(1024, 200, 0.9); this.group.add(this.hudP.mesh);
    this.ban = new Panel(1024, 300, 0.75); this.group.add(this.ban.mesh);
    this.rows = []; this.def = null; this.focus = 0; this.hover = -1;
    this.debugLine = '';
  }

  /** 庭の位置に合わせて板を置く（庭の奥の上に HUD、手前の上にメニュー） */
  place(garden, s, immersive) {
    const c = garden.position;
    const far = c.z - 9 * s; // 庭の奥の縁
    if (immersive) {
      this.hudP.mesh.scale.setScalar(1.6); this.hudP.mesh.position.set(c.x, c.y + 1.7, far - 0.3); this.hudP.mesh.rotation.set(0, 0, 0);
      this.ban.mesh.scale.setScalar(1.3); this.ban.mesh.position.set(c.x, c.y + 1.4, c.z); this.ban.mesh.rotation.set(-0.15, 0, 0);
      this.menu.mesh.scale.setScalar(1.0); this.menu.mesh.position.set(c.x, 1.3, c.z + 9 * s - 0.9); this.menu.mesh.rotation.set(-0.12, 0, 0);
    } else {
      // 庭の奥の縁に HUD（低く）、その上にメニュー（目の高さあたり）。庭の上には重ねない
      this.hudP.mesh.scale.setScalar(0.9); this.hudP.mesh.position.set(c.x, c.y + 0.13, far - 0.03); this.hudP.mesh.rotation.set(-0.3, 0, 0);
      this.ban.mesh.scale.setScalar(0.62); this.ban.mesh.position.set(c.x, c.y + 0.2, c.z - 0.02); this.ban.mesh.rotation.set(-0.7, 0, 0);
      this.menu.mesh.scale.setScalar(0.8); this.menu.mesh.position.set(c.x, c.y + 0.62, far - 0.06); this.menu.mesh.rotation.set(-0.12, 0, 0);
    }
  }

  showMenu(def, focus) { this.def = def; this.focus = focus; this.menu.mesh.visible = true; this.drawMenu(); }
  hideMenu() { this.def = null; this.menu.mesh.visible = false; }
  setHover(i) { if (i !== this.hover) { this.hover = i; if (i >= 0) this.focus = i; this.drawMenu(); } }

  drawMenu() {
    const d = this.def; if (!d) return;
    const rowH = 92, top = 210 + (d.lines ? d.lines.length * 64 : 0);
    const H = Math.min(2048, top + d.items.length * (rowH + 12) + 110);
    this.menu.resize(H);
    const g = this.menu.g, W = 1024;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(12,24,18,0.97)'; rr(g, 8, 8, W - 16, H - 16, 44); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 3; g.stroke();
    const grd = g.createLinearGradient(200, 0, 824, 0); grd.addColorStop(0, '#ff8a8e'); grd.addColorStop(0.5, '#ffe08a'); grd.addColorStop(1, '#7cc1ff');
    rubyText(g, d.title, W / 2, 128, 76, 'center', grd, 800);
    if (d.sub) rubyText(g, d.sub, W / 2, 182, 30, 'center', '#b9c4b5', 600);
    let y = 230;
    if (d.lines) for (const l of d.lines) { rubyText(g, l, 60, y + 30, 32, 'left', '#f4f1e6', 600); y += 64; }
    this.rows = [];
    d.items.forEach((it, i) => {
      const ry = top + i * (rowH + 12);
      const f = i === this.focus;
      g.fillStyle = f ? 'rgba(255,211,107,0.22)' : 'rgba(255,255,255,0.06)'; rr(g, 48, ry, W - 96, rowH, 22); g.fill();
      if (f) { g.strokeStyle = 'rgba(255,211,107,0.95)'; g.lineWidth = 4; g.stroke(); }
      rubyText(g, it.label, 80, ry + 64, 40, 'left', '#fff', 700);
      if (it.value) rubyText(g, (it.kind === 'slider' || it.kind === 'toggle' ? '◀ ' : '') + it.value() + (it.kind === 'slider' || it.kind === 'toggle' ? ' ▶' : ''), W - 80, ry + 64, 34, 'right', '#ffd36b', 700);
      this.rows.push({ y0: ry / H, y1: (ry + rowH) / H });
    });
    rubyText(g, 'レーザー＋トリガー：[決定|けってい]　スティック：[選|えら]ぶ・[調整|ちょうせい]　B / Y：[戻|もど]る', W / 2, H - 46, 26, 'center', '#b9c4b5', 600);
    this.menu.tex.needsUpdate = true;
  }

  /** レーザーが当たった UV から行番号（なければ -1） */
  rowAt(uv) { const y = 1 - uv.y; return this.rows.findIndex((r) => y >= r.y0 && y <= r.y1); }

  hud(g, extra = '') {
    if (!g) { this.hudP.mesh.visible = false; this.ban.mesh.visible = false; return; }
    this.hudP.mesh.visible = true;
    const left = g.mush.filter((m) => m.alive).length;
    const key = [g.score, g.lives, Math.ceil(g.energy), g.powerT > 0 ? Math.ceil(g.powerT / 60) : 0, left, g.gemsGot, g.def.number, g.kind, g.bonus ? Math.ceil(g.bonus.t / 60) : 0, extra].join('|');
    if (key !== this.hudP.key) {
      this.hudP.key = key;
      const c = this.hudP.g, W = 1024, H = 200;
      c.clearRect(0, 0, W, H);
      c.fillStyle = 'rgba(8,16,12,0.82)'; rr(c, 6, 6, W - 12, H - 12, 30); c.fill();
      rubyText(c, '[得点|とくてん]', 34, 62, 26, 'left', '#b9c4b5', 600);
      c.font = `900 64px ${FONT}`; c.fillStyle = '#fff'; c.fillText(String(g.score).padStart(6, '0'), 30, 132);
      const title = g.kind === 'bonus' ? `ボーナス ${Math.ceil(g.bonus.t / 60)}[秒|びょう]` : g.def.lesson ? g.def.name : `${g.def.number}[面|めん] [${g.def.name}|${g.def.ruby}]`;
      rubyText(c, title, 560, 70, 34, 'center', '#ffe9a8', 800);
      // エネルギー
      const bx = 330, by = 96, bw = 460, bh = 36;
      c.fillStyle = 'rgba(255,255,255,0.12)'; rr(c, bx, by, bw, bh, 18); c.fill();
      const pw = g.powerT > 0, e = g.energy / C.energyMax;
      c.fillStyle = pw ? '#ffd36b' : g.energy < 25 ? '#ff6b4a' : '#6fdc8c'; rr(c, bx, by, Math.max(18, bw * e), bh, 18); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(bx + bw * (100 / 150), by, 3, bh);
      c.font = `800 26px ${FONT}`; c.fillStyle = '#10241a'; c.textAlign = 'center'; c.fillText(pw ? `むてき ${Math.ceil(g.powerT / 60)}` : String(Math.ceil(g.energy)), bx + bw / 2, by + 27); c.textAlign = 'left';
      // 残機・残り・宝
      rubyText(c, `[残機|ざんき] ${Number.isFinite(g.lives) ? g.lives : '∞'}`, 830, 70, 30, 'left', '#fff', 700);
      rubyText(c, `[残|のこ]り ${g.kind === 'bonus' && g.bonus.type !== 'harvest' ? '—' : left}`, 830, 122, 30, 'left', '#fff', 700);
      MARK_ORDER.forEach((m, i) => {
        const got = g.gemsGot & (1 << i), mk = MARKS[m], x0 = 360 + i * 40, y0 = 166;
        c.beginPath(); mk.pts.forEach(([x, y], k) => (k ? c.lineTo(x0 + x * 15, y0 + y * 15) : c.moveTo(x0 + x * 15, y0 + y * 15))); c.closePath();
        if (got) { c.fillStyle = mk.color; c.fill(); } else { c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 2; c.stroke(); }
      });
      if (extra) { c.font = `600 18px ui-monospace,monospace`; c.fillStyle = '#9fe'; c.fillText(extra, 600, 180); }
      this.hudP.tex.needsUpdate = true;
    }
    // お知らせ
    const lines = bannerLines(g);
    const bk = lines.join('\n');
    if (bk !== this.ban.key) {
      this.ban.key = bk;
      this.ban.mesh.visible = lines.length > 0;
      const c = this.ban.g; c.clearRect(0, 0, 1024, 300);
      if (lines.length) {
        c.fillStyle = 'rgba(6,14,10,0.75)'; rr(c, 10, 10, 1004, 280, 36); c.fill();
        rubyText(c, lines[0], 512, 120, 66, 'center', /ミス|ゲームオーバー/.test(lines[0]) ? '#ff9a9a' : '#ffd36b', 900);
        lines.slice(1, 3).forEach((l, i) => rubyText(c, l, 512, 196 + i * 56, 32, 'center', '#fff', 600));
      }
      this.ban.tex.needsUpdate = true;
    }
  }
}

export function bannerLines(g) {
  const L = [];
  if (g.phase === 'intro') { if (g.def.lesson) { L.push(g.def.name); L.push(rubyAuto(g.def.steps[0]), rubyAuto(g.def.steps[1])); } else { L.push(`${g.def.number}[面|めん]　[${g.def.name}|${g.def.ruby}]`); L.push(rubyAuto(g.def.tip)); } }
  else if (g.phase === 'bonusIntro') { L.push(`ボーナス　[${g.bonus.def.name}|${g.bonus.def.ruby}]`); L.push(rubyAuto(g.bonus.def.tip)); }
  else if (g.phase === 'clear') { L.push('クリア！'); if (g.pendingBonus) L.push('[宝|たから]がそろった！　ボーナスへ'); }
  else if (g.phase === 'miss') { L.push('ミス'); if (Number.isFinite(g.lives) && g.lives > 0) L.push(`[残機|ざんき] ${g.lives}　[面|めん]の[最初|さいしょ]から`); }
  else if (g.phase === 'bonusEnd') L.push(`ボーナス ${g.bonus.points}[点|てん]`);
  else if (g.phase === 'gameover') L.push('ゲームオーバー');
  else if (g.phase === 'complete') L.push(g.mode === 'arcade' ? '[全|ぜん]12[面|めん]クリア！' : 'クリア！');
  else if (g.kind === 'bonus' && g.bonus.type === 'memory' && g.bonus.showT > 0) L.push('[光|ひか]った[場所|ばしょ]を[覚|おぼ]えよう');
  return L;
}
