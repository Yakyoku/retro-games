// Sky Climber VR — 端末内の保存（設定・進行・自己ベスト）。保存名は作品ごとに分ける（skyclimber-yk.v1.*）。
// 保存できない環境（プライベートモード等）でも遊べるように、失敗はメモリーに持って続行し、理由を返す。
const PREFIX = 'skyclimber-yk.v1.';
export const DEFAULT_SETTINGS = {
  difficulty: 'standard', vrControl: 'direct', gripMode: 'hold', stance: 'stand', height: 170, reach: 1.0, speed: 1.0, pull: 1.0, grabAssist: 1.0,
  vignette: true, fallFx: true, audioMode: 'vr', vol: { master: 0.9, bgm: 0.7, sfx: 0.9, voice: 0.9, amb: 0.6, guide: 0.8 },
  mute: { master: false, bgm: false, sfx: false, voice: false, amb: false, guide: false }, quality: 'auto', guideRate: 1.0, markers: true,
};
const mem = {};
export class Store {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    this.s = storage; this.ok = true; this.error = null;
    try { const k = PREFIX + '__probe'; this.s.setItem(k, '1'); this.s.removeItem(k); } catch (e) { this.ok = false; this.error = '端末に保存できません（プライベートモードや保存の制限）。設定と記録はこの画面を閉じるまでだけ有効です。'; }
  }
  get(key, def) {
    try { const v = this.ok ? this.s.getItem(PREFIX + key) : mem[key]; return v == null ? def : JSON.parse(v); } catch (e) { return def; }
  }
  set(key, val) {
    const v = JSON.stringify(val);
    try { if (this.ok) this.s.setItem(PREFIX + key, v); else mem[key] = v; return true; } catch (e) { mem[key] = v; this.ok = false; this.error = '保存に失敗しました（容量不足など）。'; return false; }
  }
  settings() { const s = this.get('settings', {}); return { ...DEFAULT_SETTINGS, ...s, vol: { ...DEFAULT_SETTINGS.vol, ...(s.vol || {}) }, mute: { ...DEFAULT_SETTINGS.mute, ...(s.mute || {}) } }; }
  saveSettings(s) { return this.set('settings', s); }
  progress() { return this.get('progress', { cleared: {}, run: null }); }
  saveProgress(p) { return this.set('progress', p); }
  // 自己ベストは難易度と操作方式の組で分ける
  bestKey(difficulty, control) { return `${difficulty}|${control}`; }
  best(difficulty, control) { return this.get('best', {})[this.bestKey(difficulty, control)] || 0; }
  submitBest(difficulty, control, score) {
    const all = this.get('best', {}), k = this.bestKey(difficulty, control);
    const isNew = score > (all[k] || 0); if (isNew) { all[k] = score; this.set('best', all); }
    return isNew;
  }
  allBest() { return this.get('best', {}); }
}
