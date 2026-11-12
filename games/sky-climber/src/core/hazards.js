// Sky Climber VR — 障害（窓の開閉・落下物・鳥・看板やゴンドラなどの大型障害）。
// すべて seed つきの乱数で 60Hz 固定に進む（同じ seed・同じ入力なら同じ展開）。
// どの障害も「予告（動き・音）→ 本番」の順で、予告時間は難易度の warn 以上。
import { makeRng } from './rng.js';
import { FLOOR_H, COL_W, colX } from './stages.js';

export const HZ = {
  windowOpen: [5, 11],     // 開いている時間（秒・難易度の interval 倍）
  windowClosed: [2.2, 3.4],
  windowOpening: 0.6,
  dropBase: 6.5,           // 落下物の平均間隔（秒）＝ dropBase / 密度 × interval
  dropVmax: 7.0, dropG: 9.0,
  birdBase: 11, birdSpeed: 3.0,
  handR: 0.22, bodyR: 0.30, // 当たり判定の半径
};
const ITEMS = ['pot', 'can', 'bucket', 'bottle', 'pot'];

export class Hazards {
  constructor(building, diff, seed) {
    this.b = building; this.diff = diff;
    this.rng = makeRng((seed ?? building.def.seed) * 7 + 13);
    this.t = 0; this.nextId = 1;
    const hz = building.def.hazards;
    this.win = building.windows.map((w) => {
      const active = w.floor > 0 && this.rng.chance(hz.closers);
      return { active, state: 'open', t: this.rng.range(1, HZ.windowOpen[1] * diff.interval), close: 0, resident: active && this.rng.chance(0.6) };
    });
    this.items = [];   // 落下物と投げる住人
    this.birds = [];
    this.zones = [];   // 大型障害
    this.dropT = this.rng.range(3, 6);
    this.birdT = this.rng.range(5, 9);
    const sw = hz.sweep;
    if (sw) for (const f of sw.floors) this.zones.push(this.makeZone(sw.kind, f));
    this.events = [];
  }
  makeZone(kind, f) {
    const b = this.b, id = this.nextId++;
    if (kind === 'gondola') return { id, kind, floor: f, x: -b.halfW + 1.2, dir: 1, speed: 0.75, w: 2.3, y0: f * FLOOR_H + 0.25, y1: f * FLOOR_H + 1.95, wait: 0, on: true, warn: 0 };
    if (kind === 'crane') return { id, kind, floor: f, x: 0, phase: this.rng.range(0, 6.28), period: 8.5, amp: b.halfW - 1.0, w: 2.8, y0: f * FLOOR_H + 1.05, y1: f * FLOOR_H + 1.6, on: true, warn: 0 };
    // ネオン: ネオン看板の列とその両隣を、予告ののち 1.4 秒だけ帯電させる
    const blk = b.def.blocks.find((k) => k.kind === 'neon');
    const cx = blk ? colX(b.def, blk.c0) : 0;
    return { id, kind: 'neon', floor: f, x: cx, w: COL_W * 1.6, y0: f * FLOOR_H - 0.2, y1: (f + 2) * FLOOR_H, state: 'idle', t: this.rng.range(2, 4), on: false, warn: 0 };
  }
  holdAvailable(hold) {
    if (hold.win < 0) return true;
    const w = this.win[hold.win];
    return !(w.state === 'closed' || (w.state === 'closing' && w.close >= 1));
  }
  emit(e) { this.events.push(e); }
  takeEvents() { const e = this.events; this.events = []; return e; }

