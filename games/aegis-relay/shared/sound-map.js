// AEGIS RELAY — ゲームのできごと → 音（2D 版・3D 版で同じ表を使う）
// docs/SOUND.md の「音イベント対応表」と同じ内容。ここに無いできごと（wave・score など）は無音。
import { AREA_SONG } from './audio/songs.js';

export const EVENT_SE = {
  shot: (e) => (e.docked ? 'shotDocked' : 'shot'),
  hit: () => 'hit',
  kill: (e) => (e.big ? 'killBig' : 'kill'),
  eshot: () => 'eshot',
  die: () => 'die',
  respawn: () => 'respawn',
  partnerFree: () => 'partnerFree',
  dock: () => 'dock',
  partnerLost: () => 'partnerLost',
  twinAppear: () => 'twinAppear',
  twinBreak: () => 'twinBreak',
  twinLocked: () => 'twinLocked',
  chainStep: () => 'chainStep',
  chainBonus: () => 'chainBonus',
  chainFail: () => 'chainFail',
  sigilPing: () => 'sigilPing',
  sigil: () => 'sigil',
  dive: () => 'dive',
  extend: () => 'extend',
  coreMiss: () => 'coreMiss',
};

// 曲の切り替え。g は sim の状態。毎フレーム呼んでよい（同じ曲は二重に始めない）
export function routeSound(audio, events, g) {
  for (const e of events) {
    const f = EVENT_SE[e.t];
    if (f) audio.se(f(e), e.n);
    if (e.t === 'areaStart') audio.playMusic('start', () => { if (g.mode !== 'over' && g.phase !== 'clear') audio.playMusic(AREA_SONG(g.area)); });
    if (e.t === 'areaClear') audio.playMusic('clear');
    if (e.t === 'die') audio.stopMusic();
    if (e.t === 'respawn') audio.playMusic(coreNear(g) ? 'core' : AREA_SONG(g.area));
    if (e.t === 'coreMiss') audio.playMusic(AREA_SONG(g.area));
    if (e.t === 'gameover') audio.playMusic('over');
  }
  // エリアコアが見えたら緊張の曲へ
  const name = audio.musicName;
  if (g.mode === 'play' && g.phase === 'play' && g.player.alive && name === AREA_SONG(g.area) && coreNear(g)) audio.playMusic('core');
}
function coreNear(g) { return g.scroll > g.def.coreWy - 40 && !g.coreBroken; }
