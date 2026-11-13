// 月影の魔城（VOIDBLOOM から複製）— フレーム時間をならす。requestAnimationFrame の時刻は 1ms 前後ゆれるので、そのまま使うと
// 60Hz の論理と 120/90Hz の描画の補間が毎フレーム少しずつ前後し、細かいガタつき（ジャダー）に見える。
// 平均（EMA）の ±25% に収まるゆれは平均値で置きかえ、本当に遅れたフレームだけそのまま使う。
export function makeFrameClock() {
  let last = null, ema = 1 / 60;
  return (now) => {
    if (last == null) { last = now; return ema; }
    let raw = (now - last) / 1000; last = now;
    raw = Math.min(0.1, Math.max(0, raw));
    if (Math.abs(raw - ema) < ema * 0.25) { ema += (raw - ema) * 0.05; return ema; }
    ema += (raw - ema) * 0.25;
    return raw;
  };
}
