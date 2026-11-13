// ORBITAL WINGS 3D — 自機・装備・弾・敵 21 種の描画。Render3D に混ぜ込んで使う（this は Render3D）
// 位置・向き・開閉・予告はゲームの状態（shared/enemies.js）をそのまま使う。毎フレームの割り当てはしない。
import * as THREE from 'three';
import { VIEW_W, VIEW_H, DEPTH, SHIELD, OPTION, PLAYER } from '../shared/config.js';
import { BOSS } from '../shared/bosses.js';
import { quatAlong, AXIS_Z, AXIS_X, Q_ID } from './kit.js';
import { SP } from './materials3d.js';

const TAU = Math.PI * 2, PI = Math.PI, HW = VIEW_W / 2, HH = VIEW_H / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = Math.random, rr = (a, b) => a + (b - a) * Math.random();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
// 灰色の掛け色（損傷で暗くする）
const gray = (v) => { const g = clamp((v * 255) | 0, 0, 255); return (g << 16) | (g << 8) | g; };
// 2 色の間（数値の色）
const mix = (a, b, t) => { const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t) | 0, g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t) | 0, bl = (a & 255) + (((b & 255) - (a & 255)) * t) | 0; return (r << 16) | (g << 8) | bl; };
const SHIELD_COL = [0xff3a2a, 0xff4a3a, 0xffa040, 0x8ae0b0, 0x5ac8ff, 0x4ab8ff];

