// Sky Climber VR — フレーム時間をならす。requestAnimationFrame の時刻のゆれ（±1ms）で、60Hz の論理と 72/90/120Hz の描画の補間が
// 前後してガタつくのを防ぐ。平均の ±25% に収まるゆれは平均値に置きかえ、本当に遅れたフレームだけそのまま使う。
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
