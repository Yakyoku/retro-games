// ORBITAL WINGS — 画面遷移・メニュー・HUD・保存・音・ゲームループ（2D 版と 3D 版で共通）
// 描画は renderer（2D: Canvas、3D: three.js/WebXR）に任せる。メニューは「データ」として持ち、
// DOM（通常画面）と、3D 版の VR 内パネル（キャンバス）の両方が同じデータを描く。
import { Game } from './game.js';
import { STAGES } from './stages.js';
import { BOSS } from './bosses.js';
import { GAUGE, GAUGE_JA, DIFFICULTY, PLAYER, OPTION, VIEW_W } from './config.js';
import { Input, attachTouch } from './input.js';
import { Save } from './save.js';
import { FixedStep } from './loop.js';
import { botInput } from './bot.js';
import { AudioEngine } from './audio/audio.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => String(Math.floor(n)).padStart(8, '0');
export const DEBUG = new URLSearchParams(location.search).has('debug');

export class App {
  constructor({ variant, renderer, root }) {
    this.variant = variant;           // '2d' | '3d'
    this.renderer = renderer;
    this.root = root;
    this.settings = Save.settings;
    this.input = new Input({ depth: variant === '3d' });
    this.input.vibration = this.settings.vibration;
    this.input.invertDepth = this.settings.invertDepth;
    this.audio = new AudioEngine();
    this.applyAudio();
    this.step = new FixedStep({ maxCatchUp: 5 });
    this.screen = 'boot';
    this.menu = null; this.menuStack = [];
    this.game = null; this.demo = null;
    this.msg = null; this.msgT = 0;
    this.paused = false;
    this.stats = { frames: 0, ft: [], ticks: 0 };
    window.__ow = this;
    this.buildDom();
    attachTouch(this.input, root);
    this.input.onDevice = () => this.refreshHelp();
    this.input.onPad = (what) => { this.toast(what === 'connected' ? `ゲームパッド接続: ${this.input.padInfo.label}` : 'ゲームパッドが切断されました'); if (what === 'disconnected' && this.screen === 'play') this.pause(true); };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (this.screen === 'play') this.pause(true); this.audio.suspendForHidden?.(); }
      else { this.audio.resumeFromHidden?.(); this.step.reset(); }
    });
    addEventListener('blur', () => { if (this.screen === 'play') this.pause(true); });
    this.renderer.init(this);
    this.showBoot();
  }

  // ---- 音 -------------------------------------------------------------------
  applyAudio() {
    const s = this.settings;
    this.audio.setVolumes?.({ master: s.master, bgm: s.bgm, sfx: s.sfx });
    this.audio.setMuted?.(s.mute);
    this.audio.setEngine?.(s.soundEngine);
  }
  async unlockAudio() {
    try { await this.audio.unlock(); this.applyAudio(); } catch (e) { console.warn('audio', e); this.toast('音声を開始できませんでした（もう一度操作してください）'); }
  }
  music(id, opts) { if (id) this.audio.playMusic?.(id, opts); else this.audio.stopMusic?.(opts); }
  sfx(n, opts) { this.audio.sfx?.(n, opts); }
  // 効果音の定位: 画面上の x 位置で左右に振る（控えめ、最大 ±0.5。2D・3D・VR で同じ）
  panOf(g, x) { return typeof x === 'number' && g ? Math.max(-0.5, Math.min(0.5, (x - g.camX) / VIEW_W - 0.5)) : 0; }
  // ゲームからの効果音: 位置つきのものは定位し、段のある音（ゲージ・シールド）は対応する出来事の側で鳴らす
  gameSfx(ev, g, last) {
    let n = ev.n;
    if (n === 'capsule' || n === 'powerup' || n === 'shield_hit') return;       // gauge / powerup / shieldhit の出来事で鳴らす
    let x = ev.x;
    if (x === undefined) {
      if (n === 'explode_s' || n === 'explode_m' || n === 'part_destroyed' || n === 'cell_pop') { x = last.x; if (n === 'explode_m' && last.size === 'l') n = 'explode_l'; }
      else if (n === 'shot' || n === 'double' || n === 'laser' || n === 'missile' || n === 'player_die' || n === 'shield_on' || n === 'deny') x = g.player.x;
      else if (n === 'boss_beam' || n === 'boss_attack' || n === 'boss_explode' || n === 'phase_change') x = g.boss ? g.boss.x : undefined;
    }
    this.sfx(n, { pan: this.panOf(g, x) });
  }
  // ゲームからの曲の切り替え: 面の開始はファンファーレから切れ目なく、ボスは一打を重ね、ゲームオーバーはテープを止めるように
  gameMusic(ev, g, respawned) {
    const id = ev.id;
    if (!id) { this.music(null, { fade: 0.7 }); return; }
    if (/^stage/.test(id)) { if (respawned) this.music(id, { fade: 0.4 }); else this.music(id, { restart: true, lead: true, fade: 0.25 }); return; }
    if (id === 'boss' || id === 'final') { this.sfx('boss_enter'); this.sfx('stinger'); this.music(id, { fade: 0.15 }); return; }
    if (id === 'gameover') { this.music(id, { mode: 'tape', fade: 0.9 }); return; }
    this.music(id, { fade: 0.3 });
  }
  // 動的な曲と予告音: ボスの体力・フェーズで層を足し、残機が最後なら緊張の層。ボスが攻撃の構えに入ったら予告音
  audioWatch(g) {
    const b = g.boss && !g.boss.dead ? g.boss : null;
    let inten = 0;
    if (b) {
      const [c, m] = BOSS[b.type].bossHp(b), f = m ? c / m : 1;
      inten = b.phase ? Math.min(2, b.phase - 1) : f < 0.3 ? 2 : f < 0.65 ? 1 : 0;
      if (b.st !== this._bossSt) { if (this._bossSt === 'idle' && b.st !== 'idle') this.sfx('boss_telegraph', { pan: this.panOf(g, b.x) }); this._bossSt = b.st; }
    } else this._bossSt = null;
    this.audio.setIntensity?.(inten);
    this.audio.setLayer?.('danger', g.lives <= 1 && !g.over && g.mode !== 'practice');
  }

  // ---- DOM ------------------------------------------------------------------
  buildDom() {
    const r = this.root;
    r.insertAdjacentHTML('beforeend', `
      <div class="hud" hidden>
        <div class="hud-top"><span class="hs">SCORE <b class="sc">00000000</b></span><span class="hs hi">HI <b class="hv">00000000</b></span><span class="stg"></span></div>
        <div class="boss" hidden><span class="bn"></span><div class="bar"><i></i></div></div>
        <div class="hud-bot"><div class="lives"></div><div class="gauge"></div><div class="eq"></div></div>
      </div>
      <div class="banner" hidden></div>
      <div class="toast" hidden></div>
      <div class="menu-wrap" hidden><div class="menu" role="menu"></div></div>
      <div class="dbg" hidden></div>`);
    this.el = {
      hud: r.querySelector('.hud'), sc: r.querySelector('.sc'), hv: r.querySelector('.hv'), stg: r.querySelector('.stg'),
      boss: r.querySelector('.boss'), bn: r.querySelector('.bn'), bar: r.querySelector('.boss .bar i'),
      lives: r.querySelector('.lives'), gauge: r.querySelector('.gauge'), eq: r.querySelector('.eq'),
      banner: r.querySelector('.banner'), toast: r.querySelector('.toast'), menuWrap: r.querySelector('.menu-wrap'), menu: r.querySelector('.menu'), dbg: r.querySelector('.dbg'),
    };
    this.el.gauge.innerHTML = GAUGE.map((g, i) => `<div class="cell" data-i="${i}"><span class="gl">${g}</span><span class="gs"></span></div>`).join('');
    // メニューはマウス・タッチでも選べる
    this.el.menu.addEventListener('pointermove', (e) => { const it = e.target.closest('[data-i]'); if (it && this.menu) { const i = +it.dataset.i; if (this.menu.sel !== i && this.menu.items[i] && !this.menu.items[i].disabled) { this.menu.sel = i; this.drawMenu(); } } });
    this.el.menu.addEventListener('click', (e) => {
      const it = e.target.closest('[data-i]'); if (!it || !this.menu) return;
      const i = +it.dataset.i; this.menu.sel = i;
      const arrow = e.target.closest('[data-dir]');
      if (arrow) this.menuAdjust(+arrow.dataset.dir); else this.menuConfirm();
    });
    if (DEBUG) this.el.dbg.hidden = false;
  }
  toast(text, ms = 1600) {
    const t = this.el.toast; t.textContent = text; t.hidden = false;
    clearTimeout(this._toastT); this._toastT = setTimeout(() => { t.hidden = true; }, ms);
    this.vrToast = { text, until: performance.now() + ms };
  }
  banner(html, ms = 2200, cls = '') {
    const b = this.el.banner; b.innerHTML = html; b.className = 'banner ' + cls; b.hidden = false;
    clearTimeout(this._banT); this._banT = setTimeout(() => { b.hidden = true; }, ms);
    this.vrBanner = { text: html.replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n').trim(), until: performance.now() + ms };
  }

  // ---- メニュー --------------------------------------------------------------
  setMenu(m, push = false) {
    if (push && this.menu) this.menuStack.push(this.menu);
    if (!push) this.menuStack = [];
    this.menu = m;
    if (!m) { this.drawMenu(); return; }
    m.sel = m.sel ?? m.items.findIndex((x) => !x.disabled);
    this.drawMenu();
  }
  popMenu() { if (this.menuStack.length) { this.menu = this.menuStack.pop(); this.drawMenu(); this.sfx('cancel'); return true; } return false; }
  drawMenu() {
    const m = this.menu, w = this.el.menuWrap;
    if (!m) { w.hidden = true; return; }
    w.hidden = false;
    w.className = 'menu-wrap ' + (m.cls || '');
    const items = m.items.map((it, i) => {
      const val = it.value ? `<span class="val"><span class="arr" data-dir="-1">◀</span><b>${esc(it.value())}</b><span class="arr" data-dir="1">▶</span></span>` : '';
      return `<div class="mi${i === m.sel ? ' sel' : ''}${it.disabled ? ' dis' : ''}" data-i="${i}" role="menuitem" aria-selected="${i === m.sel}"><span class="lb">${esc(it.label)}</span>${val}</div>`;
    }).join('');
    const hint = m.items[m.sel]?.hint ? `<p class="hint">${esc(m.items[m.sel].hint)}</p>` : '';
    this.el.menu.innerHTML = `${m.logo ? m.logo : ''}${m.title ? `<h2>${esc(m.title)}</h2>` : ''}${m.body ? `<div class="body">${m.body}</div>` : ''}<div class="items">${items}</div>${hint}${m.foot ? `<p class="foot">${m.foot}</p>` : ''}`;
    this.menuVersion = (this.menuVersion || 0) + 1;
  }
  menuMove(d) {
    const m = this.menu; if (!m || !m.items.length) return;
    let i = m.sel;
    for (let k = 0; k < m.items.length; k++) { i = (i + d + m.items.length) % m.items.length; if (!m.items[i].disabled) break; }
    if (i !== m.sel) { m.sel = i; this.sfx('cursor'); this.drawMenu(); }
  }
  menuAdjust(d) { const it = this.menu?.items[this.menu.sel]; if (it && it.adjust) { it.adjust(d); this.sfx('cursor'); this.drawMenu(); } }
  menuConfirm() {
    const it = this.menu?.items[this.menu.sel]; if (!it || it.disabled) return;
    if (it.adjust && !it.act) { this.menuAdjust(1); return; }
    this.sfx('select'); it.act?.();
  }
  menuBack() { if (this.menu?.onBack) { this.sfx('cancel'); this.menu.onBack(); } else this.popMenu(); }

  // ---- 画面 ------------------------------------------------------------------
  showBoot() {
    this.screen = 'boot';
    this.setMenu({ cls: 'boot', logo: this.logoHtml(), body: `<p class="press">クリック・タップ・キー・ボタンで開始</p><p class="note">音が出ます（音量は設定で変えられます）</p>`, items: [{ label: 'はじめる', act: () => this.leaveBoot() }] });
    const go = (e) => { if (this.screen !== 'boot') return; if (e.type === 'keydown' && ['Tab'].includes(e.code)) return; this.leaveBoot(); };
    addEventListener('keydown', go); addEventListener('pointerdown', go);
    this._bootPad = true;
  }
  async leaveBoot() {
    if (this.screen !== 'boot') return;
    this.screen = 'title';
    await this.unlockAudio();
    this.showTitle();
  }
  logoHtml() {
    return `<div class="logo"><span class="lg1">ORBITAL</span><span class="lg2">WINGS</span><span class="lg3">${this.variant === '3d' ? '3D / VR' : '2D'}</span></div>`;
  }
  showTitle() {
    this.screen = 'title'; this.game = null; this.paused = false;
    this.el.hud.hidden = true; this.el.banner.hidden = true;
    this.startDemo();
    this.audio.setIntensity?.(0); this.audio.setLayer?.('danger', false);
    this.music('title');
    const v = this.variant;
    const items = [
      { label: 'ゲームスタート', hint: '第 1 面から一周クリアを目指す（本編の記録）', act: () => this.chooseDifficulty('main', 1) },
      { label: '練習モード', hint: `解放済みのステージから始める（本編の記録には残りません）。解放: ${Save.unlocked(v)} 面まで`, act: () => this.choosePractice() },
      { label: '設定', act: () => this.showSettings() },
      { label: '操作説明', act: () => this.showHelp() },
      { label: 'クレジット', act: () => this.showCredits() },
      { label: 'トップページへ', hint: '2D / 3D の選択に戻る', act: () => { location.href = '../'; } },
    ];
    if (this.renderer.titleItems) items.splice(1, 0, ...this.renderer.titleItems(this));
    const hi = ['easy', 'normal', 'arcade'].map((d) => `${DIFFICULTY[d].label} ${fmt(Save.hi(`${v}:${d}:main`))}`).join('　');
    this.setMenu({ cls: 'title', logo: this.logoHtml(), items, foot: `HI SCORE　${hi}${Save.ok ? '' : '<br><span class="warn">保存できない環境です（記録はこの画面を閉じると消えます）</span>'}`, onBack: () => {} });
  }
  chooseDifficulty(mode, stage) {
    const mk = (d) => ({ label: DIFFICULTY[d].label, hint: { easy: '敵弾が遅く少ない。ミスしてもその場で復帰し、再装備用カプセルが出る', normal: '標準。ミスするとチェックポイントから・装備を失う', arcade: '敵弾が速く多い。ミスするとチェックポイントから・装備を失う' }[d], act: () => this.startGame(mode, stage, d) });
    this.setMenu({ title: mode === 'main' ? '難易度' : `練習 — 第 ${stage} 面`, items: [mk('easy'), mk('normal'), mk('arcade'), { label: 'もどる', act: () => this.popMenu() }], sel: 1 }, true);
  }
  choosePractice() {
    const n = Save.unlocked(this.variant);
    const items = STAGES.map((s) => ({ label: `${s.id}. ${s.name}  ${s.en}`, disabled: s.id > n, hint: s.id > n ? '本編でこの面に到達すると解放' : `ボス: ${BOSS[s.boss].name}`, act: () => this.chooseDifficulty('practice', s.id) }));
    items.push({ label: 'もどる', act: () => this.popMenu() });
    this.setMenu({ title: '練習モード（ステージ選択）', items }, true);
  }
  settingItems() {
    const s = this.settings, set = (k, v) => { Save.setSetting(k, v); this.settings = Save.settings; this.applySettings(); };
    const pct = (k) => ({ label: { master: 'マスター音量', bgm: 'BGM 音量', sfx: '効果音 音量' }[k], value: () => `${Math.round(s[k] * 100)}%`, adjust: (d) => set(k, Math.max(0, Math.min(1, Math.round((s[k] + d * 0.1) * 10) / 10))) });
    const tog = (k, label, hint) => ({ label, hint, value: () => (s[k] ? 'ON' : 'OFF'), adjust: () => set(k, !s[k]) });
    const items = [
      pct('master'), pct('bgm'), pct('sfx'),
      tog('mute', 'ミュート'),
      { label: '音源', hint: 'モダン＝FM・アナログ風シンセ・合成ドラム・残響つきのステレオ（既定）。レトロ＝従来の PSG・波形メモリ音源（モノラル）', value: () => (s.soundEngine === 'retro' ? 'レトロ音源' : 'モダン'), adjust: () => set('soundEngine', s.soundEngine === 'retro' ? 'modern' : 'retro') },
      tog('autoFire', 'オート射撃', 'ON にすると押さなくても撃ち続ける'),
      { label: '画質', hint: '自動は描画時間を見て解像度を調整（下限あり）。高＝実解像度（4K なら 3840×2160 で描く）', value: () => ({ auto: '自動', high: '高（固定）', medium: '中（固定）', low: '低（固定）' }[s.quality]), adjust: (d) => { const q = ['auto', 'high', 'medium', 'low']; set('quality', q[(q.indexOf(s.quality) + d + 4) % 4]); } },
      tog('vibration', '振動', 'ゲームパッド・Quest コントローラーの振動（控えめ）'),
    ];
    if (this.variant === '2d') items.push(tog('retro', 'レトロ表示（任意）', '走査線とにじみの効果。標準は OFF（高精細）'));
    if (this.variant === '3d') {
      items.push(tog('invertDepth', '奥行き操作の反転', 'OFF: 右スティック上・E キーで奥へ。ON で逆'));
      items.push({ label: 'VR 戦場の大きさ', value: () => `${Math.round(s.vrScale * 100)}%`, adjust: (d) => set('vrScale', Math.max(0.6, Math.min(1.6, Math.round((s.vrScale + d * 0.1) * 10) / 10))) });
      items.push({ label: 'VR 戦場の高さ', value: () => `${s.vrHeight >= 0 ? '+' : ''}${Math.round(s.vrHeight * 100)}cm`, adjust: (d) => set('vrHeight', Math.max(-0.5, Math.min(0.5, Math.round((s.vrHeight + d * 0.05) * 100) / 100))) });
      items.push({ label: 'VR 戦場の距離', value: () => `${s.vrDistance >= 0 ? '+' : ''}${Math.round(s.vrDistance * 100)}cm`, adjust: (d) => set('vrDistance', Math.max(-0.6, Math.min(1.0, Math.round((s.vrDistance + d * 0.05) * 100) / 100))) });
    }
    return items;
  }
  applySettings() {
    this.input.vibration = this.settings.vibration;
    this.input.invertDepth = this.settings.invertDepth;
    if (this.game) this.game.autoFire = this.settings.autoFire;
    this.applyAudio();
    this.renderer.applySettings?.(this.settings);
  }
  showSettings() {
    const items = this.settingItems();
    items.push({ label: 'もどる', act: () => this.popMenu() });
    this.setMenu({ title: '設定', items, foot: '◀ ▶ で変更　' + (Save.ok ? '自動で保存されます' : '<span class="warn">保存できない環境です（この間だけ有効）</span>') }, true);
  }
  helpHtml() {
    const p = this.input.padInfo;
    const d3 = this.variant === '3d';
    return `<table class="keys">
      <tr><th></th><th>キーボード</th><th>ゲームパッド（${esc(p.label)}）</th>${d3 ? '<th>Quest 3</th>' : '<th>タッチ</th>'}</tr>
      <tr><td>移動</td><td>矢印 / WASD</td><td>左スティック / 十字キー</td>${d3 ? '<td>左スティック</td>' : '<td>左半分をなぞる</td>'}</tr>
      ${d3 ? `<tr><td>奥・手前</td><td>E 奥 / Q 手前</td><td>右スティック上下</td><td>右スティック上下（上で奥）</td></tr>` : ''}
      <tr><td>射撃・ミサイル</td><td>Z / Space（押し続け）</td><td>${esc(p.a)}</td>${d3 ? '<td>右トリガー</td>' : '<td>SHOT</td>'}</tr>
      <tr><td>パワーアップ</td><td>X / Shift</td><td>${esc(p.b)}</td>${d3 ? '<td>右 A</td>' : '<td>POWER</td>'}</tr>
      <tr><td>一時停止</td><td>Esc</td><td>${esc(p.start)}</td>${d3 ? '<td>右 B</td>' : '<td>Ⅱ</td>'}</tr>
      <tr><td>メニュー</td><td>矢印・Enter・Esc</td><td>十字・${esc(p.a)} 決定・${esc(p.b)} もどる</td>${d3 ? '<td>レーザーで指してトリガー</td>' : '<td>タップ</td>'}</tr>
    </table>
    <p>カプセルを取るとゲージの選択が 1 つ進む（SPEED → MISSILE → DOUBLE → LASER → OPTION → SHIELD）。パワーアップで選択中の装備を得る。
    DOUBLE と LASER は切り替え。オプションは最大 4 機で、自機の動いた跡をたどって同じ武器を撃つ。シールドは前方の攻撃を 5 回防ぐ（地形は防げない）。
    指定の編隊を全滅させるか、赤い運搬機を倒すとカプセルが出る。</p>`;
  }
  refreshHelp() { if (this.menu?.id === 'help') { this.menu.body = this.helpHtml(); this.drawMenu(); } }
  showHelp() { this.setMenu({ id: 'help', cls: 'wide', title: '操作説明', body: this.helpHtml(), items: [{ label: 'もどる', act: () => this.popMenu() }] }, true); }
  showCredits() {
    this.setMenu({ cls: 'wide', title: 'クレジット', body: `
      <p><b>ORBITAL WINGS</b>（仮称）— プロジェクト識別名 GradiusInspired_Cloud</p>
      <p>このゲームは、Claude Codeのクラウドセッションで制作しました。企画の指示: 依頼者／設計・プログラム・アート・作曲・効果音: Claude（Anthropic）</p>
      <p>初代グラディウスに着想を得た非公式作品です。コナミの公式作品ではありません。名称・機体・敵・ボス・地形・曲・効果音はすべて新規に作成し、原作のデータ（画像・音・ROM）は使っていません。</p>
      <p>描画: three.js r${this.renderer.threeVersion || '187'}（MIT）／${this.variant === '2d' ? 'Canvas 2D（ベクター描画）' : 'WebGL 2・WebXR'}　音: 自作のソフト音源（FM・アナログ風シンセ・合成ドラム／従来の PSG・波形メモリ音源の模擬も選べる。AudioWorklet）　フォント: 端末の標準フォント</p>
      <p>素材の出所と利用条件は ASSET_LICENSES.md、音の参照と再現方針は AUDIO_REFERENCE.md（リポジトリ内）に記録。</p>`,
      items: [{ label: 'もどる', act: () => this.popMenu() }] }, true);
  }

  // ---- デモ（タイトル背景） ----------------------------------------------------
  startDemo() {
    this.demo = new Game({ variant: this.variant, stage: 1 + Math.floor(Math.random() * 3), invincible: true, seed: Date.now() & 0xffff });
    this.demo.debugFullPower();
    this.renderer.setStage?.(this.demo.stage, this.demo);
  }

  // ---- プレイ ----------------------------------------------------------------
  startGame(mode, stage, difficulty) {
    this.demo = null;
    this.mode = mode; this.practiceStage = stage;
    this.game = new Game({ variant: this.variant, mode, stage, difficulty, autoFire: this.settings.autoFire, seed: (Math.random() * 1e9) | 0, invincible: DEBUG && /inv/.test(location.search) });
    this.screen = 'play'; this.paused = false;
    this.setMenu(null); this.menu = null; this.el.menuWrap.hidden = true;
    this.el.hud.hidden = false;
    this.renderer.setStage?.(this.game.stage, this.game);
    this.sfx('start');
    this.audio.setIntensity?.(0); this.audio.setLayer?.('danger', false); this._bossSt = null;
    this.handleEvents(this.game.drainEvents());
    this.step.reset();
    this.input.releaseAll();
    this.lastKey = this.game.recordKey();
  }
  pause(on) {
    if (this.screen !== 'play' && this.screen !== 'pause') return;
    if (on && this.screen === 'play') {
      this.screen = 'pause'; this.paused = true; this.audio.setPaused?.(true); this.sfx('pause');
      this.setMenu({ title: '一時停止', items: [
        { label: '再開', act: () => this.pause(false) },
        { label: '設定', act: () => this.showSettings() },
        { label: '操作説明', act: () => this.showHelp() },
        { label: 'タイトルへ戻る', hint: 'このプレイの記録は残りません', act: () => { this.audio.setPaused?.(false); this.showTitle(); } },
      ], onBack: () => this.pause(false) });
      this.renderer.onPause?.(true);
    } else if (!on && this.screen === 'pause') {
      this.screen = 'play'; this.paused = false; this.setMenu(null); this.menu = null; this.el.menuWrap.hidden = true;
      this.audio.setPaused?.(false); this.sfx('resume'); this.input.releaseAll(); this.step.reset();
      this.renderer.onPause?.(false);
    }
  }
  showResult() {
    const g = this.game;
    this.screen = 'result';
    const key = g.recordKey();
    const isMain = g.mode === 'main';
    const newHi = isMain ? Save.submit(key, g.score) : false;
    if (isMain && g.cleared) Save.markCleared(key);
    const time = Math.floor((g.tickN) / 60);
    this.el.hud.hidden = true;
    this.setMenu({ cls: 'result', title: g.cleared ? (isMain ? '全 7 ステージ クリア' : '練習 クリア') : 'GAME OVER', body: `
      <dl class="res"><dt>スコア</dt><dd>${fmt(g.score)}${newHi ? ' <em>NEW RECORD</em>' : ''}</dd>
      <dt>到達</dt><dd>第 ${g.stageNo} 面 ${esc(g.stage.name)}</dd><dt>撃墜</dt><dd>${g.stats.kills}</dd><dt>ミス</dt><dd>${g.stats.deaths}</dd>
      <dt>時間</dt><dd>${Math.floor(time / 60)}分${String(time % 60).padStart(2, '0')}秒</dd><dt>記録</dt><dd>${isMain ? `${this.variant.toUpperCase()} ／ ${DIFFICULTY[g.difficulty].label}（ハイスコア ${fmt(Save.hi(key))}）` : '練習モード（本編の記録には残りません）'}</dd></dl>`,
      items: [{ label: 'もう一度', hint: 'スコア・装備・残機を初期化して同じ条件で始める', act: () => this.startGame(g.mode, g.mode === 'main' ? 1 : this.practiceStage, g.difficulty) }, { label: 'タイトルへ', act: () => this.showTitle() }],
      onBack: () => this.showTitle() });
  }

  handleEvents(evs, demo = false) {
    const g = demo ? this.demo : this.game;
    const last = { x: undefined, size: 's' }; let respawned = false;   // この 1 tick の中で直前にあった爆発の位置・復帰の有無
    for (const ev of evs) {
      if (!demo) {
        switch (ev.t) {
          case 'sfx': this.gameSfx(ev, g, last); break;
          case 'music': this.gameMusic(ev, g, respawned); break;
          case 'explode': last.x = ev.x; last.size = ev.size; break;
          case 'respawn': respawned = true; break;
          case 'gauge': this.sfx('capsule', { step: ev.sel, pan: this.panOf(g, g.player.x) }); break;
          case 'stage':
            this.renderer.setStage?.(g.stage, g);
            this.banner(`<small>STAGE ${ev.n}</small><b>${esc(g.stage.en)}</b><span>${esc(g.stage.name)}</span>`, 3000, 'stage');
            if (g.mode === 'main') Save.unlock(this.variant, ev.n);
            break;
          case 'deny': this.toast(ev.why, 1100); break;
          case 'powerup': this.toast(`${ev.item} ${GAUGE_JA[GAUGE.indexOf(ev.item)]}`, 900); this.input.rumble(0.15, 50);
            if (ev.item !== 'SHIELD') this.sfx('powerup_' + String(ev.item).toLowerCase(), { pan: this.panOf(g, g.player.x) });
            break;
          case 'bosswarn': this.banner(`<b class="warnb">WARNING</b><span>${esc(ev.name)} 接近</span>`, 2000, 'warn'); break;
          case 'phase': this.banner(`<b class="warnb">PHASE ${ev.n}</b>`, 1400, 'warn'); break;
          case 'stageclear': this.banner(`<b>STAGE ${ev.n} CLEAR</b>`, 4000, 'stage'); break;
          case 'die': this.input.rumble(0.5, 220); break;
          case 'checkpoint': if (DEBUG) this.toast(`checkpoint ${ev.i}`); break;
          case 'shieldhit': this.input.rumble(0.2, 40); this.sfx(ev.left > 0 ? 'shield_hit' : 'shield_break', { step: ev.left, pan: this.panOf(g, g.player.x) }); break;
        }
      }
      this.renderer.onEvent?.(ev, g, demo);
    }
  }

  // ---- 1 フレーム（描画ループから呼ぶ） -------------------------------------------
  frame(nowMs) {
    const now = nowMs / 1000;
    const t0 = performance.now();
    let alpha = 0;
    if (this.screen === 'play' || this.screen === 'pause') {
      const g = this.game;
      alpha = this.step.advance(now, () => {
        const inp = this.input.poll();
        if (inp.pause) { this.pause(true); return; }
        if (this.paused) return;
        g.tick(inp);
        this.stats.ticks++;
        this.handleEvents(g.drainEvents());
        this.audioWatch(g);
        if (g.over) { this.handleEvents(g.drainEvents()); setTimeout(() => this.showResult(), g.cleared ? 400 : 1600); this.screen = 'ending'; }
      }, this.paused);
      if (this.paused) { const inp = this.input.poll(); this.menuInput(inp); }
      this.updateHud(g);
    } else if (this.screen === 'ending') {
      // 結果画面の直前（描画だけ続ける）
    } else {
      // メニュー画面（背景はデモ）
      const d = this.demo;
      alpha = this.step.advance(now, () => {
        const inp = this.input.poll();
        this.menuInput(inp);
        if (d) { d.tick(botInput(d)); this.handleEvents(d.drainEvents(), true); if (d.over || d.bossDone && d.state === 'stageclear' && d.clearTimer > 200) this.startDemo(); }
      });
    }
    this.renderer.render(this.game && (this.screen === 'play' || this.screen === 'pause' || this.screen === 'ending') ? this.game : this.demo, alpha, now);
    const ft = performance.now() - t0;
    this.stats.frames++; this.stats.ft.push(ft); if (this.stats.ft.length > 600) this.stats.ft.shift();
    if (DEBUG && this.stats.frames % 20 === 0) this.updateDebug();
  }
  menuInput(inp) {
    const m = inp.menu;
    if (!this.menu) return;
    if (this.screen === 'boot') { if (m.confirm || m.pause) this.leaveBoot(); return; }
    if (m.up) this.menuMove(-1); if (m.down) this.menuMove(1);
    if (m.left) this.menuAdjust(-1); if (m.right) this.menuAdjust(1);
    if (m.confirm) this.menuConfirm();
    else if (m.back || (m.pause && this.screen !== 'pause')) this.menuBack();
    else if (m.pause && this.screen === 'pause' && !this.menuStack.length) this.pause(false);
  }

  updateHud(g) {
    if (!g) return;
    const e = this.el, p = g.power;
    if (this._sc !== g.score) { this._sc = g.score; e.sc.textContent = fmt(g.score); }
    const hi = Math.max(g.mode === 'main' ? Save.hi(g.recordKey()) : 0, g.mode === 'main' ? g.score : 0);
    if (this._hi !== hi) { this._hi = hi; e.hv.textContent = g.mode === 'main' ? fmt(hi) : '練習'; }
    const stg = `${g.stageNo}. ${g.stage.en} ${DIFFICULTY[g.difficulty].label}${g.mode === 'practice' ? ' 練習' : ''}`;
    if (this._stg !== stg) { this._stg = stg; e.stg.textContent = stg; }
    const lives = Math.max(0, g.lives);
    if (this._lv !== lives) { this._lv = lives; e.lives.innerHTML = '<i class="ship"></i>'.repeat(Math.min(lives, 8)) + (lives > 8 ? `×${lives}` : '') + `<span class="ln">残機 ${lives}</span>`; }
    // ゲージ: 選択中・取得済み・上限・取得不能を区別
    const key = [p.sel, p.speed, p.missile, p.weapon, p.options, p.shield].join();
    if (this._gk !== key) {
      this._gk = key;
      e.gauge.querySelectorAll('.cell').forEach((c, i) => {
        const can = g.canAcquire(i);
        const st = { SPEED: p.speed >= 5 ? 'MAX' : `Lv${p.speed}`, MISSILE: p.missile ? '装備' : '', DOUBLE: p.weapon === 'double' ? '装備' : '', LASER: p.weapon === 'laser' ? '装備' : '', OPTION: p.options >= 4 ? 'MAX' : p.options ? `${p.options}` : '', SHIELD: p.shield ? `${p.shield}/5` : '' }[GAUGE[i]];
        c.classList.toggle('sel', p.sel === i);
        c.classList.toggle('have', !can.ok);
        c.classList.toggle('na', p.sel === i && !can.ok);
        c.querySelector('.gs').textContent = st;
      });
      e.eq.innerHTML = `<span>${p.weapon === 'laser' ? 'LASER' : p.weapon === 'double' ? 'DOUBLE' : 'SHOT'}</span>${p.missile ? '<span>MISSILE</span>' : ''}${p.options ? `<span>OPT×${p.options}</span>` : ''}${p.shield ? `<span class="sh">SHIELD ${'■'.repeat(p.shield)}${'□'.repeat(5 - p.shield)}</span>` : ''}`;
    }
    const b = g.boss && !g.boss.dead ? g.boss : null;
    e.boss.hidden = !b;
    if (b) {
      const def = BOSS[b.type];
      const [c, m] = def.bossHp(b);
      e.bn.textContent = def.name + (b.phase ? `  PHASE ${b.phase}` : '');
      e.bar.style.width = `${m ? (c / m) * 100 : 0}%`;
    }
  }
  updateDebug() {
    const ft = [...this.stats.ft].sort((a, b) => a - b);
    const q = (k) => ft[Math.floor((ft.length - 1) * k)]?.toFixed(2);
    const g = this.game || this.demo;
    this.el.dbg.textContent = `cpu frame p50 ${q(0.5)}ms p95 ${q(0.95)}ms p99 ${q(0.99)}ms | ${this.renderer.debugText?.() || ''} | enemies ${g?.enemies.length} bullets ${g?.ebullets.length} shots ${g?.shots.length} | camX ${g?.camX.toFixed(1)}`;
  }

  // デバッグ操作（?debug=1）
  debugKey(code) {
    const g = this.game; if (!g) return;
    if (code === 'KeyI') { g.debug.invincible = !g.debug.invincible; this.toast('無敵 ' + g.debug.invincible); }
    if (code === 'KeyN') g.debugNextStage();
    if (code === 'KeyG') g.debugSkipToBoss();
    if (code === 'KeyB') g.debugKillBoss();
    if (code === 'KeyF') g.debugFullPower();
    if (code === 'KeyC') { g.addCapsule(); }
  }
}

export function startLoop(app) {
  if (DEBUG) addEventListener('keydown', (e) => app.debugKey(e.code));
  if (app.renderer.loop) app.renderer.loop((t) => app.frame(t));
  else { const f = (t) => { app.frame(t); requestAnimationFrame(f); }; requestAnimationFrame(f); }
}
