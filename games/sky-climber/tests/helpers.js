// テスト用: 単純な登攀ボット（下にある手を上へ伸ばし、届いたら中立に戻す）
export function classicBot(game) {
  let phase = { L: 0, R: 0 }, which = 'L';
  return () => {
    const c = game.climber, input = { L: null, R: null };
    const L = c.hands.L, R = c.hands.R;
    // 伸ばしている手は中立に戻して保持させる
    for (const s of ['L', 'R']) if (c.hands[s].reach && c.hands[s].reach.t >= 1) phase[s] = 0;
    if (L.reach || R.reach) return input;
    // 身体が目標に追いつくまで待つ
    const t = c.bodyTarget(); if (t && Math.hypot(t.x - c.body.x, t.y - c.body.y) > 0.08) return input;
    // 下の手（同じなら交互）を上へ
    let s = L.hold == null ? 'L' : R.hold == null ? 'R' : (Math.abs(L.y - R.y) < 0.05 ? which : (L.y < R.y ? 'L' : 'R'));
    which = s === 'L' ? 'R' : 'L';
    // 真上に無ければ斜め上も試す
    for (const d of [{ x: 0, y: 1 }, { x: 0.5, y: 1 }, { x: -0.5, y: 1 }, { x: 1, y: 0.3 }, { x: -1, y: 0.3 }]) {
      if (c.findTarget(s, d.x, d.y)) { input[s] = d; return input; }
    }
    s = s === 'L' ? 'R' : 'L';
    for (const d of [{ x: 0, y: 1 }, { x: 0.5, y: 1 }, { x: -0.5, y: 1 }]) if (c.findTarget(s, d.x, d.y)) { input[s] = d; return input; }
    return input;
  };
}
export function runBot(game, seconds) {
  const bot = classicBot(game);
  for (let i = 0; i < seconds * 60; i++) {
    game.step({ classic: bot() });
    if (game.state === 'clear' || game.state === 'over') break;
  }
  return game;
}
