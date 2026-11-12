// 7 体のボス。各ボスは弱点と予告を持ち、2 種類以上の攻撃をする。最終ボスは 3 フェーズ。
// 部位（parts）ごとに当たり形・装甲・弱点・耐久を持つ。部位の位置は毎 tick ワールド座標で計算する（描画の補間に使う）。
import { TICK, VIEW_W, VIEW_H, DEPTH, SCORE } from './config.js';

const T = TICK;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// 部位の耐久の倍率（調整値。SPEC.md の調整ログ参照）
export const BOSS_HP = 5;
function part(name, ox, oy, r, o = {}) {
  const hp = (o.hp ?? 0) * BOSS_HP;
  return { name, ox, oy, oz: o.oz ?? 0, r, hp, maxHp: hp, armor: !!o.armor, weak: !!o.weak, harm: o.harm !== false,
    score: o.score ?? 0, alive: true, x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, core: !!o.core, vis: o.vis ?? true };
}
function placeParts(e) {
  for (const q of e.parts) {
    if (q.free) continue;
    q.x = e.x + q.ox; q.y = e.y + q.oy; q.z = e.z + q.oz;
  }
}
// 共通: 画面右から定位置まで減速して入る
function enter(e, g, homeSX = 24) {
  const tx = g.camX + homeSX;
  if (e.st === 'enter') {
    e.x += (tx - e.x) * 0.03;
    if (Math.abs(tx - e.x) < 0.05) { e.st = 'idle'; e.stT = 0; }
    return true;
  }
  return false;
}
function hitboxesOf(e) {
  const out = [];
  e.parts.forEach((q, i) => {
    if (!q.alive || q.vis === false) return;
    const open = q.weak ? (q.isOpen ? q.isOpen(e) : true) : true;
    const flags = (q.harm ? 2 : 0) | 1;
    out.push([q.x, q.y, q.z, q.r, i, flags, open]);
  });
  return out;
}
function onHitParts(e, g, dmg, idx, hx, hy, hz) {
  const q = e.parts[idx];
  if (!q || !q.alive) return;
  if (e.st === 'enter') { g.emit({ t: 'spark', x: hx, y: hy, z: hz, armor: true }); return; }   // 登場中は当たらない
  const open = q.isOpen ? q.isOpen(e) : true;
  if (q.armor || q.hp <= 0 || (q.weak && !open) || (q.guard && q.guard(e))) { g.emit({ t: 'spark', x: hx, y: hy, z: hz, armor: true }); return; }
  q.hp -= dmg; q.flash = 1; e.flash = Math.max(e.flash, 0.5);
  if (q.hp <= 0) {
    q.alive = false;
    g.score += q.score;
    g.emit({ t: 'explode', x: q.x, y: q.y, z: q.z, size: q.r > 1 ? 'm' : 's', kind: e.type });
    g.emit({ t: 'sfx', n: 'explode_m' });
    if (q.core) { g.kill(e); }
    else { const def = BOSS[e.type]; if (def.onPartDown) def.onPartDown(q, g, e); }
  } else g.emit({ t: 'sfx', n: 'enemy_hit' });
}
function hpOf(e, names) {
  let c = 0, m = 0;
  for (const q of e.parts) if (names.includes(q.name) || (names === '*' && q.maxHp > 0)) { c += Math.max(0, q.hp); m += q.maxHp; }
  return [c, m];
}
const bossBase = { r: 3, hp: 1, harm: true, score: SCORE.boss, keep: true, boom: 'l' };
const onDeath = (e, g) => { e.linger = 160; g.bossDefeated(); g.emit({ t: 'sfx', n: 'boss_explode' }); };
const zFollow = (e, g, k = 0.01) => { if (g.depth) e.z += clamp(g.player.z - e.z, -1, 1) * k; };
// 直進する光線弾（予告の後に撃つ）
function beam(g, e, x, y, z, ang = Math.PI, speed = 20, len = 2.6) {
  g.fire(e, { x, y, z, ang, speed, kind: 'beam', r: 0.22, aimZ: false, minDist: 0, force: true, len });
  const b = g.ebullets[g.ebullets.length - 1]; if (b) b.len = len;
}
function radial(g, e, n, x, y, z, speed, gap = 0, off = 0) {
  const aim = Math.atan2(g.player.y - y, g.player.x - x);
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2;
    if (gap && Math.abs(((a - aim + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < gap) continue;
    g.fire(e, { x, y, z, ang: a, speed, minDist: 0, force: true, aimZ: true });
  }
}

export const BOSS = {
  // ===== 1. 火山帯: IGNIS CARRIER（コアを 3 枚の装甲板が守る戦艦） =====
  ignis: {
    name: 'IGNIS CARRIER', base: { ...bossBase, r: 3.2 },
    init(e) {
      e.st = 'enter'; e.stT = 0; e.cool = 90;
      e.parts = [
        part('hullT', 0.6, 2.0, 1.5, { armor: true }), part('hullB', 0.6, -2.0, 1.5, { armor: true }),
        part('hullM', 1.8, 0, 1.3, { armor: true }),
        part('wingT', 2.2, 3.6, 1.0, { armor: true }), part('wingB', 2.2, -3.6, 1.0, { armor: true }),
        part('plate', -2.0, 0, 0.62, { hp: 4, score: 200 }), part('plate', -1.4, 0, 0.62, { hp: 4, score: 200 }), part('plate', -0.8, 0, 0.62, { hp: 4, score: 200 }),
        part('core', -0.15, 0, 0.7, { hp: 16, weak: true, core: true }),
      ];
      const core = e.parts[8];
      core.isOpen = (b) => b.parts.slice(5, 8).every((q) => !q.alive);
    },
    update(e, g) {
      placeParts(e); zFollow(e, g);
      if (enter(e, g, 24)) return;
      e.stT++;
      const hard = e.parts[8].hp < 8;
      // 自機の高さをゆっくり追う
      const ty = clamp(g.player.y, 4.5, VIEW_H - 4.5);
      e.y += clamp(ty - e.y, -2.6 * T, 2.6 * T) * (e.st === 'beam' ? 0.3 : 1);
      if (e.st === 'idle' && e.stT > (hard ? 60 : 90)) { e.st = e.alt ? 'spread' : 'charge'; e.alt = !e.alt; e.stT = 0; }
      if (e.st === 'charge') { e.charge = e.stT / 36; if (e.stT >= 36) { e.st = 'beam'; e.stT = 0; e.charge = 0; } }
      if (e.st === 'beam') {
        if (e.stT % 10 === 1) for (const oy of [-2.6, -1.3, 1.3, 2.6]) beam(g, e, e.x - 1.6, e.y + oy, e.z, Math.PI, 20 * g.diff.bulletSpeed / g.diff.bulletSpeed);
        if (e.stT === 1) g.emit({ t: 'sfx', n: 'laser' });
        if (e.stT > (hard ? 40 : 30)) { e.st = 'idle'; e.stT = 0; }
      }
      if (e.st === 'spread') {
        if (e.stT % g.fireInterval(18) === 0) { g.fire(e, { x: e.x + 0.6, y: e.y + 3.4, z: e.z, spread: [-0.15, 0.15], minDist: 0 }); g.fire(e, { x: e.x + 0.6, y: e.y - 3.4, z: e.z, spread: [-0.15, 0.15], minDist: 0 }); }
        if (e.stT > 90) { e.st = 'idle'; e.stT = 0; }
      }
    },
    hitboxes: hitboxesOf, onHit: onHitParts, onDeath,
    bossHp: (e) => hpOf(e, ['plate', 'core']),
    forceKill(e, g) { g.kill(e); },
  },

  // ===== 2. 古代遺跡: GATE WARDEN（顎を開くと目が出る門） =====
  warden: {
    name: 'GATE WARDEN', base: { ...bossBase, r: 3 },
    init(e) {
      e.st = 'enter'; e.stT = 0; e.open = 0;
      e.parts = [
        part('jawT', -0.4, 2.2, 1.6, { armor: true }), part('jawT2', 1.4, 2.6, 1.6, { armor: true }),
        part('jawB', -0.4, -2.2, 1.6, { armor: true }), part('jawB2', 1.4, -2.6, 1.6, { armor: true }),
        part('pillarT', 2.6, 5.4, 1.4, { armor: true }), part('pillarB', 2.6, -5.4, 1.4, { armor: true }),
        part('eye', 0.2, 0, 0.95, { hp: 26, weak: true, core: true }),
      ];
      e.parts[6].isOpen = (b) => b.open > 0.6;
    },
    update(e, g) {
      // 顎の開き具合で部位の位置が変わる
      const o = e.open;
      e.parts[0].oy = 1.0 + o * 2.2; e.parts[1].oy = 1.6 + o * 1.8;
      e.parts[2].oy = -1.0 - o * 2.2; e.parts[3].oy = -1.6 - o * 1.8;
      placeParts(e); zFollow(e, g, 0.006);
      if (enter(e, g, 25)) return;
      e.stT++;
      const angry = e.parts[6].hp < 13;
      if (e.st === 'idle') {
        // 閉じている間: 天井から石を落とす
        e.y += Math.sin(e.t * 0.02) * 0.02;
        if (e.stT % g.fireInterval(angry ? 34 : 46) === 10) {
          const x = clamp(g.player.x + g.rng.range(-3, 3), g.camX + 3, g.camX + 20);
          g.emit({ t: 'dust', x, y: VIEW_H - 0.5 });
          g.spawn('rock', { x, y: VIEW_H + 1, z: g.depth ? clamp(g.player.z + g.rng.range(-1, 1), -DEPTH, DEPTH) : 0, vx: 0, vy: -1 * T, grav: 9, color: 'stone' });
        }
        if (e.stT > 160) { e.st = 'shake'; e.stT = 0; }
      } else if (e.st === 'shake') {
        e.shake = 1;
        if (e.stT > 34) { e.st = 'open'; e.stT = 0; e.shake = 0; }
      } else if (e.st === 'open') {
        e.open = Math.min(1, e.open + 0.05);
        if (e.open >= 1 && e.stT % g.fireInterval(angry ? 34 : 48) === 0) {
          const fan = []; for (let k = -3; k <= 3; k++) fan.push(k * 0.17);
          g.fire(e, { x: e.x + 0.2 - 0.8, y: e.y, z: e.z, spread: fan, speed: 8, minDist: 0, sfx: null });
        }
        if (e.stT > 170) { e.st = 'close'; e.stT = 0; }
      } else if (e.st === 'close') {
        e.open = Math.max(0, e.open - 0.06);
        if (e.open <= 0) { e.st = 'idle'; e.stT = 0; }
      }
    },
    hitboxes: hitboxesOf, onHit: onHitParts, onDeath,
    bossHp: (e) => hpOf(e, ['eye']),
  },

  // ===== 3. 巨大石像: COLOSSUS（巨大な顔。口からリング、目から光線、小さな顔を落とす） =====
  colossus: {
    name: 'COLOSSUS', base: { ...bossBase, r: 3.5 },
    init(e) {
      e.st = 'enter'; e.stT = 0; e.mouth = 0; e.eyes = 0; e.seq = 0;
      e.parts = [
        part('crown', 0.9, 2.8, 2.2, { armor: true }), part('face', 0.6, 0.2, 2.4, { armor: true }),
        part('chin', 0.6, -2.7, 1.9, { armor: true }), part('back', 3.0, 0.5, 2.6, { armor: true }),
        part('mouth', -1.75, -1.2, 0.85, { hp: 32, weak: true, core: true }),
      ];
      e.parts[4].isOpen = (b) => b.mouth > 0.6;
    },
    update(e, g) {
      e.parts[2].oy = -2.7 - e.mouth * 0.9;
      e.parts[4].oy = -1.2 - e.mouth * 0.45;
      placeParts(e); zFollow(e, g, 0.006);
      if (enter(e, g, 24)) return;
      e.stT++;
      e.y = VIEW_H / 2 + Math.sin(e.t * 0.012) * 3.2;
      const hard = e.parts[4].hp < 16;
      const seq = ['eyes', 'mouth', 'pebbles', 'mouth'];
      if (e.st === 'idle' && e.stT > (hard ? 40 : 70)) { e.st = seq[e.seq++ % seq.length]; e.stT = 0; }
      if (e.st === 'eyes') {
        e.eyes = Math.min(1, e.stT / 40);
        if (e.stT >= 40 && e.stT % 12 === 0) for (const oy of [1.25]) { g.fire(e, { x: e.x - 1.6, y: e.y + oy, z: e.z, speed: 13, kind: 'beam', minDist: 0, len: 1.4 }); g.ebullets.at(-1).len = 1.4; }
        if (e.stT > 80) { e.st = 'idle'; e.stT = 0; e.eyes = 0; }
      } else if (e.st === 'mouth') {
        e.mouth = clamp(e.stT < 20 ? e.stT / 20 : e.stT > 130 ? 1 - (e.stT - 130) / 20 : 1, 0, 1);
        e.shake = e.stT < 20 ? 1 : 0;
        if (e.mouth > 0.9 && e.stT % g.fireInterval(hard ? 9 : 12) === 0) {
          const m = e.parts[4];
          g.fire(e, { x: m.x - 0.4, y: m.y, z: m.z, speed: 7, kind: 'ring', r: 0.45, hp: 1, minDist: 0, sfx: 'ring' });
        }
        if (e.stT > 150) { e.st = 'idle'; e.stT = 0; e.mouth = 0; }
      } else if (e.st === 'pebbles') {
        if (e.stT % 24 === 1) g.spawn('pebble', { x: e.x - 1, y: e.y + 3.2, z: e.z, dir: 1, vx: -5 * T, vy: 2 * T, t: 40 });
        if (e.stT > 75) { e.st = 'idle'; e.stT = 0; }
      }
    },
    hitboxes: hitboxesOf, onHit: onHitParts, onDeath,
    bossHp: (e) => hpOf(e, ['mouth']),
  },

  // ===== 4. 地形の難所: TWIN CRUSHER（上下の腕で挟み、コアが誘導弾） =====
  crusher: {
    name: 'TWIN CRUSHER', base: { ...bossBase, r: 2 },
    init(e) {
      e.st = 'enter'; e.stT = 0; e.shutter = 0; e.clampY = VIEW_H / 2; e.armExt = 0; e.armX = 14;
      e.parts = [
        part('body', 1.6, 0, 1.6, { armor: true }), part('bodyT', 1.2, 1.9, 1.1, { armor: true }), part('bodyB', 1.2, -1.9, 1.1, { armor: true }),
        part('core', -0.4, 0, 0.75, { hp: 30, weak: true, core: true }),
      ];
      e.parts[3].isOpen = (b) => b.shutter > 0.6;
      // 腕（画面の中ほどで上下から閉じる柱）。free=true で位置を自前で計算
      for (let i = 0; i < 7; i++) { const q = part('armT', 0, 0, 1.05, { armor: true }); q.free = true; q.arm = 'T'; q.i = i; e.parts.push(q); }
      for (let i = 0; i < 7; i++) { const q = part('armB', 0, 0, 1.05, { armor: true }); q.free = true; q.arm = 'B'; q.i = i; e.parts.push(q); }
    },
    update(e, g) {
      placeParts(e); zFollow(e, g, 0.008);
      // 腕の位置: armExt 0 で画面外（上下）、1 で clampY ±0.9 まで
      const ax = g.camX + e.armX;
      for (const q of e.parts) if (q.free) {
        const top = VIEW_H + 7.5 - e.armExt * (VIEW_H + 7.5 - (e.clampY + 1.1));
        const bot = -7.5 + e.armExt * ((e.clampY - 1.1) + 7.5);
        q.x = ax; q.z = g.depth ? 0 : 0;
        q.y = q.arm === 'T' ? top + q.i * 1.15 : bot - q.i * 1.15;
        q.vis = true;
      }
      if (enter(e, g, 25)) { e.armExt = 0; return; }
      e.stT++;
      e.y += (VIEW_H / 2 + Math.sin(e.t * 0.02) * 4 - e.y) * 0.02;
      const hard = e.parts[3].hp < 15;
      if (e.st === 'idle' && e.stT > 50) { e.st = 'aim'; e.stT = 0; }
      if (e.st === 'aim') {
        // 予告: 挟む位置（自機の x）と高さに印を出してから閉じる
        e.armX = clamp(g.player.x - g.camX + 0.0, 6, 20);
        e.clampY = clamp(g.player.y, 3, VIEW_H - 3);
        e.warn = 1;
        if (e.stT > (hard ? 40 : 55)) { e.st = 'slam'; e.stT = 0; e.warn = 0; }
      } else if (e.st === 'slam') {
        e.armExt = Math.min(1, e.armExt + 0.09);
        if (e.armExt >= 1 && e.stT % 10 === 0) { g.emit({ t: 'sfx', n: 'explode_s' }); }
        if (e.stT === 14) { g.fire(e, { x: g.camX + e.armX, y: e.clampY + 1.8, z: 0, spread: [-0.4, 0, 0.4], minDist: 0, force: true }); }
        if (e.stT > 40) { e.st = 'retract'; e.stT = 0; }
      } else if (e.st === 'retract') {
        e.armExt = Math.max(0, e.armExt - 0.04);
        if (e.armExt <= 0) { e.st = 'open'; e.stT = 0; }
      } else if (e.st === 'open') {
        e.shutter = Math.min(1, e.shutter + 0.06);
        if (e.stT % g.fireInterval(hard ? 26 : 36) === 10) {
          g.fire(e, { x: e.x - 1, y: e.y, z: e.z, speed: 5.5, kind: 'homing', r: 0.32, hp: 1, minDist: 0, spread: [-0.6, 0.6] });
        }
        if (e.stT > 130) { e.st = 'shut'; e.stT = 0; }
      } else if (e.st === 'shut') {
        e.shutter = Math.max(0, e.shutter - 0.06);
        if (e.shutter <= 0) { e.st = 'idle'; e.stT = 0; }
      }
    },
    hitboxes(e) { return hitboxesOf(e).filter((h) => h[1] > -9 && h[1] < VIEW_H + 9); },
    onHit: onHitParts, onDeath,
    bossHp: (e) => hpOf(e, ['core']),
  },

  // ===== 5. 生体要塞: HYDRA BRAIN（3 本の触手と、時々開く目） =====
  hydra: {
    name: 'HYDRA BRAIN', base: { ...bossBase, r: 3 },
    init(e) {
      e.st = 'enter'; e.stT = 0; e.eye = 0; e.pulse = 0;
      e.parts = [
        part('brain', 0.8, 0, 2.5, { armor: true }), part('lobeT', 1.6, 2.2, 1.6, { armor: true }), part('lobeB', 1.6, -2.2, 1.6, { armor: true }),
        part('eye', -1.4, 0, 0.9, { hp: 30, weak: true, core: true }),
      ];
      e.parts[3].isOpen = (b) => b.eye > 0.6;
      e.arms = [];
      for (const [base, oy] of [[2.3, 2.4], [Math.PI, 0], [-2.3, -2.4]]) {
        const arm = { base, oy, segs: [] };
        for (let i = 0; i < 8; i++) { const q = part('seg', 0, 0, 0.5 - i * 0.025, { armor: true }); q.free = true; arm.segs.push(q); e.parts.push(q); }
        const tip = part('tip', 0, 0, 0.62, { hp: 10, score: SCORE.medium }); tip.free = true; arm.tip = tip; e.parts.push(tip);
        e.arms.push(arm);
      }
    },
    onPartDown(q) { if (q.name === 'tip') q.deadTip = true; },
    update(e, g) {
      placeParts(e); zFollow(e, g, 0.008);
      // 触手を並べる（根元はボスの体、先端は自機の方へ揺れながら向く）
      e.arms.forEach((arm, k) => {
        let x = e.x - 0.6, y = e.y + arm.oy;
        const alive = arm.tip.alive;
        for (let i = 0; i < arm.segs.length; i++) {
          const a = arm.base + Math.sin(e.t * 0.03 + k * 2 + i * 0.4) * (0.35 + i * 0.05);
          x += Math.cos(a) * 0.85; y += Math.sin(a) * 0.85;
          const q = arm.segs[i]; q.x = x; q.y = y; q.z = e.z; q.alive = alive || i < 3;
        }
        arm.tip.x = x + Math.cos(arm.base) * 0.6; arm.tip.y = y; arm.tip.z = e.z;
      });
      if (enter(e, g, 24)) return;
      e.stT++;
      e.y += (VIEW_H / 2 + Math.sin(e.t * 0.017) * 2.5 - e.y) * 0.03;
      const tips = e.arms.filter((a) => a.tip.alive).length;
      // 触手の先端が狙って撃つ
      for (const arm of e.arms) if (arm.tip.alive && (e.t + arm.base * 50 | 0) % g.fireInterval(80) === 0) g.fire(e, { x: arm.tip.x, y: arm.tip.y, z: arm.tip.z, speed: 7.5 });
      if (e.st === 'idle' && e.stT > (tips ? 120 : 60)) { e.st = e.alt ? 'eye' : 'pulse'; e.alt = !e.alt; e.stT = 0; }
      if (e.st === 'pulse') {
        e.pulse = Math.min(1, e.stT / 40);   // 予告: 体が膨らむ
        if (e.stT === 40) { radial(g, e, tips ? 12 : 16, e.x - 0.5, e.y, e.z, 6.5, 0.4, e.t * 0.1); g.emit({ t: 'sfx', n: 'explode_s' }); }
        if (e.stT === 70 && !tips) radial(g, e, 16, e.x - 0.5, e.y, e.z, 6.5, 0.4, e.t * 0.1 + 0.2);
        if (e.stT > 80) { e.st = 'idle'; e.stT = 0; e.pulse = 0; }
      } else if (e.st === 'eye') {
        e.eye = clamp(e.stT < 20 ? e.stT / 20 : e.stT > 150 ? 1 - (e.stT - 150) / 20 : 1, 0, 1);
        if (e.eye > 0.9 && e.stT % g.fireInterval(30) === 0) g.fire(e, { x: e.x - 1.8, y: e.y, z: e.z, spread: [-0.25, 0, 0.25], speed: 8, minDist: 0 });
        if (e.stT > 170) { e.st = 'idle'; e.stT = 0; e.eye = 0; }
      }
    },
    hitboxes: hitboxesOf, onHit: onHitParts, onDeath,
    bossHp: (e) => hpOf(e, ['eye', 'tip']),
  },

  // ===== 6. 細胞空間: NUCLEUS（再生する膜の輪に守られた核） =====
  nucleus: {
    name: 'NUCLEUS', base: { ...bossBase, r: 3 },
    init(e) {
      e.st = 'enter'; e.stT = 0; e.rot = 0; e.lunge = 0; e.glow = 0;
      e.parts = [part('core', 0, 0, 1.15, { hp: 28, weak: true, core: true })];
      for (let i = 0; i < 18; i++) { const q = part('cell', 0, 0, 0.72, { hp: 3, score: SCORE.tiny }); q.free = true; q.i = i; q.regen = 0; e.parts.push(q); }
    },
    onPartDown(q) { q.regen = 0; },
    update(e, g) {
      e.rot += 0.008;
      for (const q of e.parts) if (q.free) {
        const a = e.rot + q.i / 18 * Math.PI * 2;
        const R = 3.0 + Math.sin(e.t * 0.06 + q.i) * 0.15 + e.glow * 0.3;
        q.x = e.x + Math.cos(a) * R; q.y = e.y + Math.sin(a) * R; q.z = e.z + (g.depth ? Math.sin(a * 2) * 0.8 : 0);
        if (!q.alive && ++q.regen > 380) { q.alive = true; q.hp = q.maxHp; q.regen = 0; }
      }
      placeParts(e); zFollow(e, g, 0.01);
      if (enter(e, g, 23)) return;
      e.stT++;
      const hard = e.parts[0].hp < 14;
      const home = g.camX + 23;
      if (e.st !== 'lunge') { e.x += (home - e.x) * 0.04; e.y += (VIEW_H / 2 + Math.sin(e.t * 0.015) * 3.5 - e.y) * 0.02; }
      const seq = ['pulse', 'spawn', 'lunge', 'pulse'];
      if (e.st === 'idle' && e.stT > (hard ? 45 : 75)) { e.st = seq[(e.seq = (e.seq ?? -1) + 1) % seq.length]; e.stT = 0; }
      if (e.st === 'pulse') {
        e.glow = Math.min(1, e.stT / 40);
        if (e.stT === 40 || (hard && e.stT === 65)) { radial(g, e, 16, e.x, e.y, e.z, 6, 0.32, e.stT * 0.2); g.emit({ t: 'sfx', n: 'explode_s' }); }
        if (e.stT > 80) { e.st = 'idle'; e.stT = 0; e.glow = 0; }
      } else if (e.st === 'spawn') {
        if (e.stT === 20 || e.stT === 50) g.spawn('blob', { x: e.x - 3.5, y: e.y + (e.stT === 20 ? 2 : -2), z: e.z, t: 20 });
        if (e.stT > 70) { e.st = 'idle'; e.stT = 0; }
      } else if (e.st === 'lunge') {
        // 予告（震える 30 tick）→ 自機の方へ突進 → 戻る
        if (e.stT < 30) e.shake = 1;
        else if (e.stT < 60) { e.shake = 0; e.x -= 0.28; e.y += clamp(g.player.y - e.y, -0.1, 0.1); }
        else if (e.stT > 120) { e.st = 'idle'; e.stT = 0; }
      }
    },
    hitboxes: hitboxesOf, onHit: onHitParts, onDeath,
    bossHp: (e) => hpOf(e, ['core']),
  },

  // ===== 7. 機械要塞: OMEGA CORE（砲台の壁 → 回る障壁のコア → 露出した中枢） =====
  omega: {
    name: 'OMEGA CORE', base: { ...bossBase, r: 3 },
    init(e) {
      e.st = 'enter'; e.stT = 0; e.phase = 1; e.rot = 0; e.charge = 0;
      e.parts = [
        part('wall', 2.4, 0, 2.4, { armor: true }), part('wallT', 2.4, 4.4, 2.0, { armor: true }), part('wallB', 2.4, -4.4, 2.0, { armor: true }),
        part('gun', -0.4, 5.6, 0.85, { hp: 10, score: SCORE.medium }), part('gun', -0.4, 2.2, 0.85, { hp: 10, score: SCORE.medium }),
        part('gun', -0.4, -2.2, 0.85, { hp: 10, score: SCORE.medium }), part('gun', -0.4, -5.6, 0.85, { hp: 10, score: SCORE.medium }),
        part('core', 0.4, 0, 1.0, { hp: 30 }),
        part('heart', 0.4, 0, 0.85, { hp: 26, core: true }),
      ];
      e.parts[7].guard = (b) => b.phase < 2;
      e.parts[8].vis = false;
      // 障壁（フェーズ 2 で回る）
      for (let k = 0; k < 2; k++) for (let i = 0; i < 4; i++) { const q = part('bar', 0, 0, 0.5, { armor: true }); q.free = true; q.k = k; q.i = i; q.vis = false; e.parts.push(q); }
    },
    onPartDown(q, g, e) {
      if (q.name === 'gun' && e.parts.filter((p) => p.name === 'gun' && p.alive).length === 0) { e.phase = 2; e.st = 'idle'; e.stT = 0; g.emit({ t: 'phase', n: 2 }); g.emit({ t: 'sfx', n: 'warning' }); }
      if (q.name === 'core') {
        e.phase = 3; e.st = 'idle'; e.stT = 0;
        e.parts[8].vis = true;
        for (const p of e.parts) if (p.name === 'bar') p.vis = false;
        g.emit({ t: 'phase', n: 3 }); g.emit({ t: 'explode', x: q.x, y: q.y, z: q.z, size: 'l' }); g.emit({ t: 'sfx', n: 'boss_explode' });
      }
    },
    update(e, g) {
      placeParts(e);
      const heart = e.parts[8];
      if (e.phase === 3) { heart.free = true; }
      // 障壁
      e.rot += e.phase === 2 ? 0.022 : 0;
      for (const q of e.parts) if (q.name === 'bar') {
        q.vis = e.phase === 2;
        const a = e.rot + q.k * Math.PI, R = 1.7 + q.i * 0.55;
        q.x = e.x + 0.4 + Math.cos(a) * R; q.y = e.y + Math.sin(a) * R; q.z = e.z;
      }
      if (enter(e, g, 25)) return;
      e.stT++;
      if (e.phase === 1) {
        // 砲台が順に撃ち、壁の光線発生器が予告つきで薙ぐ
        e.parts.forEach((q) => { if (q.name === 'gun' && q.alive && (e.t + q.oy * 13 | 0) % g.fireInterval(60) === 0) g.fire(e, { x: q.x - 0.6, y: q.y, z: q.z, speed: 9 }); });
        if (e.st === 'idle' && e.stT > 110) { e.st = 'charge'; e.stT = 0; }
        if (e.st === 'charge') { e.charge = e.stT / 40; if (e.stT > 40) { e.st = 'beam'; e.stT = 0; e.charge = 0; } }
        if (e.st === 'beam') { if (e.stT % 8 === 1) for (const oy of [-3.9, 0, 3.9]) beam(g, e, e.x + 0.5, e.y + oy, e.z, Math.PI, 22, 3); if (e.stT > 30) { e.st = 'idle'; e.stT = 0; } }
      } else if (e.phase === 2) {
        e.y += (VIEW_H / 2 + Math.sin(e.t * 0.015) * 2.2 - e.y) * 0.02;
        // 回る扇状の弾と、狙う 3 連射
        if (e.stT % g.fireInterval(7) === 0) { const a = Math.PI + Math.sin(e.t * 0.035) * 0.9; g.fire(e, { x: e.x - 0.4, y: e.y, z: e.z, ang: a, speed: 7.5, minDist: 0, force: true }); }
        if (e.stT % g.fireInterval(90) === 45) g.fire(e, { x: e.x - 0.4, y: e.y, z: e.z, spread: [-0.12, 0, 0.12], speed: 10, minDist: 0 });
      } else {
        // 露出した中枢: 8 の字に動き、放射弾と小型機
        const k = e.stT * 0.018;
        heart.x = g.camX + 20 + Math.sin(k) * 5; heart.y = VIEW_H / 2 + Math.sin(k * 2) * 5; heart.z = g.depth ? Math.sin(k * 1.5) * 1.8 : 0;
        if (e.stT % g.fireInterval(70) === 35) radial(g, e, 14, heart.x, heart.y, heart.z, 6.5, 0.3, e.stT * 0.05);
        if (e.stT % 160 === 80) for (const d of [-1, 1]) g.spawn('drone', { x: heart.x, y: heart.y, z: heart.z, dir: d, t: 40 });
      }
    },
    hitboxes: hitboxesOf, onHit: onHitParts, onDeath,
    bossHp: (e) => e.phase === 1 ? hpOf(e, ['gun']) : e.phase === 2 ? hpOf(e, ['core']) : hpOf(e, ['heart']),
    forceKill(e, g) { g.kill(e); },
  },
};
