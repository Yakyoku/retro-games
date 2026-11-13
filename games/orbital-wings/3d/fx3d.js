// ORBITAL WINGS 3D — 効果（光の粒のまとめ描き・爆発・火花・煙）。Render3D に混ぜ込んで使う（this は Render3D）
// 粒はすべて使い回し（毎フレームの割り当てなし）。爆発は 閃光 → 火球 → 衝撃波 → 破片 → 煙 → 残り火 の 6 段。
import * as THREE from 'three';
import { VIEW_W, VIEW_H, DEPTH } from '../shared/config.js';
import { linR, linG, linB, AXIS_Z } from './kit.js';
import { SP } from './materials3d.js';

const TAU = Math.PI * 2, HW = VIEW_W / 2, HH = VIEW_H / 2;
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Euler();
const rnd = Math.random, rr = (a, b) => a + (b - a) * Math.random();

// ---- 光の粒のまとめ描き（1 回の描画）。1 粒 16 個の数値 -----------------------------------
export class SpriteBatch {
  constructor(mat, cap, parent, order) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.arr = new Float32Array(cap * 16);
    this.buf = new THREE.InstancedInterleavedBuffer(this.arr, 16); this.buf.setUsage(THREE.DynamicDrawUsage);
    for (const [n, o] of [['aA', 0], ['aB', 4], ['aC', 8], ['aD', 12]]) g.setAttribute(n, new THREE.InterleavedBufferAttribute(this.buf, 4, o));
    g.instanceCount = 0;
    this.geo = g; this.cap = cap; this.n = 0;
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = order; this.mesh.visible = false;
    parent.add(this.mesh);
  }
  begin() { this.n = 0; }
  // 視点を向く粒: 種類 f、位置、幅・高さ、回転、色（0xRRGGBB）、明るさ I、不透明度 O（0 = 加算）
  put(f, x, y, z, w, h, rot, col, I, O = 0) {
    if (this.n >= this.cap) return; const a = this.arr, k = this.n++ * 16;
    a[k] = x; a[k + 1] = y; a[k + 2] = z; a[k + 3] = f; a[k + 4] = w; a[k + 5] = h; a[k + 6] = rot; a[k + 7] = 0; a[k + 11] = I;
    a[k + 12] = linR(col); a[k + 13] = linG(col); a[k + 14] = linB(col); a[k + 15] = O;
  }
  // 軸に沿う帯（光線・軌跡・火花）: 中心、軸ベクトル（全長）、幅
  axis(f, x, y, z, ax, ay, az, w, col, I, O = 0) {
    if (this.n >= this.cap) return; const a = this.arr, k = this.n++ * 16;
    a[k] = x; a[k + 1] = y; a[k + 2] = z; a[k + 3] = f; a[k + 4] = w; a[k + 5] = 0; a[k + 6] = 0; a[k + 7] = 1; a[k + 8] = ax; a[k + 9] = ay; a[k + 10] = az; a[k + 11] = I;
    a[k + 12] = linR(col); a[k + 13] = linG(col); a[k + 14] = linB(col); a[k + 15] = O;
  }
  // 戦場の xy 面に寝かせた板（奥の壁の影・衝撃波）
  flat(f, x, y, z, w, h, rot, col, I, O = 0) {
    if (this.n >= this.cap) return; const a = this.arr, k = this.n++ * 16;
    a[k] = x; a[k + 1] = y; a[k + 2] = z; a[k + 3] = f; a[k + 4] = w; a[k + 5] = h; a[k + 6] = rot; a[k + 7] = 2; a[k + 11] = I;
    a[k + 12] = linR(col); a[k + 13] = linG(col); a[k + 14] = linB(col); a[k + 15] = O;
  }
  // 床・天井の面（xz）に寝かせた板（接地の影）
  floor(f, x, y, z, w, d, col, I, O = 0) {
    if (this.n >= this.cap) return; const a = this.arr, k = this.n++ * 16;
    a[k] = x; a[k + 1] = y; a[k + 2] = z; a[k + 3] = f; a[k + 4] = w; a[k + 5] = d; a[k + 6] = 0; a[k + 7] = 3; a[k + 11] = I;
    a[k + 12] = linR(col); a[k + 13] = linG(col); a[k + 14] = linB(col); a[k + 15] = O;
  }
  end() {
    this.geo.instanceCount = this.n; this.mesh.visible = this.n > 0;
    if (!this.n) return;
    this.buf.clearUpdateRanges(); this.buf.addUpdateRange(0, this.n * 16); this.buf.needsUpdate = true;
  }
}

