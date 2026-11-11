// VOIDBLOOM — 雑魚敵の定義（名前・造形はすべてオリジナル。設定資料は CLAUDE.md）
// 各定義: hp, r（当たり半径 u）, score, anchored（地形に固定）, color（爆発色）, init(e,s,sp), update(e,s), onDeath(e,s)
import { DT, FIELD_W, FIELD_H, aim, fireBullet, aimAngle, rand, floorAt, ceilAt, spawnEnemy } from './game-core.js';

// 舵取り: 望む速度へ、加速度の上限つきで近づく（速度が一瞬で変わらない → 動きが弧を描く）
function steer(e, dvx, dvy, maxAcc) {
  let ax = dvx - e.vx, ay = dvy - e.vy; const m = Math.hypot(ax, ay), lim = maxAcc * DT;
  if (m > lim) { ax *= lim / m; ay *= lim / m; }
  e.vx += ax; e.vy += ay;
}
const fireOK = (s, e) => s.player.alive && s.mode === 'play' && e.x > 3 && e.x < FIELD_W - 1;

export const ENEMY = {
  // ドリフトリング: 群れで波打って飛ぶ小さな胞子殻
  drifter: {
    name: 'DRIFTLING', ja: 'ドリフトリング', hp: 1, r: 0.45, score: 100, color: 'bio',
    init(e, s, sp) { e.baseY = e.y; e.amp = sp.amp ?? 2.2; e.freq = sp.freq ?? 0.055; e.vx = -(sp.spd ?? 5.6); e.ph = sp.ph ?? 0; },
    update(e, s) {
      e.x += e.vx * DT;
      e.y = e.baseY + e.amp * Math.sin(e.t * e.freq + e.ph);
      if (fireOK(s, e) && rand(s) < 0.0025 * s.rank) aim(s, e, 7.5);
    },
  },
  // フックジョー: 背後から現れ、追い越してから向きを変えて噛みつきに来る
  hookjaw: {
    name: 'HOOKJAW', ja: 'フックジョー', hp: 2, r: 0.5, score: 200, color: 'w',
    init(e, s, sp) { e.y = sp.y ?? (3 + rand(s) * (FIELD_H - 6)); e.vx = 12; e.vy = 0; e.turn = false; e.keep = true; },
    update(e, s) {
      const p = s.player;
      if (!e.turn && (e.x > Math.min(FIELD_W - 4, p.x + 6) || e.t > 110)) { e.turn = true; e.turnT = e.t; }
      if (!e.turn) steer(e, 12, 0, 30);
      else {
        // 追い越したあと、減速しながら弧を描いて U ターン（上下は自機の高さへ寄せる）
        steer(e, -11, Math.max(-8, Math.min(8, (p.y - e.y) * 1.4)), 26);
        if (e.t - e.turnT === 26 && fireOK(s, e)) aim(s, e, 8);
      }
      e.x += e.vx * DT; e.y += e.vy * DT;
      if (e.turn && e.x < -2) e.dead = true;
      if (e.t > 900) e.dead = true;
    },
  },
  // ランタン: アイテムを抱えて漂う運び屋
  lantern: {
    name: 'LANTERN', ja: 'ランタン', hp: 3, r: 0.65, score: 300, color: 'am',
    init(e, s, sp) { e.baseY = e.y; e.vx = -(sp.spd ?? 3.2); e.drop = e.drop || 'C'; },
    update(e, s) {
      e.x += e.vx * DT; e.y = e.baseY + Math.sin(e.t * 0.035) * 0.9;
      if (fireOK(s, e) && e.t % 110 === 60 && s.rank > 1) aim(s, e, 7);
    },
  },
  // ノジュール: 床・天井にこびりついた砲台
  nodule: {
    name: 'NODULE', ja: 'ノジュール', hp: 4, r: 0.55, score: 200, anchored: true, color: 'w',
    init(e, s, sp) { e.cd = 50 + Math.floor(rand(s) * 60); e.ang = Math.PI; },
    update(e, s) {
      const a = aimAngle(s, e.x, e.y);
      e.ang = a;
      const ok = e.flip ? Math.sin(a) < 0.15 : Math.sin(a) > -0.15;
      if (--e.cd <= 0) { e.cd = Math.round(100 / s.rank); if (fireOK(s, e) && ok) aim(s, e, 7.2, 0, 'orb', Math.cos(a) * 0.5, Math.sin(a) * 0.5); }
    },
  },
  // スティルター: 床を歩き、ときどき跳ねて上へ 3 方向に撃つ
  stilter: {
    name: 'STILTER', ja: 'スティルター', hp: 6, r: 0.8, score: 400, anchored: true, color: 'w',
    init(e, s, sp) { e.vy = 0; e.air = false; e.cd = 90; e.wv = 0; e.crouch = 0; e.land = 0; },
    update(e, s) {
      const p = s.player;
      // 歩く速さは加速度つき（向きを変えるときに一度止まってから歩き出す）
      const want = e.crouch > 0 || e.land > 0 ? 0 : (p.x < e.x ? -1.6 : 1.6);
      e.wv += Math.max(-0.07, Math.min(0.07, want - e.wv));
      e.x += e.wv * DT;
      const wx = e.x + s.scrollX;
      const fl = (e.flip ? ceilAt(s.stage, wx) - 0.9 : floorAt(s.stage, wx) + 0.9);
      if (e.land > 0) e.land--;
      if (e.air) {
        e.vy += (e.flip ? 22 : -22) * DT; e.y += e.vy * DT;
        if ((!e.flip && e.y <= fl) || (e.flip && e.y >= fl)) { e.y = fl; e.air = false; e.vy = 0; e.land = 12; }
      } else e.y = fl;
      // 跳ぶ前に 12 tick しゃがむ（予備動作）。跳んだ瞬間に撃つ
      if (e.crouch > 0 && --e.crouch === 0) {
        e.air = true; e.vy = e.flip ? -9 : 9;
        if (fireOK(s, e)) for (const o of [-0.3, 0, 0.3]) aim(s, e, 6.5, o, 'orb', 0, e.flip ? -0.6 : 0.6);
      }
      if (--e.cd <= 0) {
        e.cd = Math.round(130 / s.rank);
        if (!e.air && rand(s) < 0.5) e.crouch = 12;
        else if (fireOK(s, e)) for (const o of [-0.3, 0, 0.3]) aim(s, e, 6.5, o, 'orb', 0, e.flip ? -0.6 : 0.6);
      }
    },
  },
  // パフ: ふくらんだ胞子袋。壊すと 4 つの小胞子に割れる
  puff: {
    name: 'PUFF', ja: 'パフ', hp: 8, r: 0.9, score: 300, color: 'bio',
    init(e, s, sp) { e.baseY = e.y; e.vx = -(sp.spd ?? 2.4); },
    update(e, s) { e.x += e.vx * DT; e.y = e.baseY + Math.sin(e.t * 0.02) * 1.4; },
    onDeath(e, s) {
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + k * Math.PI / 2;
        const c = spawnEnemy(s, { type: 'spore' }, 0, { x: e.x, y: e.y });
        c.vx = Math.cos(a) * 6; c.vy = Math.sin(a) * 6;
      }
    },
  },
  spore: {
    name: 'SPORE', ja: '小胞子', hp: 1, r: 0.3, score: 50, color: 'bio',
    init(e) { e.vx = -4; e.vy = 0; },
    update(e, s) {
      const p = s.player;
      if (e.t > 20) { const a = Math.atan2(p.y - e.y, p.x - e.x); e.vx += Math.cos(a) * 0.12; e.vy += Math.sin(a) * 0.12; }
      const v = Math.hypot(e.vx, e.vy), m = 6.5; if (v > m) { e.vx *= m / v; e.vy *= m / v; }
      e.x += e.vx * DT; e.y += e.vy * DT;
      if (e.t > 600) e.dead = true;
    },
  },
  // コイルワーム: 9 節の体で蛇行する。頭だけが弱点、胴は弾を止める
  coilworm: {
    name: 'COILWORM', ja: 'コイルワーム', hp: 22, r: 0.7, score: 2000, color: 'bio',
    init(e, s, sp) {
      e.baseY = e.y; e.vx = -(sp.spd ?? 4.2); e.hist = []; e.keep = true;
      e.parts = [{ ox: 0, oy: 0, r: 0.72, kind: 'weak', active: true }];
      for (let k = 0; k < 9; k++) e.parts.push({ ox: 0, oy: 0, r: 0.6 - k * 0.025, kind: 'solid' });
    },
    update(e, s) {
      e.x += e.vx * DT; e.y = e.baseY + 3.2 * Math.sin(e.t * 0.04);
      e.hist.unshift(e.x, e.y); if (e.hist.length > 200) e.hist.length = 200;
      for (let k = 1; k < e.parts.length; k++) {
        const j = Math.min(e.hist.length - 2, k * 16);
        const hx = e.hist[j] ?? e.x + k, hy = e.hist[j + 1] ?? e.y;
        e.parts[k].ox = hx - e.x + k * 16 * -e.vx * DT * 0; e.parts[k].oy = hy - e.y;
      }
      // 履歴はスクロールと独立（盤面座標）。頭の位置からの相対で持つ
      if (fireOK(s, e) && e.t % 80 === 40) aim(s, e, 7.5);
      const tail = e.parts[e.parts.length - 1];
      if (e.x + tail.ox < -3) e.dead = true;
    },
  },
  // ハッチャー: 壁の孵卵器。小さな飛蟲（ニット）を吐き出し続ける
  hatcher: {
    name: 'HATCHER', ja: 'ハッチャー', hp: 16, r: 1.1, score: 1200, anchored: true, color: 'bio',
    init(e, s, sp) { e.cd = 40; },
    update(e, s) {
      if (--e.cd <= 0) {
        e.cd = Math.round(75 / s.rank);
        if (e.x > 2 && e.x < FIELD_W + 0.5 && s.mode === 'play') {
          const c = spawnEnemy(s, { type: 'nit' }, 0, { x: e.x, y: e.y + (e.flip ? -0.8 : 0.8) });
          c.vy = e.flip ? -5 : 5;
        }
      }
    },
  },
  nit: {
    name: 'NIT', ja: 'ニット', hp: 1, r: 0.32, score: 80, color: 'bio',
    init(e) { e.vx = -1; e.vy = 5; e.windup = 0; e.spd = 0; },
    update(e, s) {
      if (e.t < 24) { e.y += e.vy * DT; e.vy *= 0.92; e.x += e.vx * DT; }
      else if (e.t < 38) {
        // 予備動作: 止まって身震いし、狙いを定める
        e.vx *= 0.8; e.vy *= 0.8; e.x += e.vx * DT; e.y += e.vy * DT; e.windup = (e.t - 24) / 14;
        if (e.t === 37) e.ang = aimAngle(s, e.x, e.y);
      } else {
        // 突進: 0.25 秒かけて最高速へ
        e.windup = 0; e.spd = Math.min(8, e.spd + 0.55);
        e.vx = Math.cos(e.ang) * e.spd; e.vy = Math.sin(e.ang) * e.spd;
        e.x += e.vx * DT; e.y += e.vy * DT;
      }
    },
  },
  // バルワーク: 装甲殻。殻が開いた瞬間だけ核に弾が通る
  bulwark: {
    name: 'BULWARK', ja: 'バルワーク', hp: 14, r: 1.1, score: 800, color: 'w',
    init(e, s, sp) { e.stopX = sp.stopX ?? 24; e.vx = -3; e.armored = true; e.open = 0; e.keep = true; },
    update(e, s) {
      if (e.t < 900) {
        // 止まる位置へ減速しながら近づく（急停止しない）
        const d = e.x - e.stopX; e.vx = -Math.max(0, Math.min(3, d * 1.1));
        e.x += e.vx * DT; e.y += Math.sin(e.t * 0.02) * 0.02;
      } else { e.vx = Math.max(-6, e.vx - 0.08); e.x += e.vx * DT; if (e.x < -3) e.dead = true; }
      const c = e.t % 170;
      const want = c > 100 ? 1 : 0;
      e.open += (want - e.open) * 0.15;
      e.armored = e.open < 0.6;
      if (c === 112 && fireOK(s, e)) for (let k = -2; k <= 2; k++) aim(s, e, 6.8, k * 0.22, 'orb', -0.8, 0);
    },
  },
  // シスル: 漂う機雷。撃つか時間切れで針を輪に撒く
  thistle: {
    name: 'THISTLE', ja: 'シスル', hp: 2, r: 0.55, score: 150, color: 'am',
    init(e, s, sp) { e.vx = -(sp.spd ?? 2.2); e.fuse = sp.fuse ?? 9999; e.baseY = e.y; e.arm = 0; },
    update(e, s) {
      e.x += e.vx * DT; e.y = e.baseY + Math.sin(e.t * 0.03 + e.i) * 0.5;
      // 近づくと 0.4 秒「点滅して膨らむ」予告のあとで弾ける（いきなり弾けない）
      if (!e.arm && (e.t >= e.fuse || (s.player.alive && Math.hypot(s.player.x - e.x, s.player.y - e.y) < 3.0))) { e.arm = 24; s.events.push({ t: 'sfx', id: 'warnBeam' }); }
      if (e.arm) { e.vx *= 0.9; if (--e.arm === 0) { e.hp = 0; e.dead = true; ENEMY.thistle.onDeath(e, s); s.events.push({ t: 'fx', k: 'boom', x: e.x, y: e.y, s: 0.8, c: 'am' }); } }
    },
    onDeath(e, s) {
      if (!s.player.alive) return;
      const n = 10;
      for (let k = 0; k < n; k++) fireBullet(s, e.x, e.y, k * Math.PI * 2 / n + e.t * 0.01, 5.2, 'needle');
      s.events.push({ t: 'sfx', id: 'ring' });
    },
  },
  // スキマー: 上下の端を高速で抜けて急降下する
  skimmer: {
    name: 'SKIMMER', ja: 'スキマー', hp: 1, r: 0.45, score: 150, color: 'w',
    init(e, s, sp) { e.y = sp.top ? FIELD_H - 1.2 : 1.2; e.vx = -14; e.vy = 0; e.dove = false; e.keep = true; },
    update(e, s) {
      const p = s.player;
      if (!e.dove && e.x < p.x + 7) { e.dove = true; e.dir = p.y > e.y ? 1 : -1; }
      // 急降下は加速度の上限つきで曲がる（90° の折れ線ではなく弧）
      if (e.dove) steer(e, -9, e.dir * 9, 55); else steer(e, -14, 0, 55);
      e.x += e.vx * DT; e.y += e.vy * DT;
      if (e.x < -2 || e.y < -2 || e.y > FIELD_H + 2) e.dead = true;
    },
  },
  // 巨大艦の部品 ----------------------------------------------------
  // キャノン: 艦の砲塔。砲身を回して 3 連射
  cannon: {
    name: 'HULL CANNON', ja: '艦砲', hp: 14, r: 0.9, score: 700, anchored: true, color: 'w',
    init(e, s, sp) { e.cd = 60 + Math.floor(rand(s) * 50); e.ang = Math.PI; e.burst = 0; e.flip = sp.flip ?? e.flip; },
    update(e, s) {
      const a = aimAngle(s, e.x, e.y);
      e.ang += Math.atan2(Math.sin(a - e.ang), Math.cos(a - e.ang)) * 0.08;
      if (--e.cd <= 0) { e.cd = Math.round(120 / s.rank); e.burst = 3; }
      if (e.burst > 0 && e.t % 7 === 0) { e.burst--; if (fireOK(s, e)) { fireBullet(s, e.x + Math.cos(e.ang) * 1, e.y + Math.sin(e.ang) * 1, e.ang, 8.5); e.fireT = s.tick; e.fireAng = e.ang; } }
    },
  },
  // エンジン: 艦尾の推進器。噴射が後ろ（左）へ吹き出す。壊せば止まる
  engine: {
    name: 'STERN ENGINE', ja: '艦尾エンジン', hp: 40, r: 1.3, score: 3000, anchored: true, color: 'am',
    init(e, s, sp) { e.ph = sp.ph ?? 0; },
    update(e, s) {
      const c = (e.t + e.ph) % 160;
      e.burning = c < 70;
      if (e.burning && e.t % 3 === 0 && e.x < FIELD_W + 4 && s.mode !== 'bossdown') {
        const b = fireBullet(s, e.x - 1.2, e.y + (rand(s) - 0.5) * 0.8, Math.PI + (rand(s) - 0.5) * 0.25, 11, 'flame');
        if (b) b.life = 34;
      }
    },
  },
  // ベント: 艦のハッチ。追尾ダートを打ち上げる
  vent: {
    name: 'LAUNCH VENT', ja: '発進口', hp: 10, r: 0.8, score: 600, anchored: true, color: 'w',
    init(e) { e.cd = 30; },
    update(e, s) {
      if (--e.cd <= 0) { e.cd = Math.round(95 / s.rank); if (e.x > 4 && e.x < FIELD_W && s.mode === 'play') { const d = spawnEnemy(s, { type: 'dart' }, 0, { x: e.x, y: e.y + (e.flip ? -0.6 : 0.6) }); d.vy = e.flip ? -9 : 9; } }
    },
  },
  dart: {
    name: 'DART', ja: 'ダート', hp: 1, r: 0.35, score: 100, color: 'w',
    init(e) { e.vx = 0; e.vy = 9; e.spd = 3; },
    update(e, s) {
      if (e.t < 22) { e.y += e.vy * DT; e.vy *= 0.95; e.x -= 2 * DT; e.ang = Math.atan2(e.vy, -2); }
      else {
        // 誘導: 1 tick 最大 0.05rad しか曲がらず（60 tick で誘導終了）、推力は少しずつ上がる
        if (e.t < 82) { const want = aimAngle(s, e.x, e.y); const d = Math.atan2(Math.sin(want - e.ang), Math.cos(want - e.ang)); e.ang += Math.max(-0.05, Math.min(0.05, d)); }
        e.spd = Math.min(10, e.spd + 0.3);
        e.vx = Math.cos(e.ang) * e.spd; e.vy = Math.sin(e.ang) * e.spd;
        e.x += e.vx * DT; e.y += e.vy * DT;
        if (e.t > 400) e.dead = true;
      }
    },
  },
};