  // player = { body:{x,y}, hands:{L:{x,y,held,hold},R:...} }
  step(dt, player) {
    this.t += dt;
    const d = this.diff, b = this.b;
    // 窓: 開 → 閉じかけ（予告 warn 秒・ガラス戸が動く）→ 閉（保持点が無効、そこを持つ手は外れる）→ 開きかけ
    for (let i = 0; i < this.win.length; i++) {
      const w = this.win[i]; if (!w.active) continue;
      w.t -= dt;
      if (w.state === 'open' && w.t <= 0) {
        // 身体から遠い窓は閉めない（見えない所で状態が変わるだけになるため）
        const wd = b.windows[i];
        if (Math.abs(wd.y + 1.3 - player.body.y) > 9) { w.t = 2; continue; }
        w.state = 'closing'; w.t = d.warn; w.close = 0; this.emit({ type: 'windowWarn', win: i });
      } else if (w.state === 'closing') {
        w.close = Math.min(1, 1 - w.t / d.warn);
        if (w.t <= 0) { w.state = 'closed'; w.close = 1; w.t = this.rng.range(...HZ.windowClosed); this.emit({ type: 'windowClose', win: i }); }
      } else if (w.state === 'closed' && w.t <= 0) { w.state = 'opening'; w.t = HZ.windowOpening; this.emit({ type: 'windowOpen', win: i }); }
      else if (w.state === 'opening') { w.close = Math.max(0, w.t / HZ.windowOpening); if (w.t <= 0) { w.state = 'open'; w.close = 0; w.t = this.rng.range(...HZ.windowOpen) * d.interval; } }
    }
    // 落下物: 上の窓に住人が身を乗り出して予告 → 落とす
    const hz = b.def.hazards;
    if (hz.drops > 0) {
      this.dropT -= dt;
      if (this.dropT <= 0) {
        this.dropT = (HZ.dropBase / hz.drops) * d.interval * this.rng.range(0.7, 1.3);
        const cands = b.windows.filter((w, i) => this.win[i].state === 'open' && w.y > player.body.y + 1.0 && w.y < player.body.y + 8.5 &&
          Math.abs(w.x - player.body.x) < 1.9 && !this.items.some((it) => it.win === i));
        if (cands.length) {
          const w = this.rng.pick(cands);
          const it = { id: this.nextId++, kind: 'drop', item: this.rng.pick(ITEMS), win: w.id, x: w.x + this.rng.range(-0.25, 0.25), y: w.y + 0.9, z: 0.30,
            phase: 'warn', t: d.warn + 0.3, vy: 0, spin: this.rng.range(-6, 6), rot: 0 };
          this.items.push(it); this.emit({ type: 'dropWarn', id: it.id, x: it.x, y: it.y });
        }
      }
    }
    for (const it of this.items) {
      if (it.phase === 'warn') { it.t -= dt; if (it.t <= 0) { it.phase = 'fall'; this.emit({ type: 'dropFall', id: it.id, x: it.x, y: it.y }); } }
      else if (it.phase === 'fall') {
        it.vy = Math.min(HZ.dropVmax, it.vy + HZ.dropG * dt); it.y -= it.vy * dt; it.rot += it.spin * dt;
        if (it.y < 0.15 || it.y < player.body.y - 6) { it.phase = 'gone'; this.emit({ type: 'dropBreak', id: it.id, x: it.x, y: Math.max(0.15, it.y), item: it.item }); }
      } else if (it.phase === 'hit') { it.phase = 'gone'; }
    }
    this.items = this.items.filter((it) => it.phase !== 'gone');
    // 鳥: 進路の予告（鳴き声・壁に落ちる影の帯）→ 横切る
    if (hz.birds > 0) {
      this.birdT -= dt;
      if (this.birdT <= 0) {
        this.birdT = (HZ.birdBase / hz.birds) * d.interval * this.rng.range(0.7, 1.3);
        const dir = this.rng.chance(0.5) ? 1 : -1;
        const bd = { id: this.nextId++, dir, x: -dir * (b.halfW + 2.5), y: player.body.y + this.rng.range(-0.1, 1.3), z: 0.42, phase: 'warn', t: d.warn + 0.5, flap: 0 };
        this.birds.push(bd); this.emit({ type: 'birdWarn', id: bd.id, x: bd.x, y: bd.y, dir });
      }
    }
    for (const bd of this.birds) {
      bd.flap += dt;
      if (bd.phase === 'warn') { bd.t -= dt; if (bd.t <= 0) { bd.phase = 'fly'; this.emit({ type: 'birdFly', id: bd.id, x: bd.x, y: bd.y }); } }
      else { bd.x += bd.dir * HZ.birdSpeed * dt; bd.by = bd.y + Math.sin(bd.flap * 5) * 0.12; if (Math.abs(bd.x) > b.halfW + 3) bd.phase = 'gone'; }
    }
    this.birds = this.birds.filter((bd) => bd.phase !== 'gone');
    // 大型障害
    for (const z of this.zones) {
      if (z.kind === 'gondola') {
        if (z.wait > 0) z.wait -= dt;
        else { z.x += z.dir * z.speed * dt; const lim = b.halfW - z.w / 2; if (Math.abs(z.x) > lim) { z.x = Math.sign(z.x) * lim; z.dir *= -1; z.wait = 2.0; } }
      } else if (z.kind === 'crane') {
        z.x = z.amp * Math.sin(this.t * 2 * Math.PI / z.period + z.phase);
      } else if (z.kind === 'neon') {
        z.t -= dt;
        if (z.state === 'idle' && z.t <= 0) { z.state = 'warn'; z.t = d.warn; z.warn = 1; this.emit({ type: 'zoneWarn', id: z.id, x: z.x, y: (z.y0 + z.y1) / 2 }); }
        else if (z.state === 'warn' && z.t <= 0) { z.state = 'on'; z.on = true; z.t = 1.4; z.warn = 0; this.emit({ type: 'zoneOn', id: z.id, x: z.x, y: (z.y0 + z.y1) / 2 }); }
        else if (z.state === 'on' && z.t <= 0) { z.state = 'idle'; z.on = false; z.t = this.rng.range(3, 5) * d.interval; }
      }
    }
  }
  // 当たり判定。結果は { hz: 障害 id, target: 'L'|'R'|'body', x, y, kind }
  collide(player) {
    const out = [];
    const test = (hzId, kind, x, y, r, consume) => {
      for (const s of ['L', 'R']) {
        const h = player.hands[s];
        if (Math.hypot(h.x - x, h.y - y) < r + HZ.handR) { out.push({ hz: hzId, target: s, x, y, kind }); if (consume) consume(); return; }
      }
      const bx = player.body.x, by = player.body.y;
      // 身体: 肩から腰（0.7m 下）までの縦の線分
      const cy = Math.max(by - 0.7, Math.min(by + 0.15, y));
      if (Math.hypot(bx - x, cy - y) < r + HZ.bodyR) { out.push({ hz: hzId, target: 'body', x, y, kind }); if (consume) consume(); }
    };
    for (const it of this.items) if (it.phase === 'fall') test(it.id, 'drop', it.x, it.y, 0.16, () => { it.phase = 'hit'; this.emit({ type: 'dropBreak', id: it.id, x: it.x, y: it.y, item: it.item, onHit: true }); });
    for (const bd of this.birds) if (bd.phase === 'fly') test(bd.id, 'bird', bd.x, bd.by ?? bd.y, 0.25);
    for (const z of this.zones) {
      if (!z.on) continue;
      const inR = (x, y) => Math.abs(x - z.x) < z.w / 2 && y > z.y0 && y < z.y1;
      let hit = null;
      for (const s of ['L', 'R']) { const h = player.hands[s]; if (h.held && inR(h.x, h.y)) { hit = s; break; } }
      if (!hit) { const bx = player.body.x, by = player.body.y; if (Math.abs(bx - z.x) < z.w / 2 + 0.15 && by - 0.7 < z.y1 && by + 0.15 > z.y0) hit = 'body'; }
      if (hit) out.push({ hz: z.id, target: hit, x: z.x, y: (z.y0 + z.y1) / 2, kind: z.kind });
    }
    return out;
  }
  // 復帰時: 近くの落下物と鳥を消す（復帰直後の理不尽な命中を防ぐ）
  clearNear(x, y) {
    this.items = this.items.filter((it) => Math.hypot(it.x - x, it.y - y) > 9);
    this.birds = this.birds.filter((bd) => Math.abs(bd.y - y) > 4);
    this.dropT = Math.max(this.dropT, 3); this.birdT = Math.max(this.birdT, 4);
  }
}
