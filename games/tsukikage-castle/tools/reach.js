// 到達確認: 本物の core（敵なし）で「歩く・跳ぶ・はしご・待つ」の操作を幅優先で試し、
// スタートからボスの間まで通常の操作だけで行けるかを調べる。見つかった操作列（60Hz の入力）を返す。
// 使い方: node tools/reach.js [ステージ番号 1-6]  （省略で全部）
import { createGame, step } from '../shared/core.js';
import { getStages } from '../shared/stages.js';

function snapshot(g) { return { p: { ...g.player }, tw: g.tw, prevIn: { ...g.prevIn } }; }
function restore(g, s) {
  g.player = { ...s.p }; g.tw = s.tw; g.prevIn = { ...s.prevIn };
  for (const m of g.movers) { const k = 0.5 - 0.5 * Math.cos((g.tw * 2 * Math.PI) / m.period + m.phase); m.cx = m.x + m.ax * k; m.cy = m.y + m.ay * k; m.dx = 0; m.dy = 0; }
  g.mode = 'play'; g.time = 9999;
}

const ACTIONS = [
  { name: 'R', hold: { right: true }, ticks: 3 }, { name: 'L', hold: { left: true }, ticks: 3 },
  { name: 'JR', jump: 1 }, { name: 'JL', jump: -1 }, { name: 'J', jump: 0 },
  { name: 'W', hold: {}, ticks: 15 },
  { name: 'U', climb: 1 }, { name: 'D', climb: -1 },
];

export function solveStage(index, opts = {}) {
  const g = createGame({ stage: index, noEnemies: true, difficulty: opts.difficulty || 'hard' });
  g.mode = 'play'; g.time = 9999;
  const def = getStages()[index];
  const moversNear = (p) => g.movers.some((m) => Math.abs(p.x - (m.x + m.ax / 2 + m.w / 2)) < m.ax / 2 + m.w / 2 + 5 && Math.abs(p.y - m.y) < 6)
    || g.jets.some((j) => Math.abs(p.x - j.x) < 5 && Math.abs(p.y - j.y) < 5);
  const key = (s) => {
    const p = s.p;
    const ph = moversNear(p) ? Math.round((s.tw * 8)) % 48 : 0;
    return `${Math.round(p.x * 5)},${Math.round(p.y * 4)},${p.climb ? 1 : 0},${ph}`;
  };
  const start = snapshot(g);
  const seen = new Map([[key(start), null]]);
  const queue = [{ s: start, path: null }];
  let qi = 0, found = null, sims = 0;
  const goal = () => g.mode === 'bossIntro' || g.bossState !== 'none';
  const run = (input, n) => { const out = []; for (let i = 0; i < n; i++) { step(g, input); out.push(input); sims++; if (g.mode !== 'play') break; } return out; };
  const settle = (out) => { // 地面に立つ・はしごにつかまる・死ぬまで手を離して待つ
    for (let i = 0; i < 240 && g.mode === 'play' && !g.player.ground && !g.player.climb; i++) { step(g, {}); out.push({}); sims++; }
  };
  const limit = opts.limit || 400000;
  while (qi < queue.length && !found && sims < 60_000_000 && seen.size < limit) {
    const node = queue[qi++];
    for (const a of ACTIONS) {
      restore(g, node.s);
      const p0 = g.player;
      if (a.climb && !p0.climb) { const col = Math.floor(p0.x); const near = Math.abs(p0.x - col - 0.5) < 0.42; if (!near) continue; }
      let out = [];
      if (a.hold) { out = run(a.hold, a.ticks); if (g.mode === 'play' && !g.player.climb) settle(out); }
      else if (a.jump != null) {
        if (!g.player.ground) continue;
        const h = { jump: true }; if (a.jump > 0) h.right = true; if (a.jump < 0) h.left = true;
        if (g.prevIn.jump) { out = run({}, 1); if (!g.player.ground) continue; } // 一度ボタンを離してから押す
        out = out.concat(run(h, 1));
        const h2 = { ...h, jump: true };
        for (let i = 0; i < 200 && g.mode === 'play' && !g.player.ground && !g.player.climb && !goal(); i++) { step(g, h2); out.push(h2); sims++; }
      } else if (a.climb) {
        const h = a.climb > 0 ? { up: true } : { down: true };
        out = run(h, 2);
        if (!g.player.climb) continue;
        for (let i = 0; i < 400 && g.mode === 'play' && g.player.climb; i++) { step(g, h); out.push(h); sims++; }
        if (g.mode === 'play') settle(out);
      }
      if (goal()) { found = { node, out }; break; }
      if (g.mode !== 'play' || !g.player.armor) continue; // 死んだ・被弾した（無傷で通れる道だけを数える）
      const s = snapshot(g);
      const k = key(s);
      if (seen.has(k)) continue;
      const nn = { s, path: { parent: node, out } };
      seen.set(k, nn); queue.push(nn);
    }
  }
  if (!found) {
    // どこまで行けたか（最も進んだ地点）
    let best = null;
    for (const n of queue) { const v = def.vertical ? n.s.p.y : n.s.p.x; if (!best || v > best.v) best = { v, x: n.s.p.x, y: n.s.p.y }; }
    return { ok: false, best, states: seen.size, sims };
  }
  const chunks = [found.out];
  for (let n = found.node; n && n.path; n = n.path.parent) chunks.push(n.path.out);
  const inputs = chunks.reverse().flat();
  return { ok: true, inputs, seconds: inputs.length / 60, states: seen.size, sims };
}

// 操作列を新しいゲームで再生して、本当にボスの間へ着くか確かめる
export function replay(index, inputs, opts = {}) {
  const g = createGame({ stage: index, noEnemies: !opts.enemies, god: !!opts.god, difficulty: opts.difficulty || 'hard' });
  g.mode = 'play'; g.time = 9999;
  for (const inp of inputs) { step(g, inp); if (g.mode === 'bossIntro' || g.bossState !== 'none') return { ok: true, g }; if (g.mode === 'dying' || g.mode === 'gameover') return { ok: false, g, why: 'died', at: { x: g.player.x, y: g.player.y } }; }
  return { ok: false, g, why: 'end', at: { x: g.player.x, y: g.player.y } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv[2] ? [Number(process.argv[2]) - 1] : [0, 1, 2, 3, 4, 5];
  for (const i of only) {
    const t0 = Date.now();
    const r = solveStage(i);
    const rp = r.ok ? replay(i, r.inputs) : null;
    console.log(`ステージ ${i + 1}: ${r.ok ? `到達可（操作 ${r.seconds.toFixed(1)} 秒・再生 ${rp.ok ? 'OK' : 'NG ' + rp.why}）` : `到達不可 最遠 x=${r.best.x.toFixed(1)} y=${r.best.y.toFixed(1)}`} 状態 ${r.states} / ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
}
