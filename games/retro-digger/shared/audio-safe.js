// 音の読み込み。音源の読み込みや AudioContext の作成に失敗しても、ゲームは無音で遊べるようにする。
const noop = () => {};
const stub = {
  unlock: async () => {}, setVolumes: noop, setMuted: noop, play: noop, jingle: async () => {}, suspend: noop, resume: noop, stopAll: noop,
  music: { start: noop, stop: noop, setWalking: noop }, amb: { start: noop, stop: noop }, events: [], stub: true,
};
export async function loadAudio(settings) {
  try {
    const m = await import('./audio/audio.js');
    const a = m.createAudio();
    if (settings) { a.setVolumes(settings.vol); a.setMuted(!!settings.muted); }
    return a;
  } catch (e) {
    console.warn('音を使えません', e);
    if (window.__showError) window.__showError('音の初期化に失敗しました（無音で続けます）', String(e && e.stack || e));
    return stub;
  }
}
// ゲームのイベント → 効果音
export const EVENT_SFX = {
  'pump-shot': 'pump-shot', 'pump-hit': 'pump-hit', 'pump-miss': 'pump-miss', 'pump-air': 'pump-air', detach: 'detach', deflate: 'deflate',
  'recover-warn': 'recover-warn', pop: 'pop', 'ghost-warn': 'ghost-warn', 'ghost-on': 'ghost-on', 'ghost-off': 'ghost-off',
  'fire-charge': 'fire-charge', 'fire-breath': 'fire-breath', 'rock-shake': 'rock-shake', 'rock-fall': 'rock-fall', 'rock-land': 'rock-land',
  'rock-crush': 'rock-crush', dig: 'dig', extra: 'extra', 'tutorial-ok': 'tutorial-ok', step: 'step',
};
