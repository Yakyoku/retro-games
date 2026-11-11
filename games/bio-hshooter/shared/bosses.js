// VOIDBLOOM — ボス（名前・造形はオリジナル）。部位 parts: kind = solid（弾を止める・触れると死ぬ）/ weak（active の間だけ効く）/ petal（個別の耐久）
import { DT, FIELD_W, FIELD_H, aim, fireBullet, aimAngle, rand, spawnEnemy } from './game-core.js';

const alive = (s) => s.player.alive && s.mode === 'play';
const ease = (e, tx, ty, k = 0.03) => { e.x += (tx - e.x) * k; e.y += (ty - e.y) * k; };
function ring(s, x, y, n, spd, off = 0, kind = 'orb') { if (!alive(s)) return; for (let k = 0; k < n; k++) fireBullet(s, x, y, off + k * Math.PI * 2 / n, spd, kind); }

export const BOSS = {
  // 第 1 面: オッスアリー・ブロッサム — 骨の花弁に守られた花芯。花弁が開く間だけ芯に弾が届く
  ossuary: {
    name: 'OSSUARY BLOSSOM', ja: 'オッスアリー・ブロッサム', hp: 110, r: 3.2, score: 30000, music: 'boss', color: 'bio',
    init(e) {
      e.x = FIELD_W + 5; e.y = FIELD_H / 2; e.inv = 150; e.open = 0; e.keep = true;
      e.parts = [
        { ox: 0, oy: 0, r: 0.95, kind: 'weak', active: false, core: true },
        { ox: 1.6, oy: 0, r: 2.3, kind: 'solid' },
        { ox: 2.6, oy: 2.6, r: 1.5, kind: 'solid' },
        { ox: 2.6, oy: -2.6, r: 1.5, kind: 'solid' },
      ];
      e.petals = [];
      for (let k = 0; k < 4; k++) { const p = { ox: 0, oy: 0, r: 0.85, kind: 'solid', petal: k }; e.parts.push(p); e.petals.push(p); }
      e.tail = [];
      for (let k = 0; k < 10; k++) { const p = { ox: 0, oy: 0, r: 0.55 - k * 0.02, kind: 'solid', tail: k }; e.parts.push(p); e.tail.push(p); }
    },
    update(e, s) {
      if (e.inv > 0) { e.inv--; ease(e, 25.5, FIELD_H / 2, 0.025); }
      const c = e.t % 330;
      const want = c >= 170 && c < 300 ? 1 : 0;
      e.open += (want - e.open) * 0.06;
      e.parts[0].active = e.open > 0.65 && e.inv <= 0;
      const hpk = e.hp / e.maxHp;
      // 花弁: 閉じると芯の前に集まり、開くと上下に分かれる
      for (const p of e.petals) {
        const k = p.petal, base = [0.55, 1.35, -0.55, -1.35][k] + Math.PI;
        const ang = base + (k < 2 ? 1 : -1) * e.open * 0.9 * (k % 2 ? 0.7 : 1.1) * (k < 2 ? 1 : 1);
        const rad = 1.25 + e.open * 1.4;
        p.ox = Math.cos(ang) * rad + 0.3; p.oy = Math.sin(ang) * rad;
      }
      // 尾: 体の下から伸びて下半分をなぎ払う
      const sw = Math.sin(e.t * 0.018) * 0.9;
      let x = 2.2, y = -3.4, a = -Math.PI * 0.62 + sw * 0.4;
      for (const p of e.tail) { a += sw * 0.16 + Math.sin(e.t * 0.05 + p.tail * 0.5) * 0.05; x += Math.cos(a) * 0.85; y += Math.sin(a) * 0.85; p.ox = x; p.oy = y; }
      if (e.inv > 0 || !alive(s)) return;
      if (want === 0 && c % 46 === 20) for (const p of [e.petals[0], e.petals[2]]) for (const o of [-0.18, 0, 0.18]) aim(s, e, 7.2, o, 'orb', p.ox, p.oy);
      if (c === 190) ring(s, e.x - 0.6, e.y, hpk < 0.5 ? 18 : 12, 4.6, e.t * 0.1);
      if (c === 240 && hpk < 0.7) ring(s, e.x - 0.6, e.y, 12, 3.6, 0.13);
      if (c === 120 || (hpk < 0.5 && c === 60)) for (let k = 0; k < 3; k++) { const n = spawnEnemy(s, { type: 'nit' }, 0, { x: e.x + 2.4, y: e.y + (k - 1) * 2.4 }); n.vy = (k - 1) * 4; n.vx = -3; }
      const tip = e.tail[e.tail.length - 1];
      if (e.t % 90 === 0) aim(s, e, 6, 0, 'big', tip.ox, tip.oy);
    },
  },

  // 第 2 面: ヴェスパー・コイル — 闘技場をめぐる 18 節の大蛇。口が開いた瞬間だけ頭に効く
  vesper: {
    name: 'VESPER COIL', ja: 'ヴェスパー・コイル', hp: 150, r: 2.5, score: 40000, music: 'boss', color: 'bio',
    init(e) {
      e.x = FIELD_W + 4; e.y = FIELD_H / 2; e.inv = 120; e.hist = []; e.keep = true; e.mouth = 0; e.dir = Math.PI;
      for (let k = 0; k < 200; k++) e.hist.push(e.x + k * 0.06, e.y); // 最初から胴が右へ伸びた形で現れる（節が頭に重なって跳ばない）
      e.parts = [{ ox: 0, oy: 0, r: 0.95, kind: 'weak', active: false, core: true }, { ox: 0.9, oy: 0, r: 1.05, kind: 'solid', head: true }];
      for (let k = 0; k < 18; k++) e.parts.push({ ox: 0, oy: 0, r: 0.82 - k * 0.025, kind: 'solid', seg: k });
      e.hx = e.x; e.hy = e.y; e.ph = 0;
    },
    update(e, s) {
      const hpk = e.hp / e.maxHp;
      const sp = hpk < 0.4 ? 1.35 : 1;
      e.ph += 0.011 * sp;
      let tx = 18 + 9.5 * Math.cos(e.ph), ty = 9 + 6.2 * Math.sin(e.ph * 1.7);
      if (e.inv > 0) { e.inv--; tx = 24; ty = 9 + Math.sin(e.t * 0.04) * 3; }
      else { // 登場の動きから周回へ 1.5 秒かけて移る（急に加速しない）
        e.blend = Math.min(1, (e.blend || 0) + 1 / 90); const k = e.blend * e.blend * (3 - 2 * e.blend);
        tx = 24 + (tx - 24) * k; ty = (9 + Math.sin(e.t * 0.04) * 3) * (1 - k) + ty * k;
      }
      const nx = e.x + (tx - e.x) * 0.05, ny = e.y + (ty - e.y) * 0.05;
      // 頭の向きは急に振り向かず、1 tick 最大 0.12rad で回す（向きの急変は頭の部位を跳ばしてしまう）
      const raw = Math.atan2(ny - e.y, nx - e.x);
      if (e.dir == null) e.dir = raw; else { const d = Math.atan2(Math.sin(raw - e.dir), Math.cos(raw - e.dir)); e.dir += Math.max(-0.12, Math.min(0.12, d)); }
      e.x = nx; e.y = ny;
      e.hist.unshift(e.x, e.y); if (e.hist.length > 400) e.hist.length = 400;
      const c = e.t % 240;
      const want = c > 150 && c < 230 ? 1 : 0;
      e.mouth += (want - e.mouth) * 0.1;
      e.parts[0].active = e.mouth > 0.6 && e.inv <= 0;
      // 頭の向き（進行方向）に口と頭殻を置く
      const fwd = e.dir || Math.PI;
      e.parts[0].ox = Math.cos(fwd) * 0.5; e.parts[0].oy = Math.sin(fwd) * 0.5;
      e.parts[1].ox = -Math.cos(fwd) * 0.6; e.parts[1].oy = -Math.sin(fwd) * 0.6;
      for (let k = 0; k < 18; k++) {
        const j = Math.min(e.hist.length - 2, (k + 1) * 9 * 2);
        const p = e.parts[k + 2];
        p.ox = (e.hist[j] ?? e.x) - e.x; p.oy = (e.hist[j + 1] ?? e.y) - e.y;
      }
      if (e.inv > 0 || !alive(s)) return;
      if (c === 160 || c === 185 || (hpk < 0.5 && c === 210)) for (let k = -3; k <= 3; k++) aim(s, e, 7, k * 0.16, 'orb', e.parts[0].ox, e.parts[0].oy);
      if (e.t % 70 === 35) { const p = e.parts[2 + 6 + Math.floor(rand(s) * 12)]; aim(s, e, 5.5, 0, 'needle', p.ox, p.oy); }
      if (hpk < 0.6 && e.t % 300 === 100) { const p = e.parts[e.parts.length - 1]; ring(s, e.x + p.ox, e.y + p.oy, 10, 4.2); }
    },
  },

  // 第 3 面: キール・ハート — 巨大艦グレイヴン・アークの炉心。回る遮蔽板の隙間から撃ち抜く
  keelheart: {
    name: 'KEEL HEART', ja: 'キール・ハート', hp: 170, r: 2.8, score: 50000, music: 'boss', color: 'am',
    init(e, s) {
      e.x = s.stage.bossStop + 25.5 - s.scrollX; e.y = FIELD_H / 2; e.inv = 120; e.keep = true; e.anchored = true; e.rot = 0; e.beam = 0;
      e.parts = [{ ox: 0, oy: 0, r: 1.25, kind: 'weak', active: true, core: true }];
      for (let k = 0; k < 3; k++) e.parts.push({ ox: 0, oy: 0, r: 1.0, kind: 'solid', plate: k, noContact: false });
      for (let k = 0; k < 3; k++) e.parts.push({ ox: 0, oy: 0, r: 0.6, kind: 'solid', plate2: k });
      e.guns = [spawnEnemy(s, { type: 'cannon' }, 0, { x: e.x - 0.5, y: 14.0 }), spawnEnemy(s, { type: 'cannon' }, 0, { x: e.x - 0.5, y: 5.0 })];
      for (const g of e.guns) { g.hp = 30; g.maxHp = 30; g.flip = g.y > 9; }
    },
    update(e, s) {
      if (e.inv > 0) e.inv--;
      const gunsAlive = e.guns.filter((g) => !g.dead).length;
      const hpk = e.hp / e.maxHp;
      e.rot += (gunsAlive ? 0.028 : 0.017) * (hpk < 0.4 ? 1.3 : 1);
      for (const p of e.parts) {
        if (p.plate != null) { const a = e.rot + p.plate * Math.PI * 2 / 3; p.ox = Math.cos(a) * 2.25; p.oy = Math.sin(a) * 2.25; }
        if (p.plate2 != null) { const a = e.rot + p.plate2 * Math.PI * 2 / 3 + 0.48; p.ox = Math.cos(a) * 2.25; p.oy = Math.sin(a) * 2.25; }
      }
      e.parts[0].active = e.inv <= 0;
      if (!alive(s) || e.inv > 0) return;
      const c = e.t % 360;
      // 予告つきの横一文字の光線（自機の高さを狙う）
      if (c === 60) { e.beamY = s.player.y; s.warn = 60; s.events.push({ t: 'sfx', id: 'warnBeam' }); e.beamWarn = 60; }
      if (e.beamWarn > 0) e.beamWarn--;
      if (c >= 120 && c < 160 && c % 2 === 0) { const b = fireBullet(s, e.x - 1.4, e.beamY, Math.PI, 26, 'big'); if (b) { b.r = 0.42; b.beam = true; } }
      if (c === 200 || c === 230 || (hpk < 0.5 && c === 260)) ring(s, e.x, e.y, 16, 4.4, e.rot);
      if (c % 50 === 0) for (let k = -1; k <= 1; k++) aim(s, e, 6.5, k * 0.25, 'orb');
      if (hpk < 0.5 && e.t % 120 === 0) { const d = spawnEnemy(s, { type: 'dart' }, 0, { x: e.x - 1, y: e.y + (rand(s) < 0.5 ? 2.5 : -2.5) }); d.vy = 0; }
    },
  },

  // 第 4 面: ハート・オブ・ザ・ブルーム — 六枚の花弁が守る虚空の花芯
  heart: {
    name: 'HEART OF THE BLOOM', ja: 'ハート・オブ・ザ・ブルーム', hp: 230, r: 3.4, score: 100000, music: 'final', color: 'big',
    init(e) {
      e.x = FIELD_W + 5; e.y = FIELD_H / 2; e.inv = 180; e.keep = true; e.rot = 0; e.open = 0; e.phase = 1;
      e.parts = [{ ox: 0, oy: 0, r: 1.35, kind: 'weak', active: false, core: true }, { ox: 1.1, oy: 0, r: 1.7, kind: 'solid', shell: true }];
      e.petals = [];
      for (let k = 0; k < 6; k++) { const p = { ox: 0, oy: 0, r: 0.9, kind: 'petal', hp: 20, maxHp: 20, petal: k }; e.parts.push(p); e.petals.push(p); }
    },
    update(e, s) {
      const hpk = e.hp / e.maxHp;
      const petalsLeft = e.petals.filter((p) => !p.gone).length;
      e.phase = hpk < 0.33 ? 3 : (petalsLeft <= 2 || hpk < 0.7) ? 2 : 1;
      let tx = 24, ty = FIELD_H / 2;
      if (e.phase === 3) { tx = 22 + Math.sin(e.t * 0.009) * 4; ty = 9 + Math.sin(e.t * 0.013) * 4.5; }
      if (e.inv > 0) { e.inv--; }
      ease(e, tx, ty, e.inv > 0 ? 0.02 : 0.03);
      e.rot += e.phase === 1 ? 0.012 : 0.02;
      const prad = 3.3 + Math.sin(e.t * 0.02) * 0.4;
      for (const p of e.petals) { const a = e.rot + p.petal * Math.PI / 3; p.ox = Math.cos(a) * prad; p.oy = Math.sin(a) * prad; }
      const c = e.t % 300;
      const want = e.phase === 1 ? (petalsLeft <= 3 && c > 180 ? 1 : 0) : (c > 140 ? 1 : 0.15);
      e.open += (want - e.open) * 0.06;
      e.parts[0].active = e.open > 0.6 && e.inv <= 0;
      e.parts[1].off = e.open > 0.6;
      e.parts[1].ox = 1.1 + e.open * 1.6;
      if (!alive(s) || e.inv > 0) return;
      if (e.phase >= 1 && e.t % (e.phase === 3 ? 5 : 8) === 0) {
        const a = e.t * 0.11;
        fireBullet(s, e.x, e.y, a, 4.2, 'needle');
        if (e.phase >= 2) fireBullet(s, e.x, e.y, -a + Math.PI, 4.2, 'needle');
      }
      for (const p of e.petals) if (!p.gone && (e.t + p.petal * 23) % 140 === 0) aim(s, e, 6.5, 0, 'orb', p.ox, p.oy);
      if (e.open > 0.6 && c % 40 === 0) ring(s, e.x, e.y, e.phase === 3 ? 20 : 14, 5, rand(s));
      if (e.phase === 3 && e.t % 150 === 75) for (let k = 0; k < 4; k++) { const n = spawnEnemy(s, { type: 'nit' }, 0, { x: e.x, y: e.y }); n.vy = (k - 1.5) * 4; n.vx = 2; }
      if (e.phase >= 2 && e.t % 200 === 0) aim(s, e, 5, 0, 'big');
    },
  },
};
