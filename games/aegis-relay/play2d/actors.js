// AEGIS RELAY 2D — 登場物の描画（地上の標的・空の敵・支援機・自機・弾）
// ・位置は前 tick との補間（alpha）。回転・傾き・炎・反動は描画側の実時間のばねで動かす（何 Hz でも同じ速さ）
// ・絵はすべて焼いたスプライトの drawImage。毎フレームのグラデーション生成はしない
// ・判定には一切さわらない（見た目だけ）。当たり半径の表示は sim の値そのまま
import { FIELD, TUNING, AIR } from '../shared/rules.js';
import { TAU, lerp, clamp, smooth, easeOut, easeBack } from './util.js';
import { BANKS } from './sprites/player.js';
import { PANEL_TRACE } from './sprites/ground.js';

const W = FIELD.W, H = FIELD.H;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };
const CHAIN_COL = ['cyan', 'cyan', 'green', 'green', 'yellow', 'orange', 'pink', 'white', 'white'];
const KILL_COL = { scout: 'orange', weaver: 'green', slicer: 'orange', gunner: 'purple', spinner: 'cyan', diver: 'red', lancer: 'gold', twinL: 'pink', twinR: 'pink', twinM: 'pink', turret: 'orange', bunker: 'orange', dock: 'gold', panel: 'cyan' };

// 残像つきの軌跡（実時間で 1/90 秒ごとに点を足す。点は後ろへ流れる）
function makeTrail(nMax) { return { x: new Float32Array(nMax), y: new Float32Array(nMax), n: 0, acc: 0, nMax }; }
function trailPush(t, x, y, dt, drift) {
  for (let i = 0; i < t.n; i++) t.y[i] += drift * dt;
  t.acc += dt; if (t.acc < 1 / 90 && t.n) { t.x[0] = x; t.y[0] = y; return; } t.acc = 0;
  const n = Math.min(t.nMax - 1, t.n); for (let i = n; i > 0; i--) { t.x[i] = t.x[i - 1]; t.y[i] = t.y[i - 1]; } t.x[0] = x; t.y[0] = y; t.n = n + 1;
}
function trailDraw(c, t, w, a, minW) {
  for (let i = 1; i < t.n; i++) { const k = 1 - i / t.nMax; c.globalAlpha = a * k * k; c.lineWidth = Math.max(minW, w * (0.35 + 0.65 * k)); c.beginPath(); c.moveTo(t.x[i - 1], t.y[i - 1]); c.lineTo(t.x[i], t.y[i]); c.stroke(); }
}

