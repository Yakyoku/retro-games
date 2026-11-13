// 月影の魔城 — 画面遷移とゲームループ（2D 版・3D/VR 版で共通）
// 読み込み → タイトル（制作注記）→ 操作説明・難易度 → プレイ → ボス → 結果 → 次ステージ → 最終クリア
// 物理は 60Hz 固定で回し、描画は補間する（リフレッシュレートで速さや難しさが変わらない）。
import { createGame, step, nextStage, retryStage, startLoop2, debugWarpBoss } from './core.js';
import { TICK, DIFFICULTY, QUALITY, WEAPONS } from './config.js';
import { getStages } from './stages.js';
import { loadSave, writeSave } from './save.js';
import { Input, ACTIONS, keyLabel, padLabel, padStyle, DEFAULT_KEYS, DEFAULT_PAD } from './input.js';
import { GameAudio } from './audio/audio.js';

export const CREDIT = '本作は、Claude Codeのクラウドセッションで制作しました。';
export const REFERENCE = '参考作品：1985年アーケード版『魔界村』／非公式作品';
export const TITLE = '月影の魔城';

export class GameApp {
  constructor(opts) {
    this.variant = opts.variant; // '2d' | '3d'
    this.otherUrl = opts.otherUrl || null;
    const sv = loadSave();
    this.save = sv.data; this.saveStatus = sv.status;
    this.input = new Input(this.save.controls);
    this.audio = new GameAudio();
    this.audio.vol = { ...this.audio.vol, ...this.save.audio };
    this.screen = 'title'; this.menu = null; this.g = null; this.acc = 0; this.hold = false; this.toast = null; this.flash = 0;
    this.debug = /[?&]debug=1/.test(location.search);
    this.renderer = null; this.started = false; this.t = 0; this.stats = { frames: 0, ms: [] };
    this.input.onDisconnect = () => { if (this.screen === 'play') this.pause(); this.say('コントローラーが切断されました'); };
    this.input.onConnect = (gp) => this.say(`コントローラー接続: ${padStyle(gp.id) === 'generic' ? '標準配置' : padStyle(gp.id).toUpperCase()}`);
    addEventListener('blur', () => { if (this.screen === 'play') this.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (this.screen === 'play') this.pause(); this.audio.suspend(); } else if (this.started) this.audio.resume(); });
    this.openTitle();
  }
  persist() { this.save.audio = { ...this.audio.vol }; this.save.controls.keys = this.input.keys; this.save.controls.pad = this.input.pad; if (!writeSave(this.save)) this.saveFailed = true; }
  say(msg, sec = 2.4) { this.toast = { msg, t: sec }; }
  // 最初のユーザー操作で音を開始する
  async unlock() { if (this.started) { this.audio.resume(); return; } this.started = true; await this.audio.init(); if (this.screen === 'title') this.audio.music('title'); }
  get diff() { return this.save.difficulty; }

  // ---------------------------------------------------------------- メニュー
  setMenu(id, title, items, sub) { this.menu = { id, title, items, sel: 0, sub }; const first = items.findIndex((i) => !i.disabled && !i.info); if (first >= 0) this.menu.sel = first; }
  openTitle() {
    this.screen = 'title'; this.g = null;
    const reached = this.save.reached[this.diff];
    const items = [
      { label: 'はじめる（ステージ 1）', act: () => this.newGame(0) },
      { label: () => `つづきから（ステージ ${this.save.reached[this.diff] + 1} の先頭）`, act: () => this.newGame(this.save.reached[this.diff]), disabled: reached <= 0 },
      { label: () => `難易度: ${DIFFICULTY[this.diff].label}（残機 ${DIFFICULTY[this.diff].lives}・${DIFFICULTY[this.diff].time} 秒）`, adj: () => { this.save.difficulty = this.diff === 'hard' ? 'easy' : 'hard'; this.persist(); const sel = this.menu.sel; this.openTitle(); this.menu.sel = sel; } },
      { label: '操作説明', act: () => this.openHowto() },
      { label: '設定', act: () => this.openSettings() },
    ];
    if (this.variant === '3d' && this.renderer && this.renderer.xrSupported) items.splice(2, 0, { label: 'VR で遊ぶ（Meta Quest 3）', act: () => this.renderer.enterVR() });
    if (this.otherUrl) items.push({ label: this.variant === '2d' ? '3D / VR 版を開く' : '2D 版を開く', act: () => { location.href = this.otherUrl; } });
    this.setMenu('title', TITLE, items);
    if (this.started) this.audio.music('title');
    this.audio.ambient(null);
    this.renderer && this.renderer.onScreen && this.renderer.onScreen('title');
  }
  openHowto() {
    this.screen = 'howto';
    const L = this.input.labels();
    this.setMenu('howto', '操作説明', [
      { info: true, label: 'キーボード: ←→ / A D 移動・↑↓ / W S はしご・↓ / S しゃがむ・Space / X ジャンプ・Z / J 攻撃・Esc ポーズ' },
      { info: true, label: 'コントローラー: 十字キー / 左スティック 移動・下ボタン（A / ×）ジャンプ・左ボタン（X / □）攻撃・Start ポーズ' },
      { info: true, label: 'タッチ: 左側の円で移動・右側「跳」ジャンプ・「投」攻撃・右上 II ポーズ（同時押し可）' },
      { info: true, label: 'Quest 3: 左スティック 移動・右 A ジャンプ・右トリガー 攻撃・右 B ポーズ・メニューはレーザーとトリガー' },
      { info: true, label: '鎧を着ていれば 1 回は耐える。鎧が壊れた後に当たるとやられる。穴・水・溶岩は即死' },
      { info: true, label: '攻撃ボタン長押しで連射。武器は拾うと持ち替え（槍・短剣・斧・火炎）。ボスは攻撃の後の隙に 1.5 倍のダメージ' },
      { info: true, label: `高難度: 残機 3・180 秒・跳んだら向きを変えられない ／ 易しい: 残機 5・300 秒・中間地点が多い・空中で少し寄せられる` },
      { label: '戻る', act: () => this.openTitle() },
    ]);
    void L;
  }
  openSettings(from = this.screen) {
    const back = from === 'paused' ? () => this.openPause() : () => this.openTitle();
    this.screen = from === 'paused' ? 'paused' : 'settings';
    const v = this.audio.vol;
    const vol = (k, name) => ({ label: () => `${name}: ${v['mute' + k[0].toUpperCase() + k.slice(1)] ? 'ミュート' : Math.round(v[k] * 10)}`, adj: (d) => { v[k] = Math.min(1, Math.max(0, Math.round((v[k] + d * 0.1) * 10) / 10)); this.audio.applyVolume(); this.persist(); this.audio.sfx('uiMove'); },
      act: () => { const m = 'mute' + k[0].toUpperCase() + k.slice(1); v[m] = !v[m]; this.audio.applyVolume(); this.persist(); } });
    const qs = ['auto', 'ultra', 'standard', 'lite'];
    const qn = { auto: '自動', ultra: QUALITY.ultra.label, standard: QUALITY.standard.label, lite: QUALITY.lite.label };
    const items = [
      vol('music', '曲（BGM）'), vol('sfx', '効果音'), vol('ambient', '環境音'),
      { label: () => `画質: ${qn[this.save.quality]}`, adj: (d) => { this.save.quality = qs[(qs.indexOf(this.save.quality) + d + 4) % 4]; this.persist(); this.renderer && this.renderer.setQuality(this.save.quality); } },
      ...(this.variant === '2d' ? [
        { label: () => `表示: ${this.save.display === 'smooth' ? 'なめらか（高精細）' : 'ドット絵（アーケード）'}`, adj: () => { this.save.display = this.save.display === 'smooth' ? 'pixel' : 'smooth'; this.persist(); this.renderer && this.renderer.resize(); } },
        { label: () => `網点（色数を絞った質感）: ${this.save.dither === false ? 'オフ' : 'オン'}`, adj: () => { this.save.dither = this.save.dither === false; this.persist(); } },
        { label: () => `走査線: ${this.save.scanlines ? 'オン' : 'オフ'}`, adj: () => { this.save.scanlines = !this.save.scanlines; this.persist(); } },
      ] : []),
      { label: () => `左利き（タッチの左右を入れ替え・Quest は左手で操作）: ${this.save.controls.leftHanded ? 'オン' : 'オフ'}`, adj: () => { this.save.controls.leftHanded = !this.save.controls.leftHanded; this.persist(); this.renderer && this.renderer.onControls && this.renderer.onControls(); } },
      { label: () => `振動（対応機器のみ）: ${this.save.controls.rumble ? 'オン' : 'オフ'}`, adj: () => { this.save.controls.rumble = this.input.rumbleOn = !this.save.controls.rumble; this.persist(); } },
      { label: 'キーボードの割り当て', act: () => this.openKeys(from) },
      { label: 'コントローラーの割り当て', act: () => this.openPadMap(from) },
    ];
    if (this.variant === '3d') items.push({ label: 'VR の表示（大きさ・距離・高さ・座位）', act: () => this.openVRSettings(from) });
    items.push({ label: '戻る', act: back });
    this.setMenu('settings', '設定', items, { back });
  }
  openVRSettings(from) {
    const vr = this.save.vr, r = this.renderer;
    const set = (k, d, a, b, st) => { vr[k] = Math.round(Math.min(b, Math.max(a, vr[k] + d * st)) * 100) / 100; this.persist(); r && r.applyVR && r.applyVR(); };
    this.setMenu('vrset', 'VR の表示', [
      { label: () => `表示スケール: ${vr.scale.toFixed(2)} 倍`, adj: (d) => set('scale', d, 0.6, 1.6, 0.1) },
      { label: () => `距離: ${vr.distance.toFixed(2)} m`, adj: (d) => set('distance', d, 0.9, 3, 0.1) },
      { label: () => `高さ: ${vr.height >= 0 ? '+' : ''}${vr.height.toFixed(2)} m`, adj: (d) => set('height', d, -0.6, 0.6, 0.05) },
      { label: () => `姿勢: ${vr.seated ? '座って遊ぶ' : '立って遊ぶ'}`, adj: () => { vr.seated = !vr.seated; this.persist(); r && r.applyVR && r.applyVR(); } },
      { label: () => `VR の画質: ${{ quality: '高画質優先', balanced: '標準', stable: '安定性優先' }[vr.quality]}`, adj: (d) => { const o = ['stable', 'balanced', 'quality']; vr.quality = o[(o.indexOf(vr.quality) + d + 3) % 3]; this.persist(); r && r.applyVR && r.applyVR(); this.say('VR の画質は次に VR を始めたときに反映されます'); } },
      { label: '正面を合わせ直す（再センタリング）', act: () => r && r.recenter && r.recenter() },
      { label: '戻る', act: () => this.openSettings(from) },
    ]);
  }
  openKeys(from) {
    const names = { left: '左', right: '右', up: '上（はしご）', down: '下（しゃがむ・はしご）', jump: 'ジャンプ', attack: '攻撃', pause: 'ポーズ' };
    const items = ACTIONS.map((a) => ({ label: () => `${names[a]}: ${this.input.keys[a].map(keyLabel).join(' / ')}`, act: () => {
      this.say(`${names[a]} に割り当てるキーを押してください`, 5);
      this.input.captureNext((k) => { this.input.keys[a] = [k.code, ...this.input.keys[a].filter((c) => c !== k.code)].slice(0, 2); this.persist(); this.say(`${names[a]}: ${keyLabel(k.code)}`); });
    } }));
    items.push({ label: '初期設定に戻す', act: () => { this.input.keys = structuredClone(DEFAULT_KEYS); this.persist(); } });
    items.push({ label: '戻る', act: () => this.openSettings(from) });
    this.setMenu('keys', 'キーボードの割り当て', items);
  }
  openPadMap(from) {
    const names = { jump: 'ジャンプ（決定）', attack: '攻撃', pause: 'ポーズ', back: '戻る（メニュー）' };
    const items = Object.keys(names).map((a) => ({ label: () => `${names[a]}: ${padLabel(padStyle(this.input.padId), this.input.pad[a])}`, act: () => {
      this.say(`${names[a]} に割り当てるボタンを押してください`, 5);
      this.input.waitPadButton((i) => { this.input._padWait = false; this.input.pad[a] = i; this.persist(); this.say(`${names[a]}: ${padLabel(padStyle(this.input.padId), i)}`); this.ignoreOk = 0.3; });
    } }));
    items.push({ info: true, label: '十字キーと左スティックは移動に固定。ホームボタンなどシステム用のボタンは使いません' });
    items.push({ label: '初期設定に戻す', act: () => { this.input.pad = { ...DEFAULT_PAD }; this.persist(); } });
    items.push({ label: '戻る', act: () => this.openSettings(from) });
    this.setMenu('pad', 'コントローラーの割り当て', items);
  }
  openPause() {
    this.screen = 'paused';
    this.setMenu('pause', 'ポーズ', [
      { label: '再開', act: () => this.resume() },
      { label: '設定', act: () => this.openSettings('paused') },
      { label: 'ステージをやり直す（残機 −1）', act: () => { this.resume(); if (this.g.mode === 'play') { this.g.player.inv = 0; import('./core.js').then((m) => m.killPlayer(this.g, 'retire')); } } },
      { label: 'タイトルへ戻る', act: () => this.toTitle() },
    ], { back: () => this.resume() });
  }
  pause() { if (this.screen !== 'play') return; this.openPause(); this.audio.sfx('pause'); this.audio.setPaused(true); this.input.releaseAll(); }
  resume() { this.screen = 'play'; this.menu = null; this.acc = 0; this.input.releaseAll(); this.audio.resume(); this.audio.setPaused(false); }
  toTitle() { if (this.g) this.recordHi(); this.audio.setPaused(false); this.openTitle(); }
  recordHi() { const d = this.diff; if (this.g && this.g.score > this.save.hi[d]) { this.save.hi[d] = this.g.score; this.persist(); } }

  // ---------------------------------------------------------------- ゲーム
  newGame(stage) {
    this.g = createGame({ difficulty: this.diff, stage, hi: this.save.hi[this.diff], seed: (Math.random() * 1e9) | 0, god: this.debug && /[?&]inv/.test(location.search) });
    this.screen = 'play'; this.menu = null; this.acc = 0;
    this.renderer.setStage(this.g);
    this.audio.music('start');
    this.audio.ambient(this.g.def.theme);
    this.input.releaseAll();
  }
  handleEvents(evs) {
    const g = this.g;
    this.audio.events(evs, g.stageIndex);
    for (const e of evs) {
      if (e.type === 'stageStart') { this.renderer.setStage(g); this.audio.ambient(g.def.theme); if (g.stageIndex > this.save.reached[this.diff]) { this.save.reached[this.diff] = g.stageIndex; this.persist(); } }
      if (e.type === 'armorBreak') this.input.rumble(140, 0.7);
      if (e.type === 'enemyDie') this.hitstop = Math.max(this.hitstop || 0, e.strong ? 0.07 : 0.04);
      if (e.type === 'bossHit' && e.weak) this.hitstop = Math.max(this.hitstop || 0, 0.035);
      if (e.type === 'bossDie') this.hitstop = 0.28;
      if (e.type === 'armorBreak') this.hitstop = Math.max(this.hitstop || 0, 0.09);
      const WN = { lance: '槍', dagger: '短剣', axe: '斧', torch: '火炎' };
      if (e.type === 'weaponGet') this.notice = { msg: `${WN[e.weapon]}を手に入れた`, t: 2.2 };
      if (e.type === 'armorGet') this.notice = { msg: '鎧をまとった', t: 2.2, col: '#bcd8ff' };
      if (e.type === 'treasure') this.notice = { msg: '宝を見つけた　200 点', t: 2.0 };
      if (e.type === 'checkpoint') this.notice = { msg: '中間地点', t: 1.6, col: '#d8d0ff' };
      if (e.type === 'armorBreak') this.notice = { msg: '鎧が砕けた！', t: 1.6, col: '#ff8a6a' };
      if (e.type === 'death') this.input.rumble(260, 1);
      if (e.type === 'bossDie') this.input.rumble(400, 0.8);
      if (e.type === 'gameOver') { this.recordHi(); this.openGameOver(); }
      if (e.type === 'ending') { this.recordHi(); this.save.clears[this.diff]++; this.persist(); this.openEnding(); }
      if (e.type === 'stageDone') { this.recordHi(); nextStage(g); }
      if (e.type === 'respawn') { this.audio.music(null); }
    }
    this.renderer.onEvents && this.renderer.onEvents(evs, g);
  }
  openGameOver() {
    this.screen = 'gameover';
    this.setMenu('gameover', 'GAME OVER', [
      { label: () => `ステージ ${this.g.stageIndex + 1} の先頭から再挑戦（残機 ${DIFFICULTY[this.diff].lives}・得点 0）`, act: () => { retryStage(this.g); this.screen = 'play'; this.menu = null; this.audio.music('start'); } },
      { label: 'タイトルへ戻る', act: () => this.toTitle() },
    ]);
  }
  openEnding() {
    this.screen = 'ending'; this.endT = 0;
    this.setMenu('ending', '夜明け', [
      { label: '2 周目へ（敵が強くなる）', act: () => { startLoop2(this.g); this.screen = 'play'; this.menu = null; this.audio.music('start'); } },
      { label: 'タイトルへ戻る', act: () => this.toTitle() },
    ]);
  }

  // ---------------------------------------------------------------- 毎フレーム
  frame(dt) {
    this.t += dt;
    this.input.pollPad();
    if (this.toast) { this.toast.t -= dt; if (this.toast.t <= 0) this.toast = null; }
    if (this.notice && this.screen === 'play') { this.notice.t -= dt; if (this.notice.t <= 0) this.notice = null; }
    if (this.ignoreOk > 0) this.ignoreOk -= dt;
    const m = this.input.menu(dt);
    if ((m.ok || m.pause || m.back) && !this.started) this.unlock();
    if (this.screen === 'play' && this.g) {
      if (m.pause) { this.pause(); this.input.endFrame(); return; }
      if (this.hitstop > 0) { this.hitstop -= dt; this.input.endFrame(); return; } // 当てた瞬間のわずかな静止（手応え）
      if (!this.hold) {
        this.acc = Math.min(this.acc + dt, TICK * 8); // 大きく遅れたら追いつこうとしない（処理落ち時に一気に進めない）
        let n = 0;
        while (this.acc >= TICK && n < 8) {
          step(this.g, this.input.state()); n++;
          this.acc -= TICK;
          if (this.g.events.length) this.handleEvents(this.g.events.slice());
          if (this.screen !== 'play') break;
          if (this.debug) this.debugKeys();
        }
      }
    } else if (this.menu) this.navigate(m);
    this.input.endFrame();
  }
  alpha() { return this.screen === 'play' && !this.hold ? this.acc / TICK : 1; }
  navigate(m) {
    const mn = this.menu, items = mn.items;
    const ok = (i) => !items[i].info && !items[i].disabled;
    const move = (d) => { let i = mn.sel; for (let k = 0; k < items.length; k++) { i = (i + d + items.length) % items.length; if (ok(i)) { mn.sel = i; this.audio.sfx('uiMove'); return; } } };
    if (m.up) move(-1);
    if (m.down) move(1);
    const it = items[mn.sel];
    if (!it) return;
    if ((m.left || m.right) && it.adj) it.adj(m.left ? -1 : 1);
    if (m.ok && !(this.ignoreOk > 0) && ok(mn.sel)) { this.audio.sfx('uiSelect'); if (it.act) it.act(); else if (it.adj) it.adj(1); }
    if ((m.back || (m.pause && this.screen === 'paused')) && this.menu === mn) {
      const sub = mn.sub && mn.sub.back;
      if (sub) { this.audio.sfx('uiBack'); sub(); }
      else { const backItem = items.find((x) => x.label === '戻る'); if (backItem) { this.audio.sfx('uiBack'); backItem.act(); } }
    }
  }
  // ポインター（マウス・タッチ・VR のレーザー）で項目を選ぶ。x の位置で左右（値の変更）も判定
  pointerPick(i, side) {
    const mn = this.menu; if (!mn) return;
    const it = mn.items[i]; if (!it || it.info || it.disabled) return;
    this.unlock();
    mn.sel = i;
    this.audio.sfx('uiSelect');
    if (it.adj && side) it.adj(side); else if (it.act) it.act(); else if (it.adj) it.adj(1);
  }
  debugKeys() {
    const k = this.input.down;
    if (k.has('KeyI')) { this.g.god = !this.g.god; k.delete('KeyI'); this.say('無敵 ' + this.g.god); }
    if (k.has('KeyN')) { k.delete('KeyN'); if (this.g.stageIndex < 5) { nextStage(this.g); } }
    if (k.has('KeyG')) { k.delete('KeyG'); debugWarpBoss(this.g); }
    if (k.has('KeyB') && this.g.boss) { k.delete('KeyB'); this.g.boss.hp = 0.1; }
    if (k.has('Digit1')) { k.delete('Digit1'); this.g.weapon = 'lance'; } if (k.has('Digit2')) { k.delete('Digit2'); this.g.weapon = 'dagger'; }
    if (k.has('Digit3')) { k.delete('Digit3'); this.g.weapon = 'axe'; } if (k.has('Digit4')) { k.delete('Digit4'); this.g.weapon = 'torch'; }
  }
}
export { WEAPONS, getStages };
