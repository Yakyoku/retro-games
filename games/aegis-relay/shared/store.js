// AEGIS RELAY — 設定とハイスコアの保存（localStorage。サイトごとに別。保存できない環境でも遊べる）
// ・記録は「ルール区分」ごとに分ける: standard（補助なし）/ assist（自動連射あり）。混ぜない
// ・デバッグ（無敵など）を使ったプレイは保存しない
// ・壊れたデータは捨てて既定値に戻す（版番号つき）
const KEY = 'aegis-relay.v1';
export const DEFAULTS = Object.freeze({
  master: 0.8, bgm: 0.7, se: 0.8, mute: false,
  autofire: false, shake: 1, flash: 1, crt: 0, hitbox: false, uiScale: 1, touchLayout: 'stick',
  quality: 'auto',          // auto | big | quest | light | manual
  renderScale: 1,           // manual のときの倍率
  vrDist: 1.0, vrHeight: 0, vrTilt: 0, vrScale: 1.0,
});

let mem = null, ok = true;
function load() {
  if (mem) return mem;
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { ok = false; }
  let d = null;
  try { d = raw ? JSON.parse(raw) : null; } catch { d = null; }
  if (!d || d.v !== 1 || typeof d !== 'object') d = { v: 1, settings: {}, hi: {} };
  const s = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (d.settings && typeof d.settings[k] === typeof DEFAULTS[k]) s[k] = d.settings[k];
  const hi = {};
  for (const mode of ['standard', 'assist']) {
    const list = Array.isArray(d.hi?.[mode]) ? d.hi[mode] : [];
    hi[mode] = list.filter((r) => r && Number.isFinite(r.score) && r.score >= 0).slice(0, 10);
  }
  mem = { v: 1, settings: s, hi };
  return mem;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); ok = true; } catch { ok = false; } }

export const store = {
  get settings() { return load().settings; },
  set(k, v) { load().settings[k] = v; save(); },
  hiList(mode) { return load().hi[mode] || []; },
  best(mode) { const l = load().hi[mode]; return l && l[0] ? l[0].score : 0; },
  // 記録を追加。順位（0 始まり）を返す。保存しないときは -1
  record(mode, entry, tainted) {
    if (tainted || !Number.isFinite(entry.score)) return -1;
    const l = load().hi[mode] || (load().hi[mode] = []);
    l.push({ ...entry, date: new Date().toISOString().slice(0, 10) });
    l.sort((a, b) => b.score - a.score); l.length = Math.min(l.length, 10);
    save();
    return l.findIndex((r) => r.score === entry.score && r.date);
  },
  get writable() { load(); return ok; },
  reset() { mem = null; },
};
export const modeOf = (settings) => (settings.autofire ? 'assist' : 'standard');