export class Chars3D {
  // ---- 自機・オプション・シールド ---------------------------------------------------
  drawPlayer(g, a) {
    const p = g.player, b = this.b, S = this.sp, now = this.now, cam = this.cam, dt = this.dt;
    if (this.muzzleT > 0) this.muzzleT -= dt * 9;
    const mz = Math.max(0, this.muzzleT || 0), mw = this.muzzleW;
    // オプション: 核・回る 2 つの輪・プラズマの揺らぎ・軌跡の光の帯
    const hs = g.history, hl = hs.length;
    for (let i = 0; i < g.power.options && hl; i++) {
      const hi = Math.min(hl - 1, (i + 1) * OPTION.spacing), h = hs[hi], po = g.prevOpt && g.prevOpt[i];
      const wx = h[0] + g.camX, x = (po ? lerp(po.x, wx, a) : wx) - cam - HW, y = (po ? lerp(po.y, h[1], a) : h[1]) - HH, z = -(po ? lerp(po.z, h[2], a) : h[2]);
      const t = now * 11 + i * 2.3, fl = 0.85 + 0.15 * Math.sin(t) * Math.sin(t * 0.37);
      this.M3('optionCore', x, y, z, now * 2.2 + i, now * 1.7, now * 3 + i, 1, 1, 1);
      this.M3('optionRing', x, y, z, now * 2.6 + i, 0.9, 0, 1, 1, 1);
      this.M3('optionRing', x, y, z, 0.6, now * 3.1 + i * 2, PI / 2, 0.82, 0.82, 0.82);
      S.put(SP.glow, x, y, z, 1.9 * fl, 1.9 * fl, 0, 0xff7a20, 0.9);
      S.put(SP.glow, x, y, z, 0.9, 0.9, 0, 0xfff0c0, 0.9 * fl);
      S.put(SP.fire, x, y, z, 1.0, 1.0, now * 2 + i, 0xff5a10, 0.5 * fl);
      S.put(SP.star, x, y, z, 1.3 * fl, 1.3 * fl, now * 0.8 + i, 0xffd080, 0.55);
      // 軌跡（移動の履歴をたどる帯）
      let lx0 = x, ly0 = y, lz0 = z;
      for (let k = 1; k <= 4; k++) {
        const hh = hs[Math.min(hl - 1, hi + k * 3)], tx = hh[0] + g.camX - cam - HW, ty = hh[1] - HH, tz = -hh[2];
        const dx = lx0 - tx, dy = ly0 - ty, dz = lz0 - tz;
        if (dx * dx + dy * dy + dz * dz > 0.0004) S.axis(SP.beam, (lx0 + tx) / 2, (ly0 + ty) / 2, (lz0 + tz) / 2, dx * 1.25, dy * 1.25, dz * 1.25, 0.34 - k * 0.05, 0xff8a28, 0.5 - k * 0.1);
        lx0 = tx; ly0 = ty; lz0 = tz;
      }
      this.wallShadow(x, y, 0.8, 0.8, 0.4);
      if (mz > 0) S.put(SP.burst, x + 0.5, y, z, 1.1 * mz, 1.1 * mz, now * 9, mw === 'laser' ? 0x7ad0ff : 0xffe090, mz);
    }
    if (!p.alive) { this.wasEnter = 0; return; }
    const x = lerp(p.px, p.x, a), y = lerp(p.py, p.y, a), z = lerp(p.pz, p.z, a);
    const vx = p.vx || 0, vy = p.vy || 0, vz = p.vz || 0;
    const fly = g.state === 'stageclear' && g.clearTimer > 120;
    // 上下でロール（背と腹が見える）、前後で機首がわずかに上下。加減速で噴射の長さ・色が変わる
    this.roll = lerp(this.roll || 0, -vy * 0.75 + vz * 0.5, 1 - Math.pow(0.0005, dt));
    this.tilt = lerp(this.tilt || 0, vy * 0.16, 1 - Math.pow(0.001, dt));
    this.thr = lerp(this.thr ?? 1, fly ? 3.2 : p.enter > 0 ? 2.2 : vx > 0 ? 1.7 : vx < 0 ? 0.45 : 1, 1 - Math.pow(0.002, dt));
    const roll = this.roll, tilt = this.tilt, thr = this.thr;
    const blink = p.invuln > 0 && p.enter <= 0;
    const lx = x - cam - HW, ly = y - HH, lz = -z;
    const show = !blink || Math.sin(now * 30) > -0.5;
    if (show) {
      this.M3('ship', lx, ly, lz, roll, 0, tilt, 1, 1, 1);
      if (g.power.missile) this.M3('shipMissile', lx, ly, lz, roll, 0, tilt, 1, 1, 1);
      if (g.power.weapon === 'double') this.M3('shipDouble', lx, ly, lz, roll, 0, tilt, 1, 1, 1);
      else if (g.power.weapon === 'laser') this.M3('shipLaser', lx, ly, lz, roll, 0, tilt, 1, 1, 1);
    }
    // 噴射: 芯・外炎・衝撃ダイヤ（シェーダー）＋残像の帯＋熱の粒
    const cr = Math.cos(roll), sr = Math.sin(roll), ct = Math.cos(tilt), st = Math.sin(tilt);
    const hot = thr > 1.3, col = hot ? 0x8ab8ff : thr < 0.7 ? 0xffa060 : 0x5aa8ff, len = (0.42 + 0.4 * thr) * (0.94 + 0.06 * Math.sin(now * 53));
    for (let s = -1; s <= 1; s += 2) {
      const oy = -sr * 0.105 * s, oz = cr * 0.105 * s;
      const nx = lx + (-0.98 * ct - oy * st), ny = ly + (-0.98 * st + oy * ct), nz = lz + oz;
      this.exh(nx, ny, nz, len * 1.25, 0.12 + 0.02 * thr, col, tilt, 1.0);
      this.exh(nx, ny, nz, len * 0.6, 0.06, 0xffffff, tilt, 0.7);
      S.put(SP.glow, nx - 0.05, ny, nz, 0.42 + 0.1 * thr, 0.42 + 0.1 * thr, 0, col, 0.45);
    }
    S.axis(SP.trail, lx - 1.0 - len * 1.1, ly - st * len, lz, len * 2.6 * ct, len * 2.6 * st, 0, 0.34, hot ? 0x6a90ff : 0x3a78ff, 0.1 + 0.1 * thr);
    if (hot && this.every(40)) { const q = this.ember(x - 1.1, y + rr(-0.08, 0.08), z + rr(-0.12, 0.12), -rr(3, 7), rr(-0.4, 0.4), 0x8ac0ff, 0.3, 0.09); q.g = 0; }
    // 翼端灯・機首の発射光
    S.put(SP.glow, lx - 0.2 * ct, ly - 0.055 + sr * 1.0, lz + cr * 1.0, 0.32, 0.32, 0, 0xff3020, 0.9);
    S.put(SP.glow, lx - 0.2 * ct, ly - 0.055 - sr * 1.0, lz - cr * 1.0, 0.32, 0.32, 0, 0x30ff60, 0.9);
    if (mz > 0) {
      if (mw === 'laser') { S.put(SP.ring2, lx + 1.15, ly - 0.08, lz, 1.5 - mz * 0.7, 1.5 - mz * 0.7, now * 6, 0x7ad0ff, mz); S.put(SP.glow, lx + 1.1, ly - 0.08, lz, 1.4, 1.4, 0, 0x4ab0ff, mz); }
      else { S.put(SP.burst, lx + 1.25, ly, lz, 1.5 * mz, 1.5 * mz, now * 7, 0xffe090, mz * 1.2); if (mw === 'double') S.put(SP.burst, lx + 0.85, ly + 0.42, lz, 1.1 * mz, 1.1 * mz, now * 7 + 1, 0xffe090, mz); }
    }
    // 登場（左から滑り込む）: 残像の帯と到着の輪。面クリアの飛び去り: 加速の帯
    if (p.enter > 0) { for (let k = 1; k <= 3; k++) S.axis(SP.trail, lx - 1.2 - k * 1.3, ly, lz, 3.2, 0, 0, 0.9 - k * 0.15, 0x6ab0ff, (p.enter / PLAYER.enterTicks) * (0.8 - k * 0.2)); }
    else if (this.wasEnter > 0) { this.ringAt(x, y, z, 5.5, 0x9fd8ff, 0.4, 1.0); this.flashAt(x, y, z, 3, 0xbfe8ff, 0.9, 0.2, true); }
    this.wasEnter = p.enter;
    if (fly) { for (let k = 1; k <= 4; k++) S.axis(SP.trail, lx - 1.5 - k * 2.2, ly, lz, 5.5, 0, 0, 1.0 - k * 0.12, 0xbfe0ff, 0.9 - k * 0.18); if (this.every(30)) this.sparks(x - 1, y, z, 2, 0xbfe0ff, PI, 0.5, 6, 14); }
    if (blink) S.put(SP.ring2, lx, ly, lz, 2.6, 2.6, now * 2, 0x7ff0ff, 0.45 + 0.35 * Math.sin(now * 30));
    // 奥行きの手がかり: 奥の壁に影と輪、そこまでの細い線
    this.wallShadow(lx, ly, 2.2, 0.9, 0.5);
    S.flat(SP.ring, lx, ly, -DEPTH + 0.04, 1.05, 1.05, 0, 0x5ad8ff, 0.8);
    const dl = DEPTH + lz;
    if (dl > 0.05) S.axis(SP.beam, lx, ly, lz - dl / 2, 0, 0, dl, 0.07, 0x3a90ff, 0.7);
    // シールド
    const sh = this.shield, su = sh.material.uniforms;
    if (this.shieldBoot !== undefined && this.shieldBoot < 1) this.shieldBoot = Math.min(1, this.shieldBoot + dt * 3);
    su.uHit.value[0].w += dt; su.uHit.value[1].w += dt;
    if (g.power.shield > 0) {
      sh.visible = true; sh.position.set(lx + 0.05, ly, lz); sh.scale.setScalar(SHIELD.radius);
      const n = g.power.shield, low = n <= 2;
      su.uCol.value.setHex(SHIELD_COL[Math.min(5, n)]);
      su.uPow.value = (this.shieldBoot ?? 1) * (low ? 0.75 + 0.25 * Math.sin(now * (n === 1 ? 26 : 12)) : 1) * (0.55 + 0.09 * n);
      S.put(SP.halo, lx + 0.2, ly, lz, 3.2, 3.2, 0, SHIELD_COL[Math.min(5, n)], 0.05 + 0.012 * n);
    }
  }
  // シールドの被弾: 前半球のどこかから波紋
  shieldHit(g) {
    const u = this.shield.material.uniforms.uHit.value, i = this.hitI = ((this.hitI || 0) + 1) % 2, a = rr(-1.1, 1.1), bz = rr(-0.9, 0.9);
    u[i].set(Math.cos(a) * Math.cos(bz), Math.sin(a) * Math.cos(bz), Math.sin(bz), 0);
    const p = g.player;
    this.flashAt(p.x + Math.cos(a) * SHIELD.radius, p.y + Math.sin(a) * SHIELD.radius, p.z, 2.2, 0xbfe8ff, 1.2, 0.15, true);
    this.sparks(p.x + Math.cos(a) * SHIELD.radius, p.y + Math.sin(a) * SHIELD.radius, p.z, 8, 0x9fd8ff, a, 2.4, 3, 9);
  }
  // カプセル: 金属の殻と光る芯。ゆっくり回り、きらめく
  drawCapsule(c, a) {
    const x = lerp(c.px, c.x, a) - this.cam - HW, y = lerp(c.py, c.y, a) - HH, z = -lerp(c.pz, c.z, a), now = this.now, S = this.sp;
    this.M3('capsule', x, y, z, now * 1.8 + c.id, 0, Math.sin(now * 2 + c.id) * 0.3, 1, 1, 1);
    const pu = 0.8 + 0.2 * Math.sin(now * 7 + c.id);
    S.put(SP.glow, x, y, z, 2.3 * pu, 2.3 * pu, 0, 0xff5a20, 0.5);
    S.put(SP.glow, x, y, z, 0.8, 0.8, 0, 0xffd090, 0.8 * pu);
    const tw = Math.max(0, Math.sin(now * 3.1 + c.id * 1.7));
    S.put(SP.star, x + Math.cos(now * 1.3 + c.id) * 0.35, y + 0.2 * Math.sin(now * 2.2 + c.id), z + 0.2, 1.2 * tw, 1.2 * tw, now, 0xfff0d0, tw);
    S.put(SP.ring2, x, y, z, 1.5, 1.5, -now * 1.5, 0xff9040, 0.25);
    this.wallShadow(x, y, 1.1, 1.1, 0.4);
  }

