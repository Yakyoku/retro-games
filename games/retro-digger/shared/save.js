// 設定・進行・ハイスコアの保存（ブラウザ内 localStorage のみ。端末間の同期はしない）。
// 保存できない（プライベートモード・容量不足）、壊れている、旧形式でも、既定値で起動する。
// 記録の区別: モード（2d / 3d / vr）× 難易度 × 種別（run = 通しプレイ / practice = 練習）。VR は移動方式も分ける。
const KEY = 'retro-digger:save';
export const SAVE_VERSION = 2;

export const DEFAULT_SETTINGS = {
  vol: { master: 0.8, bgm: 0.7, sfx: 0.85, amb: 0.35 }, muted: false,
  difficulty: 'normal',
  tutorialDone: { '2d': false, '3d': false },
  // 3D / VR
  vrMove: 'step',        // 'step'（快適移動: 短いステップとフェード）| 'smooth'
  vrSpeed: 1.0,          // スムーズ移動の速さの倍率 0.7〜1.3
  vrVignette: true,      // スムーズ移動中の周辺暗転
  snapTurn: 45,          // 30 | 45
  leftHanded: false,
  mouseSens: 1.0,
  invertY: false,
  quality: 'auto',       // 'auto' | 'high' | 'standard'
  showFps: false,
};

let memory = null; // 保存できない環境では、メモリ上だけで持つ
export let saveStatus = 'ok'; // 'ok' | 'unavailable' | 'reset-corrupt' | 'migrated'

function blank() { return { v: SAVE_VERSION, settings: structuredCloneSafe(DEFAULT_SETTINGS), records: {}, progress: {} }; }
function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }

function merge(def, val) {
  if (typeof def !== 'object' || def === null || Array.isArray(def)) return typeof val === typeof def ? val : def;
  const out = {};
  for (const k of Object.keys(def)) out[k] = val && typeof val === 'object' && k in val ? merge(def[k], val[k]) : structuredCloneSafe(def[k]);
  return out;
}

export function load() {
  if (memory) return memory;
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { saveStatus = 'unavailable'; }
  let data = blank();
  if (raw) {
    try {
      const p = JSON.parse(raw);
      if (!p || typeof p !== 'object') throw new Error('bad');
      if (p.v === 1 && p.hi) { // 旧形式（v1: { v:1, hi: { '2d': n, '3d': n }, settings }）を移す
        data.settings = merge(DEFAULT_SETTINGS, p.settings || {});
        for (const m of ['2d', '3d']) if (Number.isFinite(p.hi[m])) data.records[`${m}|normal|run`] = { hi: p.hi[m], stage: 0 };
        saveStatus = 'migrated';
      } else {
        data.settings = merge(DEFAULT_SETTINGS, p.settings || {});
        if (p.records && typeof p.records === 'object') for (const [k, r] of Object.entries(p.records))
          if (r && Number.isFinite(r.hi)) data.records[k] = { hi: Math.max(0, Math.floor(r.hi)), stage: Number.isFinite(r.stage) ? r.stage : 0 };
        if (p.progress && typeof p.progress === 'object') for (const [k, n] of Object.entries(p.progress))
          if (Number.isFinite(n)) data.progress[k] = Math.max(0, Math.min(6, Math.floor(n)));
      }
    } catch { data = blank(); saveStatus = 'reset-corrupt'; }
  }
  memory = data;
  return data;
}

export function persist() {
  if (!memory) return false;
  try { localStorage.setItem(KEY, JSON.stringify(memory)); return true; }
  catch { saveStatus = 'unavailable'; return false; }
}

export const settings = () => load().settings;
export function setSetting(path, value) {
  const s = settings(); const ks = path.split('.'); let o = s;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  o[ks.at(-1)] = value; persist();
}

// 記録キー: mode = '2d' | '3d' | 'vr'。VR は移動方式も含める
export function recordKey(mode, difficulty, kind, vrMove) {
  return `${mode}${mode === 'vr' ? '-' + (vrMove || 'step') : ''}|${difficulty}|${kind}`;
}
export function getRecord(key) { return load().records[key] || { hi: 0, stage: 0 }; }
// ハイスコア更新なら true
export function submitRecord(key, score, stageReached) {
  const d = load(); const r = d.records[key] || { hi: 0, stage: 0 };
  const better = score > r.hi;
  d.records[key] = { hi: Math.max(r.hi, score), stage: Math.max(r.stage, stageReached) };
  persist();
  return better;
}
// 解放済みのステージ数（練習で選べる面）: キー = mode|difficulty
export function unlocked(mode, difficulty) { return Math.max(1, load().progress[`${mode}|${difficulty}`] || 1); }
export function unlock(mode, difficulty, n) {
  const d = load(); const k = `${mode}|${difficulty}`;
  d.progress[k] = Math.max(d.progress[k] || 1, Math.min(6, n)); persist();
}
// テスト用
export function _resetMemory() { memory = null; saveStatus = 'ok'; }
