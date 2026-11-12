// 保存（設定・ハイスコア・ステージ解放）。キーにアプリ名・版（2d / vr）・データ版を含め、別アプリと混ざらないようにする。
// 保存できない（プライベートブラウズ等）・壊れている場合も、既定値で遊べる。
export const SAVE_VERSION = 1;
const DEFAULTS = {
  v: SAVE_VERSION,
  hi: 0,
  cleared: [],              // クリアしたステージ番号（0 = チュートリアル）
  settings: { difficulty: 'normal', quality: 'auto', hints: true, volume: null, retro: false,
    vr: { locomotion: 'teleport', snap: 30, leftHanded: false, seated: false, heightOffset: 0, comfortVignette: true, refresh: 72, scale: 'high', uiSounds: true } },
};

export class Save {
  constructor(mode) {
    this.key = `night-shaft:${mode}:v${SAVE_VERSION}`;
    this.ok = true; this.error = null;
    this.data = this.load();
  }
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return structuredClone(DEFAULTS);
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || d.v !== SAVE_VERSION) throw new Error('版が違う保存データ');
      return { ...structuredClone(DEFAULTS), ...d, settings: { ...DEFAULTS.settings, ...(d.settings || {}), vr: { ...DEFAULTS.settings.vr, ...((d.settings || {}).vr || {}) } },
        cleared: Array.isArray(d.cleared) ? d.cleared.filter((n) => Number.isInteger(n)) : [], hi: Number.isFinite(d.hi) ? d.hi : 0 };
    } catch (e) {
      this.error = String(e.message || e);
      return structuredClone(DEFAULTS);
    }
  }
  write() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); this.ok = true; }
    catch (e) { this.ok = false; this.error = String(e.message || e); }
    return this.ok;
  }
  unlocked(i) { return i <= 1 || this.data.cleared.includes(i - 1); }
  markCleared(i) { if (!this.data.cleared.includes(i)) this.data.cleared.push(i); this.write(); }
  submitScore(s) { if (s > this.data.hi) { this.data.hi = s; this.write(); return true; } return false; }
}
