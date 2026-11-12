// 鉄骨レスキュー — 3D VR（WebXR immersive-vr。Meta Quest 3 の Meta Quest Browser 単体で動く）。
// ・左右眼の立体視と頭の追跡は WebXR（three の WebXRManager）が行う。頭の姿勢を通常のカメラ制御で上書きしない
// ・移動用の親リグ（rig）とカメラ（頭）を分ける。リグだけを主人公に合わせて動かす
// ・体験視点（一人称）: 舞台を 1.85 倍（主人公の背丈を大人の背丈に）して足場に立つ
// ・俯瞰視点（模型）: 舞台を 1/13 の立体模型にして目の前の台に置き、模型の中の主人公を操作する
// ・快適性: 高さ補正・リセンター・座位/立位、ジャンプ・昇降中の周辺減光、頭が壁に入ったらフェード、ミス後は短いフェードで復帰
//   ヘッドボブ・カメラロール・自動回転・強制的な押し戻しは使わない。快適性の設定は当たり判定・物理時間を変えない
import * as THREE from 'three';
import { DEPTH } from '../shared/render/world.js';
import { surfaceY } from '../shared/stages.js';
import { makeHammer } from '../shared/render/models.js';

const K_FIRST = 1.85;            // 一人称の縮尺（主人公 0.95m → 約 1.75m）
const K_MODEL = 1 / 13;          // 模型の縮尺（16m → 約 1.23m）
const HERO_EYE = 0.85;           // 主人公の目の高さ（舞台の m）
const MONO = '"Noto Sans CJK JP","Noto Sans JP","Hiragino Sans","Yu Gothic",system-ui,sans-serif';

class Panel {
  constructor(pw, ph, wMeters) {
    this.c = document.createElement('canvas'); this.c.width = pw; this.c.height = ph; this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.tex.generateMipmaps = true; this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(wMeters, wMeters * ph / pw), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    this.mesh.renderOrder = 50; this.key = ''; this.w = wMeters; this.h = wMeters * ph / pw;
  }
  draw(key, fn) { if (key === this.key) return; this.key = key; const g = this.g; g.clearRect(0, 0, this.c.width, this.c.height); g.save(); fn(g, this.c.width, this.c.height); g.restore(); this.tex.needsUpdate = true; }
}
function rrect(g, x, y, w, h, r, fill, stroke) { g.beginPath(); g.roundRect(x, y, w, h, r); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 4; g.stroke(); } }
function wrap(g, text, maxW) {
  const out = []; let line = '';
  for (const ch of text) { if (g.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; }
  if (line) out.push(line); return out;
}

function makeGlove(side) {
  const m = new THREE.MeshStandardMaterial({ color: 0xead9b5, roughness: 0.8 });
  const cuff = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6 });
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 14), m); palm.scale.set(1.0, 0.55, 1.25); palm.position.set(0, -0.01, 0.03); g.add(palm);
  for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.04, 4, 8), m); f.rotation.x = Math.PI / 2 - 0.5; f.position.set((i - 1.5) * 0.02, -0.02, -0.03); g.add(f); }
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.03, 4, 8), m); th.position.set(side * -0.04, 0, 0.0); th.rotation.z = side * 0.9; g.add(th);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.04, 16), cuff); c.rotation.x = Math.PI / 2; c.position.z = 0.085; g.add(c);
  return g;
}

