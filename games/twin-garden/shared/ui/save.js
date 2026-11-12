// ツイン・ガーデン — 設定・ハイスコア・到達面の保存（localStorage）
// サイトごとに別のキー（2D 版と VR 版は別サイトなので、保存は共有されない）。読めない・壊れている・保存できないときも起動は続ける。

const VERSION = 1;

export function defaults() {
  return {
    v: VERSION,
    settings: {
      master: 0.8, bgm: 0.7, sfx: 0.85, ambient: 0.0, mute: false,
      audioMode: 'faithful',  // faithful（標準。追加の環境音・空間効果なし）| spatial（VR の空間演出）
      keys: null,             // null なら既定のキー配置
      quality: 'max',         // max（大画面・最高画質。内部解像度を下げない）| auto（重いときだけ下げる）
      vrQuality: 'high',      // high（Quest 3・高画質）| ultra（Quest 3・最高画質）
      vrControl: 'stick',     // stick | direct
      vrScale: 'table',       // table（卓上）| immersive（没入スケール）
      vrPosture: 'seated',    // seated | standing
      tableHeight: 0, tableDist: 0, tableSize: 1, // 調整（m・倍率）
      showTouch: 'auto',
      lastDifficulty: 'normal',
    },
    high: { easy: 0, normal: 0, hard: 0 },
    reached: { easy: 1, normal: 1, hard: 1 },  // 到達した面（1 始まり）
    practice: {},                               // 面ごとの練習の最高点（通常記録とは別）
    lessonsDone: 0,
  };
}

function clampNum(v, a, b, d) { return typeof v === 'number' && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; }
function pick(v, list, d) { return list.includes(v) ? v : d; }

/** 読んだデータを検査して、足りない・おかしい値を既定値で埋める */
export function sanitize(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  const s = raw.settings || {};
  const o = d.settings;
  for (const k of ['master', 'bgm', 'sfx', 'ambient']) o[k] = clampNum(s[k], 0, 1, o[k]);
  o.mute = !!s.mute;
  o.audioMode = pick(s.audioMode, ['faithful', 'spatial'], o.audioMode);
  o.quality = pick(s.quality, ['max', 'auto'], o.quality);
  o.vrQuality = pick(s.vrQuality, ['high', 'ultra'], o.vrQuality);
  o.vrControl = pick(s.vrControl, ['stick', 'direct'], o.vrControl);
  o.vrScale = pick(s.vrScale, ['table', 'immersive'], o.vrScale);
  o.vrPosture = pick(s.vrPosture, ['seated', 'standing'], o.vrPosture);
  o.tableHeight = clampNum(s.tableHeight, -0.4, 0.4, 0);
  o.tableDist = clampNum(s.tableDist, -0.4, 0.6, 0);
  o.tableSize = clampNum(s.tableSize, 0.6, 1.6, 1);
  o.showTouch = pick(s.showTouch, ['auto', 'on', 'off'], 'auto');
  o.lastDifficulty = pick(s.lastDifficulty, ['practice', 'easy', 'normal', 'hard'], 'normal');
  if (s.keys && typeof s.keys === 'object') {
    const keys = {};
    for (const [k, v] of Object.entries(s.keys)) if (typeof v === 'string' && /^[A-Za-z0-9]{2,24}$/.test(v)) keys[k] = v;
    o.keys = keys;
  }
  for (const k of ['easy', 'normal', 'hard']) {
    d.high[k] = Math.floor(clampNum(raw.high?.[k], 0, 1e9, 0));
    d.reached[k] = Math.floor(clampNum(raw.reached?.[k], 1, 12, 1));
  }
  if (raw.practice && typeof raw.practice === 'object') for (const [k, v] of Object.entries(raw.practice)) if (/^\d{1,2}$/.test(k)) d.practice[k] = Math.floor(clampNum(v, 0, 1e9, 0));
  d.lessonsDone = Math.floor(clampNum(raw.lessonsDone, 0, 3, 0));
  return d;
}

export class Store {
  constructor(key) {
    this.key = key;
    this.ok = true;
    this.notice = '';
    let raw = null;
    try {
      const txt = localStorage.getItem(key);
      if (txt) raw = JSON.parse(txt);
    } catch (e) {
      this.notice = '保存データを読めなかったため、初期設定で始めます';
      raw = null;
    }
    this.data = sanitize(raw);
  }
  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); this.ok = true; }
    catch (e) { this.ok = false; this.notice = 'この端末では保存できません（設定は今回だけ有効です）'; }
    return this.ok;
  }
}
