// 鉄骨レスキュー — 端末内保存（設定・記録・解放面）。保存形式に版を付け、欠損・破損から復旧する。
// 端末間の同期はしない。キーは作品ごとに分ける（config.SAVE_KEY）。storage は差し替え可能（テスト用）。
import { SAVE_KEY, SAVE_VERSION, DIFF_ORDER } from './config.js';

export const DEFAULT_SETTINGS = {
  difficulty: 'normal',
  volMaster: 8, volMusic: 7, volSfx: 9, volAmbient: 4, ambient: true,
  vrView: 'first',          // first（体験視点）| model（俯瞰の模型）
  vrMoveBasis: 'head',      // head（水平化した頭の向き）| stage（舞台の左右に固定）
  vrStance: 'standing',     // standing | seated
  vrHeight: 0,              // 高さの補正（m）
  vrVignette: true,         // ジャンプ・昇降の周辺減光
  vrSpatialAudio: true,     // false で 2D と同じミックス
  vrSnapTurn: 30,
  vrQuality: 'high',        // high（Quest High: 解像度倍率 1.2・フォービエーション 0.5）| standard（1.0・1.0）
  vrRefresh: 72,            // 72 | 90（90 は余裕があるときだけ）
  quality: 'auto',          // auto | ultra | high | standard
  showFps: false,
};

export function defaultData() {
  const records = {};
  for (const m of ['2d', 'vr']) for (const d of DIFF_ORDER) records[`${m}:${d}`] = { hi: 0, bestStage: 0, clears: 0 };
  return { version: SAVE_VERSION, settings: { ...DEFAULT_SETTINGS }, records, unlocked: 1, tutorialDone: false };
}

// 読み込んだデータを検証して、足りない・壊れた項目を既定値で埋める（何が直ったかを返す）
export function sanitize(raw) {
  const fixes = [];
  const base = defaultData();
  if (!raw || typeof raw !== 'object') return { data: base, fixes: ['形式が不正なので初期化'] };
  if (raw.version !== SAVE_VERSION) fixes.push(`版 ${raw.version} → ${SAVE_VERSION}`);
  const out = base;
  const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : (fixes.push('設定がない'), {});
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (s[k] === undefined) continue;
    if (typeof s[k] !== typeof v) { fixes.push(`設定 ${k} の型が不正`); continue; }
    if (typeof v === 'number' && !Number.isFinite(s[k])) { fixes.push(`設定 ${k} が数でない`); continue; }
    out.settings[k] = s[k];
  }
  for (const k of ['volMaster', 'volMusic', 'volSfx', 'volAmbient']) out.settings[k] = Math.max(0, Math.min(10, Math.round(out.settings[k])));
  if (!DIFF_ORDER.includes(out.settings.difficulty)) { out.settings.difficulty = 'normal'; fixes.push('難易度が不正'); }
  if (!['first', 'model'].includes(out.settings.vrView)) out.settings.vrView = 'first';
  if (!['head', 'stage'].includes(out.settings.vrMoveBasis)) out.settings.vrMoveBasis = 'head';
  if (!['standing', 'seated'].includes(out.settings.vrStance)) out.settings.vrStance = 'standing';
  if (!['auto', 'ultra', 'high', 'standard'].includes(out.settings.quality)) out.settings.quality = 'auto';
  if (!['high', 'standard'].includes(out.settings.vrQuality)) out.settings.vrQuality = 'high';
  if (![72, 90].includes(out.settings.vrRefresh)) out.settings.vrRefresh = 72;
  out.settings.vrHeight = Math.max(-0.6, Math.min(0.6, out.settings.vrHeight));
  if (raw.records && typeof raw.records === 'object') {
    for (const key of Object.keys(out.records)) {
      const r = raw.records[key];
      if (!r) continue;
      const hi = Number(r.hi), bs = Number(r.bestStage), cl = Number(r.clears);
      if (Number.isFinite(hi) && hi >= 0) out.records[key].hi = Math.floor(hi); else fixes.push(`記録 ${key} が不正`);
      if (Number.isFinite(bs) && bs >= 0 && bs <= 4) out.records[key].bestStage = Math.floor(bs);
      if (Number.isFinite(cl) && cl >= 0) out.records[key].clears = Math.floor(cl);
    }
  } else fixes.push('記録がない');
  const u = Number(raw.unlocked);
  out.unlocked = Number.isFinite(u) ? Math.max(1, Math.min(4, Math.floor(u))) : (fixes.push('解放面が不正'), 1);
  out.tutorialDone = !!raw.tutorialDone;
  return { data: out, fixes };
}

export class Save {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null), key = SAVE_KEY) {
    this.storage = storage; this.key = key; this.fixes = []; this.recovered = false;
    this.data = this.load();
  }
  _get(k) { try { return this.storage ? this.storage.getItem(k) : null; } catch { return null; } }
  _set(k, v) { try { if (this.storage) this.storage.setItem(k, v); return true; } catch { return false; } }
  load() {
    const txt = this._get(this.key);
    if (txt == null) return defaultData();
    let raw = null;
    try { raw = JSON.parse(txt); } catch { raw = null; }
    if (raw == null) {
      // 本体が壊れていたら、最後に正しく書けた控えから戻す
      this.recovered = true;
      const bak = this._get(this.key + '.bak');
      try { raw = JSON.parse(bak); this.fixes.push('保存データが壊れていたので控えから復旧'); } catch { raw = null; this.fixes.push('保存データが壊れていたので初期化'); }
    }
    const { data, fixes } = sanitize(raw);
    this.fixes.push(...fixes);
    if (fixes.length) this.recovered = true;
    return data;
  }
  save() {
    const txt = JSON.stringify(this.data);
    const prev = this._get(this.key);
    if (prev) { try { JSON.parse(prev); this._set(this.key + '.bak', prev); } catch { /* 壊れた本体は控えにしない */ } }
    return this._set(this.key, txt);
  }
  reset() { this.data = defaultData(); this.save(); }
  get settings() { return this.data.settings; }
  setSetting(k, v) { this.data.settings[k] = v; this.save(); }
  // 通しプレイの結果だけを記録へ入れる（練習・面選択・切替後は入れない）
  recordRun({ mode, difficulty, score, stageReached, cleared, practice }) {
    const key = `${mode}:${difficulty}`;
    const r = this.data.records[key];
    if (!r || practice) return false;
    let changed = false;
    if (score > r.hi) { r.hi = score; changed = true; }
    if (stageReached > r.bestStage) { r.bestStage = stageReached; changed = true; }
    if (cleared) { r.clears++; changed = true; }
    this.save();
    return changed;
  }
  unlock(stageCount) { if (stageCount > this.data.unlocked) { this.data.unlocked = Math.min(4, stageCount); this.save(); } }
}
