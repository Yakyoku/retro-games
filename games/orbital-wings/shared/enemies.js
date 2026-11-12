// 敵の動き（ステージ道中）。すべて tick 単位・決定的。
// 各定義: base（初期値）, init(e,g), update(e,g), hitboxes(e,g)?, onDeath(e,g,byPlayer)?, onHit?
import { TICK, VIEW_W, VIEW_H, DEPTH, SCORE } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const T = TICK;
// 望む速度へ加速度の上限つきで近づける（曲がる動きが折れ線にならない）
export function steer(e, tvx, tvy, acc) {
  const a = acc * T * T;
  const dx = tvx - e.vx, dy = tvy - e.vy, d = Math.hypot(dx, dy);
  if (d <= a) { e.vx = tvx; e.vy = tvy; } else { e.vx += dx / d * a; e.vy += dy / d * a; }
}
const move = (e) => { e.x += e.vx; e.y += e.vy; e.z += e.vz || 0; };
const face = (e) => { if (Math.hypot(e.vx, e.vy) > 1e-4) e.ang = Math.atan2(e.vy, e.vx); };
const sx = (e, g) => e.x - g.camX;               // 画面上の x
const aimAng = (e, g) => Math.atan2(g.player.y - e.y, g.player.x - e.x);
const zTo = (e, g, k) => { if (g.depth) e.z += clamp(g.player.z - e.z, -k, k); };

// 地形に据え付ける敵の y（床なら床の上、天井なら天井の下）
function anchorY(e, g, off) {
  if (e.anchor === 'f') return g.floorAt(e.x) + off;
  return g.ceilAt(e.x) - off;
}