// ---- 粒の種類 --------------------------------------------------------------------
const FLASH = 0, FIRE = 1, RING = 2, DEBRIS = 3, SMOKE = 4, EMBER = 5, SPARK = 6, DROP = 7, STAR = 8, SUCK = 9, HALO = 10, ARC = 11;
const CAP = 1500;
const STONE_KINDS = { rock: 1, brick: 1, stonehead: 1, pebble: 1, popper: 1, warden: 1, colossus: 1 };
const FLESH_KINDS = { flesh: 1, cell: 1, tentacle: 1, spore: 1, blob: 1, membrane: 1, hydra: 1, nucleus: 1 };
// 材質別の色: [閃光, 火球の芯, 火球, 火球の終わり, 煙, 破片, 残り火]
const PAL = {
  mech: [0xfff4d8, 0xffe9a0, 0xff9a28, 0x9a2408, 0x4a4450, 0xb8c0d0, 0xff8a28],
  rock: [0xffe8c0, 0xffd890, 0xd88a40, 0x6a4028, 0x857866, 0xa89c88, 0xffa040],
  lava: [0xfff0c0, 0xffe090, 0xff7a20, 0xa02000, 0x5a4038, 0x5a3a30, 0xff6a18],
  flesh: [0xffe0ea, 0xffc0d8, 0xff4a8a, 0x8a1040, 0x5a2038, 0xc04a6a, 0xff7ab0],
  cell: [0xe8fff4, 0xc8ffe8, 0x48e8a8, 0x108a60, 0x1a5a48, 0x68e0b0, 0xa0ffd8],
};

export class Fx3D {
  fxInit() {
    this.pp = []; for (let i = 0; i < CAP; i++) this.pp.push({ k: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: 1, g: 0, drag: 0.1, rot: 0, vr: 0, c: 0, c2: 0, c3: 0, f: 0, I: 1, ax: 0, ay: 0 });
    this.pn = 0;
    this.shakeT = 0; this.shakeA = 0; this.flashA = 0;
    this.fxFlash = { x: 0, y: 0, z: 0, i: 0, c: 0xffffff };     // 直近の大きな爆発（環境の照り返し用。i は 0..1 で減衰）
  }
  // 粒を 1 つ取り出す（満杯なら最も古いものを上書き）
  P(k, x, y, z, vx, vy, vz, max, s, c) {
    let p;
    if (this.pn < CAP) p = this.pp[this.pn++]; else { p = this.pp[this.pRot = ((this.pRot || 0) + 1) % CAP]; }
    p.k = k; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = 0; p.max = max; p.s = s; p.c = c; p.c2 = c; p.c3 = c;
    p.g = 0; p.drag = 0.12; p.rot = rnd() * TAU; p.vr = 0; p.f = 0; p.I = 1;
    return p;
  }
  shake(a, t = 0.3) { this.shakeA = Math.max(this.shakeA * (this.shakeT > 0 ? 1 : 0), a); this.shakeT = Math.max(this.shakeT, t); }

