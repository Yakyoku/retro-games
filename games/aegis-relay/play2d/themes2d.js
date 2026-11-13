// AEGIS RELAY 2D — エリア（テーマ）ごとの絵づくりの設定。色の基準は shared/rules.js の THEMES で、ここは 2D の追加分だけ
// neb = 星雲の 3 色（ガス・第二のガス・明るい芯）、planet = 天体、cloud = 雲の色、amb = 環境の粒、fall = 縁から落ちるもの
export const ART = {
  ash:    { neb: ['#3d55a8', '#6a3fa8', '#a9c0ff'], cloud: '#93a3cc', amb: 'ash',    fall: 'sand',  crystal: '#7fd8ff',
            planet: { type: 'rock', R: 46, x: 196, y: 92, c: ['#a4a9ba', '#5c6174', '#2c3040'], atmo: '#8fb0ff', crater: 1 } },
  ice:    { neb: ['#1f7fb8', '#2a4fc0', '#bff4ff'], cloud: '#bfe6ff', amb: 'snow',   fall: 'snow',  crystal: '#a8f0ff',
            planet: { type: 'gas', R: 38, x: 52, y: 84, c: ['#d8f2ff', '#7fb6e0', '#3a6ea8'], atmo: '#a8e8ff', ring: { r0: 1.35, r1: 2.1, tilt: 0.34, rot: -0.35, col: '#cfeaff' } } },
  ember:  { neb: ['#a8321c', '#7a1c3a', '#ffb070'], cloud: '#c8785a', amb: 'ember',  fall: 'lava',  crystal: '#ff9a4a',
            planet: { type: 'lava', R: 40, x: 188, y: 70, c: ['#3a1410', '#1a0808', '#ff7a2a'], atmo: '#ff7a3a' } },
  mech:   { neb: ['#1f6a6a', '#2a4460', '#9cffd0'], cloud: '#8fb0b0', amb: 'spark',  fall: 'spark', crystal: '#9cffd0',
            planet: { type: 'city', R: 44, x: 44, y: 100, c: ['#56666c', '#2a3438', '#0e1416'], atmo: '#7fffd0' } },
  moss:   { neb: ['#1f8a5a', '#1c5a7a', '#d6ff8a'], cloud: '#a8d8b0', amb: 'spore',  fall: 'water', crystal: '#d6ff8a',
            planet: { type: 'earth', R: 42, x: 192, y: 96, c: ['#3a9a6a', '#1c5a8a', '#e8fff0'], atmo: '#8affc8' } },
  gold:   { neb: ['#a8741c', '#7a3a1c', '#ffe9a0'], cloud: '#e0c890', amb: 'gold',   fall: 'gold',  crystal: '#ffe08a',
            planet: { type: 'gas', R: 34, x: 60, y: 76, c: ['#ffe6a8', '#d09a48', '#7a4a18'], atmo: '#ffd890', ring: { r0: 1.3, r1: 2.3, tilt: 0.22, rot: 0.3, col: '#ffe0a0' } } },
  obsid:  { neb: ['#5a2aa8', '#2a1c6a', '#c99cff'], cloud: '#9a80c8', amb: 'mote',   fall: 'mote',  crystal: '#c99cff',
            planet: { type: 'rock', R: 50, x: 200, y: 110, c: ['#6a5a8a', '#2e2444', '#120c1e'], atmo: '#b080ff', night: 0.75 } },
  zenith: { neb: ['#3a4ad8', '#7a2ac8', '#ffffff'], cloud: '#d0d4ff', amb: 'light',  fall: 'light', crystal: '#ffffff',
            planet: { type: 'star', R: 26, x: 64, y: 70, c: ['#ffffff', '#c8d4ff', '#6a7aff'], atmo: '#c0c8ff' } },
};
// 主光（左上から）と縁光（右下からの青）。全キャラクター・地形で共通
export const LIGHT = { x: -0.5, y: -0.62, z: 0.6 };
{ const l = Math.hypot(LIGHT.x, LIGHT.y, LIGHT.z); LIGHT.x /= l; LIGHT.y /= l; LIGHT.z /= l; }