export const ENEMY = {
  // ---- 小型編隊機（100 点）。pat で動きが変わる ----------------------------------
  dart: {
    base: { r: 0.55, hp: 1, score: SCORE.small },
    init(e) { e.vx = -(e.speed ?? 8) * T; e.vy = 0; e.phase = 0; e.baseY = e.y; },
    update(e, g) {
      const pat = e.pat || 'line';
      const s = (e.speed ?? 8) * T;
      if (e.delay > 0) { e.delay--; e.x += g.scrollD; e.px = e.x; return; }
      if (pat === 'line') { /* そのまま */ }
      else if (pat === 'wave') { e.vy = Math.cos((e.t + (e.ph || 0)) * 0.06) * (e.amp ?? 2.4) * 0.06; }
      else if (pat === 'swoop') {
        // 入ってきて自機の高さへ曲がり、来た方へ引き返す
        if (e.phase === 0 && sx(e, g) < (e.turnX ?? 14)) e.phase = 1;
        if (e.phase === 1) {
          const ty = g.player.y;
          steer(e, -s * 0.2, clamp((ty - e.y) * 0.08, -1, 1) * s * 1.2, 40);
          if (Math.abs(ty - e.y) < 0.6 || e.t > 400) { e.phase = 2; e.fireOk = true; }
        } else if (e.phase === 2) steer(e, s * 1.3, 0, 30);
      } else if (pat === 'loop') {
        if (e.phase === 0 && sx(e, g) < (e.turnX ?? 18)) { e.phase = 1; e.la = 0; }
        if (e.phase === 1) {
          e.la += 0.055;
          const R = 2.6 * 0.055;
          e.vx = -Math.cos(e.la) * s; e.vy = Math.sin(e.la) * R * (e.dir || 1) * 7.5;
          if (e.la > Math.PI * 2) e.phase = 2;
        }
        if (e.phase === 2) steer(e, -s * 1.2, 0, 30);
      } else if (pat === 'chase') {
        // 後ろ（左）から来て追い越し、自機の高さで引き返す
        if (e.phase === 0) { steer(e, s * 1.2, clamp((g.player.y - e.y) * 0.04, -0.5, 0.5) * s, 25); if (sx(e, g) > (e.turnX ?? 24)) e.phase = 1; }
        else steer(e, -s * 1.1, clamp((g.player.y - e.y) * 0.05, -0.6, 0.6) * s, 30);
      } else if (pat === 'dive') {
        // 上下から飛び込み、自機の手前で横へ
        if (e.phase === 0) { if (Math.abs(e.y - g.player.y) < 1.2 || sx(e, g) < 10) e.phase = 1; }
        else steer(e, -s * 1.3, 0, 45);
      }
      move(e); face(e);
      if (g.depth && e.zt !== undefined) e.z += (e.zt - e.z) * 0.02;
      if (e.shoot && e.t > 30 && (e.t + e.id * 13) % g.fireInterval(e.shoot) === 0) g.fire(e);
    },
  },

  // ---- 回転しながら上下に跳ねる小型機 ---------------------------------------------
  wheel: {
    base: { r: 0.6, hp: 1, score: SCORE.small },
    init(e) { e.vx = -(e.speed ?? 6) * T; e.vy = (e.dir ?? 1) * 5 * T; },
    update(e, g) {
      const lo = g.floorAt(e.x) + 0.8, hi = g.ceilAt(e.x) - 0.8;
      if (e.y < Math.max(lo, 0.8)) { e.y = Math.max(lo, 0.8); e.vy = Math.abs(e.vy); }
      if (e.y > Math.min(hi, VIEW_H - 0.8)) { e.y = Math.min(hi, VIEW_H - 0.8); e.vy = -Math.abs(e.vy); }
      move(e); e.spin = (e.spin || 0) + 0.2;
      if (g.depth) e.z = Math.sin(e.t * 0.03 + e.id) * 1.6;
    },
  },

  // ---- 地上・天井の砲台（200 点）。砲身が自機を向き、狙って撃つ -----------------------
  turret: {
    base: { r: 0.62, hp: 2, score: SCORE.turret, keep: true },
    init(e, g) { e.y = anchorY(e, g, 0.55); e.aim = e.anchor === 'f' ? Math.PI / 2 : -Math.PI / 2; },
    update(e, g) {
      e.y = anchorY(e, g, 0.55);
      const want = aimAng(e, g);
      // 床の砲台は上半分、天井は下半分しか向けない
      const lo = e.anchor === 'f' ? 0.05 : -Math.PI + 0.05, hi = e.anchor === 'f' ? Math.PI - 0.05 : -0.05;
      const tgt = clamp(want, lo, hi);
      e.aim += clamp(tgt - e.aim, -0.06, 0.06);
      const iv = g.fireInterval(e.rate ?? 120);
      if ((e.t + e.id * 17) % iv === 0) g.fire(e, { ang: e.aim, x: e.x + Math.cos(e.aim) * 0.7, y: e.y + Math.sin(e.aim) * 0.7, sfx: null });
      if (e.x < g.camX - 3) g.escape(e);
    },
  },

  // ---- 床を歩く二脚（200 点）。跳んで撃つ ----------------------------------------
  walker: {
    base: { r: 0.7, hp: 2, score: SCORE.turret, anchor: 'f', keep: true },
    init(e, g) { e.y = g.floorAt(e.x) + 0.8; e.jump = 0; e.vyj = 0; e.walk = 0; },
    update(e, g) {
      const p = g.player;
      const dir = p.x < e.x ? -1 : 1;
      e.vx += clamp(dir * 3.2 * T - e.vx, -0.004, 0.004);
      e.x += e.vx;
      e.walk += Math.abs(e.vx) * 3;
      const ground = (e.anchor === 'f') ? g.floorAt(e.x) + 0.8 : g.ceilAt(e.x) - 0.8;
      if (e.jump > 0) { e.y += e.vyj; e.vyj -= (e.anchor === 'f' ? 1 : -1) * 22 * T * T; e.jump++;
        if ((e.anchor === 'f' && e.y <= ground) || (e.anchor === 'c' && e.y >= ground)) { e.y = ground; e.jump = 0; e.land = 12; } }
      else { e.y = ground; if (e.land > 0) e.land--; }
      if (e.jump === 0 && (e.t + e.id * 7) % g.fireInterval(150) === 0 && e.t > 40) {
        e.crouch = 12;
      }
      if (e.crouch > 0 && --e.crouch === 0) { e.jump = 1; e.vyj = (e.anchor === 'f' ? 1 : -1) * 9 * T; g.fire(e, { spread: [0] }); }
      if (e.x < g.camX - 3) g.escape(e);
    },
  },

  // ---- ハッチ（500 点）。開いて小型機を出す ---------------------------------------
  hatch: {
    base: { r: 1.05, hp: 10, score: SCORE.medium, keep: true },
    init(e, g) { e.y = anchorY(e, g, 0.7); e.open = 0; e.made = 0; },
    update(e, g) {
      e.y = anchorY(e, g, 0.7);
      const cyc = (e.t + e.id * 11) % 170;
      e.open = cyc > 110 ? Math.min(1, (cyc - 110) / 15) : Math.max(0, e.open - 0.08);
      if (g.onScreen(e.x, e.y, -1) && cyc === 140 && e.made < (e.max ?? 9)) {
        for (let k = 0; k < 3; k++) {
          g.spawn('drone', { x: e.x, y: e.y + (e.anchor === 'f' ? 0.8 : -0.8), z: e.z, dir: e.anchor === 'f' ? 1 : -1, delay: k * 9, color: e.color });
          e.made++;
        }
      }
      if (e.x < g.camX - 3) g.escape(e);
    },
  },
  drone: {
    base: { r: 0.48, hp: 1, score: SCORE.small },
    init(e) { e.vy = e.dir * 7 * T; e.vx = 0; e.phase = 0; },
    update(e, g) {
      if (e.delay > 0) { e.delay--; e.ghost = true; e.x += 0; return; }
      e.ghost = false;
      const s = 7.5 * T;
      if (e.phase === 0) { steer(e, 0, e.dir * s, 50); if (Math.abs(e.y - g.player.y) < 0.8 || e.t > 70) e.phase = 1; }
      else steer(e, -s * 1.2, 0, 35);
      move(e); face(e); zTo(e, g, 0.03);
    },
  },

  // ---- 火山の岩（壊せる。大きい岩は割れる） --------------------------------------
  rock: {
    base: { r: 0.7, hp: 2, score: SCORE.small },
    init(e) { e.spin = 0; e.r = e.big ? 1.25 : e.r; e.hp = e.big ? 6 : e.hp; if (e.big) e.score = SCORE.turret; },
    update(e, g) {
      e.vy -= (e.grav ?? 7) * T * T;
      move(e); e.spin += 0.05 * (e.id % 2 ? 1 : -1);
      if (e.vy < 0 && e.y < g.floorAt(e.x) + e.r * 0.5 && e.t > 20) g.kill(e, false);
    },
    onDeath(e, g, by) {
      if (e.big && by) for (let k = -1; k <= 1; k++) g.spawn('rock', { x: e.x, y: e.y, z: e.z, vx: (-2 + k * 2.5) * T, vy: (3 + Math.abs(k)) * T, color: e.color });
    },
  },
  // 噴火口（見えない発生源）。画面内にある間、岩を噴き上げる
  vent: {
    base: { r: 0.1, hp: 1, harm: false, ghost: true, keep: true },
    init(e, g) { e.y = e.anchor === 'c' ? g.ceilAt(e.x) : g.floorAt(e.x); },
    update(e, g) {
      if (!g.onScreen(e.x, VIEW_H / 2, 2)) { if (e.x < g.camX - 3) g.escape(e); return; }
      const iv = g.fireInterval(e.rate ?? 28);
      if (e.t % iv === 0 && e.t > 20 && (e.count ?? 0) < (e.max ?? 40)) {
        e.count = (e.count ?? 0) + 1;
        const up = e.anchor === 'c' ? -1 : 1;
        const vx = g.rng.range(-4.5, 2.5) * T, vy = up * g.rng.range(9, 13) * T;
        g.spawn('rock', { x: e.x + g.rng.range(-0.6, 0.6), y: e.y + up * 0.5, z: g.depth ? g.rng.range(-2, 2) : 0, vx, vy, grav: up * 7, big: g.rng() < 0.18, color: e.color });
      }
      g.emit({ t: 'vent', x: e.x, y: e.y, up: e.anchor === 'c' ? -1 : 1, quiet: true });
    },
  },

  // ---- 中型機（500 点）。止まって 3 方向に撃ち、去る ---------------------------------
  heavy: {
    base: { r: 1.25, hp: 12, score: SCORE.medium },
    init(e) { e.vx = -7 * T; e.vy = 0; e.phase = 0; e.stopX = e.stopX ?? 22; },
    update(e, g) {
      if (e.phase === 0) { steer(e, 0, 0, sx(e, g) < e.stopX + 4 ? 9 : 0); if (Math.abs(e.vx) < 0.002) { e.phase = 1; e.hold = 0; } }
      else if (e.phase === 1) {
        e.hold++;
        e.vx = -g.scrollD * 0 ; e.x += g.scrollD;   // 画面に対して止まる
        e.vy = Math.sin(e.hold * 0.05) * 0.02;
        if (e.hold % g.fireInterval(70) === 40) g.fire(e, { spread: [-0.3, 0, 0.3], speed: 8 });
        if (e.hold > 300) e.phase = 2;
      } else steer(e, -9 * T, 0, 10);
      if (e.phase !== 1) e.x += 0;
      move(e); zTo(e, g, 0.01);
    },
  },

  // ---- 遺跡: 壊せる石材（50 点）。ぶつかると被弾、弾を止める ------------------------
  brick: {
    base: { r: 0.85, hp: 3, score: SCORE.block, keep: true, solid: true },
    update(e, g) { if (e.x < g.camX - 3) g.escape(e); },
    hitboxes(e) { return [[e.x, e.y, e.z, e.r, 0, 3]]; },
  },
  // 遺跡: 地面から顔を出して撃つ待ち伏せ（200 点）。出ている間だけ当たる
  popper: {
    base: { r: 0.65, hp: 2, score: SCORE.turret, keep: true },
    init(e, g) { e.rise = 0; e.base = anchorY(e, g, 0); },
    update(e, g) {
      e.base = anchorY(e, g, 0);
      const near = Math.abs(g.player.x - e.x) < 11;
      const cyc = (e.t + e.id * 5) % 160;
      const up = near && cyc < 100;
      e.rise = clamp(e.rise + (up ? 0.06 : -0.05), 0, 1);
      const dir = e.anchor === 'f' ? 1 : -1;
      e.y = e.base + dir * (-0.3 + e.rise * 1.0);
      e.ghost = e.rise < 0.35;
      if (e.rise >= 1 && cyc % g.fireInterval(45) === 30) g.fire(e, { spread: [-0.12, 0.12] });
      if (e.x < g.camX - 3) g.escape(e);
    },
  },

  // ---- 巨大石像の顔（500 点）。口を開けてリング弾。口の中だけが弱点 --------------------
  stonehead: {
    base: { r: 1.6, hp: 14, score: SCORE.medium, keep: true },
    init(e, g) { e.y = anchorY(e, g, 1.9); e.mouth = 0; },
    update(e, g) {
      e.y = anchorY(e, g, 1.9);
      const cyc = (e.t + e.id * 23) % g.fireInterval(200);
      // 口を開く前に震える（予告）
      e.shake = cyc > 90 && cyc < 120 ? 1 : 0;
      e.mouth = clamp(e.mouth + (cyc >= 120 && cyc < 190 ? 0.08 : -0.06), 0, 1);
      if (e.mouth > 0.9 && cyc % 12 === 0) {
        const m = this.mouthPos(e);
        if (g.fire(e, { x: m[0], y: m[1], z: e.z, speed: 6.5, kind: 'ring', r: 0.42, hp: 1, sfx: 'ring', minDist: 2 })) {}
      }
      if (e.x < g.camX - 4) g.escape(e);
    },
    mouthPos(e) { const dir = e.anchor === 'f' ? 1 : -1; return [e.x - 1.15, e.y - dir * 0.35, e.z]; },
    hitboxes(e) {
      const m = this.mouthPos(e), dir = e.anchor === 'f' ? 1 : -1;
      return [
        [e.x, e.y + dir * 0.4, e.z, 1.55, 0, 3],          // 頭（装甲・接触で被弾）
        [m[0], m[1], m[2], 0.6, 1, e.mouth > 0.5 ? 2 : 3], // 口
      ];
    },
    onHit(e, g, dmg, part, hx, hy, hz) {
      if (part === 1 && e.mouth > 0.5) { e.hp -= dmg; e.flash = 1; if (e.hp <= 0) g.kill(e); else g.emit({ t: 'sfx', n: 'enemy_hit' }); }
      else g.emit({ t: 'spark', x: hx, y: hy, z: hz, armor: true });
    },
  },
  // 石像の頭部から転がり出る小さな顔（飛ぶ）
  pebble: {
    base: { r: 0.6, hp: 2, score: SCORE.small },
    init(e) { e.vx = -6 * T; e.vy = (e.dir || 1) * 3 * T; },
    update(e, g) { steer(e, -6 * T, clamp(g.player.y - e.y, -1, 1) * 3 * T, 12); move(e); e.spin = (e.spin || 0) + 0.08; zTo(e, g, 0.02); },
  },

  // ---- 地形の難所: 天井・床から伸び縮みする押しつぶし柱（壊れない） ------------------------
  piston: {
    base: { r: 1.2, hp: 1, harm: true, armor: true, solid: true, keep: true, score: 0 },
    init(e, g) { e.ext = 0; e.w = e.w ?? 1.2; e.maxExt = e.maxExt ?? 7; e.root = e.anchor === 'f' ? g.floorAt(e.x) : g.ceilAt(e.x); },
    update(e, g) {
      const per = e.period ?? 150, cyc = (e.t + (e.phase0 ?? 0)) % per;
      // 伸びる前に 30 tick 震える（予告）→ 速く伸びる → しばらく止まる → ゆっくり戻る
      e.warn = cyc < 30 ? 1 : 0;
      const tgt = cyc < 30 ? 0.08 : cyc < 45 ? (cyc - 30) / 15 : cyc < 90 ? 1 : Math.max(0, 1 - (cyc - 90) / 50);
      e.ext = tgt;
      const dir = e.anchor === 'f' ? 1 : -1;
      e.len = 1 + e.ext * e.maxExt;
      e.y = e.root + dir * e.len / 2;
      if (e.x < g.camX - 4) g.escape(e);
    },
    hitboxes(e) {
      const out = [], dir = e.anchor === 'f' ? 1 : -1;
      const n = Math.max(1, Math.ceil(e.len / 1.1));
      for (let i = 0; i < n; i++) {
        const yy = e.root + dir * (0.55 + i * (e.len - 0.55) / Math.max(1, n - 1 || 1));
        out.push([e.x, Math.min(Math.max(yy, -5), 25), e.z, e.w * 0.95, 0, 3]);
      }
      return out;
    },
  },

  // ---- 生体要塞: 触手（500 点）。節は壊れず、先端だけ壊せる -------------------------------
  tentacle: {
    base: { r: 0.7, hp: 8, score: SCORE.medium, keep: true },
    init(e, g) {
      e.n = e.n ?? 9; e.seg = 0.75;
      e.root = { x: e.x, y: e.anchor === 'f' ? g.floorAt(e.x) : g.ceilAt(e.x) };
      e.parts = []; for (let i = 0; i < e.n; i++) e.parts.push({ x: e.x, y: e.root.y, z: e.z, px: e.x, py: e.root.y, pz: e.z });
      e.baseAng = e.anchor === 'f' ? Math.PI / 2 : -Math.PI / 2;
      this.layout(e, g);
    },
    layout(e, g) {
      const p = g.player;
      let a = e.baseAng, x = e.root.x, y = e.root.y;
      const lean = clamp(Math.atan2(p.y - y, p.x - x) - e.baseAng, -1.1, 1.1);
      for (let i = 0; i < e.n; i++) {
        const k = i / e.n;
        a = e.baseAng + Math.sin(e.t * 0.035 + i * 0.45 + e.id) * 0.32 * (0.4 + k) + lean * 0.55 * k * (e.t > 40 ? 1 : 0);
        x += Math.cos(a) * e.seg; y += Math.sin(a) * e.seg;
        const q = e.parts[i]; q.x = x; q.y = y; q.z = e.z; q.a = a;
      }
      const tip = e.parts[e.n - 1]; e.x = tip.x; e.y = tip.y;
    },
    update(e, g) {
      this.layout(e, g);
      if ((e.t + e.id * 9) % g.fireInterval(130) === 0) g.fire(e, { spread: [-0.2, 0, 0.2], speed: 7.5 });
      if (e.root.x < g.camX - 4) g.escape(e);
    },
    hitboxes(e) {
      const out = [];
      for (let i = 0; i < e.n - 1; i++) { const q = e.parts[i]; out.push([q.x, q.y, q.z, 0.42 + 0.18 * (1 - i / e.n), 1, 3]); }
      out.push([e.x, e.y, e.z, 0.68, 0, 2 | 1]);
      return out;
    },
    onHit(e, g, dmg, part, hx, hy, hz) {
      if (part !== 0) { g.emit({ t: 'spark', x: hx, y: hy, z: hz, armor: true }); return; }
      e.hp -= dmg; e.flash = 1; if (e.hp <= 0) g.kill(e); else g.emit({ t: 'sfx', n: 'enemy_hit' });
    },
    onDeath(e, g) { for (const q of e.parts) g.emit({ t: 'explode', x: q.x, y: q.y, z: q.z, size: 's', kind: 'flesh', quiet: true }); },
  },
  // 胞子（漂う小型）
  spore: {
    base: { r: 0.5, hp: 1, score: SCORE.small },
    init(e) { e.vx = -(e.speed ?? 4.5) * T; e.ph = e.id * 0.7; },
    update(e, g) { e.vy = Math.sin(e.t * 0.05 + e.ph) * 0.05; steer(e, -(e.speed ?? 4.5) * T, e.vy, 30); move(e); zTo(e, g, 0.01);
      if (e.t > 50 && (e.t + e.id * 31) % g.fireInterval(220) === 0) g.fire(e, { speed: 6 }); },
  },
  // 生体の袋（ハッチの生き物版）は hatch を使い、描画で見た目を変える

  // ---- 細胞空間: 再生する膜の壁。細胞を撃ち抜いて道を開ける -------------------------------
  membrane: {
    base: { r: 0.7, hp: 2, score: 0, keep: true, solid: true },
    init(e, g) {
      const lo = Math.max(0, g.floorAt(e.x)), hi = Math.min(VIEW_H, g.ceilAt(e.x));
      e.cells = [];
      for (let y = lo + 0.7; y < hi - 0.3; y += 1.3) e.cells.push({ y, hp: 2, regen: 0, z: 0 });
      if (g.depth) { const extra = []; for (const c of e.cells) for (const z of [-1.6, 1.6]) extra.push({ y: c.y, hp: 2, regen: 0, z }); e.cells.push(...extra); }
    },
    update(e, g) {
      for (const c of e.cells) if (c.hp <= 0 && ++c.regen > (e.regenT ?? 300)) { c.hp = 2; c.regen = 0; c.grow = 0; }
      for (const c of e.cells) if (c.hp > 0 && c.grow !== undefined && c.grow < 1) c.grow = Math.min(1, c.grow + 0.04);
      if (e.x < g.camX - 3) g.escape(e);
    },
    hitboxes(e) {
      const out = [];
      e.cells.forEach((c, i) => { if (c.hp > 0) out.push([e.x + Math.sin(c.y * 1.7 + e.t * 0.05) * 0.12, c.y, c.z, 0.7 * (c.grow ?? 1), i, 3]); });
      return out;
    },
    onHit(e, g, dmg, part, hx, hy, hz) {
      const c = e.cells[part]; if (!c || c.hp <= 0) return;
      c.hp -= dmg; e.flash = 1;
      if (c.hp <= 0) { c.regen = 0; g.score += SCORE.tiny; g.emit({ t: 'explode', x: hx, y: hy, z: hz, size: 's', kind: 'cell', quiet: true }); g.emit({ t: 'sfx', n: 'explode_s' }); }
    },
  },
  // 細胞: 撃つと 2 つに分かれる
  blob: {
    base: { r: 0.85, hp: 3, score: SCORE.small },
    init(e) { e.vx = -3.5 * T; e.vy = 0; if (e.small) { e.r = 0.45; e.hp = 1; } },
    update(e, g) {
      const p = g.player;
      steer(e, -3.5 * T + (p.x < e.x ? -0.5 : 0.5) * T, clamp(p.y - e.y, -1, 1) * 2.2 * T, 6);
      move(e); zTo(e, g, 0.012);
    },
    onDeath(e, g, by) { if (!e.small && by) for (const d of [-1, 1]) g.spawn('blob', { x: e.x, y: e.y + d * 0.6, z: e.z, small: true, vx: -2 * T, vy: d * 3 * T }); },
  },

  // ---- 機械要塞 -------------------------------------------------------------------
  // シャッター（壊せる金属の板。50 点）
  shutter: {
    base: { r: 0.8, hp: 5, score: SCORE.block, keep: true, solid: true },
    update(e, g) { if (e.x < g.camX - 3) g.escape(e); },
    hitboxes(e) { return [[e.x, e.y, e.z, e.r, 0, 3]]; },
  },
  // 壁の大砲（500 点）。3 連射
  cannon: {
    base: { r: 1.0, hp: 10, score: SCORE.medium, keep: true },
    init(e, g) { e.y = anchorY(e, g, 0.9); e.aim = Math.PI; },
    update(e, g) {
      e.y = anchorY(e, g, 0.9);
      const want = aimAng(e, g);
      let d = want - e.aim; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      e.aim += clamp(d, -0.04, 0.04);
      const cyc = (e.t + e.id * 13) % g.fireInterval(150);
      e.charge = cyc > 100 && cyc < 120 ? 1 : 0;
      if (cyc === 120 || cyc === 128 || cyc === 136) g.fire(e, { ang: e.aim, x: e.x + Math.cos(e.aim) * 1.1, y: e.y + Math.sin(e.aim) * 1.1, speed: 10 });
      if (e.x < g.camX - 3) g.escape(e);
    },
  },
  // 光線発生器（床と天井の対）。予告の細い線のあと、光の柱
  zapper: {
    base: { r: 0.75, hp: 6, score: SCORE.turret, keep: true },
    init(e, g) { e.y0 = g.floorAt(e.x) + 0.6; e.y1 = g.ceilAt(e.x) - 0.6; e.y = e.y0; e.beam = 0; e.warn = 0; },
    update(e, g) {
      e.y0 = g.floorAt(e.x) + 0.6; e.y1 = g.ceilAt(e.x) - 0.6; e.y = e.y0;
      const cyc = (e.t + (e.phase0 ?? 0)) % g.fireInterval(180);
      e.warn = cyc >= 60 && cyc < 110 ? 1 : 0;
      e.beam = cyc >= 110 && cyc < 150 ? 1 : 0;
      if (cyc === 110) g.emit({ t: 'sfx', n: 'laser' });
      if (e.x < g.camX - 3) g.escape(e);
    },
    hitboxes(e) {
      const out = [[e.x, e.y0, e.z, 0.75, 0, 3], [e.x, e.y1, e.z, 0.75, 0, 3]];
      if (e.beam) for (let y = e.y0 + 1; y < e.y1 - 0.5; y += 0.6) out.push([e.x, y, e.z, 0.32, 9, 2]);
      return out;
    },
    onHit(e, g, dmg, part, hx, hy, hz) { if (part === 9) return; e.hp -= dmg; e.flash = 1; if (e.hp <= 0) g.kill(e); else g.emit({ t: 'sfx', n: 'enemy_hit' }); },
  },
  // 上下に動く壁（壊れない）
  slider: {
    base: { r: 1.0, hp: 1, armor: true, solid: true, keep: true, score: 0 },
    init(e) { e.y0 = e.y; },
    update(e, g) { e.y = e.y0 + Math.sin((e.t + (e.phase0 ?? 0)) * (e.freq ?? 0.025)) * (e.amp ?? 3.5); if (e.x < g.camX - 4) g.escape(e); },
    hitboxes(e) { const out = []; const h = e.h ?? 3; for (let k = -h / 2 + 0.5; k <= h / 2 - 0.5 + 1e-6; k += 1) out.push([e.x, e.y + k, e.z, 0.95, 0, 3]); return out; },
  },
};
