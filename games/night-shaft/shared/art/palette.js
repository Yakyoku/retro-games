// 人物と建物の配色（2D・3D 共通）。人物はこのセッションで設計したオリジナル（ART_REFERENCE.md）。
export const LOOK = {
  agent: { kind: 'agent', coat: '#27385a', coatDark: '#19243d', coatLight: '#3a5281', pants: '#2b3142', pantsDark: '#1d2230',
    skin: '#eab995', skinDark: '#c9906c', hair: '#1b1613', shoe: '#101114', gun: '#c8d1dc', gunDark: '#7c8794', scarf: '#ff9b3a', scarfDark: '#d2701c', glove: '#2a2a2e' },
  guard: [
    { kind: 'guard', coat: '#842538', coatDark: '#5a1826', coatLight: '#a8354b', pants: '#3a2b31', pantsDark: '#281d22', skin: '#d9a685', skinDark: '#b3815f',
      helmet: '#a3acb7', helmetDark: '#6e7782', visor: '#d8f0ff', shoe: '#141214', gun: '#4a4f57', gunDark: '#2a2d33', glove: '#1e1e22' },
    { kind: 'guard', coat: '#842538', coatDark: '#5a1826', coatLight: '#a8354b', pants: '#3a2b31', pantsDark: '#281d22', skin: '#d9a685', skinDark: '#b3815f',
      helmet: '#a3acb7', helmetDark: '#6e7782', visor: '#d8f0ff', shoe: '#141214', gun: '#4a4f57', gunDark: '#2a2d33', glove: '#1e1e22', band: '#f4c430' },
    { kind: 'guard', coat: '#6e2132', coatDark: '#4b1622', coatLight: '#913046', pants: '#2f2a2e', pantsDark: '#201c1f', skin: '#d9a685', skinDark: '#b3815f',
      helmet: '#596270', helmetDark: '#3b424d', visor: '#ffd9a0', shoe: '#141214', gun: '#4a4f57', gunDark: '#2a2d33', glove: '#1e1e22', vest: '#4a5260', vestDark: '#353b46' },
  ],
};

export const THEME = {
  training: { wall: '#5f6873', wallLow: '#48505a', wallTop: '#6c7682', trim: '#f2c230', floor: '#2b2f35', floorTop: '#8b939d', cover: 'crate', accent: '#f2c230', deco: 'stripes' },
  office:   { wall: '#7c6c5c', wallLow: '#5a4a3e', wallTop: '#8a7a68', trim: '#c7a77a', floor: '#2c2420', floorTop: '#a08467', cover: 'desk', accent: '#e8c48a', deco: 'office' },
  lab:      { wall: '#6b8790', wallLow: '#4c6470', wallTop: '#7b98a1', trim: '#9fe3e8', floor: '#1f2a30', floorTop: '#9db3ba', cover: 'cabinet', accent: '#7fe0e6', deco: 'lab' },
  security: { wall: '#596055', wallLow: '#3f453c', wallTop: '#666e61', trim: '#c9493f', floor: '#1e211d', floorTop: '#7f877a', cover: 'barricade', accent: '#e05a4c', deco: 'security' },
};
