// VR 内の UI。HTML のメニューに頼らず、空間に浮かぶパネル（キャンバスを貼った板）をコントローラーのレーザーで選ぶ。
// スティック上下＋トリガー／A でも選べる。項目の形式は shared/ui.js と同じ（label, sub, kind, get, set, options, action）。
import * as THREE from 'three';
import { CREDIT } from './ui.js';

const PW = 1.25, PH = 1.0, RES = 1100; // パネルの大きさ（m）と解像度（px/m）

export function createVRMenu(onSound) {
  const canvas = document.createElement('canvas'); canvas.width = Math.round(PW * RES); canvas.height = Math.round(PH * RES);
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false }));
  mesh.renderOrder = 50; mesh.visible = false;
  let screen = null, items = [], focus = 0, rects = [], dirty = true, hover = -1;
  const snd = (n) => onSound && onSound(n);

  function show(s) { screen = s; items = s.items || []; focus = Math.max(0, items.findIndex((i) => !i.disabled)); mesh.visible = true; dirty = true; }
  function hide() { screen = null; mesh.visible = false; }
  // 頭の前 1.6m に置く（水平の向きだけ合わせる）
  function place(camera) {
    const p = new THREE.Vector3(); camera.getWorldPosition(p);
    const d = new THREE.Vector3(); camera.getWorldDirection(d); d.y = 0; if (d.lengthSq() < 1e-4) d.set(0, 0, -1); d.normalize();
    mesh.position.copy(p).addScaledVector(d, 1.6); mesh.position.y = p.y - 0.1;
    mesh.lookAt(p.x, mesh.position.y, p.z);
  }
  function val(it) {
    if (it.kind === 'toggle') return it.get() ? 'オン' : 'オフ';
    if (it.kind === 'choice') { const o = it.options.find((o) => o.value === it.get()); return o ? o.label : ''; }
    if (it.kind === 'slider') return Math.round(it.get() * 100) + '%';
    return '';
  }
  function draw() {
    const W = canvas.width, Hh = canvas.height;
    ctx.clearRect(0, 0, W, Hh);
    ctx.fillStyle = 'rgba(22,15,12,0.94)'; rr(0, 0, W, Hh, 48); ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,170,0.3)'; ctx.lineWidth = 4; ctx.stroke();
    let y = 70;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (screen.kicker) { ctx.fillStyle = '#ffc93c'; ctx.font = '700 30px ui-monospace, Consolas, monospace'; ctx.fillText(screen.kicker.split('').join(' '), 60, y); y += 64; }
    if (screen.title) { ctx.fillStyle = '#fff'; ctx.font = '900 62px system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif'; ctx.fillText(screen.title, 60, y); y += 30; }
    if (screen.text) { ctx.fillStyle = '#e7dccf'; ctx.font = '500 32px system-ui, "Noto Sans JP", sans-serif'; for (const line of wrap(screen.text, W - 120)) { y += 44; ctx.fillText(line, 60, y); } }
    y += 34;
    rects = [];
    const avail = Hh - y - (screen.credit ? 90 : 30);
    const ih = Math.min(96, Math.max(64, avail / Math.max(1, items.length) - 12));
    items.forEach((it, i) => {
      const r = { x: 50, y, w: W - 100, h: ih }; rects.push(r);
      const on = i === focus || i === hover;
      ctx.fillStyle = it.disabled ? 'rgba(255,255,255,0.03)' : on ? 'rgba(255,201,60,0.18)' : 'rgba(255,255,255,0.06)'; rr(r.x, r.y, r.w, r.h, 24); ctx.fill();
      ctx.strokeStyle = on && !it.disabled ? '#ffc93c' : 'rgba(255,255,255,0.12)'; ctx.lineWidth = on ? 6 : 3; ctx.stroke();
      ctx.globalAlpha = it.disabled ? 0.4 : 1;
      ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(ih * 0.4)}px system-ui, "Noto Sans JP", sans-serif`; ctx.textBaseline = 'middle';
      ctx.fillText(it.label, r.x + 30, r.y + (it.sub ? r.h * 0.38 : r.h / 2));
      if (it.sub) { ctx.fillStyle = '#b9a99a'; ctx.font = `500 ${Math.round(ih * 0.25)}px system-ui, "Noto Sans JP", sans-serif`; ctx.fillText(it.sub, r.x + 30, r.y + r.h * 0.74); }
      const v = it.kind ? val(it) : '';
      if (v) { ctx.textAlign = 'right'; ctx.fillStyle = '#ffc93c'; ctx.font = `800 ${Math.round(ih * 0.38)}px ui-monospace, Consolas, monospace`; ctx.fillText((it.kind === 'button' ? '' : '◀ ') + v + ' ▶', r.x + r.w - 30, r.y + r.h / 2); ctx.textAlign = 'left'; }
      ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
      y += ih + 12;
    });
    if (screen.credit) { ctx.fillStyle = '#d8cbbb'; ctx.font = '600 30px system-ui, "Noto Sans JP", sans-serif'; ctx.fillText(CREDIT, 60, Hh - 44); }
    tex.needsUpdate = true; dirty = false;
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function wrap(text, maxW) {
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const ch of para) { if (ctx.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch; }
      out.push(line);
    }
    return out.slice(0, 6);
  }
  const ray = new THREE.Raycaster();
  // レーザーが当たっている項目と、パネル上の点
  function pick(origin, dir) {
    if (!screen) return null;
    ray.set(origin, dir);
    const hit = ray.intersectObject(mesh)[0]; if (!hit) return null;
    const uv = hit.uv; const px = uv.x * canvas.width, py = (1 - uv.y) * canvas.height;
    const idx = rects.findIndex((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
    return { point: hit.point, idx, side: px > canvas.width * 0.6 ? 1 : -1 };
  }
  function activate(i, d = 1) {
    const it = items[i]; if (!it || it.disabled) return;
    if (it.kind === 'toggle') { it.set(!it.get()); snd('ui-select'); }
    else if (it.kind === 'choice') { const o = it.options; let k = o.findIndex((x) => x.value === it.get()); k = (k + d + o.length) % o.length; it.set(o[k].value); snd('ui-move'); }
    else if (it.kind === 'slider') { it.set(Math.max(0, Math.min(1, Math.round((it.get() + d * (it.step || 0.1)) * 100) / 100))); snd('ui-move'); }
    else { snd(it.back ? 'ui-back' : 'ui-select'); it.action && it.action(); }
    dirty = true;
  }
  function move(d) { if (!items.length) return; let k = focus; for (let n = 0; n < items.length; n++) { k = (k + d + items.length) % items.length; if (!items[k].disabled) break; } if (k !== focus) { focus = k; snd('ui-move'); dirty = true; } }
  function setHover(i) { if (i !== hover) { hover = i; if (i >= 0) focus = i; dirty = true; } }
  return {
    mesh, show, hide, place, pick, activate, move, setHover,
    back() { if (screen && screen.onBack) { snd('ui-back'); screen.onBack(); } },
    get focus() { return focus; }, get open() { return !!screen; }, get items() { return items; },
    tick() { if (screen && dirty) draw(); },
    refresh() { dirty = true; },
  };
}

// 手首の表示（得点・残機・面）＋地図。利き手と反対の手に付ける
export function createWristPanel() {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 800;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  return { mesh, canvas, ctx, tex };
}
