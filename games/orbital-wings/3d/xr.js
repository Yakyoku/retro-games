// WebXR（Meta Quest 3 単体のブラウザー）: 没入表示の開始・終了、コントローラー入力、VR 内のメニュー・HUD パネル
// 座ったまま見る固定の立体ジオラマ。カメラ（頭）を勝手に動かしたり回したりしない。HUD は頭に固定せず戦場の下に置く。
import * as THREE from 'three';
import { GAUGE, DIFFICULTY } from '../shared/config.js';
import { BOSS } from '../shared/bosses.js';

const DZ = 0.2;
const dz = (v) => (Math.abs(v) < DZ ? 0 : (v - Math.sign(v) * DZ) / (1 - DZ));
const FONT = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP","Noto Sans CJK JP","Yu Gothic UI",sans-serif';
const fmt = (n) => String(Math.floor(n)).padStart(8, '0');

function panel(w, h, cw, ch, transparent = false) {
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, opacity: 1 }));
  m.renderOrder = 10; m.visible = false;
  m.userData = { canvas: c, ctx: c.getContext('2d'), tex };
  return m;
}

export class XRSupport {
  constructor(r) {
    this.r = r; this.app = r.app; this.renderer = r.renderer;
    this.supported = false; this.session = null; this.prevBtn = new Map(); this.profiles = '';
    this.hits = [];
    this.check();
    // コントローラー（指す線と当たり点）
    this.ctrl = [0, 1].map((i) => {
      const c = this.renderer.xr.getController(i);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.8 }));
      line.scale.z = 2; c.add(line);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffcf3a, depthTest: false }));
      dot.renderOrder = 11; dot.visible = false;
      c.addEventListener('connected', (e) => { c.userData.src = e.data; });
      c.addEventListener('disconnected', () => { c.userData.src = null; });
      c.visible = false;
      r.scene.add(c); r.scene.add(dot);
      return { c, line, dot };
    });
    // パネル（戦場の箱と一緒に置く）
    this.menuP = panel(0.9, 0.9, 1024, 1024); r.rig.add(this.menuP);
    this.hudP = panel(1.9, 0.19, 2048, 205); r.rig.add(this.hudP);
    this.overP = panel(1.3, 0.4, 1300, 400); r.rig.add(this.overP);
    // ゲーム入力の源（共通の Input に足す）
    this.app.input.sources.push(() => this.source());
    this.ray = new THREE.Raycaster();
  }
  async check() {
    try { this.supported = !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')); } catch { this.supported = false; }
    if (this.app.screen === 'title') this.app.showTitle();
  }
  get presenting() { return !!this.session; }
  titleItems() {
    if (this.session) return [
      { label: 'VR 位置をリセット', hint: '今向いている正面に戦場を置き直す', act: () => this.recenter() },
      { label: 'VR を終了', hint: '通常画面に戻る', act: () => this.end() },
    ];
    if (this.supported) return [{ label: 'VR で遊ぶ', hint: 'Quest 3 などで没入表示に入る（座って遊ぶ立体のジオラマ）', act: () => this.start() }];
    return [{ label: 'VR で遊ぶ（このブラウザーは非対応）', disabled: true, hint: 'WebXR の immersive-vr に対応したブラウザー（Quest Browser など）で開いてください' }];
  }
  applySettings(s) {
    this.settings = s;
    const fb = { high: 1.2, low: 0.8 }[s.quality] ?? 1.0;
    if (!this.session) { try { this.renderer.xr.setFramebufferScaleFactor(fb); } catch {} }
    if (this.session) this.layout();
  }

  async start() {
    if (this.session || !navigator.xr) return;
    const s = this.settings || this.app.settings;
    this.fbScale = { high: 1.2, low: 0.8 }[s.quality] ?? 1.0;
    try { this.renderer.xr.setFramebufferScaleFactor(this.fbScale); } catch {}
    let session;
    try { session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] }); }
    catch (e) { this.app.toast('VR を開始できませんでした: ' + (e.message || e), 3000); return; }
    this.session = session;
    try { this.renderer.xr.setReferenceSpaceType('local-floor'); await this.renderer.xr.setSession(session); }
    catch { try { this.renderer.xr.setReferenceSpaceType('local'); await this.renderer.xr.setSession(session); this.noFloor = true; } catch (e) { this.app.toast('VR の開始に失敗: ' + (e.message || e), 3000); session.end().catch(() => {}); this.session = null; return; } }
    try { this.renderer.xr.setFoveation(s.quality === 'low' ? 1 : 0.5); } catch {}
    // リフレッシュレート: 72Hz を基本、高画質で 90Hz に対応していれば 90Hz を要求（実際の値は frameRate で確認）
    try {
      const rates = session.supportedFrameRates ? Array.from(session.supportedFrameRates) : [];
      const want = s.quality === 'high' && rates.includes(90) ? 90 : rates.includes(72) ? 72 : null;
      if (want && session.updateTargetFrameRate) await session.updateTargetFrameRate(want);
    } catch {}
    session.addEventListener('end', () => this.onEnd());
    session.addEventListener('visibilitychange', () => { if (session.visibilityState !== 'visible') this.safeStop(); });
    session.addEventListener('inputsourceschange', (e) => { if (e.removed && e.removed.length) this.safeStop(); this.readProfiles(); });
    this.readProfiles();
    for (const k of this.ctrl) k.c.visible = true;
    this.layout();
    this.needRecenter = 2;
    this.app.input.releaseAll();
    if (this.app.screen === 'title') this.app.showTitle();
    this.app.toast('VR 開始（右トリガーで決定・射撃、右 B で一時停止）', 2500);
  }
  end() { this.session?.end().catch(() => {}); }
  safeStop() { if (this.app.screen === 'play') this.app.pause(true); this.app.input.releaseAll(); this.prevBtn.clear(); }
  onEnd() {
    this.session = null;
    for (const k of this.ctrl) { k.c.visible = false; k.dot.visible = false; }
    this.menuP.visible = this.hudP.visible = this.overP.visible = false;
    this.safeStop();
    // 通常画面へ戻す（エミュレーターなどがキャンバスを移動していたら、メニューより下の先頭へ戻す）
    const cv = this.renderer.domElement, root = this.app.root;
    if (root.firstChild !== cv) root.prepend(cv);
    const rig = this.r.rig; rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0); this.r.vol.scale.setScalar(1);
    setTimeout(() => this.r.resize(true), 0);
    if (this.app.screen === 'title') this.app.showTitle();
  }
  readProfiles() {
    const out = [];
    for (const s of this.session?.inputSources || []) out.push(`${s.handedness}:${(s.profiles || [])[0] || '?'}${s.gamepad ? `(${s.gamepad.mapping || 'no-map'} b${s.gamepad.buttons.length} a${s.gamepad.axes.length})` : ''}`);
    this.profiles = out.join(' ');
  }
  // 戦場の箱を目の前に置く（座った目の高さ・約 1.6m 先・幅約 1.8m）
  layout() {
    const s = this.settings || this.app.settings;
    const scale = (1.8 / 32) * (s.vrScale || 1);
    const rig = this.r.rig;
    if (!this.anchor) this.anchor = { x: 0, y: this.noFloor ? 0 : 1.15, z: 0, yaw: 0 };
    const dist = 1.6 + (s.vrDistance || 0);
    const a = this.anchor;
    rig.position.set(a.x - Math.sin(a.yaw) * dist, a.y + (s.vrHeight || 0), a.z - Math.cos(a.yaw) * dist);
    rig.rotation.set(0, a.yaw, 0);
    this.r.vol.scale.setScalar(scale);
    const half = 9 * scale;
    this.hudP.position.set(0, -half - 0.14, 0.15); this.hudP.rotation.set(-0.35, 0, 0);
    this.menuP.position.set(0, 0.02, 0.55); this.menuP.rotation.set(0, 0, 0);
    this.overP.position.set(0, half * 0.35, 0.35);
  }
  recenter() {
    const cam = this.renderer.xr.getCamera();
    const p = new THREE.Vector3(), d = new THREE.Vector3();
    cam.getWorldPosition(p); cam.getWorldDirection(d);
    const yaw = Math.atan2(-d.x, -d.z);
    this.anchor = { x: p.x, y: p.y - 0.05, z: p.z, yaw };
    this.layout();
    this.app.toast('戦場を正面に置き直しました');
  }

  // ---- 入力 --------------------------------------------------------------------
  readPads() {
    const st = { L: null, R: null };
    for (const s of this.session?.inputSources || []) {
      const gp = s.gamepad; if (!gp) continue;
      const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0];
      const btn = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
      const o = { sx: dz(ax[0] || 0), sy: dz(ax[1] || 0), trigger: btn(0), squeeze: btn(1), a: btn(4), b: btn(5), src: s };
      if (s.handedness === 'left') st.L = o; else st.R = o;     // 'none' は右として扱う
    }
    return st;
  }
  source() {
    if (!this.session) return null;
    const { L, R } = this.readPads();
    const menu = !!this.app.menu;
    return {
      mx: L ? L.sx : 0, my: L ? -L.sy : 0, mz: R ? -R.sy : 0,
      fire: !menu && !!(R && R.trigger),
      power: !!(R && R.a), pause: !!(R && R.b), back: !!(R && R.b) && this.app.screen !== 'play',
      confirm: false,
    };
  }
  pulse(hand, v, ms) {
    if (!this.session || !(this.settings || this.app.settings).vibration) return;
    for (const s of this.session.inputSources) {
      if (hand && s.handedness !== hand) continue;
      const h = s.gamepad?.hapticActuators?.[0];
      try { if (h?.pulse) h.pulse(v, ms); else s.gamepad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: v, weakMagnitude: v }); } catch {}
    }
  }
  onGameEvent(ev) {
    if (!this.session) return;
    if (ev.t === 'die') this.pulse(null, 0.6, 200);
    else if (ev.t === 'powerup') this.pulse('right', 0.25, 40);
    else if (ev.t === 'shieldhit') this.pulse('right', 0.3, 50);
    else if (ev.t === 'bossdown') this.pulse(null, 0.5, 300);
  }
  onPause() {}

  update(frame, dt) {
    if (!this.session) return;
    if (this.needRecenter && frame) { if (--this.needRecenter === 0) this.recenter(); }
    // メニューをレーザーで指してトリガーで決定
    const menuOn = this.menuP.visible;
    this.r.scene.updateMatrixWorld();
    for (const k of this.ctrl) {
      const src = k.c.userData.src;
      k.dot.visible = false;
      k.line.visible = !!src && menuOn;
      if (!src || !menuOn) continue;
      const m = k.c.matrixWorld;
      const o = new THREE.Vector3().setFromMatrixPosition(m);
      const d = new THREE.Vector3(0, 0, -1).transformDirection(m);
      this.ray.set(o, d);
      const hit = this.ray.intersectObject(this.menuP, false)[0];
      const gp = src.gamepad;
      const trig = !!(gp && gp.buttons[0] && gp.buttons[0].pressed);
      const key = src.handedness || 'none';
      const was = this.prevBtn.get(key) || false; this.prevBtn.set(key, trig);
      if (!hit) { k.line.scale.z = 2; continue; }
      k.line.scale.z = hit.distance; k.dot.position.copy(hit.point); k.dot.visible = true;
      const px = hit.uv.x * 1024, py = (1 - hit.uv.y) * 1024;
      const it = this.rects?.find((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
      if (it && it.i !== undefined && this.app.menu && this.app.menu.sel !== it.i && !this.app.menu.items[it.i]?.disabled) {
        this.app.menu.sel = it.i; this.app.drawMenu(); this.app.sfx('cursor'); this.pulse(src.handedness, 0.08, 15);
      }
      if (trig && !was && it) {
        if (it.btn === 'recenter') this.recenter();
        else if (it.btn === 'exit') this.end();
        else if (it.i !== undefined) {
          const item = this.app.menu?.items[it.i];
          if (item?.value && item.adjust) this.app.menuAdjust(px < it.x + it.w * 0.62 ? -1 : 1);
          else this.app.menuConfirm();
        }
        this.pulse(src.handedness, 0.2, 30);
      }
    }
  }

  // ---- パネルの描画 ---------------------------------------------------------------
  drawPanels(g, now) {
    if (!this.session) return;
    const app = this.app;
    const menuOn = !!app.menu && app.screen !== 'boot';
    this.menuP.visible = menuOn;
    if (menuOn) {
      const key = `${app.menuVersion}:${app.menu.sel}`;
      if (key !== this.menuKey || now - (this.menuT || 0) > 0.5) { this.menuKey = key; this.menuT = now; this.drawMenu(app.menu); }
    }
    const playing = g && (app.screen === 'play' || app.screen === 'pause');
    this.hudP.visible = !!playing;
    if (playing && now - (this.hudT || 0) > 0.1) { this.hudT = now; this.drawHud(g); }
    const t = performance.now();
    const ban = app.vrBanner && app.vrBanner.until > t ? app.vrBanner.text : '';
    const toast = app.vrToast && app.vrToast.until > t ? app.vrToast.text : '';
    const ok = ban + '|' + toast;
    this.overP.visible = !!(ban || toast);
    if (this.overP.visible && ok !== this.overKey) { this.overKey = ok; this.drawOverlay(ban, toast); }
  }
  drawMenu(m) {
    const { ctx: x, tex } = this.menuP.userData, W = 1024, H = 1024;
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(8,12,28,0.92)'; roundRect(x, 8, 8, W - 16, H - 16, 28); x.fill();
    x.strokeStyle = 'rgba(120,160,255,0.6)'; x.lineWidth = 3; x.stroke();
    let y = 48;
    this.rects = [];
    if (m.logo) {
      x.textAlign = 'center'; x.font = `italic 900 96px ${FONT}`;
      let gr = x.createLinearGradient(0, y, 0, y + 90); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#2a5aff'); x.fillStyle = gr; x.fillText('ORBITAL', W / 2, y + 86);
      gr = x.createLinearGradient(0, y + 96, 0, y + 196); gr.addColorStop(0, '#fff6c0'); gr.addColorStop(1, '#d8301a'); x.fillStyle = gr; x.font = `italic 900 112px ${FONT}`; x.fillText('WINGS', W / 2, y + 196);
      x.font = `600 28px ${FONT}`; x.fillStyle = '#9aa6c4'; x.fillText('3D / VR', W / 2, y + 236);
      y += 262;
    }
    x.textAlign = 'left';
    if (m.title) { x.font = `700 50px ${FONT}`; x.fillStyle = '#ffcf3a'; x.fillText(m.title, 56, y + 46); y += 76; }
    if (m.body) {
      x.font = `400 26px ${FONT}`; x.fillStyle = '#dfe6ff';
      const text = m.body.replace(/<\/(p|tr|dd|li|h\d)>/g, '\n').replace(/<(br|td|th|dt)[^>]*>/g, (s) => (s.startsWith('<br') ? '\n' : ' ')).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      let lines = 0;
      for (const para of text.split('\n').map((s) => s.trim()).filter(Boolean)) {
        for (const ln of wrap(x, para, W - 112)) { if (lines > 13) break; x.fillText(ln, 56, y + 26); y += 34; lines++; }
      }
      y += 10;
    }
    const rowH = Math.min(68, Math.floor((H - 160 - y) / Math.max(1, m.items.length)));
    m.items.forEach((it, i) => {
      const ry = y + i * rowH, sel = i === m.sel;
      if (sel) { x.fillStyle = 'rgba(255,207,58,0.22)'; roundRect(x, 40, ry + 4, W - 80, rowH - 8, 10); x.fill(); x.strokeStyle = '#ffcf3a'; x.lineWidth = 3; x.stroke(); }
      x.font = `${sel ? 700 : 500} ${Math.min(36, rowH - 24)}px ${FONT}`;
      x.fillStyle = it.disabled ? '#59627a' : sel ? '#ffffff' : '#cfd8f0';
      x.textAlign = 'left'; x.fillText((sel ? '▶ ' : '') + it.label, 64, ry + rowH / 2 + 12);
      if (it.value) { x.textAlign = 'right'; x.fillStyle = '#5ad8ff'; x.fillText(`◀ ${it.value()} ▶`, W - 64, ry + rowH / 2 + 12); }
      this.rects.push({ i, x: 40, y: ry, w: W - 80, h: rowH });
    });
    y += m.items.length * rowH + 8;
    x.textAlign = 'left';
    const hint = m.items[m.sel]?.hint;
    if (hint) { x.font = `400 24px ${FONT}`; x.fillStyle = '#9aa6c4'; for (const ln of wrap(x, hint, W - 112).slice(0, 2)) { x.fillText(ln, 56, y + 24); y += 30; } }
    // 常にある VR 用のボタン
    const by = H - 100;
    const btn = (label, bx, kind) => { x.fillStyle = 'rgba(30,50,110,0.9)'; roundRect(x, bx, by, 440, 64, 12); x.fill(); x.strokeStyle = '#5ad8ff'; x.lineWidth = 2; x.stroke(); x.fillStyle = '#fff'; x.font = `600 30px ${FONT}`; x.textAlign = 'center'; x.fillText(label, bx + 220, by + 43); this.rects.push({ btn: kind, x: bx, y: by, w: 440, h: 64 }); };
    btn('位置をリセット', 48, 'recenter'); btn('VR を終了', W - 488, 'exit');
    tex.needsUpdate = true;
  }
  drawHud(g) {
    const { ctx: x, tex } = this.hudP.userData, W = 2048, H = 205;
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(6,10,24,0.82)'; roundRect(x, 4, 4, W - 8, H - 8, 24); x.fill();
    x.strokeStyle = 'rgba(120,160,255,0.45)'; x.lineWidth = 3; x.stroke();
    x.textAlign = 'left'; x.fillStyle = '#9aa6c4'; x.font = `600 38px ${FONT}`;
    x.fillText('SCORE', 36, 58); x.fillStyle = '#fff'; x.font = `700 46px monospace`; x.fillText(fmt(g.score), 180, 60);
    x.fillStyle = '#9aa6c4'; x.font = `600 30px ${FONT}`;
    x.fillText(`第${g.stageNo}面 ${g.stage.name}  ${DIFFICULTY[g.difficulty].label}${g.mode === 'practice' ? ' 練習' : ''}`, 470, 56);
    x.fillText(`残機 ${Math.max(0, g.lives)}`, 36, 120);
    // ゲージ
    const p = g.power, cw = 190, gx = 470;
    GAUGE.forEach((name, i) => {
      const can = g.canAcquire(i), sel = p.sel === i;
      const bx = gx + i * (cw + 10);
      x.fillStyle = sel ? (can.ok ? '#ffcf3a' : '#6a6a6a') : 'rgba(10,20,70,0.9)'; roundRect(x, bx, 80, cw, 70, 10); x.fill();
      x.strokeStyle = sel ? '#fff2b0' : can.ok ? '#3a56c8' : '#2a3466'; x.lineWidth = 3; x.stroke();
      x.textAlign = 'center'; x.font = `700 30px ${FONT}`; x.fillStyle = sel ? '#1a1200' : can.ok ? '#b8c8ff' : '#6a76a0';
      x.fillText(name, bx + cw / 2, 113);
      const st = { SPEED: p.speed >= 5 ? 'MAX' : `Lv${p.speed}`, MISSILE: p.missile ? '装備' : '', DOUBLE: p.weapon === 'double' ? '装備' : '', LASER: p.weapon === 'laser' ? '装備' : '', OPTION: p.options >= 4 ? 'MAX' : p.options ? String(p.options) : '', SHIELD: p.shield ? `${p.shield}/5` : '' }[name];
      x.font = `500 22px ${FONT}`; x.fillStyle = sel ? '#3a2a00' : '#8af0ff'; x.fillText(st, bx + cw / 2, 140);
    });
    // 奥行き（横の目盛り）
    const dx = 1700, dw = 300, k = (g.player.z + 2.6) / 5.2;
    x.textAlign = 'left'; x.fillStyle = '#9ad8ff'; x.font = `500 24px ${FONT}`; x.fillText('手前', dx - 4, 186); x.textAlign = 'right'; x.fillText('奥', dx + dw + 4, 186);
    const gr = x.createLinearGradient(dx, 0, dx + dw, 0); gr.addColorStop(0, '#5ad8ff'); gr.addColorStop(1, '#0a2a6a');
    x.fillStyle = gr; x.fillRect(dx, 150, dw, 12); x.fillStyle = '#ffcf3a'; x.fillRect(dx + k * dw - 6, 142, 12, 28);
    // ボスの体力
    const bo = g.boss && !g.boss.dead ? g.boss : null;
    if (bo) {
      const def = BOSS[bo.type], [c, m] = def.bossHp(bo);
      x.textAlign = 'left'; x.fillStyle = '#ffb0b8'; x.font = `600 26px ${FONT}`; x.fillText(def.name, 1700, 56);
      x.strokeStyle = 'rgba(255,140,150,0.8)'; x.strokeRect(1700, 70, 300, 18); x.fillStyle = '#ff4a4a'; x.fillRect(1700, 70, 300 * (m ? c / m : 0), 18);
    } else {
      x.textAlign = 'left'; x.fillStyle = '#9aa6c4'; x.font = `500 24px ${FONT}`;
      x.fillText(`${p.weapon === 'laser' ? 'LASER' : p.weapon === 'double' ? 'DOUBLE' : 'SHOT'}${p.missile ? ' / MISSILE' : ''}${p.options ? ` / OPT×${p.options}` : ''}`, 1700, 56);
    }
    tex.needsUpdate = true;
  }
  drawOverlay(ban, toast) {
    const { ctx: x, tex } = this.overP.userData, W = 1300, H = 400;
    x.clearRect(0, 0, W, H);
    x.textAlign = 'center';
    if (ban) {
      const lines = ban.split('\n');
      x.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(x, 100, 20, W - 200, 60 + lines.length * 70, 20); x.fill();
      lines.forEach((ln, i) => { x.font = `${i === (lines.length > 1 ? 1 : 0) ? 800 : 600} ${i === 1 || lines.length === 1 ? 72 : 40}px ${FONT}`; x.fillStyle = i === 1 || lines.length === 1 ? '#ffffff' : '#ffcf3a'; x.fillText(ln, W / 2, 80 + i * 72); });
    }
    if (toast) { x.font = `700 44px ${FONT}`; x.fillStyle = 'rgba(0,0,0,0.6)'; const w = Math.min(W - 40, x.measureText(toast).width + 60); roundRect(x, (W - w) / 2, H - 92, w, 70, 16); x.fill(); x.fillStyle = '#fff'; x.fillText(toast, W / 2, H - 42); }
    tex.needsUpdate = true;
  }
  debugText() {
    if (!this.session) return `XR ${this.supported ? '対応' : '非対応'}`;
    const s = this.session;
    return `XR on ${s.frameRate ? Math.round(s.frameRate) + 'Hz' : '?Hz'} fb×${this.fbScale ?? 1} ${this.profiles}`;
  }
}

function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function wrap(x, text, maxW) {
  const out = []; let cur = '';
  for (const ch of text) { if (x.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; } else cur += ch; }
  if (cur) out.push(cur);
  return out;
}