  // ---- 自機の弾 -----------------------------------------------------------------
  drawShot(s, a) {
    const b = this.b, S = this.sp, now = this.now;
    const x = lerp(s.px, s.x, a) - this.cam - HW, y = lerp(s.py, s.y, a) - HH, z = -lerp(s.pz, s.z, a);
    if (s.kind === 'laser') {
      // 芯・外光・まわりを回る螺旋・先端のきらめき
      const len = s.len;
      _q.setFromAxisAngle(AXIS_Z, -PI / 2);
      b.beam.put3(x - len / 2, y, z, 0.055, len, 0.055, _q, 0xffffff);
      b.spiral.put3(x - len / 2, y, z, 0.17, len, 0.17, _q, 0x58c8ff, 1.5);
      S.axis(SP.beam, x - len / 2, y, z, len * 1.08, 0, 0, 0.75, 0x2a90ff, 1.1);
      S.axis(SP.beam, x - len / 2, y, z, len * 1.04, 0, 0, 0.3, 0x9fe0ff, 1.0);
      S.put(SP.star, x, y, z, 1.3, 1.3, now * 5, 0xbfe8ff, 0.9);
    } else if (s.kind === 'missile') {
      const ang = s.ground ? 0 : Math.atan2(s.vy, s.vx + 1e-4), c = Math.cos(ang), sn = Math.sin(ang);
      this.M('missile', x, y, z, ang, 1);
      this.exh(x - c * 0.3, y - sn * 0.3, z, 0.55, 0.07, 0xffa040, ang, 1.2);
      S.put(SP.glow, x - c * 0.4, y - sn * 0.4, z, 0.6, 0.6, 0, 0xff8a30, 0.8);
      if (this.every(34)) this.smokePuff(s.x - c * 0.4, s.y - sn * 0.4, s.z, 0.34, 0x8a8a94, -c * 0.5, -sn * 0.5 + 0.2, 0.5, 0.4);
      if (s.ground && this.every(26)) this.sparks(s.x - 0.2, s.y - 0.28, s.z, 1, 0xffd080, PI * 0.8, 0.9, 3, 8);   // 地面を走る火花
    } else {
      const sp = Math.hypot(s.vx, s.vy) || 1, ux = s.vx / sp, uy = s.vy / sp;
      S.axis(SP.trail, x - ux * 0.35, y - uy * 0.35, z, ux * 1.25, uy * 1.25, 0, 0.38, 0xffb030, 0.9);
      S.axis(SP.beam, x - ux * 0.05, y - uy * 0.05, z, ux * 0.62, uy * 0.62, 0, 0.17, 0xfffbe0, 1.6);
    }
  }
  // ---- 敵弾: 種類ごとに形と色を分ける。白い芯＋赤紫の縁＋暗い縁取りで、どんな背景でも読める ---------------
  drawBullet(bl, a) {
    const T = this.spT, now = this.now;
    const x = lerp(bl.px, bl.x, a) - this.cam - HW, y = lerp(bl.py, bl.y, a) - HH, z = -lerp(bl.pz, bl.z, a);
    const vx = bl.vx, vy = bl.vy, vz = -(bl.vz || 0), sp = Math.hypot(vx, vy, vz) || 1, ux = vx / sp, uy = vy / sp, uz = vz / sp, r = bl.r;
    // 奥の壁の影と印（奥行きの手がかり）
    this.wallShadow(x, y, r * 2.6, r * 2.6, 0.5);
    T.flat(SP.disc, x, y, -DEPTH + 0.05, r * 0.8, r * 0.8, 0, 0xff5a96, 0.9, 0.9);
    if (bl.kind === 'ring') {
      const s = r * 2.5, pu = 1 + 0.06 * Math.sin(now * 14 + bl.id);
      T.put(SP.halo, x, y, z, s * 1.5, s * 1.5, 0, 0x000000, 0, 0.5);
      T.put(SP.halo, x, y, z, s * 1.45 * pu, s * 1.45 * pu, 0, 0x30b8ff, 1.3);
      T.put(SP.ring, x, y, z, s * pu, s * pu, 0, 0xffffff, 1.6, 0.8);
      T.put(SP.ring2, x, y, z, s * 0.8, s * 0.8, now * 5 + bl.id, 0xa0e8ff, 0.8);
      return;
    }
    if (bl.kind === 'beam') {
      const len = bl.len || 2, cx = x - ux * len / 2, cy = y - uy * len / 2, cz = z - uz * len / 2;
      T.axis(SP.beam, cx, cy, cz, ux * (len + 0.5), uy * (len + 0.5), uz * (len + 0.5), 1.0, 0x000000, 0, 0.45);
      T.axis(SP.beam, cx, cy, cz, ux * (len + 0.4), uy * (len + 0.4), uz * (len + 0.4), 0.95, 0xff2a6a, 1.5);
      T.axis(SP.beam, cx, cy, cz, ux * len, uy * len, uz * len, 0.36, 0xffffff, 1.8, 0.9);
      T.put(SP.star, x, y, z, 1.5, 1.5, now * 6, 0xffd0e0, 1);
      return;
    }
    if (bl.kind === 'homing') {
      // 誘導弾: ひし形の橙の弾。尾を引き、点滅する
      const bk = 0.7 + 0.3 * Math.sin(now * 30 + bl.id);
      T.axis(SP.trail, x - ux * 0.7, y - uy * 0.7, z - uz * 0.7, ux * 1.8, uy * 1.8, uz * 1.8, 0.5, 0xff6a20, 1.1);
      T.put(SP.disc, x, y, z, r * 3.4, r * 3.4, 0, 0x000000, 0, 0.5);
      T.put(SP.star, x, y, z, r * 6, r * 6, PI / 4 + now * 3, 0xff8a30, 1.2 * bk);
      T.put(SP.disc, x, y, z, r * 2.5, r * 2.5, 0, 0xff8a30, 1.2, 1);
      T.put(SP.disc, x, y, z, r * 1.4, r * 1.4, 0, 0xffffff, 1.5, 1);
      return;
    }
    // 通常弾: 速度の向きに尾が伸びる
    const tl = Math.min(1.6, sp * 9), pu = 1 + 0.08 * Math.sin(now * 18 + bl.id * 1.3);
    T.axis(SP.trail, x - ux * tl * 0.42, y - uy * tl * 0.42, z - uz * tl * 0.42, ux * tl, uy * tl, uz * tl, r * 2.4, 0xff2a8a, 0.9);
    T.put(SP.disc, x, y, z, r * 3.3, r * 3.3, 0, 0x000000, 0, 0.55);
    T.put(SP.glow, x, y, z, r * 6.5 * pu, r * 6.5 * pu, 0, 0xff2a8a, 0.9);
    T.put(SP.disc, x, y, z, r * 2.7 * pu, r * 2.7 * pu, 0, 0xff3a96, 1.3, 1);
    T.put(SP.disc, x, y, z, r * 1.6, r * 1.6, 0, 0xffffff, 1.6, 1);
  }