export class VRMode {
  constructor({ renderer, scene, stageHolder, getWorld, input, audio, save }) {
    Object.assign(this, { renderer, scene, stageHolder, getWorld, input, audio, save });
    this.S = save.settings;
    this.active = false; this.session = null; this.lastError = '';
    this.rig = new THREE.Group(); this.rig.name = 'xr-rig'; scene.add(this.rig);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.03, 600); this.rig.add(this.camera);
    this.yaw = 0; this.modelYaw = 0; this.offset = new THREE.Vector3(); this.needRecenter = true;
    this.view = this.S.vrView;
    // コントローラー
    this.ctrl = [0, 1].map((i) => {
      const c = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
      this.rig.add(c, grip);
      const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 }));
      ray.scale.z = 3; ray.visible = false; c.add(ray);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a, depthTest: false })); dot.renderOrder = 60; dot.visible = false; scene.add(dot);
      const o = { c, grip, ray, dot, hand: null, glove: null, source: null, prevTrig: false, prevA: false };
      c.addEventListener('connected', (e) => { o.source = e.data; o.hand = e.data.handedness; if (!o.glove) { o.glove = makeGlove(o.hand === 'left' ? -1 : 1); grip.add(o.glove); if (o.hand === 'right') { this.hammer = makeHammer(); this.hammer.scale.setScalar(0.9); this.hammer.rotation.set(-Math.PI / 2 - 0.3, 0, 0); this.hammer.position.set(0, 0, -0.02); this.hammer.visible = false; grip.add(this.hammer); } } });
      c.addEventListener('disconnected', () => { o.source = null; if (this.active && this.onPauseRequest) this.onPauseRequest('コントローラーとの接続が切れました。'); });
      return o;
    });
    // 文字の板
    this.menuP = new Panel(1600, 1200, 1.25); this.menuP.mesh.visible = false; scene.add(this.menuP.mesh);
    this.hudP = new Panel(1600, 260, 1.2); scene.add(this.hudP.mesh); this.hudP.mesh.visible = false;
    this.banP = new Panel(1200, 300, 0.8); scene.add(this.banP.mesh); this.banP.mesh.visible = false;
    this.bannerT = 0; this.bannerLines = [];
    // 快適性: 周辺減光とフェード（頭に固定）
    const vc = document.createElement('canvas'); vc.width = vc.height = 256; const vg = vc.getContext('2d');
    const gr = vg.createRadialGradient(128, 128, 40, 128, 128, 128); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.55, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    vg.fillStyle = gr; vg.fillRect(0, 0, 256, 256);
    this.vig = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(vc), transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
    this.vig.position.z = -0.12; this.vig.renderOrder = 90; this.camera.add(this.vig);
    this.fade = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.fade.renderOrder = 99; this.camera.add(this.fade);
    this.fadeT = 0; this.fadeTarget = 0; this.wallFade = 0;
    this.raycaster = new THREE.Raycaster();
    this.menu = null; this.menuModel = null; this.hoverIdx = -1; this.hoverD = 0;
    this.snapArmed = true; this.lostT = 0; this.stat = { frameRate: 0, fb: 0, eye: '' };
    this.xrState = { x: 0, y: 0 };
    input.xr = { read: () => this.read() };
    this.supported = null;
    this.isSupported();
  }

  supportText() { return this.supported === false ? '（この端末は非対応）' : this.supported ? 'Quest 3 対応' : ''; }
  async isSupported() {
    if (this.supported != null) return this.supported;
    if (!window.isSecureContext) { this.lastError = 'VR は HTTPS のページでだけ使えます。'; return (this.supported = false); }
    if (!navigator.xr) { this.lastError = 'このブラウザーは WebXR に対応していません。'; return (this.supported = false); }
    try { this.supported = await navigator.xr.isSessionSupported('immersive-vr'); } catch { this.supported = false; }
    if (!this.supported) this.lastError = 'この端末では WebXR の immersive-vr を使えません。';
    return this.supported;
  }

  // ユーザーの操作（ボタン）から呼ぶ
  async enter() {
    if (this.active) return true;
    if (!(await this.isSupported())) return false;
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      this.renderer.xr.setReferenceSpaceType('local-floor');
      const high = this.S.vrQuality === 'high';
      this.renderer.xr.setFramebufferScaleFactor(high ? 1.2 : 1.0);
      await this.renderer.xr.setSession(session);
      this.renderer.xr.setFoveation(high ? 0.5 : 1.0);
      this.session = session; this.active = true; this.needRecenter = true; this.lostT = 0;
      this.input.suppressPads = true; this.input.releaseAll();
      session.addEventListener('end', () => this.onEnd());
      session.addEventListener('visibilitychange', () => { if (session.visibilityState !== 'visible' && this.onPauseRequest) this.onPauseRequest('VR の表示が中断されました（システムメニューなど）。'); this.input.releaseAll(); });
      session.addEventListener('inputsourceschange', (e) => { if (e.removed && e.removed.length && this.onPauseRequest) this.onPauseRequest('コントローラーが外れました。'); });
      await this.applyRefresh();
      this.getWorld().firstPerson = this.view === 'first';
      this.hudP.mesh.visible = true;
      this.place(0);
      return true;
    } catch (e) {
      this.lastError = e && e.name === 'NotAllowedError' ? 'VR の開始が許可されませんでした。もう一度ボタンを押し、許可してください。' : `VR を開始できませんでした（${e && e.message || e}）。`;
      return false;
    }
  }
  async applyRefresh() {
    const s = this.session; if (!s) return;
    const want = this.S.vrRefresh;
    try { if (s.supportedFrameRates && s.updateTargetFrameRate) { const ok = [...s.supportedFrameRates].includes(want) ? want : 72; await s.updateTargetFrameRate(ok); } } catch { /* 非対応 */ }
    this.stat.frameRate = s.frameRate || want;
  }
  exit() { if (this.session) this.session.end().catch(() => {}); }
  onEnd() {
    this.active = false; this.session = null; this.input.suppressPads = false; this.input.releaseAll();
    this.getWorld().firstPerson = false; this.menuP.mesh.visible = false; this.hudP.mesh.visible = false; this.banP.mesh.visible = false;
    for (const o of this.ctrl) { o.ray.visible = false; o.dot.visible = false; }
    this.stageHolder.position.set(0, 0, 0); this.stageHolder.rotation.set(0, 0, 0); this.stageHolder.scale.setScalar(1);
    const w = this.getWorld(); w.env.position.set(0, 0, 0); w.env.scale.setScalar(1); w.setShadowFrame(1);
    this.onExit && this.onExit();
  }
  applySettings() {
    this.view = this.S.vrView;
    if (this.active) { this.getWorld().firstPerson = this.view === 'first'; this.needRecenter = true; this.applyRefresh(); }
  }
  recenter() { this.needRecenter = true; }
  onStage(g) { this.g = g; this.needRecenter = true; if (this.active) this.flash(0.35); }
  onMiss() { /* ミスの間は暗くしない（何が起きたか見えるように） */ }
  onRespawn() { if (this.active) this.flash(0.4); }
  flash(sec) { this.fadeT = sec; }
  haptic(hand, v, ms) {
    for (const o of this.ctrl) if (o.source && o.source.gamepad && (o.hand === 'right') === (hand === 1)) { const h = o.source.gamepad.hapticActuators; if (h && h[0] && h[0].pulse) h[0].pulse(v, ms).catch(() => {}); }
  }

  // ---------------------------------------------------------------- 入力
  pad(hand) { const o = this.ctrl.find((q) => q.hand === hand); return o && o.source && o.source.gamepad; }
  read() {
    const out = { x: 0, y: 0, any: false };
    if (!this.active) return out;
    const L = this.pad('left'), R = this.pad('right');
    const b = (p, i) => !!(p && p.buttons[i] && p.buttons[i].pressed);
    const ax = (p, i) => (p && p.axes[i]) || 0;
    let lx = ax(L, 2), ly = -ax(L, 3);
    const m = Math.hypot(lx, ly); if (m < 0.2) { lx = 0; ly = 0; }
    out.x = lx; out.y = ly;
    this.xrState = { x: lx, y: ly };
    const menuOpen = !!this.menu;
    out.jump = b(R, 4); out.pause = b(R, 5); out.grab = b(L, 1) || b(R, 1);
    out.act = !menuOpen && b(R, 0);
    out.confirm = menuOpen && b(R, 4);
    out.back = menuOpen && b(R, 5);
    // 右スティックの左右: 30° のスナップ回転（一人称）／模型の向き（俯瞰）。倒すたびに 1 回
    const rx = ax(R, 2);
    if (this.snapArmed && Math.abs(rx) > 0.7) { this.snapArmed = false; if (!menuOpen) this.snap(Math.sign(rx)); }
    if (Math.abs(rx) < 0.3) this.snapArmed = true;
    out.any = !!(lx || ly || out.jump || out.pause || out.grab || out.act);
    return out;
  }
  snap(dir) {
    const a = THREE.MathUtils.degToRad(this.S.vrSnapTurn) * -dir;
    if (this.view === 'model') { this.modelYaw += a; return; }
    // 頭の位置を中心にリグを回す（place() は rig = 目標 + R(yaw)·offset なので、yaw を変えるだけで頭の位置は動かない）
    this.yaw += a;
  }
  // ゲームの論理へ渡す入力（体験視点では、水平化した頭の向きを基準に左スティックを舞台の左右へ写す）
  gameInput(gi, g) {
    if (!this.active) return gi;
    if (this.view === 'first') {
      g.ladderNeedsGrab = true;
      if (this.S.vrMoveBasis === 'head') {
        const { x, y } = this.xrState;
        if (x || y) {
          const q = new THREE.Quaternion(); this.camera.getWorldQuaternion(q);
          const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q); fwd.y = 0; if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1); fwd.normalize();
          const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
          const mv = right.multiplyScalar(x).add(fwd.multiplyScalar(y));
          if (g.player.state !== 'climb') gi = { ...gi, x: Math.abs(mv.x) > 0.25 ? Math.sign(mv.x) * Math.min(1, Math.abs(mv.x) * 1.25) : 0 };
        }
      }
    } else g.ladderNeedsGrab = false;
    return gi;
  }

  // ---------------------------------------------------------------- 配置
  place(dt) {
    const w = this.getWorld(); const g = this.g;
    const st = w.stage; if (!st) return;
    const S = this.S;
    if (this.view === 'first') {
      const K = K_FIRST;
      this.stageHolder.scale.setScalar(K); this.stageHolder.position.set(0, 0, 0); this.stageHolder.rotation.set(0, 0, 0);
      w.env.scale.setScalar(K); w.env.position.set(0, 0, 0);
      w.setShadowFrame(K);
      const hero = w.hero.position;
      const nominal = S.vrStance === 'seated' ? 1.2 : 1.6;
      const target = new THREE.Vector3(hero.x * K, hero.y * K + HERO_EYE * K - nominal + S.vrHeight, 0.15 * K);
      if (this.needRecenter) {
        // 今の頭の位置（リグ内）を主人公の真上へ合わせ、舞台の正面（-z）へ向き直す
        const local = this.camera.position.clone(); local.y = 0;
        this.yaw = 0;
        this.offset.copy(local).multiplyScalar(-1);
        this.needRecenter = false;
      }
      this.rig.rotation.set(0, this.yaw, 0);
      const off = this.offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      this.rig.position.copy(target).add(off);
    } else {
      const k = K_MODEL;
      this.stageHolder.scale.setScalar(k);
      const baseY = (S.vrStance === 'seated' ? 0.62 : 0.86) + S.vrHeight;
      const C = new THREE.Vector3(0, baseY + st.height / 2 * k, -1.05);
      this.stageHolder.rotation.set(0, this.modelYaw, 0);
      const local = new THREE.Vector3(st.width / 2 * k, st.height / 2 * k, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.modelYaw);
      this.stageHolder.position.copy(C).sub(local);
      w.env.scale.setScalar(1); w.env.position.set(-st.width / 2, -1.6, 0);
      w.setShadowFrame(k);
      if (this.needRecenter) { const local2 = this.camera.position.clone(); local2.y = 0; this.offset.copy(local2).multiplyScalar(-1); this.yaw = 0; this.needRecenter = false; }
      this.rig.rotation.set(0, this.yaw, 0);
      this.rig.position.copy(this.offset);
      this.dioramaC = C;
    }
    void g; void dt;
  }
  worldPos(x, y) {
    const v = new THREE.Vector3(x, y, 0); this.stageHolder.updateMatrixWorld(); this.stageHolder.localToWorld(v); return [v.x, v.y, v.z];
  }

  // ---------------------------------------------------------------- メニューと文字
  setMenu(model) {
    this.menuModel = model; this.menu = model ? model.menu : null; this.menuPlaced = false; this.menuP.key = '';
  }
  banner(lines, sec) { this.bannerLines = lines; this.bannerT = sec; this.banP.key = ''; }
  hud(h, rec, run) { this.hudInfo = { h, rec, run }; }
  stats() { const s = this.stat; return `XR ${s.frameRate || '?'}Hz  片眼 ${s.eye}  倍率 ${this.renderer.xr.getFramebuffer ? '' : ''}${this.S.vrQuality === 'high' ? 1.2 : 1.0}  視点 ${this.view}`; }

  drawMenu() {
    const mm = this.menuModel; if (!mm) return;
    const items = mm.menu.items;
    const key = JSON.stringify([mm.title, mm.lines, items.map((it) => [it.label, it.value ? it.value() : '', it.disabled]), mm.menu.sel, this.hoverIdx, mm.note, mm.hint]);
    this.menuP.draw(key, (g, W, H) => {
      rrect(g, 8, 8, W - 16, H - 16, 48, 'rgba(10,16,30,0.92)', 'rgba(255,255,255,0.25)');
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ffc51a'; g.font = `900 92px ${MONO}`; g.fillText(mm.title, W / 2, 100);
      let y = 170;
      if (mm.sub) { g.fillStyle = '#e9f4ff'; g.font = `800 40px ${MONO}`; g.fillText(mm.sub, W / 2, y); y += 60; }
      g.font = `500 36px ${MONO}`; g.fillStyle = '#f6f1e4';
      const lines = (mm.lines || []).flatMap((l) => wrap(g, l, W - 160)).slice(0, 9);
      for (const l of lines) { g.fillText(l, W / 2, y); y += 46; }
      y += 16;
      const rowH = Math.min(84, (H - y - (mm.note ? 150 : 90)) / Math.max(1, items.length));
      this.rows = [];
      items.forEach((it, i) => {
        const sel = i === mm.menu.sel, x = 160, w = W - 320, top = y + i * rowH;
        rrect(g, x, top + 4, w, rowH - 10, 22, sel ? '#ff9a1a' : 'rgba(20,30,52,0.95)', sel ? '#ffe08a' : 'rgba(255,255,255,0.12)');
        g.fillStyle = sel ? '#1b0e04' : it.disabled ? '#6b7385' : '#f6f1e4';
        g.font = `800 ${Math.round(rowH * 0.46)}px ${MONO}`; g.textAlign = 'left';
        g.fillText(it.label + (it.note ? '　' + it.note : ''), x + 34, top + rowH / 2);
        if (it.value) { g.textAlign = 'right'; g.fillStyle = sel ? '#1b0e04' : '#ffc51a'; g.fillText((it.lr ? '◀ ' : '') + it.value() + (it.lr ? ' ▶' : ''), x + w - 30, top + rowH / 2); }
        this.rows.push({ i, x, y: top, w, h: rowH, lr: !!it.lr });
      });
      g.textAlign = 'center';
      if (mm.hint) { g.fillStyle = '#b9c3d3'; g.font = `500 32px ${MONO}`; g.fillText(mm.hint, W / 2, H - (mm.note ? 120 : 50)); }
      if (mm.note) {
        // 制作の注記（Quest のタイトルでも読める大きさ・明暗差）
        rrect(g, W / 2 - 560, H - 100, 1120, 70, 35, 'rgba(0,0,0,0.6)', 'rgba(255,255,255,0.3)');
        g.fillStyle = '#eef2f7'; g.font = `600 40px ${MONO}`; g.fillText(mm.note, W / 2, H - 65);
      }
      g.fillStyle = '#7d8aa3'; g.font = `500 28px ${MONO}`; g.fillText('右トリガーで決定　右スティックの上下・左スティックで選択　右 B でもどる', W / 2, 30 + 8);
    });
  }

  drawHUD() {
    const hi = this.hudInfo; if (!hi || !hi.run) { this.hudP.mesh.visible = false; return; }
    this.hudP.mesh.visible = true;
    const { h, rec, run } = hi;
    const dev = h.devices.length && !h.stage.tutorial ? h.devices.map((d) => (d.done ? '●' : d.order === h.nextDevice ? '◎' : '○')).join('') : '';
    const key = [h.score, h.lives, h.time, h.stage.id, h.hammer > 0 ? h.hammer.toFixed(1) : 0, dev, h.tutorialIndex, run.practice, rec.hi].join('|');
    this.hudP.draw(key, (g, W, H) => {
      rrect(g, 6, 6, W - 12, H - 12, 40, 'rgba(6,10,20,0.78)', 'rgba(255,255,255,0.2)');
      g.textBaseline = 'middle';
      const cell = (x, label, val, col = '#f6f1e4') => { g.textAlign = 'center'; g.fillStyle = '#b9c3d3'; g.font = `700 30px ${MONO}`; g.fillText(label, x, 58); g.fillStyle = col; g.font = `900 62px ${MONO}`; g.fillText(val, x, 120); };
      cell(190, 'SCORE', h.score.toLocaleString());
      cell(520, '面', h.stage.name.replace(/^第(\d)面 /, '$1 '), '#ffc51a');
      cell(860, 'TIME', h.stage.tutorial ? '—' : String(h.time), h.time <= 30 && !h.stage.tutorial ? '#ff6a5a' : '#f6f1e4');
      cell(1120, '残機', h.stage.tutorial ? '∞' : String(h.lives), '#ffc51a');
      cell(1400, 'HI', Math.max(rec.hi, run.practice ? 0 : h.score).toLocaleString());
      g.textAlign = 'center'; g.font = `800 40px ${MONO}`;
      const tags = [];
      if (h.hammer > 0) tags.push(`ハンマー ${h.hammer.toFixed(1)}秒`);
      if (dev) tags.push(`装置 ${dev}  次は ${'①②③④'[Math.min(4, h.nextDevice) - 1]}`);
      if (run.practice || run.switched) tags.push(run.tutorial ? 'チュートリアル' : '練習');
      g.fillStyle = '#ffe08a'; g.fillText(tags.join('　'), W / 2, 200);
      if (h.tutorialStep) { g.fillStyle = '#7fe6f0'; g.font = `700 34px ${MONO}`; g.fillText(`${h.tutorialIndex + 1}/${h.stage.steps.length} ${vrTutorialText(h.tutorialStep)}`, W / 2, 238); }
    });
  }

  // ---------------------------------------------------------------- 毎フレーム
  frame(dt, t, run, xrFrame, o) {
    if (!this.active) return;
    const w = this.getWorld();
    // 追跡喪失
    const ref = this.renderer.xr.getReferenceSpace();
    const pose = xrFrame && ref ? xrFrame.getViewerPose(ref) : null;
    if (!pose) { this.lostT += dt; if (this.lostT > 0.4 && run && this.onPauseRequest) { this.onPauseRequest('頭の追跡が失われました。周囲を明るくして、再開してください。'); this.lostT = -999; } }
    else { if (this.lostT > 0) this.lostT = 0; if (pose.views && pose.views[0]) { const vp = this.renderer.xr.getBaseLayer && this.renderer.xr.getBaseLayer(); if (vp && vp.getViewport) { const v = vp.getViewport(pose.views[0]); if (v) this.stat.eye = `${v.width}×${v.height}`; } } }
    this.place(dt);
    w.firstPerson = this.view === 'first';
    // 頭の位置と向き
    const head = new THREE.Vector3(), q = new THREE.Quaternion();
    this.camera.getWorldPosition(head); this.camera.getWorldQuaternion(q);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q); fwd.y = 0; fwd.normalize();
    if (this.audio.spatial) { this.camera.updateMatrixWorld(); this.audio.setListener(this.camera.matrixWorld.elements); }
    // 手に持つハンマー
    const p = run && run.g.player;
    if (this.hammer) { this.hammer.visible = !!(p && p.hammerT > 0) && this.view === 'first'; if (p && p.swingT > 0) this.hammer.rotation.x = -Math.PI / 2 - 0.3 + Math.sin((1 - p.swingT / 0.22) * Math.PI) * 1.2; else this.hammer.rotation.x = -Math.PI / 2 - 0.3; }
    // HUD: 一人称は視線の少し下に、頭の向きへゆっくり追従。模型は模型の上
    this.drawHUD();
    if (this.view === 'first') {
      const target = head.clone().add(fwd.clone().multiplyScalar(1.35)); target.y = head.y - 0.42;
      if (!this.hudPos) this.hudPos = target.clone();
      this.hudPos.lerp(target, 1 - Math.exp(-2.5 * dt));
      this.hudP.mesh.position.copy(this.hudPos); this.hudP.mesh.lookAt(head.x, head.y, head.z);
    } else if (this.dioramaC) {
      const st = w.stage;
      this.hudP.mesh.position.set(0, this.dioramaC.y + st.height / 2 * K_MODEL + 0.16, this.dioramaC.z);
      this.hudP.mesh.lookAt(head.x, head.y, head.z);
    }
    // 告知（READY・ミス・クリア）
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      this.banP.mesh.visible = true;
      this.banP.draw(this.bannerLines.join('|'), (g, W, H) => {
        rrect(g, 6, 6, W - 12, H - 12, 40, 'rgba(6,10,20,0.82)', '#ffc51a');
        g.textAlign = 'center'; g.textBaseline = 'middle';
        this.bannerLines.slice(0, 2).forEach((l, i) => { g.fillStyle = i ? '#f6f1e4' : '#ffc51a'; g.font = `900 ${i ? 52 : 96}px ${MONO}`; g.fillText(l, W / 2, i ? 220 : 110); });
      });
      const bp = head.clone().add(fwd.clone().multiplyScalar(1.6)); bp.y = head.y + 0.12;
      this.banP.mesh.position.copy(bp); this.banP.mesh.lookAt(head.x, head.y, head.z);
    } else this.banP.mesh.visible = false;
    // メニュー（開いたときに頭の正面へ置き、その場に固定）
    if (this.menu) {
      if (!this.menuPlaced) {
        const mp = head.clone().add(fwd.clone().multiplyScalar(1.45)); mp.y = head.y - 0.05;
        this.menuP.mesh.position.copy(mp); this.menuP.mesh.lookAt(head.x, head.y - 0.05, head.z);
        this.menuPlaced = true;
      }
      this.menuP.mesh.visible = true;
      this.drawMenu();
      this.rayMenu();
    } else {
      this.menuP.mesh.visible = false;
      for (const c of this.ctrl) { c.ray.visible = false; c.dot.visible = false; }
    }
    // 快適性: ジャンプ・昇降・落下中の周辺減光（設定で無効化できる）
    let vig = 0;
    if (p && this.view === 'first' && this.S.vrVignette) {
      if (p.state === 'air') vig = Math.min(0.85, 0.35 + Math.abs(p.vy) * 0.06);
      else if (p.state === 'climb' && p.climbDir) vig = 0.45;
      else if (p.state === 'ground' && run.g.stage.byId[p.plat] === undefined) vig = 0.3; // 昇降機
    }
    this.vig.material.opacity += (vig - this.vig.material.opacity) * (1 - Math.exp(-10 * dt));
    this.vig.visible = this.vig.material.opacity > 0.01;
    // 頭が足場・梁に入ったら暗くする（押し戻しはしない）
    this.wallFade = this.view === 'first' && run ? this.headInside(head, w) : 0;
    if (this.fadeT > 0) this.fadeT -= dt;
    const fadeTarget = Math.max(this.wallFade ? 0.92 : 0, this.fadeT > 0 ? Math.min(1, this.fadeT / 0.2) : 0, run && run.g.phase === 'dying' && run.g.phaseT > 1.6 ? (run.g.phaseT - 1.6) / 0.4 : 0);
    this.fade.material.opacity += (fadeTarget - this.fade.material.opacity) * (1 - Math.exp(-14 * dt));
    this.fade.visible = this.fade.material.opacity > 0.01;
    void t; void o;
  }

  headInside(head, w) {
    const K = K_FIRST, st = w.stage;
    const x = head.x / K, y = head.y / K, z = head.z / K;
    if (Math.abs(z) > DEPTH / 2) return 0;
    for (const p of st.platforms) {
      if (x < p.x0 || x > p.x1) continue;
      const s = surfaceY(p, x);
      if (y < s - 0.02 && y > s - p.thick - 0.05) return 1;
    }
    return 0;
  }

  rayMenu() {
    const mesh = this.menuP.mesh; mesh.updateMatrixWorld();
    let hovered = -1, hoverD = 0;
    for (const o of this.ctrl) {
      if (!o.source || o.hand !== 'right' && this.ctrl.some((q) => q.hand === 'right' && q.source)) { o.ray.visible = false; o.dot.visible = false; continue; }
      o.ray.visible = true;
      const m = o.c.matrixWorld;
      const origin = new THREE.Vector3().setFromMatrixPosition(m);
      const dir = new THREE.Vector3(0, 0, -1).transformDirection(m);
      this.raycaster.set(origin, dir);
      const hit = this.raycaster.intersectObject(mesh, false)[0];
      const gp = o.source.gamepad;
      const trig = !!(gp && gp.buttons[0] && gp.buttons[0].pressed);
      if (hit) {
        o.ray.scale.z = hit.distance; o.dot.visible = true; o.dot.position.copy(hit.point);
        const u = hit.uv; const px = u.x * this.menuP.c.width, py = (1 - u.y) * this.menuP.c.height;
        const row = (this.rows || []).find((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
        if (row) {
          hovered = row.i;
          if (row.lr) hoverD = px < row.x + row.w * 0.5 ? -1 : 1;
          if (this.menu.sel !== row.i && !this.menu.items[row.i].disabled) { this.menu.sel = row.i; this.menu.render(); this.audio.play('menuMove'); }
          if (trig && !o.prevTrig) {
            const it = this.menu.items[row.i];
            if (it.lr && !it.act) this.menu.pick(row.i, hoverD);
            else this.menu.pick(row.i, 0);
            this.haptic(1, 0.3, 30);
          }
        }
      } else { o.ray.scale.z = 3; o.dot.visible = false; }
      o.prevTrig = trig;
    }
    this.hoverIdx = hovered; this.hoverD = hoverD;
  }
}

function vrTutorialText(step) {
  const t = { move: '左スティックで歩こう。右の旗まで', jump: '右 A でジャンプ。木箱を跳び越えよう', ladder: '青いはしごの前でグリップ（つかむ）→ 左スティック上で登る。赤い札のはしごは登れない',
    danger: '樽が来る！ 赤く光ったら転がってくる合図。跳び越すと 100 点', hammer: 'ハンマーを取って右トリガーで振ろう（地上だけ・8 秒）', device: '右端の装置の前で右トリガー' };
  return t[step.id] || step.text;
}
