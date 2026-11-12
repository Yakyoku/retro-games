// Sky Climber VR — WebXR（Meta Quest Browser を想定）。セッションの開始・終了、左右コントローラーの姿勢と入力、振動、
// 表示状態（ヘッドセットを外した・メニューを開いた＝hidden / visible-blurred）を扱う。
// 左右は inputSource.handedness で判定する（接続順やボタン番号の順番に頼らない）。
// xr-standard マッピング: buttons[0]=トリガー、[1]=グリップ、[3]=スティック押し込み、[4]=A/X、[5]=B/Y、axes[2],[3]=スティック。
import * as THREE from 'three';
// 実機では emulatedPosition（位置を推定しているだけ＝追跡喪失）の姿勢は移動に使わない。エミュレーター（IWER）での検証時だけ ?xremu=1 で許可
export class XRInput {
  static allowEmulated = new URLSearchParams(location.search).has('xremu');
  constructor(renderer) {
    this.r = renderer; this.session = null; this.supported = false; this.visibility = 'hidden';
    this.prev = { L: {}, R: {} }; this.onEnd = null; this.onVisibility = null; this.onStart = null;
    this.ready = navigator.xr ? navigator.xr.isSessionSupported('immersive-vr').then((ok) => (this.supported = ok)).catch(() => false) : Promise.resolve(false);
  }
  async start() {
    if (!navigator.xr) throw new Error('このブラウザーは WebXR に対応していません');
    const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    this.session = s;
    s.addEventListener('end', () => { this.session = null; this.visibility = 'hidden'; this.onEnd?.(); });
    s.addEventListener('visibilitychange', () => { this.visibility = s.visibilityState; this.onVisibility?.(s.visibilityState); });
    await this.r.xr.setSession(s);
    this.visibility = s.visibilityState || 'visible';
    // 対応するリフレッシュレートを確認し、90Hz があれば使う（なければ既定の 72Hz 等）
    this.rates = s.supportedFrameRates ? Array.from(s.supportedFrameRates) : [];
    if (s.updateTargetFrameRate && this.rates.includes(90)) { try { await s.updateTargetFrameRate(90); } catch (e) { /* 既定のまま */ } }
    this.rate = s.frameRate || null;
    this.onStart?.(s);
    return s;
  }
  async end() { if (this.session) await this.session.end(); }
  // rig 内の座標（reference space）での姿勢。handedness 'left'/'right'
  poll() {
    const out = { L: null, R: null, head: null };
    const frame = this.r.xr.getFrame(), ref = this.r.xr.getReferenceSpace();
    if (!frame || !ref || !this.session) return out;
    const vp = frame.getViewerPose(ref);
    if (vp) { const p = vp.transform.position, o = vp.transform.orientation; out.head = { x: p.x, y: p.y, z: p.z, q: new THREE.Quaternion(o.x, o.y, o.z, o.w), emulated: vp.emulatedPosition }; }
    for (const src of this.session.inputSources) {
      const side = src.handedness === 'left' ? 'L' : src.handedness === 'right' ? 'R' : null;
      if (!side || !src.gamepad) continue;
      const space = src.gripSpace || src.targetRaySpace;
      const pose = space ? frame.getPose(space, ref) : null;
      const ray = src.targetRaySpace ? frame.getPose(src.targetRaySpace, ref) : null;
      const gp = src.gamepad, bt = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.6));
      const st = { valid: !!pose && (!pose.emulatedPosition || XRInput.allowEmulated), grip: bt(1), trigger: bt(0), a: bt(4), b: bt(5), stick: { x: gp.axes[2] || 0, y: -(gp.axes[3] || 0) }, stickPress: bt(3), src, edge: {} };
      if (pose) { const p = pose.transform.position, o = pose.transform.orientation; st.x = p.x; st.y = p.y; st.z = p.z; st.q = new THREE.Quaternion(o.x, o.y, o.z, o.w); }
      if (ray) { const p = ray.transform.position, o = ray.transform.orientation; st.ray = { origin: new THREE.Vector3(p.x, p.y, p.z), q: new THREE.Quaternion(o.x, o.y, o.z, o.w) }; }
      const pv = this.prev[side];
      for (const k of ['grip', 'trigger', 'a', 'b', 'stickPress']) { st.edge[k] = st[k] && !pv[k]; pv[k] = st[k]; }
      out[side] = st;
    }
    return out;
  }
  pulse(side, intensity = 0.5, ms = 40) {
    if (!this.session) return;
    for (const src of this.session.inputSources) {
      if ((side === 'L' && src.handedness !== 'left') || (side === 'R' && src.handedness !== 'right')) continue;
      const h = src.gamepad?.hapticActuators?.[0];
      try { if (h?.pulse) h.pulse(intensity, ms); else src.gamepad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: intensity }); } catch (e) { /* 非対応 */ }
    }
  }
}