export function createActors(R, A, fx, terrain) {
  const est = new Map(), gst = new Map();      // 敵・地上物ごとの見た目の状態（ばね・反動など）
  let stamp = 0, lastTick = -1, prevBul = new Set(), curBul = new Set();
  const pl = { bank: 0, thrust: 1, muzzle: 0, tr: [makeTrail(16), makeTrail(16), makeTrail(12), makeTrail(12)], had: false, x: 120, y: 280 };
  const sigils = [];
  const fireMul = (g) => Math.max(TUNING.loop.fireCapMul, 1 - g.loop * TUNING.loop.fireStep);

  function reset() { est.clear(); gst.clear(); prevBul.clear(); sigils.length = 0; lastTick = -1; for (const t of pl.tr) t.n = 0; }
  const eState = (e) => { let s = est.get(e.id); if (!s) { s = { rot: 0, recoil: 0, fold: 0, smoke: 0, fresh: true, stamp: 0, x: e.x, y: e.y }; est.set(e.id, s); } s.stamp = stamp; return s; };
  const gState = (o) => { let s = gst.get(o.gid); if (!s) { s = { ang: 0, recoil: 0, open: 0, smoke: 0, stage: -1, stamp: 0 }; gst.set(o.gid, s); } s.stamp = stamp; return s; };

  // tick が進んだとき: 新しい弾（砲口炎・反動）と、消えた弾（ふっと消える輪）を調べる
  function onTick(g) {
    curBul.clear();
    for (const b of g.bullets) {
      curBul.add(b);
      if (!prevBul.has(b) && g.tick - b.born <= 1) {
        const ang = Math.atan2(b.vy, b.vx); fx.muzzle(b.px, b.py, ang, 'pink', 1);
        for (const e of g.enemies) if (Math.abs(e.x - b.px) < 3 && Math.abs(e.y - b.py) < 10) { const s = est.get(e.id); if (s) s.recoil = 1; }
        for (const o of g.ground.values()) if (Math.abs(o.x - b.px) < 2 && Math.abs(o.y - b.py) < 3) { const s = gst.get(o.gid); if (s) s.recoil = 1; }
      }
    }
    for (const b of prevBul) if (!curBul.has(b) && b.x > 2 && b.x < W - 2 && b.y > 2 && b.y < H - 2) fx.bulletPuff(b.x, b.y);
    const t = prevBul; prevBul = curBul; curBul = t;
    stamp++;
    if ((stamp & 63) === 0) { for (const [k, s] of est) if (s.stamp < stamp - 2) est.delete(k); for (const [k, s] of gst) if (s.stamp < stamp - 2) gst.delete(k); }
  }

  function flashOver(c, key, x, y, rot, sx, sy, fl) { if (fl > 0.02) { c.globalAlpha = Math.min(0.85, fl); A.draw(c, A.white(key), x, y, rot, sx, sy); c.globalAlpha = 1; } }
  // 損傷（耐久が半分以下）: 亀裂の光・煙・火花
  function damage(c, s, x, y, r, F, sk) {
    s.smoke -= F.dt;
    if (s.smoke <= 0) { s.smoke = 0.09 + Math.random() * 0.08; fx.smokePuff(x + (Math.random() - 0.5) * r, y + (Math.random() - 0.5) * r, r * 0.55, 0.7, (Math.random() - 0.5) * 10, sk ? -14 : -26, sk, 0.45); if (Math.random() < 0.3) fx.sparks(x + (Math.random() - 0.5) * r, y, 2, 'yellow', 70, 0.3, 4, sk); }
  }

  // ── 地上の標的 ──
  function drawGround(c, g, F) {
    const p = g.player, ppx = F.ppx, ppy = F.ppy, D = fireMul(g), kS = 1 - Math.exp(-7 * F.dt), time = F.time;
    c.imageSmoothingQuality = 'high';
    // 現れたシジル（地面の印）
    for (const s of sigils) { const y = F.sc - s.wy; if (y < -20 || y > H + 20) continue; s.t += F.dt; c.globalAlpha = Math.max(0.35, 1 - s.t / 5); A.spr(c, 'sigil', s.x, y, s.t * 0.5, Math.min(1, easeBack(Math.min(1, s.t / 0.35)))); }
    c.globalAlpha = 1;
    for (const o of g.ground.values()) {
      if (o.type === 'sigil') continue;
      const x = o.x, y = F.sc - o.wy, fl = (o.flash / 6) * 0.9, s = gState(o);
      s.recoil *= Math.exp(-9 * F.dt);
      const aim = Math.atan2(ppy - y, ppx - x) - Math.PI / 2;
      if (s.stage < 0) { s.ang = aim; s.stage = 0; }
      switch (o.type) {
        case 'turret': {
          s.ang += angDiff(s.ang, aim) * kS;
          A.spr(c, 'turretBase', x, y); flashOver(c, 'turretBase', x, y, 0, 1, 1, fl);
          const rx = Math.sin(s.ang) * s.recoil * 1.8, ry = -Math.cos(s.ang) * s.recoil * 1.8;
          A.spr(c, 'turretHead', x + rx, y + ry, s.ang); flashOver(c, 'turretHead', x + rx, y + ry, s.ang, 1, 1, fl);
          break;
        }
        case 'bunker': {
          s.ang += angDiff(s.ang, aim) * kS;
          const fa = 150 * D, pre = smooth(fa - 46, fa - 10, o.fireT), post = o.fireT < 26 ? 1 - o.fireT / 26 : 0, inPlay = y > 6 && y < H * 0.78 ? 1 : 0;
          s.open += (Math.max(pre, post) * inPlay - s.open) * (1 - Math.exp(-14 * F.dt));
          A.spr(c, 'bunkerBase', x, y); flashOver(c, 'bunkerBase', x, y, 0, 1, 1, fl);
          const off = s.open * 2.7;
          for (let k = 0; k < 6; k++) { const a = k * TAU / 6; A.spr(c, 'bunkerPetal', x + Math.sin(a) * off, y - Math.cos(a) * off, a); }
          const rx = Math.sin(s.ang) * s.recoil * 1.6, ry = -Math.cos(s.ang) * s.recoil * 1.6, gs = 0.82 + 0.18 * s.open;
          A.spr(c, 'bunkerGun', x + rx, y + ry, s.ang, gs); flashOver(c, 'bunkerGun', x + rx, y + ry, s.ang, gs, gs, fl);
          break;
        }
        case 'dock': {
          const want = 0.07 + 0.05 * Math.sin(time * 2.2 + o.gid) + (1 - o.hp / o.hp0) * 0.75; s.open += (want - s.open) * (1 - Math.exp(-10 * F.dt));
          A.spr(c, 'dockBase', x, y); flashOver(c, 'dockBase', x, y, 0, 1, 1, fl);
          const sx = 1 - s.open * 0.9;
          A.spr(c, 'dockDoorL', x - 8.4 * (1 - sx), y, 0, sx, 1); A.spr(c, 'dockDoorR', x + 8.4 * (1 - sx), y, 0, sx, 1);
          break;
        }
        case 'panel': {
          A.spr(c, 'panel', x, y); flashOver(c, 'panel', x, y, 0, 1, 1, fl);
          const ch = g.chains[o.chainId];
          if (ch && ch.state === 'run') { const t = A.text(String(o.chainIdx + 1), 5, '#bff8ff'); c.drawImage(t, x - t.wu / 2, y - 12.5 - t.hu / 2, t.wu, t.hu); }
          break;
        }
        case 'core': {
          const ratio = o.hp / o.hp0, stage = ratio > 0.75 ? 0 : ratio > 0.5 ? 1 : ratio > 0.25 ? 2 : 3;
          if (s.stage2 === undefined) s.stage2 = stage;
          if (stage > s.stage2) { s.stage2 = stage; fx.debris(x, y, 14, 130, 0, 0, 1); fx.sparks(x, y, 26, 'pink', 170, 0.6, 8, 1); fx.ring(x, y, 'pink', 14, 60, 0.4, 0.8, 1); fx.addShake(2.2); } // 装甲が剥がれる
          A.spr(c, 'coreBase', x, y); flashOver(c, 'coreBase', x, y, 0, 1, 1, fl * 0.6);
          A.spr(c, 'coreArmor' + stage, x, y, time * 0.12); flashOver(c, 'coreArmor' + stage, x, y, time * 0.12, 1, 1, fl);
          A.spr(c, 'coreRingA', x, y, time * (0.9 + stage * 0.35)); A.spr(c, 'coreRingB', x, y, -time * (1.5 + stage * 0.5));
          const fa = 96 * D, tele = smooth(fa - 30, fa, o.fireT), pu = 1 + 0.07 * Math.sin(time * (5 + stage * 2)) + tele * 0.16;
          A.spr(c, 'coreNucleus', x, y, 0, pu); flashOver(c, 'coreNucleus', x, y, 0, pu, pu, fl);
          c.strokeStyle = 'rgba(8,2,8,.85)'; c.lineWidth = 2.6; c.beginPath(); c.arc(x, y, 25.6, 0, TAU); c.stroke();
          c.strokeStyle = '#ff4fa8'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 25.6, -Math.PI / 2, -Math.PI / 2 + TAU * ratio); c.stroke();
          break;
        }
      }
      if (o.type !== 'panel' && o.hp <= o.hp0 / 2 && y > 0 && y < H) damage(c, s, x, y, o.r * 0.6, F, 1);
    }
    // 光るもの（加算）: 警告灯・誘導灯・回路を流れる光・核・シジルのかすかな光
    c.globalCompositeOperation = 'lighter';
    for (const s of sigils) { const y = F.sc - s.wy; if (y > -20 && y < H + 20) A.glow(c, 'white', s.x, y, 16, 0.3 * Math.max(0.3, 1 - s.t / 5)); }
    for (const o of g.ground.values()) {
      const x = o.x, y = F.sc - o.wy;
      if (o.type === 'sigil') { if (o.hidden) { const ph = (g.tick + F.a + o.gid * 37) % TUNING.sigil.hintEvery; if (ph < 26) { const k = Math.sin((ph / 26) * Math.PI); A.glow(c, 'white', x, y, 6 * k + 2, 0.34 * k); } } continue; }
      const s = gst.get(o.gid); if (!s) continue;
      const hurt = o.hp <= o.hp0 / 2;
      switch (o.type) {
        case 'turret': { for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + TAU / 8, on = ((Math.floor(time * 3 + o.gid) + k) & 1) ? 1 : 0.15; A.glow(c, hurt ? 'red' : 'orange', x + Math.cos(a) * 7.9, y + Math.sin(a) * 7.9, 2.6, on); } A.glow(c, 'orange', x, y, 5, 0.35); break; }
        case 'bunker': { A.glow(c, 'orange', x, y, 8 + s.open * 6, 0.25 + s.open * 0.6); for (let k = 0; k < 6; k++) { const a = k * TAU / 6; A.glow(c, 'red', x + Math.cos(a) * 10.4, y + Math.sin(a) * 10.4, 2.2, s.open > 0.3 ? (Math.sin(time * 26) > 0 ? 1 : 0.2) : 0.25); } break; }
        case 'dock': {
          const run = Math.floor(time * 9) % 6;
          for (let k = 0; k < 6; k++) { const lx = x - 7.5 + k * 3, on = k === run || k === (run + 3) % 6 ? 1 : 0.16; A.glow(c, 'gold', lx, y - 8.3, 1.9, on); A.glow(c, 'gold', x + 7.5 - k * 3, y + 8.3, 1.9, on); }
          A.glow(c, 'gold', x, y, 15 + 3 * Math.sin(time * 4), 0.3 + s.open * 0.5); break;
        }
        case 'panel': {
          const ch = g.chains[o.chainId], cnt = ch ? ch.count : 0, col = CHAIN_COL[Math.min(8, cnt)], run = ch && ch.state === 'run';
          const t = (time * (0.7 + cnt * 0.18) + o.chainIdx * 0.13) % 1, nseg = PANEL_TRACE.length / 2 - 1, f = t * nseg, i = Math.min(nseg - 1, Math.floor(f)) * 2, u = f - i / 2;
          A.glow(c, col, x + lerp(PANEL_TRACE[i], PANEL_TRACE[i + 2], u), y + lerp(PANEL_TRACE[i + 1], PANEL_TRACE[i + 3], u), 2.6, 0.95);
          A.glow(c, col, x, y, run ? 12 + 2 * Math.sin(time * 10) : 9, run ? 0.5 : 0.2); break;
        }
        case 'core': { const ratio = o.hp / o.hp0, fa = 96 * fireMul(g), tele = smooth(fa - 30, fa, o.fireT); A.glow(c, 'pink', x, y, 17 + 3 * Math.sin(time * 6) + tele * 9, 0.6 + tele * 0.4); if (tele > 0.1) A.glow(c, 'white', x, y, 9 * tele, tele * 0.8);
          for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + time * 0.12 + TAU / 16; A.glow(c, ratio < 0.5 ? 'red' : 'pink', x + Math.cos(a) * 19.8, y + Math.sin(a) * 19.8, 2, 0.4 + 0.4 * Math.sin(time * 5 + k)); } break; }
      }
      if (hurt && o.type !== 'panel') { c.globalAlpha = 0.55 + 0.35 * Math.sin(time * 23 + o.gid); const r = o.r * 0.95; c.drawImage(A.crack, x - r, y - r, r * 2, r * 2); }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }

  // 影: 空の物体は「地面の上にいるときだけ」やわらかい影を落とす（高さの手がかり）
  function shadow(c, x, y, r, sc) { const sx = x + 6, sy = y + 11, la = terrain.landAlpha(sx, sc - sy); if (la > 0.02) { c.globalAlpha = la * 0.62; c.drawImage(A.softDisc, sx - r * 1.15, sy - r * 0.8, r * 2.3, r * 1.6); } }

  // ── 空の敵 ──
  function drawAir(c, g, F) {
    const a = F.a, time = F.time, dt = F.dt, p = g.player;
    for (const e of g.enemies) shadow(c, lerp(e.px, e.x, a), lerp(e.py, e.y, a), e.r, F.sc);
    if (g.partner) shadow(c, lerp(g.partner.px, g.partner.x, a), lerp(g.partner.py, g.partner.y, a), 9, F.sc);
    if (p.alive) shadow(c, F.ppx, F.ppy, 11, F.sc);
    c.globalAlpha = 1; c.imageSmoothingQuality = 'high';
    // ジェミニの半身を結ぶエネルギーの糸
    for (const e of g.enemies) if (e.type === 'twinL') { const o = g.enemies.find((q) => q.type === 'twinR' && q.key === e.key); if (o) thread(c, lerp(e.px, e.x, a), lerp(e.py, e.y, a), lerp(o.px, o.x, a), lerp(o.py, o.y, a), time, e.mergeK || 0); }
    for (let pass = 0; pass < 2; pass++) {
      if (pass) c.globalCompositeOperation = 'lighter';
      for (const e of g.enemies) {
        const s = eState(e), vx = (e.x - e.px) * 60, vy = (e.y - e.py) * 60, sp = Math.hypot(vx, vy), age = e.t + a, ph = e.id * 2.399;
        let x = lerp(e.px, e.x, a), y = lerp(e.py, e.y, a) - (e.flash / 6) * 1.3;
        // 登場: 縦に引き伸ばされた光から収束する
        const kin = clamp(age / 14), ein = easeOut(kin), sx = lerp(0.3, 1, ein), sy = lerp(2.4, 1, ein), fl = (e.flash / 6) * 0.9;
        if (!pass) {
          if (s.fresh) { s.fresh = false; if (age < 6 && e.mv !== 'merged') fx.warpIn(clamp(x, 4, W - 4), clamp(y, 2, H)); }
          s.recoil *= Math.exp(-9 * dt);
          c.globalAlpha = 0.35 + 0.65 * kin;
          switch (e.type) {
            case 'scout': {
              s.rot += angDiff(s.rot, clamp(Math.atan2(vy || 1, vx) - Math.PI / 2, -0.8, 0.8)) * (1 - Math.exp(-10 * dt));
              A.spr(c, 'scout', x, y, s.rot, sx, sy); flashOver(c, 'scout', x, y, s.rot, sx, sy, fl); break;
            }
            case 'weaver': {
              const r = time * 13 + ph; c.globalAlpha *= 0.22; A.spr(c, 'weaverRotor', x, y, r - 0.5, sx, sy); c.globalAlpha = (0.35 + 0.65 * kin) * 0.4; A.spr(c, 'weaverRotor', x, y, r - 0.25, sx, sy); // 羽の残像
              c.globalAlpha = 0.35 + 0.65 * kin; A.spr(c, 'weaverRotor', x, y, r, sx, sy); A.spr(c, 'weaverHub', x, y, Math.sin(time * 2 + ph) * 0.3, sx, sy);
              flashOver(c, 'weaverRotor', x, y, r, sx, sy, fl); break;
            }
            case 'slicer': {
              const dir = vx > 0 ? 1 : -1, r = time * 15 * dir + ph;
              c.globalAlpha = 0.16; A.spr(c, 'slicerDisc', x - vx * 0.05, y - vy * 0.05, r - 0.8 * dir); c.globalAlpha = 0.3; A.spr(c, 'slicerDisc', x - vx * 0.025, y - vy * 0.025, r - 0.4 * dir); // 刃の光跡
              c.globalAlpha = 0.35 + 0.65 * kin; A.spr(c, 'slicerDisc', x, y, r, sx, sy); A.spr(c, 'slicerHub', x, y, 0, sx, sy);
              flashOver(c, 'slicerDisc', x, y, r, sx, sy, fl); break;
            }
            case 'gunner': {
              const by = 4.4 - s.recoil * 2.4;
              A.spr(c, 'gunBarrel', x - 6.3 * sx, y + by * sy, 0, sx, sy); A.spr(c, 'gunBarrel', x + 6.3 * sx, y + by * sy, 0, sx, sy);
              A.spr(c, 'gunner', x, y, 0, sx, sy); flashOver(c, 'gunner', x, y, 0, sx, sy, fl); break;
            }
            case 'spinner': {
              const r = time * 5.5 + ph; c.globalAlpha *= 0.3; A.spr(c, 'spinnerBlades', x, y, r - 0.3, sx, sy); c.globalAlpha = 0.35 + 0.65 * kin;
              A.spr(c, 'spinnerBlades', x, y, r, sx, sy); A.spr(c, 'spinnerCore', x, y, 0, sx * (1 + 0.12 * Math.sin(time * 7 + ph)));
              flashOver(c, 'spinnerBlades', x, y, r, sx, sy, fl); break;
            }
            case 'diver': {
              const diving = !e.telegraph && e.t >= (e.tele || 0), want = e.telegraph ? smooth(4, (e.tele || 40) - 6, age) : diving ? 1 : 0;
              s.fold += (want - s.fold) * (1 - Math.exp(-12 * dt));
              const tr = diving && sp > 20 ? clamp(Math.atan2(vy, vx) - Math.PI / 2, -0.9, 0.9) : 0; s.rot += angDiff(s.rot, tr) * (1 - Math.exp(-9 * dt));
              const shk = e.telegraph ? Math.sin(time * 70) * 0.35 * s.fold : 0; x += shk;
              if (sp > 110) { c.globalAlpha = 0.14; A.spr(c, 'diverBody', x - vx * 0.06, y - vy * 0.06, s.rot); c.globalAlpha = 0.28; A.spr(c, 'diverBody', x - vx * 0.03, y - vy * 0.03, s.rot); c.globalAlpha = 1; } // 突進の残像
              const cs = Math.cos(s.rot), sn = Math.sin(s.rot), wa = s.fold * 0.95;
              for (const d of [-1, 1]) { const lx = d * 2.3, ly = -1.4; A.spr(c, d < 0 ? 'diverWingL' : 'diverWingR', x + (lx * cs - ly * sn) * sx, y + (lx * sn + ly * cs) * sy, s.rot + d * wa, sx, sy); }
              A.spr(c, 'diverBody', x, y, s.rot, sx, sy); flashOver(c, 'diverBody', x, y, s.rot, sx, sy, fl); break;
            }
            case 'lancer': {
              const dep = smooth(24, 70, age), py = -2.4 + dep * 3.2 - s.recoil * 1.6, px = 8.6 + dep * 2.6;
              A.spr(c, 'lancerPodL', x - px * sx, y + py * sy, 0, sx, sy); A.spr(c, 'lancerPodR', x + px * sx, y + py * sy, 0, sx, sy);
              A.spr(c, 'lancer', x, y, 0, sx, sy); flashOver(c, 'lancer', x, y, 0, sx, sy, fl); break;
            }
            case 'twinL': case 'twinR': {
              const wob = Math.sin(time * 3 + ph) * 0.06 * (1 - (e.mergeK || 0)); A.spr(c, e.type, x, y, wob, sx, sy); flashOver(c, e.type, x, y, wob, sx, sy, fl);
              c.strokeStyle = 'rgba(255,79,168,.85)'; c.lineWidth = 0.9; c.beginPath(); c.arc(x, y, 13.2, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - (e.mergeK || 0))); c.stroke(); break; // 合体までの残り
            }
            case 'twinM': {
              const kk = clamp(age / 22), sc2 = lerp(1.5, 1, easeOut(kk)); c.globalAlpha = 1;
              A.spr(c, 'twinRingB', x, y, -time * 1.1, sc2 * (1 + 0.5 * (1 - kk))); A.spr(c, 'twinRingA', x, y, time * 1.9, sc2);
              A.spr(c, 'twinCore', x, y, Math.sin(time * 0.8) * 0.2); flashOver(c, 'twinCore', x, y, Math.sin(time * 0.8) * 0.2, 1, 1, fl); flashOver(c, 'twinRingA', x, y, time * 1.9, sc2, sc2, fl * 0.7); break;
            }
          }
          c.globalAlpha = 1;
          if (e.hp0 > 1 && e.hp <= e.hp0 / 2 && y > 0) damage(c, s, x, y, e.r * 0.6, F, 0);
          if (e.telegraph) { const k = 0.5 + 0.5 * Math.sin(time * 36); c.globalAlpha = 0.55 + 0.45 * k; const rr = 15 - 3 * s.fold; c.drawImage(fx.rings.red, x - rr, y - rr, rr * 2, rr * 2); c.globalAlpha = 1; } // 突進の予告
        } else {
          // 光（加算）: 噴射炎・目・核・灯
          const fk = 0.85 + 0.15 * Math.sin(time * 50 + ph), fv = 'flameW' + ((time * 24 + e.id) % 3 | 0);
          switch (e.type) {
            case 'scout': flame(c, fv, x, y, 0, -8.6, s.rot, 0.8, 0.6 + sp * 0.006 * fk, sx, sy); A.glow(c, 'red', x + Math.sin(-s.rot) * 3.6, y + Math.cos(s.rot) * 3.6, 3.4, 0.65); break;
            case 'weaver': A.glow(c, 'green', x, y, 5.5 + Math.sin(time * 8 + ph), 0.75); break;
            case 'slicer': A.glow(c, 'orange', x, y, 5, 0.8); break;
            case 'gunner': flame(c, fv, x, y, -6.3, -10.8, 0, 0.9, 0.7 * fk, sx, sy); flame(c, fv, x, y, 6.3, -10.8, 0, 0.9, 0.7 * fk, sx, sy); A.glow(c, 'purple', x, y + 0.4, 5 + s.recoil * 4, 0.7); A.glow(c, 'pink', x - 8.3, y + 1.8, 2.2, 0.5 + 0.5 * Math.sin(time * 9 + ph)); A.glow(c, 'pink', x + 8.3, y + 1.8, 2.2, 0.5 - 0.5 * Math.sin(time * 9 + ph)); break;
            case 'spinner': A.glow(c, 'cyan', x, y, 6 + 2 * Math.sin(time * 7 + ph), 0.85); break;
            case 'diver': { const cs = Math.cos(s.rot), sn = Math.sin(s.rot), L = 0.7 + s.fold * 0.5 + sp * 0.012; flame(c, fv, x, y, -1.1, -10, s.rot, 0.75, L * fk, sx, sy); flame(c, fv, x, y, 1.1, -10, s.rot, 0.75, L * fk, sx, sy); A.glow(c, 'red', x - sn * 3.4, y + cs * 3.4, 3.2 + s.fold * 2, 0.6 + s.fold * 0.4); break; }
            case 'lancer': flame(c, fv, x, y, -4.3, -16, 0, 1, 0.9 * fk, sx, sy); flame(c, fv, x, y, 4.3, -16, 0, 1, 0.9 * fk, sx, sy); A.glow(c, 'gold', x, y + 13, 5 + 1.5 * Math.sin(time * 6), 0.75); A.glow(c, 'yellow', x - 11.8, y - 8.6, 2.6, Math.sin(time * 5 + ph) > 0 ? 0.9 : 0.2); A.glow(c, 'yellow', x + 11.8, y - 8.6, 2.6, Math.sin(time * 5 + ph) > 0 ? 0.2 : 0.9); A.glow(c, 'yellow', x, y - 3.6, 3, 0.4 + 0.3 * Math.sin(time * 11)); break;
            case 'twinL': case 'twinR': { const d = e.type === 'twinL' ? 1 : -1, k = e.mergeK || 0; A.glow(c, 'pink', x + d * 1.5, y, 6 + k * 6 + Math.sin(time * 9) * 1, 0.5 + k * 0.5); A.glow(c, 'pink', x - d * 4, y, 3.4, 0.8); break; }
            case 'twinM': A.glow(c, 'pink', x, y, 9 + 2 * Math.sin(time * 7), 0.55); break;
          }
          if (kin < 1) A.glow(c, 'white', x, y, e.r * (2.4 - kin), (1 - kin) * 0.8);
          if (e.hp0 > 1 && e.hp <= e.hp0 / 2) { c.globalAlpha = 0.5 + 0.4 * Math.sin(time * 27 + ph); const r = e.r * 1.05; c.drawImage(A.crack, x - r, y - r, r * 2, r * 2); }
        }
      }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  // 推進炎（本体の回転に合わせ、噴射口から後ろへ伸ばす）。len で伸び縮み
  function flame(c, key, x, y, lx, ly, rot, w, len, sx = 1, sy = 1) {
    const cs = Math.cos(rot), sn = Math.sin(rot), ox = lx, oy = ly - 5 * len;
    c.globalAlpha = 1; A.draw(c, A.get(key), x + (ox * cs - oy * sn) * sx, y + (ox * sn + oy * cs) * sy, rot + Math.PI, w * sx, len * sy);
  }
  // エネルギーの糸（ゆらぐ折れ線。太い桃色 → 細い白）
  function thread(c, x0, y0, x1, y1, time, k) {
    const n = 9, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, amp = Math.min(7, len * 0.06) * (1 - k * 0.5);
    for (let pass = 0; pass < 2; pass++) {
      c.strokeStyle = pass ? 'rgba(255,240,250,.95)' : 'rgba(255,79,168,.5)'; c.lineWidth = pass ? Math.max(1 / R.K, 0.4) : 1.6 + k * 1.4; c.beginPath(); c.moveTo(x0, y0);
      for (let i = 1; i < n; i++) { const t = i / n, w = Math.sin(t * Math.PI) * amp * (Math.sin(time * 31 + i * 2.1) * 0.6 + Math.sin(time * 17 + i * 4.7) * 0.4); c.lineTo(x0 + dx * t + nx * w, y0 + dy * t + ny * w); }
      c.lineTo(x1, y1); c.stroke();
    }
  }

  // ── 支援機 ARC ──
  function drawPartner(c, g, F) {
    const q = g.partner; if (!q) return;
    const x = lerp(q.px, q.x, F.a), y = lerp(q.py, q.y, F.a), time = F.time, kin = Math.min(1, easeBack(clamp((q.t + F.a) / 16))), leaving = q.t >= TUNING.partner.life;
    c.imageSmoothingQuality = 'high';
    // 誘導の光の筋（自機へ向かう点線が流れる）
    if (g.player.alive && !leaving) {
      const dx = F.ppx - x, dy = F.ppy - y, d = Math.hypot(dx, dy), nn = Math.floor(d / 6);
      c.globalCompositeOperation = 'lighter';
      for (let i = 1; i < nn; i++) { const t = (i + (time * 3) % 1) / nn; A.glow(c, 'gold', x + dx * t, y + dy * t, 1.5, 0.5 * Math.sin(t * Math.PI)); }
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    }
    A.spr(c, 'arcRing', x, y, time * 2.4, kin); A.spr(c, 'arc', x, y, Math.sin(time * 2.2) * 0.12, kin);
    c.globalCompositeOperation = 'lighter';
    A.glow(c, 'gold', x, y, 8 + 2.5 * Math.sin(time * 9), 0.85); A.glow(c, 'white', x, y, 3, 0.5 + 0.4 * Math.sin(time * 15));
    for (const d of [-1, 1]) { c.globalAlpha = 1; A.draw(c, A.get('flameW' + ((time * 24 + d + 1) % 3 | 0)), x + d * 6.6, y + 7 + 5 * 0.6, 0, 0.7, 0.6); }
    c.globalAlpha = 0.3 + 0.25 * Math.sin(time * 6); const rr = TUNING.partner.dockR; c.drawImage(fx.rings.gold, x - rr * 1.12, y - rr * 1.12, rr * 2.24, rr * 2.24); // 合体できる範囲
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }

  // ── 自機と自機の弾 ──
  function drawShots(c, g, F) {
    c.imageSmoothingQuality = 'high';
    const docked = g.player.docked, key = A.get(docked ? 'shotD' : 'shot');
    for (const s of g.shots) A.draw(c, key, lerp(s.px, s.x, F.a), lerp(s.py, s.y, F.a), s.vx ? Math.atan2(s.vx, -s.vy) : 0);
    c.globalCompositeOperation = 'lighter';
    for (const s of g.shots) A.glow(c, docked ? 'gold' : 'cyan', lerp(s.px, s.x, F.a), lerp(s.py, s.y, F.a) - 5, 4.2, 0.55);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  function drawPlayer(c, g, F, hitbox) {
    const p = g.player, dt = F.dt, time = F.time, x = F.ppx, y = F.ppy;
    if (!p.alive) { pl.had = false; for (const t of pl.tr) t.n = 0; return; }
    const vx = (p.x - p.px) * 60, vy = (p.y - p.py) * 60;
    // 傾きと推力は実時間のばね（60Hz の段つきを出さない）
    pl.bank += (clamp(vx / TUNING.player.speed, -1, 1) - pl.bank) * (1 - Math.exp(-11 * dt));
    const wantT = p.entering > 0 ? 2.1 : clamp(1 - vy / TUNING.player.speed * 0.55, 0.45, 1.6);
    pl.thrust += (wantT - pl.thrust) * (1 - Math.exp(-9 * dt)); pl.muzzle = Math.max(0, pl.muzzle - dt);
    const bi = clamp(Math.round((pl.bank + 1) * (BANKS - 1) / 2), 0, BANKS - 1), b = (bi - 4) / 4;
    const kx = (v) => v * (v >= 0 ? (b > 0 ? 1 - 0.4 * b : 1 + 0.12 * b) : (b < 0 ? 1 + 0.4 * b : 1 - 0.12 * b));
    const blink = p.invuln > 0 ? 0.62 + 0.38 * Math.sin(time * 47) : 1;
    // 軌跡（推進の光と、傾けたときの翼端の細い筋）
    const drift = 60 + pl.thrust * 50, minW = 1 / R.K;
    if (!pl.had) { pl.had = true; for (const t of pl.tr) t.n = 0; }
    trailPush(pl.tr[0], x + kx(-1.65), y + 13, dt, drift); trailPush(pl.tr[1], x + kx(1.65), y + 13, dt, drift);
    trailPush(pl.tr[2], x + kx(-14.2), y + 9, dt, drift * 1.4); trailPush(pl.tr[3], x + kx(14.2), y + 9, dt, drift * 1.4);
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    c.strokeStyle = p.docked ? '#ffd890' : '#5ac8ff'; trailDraw(c, pl.tr[0], 1.5, 0.5 * blink, minW); trailDraw(c, pl.tr[1], 1.5, 0.5 * blink, minW);
    const wt = clamp(Math.abs(pl.bank) * 1.6 - 0.25) + (p.entering > 0 ? 0.5 : 0);
    if (wt > 0.02) { c.strokeStyle = '#dff4ff'; trailDraw(c, pl.tr[2], 0.35, 0.6 * wt * blink, minW); trailDraw(c, pl.tr[3], 0.35, 0.6 * wt * blink, minW); }
    // 推進炎（白い芯・青い外炎。前進で伸び、後退で縮む）
    const fk = pl.thrust * (0.86 + 0.14 * Math.sin(time * 61) + 0.06 * Math.sin(time * 143)), fv = (time * 30) % 3 | 0;
    c.globalAlpha = blink;
    A.glow(c, 'cyan', x, y + 13, 7 + 3 * pl.thrust, 0.45 * blink);
    for (const d of [-1, 1]) { const fx0 = x + kx(d * 1.65); c.globalAlpha = blink; A.draw(c, A.get('flame' + fv), fx0, y + 12.2 + 5 * fk, 0, 0.82, fk); }
    const dk = p.dockAnim > 0 ? 1 - p.dockAnim / TUNING.partner.dockTicks : 1, din = easeOut(clamp(dk / 0.42));
    if (p.docked) for (const d of [-1, 1]) { c.globalAlpha = blink * din; A.draw(c, A.get('flameW' + ((fv + 1) % 3)), x + kx(d * 17.4) * (1 + (1 - din) * 1.3), y + 12.6 + 4 * fk, 0, 0.75, fk * 0.8); }
    c.globalCompositeOperation = 'source-over';
    // 本体（傾きの段階ごとの絵）と合体の装備（左右から引き寄せられて噛み合う）
    c.imageSmoothingQuality = 'high'; c.globalAlpha = blink;
    A.spr(c, 'ship' + bi, x, y);
    if (p.docked) { c.globalAlpha = blink * clamp(dk * 5); A.spr(c, 'gear' + bi, x, y, 0, 1 + (1 - din) * 1.3, 1); }
    c.globalCompositeOperation = 'lighter';
    A.glow(c, 'cyan', x - b * 0.3, y + 0.4, 3.4 + 0.5 * Math.sin(time * 6), 0.6 * blink);
    if (p.docked && dk < 1) { const k = Math.sin(clamp((dk - 0.3) / 0.7) * Math.PI); for (const d of [-1, 1]) A.glow(c, 'gold', x + kx(d * 13.1), y + 7, 6 * k, k); } // 接合部が光る
    if (p.docked) for (const d of [-1, 1]) A.glow(c, 'gold', x + kx(d * 13.1), y + 7.3, 2.6, 0.4 + 0.25 * Math.sin(time * 8));
    if (pl.muzzle > 0) { const k = pl.muzzle / 0.07; if (p.docked) { for (const d of [-1, 0, 1]) A.glow(c, 'gold', x + kx(d * 7), y - (d ? 12 : 16), 5.5 * k, 0.9 * k); } else A.glow(c, 'cyan', x, y - 16, 5.5 * k, 0.95 * k); } // 砲口炎
    if (p.invuln > 0) { c.globalAlpha = 0.3 + 0.2 * Math.sin(time * 12); c.drawImage(fx.rings.cyan, x - 17, y - 17, 34, 34); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    if (hitbox) { c.strokeStyle = '#00ff88'; c.lineWidth = 0.5; c.beginPath(); c.arc(x, y, TUNING.player.hitR, 0, TAU); c.stroke(); }
  }
  // タイトル画面の自機（ゆっくり左右に振れる）
  function drawAttractShip(c, F) {
    const time = F.time, x = W / 2 + Math.sin(time * 0.6) * 46, y = H * 0.86 + Math.sin(time * 0.9) * 5, vx = Math.cos(time * 0.6) * 46 * 0.6;
    pl.bank += (clamp(vx / 30, -1, 1) - pl.bank) * (1 - Math.exp(-6 * F.dt));
    const bi = clamp(Math.round((pl.bank + 1) * 4), 0, 8), fk = 1.1 * (0.86 + 0.14 * Math.sin(time * 61)), fv = (time * 30) % 3 | 0, S = 1.5;
    trailPush(pl.tr[0], x - 1.65 * S, y + 13 * S, F.dt, 110); trailPush(pl.tr[1], x + 1.65 * S, y + 13 * S, F.dt, 110);
    c.globalCompositeOperation = 'lighter'; c.strokeStyle = '#5ac8ff'; trailDraw(c, pl.tr[0], 2, 0.5, 1 / R.K); trailDraw(c, pl.tr[1], 2, 0.5, 1 / R.K);
    A.glow(c, 'cyan', x, y + 13 * S, 16, 0.5);
    for (const d of [-1, 1]) { c.globalAlpha = 1; A.draw(c, A.get('flame' + fv), x + d * 1.65 * S, y + (12.2 + 5 * fk) * S, 0, 0.82 * S, fk * S); }
    c.globalCompositeOperation = 'source-over'; c.imageSmoothingQuality = 'high'; A.spr(c, 'ship' + bi, x, y, 0, S);
    c.globalCompositeOperation = 'lighter'; A.glow(c, 'cyan', x, y + 0.6, 5.5, 0.6); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }

  // ── 敵弾（いちばん上に描く。暗い縁 → 桃色 → 白い芯。出現でふくらみ、脈動する）──
  function drawBullets(c, g, F, hitbox) {
    const K = R.K, time = F.time, bs = A.get('bullet');
    c.imageSmoothingQuality = 'high'; c.globalCompositeOperation = 'lighter';
    for (const b of g.bullets) { // 尾と光のにじみ（弾そのものより下）
      const x = lerp(b.px, b.x, F.a), y = lerp(b.py, b.y, F.a), v = Math.hypot(b.vx, b.vy), len = v * 0.075, ang = Math.atan2(b.vy, b.vx), cs = Math.cos(ang) * K, sn = Math.sin(ang) * K;
      c.globalAlpha = 0.55; c.setTransform(cs, sn, -sn, cs, R.bx + x * K, R.by + y * K); c.drawImage(fx.streaks.pink, -len, -2.1, len, 4.2);
    }
    c.setTransform(K, 0, 0, K, R.bx, R.by);
    for (const b of g.bullets) A.glow(c, 'pink', lerp(b.px, b.x, F.a), lerp(b.py, b.y, F.a), 7, 0.4);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    let i = 0;
    for (const b of g.bullets) {
      const x = lerp(b.px, b.x, F.a), y = lerp(b.py, b.y, F.a), age = g.tick - (b.born || 0) + F.a, grow = age < 9 ? easeBack(clamp(age / 9)) * (1 + 0.35 * Math.sin(clamp(age / 9) * Math.PI)) : 1;
      const s = (b.r / 2.4) * Math.max(0.2, grow) * (1 + 0.08 * Math.sin(time * 15 + i++ * 1.7));
      A.draw(c, bs, x, y, 0, s);
    }
    if (hitbox) { c.strokeStyle = '#00ff88'; c.lineWidth = 0.3; for (const b of g.bullets) { c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.stroke(); } }
  }
  function drawHitboxes(c, g) {
    c.strokeStyle = 'rgba(255,255,0,.85)'; c.lineWidth = 0.4;
    for (const e of g.enemies) { c.beginPath(); c.arc(e.x, e.y, e.r, 0, TAU); c.stroke(); }
    for (const o of g.ground.values()) { c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.stroke(); }
  }

  // ── できごと → 演出 ──
  function onEvents(evs, g) {
    for (const e of evs) {
      switch (e.t) {
        case 'shot': pl.muzzle = 0.07; break;
        case 'hit': fx.hitSpark(e.x, e.y + (e.air ? 3 : 2), e.air); break;
        case 'kill': {
          if (e.type === 'core') { fx.coreBlast(e.x, e.y); terrain.scorch(e.x, e.wy, 46); break; }
          fx.explode(e.x, e.y, e.r, { ground: e.ground, big: e.big, vx: e.vx, vy: e.vy, col: KILL_COL[e.type], gold: e.type === 'dock' });
          if (e.ground) { terrain.scorch(e.x, e.wy ?? g.scroll - e.y, e.r * (e.big ? 2.3 : 1.8)); if (e.type === 'dock') fx.goldBurst(e.x, e.y, 20, 1); }
          break;
        }
        case 'die': fx.playerDeath(e.x, e.y); break;
        case 'respawn': fx.ring(TUNING.player.startX, TUNING.player.startY, 'cyan', 40, 8, 0.4, 0.7); break;
        case 'dock': fx.dockBurst(e.x, e.y); break;
        case 'partnerFree': fx.goldBurst(e.x, e.y, 22, 0); fx.ring(e.x, e.y, 'gold', 4, 30, 0.45, 0.9); break;
        case 'twinAppear': fx.glowPuff(4, 70, 'pink', 6, 30, 0.5, 0.8); fx.glowPuff(W - 4, 70, 'pink', 6, 30, 0.5, 0.8); break;
        case 'twinBreak': fx.ring(e.x, e.y, 'pink', 6, 70, 0.6, 1); fx.ring(120, 70, 'white', 6, 100, 0.8, 0.8); fx.sparks(e.x, e.y, 44, 'pink', 220, 0.9, 10); fx.addFlash(0.26, '255,220,240'); fx.addShake(3); break;
        case 'twinLocked': fx.ring(e.x, e.y, 'pink', 46, 8, 0.25, 0.9); fx.later(0.2, () => { fx.ring(e.x, e.y, 'pink', 8, 60, 0.5, 1); fx.glowPuff(e.x, e.y, 'white', 10, 44, 0.2, 1); }); fx.sparks(e.x, e.y, 26, 'pink', 150, 0.6, 8); fx.addShake(2.4); fx.addFlash(0.12, '255,200,235'); break;
        case 'chainStep': { const col = CHAIN_COL[Math.min(8, e.n)]; fx.sparks(e.x, e.y, 8 + e.n * 2, col, 90 + e.n * 12, 0.45, 6, 1); fx.ring(e.x, e.y, col, 4, 16 + e.n * 2.5, 0.32, 0.9, 1); break; }
        case 'chainBonus': fx.sparks(e.x, e.y, 54, 'cyan', 220, 0.9, 10, 1); fx.sparks(e.x, e.y, 30, 'white', 150, 0.8, 8, 1); for (let i = 0; i < 3; i++) fx.later(i * 0.12, () => fx.ring(e.x, e.y, i ? 'cyan' : 'white', 6, 70 + i * 26, 0.6, 0.9, 1)); fx.addFlash(0.2, '200,250,255'); break;
        case 'chainFail': fx.pop(e.x, e.y, 'CHAIN BREAK', '#ff8fa3', false); break;
        case 'sigilPing': fx.ring(e.x, e.y, 'white', 2, 12, 0.3, 0.8, 1); fx.sparks(e.x, e.y, 5, 'white', 60, 0.3, 4, 1); break;
        case 'sigil': fx.sparks(e.x, e.y, 60, 'white', 190, 1, 9, 1); fx.ring(e.x, e.y, 'white', 4, 80, 0.8, 1, 1); fx.ring(e.x, e.y, 'cyan', 4, 50, 0.5, 0.8, 1); fx.addFlash(0.2); sigils.push({ x: e.x, wy: e.wy, t: 0 }); break;
        case 'dive': fx.glowPuff(e.x, e.y, 'red', 8, 22, 0.25, 0.8); break;
        case 'extend': fx.pop(g.player.x, g.player.y - 24, 'EXTEND +1', '#8affc1', true); fx.ring(g.player.x, g.player.y, 'green', 6, 50, 0.6, 0.9); break;
        case 'score': fx.pop(e.x, e.y, (e.label ? e.label + ' ' : '') + e.pts, e.pts >= 1000 ? '#ffd166' : '#eef4ff', e.pts >= 1000); break;
      }
    }
  }
  return { reset, onTick, onEvents, drawGround, drawAir, drawPartner, drawShots, drawPlayer, drawAttractShip, drawBullets, drawHitboxes };
}