  // ---- 敵 --------------------------------------------------------------------
  // 損傷の煙と火花（hp の割合で段階が進む）。返り値は掛け色
  damageFx(e, x, y, z, r) {
    const k = e.hp / (e.maxHp || 1);
    if (k < 0.55 && this.every(k < 0.28 ? 12 : 5)) this.smokePuff(x + rr(-r, r) * 0.5, y + rr(-r, r) * 0.4, z + rr(-0.3, 0.3), r * rr(0.5, 0.9), 0x2a2630, 0.6, 0.9, 0.9, 0.5);
    if (k < 0.28) { if (this.every(7)) this.sparks(x + rr(-r, r) * 0.6, y + rr(-r, r) * 0.5, z, 3, 0xffc060, 0, TAU, 2, 7); this.sp.put(SP.fire, x - this.cam - HW + Math.sin(this.now * 9 + e.id) * r * 0.3, y - HH + r * 0.3, -z + 0.3, r * 0.9, r * 0.9, this.now * 3, 0xff7a20, 0.8, 0.2); }
    return gray(0.62 + 0.38 * Math.min(1, k * 1.4));
  }
  drawEnemy(e, g, a) {
    if (e.dead && !e.boss) return;
    if (e.delay > 0 || (e.ghost && e.type !== 'popper' && e.type !== 'drone' && e.type !== 'vent')) return;
    if (e.type === 'vent') return;
    const x = lerp(e.px, e.x, a), y = lerp(e.py, e.y, a), z = lerp(e.pz, e.z, a);
    if (x < this.cam - 10 || x > this.cam + VIEW_W + 12) return;
    if (BOSS[e.type]) { this.drawBoss(e, a, g); return; }
    const b = this.b, S = this.sp, f = e.flash || 0, now = this.now, cam = this.cam;
    const lx = x - cam - HW, ly = y - HH, lz = -z;
    const ceil = e.anchor === 'c', dir = ceil ? -1 : 1, rx = ceil ? PI : 0;
    const hs = 1 + f * 0.07;        // 被弾の瞬間に少し膨らむ（ヒットストップ風）
    if (e.type !== 'membrane' && e.type !== 'tentacle' && e.type !== 'piston' && e.type !== 'zapper') this.wallShadow(lx, ly, Math.min(4, e.r * 2.3), Math.min(4, e.r * 2.3), 0.42);
    if (e.anchor && GROUNDED[e.type]) { const gy = (ceil ? g.ceilAt(x) : g.floorAt(x)) - HH - dir * -0.04; this.spB.floor(SP.shadow, lx, gy, lz, e.r * 3.4, e.r * 3.0, 0x000000, 0, 0.6); }
    switch (e.type) {
      case 'dart': {
        // 旋回でバンク（進む向きが水平から外れるほど傾く）。後ろにエンジンの光
        const ang = e.ang, c = Math.cos(ang), s = Math.sin(ang);
        this.M3(e.carrier ? 'dart_red' : DART[e.pat] || 'dart_line', lx, ly, lz, clamp(s * 1.25, -1.2, 1.2) + Math.sin(now * 3 + e.id) * 0.1, 0, ang + PI, hs, hs, hs, f);
        this.exh(lx - c * 0.46, ly - s * 0.46, lz, 0.5 + 0.08 * Math.sin(now * 40 + e.id), 0.09, 0xffa040, ang, 1.1);
        S.put(SP.glow, lx - c * 0.5, ly - s * 0.5, lz, 0.55, 0.55, 0, 0xff9030, 0.8);
        break;
      }
      case 'wheel': {
        const sp = e.spin || 0, col = e.carrier ? 0xffb040 : 0x7ad8ff;
        this.M3(e.carrier ? 'wheelRed' : 'wheel', lx, ly, lz, 0, Math.sin(now * 2 + e.id) * 0.35, sp, hs, hs, hs, f);
        // 回転の残像（縁の灯りが弧を引く）
        for (let k = 0; k < 4; k++) for (let j = 1; j <= 2; j++) { const an = sp + k * PI / 2 - j * 0.3; S.axis(SP.trail, lx + Math.cos(an) * 0.6, ly + Math.sin(an) * 0.6, lz, -Math.sin(an) * 0.3, Math.cos(an) * 0.3, 0, 0.16, col, 0.7 - j * 0.25); }
        S.put(SP.glow, lx, ly, lz + 0.2, 0.7, 0.7, 0, 0xff5a3a, 0.8);
        break;
      }
      case 'turret': {
        const iv = g.fireInterval(e.rate ?? 120), ts = (e.t + e.id * 17) % iv, rec = ts < 9 ? 1 - ts / 9 : 0, ca = Math.cos(e.aim), sa = Math.sin(e.aim);
        const tint = this.damageFx(e, x, y, z, 0.6);
        this.M3('turretBase', lx, ly, lz, rx, 0, 0, hs, hs, hs, f, tint);
        this.M3('turretGun', lx - ca * rec * 0.14, ly - sa * rec * 0.14, lz, 0, 0, e.aim, hs, hs, hs, f, tint);    // 砲身の後座
        const soon = iv - ts < 28 ? (28 - (iv - ts)) / 28 : 0;
        S.axis(SP.beam, lx + ca * 3.4, ly + sa * 3.4, lz, ca * 5, sa * 5, 0, 0.07, 0xff3020, 0.2 + soon * 0.6);        // 照準レーザー
        if (ts < 4) { S.put(SP.burst, lx + ca * 1.05, ly + sa * 1.05, lz, 1.5 - ts * 0.2, 1.5 - ts * 0.2, e.aim, 0xffd080, 1.3); }
        if (ts > 2 && ts < 30 && this.every(9)) this.smokePuff(x + ca * 0.9, y + sa * 0.9, z, 0.3, 0x8a8a94, ca * 0.6, sa * 0.6 + 0.3, 0.5, 0.35);   // 排熱
        S.put(SP.glow, lx, ly + dir * 0.1, lz + 0.46, 0.4, 0.4, 0, 0xff4a2a, 0.6 + soon);
        break;
      }
      case 'cannon': {
        const cyc = (e.t + e.id * 13) % g.fireInterval(150), ca = Math.cos(e.aim), sa = Math.sin(e.aim);
        let rec = 0; for (let k = 0; k < 3; k++) { const d = cyc - (120 + k * 8); if (d >= 0 && d < 8) rec = 1 - d / 8; }
        const tint = this.damageFx(e, x, y, z, 1.0);
        this.M3('cannonBase', lx, ly, lz, rx, 0, 0, hs, hs, hs, f, tint);
        this.M3('cannonBarrel', lx - ca * rec * 0.25, ly - sa * rec * 0.25, lz, 0, 0, e.aim, hs, hs, hs, f, tint);
        const mx = lx + ca * 1.7, my = ly + sa * 1.7;
        if (e.charge) { const k = (cyc - 100) / 20; S.put(SP.glow, mx, my, lz, 0.8 + k * 1.6, 0.8 + k * 1.6, 0, 0xffc050, 0.6 + k); S.put(SP.ring2, mx, my, lz, 2.4 - k * 1.4, 2.4 - k * 1.4, now * 5, 0xffe08a, k); S.put(SP.star, mx, my, lz, 1 + k * 1.5, 1 + k * 1.5, now * 3, 0xfff0c0, k); }
        if (rec > 0) { S.put(SP.burst, mx, my, lz, 2.6 * rec, 2.6 * rec, e.aim, 0xffd080, 1.4 * rec); S.axis(SP.trail, mx - ca * 0.2, my - sa * 0.2, lz, -ca * 1.6, -sa * 1.6, 0, 0.9, 0xffa040, rec); }
        if (cyc > 136 && cyc < 170 && this.every(14)) this.smokePuff(x + ca * 1.5, y + sa * 1.5, z, 0.5, 0x7a7a84, ca * 0.8, sa * 0.8 + 0.4, 0.7, 0.4);
        S.axis(SP.beam, lx + ca * 4.4, ly + sa * 4.4, lz, ca * 6, sa * 6, 0, 0.06, 0x4ab0ff, 0.18 + (e.charge ? 0.5 : 0));
        break;
      }
      case 'walker': {
        // 関節のある 2 本脚（腰 → 膝 → 足）。歩き・しゃがみ・跳躍・着地で形が変わる
        const face = e.vx < 0 ? -1 : 1, ph = e.walk || 0, air = e.jump > 0, cr = e.crouch > 0 ? 1 - e.crouch / 12 : 0, land = e.land > 0 ? e.land / 12 : 0;
        const tint = this.damageFx(e, x, y, z, 0.6);
        const bob = air ? 0 : Math.abs(Math.sin(ph)) * 0.03 - cr * 0.1 - land * 0.12;
        this.M3('walker', lx, ly + dir * bob, lz, rx, face < 0 ? 0 : PI, (air ? -0.12 : cr * 0.14 + Math.sin(ph) * 0.03) * face * -dir, hs, hs, hs, f, tint);
        const hy = ly + dir * (bob - 0.15), L1 = 0.44, L2 = 0.5;
        for (let s = -1; s <= 1; s += 2) {
          const pz = lz + s * 0.36 * dir, k = Math.sin(ph + (s > 0 ? 0 : PI)), lift = air ? 0 : Math.max(0, Math.cos(ph + (s > 0 ? 0 : PI))) * 0.14;
          let fx = lx + (air ? face * 0.22 : k * 0.36 + face * (cr * 0.1 - 0.04)), fy = air ? ly - dir * 0.62 : ly - dir * (0.74 - lift);
          const dx = fx - lx, dy = fy - hy, d = clamp(Math.hypot(dx, dy), 0.12, L1 + L2 - 0.01), an = Math.atan2(dy, dx);
          const A = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)), sg = face * dir;      // 膝は後ろへ曲がる
          const kx = lx + Math.cos(an + A * sg) * L1, ky = hy + Math.sin(an + A * sg) * L1;
          fx = lx + Math.cos(an) * d; fy = hy + Math.sin(an) * d;
          quatAlong(kx - lx, ky - hy, 0, _q); b.limb.put3(lx, hy, pz, 0.085, L1, 0.085, _q, 0x8a6a1e);
          quatAlong(fx - kx, fy - ky, 0, _q); b.limb.put3(kx, ky, pz, 0.065, Math.hypot(fx - kx, fy - ky), 0.065, _q, 0x4a5468);
          b.sph.put3(kx, ky, pz, 0.1, 0.1, 0.1, Q_ID, 0xc8ccd8);
          b.box.put3(fx - face * 0.06, fy - dir * 0.03, pz, 0.36, 0.09, 0.2, Q_ID, 0x39414f);
        }
        S.put(SP.glow, lx - face * 0.55, ly + dir * 0.25, lz, 0.5, 0.5, 0, 0xff3a2a, 0.8);
        if ((e.land > 9 || e.jump === 1 || e.jump === 2) && this.every(90)) this.smokePuff(x + rr(-0.5, 0.5), y - dir * 0.75, z + rr(-0.3, 0.3), 0.5, 0x9a8a6a, rr(-1.2, 1.2), dir * 0.5, 0.6, 0.45);   // 砂煙
        break;
      }
      case 'hatch': {
        const op = e.open || 0, th = op * 1.25, flesh = e.color === 'flesh', cyc = (e.t + e.id * 11) % 170;
        const tint = this.damageFx(e, x, y, z, 1.0);
        this.M3(flesh ? 'hatchFlesh' : 'hatch', lx, ly, lz, rx, 0, 0, hs, hs * (flesh ? 1 + 0.03 * Math.sin(now * 3 + e.id) : 1), hs, f, tint);
        const hy = ly + dir * (flesh ? 0.28 : 0.4), door = flesh ? 'fleshLip' : 'hatchDoor';
        this.M3(door, lx - 0.75, hy, lz, rx, 0, dir * th, 1, 1, 1, f, tint);
        this.M3(door, lx + 0.75, hy, lz, rx, PI, -dir * th, 1, 1, 1, f, tint);
        if (op > 0.1) {
          S.put(SP.glow, lx, hy + dir * 0.1, lz, 2.6 * op, 2.0 * op, 0, flesh ? 0xff4a5a : 0xff7a3c, op * 0.9);     // 内部の光
          if (flesh) { const tx = 0.75 - Math.cos(th) * 0.7, ty = hy + dir * Math.sin(th) * 0.7; for (let k = -1; k <= 1; k++) S.axis(SP.beam, lx, ty - dir * 0.05 * (1 + k), lz + k * 0.32, (tx) * 2 + 0.01, 0, 0, 0.06, 0xfff0d8, 0.3, 0.3); }   // 粘液の糸
          if (cyc > 136 && cyc < 162 && this.every(20)) this.smokePuff(x + rr(-0.4, 0.4), y + dir * 0.6, z, 0.6, flesh ? 0x8a3a4a : 0x8a8a94, rr(-0.5, 0.5), dir * 1.6, 0.7, 0.4);   // 発進の煙
        }
        if (!flesh) for (let s = -1; s <= 1; s += 2) S.put(SP.glow, lx + s * 0.95, ly + dir * 0.4, lz + 0.7, 0.36, 0.36, 0, 0xffb040, cyc > 100 ? 0.5 + 0.5 * Math.sin(now * 16) : 0.3);
        break;
      }
      case 'drone': if (!e.ghost) {
        const c = Math.cos(e.ang), s = Math.sin(e.ang), flesh = e.color === 'flesh';
        this.M3(flesh ? 'droneFlesh' : 'drone', lx, ly, lz, flesh ? Math.sin(now * 9 + e.id) * 0.4 : now * 7 + e.id, 0, e.ang, hs, hs, hs, f);
        if (!flesh) this.exh(lx - c * 0.42, ly - s * 0.42, lz, 0.36, 0.07, 0xff96ff, e.ang, 1);
        S.put(SP.glow, lx - c * 0.42, ly - s * 0.42, lz, 0.45, 0.45, 0, flesh ? 0xff6a8a : 0xff96ff, 0.6 + 0.3 * Math.sin(now * 20 + e.id));
        break;
      }
      case 'rock': {
        const stone = e.color === 'stone', dmg = e.hp < e.maxHp ? 'd' : '';
        this.M3((stone ? 'stone0' : e.id % 2 ? 'rock0' : 'rock1') + dmg, lx, ly, lz, e.spin * 0.7, e.spin * 0.4, e.spin, e.r * hs, e.r * hs, e.r * hs, f);
        if (!stone) { S.put(SP.glow, lx, ly, lz, e.r * 2.6, e.r * 2.6, 0, 0xff5a10, 0.35 + (dmg ? 0.3 : 0)); if (this.every(6 * e.r)) this.ember(x, y, z, rr(-1, 1) - e.vx * 20, rr(-1, 1), 0xff7a20, 0.6, 0.1); }
        break;
      }
      case 'heavy': {
        const sc = e.color === 'flesh' ? 'Flesh' : e.carrier ? 'Red' : '';
        const c = e.phase === 1 ? e.hold % g.fireInterval(70) : -1, open = c < 0 ? 0 : c >= 14 && c <= 40 ? (c - 14) / 26 : c > 40 && c < 56 ? 1 - (c - 40) / 16 : 0;
        const tint = this.damageFx(e, x, y, z, 1.3), tl = (e.vy || 0) * 2.5;
        this.M3('heavy' + sc, lx, ly, lz, 0, 0, tl, hs, hs, hs, f, tint);
        // 可動フラップ（撃つ前に開く）と砲口の予告光
        this.M3('heavyFlap' + sc, lx - 0.42, ly + 0.5, lz, 0, 0, tl - open * 0.5, hs, hs, hs, f, tint);
        this.M3('heavyFlap' + sc, lx - 0.42, ly - 0.5, lz, PI, 0, tl + open * 0.5, hs, hs, hs, f, tint);
        if (open > 0.05 && c <= 40) for (let k = -1; k <= 1; k++) { const mx = lx - (k ? 1.55 : 1.95), my = ly + k * 0.47; S.put(SP.glow, mx, my, lz, 0.3 + open * 0.7, 0.3 + open * 0.7, 0, 0xff5a8a, 0.4 + open * 0.8); S.put(SP.star, mx, my, lz, open * 1.1, open * 1.1, now * 4, 0xffd0e0, open); }
        if (c > 40 && c < 45) for (let k = -1; k <= 1; k++) S.put(SP.burst, lx - (k ? 1.6 : 2.0), ly + k * 0.47, lz, 1.8, 1.8, PI, 0xffd080, 1.2);
        const mv = e.phase === 1 ? 0.5 : 1.1;
        for (let s = -1; s <= 1; s += 2) { this.exh(lx + 1.52, ly, lz + s * 0.24, mv * (1 + 0.1 * Math.sin(now * 37 + s)), 0.19, 0x78c8ff, PI, 1); }
        S.put(SP.glow, lx + 1.6, ly, lz, 1.3, 1.3, 0, 0x5aa8ff, 0.7);
        S.put(SP.glow, lx - 0.2, ly, lz + 0.66, 0.7, 0.7, 0, 0xff5028, 0.7);
        break;
      }
      case 'brick': { const s = e.r / 0.85 * hs; this.M3(e.hp >= e.maxHp ? 'brick0' : e.hp >= 2 ? 'brick1' : 'brick2', lx, ly, lz, 0, 0, 0, s, s, s, f, this.stoneTint); break; }
      case 'shutter': {
        const k = e.hp / e.maxHp, s = e.r / 0.8 * hs, d = k > 0.7 ? 0 : k > 0.35 ? 1 : 2;
        this.M3('shutter' + d, lx, ly, lz, 0, 0, 0, s, s, s, f);
        S.put(SP.glow, lx, ly, lz + e.r * 0.98, 0.6, 0.6, 0, d > 1 ? 0xff5030 : d ? 0xffc040 : 0x50b4ff, 0.6 + (d > 1 ? 0.4 * Math.sin(now * 20) : 0));
        if (d > 1 && this.every(4)) this.sparks(x, y, z + 0.7, 3, 0xffc060, 0, TAU, 2, 6);
        break;
      }
      case 'popper': if (e.rise > 0.03) {
        this.M3('popper', lx, ly, lz, rx, 0, 0, hs, hs, hs, f);
        const k = e.rise >= 1 ? 1 : 0.4;
        for (let s = -1; s <= 1; s += 2) S.put(SP.glow, lx - 0.52, ly + dir * 0.17, lz + s * 0.3, 0.45, 0.45, 0, 0xffde4a, k);
        if (e.rise > 0.05 && e.rise < 0.95 && this.every(22)) this.smokePuff(x + rr(-0.6, 0.6), e.base + dir * 0.1, z + rr(-0.4, 0.4), 0.45, 0x8a7a5a, rr(-0.8, 0.8), dir * 0.5, 0.5, 0.45);
        break;
      }
      case 'stonehead': {
        const sh = e.shake ? Math.sin(now * 80) * 0.06 : 0, m = e.mouth || 0, hx = lx + sh;
        this.M3('stonehead', hx, ly, lz, rx, 0, 0, 1, 1, 1, f);
        this.M3('stonejaw', hx, ly - dir * (0.5 + m * 0.45), lz, rx, 0, 0, 1, 1, 1, f);
        const ey = 0.35 + (e.shake ? 0.5 : 0) + m * 0.6;
        for (let s = -1; s <= 1; s += 2) S.put(SP.glow, hx - 0.5, ly + dir * 0.99, lz + s * 1.22, 0.7 + ey * 0.5, 0.45 + ey * 0.3, 0, 0xff78d2, ey);
        if (m > 0.05) { const my = ly - dir * (0.35 + m * 0.22); S.put(SP.glow, hx - 1.15, my, lz, 1.6 + m, 0.8 + m * 1.2, 0, 0xff4ab0, m * 1.1); S.put(SP.halo, hx - 1.3, my, lz, 1.2 * m, 1.6 * m, 0, 0xffa0e0, m * 0.6); }
        if (e.shake && this.every(18)) this.smokePuff(x + rr(-1.2, 0.8), y + dir * rr(0.5, 2.3), z + rr(-1.2, 1.2), 0.5, 0x8a8494, rr(-0.5, 0.5), -dir * 1.2, 0.6, 0.4);
        break;
      }
      case 'pebble': this.M3('pebble', lx, ly, lz, 0, Math.sin(now * 2 + e.id) * 0.3, e.spin || 0, hs, hs, hs, f); S.put(SP.glow, lx, ly + 0.14, lz + 0.5, 0.8, 0.4, e.spin || 0, 0xff7ad0, 0.6); break;
      case 'piston': {
        // 節のある柱＋丸い打撃頭（判定は半径 w×0.95 の球の列）。伸びる前に震えて警告灯が点滅
        const len = e.len || 1, w = e.w, shk = e.warn ? Math.sin(now * 70) * 0.05 : 0, ry = e.root - HH, px = lx + shk;
        const n = Math.ceil(len) + 1;
        for (let k = 0; k < n; k++) this.M3('pistonSeg', px, ry + dir * (len - 1 - k), lz, rx, 0, 0, w, 1, w);
        this.M3('pistonHead', px, ry + dir * len, lz, rx, 0, 0, w, w, w);
        this.wallShadow(px, ry + dir * len / 2, w * 2.6, len + 2.4, 0.4);
        if (e.warn) { const bk = 0.5 + 0.5 * Math.sin(now * 30); for (let s = -1; s <= 1; s += 2) S.put(SP.glow, px + s * w, ry + dir * (len - 0.2), lz + w * 1.1, 0.9, 0.9, 0, 0xff4020, bk); if (this.every(16)) this.smokePuff(x + rr(-1, 1) * w, e.root + dir * 0.3, z + rr(-1, 1), 0.6, 0xc8c8d0, rr(-1, 1), dir * 1.2, 0.5, 0.35); }
        break;
      }
      case 'slider': {
        const h = e.h ?? 3;
        this.M3('slider', lx, ly, lz, 0, 0, 0, 1, h / 3, 1);
        S.put(SP.glow, lx, ly, lz + 1.15, 0.8, h * 0.8, 0, 0xffcf6a, 0.4 + 0.2 * Math.sin(now * 4 + e.id));
        break;
      }
      case 'zapper': {
        const y0 = e.y0 - HH, y1 = e.y1 - HH, mid = (y0 + y1) / 2, len = y1 - y0 - 1.4, on = e.warn || e.beam;
        this.M3('zapper', lx, y0, lz, 0, 0, 0, hs, hs, hs, f); this.M3('zapper', lx, y1, lz, PI, 0, 0, hs, hs, hs, f);
        this.wallShadow(lx, y0, 1.8, 1.4, 0.4); this.wallShadow(lx, y1, 1.8, 1.4, 0.4);
        const tc = e.beam ? 0xffe8ee : e.warn ? 0xff4a6a : 0x4ab0ff, ti = e.beam ? 1.5 : e.warn ? 0.6 + 0.4 * Math.sin(now * 30) : 0.5;
        S.put(SP.glow, lx, y0 + 0.7, lz, on ? 1.5 : 0.8, on ? 1.5 : 0.8, 0, tc, ti); S.put(SP.glow, lx, y1 - 0.7, lz, on ? 1.5 : 0.8, on ? 1.5 : 0.8, 0, tc, ti);
        if (e.warn) { S.axis(SP.beam, lx, mid, lz, 0, len, 0, 0.12, 0xff5070, 0.5 + 0.4 * Math.sin(now * 30)); S.put(SP.ring2, lx, y0 + 0.7, lz, 1.6, 1.6, now * 6, 0xff7090, 0.8); S.put(SP.ring2, lx, y1 - 0.7, lz, 1.6, 1.6, -now * 6, 0xff7090, 0.8); }
        if (e.beam) {
          // 光線: 芯・外光・螺旋・稲妻・両端の火花
          b.beam.put3(lx, mid, lz, 0.1 + Math.sin(now * 50) * 0.02, len, 0.1, Q_ID, 0xffffff);
          b.spiral.put3(lx, mid, lz, 0.3, len, 0.3, Q_ID, 0xff5a8a, 1.6);
          S.axis(SP.beam, lx, mid, lz, 0, len + 0.6, 0, 1.3, 0xff2a5e, 1.2); S.axis(SP.beam, lx, mid, lz, 0, len + 0.3, 0, 0.5, 0xffc0d0, 1.2);
          for (let k = 0; k < 3; k++) { const sy = mid + (((now * 3 + k * 0.37 + e.id * 0.1) % 1) - 0.5) * len * 0.8; S.axis(SP.arc, lx + Math.sin(now * 40 + k * 2) * 0.1, sy, lz, 0, (k % 2 ? 2.6 : -2.6), 0, 1.4, 0xffd0e0, 1.2); }
          S.put(SP.star, lx, y0 + 0.75, lz, 2.4, 2.4, now * 9, 0xffd0e0, 1.2); S.put(SP.star, lx, y1 - 0.75, lz, 2.4, 2.4, -now * 9, 0xffd0e0, 1.2);
          if (this.every(40)) this.sparks(x, rnd() < 0.5 ? e.y0 + 0.8 : e.y1 - 0.8, z, 2, 0xffb0c8, 0, TAU, 2, 8);
        }
        break;
      }
      case 'tentacle': {
        // 節（半透明の艶のある肉）は壊れない。先端の目玉だけが弱点
        const n = e.parts.length, pulse = now * 4;
        for (let i = 0; i < n - 1; i++) {
          const q = e.parts[i], r = (0.42 + 0.18 * (1 - i / n)) * 1.1;
          const qx = lerp(q.px, q.x, a) - cam - HW, qy = lerp(q.py, q.y, a) - HH, qz = -lerp(q.pz, q.z, a);
          this.M3('tentSeg', qx, qy, qz, 0, 0, q.a || 0, r, r, r, 0, mix(0x8a3044, 0xe07088, 0.5 + 0.5 * Math.sin(pulse - i * 0.6)));
          if (i % 3 === 0) this.wallShadow(qx, qy, 1.6, 1.6, 0.35);
        }
        const ta = (e.parts[n - 1].a || 0);
        this.M3('tentTip', lx, ly, lz, 0, 0, ta - PI / 2 + Math.sin(now * 2 + e.id) * 0.2, hs, hs, hs, f, this.damageFx(e, x, y, z, 0.7));
        S.put(SP.glow, lx, ly, lz + 0.7, 0.8, 0.8, 0, 0xffd060, 0.5 + 0.2 * Math.sin(now * 6 + e.id));
        break;
      }
      case 'spore': {
        const r = 0.5 + Math.sin(now * 5 + e.id) * 0.04, c = e.carrier ? 0xff8a4a : 0xff8cc0;
        this.M3(e.carrier ? 'sporeRed' : 'spore', lx, ly, lz, now * 0.7 + e.id, now * 0.5, now + e.id, hs, hs, hs, f);
        b.bubble.put3(lx, ly, lz, r, r, r, Q_ID, c, 1);
        S.put(SP.glow, lx, ly, lz, 1.5, 1.5, 0, e.carrier ? 0xff5a2a : 0xff4a8a, 0.45);
        break;
      }
      case 'membrane': {
        // 膜の壁: 細胞ごとに半透明の膜・核・小器官。壊れると輪から再生する
        for (const c of e.cells) {
          const cy = c.y - HH, cz = -c.z;
          if (c.hp <= 0) {
            const k = c.regen / (e.regenT ?? 300);
            S.put(SP.ring, lx, cy, cz, 1.6 * k + 0.1, 1.6 * k + 0.1, 0, 0xa0ffdc, 0.25 + k * 0.5);
            if (k > 0.6) { const r = 0.7 * (k - 0.6) / 0.4 * 0.6; b.bubble.put3(lx, cy, cz, r, r, r, Q_ID, 0xa0ffdc, 0.6); }
            continue;
          }
          const cx = e.x + Math.sin(c.y * 1.7 + e.t * 0.05) * 0.12 - cam - HW, r = 0.7 * (c.grow ?? 1), weak = c.hp < 2;
          this.M3('cellCore', cx, cy, cz, c.y, now * 0.4 + c.y * 2, 0, r * 0.92, r * 0.92, r * 0.92, f, weak ? 0xffffff : 0xb0c8b8);
          b.bubble.put3(cx, cy, cz, r * 1.04, r * (1.04 + 0.04 * Math.sin(now * 3 + c.y)), r * 1.04, Q_ID, weak ? 0xc8f8b0 : 0x5adca0, 1);
        }
        this.wallShadow(lx, 0, 1.8, VIEW_H, 0.3);
        break;
      }
      case 'blob': {
        const wob = Math.sin(now * 4 + e.id) * 0.07, r = e.r;
        this.M3('blobCore', lx, ly, lz, now * 0.6 + e.id, now * 0.4, 0, r * 0.95 * hs, r * 0.95 * hs, r * 0.95 * hs, f);
        b.bubble.put3(lx, ly, lz, r * (1.05 + wob), r * (1.05 - wob), r * 1.05, Q_ID, 0x78ffc8, 1);
        S.put(SP.glow, lx + r * 0.12, ly, lz, r * 1.6, r * 1.6, 0, 0xff8a2a, 0.5);
        break;
      }
    }
  }
}
const GROUNDED = { turret: 1, walker: 1, hatch: 1, cannon: 1, popper: 1, stonehead: 1 };
// 小型編隊機の配色（動きの種類ごと）
const DART = { line: 'dart_line', wave: 'dart_wave', swoop: 'dart_swoop', loop: 'dart_loop', chase: 'dart_chase', dive: 'dart_dive' };
export function installChars(Target) { for (const k of Object.getOwnPropertyNames(Chars3D.prototype)) if (k !== 'constructor') Target.prototype[k] = Chars3D.prototype[k]; }
