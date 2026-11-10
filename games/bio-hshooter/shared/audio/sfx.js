// VOIDBLOOM — 効果音（FM 6・7 と PCM 2・3 を使う。すべて新しく作った音）
// fm の手順: [tick(1/120 秒), 'on', MIDI, 音色, 音量, 音程の滑り(半音/秒), エコー] / [tick, 'off'] / [tick, 'slide', 半音/秒]
// pcm の手順: [tick, 'pcm', サンプル名, 音程(半音), 音量, エコー]
const fm = (prio, steps, len) => ({ ch: 'fm', prio, steps, len });
const pcm = (prio, steps, len) => ({ ch: 'pcm', prio, steps, len });

export const SFX = {
  shot: fm(1, [[0, 'on', 84, 16, 0.32, -60], [4, 'off']], 10),
  laserC: fm(3, [[0, 'on', 91, 14, 0.4, -40], [2, 'slide', -90], [10, 'off']], 24),
  laserM: fm(3, [[0, 'on', 88, 14, 0.36, 80], [5, 'slide', -150], [12, 'off']], 26),
  laserA: fm(3, [[0, 'on', 70, 15, 0.3, 30], [4, 'on', 74, 14, 0.3, -60], [12, 'off']], 24),
  crawlHit: pcm(1, [[0, 'pcm', 'hat', -5, 0.4]], 6),
  charge: fm(2, [[0, 'on', 55, 16, 0.22, 26], [70, 'off']], 72),
  chargeFull: fm(5, [[0, 'on', 96, 18, 0.35, 0], [6, 'on', 103, 18, 0.3, 0], [14, 'off']], 30),
  burst: fm(6, [[0, 'on', 48, 15, 0.6, -30], [2, 'on', 60, 14, 0.55, -50], [18, 'off']], 50),
  burstHit: pcm(4, [[0, 'pcm', 'crunch', -2, 0.8]], 30),
  podLaunch: fm(4, [[0, 'on', 64, 14, 0.42, 70], [16, 'off']], 30),
  podRecall: fm(4, [[0, 'on', 82, 14, 0.38, -70], [16, 'off']], 30),
  podAttach: fm(4, [[0, 'on', 76, 18, 0.4, 0], [5, 'on', 83, 18, 0.34, 0], [12, 'off']], 26),
  podGet: fm(6, [[0, 'on', 64, 18, 0.45, 0], [8, 'on', 71, 18, 0.45, 0], [16, 'on', 76, 18, 0.45, 0], [24, 'on', 83, 18, 0.45, 0], [44, 'off']], 70),
  powerUp: fm(5, [[0, 'on', 72, 18, 0.45, 0], [6, 'on', 79, 18, 0.45, 0], [12, 'on', 84, 18, 0.45, 0], [30, 'off']], 50),
  speedUp: fm(5, [[0, 'on', 60, 16, 0.42, 110], [20, 'off']], 36),
  bitGet: fm(5, [[0, 'on', 79, 18, 0.42, 0], [7, 'on', 74, 18, 0.42, 0], [14, 'on', 86, 18, 0.42, 0], [32, 'off']], 50),
  hit: pcm(0, [[0, 'pcm', 'hat', 3, 0.35]], 4),
  tink: fm(0, [[0, 'on', 100, 18, 0.18, 0], [3, 'off']], 8),
  block: pcm(0, [[0, 'pcm', 'metal', 6, 0.3]], 5),
  explodeS: pcm(2, [[0, 'pcm', 'noise', 4, 0.7]], 30),
  explodeM: pcm(4, [[0, 'pcm', 'boom', 3, 0.85]], 50),
  explodeL: pcm(8, [[0, 'pcm', 'rumble', 0, 1, 0.5]], 200),
  blockBreak: pcm(3, [[0, 'pcm', 'crunch', 0, 0.8]], 30),
  death: pcm(9, [[0, 'pcm', 'boom', -3, 1, 0.4]], 140),
  deathFm: fm(9, [[0, 'on', 70, 15, 0.5, -24], [80, 'off']], 120),
  extend: fm(7, [[0, 'on', 76, 18, 0.45, 0], [10, 'on', 81, 18, 0.45, 0], [20, 'on', 88, 18, 0.45, 0], [30, 'on', 93, 18, 0.45, 0], [60, 'off']], 90),
  warning: fm(7, [[0, 'on', 57, 13, 0.4, 0], [30, 'off'], [40, 'on', 57, 13, 0.4, 0], [70, 'off'], [80, 'on', 57, 13, 0.4, 0], [110, 'off'], [120, 'on', 57, 13, 0.4, -6], [180, 'off']], 200),
  warnBeam: fm(6, [[0, 'on', 79, 15, 0.3, 40], [60, 'off']], 70),
  ring: fm(2, [[0, 'on', 93, 16, 0.25, -120], [8, 'off']], 16),
  bossDown: pcm(9, [[0, 'pcm', 'rumble', -2, 1, 0.6]], 280),
  // 画面操作
  select: fm(1, [[0, 'on', 81, 16, 0.3, 0], [4, 'off']], 10),
  start: fm(6, [[0, 'on', 69, 18, 0.45, 0], [8, 'on', 76, 18, 0.45, 0], [16, 'on', 81, 18, 0.45, 0], [40, 'off']], 60),
  pause: fm(6, [[0, 'on', 88, 16, 0.3, 0], [6, 'on', 76, 16, 0.3, 0], [12, 'off']], 20),
};
export const SFX_LABEL = {
  shot: '通常弾', laserC: '青: 貫く槍（LANCE）', laserM: '紅: 跳ねる光（RICOCHET）', laserA: '琥珀: 這う光（CRAWLER）', crawlHit: '這う光が着地',
  charge: '溜め開始', chargeFull: '溜め満タン', burst: '溜め撃ち BLOOM BURST', burstHit: '溜め撃ちが壁に当たる',
  podLaunch: 'SEED 切り離し', podRecall: 'SEED 呼び戻し', podAttach: 'SEED 装着', podGet: 'SEED 入手', powerUp: '結晶で強化', speedUp: '加速', bitGet: '僚機 SPORELET 入手',
  hit: '命中', tink: '装甲で弾かれる', block: 'SEED が敵弾を防ぐ', explodeS: '爆発（小）', explodeM: '爆発（中）', explodeL: '爆発（大）', blockBreak: '壁を壊す',
  death: '被弾', deathFm: '被弾（FM）', extend: '残機が増えた', warning: 'ボス接近の警告', warnBeam: '光線の予告', ring: '機雷の炸裂', bossDown: 'ボス撃破',
  select: 'メニュー選択', start: 'ゲーム開始', pause: '一時停止',
};
