// 保存（設定・ハイスコア・ステージ解放）。名前空間を作品 ID で分け、保存に失敗してもプレイは続ける
const NS = 'orbital-wings-gic:v1';

export const DEFAULT_SETTINGS = {
  master: 0.8, bgm: 0.7, sfx: 0.8, mute: false, soundEngine: 'modern',   // 'modern' | 'retro'（旧 arrange 設定は廃止）
  autoFire: false, quality: 'auto', retro: false, vibration: true,
  invertDepth: false, spatial: false,
  vrScale: 1.0, vrHeight: 0.0, vrDistance: 0.0,
};

let mem = null, ok = true, lastError = '';
function load() {
  if (mem) return mem;
  mem = { settings: { ...DEFAULT_SETTINGS }, hi: {}, unlocked: { '2d': 1, '3d': 1 }, cleared: {} };
  try {
    const raw = localStorage.getItem(NS);
    if (raw) {
      const d = JSON.parse(raw);
      mem.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
      delete mem.settings.arrange;                                   // 旧設定（レトロ音源の軽いステレオ化）は廃止。音源は soundEngine で選ぶ
      if (mem.settings.soundEngine !== 'retro') mem.settings.soundEngine = 'modern';
      mem.hi = d.hi || {}; mem.unlocked = { ...mem.unlocked, ...(d.unlocked || {}) }; mem.cleared = d.cleared || {};
    }
  } catch (e) { ok = false; lastError = String(e && e.message || e); }
  return mem;
}
function persist() {
  try { localStorage.setItem(NS, JSON.stringify(mem)); ok = true; }
  catch (e) { ok = false; lastError = String(e && e.message || e); }
  return ok;
}
export const Save = {
  get settings() { return load().settings; },
  setSetting(k, v) { load().settings[k] = v; return persist(); },
  hi(key) { return load().hi[key] || 0; },
  submit(key, score) { const d = load(); if (score > (d.hi[key] || 0)) { d.hi[key] = score; persist(); return true; } return false; },
  unlocked(variant) { return load().unlocked[variant] || 1; },
  unlock(variant, n) { const d = load(); if (n > (d.unlocked[variant] || 1)) { d.unlocked[variant] = Math.min(7, n); persist(); } },
  markCleared(key) { load().cleared[key] = true; persist(); },
  get ok() { return ok; }, get error() { return lastError; },
  _reset() { mem = null; },
};
