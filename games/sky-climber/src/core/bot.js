// Sky Climber VR — 自動で登るボット（トップページの代表映像と、テストに使う）。
// 下にある手を上へ伸ばし、届いたら中立に戻す。上に無ければ斜め上・横を試す。
export function classicBot(game) {
  let which = 'L';
  return () => {
    const c = game.climber, input = { L: null, R: null };
    const L = c.hands.L, R = c.hands.R;
    if (L.reach || R.reach) return input;
    const t = c.bodyTarget(); if (t && Math.hypot(t.x - c.body.x, t.y - c.body.y) > 0.08) return input;
    let s = L.hold == null ? 'L' : R.hold == null ? 'R' : (Math.abs(L.y - R.y) < 0.05 ? which : (L.y < R.y ? 'L' : 'R'));
    which = s === 'L' ? 'R' : 'L';
    for (const d of [{ x: 0, y: 1 }, { x: 0.5, y: 1 }, { x: -0.5, y: 1 }, { x: 1, y: 0.3 }, { x: -1, y: 0.3 }]) if (c.findTarget(s, d.x, d.y)) { input[s] = d; return input; }
    s = s === 'L' ? 'R' : 'L';
    for (const d of [{ x: 0, y: 1 }, { x: 0.5, y: 1 }, { x: -0.5, y: 1 }]) if (c.findTarget(s, d.x, d.y)) { input[s] = d; return input; }
    return input;
  };
}
