// スティック・キーの値を「8 方向のレバー」に変換する（ドリフト対策のヒステリシスつき）
export const DEAD = { enter: 0.5, exit: 0.32 };
export function stickToDir(x, y, prevOn) {
  const m = Math.hypot(x, y);
  const on = prevOn ? m > DEAD.exit : m > DEAD.enter;
  if (!on) return null;
  const a = Math.round(Math.atan2(y, x) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: Math.round(Math.cos(a) * 1000) / 1000, y: Math.round(Math.sin(a) * 1000) / 1000 };
}
// 半径方向のデッドゾーン（UI のカーソル用）
export function radial(x, y, dz = 0.25) { const m = Math.hypot(x, y); if (m < dz) return { x: 0, y: 0 }; const k = (m - dz) / (1 - dz) / m; return { x: x * k, y: y * k }; }
// メニュー移動のくり返し（押した瞬間 → 0.35 秒後から 0.12 秒ごと）
export function makeRepeat() {
  const st = {};
  return (key, held, dt) => {
    const s = st[key] || (st[key] = { t: 0, on: false });
    if (!held) { s.on = false; s.t = 0; return false; }
    if (!s.on) { s.on = true; s.t = 0.35; return true; }
    s.t -= dt; if (s.t <= 0) { s.t = 0.12; return true; }
    return false;
  };
}