  // 爆発（大きさ s/m/l/p、材質は kind から）
  explode(x, y, z, size = 's', kind, color) {
    const R = { s: 0.7, m: 1.35, l: 3.0, p: 1.25 }[size] || 0.7, big = size === 'l', mid = size === 'm' || size === 'p';
    const mat = FLESH_KINDS[kind] || color === 'flesh' ? (kind === 'cell' || kind === 'blob' || kind === 'membrane' || kind === 'nucleus' ? 'cell' : 'flesh') : STONE_KINDS[kind] ? (kind === 'rock' && color !== 'stone' ? 'lava' : 'rock') : 'mech';
    const C = PAL[mat], soft = mat === 'flesh' || mat === 'cell', stone = mat === 'rock';
    const many = this.pn > CAP * 0.7 ? 0.5 : 1;
    // 1. 閃光
    let p = this.P(FLASH, x, y, z, 0, 0, 0, big ? 0.2 : 0.12, R * (stone ? 3.5 : 5), C[0]); p.I = stone ? 0.6 : 1.0;
    if (!stone) { p = this.P(STAR, x, y, z, 0, 0, 0, big ? 0.3 : 0.2, R * 7, C[0]); p.I = 0.8; }
    // 2. 火球（少しずつ遅らせて膨らむ）
    const nf = Math.round((big ? 15 : mid ? 7 : 4) * (stone ? 0.6 : 1) * many);
    for (let i = 0; i < nf; i++) {
      const a = rnd() * TAU, d = rnd() * R * 0.6, sp = rr(0.4, 2.2) * R;
      p = this.P(FIRE, x + Math.cos(a) * d, y + Math.sin(a) * d, z + rr(-0.4, 0.4) * R, Math.cos(a) * sp, Math.sin(a) * sp + R * 0.3, rr(-0.5, 0.5) * R, rr(0.55, 1.0) * (big ? 1.4 : 1), R * rr(1.0, 1.8), C[1]);
      p.c2 = C[2]; p.c3 = C[3]; p.life = -rnd() * (big ? 0.5 : 0.12); p.f = rnd() < 0.5 ? SP.fire : SP.smokeB; p.vr = rr(-1.5, 1.5); p.drag = 0.05;
    }
    // 3. 衝撃波
    p = this.P(RING, x, y, z, 0, 0, 0, big ? 0.6 : 0.36, R * (big ? 9 : 6.5), C[0]); p.I = 1.2;
    if (big || mid) { p = this.P(HALO, x, y, z, 0, 0, 0, big ? 0.45 : 0.3, R * 5, C[2]); p.I = 0.4; }
    if (big) { p = this.P(RING, x, y, z, 0, 0, 0, 0.85, R * 12, C[2]); p.life = -0.18; p.I = 0.8; }
    // 4. 破片（立体のかけら。重力で落ちる）
    const nd = Math.round((big ? 20 : mid ? 10 : 5) * (stone ? 1.5 : 1) * many);
    for (let i = 0; i < nd; i++) {
      const a = rnd() * TAU, sp = rr(3, 11) * (0.7 + R * 0.25);
      p = this.P(soft ? DROP : DEBRIS, x, y, z, Math.cos(a) * sp, Math.sin(a) * sp + 1.5, rr(-3, 3), rr(0.6, 1.3), rr(0.07, 0.17) * (0.8 + R * 0.35), C[5]);
      p.g = soft ? 7 : 9; p.vr = rr(-14, 14); p.drag = 0.35; p.c2 = C[6]; p.I = rnd() < 0.5 ? 1 : 0;   // I=1: 赤熱して尾を引く
    }
    // 5. 煙
    const ns = Math.round((big ? 11 : mid ? 5 : 3) * many);
    for (let i = 0; i < ns; i++) {
      p = this.P(SMOKE, x + rr(-0.5, 0.5) * R, y + rr(-0.5, 0.5) * R, z + rr(-0.4, 0.4) * R, rr(-0.8, 0.8), rr(0.3, 1.1), rr(-0.3, 0.3), rr(1.5, 2.6) * (big ? 1.3 : 1), R * rr(1.3, 2.2), C[4]);
      p.life = -rr(0.1, big ? 0.6 : 0.3); p.f = rnd() < 0.5 ? SP.smokeA : SP.smokeB; p.vr = rr(-0.8, 0.8); p.I = soft ? 0.5 : stone ? 0.75 : 0.8; p.drag = 0.4;
    }
    // 6. 残り火と火花
    const ne = Math.round((big ? 26 : mid ? 12 : 6) * (stone ? 0.4 : 1) * many);
    for (let i = 0; i < ne; i++) {
      const a = rnd() * TAU, sp = rr(1.5, 9) * (0.6 + R * 0.3);
      p = this.P(EMBER, x, y, z, Math.cos(a) * sp, Math.sin(a) * sp + 1, rr(-2.5, 2.5), rr(0.8, 2.0), rr(0.1, 0.2), C[6]); p.g = soft ? 2 : 4; p.drag = 0.2;
    }
    if (!soft) for (let i = 0; i < ne / 2; i++) {
      const a = rnd() * TAU, sp = rr(8, 20);
      p = this.P(SPARK, x, y, z, Math.cos(a) * sp, Math.sin(a) * sp, rr(-4, 4), rr(0.12, 0.3), 0.07, C[1]); p.drag = 0.02;
    }
    // 画面の揺れと照り返し（控えめ）
    if (big) { this.shake(0.22, 0.5); this.flashA = Math.max(this.flashA, 0.5); } else if (mid) this.shake(size === 'p' ? 0.2 : 0.07, size === 'p' ? 0.4 : 0.2);
    if (big || mid) { const f = this.fxFlash; f.x = x - this.cam - HW; f.y = y - HH; f.z = -z; f.i = big ? 1 : 0.6; f.c = C[2]; }
  }
  // 着弾の火花（armor: 弾かれた青白い火花、big: ミサイルの小爆発）
  spark(x, y, z, armor, big) {
    const c = armor ? 0xbfe6ff : 0xffe890, n = big ? 9 : 5;
    let p = this.P(FLASH, x, y, z, 0, 0, 0, 0.09, big ? 2.6 : 1.1, armor ? 0xd8f0ff : 0xfff0c0); p.I = 1.2;
    for (let i = 0; i < n; i++) {
      const a = Math.PI + rr(-1.3, 1.3), sp = rr(5, 14);
      p = this.P(SPARK, x, y, z, Math.cos(a) * sp, Math.sin(a) * sp, rr(-4, 4), rr(0.1, 0.24), 0.06, c); p.drag = 0.03; p.g = 6;
    }
    if (armor) { p = this.P(RING, x, y, z, 0, 0, 0, 0.16, 1.5, 0xbfe6ff); p.I = 0.7; }
    if (big) {
      p = this.P(RING, x, y, z, 0, 0, 0, 0.25, 3.4, 0xffd080);
      for (let i = 0; i < 3; i++) { p = this.P(FIRE, x + rr(-0.2, 0.2), y + rr(-0.2, 0.2), z, rr(-1, 1), rr(-0.2, 1.2), 0, rr(0.25, 0.4), rr(0.8, 1.3), 0xfff0b0); p.c2 = 0xffa030; p.c3 = 0xa02808; p.f = SP.fire; }
      p = this.P(SMOKE, x, y, z, rr(-0.4, 0.4), 0.7, 0, 0.9, 1.3, 0x2a2630); p.f = SP.smokeA; p.I = 0.55;
    }
  }
  // 煙ひとつ（損傷・排熱・砂煙・蒸気）
  smokePuff(x, y, z, s, c, vx = 0, vy = 0.6, life = 1.1, op = 0.5) {
    const p = this.P(SMOKE, x, y, z, vx + rr(-0.25, 0.25), vy, rr(-0.2, 0.2), life * rr(0.8, 1.2), s, c); p.f = rnd() < 0.5 ? SP.smokeA : SP.smokeB; p.vr = rr(-0.8, 0.8); p.I = op; return p;
  }
  ember(x, y, z, vx, vy, c, life = 0.8, s = 0.14) { const p = this.P(EMBER, x, y, z, vx, vy, rr(-1, 1), life, s, c); p.g = 3; p.drag = 0.3; return p; }
  sparks(x, y, z, n, c, dir = 0, spread = TAU, sp0 = 4, sp1 = 12) {
    for (let i = 0; i < n; i++) { const a = dir + rr(-0.5, 0.5) * spread, sp = rr(sp0, sp1); const p = this.P(SPARK, x, y, z, Math.cos(a) * sp, Math.sin(a) * sp, rr(-3, 3), rr(0.12, 0.3), 0.06, c); p.drag = 0.05; p.g = 8; }
  }
  flashAt(x, y, z, s, c, I = 1.2, life = 0.12, star = false) { const p = this.P(star ? STAR : FLASH, x, y, z, 0, 0, 0, life, s, c); p.I = I; return p; }
  ringAt(x, y, z, s, c, life = 0.35, I = 1) { const p = this.P(RING, x, y, z, 0, 0, 0, life, s, c); p.I = I; return p; }

