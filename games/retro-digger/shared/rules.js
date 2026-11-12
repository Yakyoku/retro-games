// 2D と 3D で共通のルール: 膨張・ポンプ・岩の状態遷移・得点。
// 位置・経路・当たりの形はモードごとに違うので、ここでは「状態と時間」だけを扱う。
// すべてゲーム時間（一時停止中は進まない dt の積算）で動く。描画フレーム数には依存しない。
import { RULES, rockScore } from './config.js';

// ---------- 乱数（決定的。テストと再現のため） ----------
export function makeRng(seed = 12345) {
  let s = seed >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  return { next, range: (a, b) => a + (b - a) * next(), int: (n) => Math.floor(next() * n), get seed() { return s; } };
}

// ---------- 膨張（敵 1 体ぶん） ----------
// stage 0 = 通常。1..max-1 = 膨張して足止め中（接触しても安全）。max に達すると破裂。
export function makeInflate() { return { stage: 0, sinceAir: 0, deflAcc: 0, attached: false, popped: false }; }

// 送気 1 回。戻り値 'air' | 'pop'
export function inflateAir(inf, max) {
  if (inf.popped) return 'pop';
  inf.stage = Math.min(max, inf.stage + 1);
  inf.sinceAir = 0; inf.deflAcc = 0;
  if (inf.stage >= max) { inf.popped = true; return 'pop'; }
  return 'air';
}

// 時間経過。接続中は縮まない（送気しなくても、つないでいる間は止まったまま）。
// 戻り値: 'deflate'（1 段階縮んだ）| 'recovered'（0 に戻った）| null
export function inflateUpdate(inf, dt) {
  if (inf.stage <= 0 || inf.popped) return null;
  inf.sinceAir += dt;
  if (inf.attached || inf.sinceAir < RULES.deflateDelay) return null;
  inf.deflAcc += dt;
  if (inf.deflAcc >= RULES.deflateStep) {
    inf.deflAcc -= RULES.deflateStep;
    inf.stage--;
    return inf.stage === 0 ? 'recovered' : 'deflate';
  }
  return null;
}
// 復帰直前（残り 1 段階で、次の収縮が近い）か
export const inflateRecovering = (inf) => inf.stage > 0 && inf.stage <= RULES.recoverWarnStages && !inf.attached && inf.sinceAir >= RULES.deflateDelay;
// 0..1 の膨らみ具合（描画用）。縮む途中もなめらかに
export function inflateAmount(inf, max) {
  if (inf.stage <= 0) return 0;
  let s = inf.stage;
  if (!inf.attached && inf.sinceAir >= RULES.deflateDelay) s -= Math.min(1, inf.deflAcc / RULES.deflateStep) * 0.35;
  return Math.max(0, Math.min(1, s / max));
}

// ---------- ポンプ（プレイヤー側） ----------
// state: idle → shoot（伸びる）→ attached（接続）／retract（外れ・空振りで戻る）→ idle
// hooks.advance(len) → { hit: enemy | null, blocked: bool }  … len まで伸ばしたときの当たり
// hooks.valid(enemy) → bool  … 接続を保てるか（射程・遮蔽・敵の状態）
// hooks.inflate(enemy) → 敵の makeInflate()
export function makePump() { return { state: 'idle', len: 0, target: null, cool: 0, lastPress: false }; }

export function pumpTick(p, input, dt, cfg, hooks, emit) {
  const pressed = input.pump && !p.lastPress;
  p.lastPress = input.pump;
  p.cool = Math.max(0, p.cool - dt);
  switch (p.state) {
    case 'idle':
      if (pressed && !input.moving) { p.state = 'shoot'; p.len = 0; emit('pump-shot'); }
      break;
    case 'shoot': {
      p.len = Math.min(cfg.range, p.len + cfg.speed * dt);
      const r = hooks.advance(p.len);
      if (r.hit) {
        p.state = 'attached'; p.target = r.hit; p.cool = cfg.interval;
        const inf = hooks.inflate(r.hit); inf.attached = true;
        emit('pump-hit', { enemy: r.hit });
        // 命中した瞬間に 1 段階目の送気（押した 1 回ぶん）
        doAir(p, cfg, hooks, emit);
      } else if (r.blocked || p.len >= cfg.range) { p.state = 'retract'; emit('pump-miss'); }
      break;
    }
    case 'retract':
      p.len = Math.max(0, p.len - cfg.speed * 1.6 * dt);
      if (p.len <= 0) p.state = 'idle';
      break;
    case 'attached': {
      const t = p.target;
      if (!t || !hooks.valid(t) || input.moving) { pumpDetach(p, hooks, emit); break; }
      // 連打（押した瞬間）でも長押しでも、共通の間隔 cfg.interval より速くは送気しない
      if ((pressed || input.pump) && p.cool <= 0) doAir(p, cfg, hooks, emit);
      break;
    }
  }
}
function doAir(p, cfg, hooks, emit) {
  const inf = hooks.inflate(p.target);
  const r = inflateAir(inf, cfg.max);
  p.cool = cfg.interval;
  if (r === 'pop') { emit('pop', { enemy: p.target }); p.target = null; p.state = 'retract'; }
  else emit('pump-air', { enemy: p.target, stage: inf.stage });
}
export function pumpDetach(p, hooks, emit) {
  if (p.target) { const inf = hooks.inflate(p.target); if (inf) inf.attached = false; if (emit) emit('detach', { enemy: p.target }); }
  p.target = null;
  if (p.state !== 'idle') p.state = 'retract';
}
export function pumpReset(p) { p.state = 'idle'; p.len = 0; p.target = null; p.cool = 0; }

// ---------- 岩 ----------
// held（支えあり）→ loose（支えを失った: 揺れ・砂・警告）→ fall（落下）→ landed（着地・崩れる）→ gone
// 落下中に当たった敵は kills に 1 回だけ入る。得点は着地したときに 1 回だけ（300×n×n）。
export function makeRockState() { return { state: 'held', t: 0, kills: [], scored: false, hitPlayer: false }; }
export function rockLoosen(r) { if (r.state === 'held') { r.state = 'loose'; r.t = 0; return true; } return false; }
export function rockTick(r, dt, warn, emit) {
  r.t += dt;
  if (r.state === 'loose' && r.t >= warn) { r.state = 'fall'; r.t = 0; emit('rock-fall', { rock: r }); }
  else if (r.state === 'landed' && r.t >= 0.9) { r.state = 'gone'; }
}
export function rockLand(r, emit) {
  if (r.state !== 'fall') return 0;
  r.state = 'landed'; r.t = 0;
  emit('rock-land', { rock: r });
  if (r.scored) return 0;
  r.scored = true;
  const n = r.kills.length;
  if (n) emit('rock-crush', { rock: r, count: n });
  return rockScore(n);
}
export function rockAddKill(r, enemy) { if (!r.kills.includes(enemy)) { r.kills.push(enemy); return true; } return false; }

// ---------- 得点 ----------
export function makeScore(prev = 0) { return { score: prev, dug: new Set(), extraGiven: 0 }; }
// 新しく掘ったセルだけ 10 点（同じセルで重複しない）
export function scoreDig(sc, key) { if (sc.dug.has(key)) return 0; sc.dug.add(key); sc.score += RULES.score.dig; return RULES.score.dig; }
export function scoreAdd(sc, pts) { sc.score += pts; return pts; }
// 残機追加の判定（得点が閾値を超えたら 1 回だけ）
export function scoreExtra(sc) {
  const th = RULES.extraLifeAt[sc.extraGiven];
  if (th != null && sc.score >= th) { sc.extraGiven++; return true; }
  return false;
}
