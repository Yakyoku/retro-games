// AEGIS RELAY — VR 内の HUD とメニュー（キャンバスを板に貼る。奥行きテストを切り、地形に隠れない）
// ・メニューはコントローラーのレーザー＋トリガー、または左スティック上下＋A（決定）・B（戻る）で操作
// ・プレイ中も HUD の板の「II メニュー」をレーザーで押すか、B / Y でポーズメニューを開ける（常に使える）
import * as THREE from 'three';
import { HOWTO } from '../shared/app.js';
import { store } from '../shared/store.js';
import { AREAS } from '../shared/rules.js';

function panel(w, h, pxW, pxH) {
  const cv = document.createElement('canvas'); cv.width = pxW; cv.height = pxH;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  m.renderOrder = 50;
  return { mesh: m, cv, c: cv.getContext('2d'), tex, w, h };
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
const FONT = (px, w = 800) => `${w} ${px}px 'AR Sans', sans-serif`;

export function createVrUI(scene, stage, app) {
  const hud = panel(0.9, 0.18, 1800, 360); stage.add(hud.mesh);
  const menu = panel(0.66, 0.66, 1400, 1400); stage.add(menu.mesh);
  let hudKey = '', menuKey = '', rects = [], menuBtn = null;

  const _far = new THREE.Vector3();
  function place(world) {
    // HUD: 戦域の奥の縁の少し上。メニュー: 正面・目の少し下（毎フレーム呼ぶので、オブジェクトを作らない）
    const c = world.boardCorners();
    _far.copy(c[0]).add(c[1]).multiplyScalar(0.5); stage.worldToLocal(_far);
    hud.mesh.position.set(_far.x, _far.y + 0.16, _far.z - 0.02); hud.mesh.rotation.set(-0.15, 0, 0);
    menu.mesh.position.set(0, 1.08 + app.settings.vrHeight * 0.5, -0.78); menu.mesh.rotation.set(-0.12, 0, 0);
  }

  function drawHud() {
    const g = app.game, c = hud.c, W = hud.cv.width, H = hud.cv.height;
    const best = Math.max(store.best(app.mode || 'standard'), g ? g.score : 0);
    const key = g ? [g.score, g.lives, g.area, g.loop, g.player.docked, g.player.alive, best, app.screen, app.flash?.text, hoverHud].join('|') : 'none' + app.screen;
    if (key === hudKey) return; hudKey = key;
    c.clearRect(0, 0, W, H);
    if (!g) { hud.tex.needsUpdate = true; return; }
    rr(c, 8, 8, W - 16, H - 16, 40); c.fillStyle = 'rgba(8,14,30,.82)'; c.fill(); c.strokeStyle = 'rgba(46,197,255,.5)'; c.lineWidth = 4; c.stroke();
    const col = (x, lab, val, color = '#e8eefc') => { c.fillStyle = '#8fa0c2'; c.font = FONT(40, 400); c.fillText(lab, x, 90); c.fillStyle = color; c.font = FONT(86); c.fillText(val, x, 190); };
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    col(50, 'SCORE', String(g.score));
    col(520, 'HI-SCORE', String(best));
    col(960, `AREA ${g.area + 1}・LOOP ${g.loop + 1}`, '✈'.repeat(Math.max(0, g.lives - (g.player.alive ? 1 : 0))) || '—');
    col(1320, 'RELAY', g.player.docked ? '×3' : '—', g.player.docked ? '#ffd166' : '#8fa0c2');
    // メニューボタン
    menuBtn = { x: 1560, y: 60, w: 200, h: 140 };
    rr(c, menuBtn.x, menuBtn.y, menuBtn.w, menuBtn.h, 28); c.fillStyle = hoverHud ? 'rgba(46,197,255,.45)' : 'rgba(46,197,255,.18)'; c.fill(); c.strokeStyle = '#2ec5ff'; c.stroke();
    c.fillStyle = '#fff'; c.font = FONT(48); c.textAlign = 'center'; c.fillText('II メニュー', menuBtn.x + menuBtn.w / 2, menuBtn.y + 88);
    c.textAlign = 'left'; c.fillStyle = '#8fa0c2'; c.font = FONT(34, 400); c.fillText(AREAS[g.area].jp + '　' + AREAS[g.area].name, 50, 300);
    if (app.flash) { c.fillStyle = '#9ff4ff'; c.font = FONT(56); c.textAlign = 'right'; c.fillText(app.flash.text, W - 60, 310); }
    hud.tex.needsUpdate = true;
  }

  function drawMenu() {
    const m = app.menu, s = app.screen, c = menu.c, W = menu.cv.width, H = menu.cv.height;
    menu.mesh.visible = !!m && s !== 'play';
    if (!menu.mesh.visible) return;
    const key = [s, m.idx, m.items.map((i) => i.label + (i.get ? i.get() : '')).join(), app.howtoPage, hoverIdx, app.result?.score].join('|');
    if (key === menuKey) return; menuKey = key;
    c.clearRect(0, 0, W, H);
    rr(c, 10, 10, W - 20, H - 20, 60); c.fillStyle = 'rgba(6,10,24,.9)'; c.fill(); c.strokeStyle = 'rgba(46,197,255,.55)'; c.lineWidth = 5; c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    let y = 120;
    if (s === 'title') {
      const gr = c.createLinearGradient(0, 60, 0, 200); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#2ec5ff'); c.fillStyle = gr; c.font = FONT(150); c.fillText('AEGIS RELAY', W / 2, 150);
      c.fillStyle = '#8fa0c2'; c.font = FONT(46, 400); c.fillText('イージス・リレー　—　非公式のオリジナル作品', W / 2, 260); y = 340;
    } else if (s === 'howto') {
      c.fillStyle = '#e8eefc'; c.font = FONT(80); c.fillText(`${m.title}  ${app.howtoPage + 1}/${HOWTO.length}`, W / 2, 120);
      c.font = FONT(42, 400); c.textAlign = 'left';
      HOWTO[app.howtoPage].lines.forEach((l, i) => wrap(c, l, 90, 230 + i * 150, W - 180, 56)); c.textAlign = 'center'; y = 760;
    } else if (s === 'result') {
      const r = app.result; c.fillStyle = '#e8eefc'; c.font = FONT(90); c.fillText('GAME OVER', W / 2, 130);
      c.font = FONT(170); c.fillText(String(r.score), W / 2, 300);
      c.font = FONT(44, 400); c.fillStyle = '#8fa0c2';
      c.fillText(`AREA ${r.area + 1}・LOOP ${r.loop + 1}　撃破 ${r.stats.kills}　合体 ${r.stats.docks}`, W / 2, 430);
      c.fillText(r.tainted ? 'デバッグ機能を使ったので記録しません' : r.rank === 0 ? '★ ハイスコア更新！' : r.rank > 0 ? `${r.rank + 1} 位に記録` : '10 位以内に入りませんでした', W / 2, 500); y = 600;
    } else if (s === 'records') {
      c.fillStyle = '#e8eefc'; c.font = FONT(80); c.fillText('記録', W / 2, 110); c.font = FONT(40, 400);
      ['standard', 'assist'].forEach((mode, k) => { c.fillStyle = '#8fa0c2'; c.fillText(mode === 'standard' ? '補助なし' : '補助: 自動連射', W / 2, 200 + k * 420); store.hiList(mode).slice(0, 5).forEach((r, i) => { c.fillStyle = '#e8eefc'; c.fillText(`${i + 1}.  ${r.score}   AREA ${r.area}・LOOP ${r.loop}`, W / 2, 270 + k * 420 + i * 62); }); });
      y = 1060;
    } else { c.fillStyle = '#e8eefc'; c.font = FONT(84); c.fillText(m.title || '', W / 2, 110); y = 210; }
    const n = m.items.length, avail = H - 60 - y, ih = Math.min(118, Math.floor(avail / n) - 12);
    rects = [];
    m.items.forEach((it, i) => {
      const x = 110, w = W - 220, yy = y + i * (ih + 12);
      rr(c, x, yy, w, ih, 26);
      c.fillStyle = i === m.idx ? 'rgba(46,197,255,.32)' : i === hoverIdx ? 'rgba(46,197,255,.16)' : 'rgba(20,30,58,.85)'; c.fill();
      c.strokeStyle = i === m.idx ? '#2ec5ff' : 'rgba(120,180,255,.25)'; c.lineWidth = 4; c.stroke();
      c.fillStyle = '#e8eefc'; c.font = FONT(Math.min(52, ih * 0.46), it.get ? 400 : 800);
      if (it.get) { c.textAlign = 'left'; c.fillText(it.label, x + 40, yy + ih / 2); c.textAlign = 'right'; c.fillStyle = '#2ec5ff'; c.font = FONT(Math.min(52, ih * 0.46)); c.fillText(`◀  ${it.get()}  ▶`, x + w - 40, yy + ih / 2); c.textAlign = 'center'; }
      else c.fillText(it.label, W / 2, yy + ih / 2);
      rects.push({ i, x, y: yy, w, h: ih, adjustable: !!it.left });
    });
    menu.tex.needsUpdate = true;
  }
  function wrap(c, text, x, y, maxW, lh) {
    let line = '', yy = y;
    for (const ch of text) { if (c.measureText(line + ch).width > maxW) { c.fillText(line, x, yy); line = ch; yy += lh; } else line += ch; }
    c.fillText(line, x, yy);
  }

  // ── レーザー ──
  const ray = new THREE.Raycaster(); let hoverIdx = -1, hoverHud = false;
  const lasers = [];
  function addLaser(ctrl) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.8, depthTest: false }));
    line.renderOrder = 60; line.scale.z = 1.5; ctrl.add(line);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })); dot.renderOrder = 61; dot.visible = false; scene.add(dot);
    lasers.push({ ctrl, line, dot });
  }
  const tmpM = new THREE.Matrix4();
  // 毎フレーム: どの項目を指しているか。click=true ならトリガーを引いた瞬間
  function pointer(click) {
    hoverIdx = -1; hoverHud = false; let hit = null;
    for (const L of lasers) {
      L.dot.visible = false;
      if (!L.ctrl.visible) continue;
      tmpM.identity().extractRotation(L.ctrl.matrixWorld);
      ray.ray.origin.setFromMatrixPosition(L.ctrl.matrixWorld); ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
      const targets = [menu.mesh.visible ? menu.mesh : null, app.game && app.screen === 'play' ? hud.mesh : null].filter(Boolean);
      const hits = ray.intersectObjects(targets, false);
      L.line.scale.z = hits[0] ? hits[0].distance : 1.5;
      if (hits[0]) { L.dot.visible = true; L.dot.position.copy(hits[0].point); hit = hits[0]; L.hit = hit; } else L.hit = null;
    }
    if (!hit) return;
    const uv = hit.uv;
    if (hit.object === menu.mesh) {
      const px = uv.x * menu.cv.width, py = (1 - uv.y) * menu.cv.height;
      const r = rects.find((q) => px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h);
      if (r) { hoverIdx = r.i; if (click) { if (r.adjustable && px > r.x + r.w * 0.55) app.adjust(r.i, px > r.x + r.w * 0.8 ? 1 : -1); else app.select(r.i); } }
    } else if (hit.object === hud.mesh && menuBtn) {
      const px = uv.x * hud.cv.width, py = (1 - uv.y) * hud.cv.height;
      if (px >= menuBtn.x && px <= menuBtn.x + menuBtn.w && py >= menuBtn.y && py <= menuBtn.y + menuBtn.h) { hoverHud = true; if (click) app.pause('user'); }
    }
  }
  return {
    addLaser, place,
    frame(xr, click) {
      hud.mesh.visible = xr && !!app.game && app.screen !== 'title';
      for (const L of lasers) L.line.visible = xr;
      if (!xr) { menu.mesh.visible = false; return; }
      pointer(click); drawHud(); drawMenu();
    },
    invalidate() { hudKey = menuKey = ''; },
  };
}
