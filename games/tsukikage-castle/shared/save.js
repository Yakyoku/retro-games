// 月影の魔城 — 保存（音量・画質・操作・最高得点・到達ステージ）。ブラウザの localStorage に 1 つの JSON で持つ。
// 失敗（プライベートモード・容量・破損）しても遊べるよう、読み書きはすべて try/catch。形式の版を持ち、古い版は移す。
import { SAVE_KEY } from './config.js';

export const SAVE_VERSION = 2;
export const DEFAULTS = {
  v: SAVE_VERSION,
  difficulty: 'hard',
  quality: 'auto',
  audio: { music: 0.75, sfx: 0.85, ambient: 0.5, muteMusic: false, muteSfx: false, muteAmbient: false },
  controls: { leftHanded: false, keys: null, pad: null, touchScale: 1, rumble: true },
  vr: { scale: 1.0, distance: 1.6, height: 0, seated: false, quality: 'balanced' },
  hi: { hard: 0, easy: 0 },
  reached: { hard: 0, easy: 0 },   // 到達ステージ（0 始まり）。続きはそのステージの先頭から
  clears: { hard: 0, easy: 0 },
};

function merge(base, over) {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return over === undefined ? base : over;
  const out = { ...base };
  if (over && typeof over === 'object') for (const k of Object.keys(over)) out[k] = k in base ? merge(base[k], over[k]) : over[k];
  return out;
}
function migrate(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.v === 1) { d = { ...d, v: 2, audio: { ...(d.audio || {}), ambient: 0.5 } }; } // v1 → v2: 環境音の音量を追加
  if (d.v !== SAVE_VERSION) return null;
  return d;
}
const clampNum = (x, a, b, def) => (typeof x === 'number' && isFinite(x) ? Math.min(b, Math.max(a, x)) : def);
function sanitize(d) {
  d.difficulty = d.difficulty === 'easy' ? 'easy' : 'hard';
  for (const k of ['music', 'sfx', 'ambient']) d.audio[k] = clampNum(d.audio[k], 0, 1, DEFAULTS.audio[k]);
  for (const m of ['hard', 'easy']) { d.hi[m] = clampNum(d.hi[m], 0, 1e9, 0) | 0; d.reached[m] = clampNum(d.reached[m], 0, 5, 0) | 0; d.clears[m] = clampNum(d.clears[m], 0, 1e6, 0) | 0; }
  d.vr.scale = clampNum(d.vr.scale, 0.6, 1.6, 1); d.vr.distance = clampNum(d.vr.distance, 0.9, 3, 1.6); d.vr.height = clampNum(d.vr.height, -0.6, 0.6, 0);
  return d;
}

export function loadSave(storage = globalThis.localStorage) {
  let status = 'ok';
  let data = null;
  try {
    const raw = storage && storage.getItem(SAVE_KEY);
    if (raw) { data = migrate(JSON.parse(raw)); if (!data) status = 'reset'; }
  } catch (e) { status = storage ? 'corrupt' : 'unavailable'; }
  const d = sanitize(merge(structuredClone(DEFAULTS), data || {}));
  return { data: d, status };
}
export function writeSave(d, storage = globalThis.localStorage) {
  try { storage.setItem(SAVE_KEY, JSON.stringify(d)); return true; } catch (e) { return false; }
}