  // ゲームの出来事 → 効果
  fxEvent(ev, g) {
    const pl = g.player;
    switch (ev.t) {
      case 'explode': this.explode(ev.x, ev.y, ev.z || 0, ev.size, ev.kind, ev.color); break;
      case 'spark': this.spark(ev.x, ev.y, ev.z || 0, ev.armor, ev.big); break;
      case 'bossdown': this.bossBoom = { t: 0, e: g.boss, final: false }; this.shake(0.12, 2.4); break;
      case 'vent': if (rnd() < 0.3) { this.smokePuff(ev.x + rr(-0.5, 0.5), ev.y, rr(-2, 2), rr(0.9, 1.6), 0x4a3028, -0.3, ev.up * rr(1, 2.2), 1.5, 0.5); if (rnd() < 0.5) this.ember(ev.x + rr(-0.4, 0.4), ev.y, rr(-1.5, 1.5), rr(-1, 1), ev.up * rr(3, 7), 0xff7a20, 1.2); } break;
      case 'dust': for (let i = 0; i < 7; i++) this.smokePuff(ev.x + rr(-0.9, 0.9), ev.y, rr(-1.5, 1.5), rr(0.7, 1.3), 0x9a8a6a, 0, -rr(0.6, 1.8), 0.9, 0.5); break;
      case 'phase': this.flashA = Math.max(this.flashA, 0.8); this.shake(0.25, 0.6); break;
      case 'gauge': {   // カプセル取得: きらめきが自機へ吸い込まれる
        for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, p = this.P(SUCK, pl.x + Math.cos(a) * 1.5, pl.y + Math.sin(a) * 1.5, pl.z, 0, 0, 0, 0.32, 0.5, i % 2 ? 0xffd070 : 0xff7030); p.ax = Math.cos(a) * 1.5; p.ay = Math.sin(a) * 1.5; }
        const p = this.P(RING, pl.x, pl.y, pl.z, 0, 0, 0, 0.3, -3.2, 0xffb050); p.I = 0.9; p.k = SUCK + 100;   // 縮む輪
        break;
      }
      case 'powerup': {
        const c = { SPEED: 0x6ad8ff, MISSILE: 0xffa040, DOUBLE: 0xffe060, LASER: 0x50b8ff, OPTION: 0xff9030, SHIELD: 0x4ab8ff }[ev.item] || 0xffffff;
        this.ringAt(pl.x, pl.y, pl.z, 5, c, 0.4, 1.2); this.flashAt(pl.x, pl.y, pl.z, 4, c, 1.0, 0.25, true);
        for (let i = 0; i < 10; i++) { const a = rnd() * TAU; this.ember(pl.x, pl.y, pl.z, Math.cos(a) * rr(2, 6), Math.sin(a) * rr(2, 6), c, 0.5, 0.12).g = 0; }
        if (ev.item === 'SHIELD') this.shieldBoot = 0;
        break;
      }
      case 'shieldhit': this.shieldHit(g); this.shake(0.05, 0.15); break;
      case 'die': {
        // 撃墜: 機体の破片が散り、二重の衝撃波
        for (let i = 0; i < 10; i++) { const a = rnd() * TAU, sp = rr(3, 9), p = this.P(DEBRIS, ev.x, ev.y, ev.z || 0, Math.cos(a) * sp, Math.sin(a) * sp + 2, rr(-3, 3), rr(0.9, 1.6), rr(0.12, 0.26), i % 3 ? 0xe4e8f0 : 0x2f6bff); p.g = 7; p.vr = rr(-12, 12); p.drag = 0.4; p.c2 = 0xff8a28; p.I = 1; }
        const p = this.P(RING, ev.x, ev.y, ev.z || 0, 0, 0, 0, 0.7, 11, 0x9fd8ff); p.life = -0.1; p.I = 1;
        this.flashA = Math.max(this.flashA, 0.35);
        break;
      }
      case 'respawn': case 'stage': this.enterFx = 1; break;
      case 'fire': this.muzzleT = 1; this.muzzleW = ev.w; break;
      case 'bosswarn': this.flashA = Math.max(this.flashA, 0.25); break;
    }
  }

  // 粒の更新と描画
  drawParticles(dt) {
    const S = this.sp, SB = this.spB, pp = this.pp, cam = this.cam, sh = this.b.shard;
    let n = this.pn;
    for (let i = 0; i < n; i++) {
      const q = pp[i];
      q.life += dt;
      if (q.life >= q.max) { pp[i] = pp[--n]; pp[n] = q; i--; continue; }
      if (q.life < 0) continue;
      const k = q.life / q.max;
      if (q.vx !== 0 || q.vy !== 0 || q.g !== 0) { const d = Math.pow(q.drag, dt); q.vy -= q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vx *= d; q.vy *= d; q.vz *= d; }
      const x = q.x - cam - HW, y = q.y - HH, z = -q.z;
      switch (q.k) {
        case FLASH: S.put(SP.glow, x, y, z, q.s * (0.7 + k * 0.5), q.s * (0.7 + k * 0.5), 0, q.c, (1 - k) * (1 - k) * q.I); break;
        case STAR: S.put(SP.star, x, y, z, q.s * (0.5 + k), q.s * (0.5 + k), q.rot * 0.2, q.c, (1 - k) * q.I); break;
        case FIRE: {
          q.rot += q.vr * dt;
          // 白熱 → 橙 → 暗い赤へ。半ば不透明にして、重なっても白く飛ばないようにする
          const s = q.s * (0.4 + 0.9 * Math.sqrt(k)), a = k < 0.55 ? 1 : (1 - k) / 0.45;
          if (k < 0.18) S.put(q.f, x, y, z, s, s, q.rot, q.c, 1.15 * a, 0.5);
          else if (k < 0.5) S.put(q.f, x, y, z, s, s, q.rot, q.c2, 0.95 * a, 0.62);
          else S.put(q.f, x, y, z, s, s, q.rot, q.c3, 0.75 * a, 0.6 * a);
          break;
        }
        case RING: { const s = q.s * (0.15 + 0.85 * (1 - (1 - k) * (1 - k))); S.flat(SP.ring, x, y, z, s, s, 0, q.c, (1 - k) * q.I); break; }
        case HALO: { const s = q.s * (0.3 + 0.7 * k); S.put(SP.halo, x, y, z, s, s, 0, q.c, (1 - k) * q.I * 0.7); break; }
        case SUCK + 100: { const pl = this.g.player, s = -q.s * (1 - k); S.put(SP.ring2, pl.x - cam - HW, pl.y - HH, -pl.z, s, s, k * 3, q.c, k * q.I); break; }
        case DEBRIS: {
          q.rot += q.vr * dt;
          _q.setFromAxisAngle(_v.set(0.6, 0.7, 0.3), q.rot);
          const a = k > 0.8 ? (1 - k) / 0.2 : 1;
          sh.put3(x, y, z, q.s * 2.2 * a, q.s * 1.3 * a, q.s * 1.6 * a, _q, q.c, 1);
          if (q.I > 0 && k < 0.7) S.axis(SP.trail, x - q.vx * 0.035, y - q.vy * 0.035, z, q.vx * 0.07, q.vy * 0.07, -q.vz * 0.07, q.s * 2.4, q.c2, (0.7 - k) * 1.3);
          break;
        }
        case DROP: {
          const a = k > 0.7 ? (1 - k) / 0.3 : 1;
          S.axis(SP.trail, x - q.vx * 0.03, y - q.vy * 0.03, z, q.vx * 0.06 + 0.001, q.vy * 0.06, 0, q.s * 2.6, q.c, a * 0.9, a * 0.5);
          S.put(SP.core, x, y, z, q.s * 2.6, q.s * 2.6, 0, q.c2, a * 0.8, a * 0.3);
          break;
        }
        case SMOKE: {
          q.rot += q.vr * dt;
          const s = q.s * (0.6 + 1.0 * k), a = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * q.I;
          SB.put(q.f, x, y, z, s, s, q.rot, q.c, a, a);
          break;
        }
        case EMBER: {
          const fl = 0.6 + 0.4 * Math.sin(q.life * 40 + q.rot * 7), a = (1 - k) * fl;
          S.put(SP.glow, x, y, z, q.s * 2.2, q.s * 2.2, 0, q.c, a * 1.4);
          S.put(SP.disc, x, y, z, q.s * 0.45, q.s * 0.45, 0, 0xfff0c8, a);
          break;
        }
        case SPARK: S.axis(SP.streak, x - q.vx * 0.02, y - q.vy * 0.02, z, q.vx * 0.045, q.vy * 0.045, -q.vz * 0.045, q.s * 2.2, q.c, (1 - k) * 1.6); break;
        case SUCK: {
          const pl = this.g.player, e = 1 - k * k, px = pl.x + q.ax * e - cam - HW, py = pl.y + q.ay * e - HH, a2 = Math.atan2(q.ay, q.ax) + k * 2.5;
          const r = Math.hypot(q.ax, q.ay) * e, sx = pl.x + Math.cos(a2) * r - cam - HW, sy = pl.y + Math.sin(a2) * r - HH;
          S.put(SP.star, sx, sy, -pl.z, q.s * (1.2 - k * 0.6), q.s * (1.2 - k * 0.6), k * 4, q.c, 0.4 + k);
          break;
        }
        case ARC: S.axis(SP.arc, x, y, z, q.ax, q.ay, 0, q.s, q.c, (1 - k) * q.I); break;
      }
    }
    this.pn = n;
    // 揺れ・閃光の減衰
    if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeA = 0; }
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - dt * 1.8);
    if (this.fxFlash.i > 0) this.fxFlash.i = Math.max(0, this.fxFlash.i - dt * 2.5);
  }
  // ボスの崩壊: 連鎖する爆発 → 火と煙を噴きながら沈む → 最後の大爆発
  drawBossBoom(dt) {
    const bb = this.bossBoom; if (!bb) return;
    bb.t += dt;
    const e = bb.e;
    if (e && bb.t < 2.4) {
      bb.acc = (bb.acc || 0) + dt * (7 + bb.t * 5);
      while (bb.acc > 1) {
        bb.acc -= 1;
        const ps = e.parts, q = ps && ps.length ? ps[(rnd() * ps.length) | 0] : e;
        if (q.vis === false || Math.abs(q.y - HH) > HH + 2) continue;
        const dy = -Math.min(1, bb.t / 2.6) * 2;
        if (rnd() < 0.45) this.explode(q.x + rr(-1, 1), q.y + dy + rr(-1, 1), (q.z || 0) + rr(-1.2, 1.2), rnd() < 0.3 ? 'm' : 's', e.type);
        else { this.smokePuff(q.x + rr(-1, 1), q.y + dy + rr(-1, 1), (q.z || 0) + rr(-1, 1), rr(1.4, 2.6), 0x2a2630, rr(-0.5, 0.5), rr(0.8, 2), 1.6, 0.7); this.sparks(q.x, q.y + dy, q.z || 0, 4, 0xffd080); }
      }
    }
    if (bb.t > 2.4 && !bb.final) {
      bb.final = true;
      if (e) { this.explode(e.x, e.y - 2, e.z, 'l', e.type); this.explode(e.x + 1.5, e.y - 1, e.z, 'm', e.type); this.explode(e.x - 1, e.y - 3, e.z, 'm', e.type); const p = this.P(RING, e.x, e.y - 2, e.z, 0, 0, 0, 1.1, 46, 0xffffff); p.I = 1.2; }
      this.flashA = 1; this.shake(0.4, 0.8);
    }
    if (bb.t > 3.2) this.bossBoom = null;
  }
}
export function installFx(Target) { for (const k of Object.getOwnPropertyNames(Fx3D.prototype)) if (k !== 'constructor') Target.prototype[k] = Fx3D.prototype[k]; }
