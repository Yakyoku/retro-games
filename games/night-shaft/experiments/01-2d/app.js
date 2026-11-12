// NIGHT SHAFT 2D 版: 画面遷移・HUD・メニュー・入力・描画・音をつなぐ。
import { installErrorOverlay } from '../../shared/ui/error-overlay.js';
import { Game, STAGES } from '../../shared/core/game.js';
import { Autopilot } from '../../shared/core/autopilot.js';
import { DIFF, W } from '../../shared/core/const.js';
import { Save } from '../../shared/core/save.js';
import { AudioEngine, playGameEvents, DEFAULT_VOLUME } from '../../shared/audio/engine.js';
import { Renderer2D } from './render2d.js';
import { Input2D, PAD_GLYPH } from './input2d.js';

installErrorOverlay('NIGHT SHAFT');
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const NOTICE = 'このゲームは、Claude Codeのクラウドセッションで制作しました。';
const DISCLAIMER = '本作は独自に制作したオリジナル作品です。エレベーターで階を移動しながら書類を集める、1980年代のアーケード・アクションゲームの遊び方に着想を得ていますが、特定の作品の公式版・移植・再制作ではなく、キャラクター・音楽・効果音・画像はすべて新たに制作したものです。ゲーム会社・Anthropic による制作・監修・認定は受けていません。';
let BUILD = { commit: '', built: '' };
fetch('build-info.json').then((r) => r.ok ? r.json() : null).then((j) => { if (j) BUILD = j; }).catch(() => {});

const save = new Save('2d');
const S = save.data.settings;
const audio = new AudioEngine({ ...DEFAULT_VOLUME, ...(S.volume || {}) });
const input = new Input2D();
const cv = $('#cv');
const R = new Renderer2D(cv);
input.bindTouch($('#touch'));
document.body.classList.toggle('retro', !!S.retro);

let state = 'title';      // title | menu | play | pause | result | gameover
let game = null;          // 遊んでいるゲーム
let demo = null, demoBot = null; // タイトル背景の自動演技
let run = null;           // { difficulty, stage, score, lives, stageStartScore }
let menu = null;          // 表示中のメニュー
let toastT = 0, bgmAt = 0, playTime = 0;
let audioStarted = false;

// ---- 音: 最初の操作で有効化 ----
async function startAudio() {
  if (audioStarted) { audio.resume(); return; }
  audioStarted = true;
  await audio.init();
  if (state !== 'play') audio.playBgm('title');
}
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, startAudio, { passive: true });

// ---- 画面サイズ・画質 ----
function dprFor(w) {
  const d = devicePixelRatio || 1;
  const q = S.quality;
  if (q === 'light') return 1;
  if (q === 'standard') return Math.min(d, 2, 2560 / w);
  if (q === '4k') return Math.min(Math.max(d, 3840 / w), 4096 / w);
  return Math.min(d, 3, 4096 / w); // auto: 端末の倍率どおり（最大 4096px 幅）
}
function touchUi() { return input.device === 'touch' || (matchMedia('(pointer: coarse)').matches && input.device !== 'kb' && input.device !== 'pad'); }
let lastLayout = '';
function layout(force) {
  const app = $('#app').getBoundingClientRect();
  const w = Math.round(app.width), h = Math.round(app.height);
  const hudH = state === 'play' || state === 'pause' ? $('#hud').getBoundingClientRect().height || 52 : 0;
  const touch = touchUi() && (state === 'play');
  const key = [w, h, hudH, touch, S.quality, devicePixelRatio].join(',');
  if (key === lastLayout && !force) return;
  lastLayout = key;
  let vp = { x: 0, y: hudH, w, h: h - hudH };
  document.body.classList.remove('portrait-touch');
  if (touch && w > h) { const g = Math.max(150, Math.min(w * 0.2, 250)); vp = { x: g, y: hudH, w: w - 2 * g, h: h - hudH }; }
  else if (touch) { const ch = Math.max(210, Math.min(h * 0.36, 330)); vp = { x: 0, y: hudH, w, h: h - hudH - ch }; document.body.classList.add('portrait-touch'); }
  R.resize(w, h, dprFor(w), vp);
  const mm = $('#minimap');
  mm.style.top = `${hudH + 10}px`;
}
addEventListener('resize', () => layout());
if (window.visualViewport) visualViewport.addEventListener('resize', () => layout());
addEventListener('orientationchange', () => setTimeout(() => layout(true), 200));

// ---- メニュー（キーボード・ゲームパッド・タッチ共通） ----
function showScreen(html, items = [], { onBack = null, veil = true } = {}) {
  const sc = $('#screen');
  sc.innerHTML = (veil ? '<div class="veil"></div>' : '') + html;
  const els = [...sc.querySelectorAll('.mi')];
  menu = { els, i: Math.max(0, els.findIndex((e) => e.classList.contains('primary') && !e.disabled)), onBack, items };
  els.forEach((el, i) => {
    el.addEventListener('click', () => { focusMenu(i); activate(el, 0); });
    el.addEventListener('pointerenter', () => focusMenu(i, true));
  });
  focusMenu(menu.i, true);
}
function focusMenu(i, silent) {
  if (!menu || !menu.els.length) return;
  i = (i + menu.els.length) % menu.els.length;
  let guard = 0;
  while (menu.els[i].disabled && guard++ < menu.els.length) i = (i + 1) % menu.els.length;
  if (menu.i !== i && !silent) audio.ui('uiMove');
  menu.i = i;
  menu.els.forEach((e, k) => e.classList.toggle('focus', k === i));
  menu.els[i].scrollIntoView({ block: 'nearest' });
}
function activate(el, dx) {
  if (el.disabled) return;
  const fn = handlers[el.dataset.act];
  if (!fn) return;
  audio.ui(dx ? 'uiMove' : 'uiOk');
  fn(el, dx);
}
function menuInput(e) {
  if (!menu) return;
  if (e.up) focusMenu(menu.i - 1);
  if (e.down) focusMenu(menu.i + 1);
  const el = menu.els[menu.i];
  if (el && el.dataset.adj && (e.left || e.right)) activate(el, e.right ? 1 : -1);
  if (e.ok && el) activate(el, 0);
  else if (e.back && menu.onBack) { audio.ui('uiBack'); menu.onBack(); }
}
const mi = (act, label, { sub = '', val = '', primary = false, disabled = false, adj = false, data = '' } = {}) =>
  `<button class="mi${primary ? ' primary' : ''}" data-act="${act}" ${adj ? 'data-adj="1"' : ''} ${data} ${disabled ? 'disabled' : ''}><span>${label}${sub ? `<br><small>${sub}</small>` : ''}</span>${val !== '' ? `<span class="val">${val}</span>` : ''}</button>`;

const handlers = {};

// ---- タイトル ----
function titleScreen() {
  state = 'title';
  $('#hud').hidden = true; $('#touch').hidden = true; $('#hint').hidden = true; $('#minimap').hidden = true;
  if (!demo) startDemo();
  if (audioStarted) audio.playBgm('title');
  const pad = PAD_GLYPH[input.padStyle];
  showScreen(`
    <div class="title-wrap">
      <div>
        <h1 class="logo">NIGHT<em>SHAFT</em></h1>
        <p class="tagline">夜のビルに屋上から潜入せよ。エレベーターとエスカレーターを乗り継ぎ、赤いドアの部屋から機密書類をすべて回収して、1 階の出口から脱出する。</p>
        <div class="made"><b>${NOTICE}</b><small>${DISCLAIMER}</small></div>
      </div>
      <div class="panel">
        <div class="menu">
          ${mi('start', 'スタート', { sub: save.data.cleared.includes(0) ? '第1ビルから' : '訓練棟（チュートリアル）から', primary: true })}
          ${mi('select', 'ステージ・難易度を選ぶ', { val: DIFF[S.difficulty].label })}
          ${mi('settings', '設定', { sub: '音量・画質・ヒント' })}
          ${mi('help', '操作方法', { sub: `キーボード／ゲームパッド（${pad.jump}・${pad.fire}）／タッチ` })}
          ${mi('credits', 'クレジット')}
        </div>
        <p class="note">ハイスコア <b>${save.data.hi.toLocaleString()}</b>${save.ok ? '' : '　（この端末では保存できません）'}<br>Meta Quest 3 の VR 版: <a href="https://night-shaft-quest3.netlify.app/" style="color:#7fe0ff">night-shaft-quest3.netlify.app</a></p>
      </div>
    </div>`, [], { onBack: null });
}
handlers.start = () => startRun(save.data.cleared.includes(0) ? 1 : 0, S.difficulty);
handlers.select = () => selectScreen();
handlers.settings = () => settingsScreen(() => (state === 'pause' ? pauseScreen() : titleScreen()));
handlers.help = () => helpScreen();
handlers.credits = () => creditsScreen();

function startDemo() {
  demo = new Game({ stageIndex: 1, difficulty: 'normal', invincible: true });
  demoBot = new Autopilot(demo, { shoot: true });
  R.camY = null;
}

function selectScreen() {
  const back = () => titleScreen();
  const rows = STAGES.map((s, i) => mi('stage', `${s.name}`, { sub: `${s.sub}${i ? '・30 階・書類 6 件' : '・6 階・書類 2 件'}`, disabled: !save.unlocked(i), val: save.data.cleared.includes(i) ? 'クリア済み' : save.unlocked(i) ? '' : '未解放', data: `data-i="${i}"`, primary: i === (save.data.cleared.includes(0) ? 1 : 0) })).join('');
  showScreen(`<div class="panel"><h2>ステージ・難易度</h2><p class="sub">難易度は ← → で切り替え。ステージはクリアすると次が解放されます。</p>
    <div class="menu">${mi('diff', '難易度', { val: DIFF[S.difficulty].label, adj: true, sub: diffNote(S.difficulty) })}${rows}${mi('back', '戻る')}</div></div>`, [], { onBack: back });
}
const diffNote = (d) => ({ easy: '残機 5・敵の構えが長い', normal: '残機 3・標準', hard: '残機 3・敵が多く弾が速い（構えの予兆は残る）' }[d]);
handlers.diff = (el, dx) => { const ks = Object.keys(DIFF); S.difficulty = ks[(ks.indexOf(S.difficulty) + (dx || 1) + 3) % 3]; save.write(); const i = menu.i; selectScreen(); focusMenu(i, true); };
handlers.stage = (el) => startRun(Number(el.dataset.i), S.difficulty);
handlers.back = () => (state === 'pause' ? pauseScreen() : titleScreen());

function settingsScreen(onBack) {
  const v = audio.vol;
  const pct = (x) => Math.round(x * 100) + '%';
  const [bw, bh] = R.bufferSize;
  const qLabel = { auto: '自動（端末の倍率）', standard: '標準（最大 2 倍）', '4k': '大画面 4K・高画質', light: '軽量（1 倍）' };
  showScreen(`<div class="panel"><h2>設定</h2><p class="sub">← → で変更。変更はすぐに保存されます。</p><div class="menu">
    ${mi('vol', 'マスター音量', { val: v.muteMaster ? 'ミュート' : pct(v.master), adj: true, data: 'data-k="master"' })}
    ${mi('vol', 'BGM', { val: v.muteBgm ? 'ミュート' : pct(v.bgm), adj: true, data: 'data-k="bgm"' })}
    ${mi('vol', '効果音', { val: v.muteSfx ? 'ミュート' : pct(v.sfx), adj: true, data: 'data-k="sfx"' })}
    ${mi('vol', '補助音（メニューの音）', { val: v.muteUi ? 'ミュート' : pct(v.ui), adj: true, data: 'data-k="ui"' })}
    ${mi('quality', '画質', { val: qLabel[S.quality], adj: true, sub: `描画バッファ ${bw}×${bh}px（画面 ${innerWidth}×${innerHeight}・倍率 ${devicePixelRatio}）` })}
    ${mi('hints', 'チュートリアルのヒント', { val: S.hints ? '表示' : '非表示', adj: true })}
    ${mi('retro', 'レトロ表示（走査線）', { val: S.retro ? 'オン' : 'オフ', adj: true, sub: '任意。標準の高精細表示は変わりません' })}
    ${mi('back2', '戻る')}
  </div><p class="note">決定ボタン（Enter・${PAD_GLYPH[input.padStyle].jump}・タップ）でミュートの切り替え。</p></div>`, [], { onBack });
  handlers.back2 = onBack;
}
handlers.vol = (el, dx) => {
  const k = el.dataset.k; const mk = 'mute' + k[0].toUpperCase() + k.slice(1);
  const v = { ...audio.vol };
  if (!dx) v[mk] = !v[mk]; else { v[k] = Math.max(0, Math.min(1, Math.round((v[k] + dx * 0.1) * 10) / 10)); v[mk] = false; }
  audio.setVolume(v); S.volume = audio.vol; save.write();
  const i = menu.i; settingsScreen(menu.onBack); focusMenu(i, true);
};
handlers.quality = (el, dx) => {
  const ks = ['auto', 'standard', '4k', 'light']; S.quality = ks[(ks.indexOf(S.quality) + (dx || 1) + ks.length) % ks.length]; save.write();
  layout(true); const i = menu.i; settingsScreen(menu.onBack); focusMenu(i, true);
};
handlers.hints = () => { S.hints = !S.hints; save.write(); const i = menu.i; settingsScreen(menu.onBack); focusMenu(i, true); };
handlers.retro = () => { S.retro = !S.retro; save.write(); document.body.classList.toggle('retro', S.retro); const i = menu.i; settingsScreen(menu.onBack); focusMenu(i, true); };

function helpScreen() {
  const g = PAD_GLYPH[input.padStyle];
  showScreen(`<div class="panel"><h2>操作方法</h2><p class="sub">ミッション: 赤いドア（書類マーク）の部屋で書類をすべて回収し、1 階の出口へ。敵を全滅させる必要はありません。</p>
    <div class="keys">
      <span><kbd>←</kbd><kbd>→</kbd> / <kbd>A</kbd><kbd>D</kbd></span><span>移動</span>
      <span><kbd>↑</kbd> / <kbd>W</kbd></span><span>ドアに入る・かごを呼ぶ・エスカレーター（上り口）／乗車中は上昇</span>
      <span><kbd>↓</kbd> / <kbd>S</kbd></span><span>しゃがむ・エスカレーター（下り口）／乗車中は下降</span>
      <span><kbd>Z</kbd></span><span>射撃（0.25 秒間隔・弾数無制限）</span>
      <span><kbd>X</kbd> / <kbd>Space</kbd></span><span>ジャンプ。跳んで敵に当たるとキック</span>
      <span><kbd>Esc</kbd></span><span>一時停止</span>
      <span>ゲームパッド</span><span>十字キー／左スティック: 移動・上下　${g.jump}: ジャンプ　${g.fire}: 射撃　${g.pause}: 一時停止　${g.back}: 戻る</span>
      <span>タッチ</span><span>左: 方向パッド　右: 射撃・ジャンプ・操作（↑）</span>
    </div>
    <p class="note">・敵はバイザーが光ってから撃ちます。高い弾はしゃがみ、低い弾はジャンプでよける。木箱などの遮蔽物は弾を止めます。<br>
    ・ジャンプ中に撃つと天井の照明を落とせます（下の敵を倒す・300 点）。消えた場所は暗く、敵に見つかりにくくなります。<br>
    ・かごの屋根に乗ったまま上昇すると挟まれます。屋根の上にいる敵は、かごを上げると倒せます（300 点）。<br>
    ・得点: 射撃 100／キック 200／照明・昇降機 300／書類 500／脱出 1000</p>
    <div class="menu" style="margin-top:12px">${mi('back', '戻る', { primary: true })}</div></div>`, [], { onBack: () => titleScreen() });
}
function creditsScreen() {
  showScreen(`<div class="panel"><h2>クレジット</h2>
    <div class="made" style="margin-top:6px"><b>${NOTICE}</b><small>${DISCLAIMER}</small></div>
    <p class="note">企画・プログラム・キャラクター・背景・作曲・効果音: Claude Code のクラウドセッションで制作（人間の専門家やゲーム会社の参加・監修はありません）。<br>
    描画: Canvas 2D（ベクター描画）。音: 自作のチップ音源風シンセサイザー（Web Audio）。外部の画像・音源ファイルは使っていません。<br>
    版: ${BUILD.commit || '開発版'} ${BUILD.built ? '・' + BUILD.built.slice(0, 10) : ''}</p>
    <div class="menu" style="margin-top:12px">${mi('back', '戻る', { primary: true })}</div></div>`, [], { onBack: () => titleScreen() });
}

// ---- ゲームの進行 ----
function startRun(stage, difficulty) {
  run = { difficulty, stage, score: 0, lives: DIFF[difficulty].lives };
  startStage();
}
function startStage() {
  run.stageStartScore = run.score;
  game = new Game({ stageIndex: run.stage, difficulty: run.difficulty, score: run.score, lives: run.lives });
  state = 'play'; playTime = 0;
  $('#screen').innerHTML = ''; menu = null;
  $('#hud').hidden = false; $('#minimap').hidden = false;
  R.camY = null; R.fx = []; R.popups = []; R.scarf = null;
  audio.stopAll(); audio.clearPaused();
  const d = audio.playJingle('start') || 0;
  bgmAt = d ? d - 0.35 : 0.01; // ジングルがまだ描けていない時も、ステージの BGM は必ず始める
  toast(`${STAGES[run.stage].name}　書類 ${game.docTotal} 件を回収せよ`, 'info', 3.2);
  layout(true);
}
function retryStage() {
  run.score = run.stageStartScore; run.lives = DIFF[run.difficulty].lives;
  startStage();
}
function pause() {
  if (state !== 'play') return;
  state = 'pause';
  audio.pauseBgm(); audio.setHum(false); audio.stopJingle();
  input.releaseAll();
  pauseScreen();
}
function pauseScreen() {
  state = 'pause';
  showScreen(`<div class="panel"><h2>一時停止</h2><p class="sub">${STAGES[run.stage].name}・${DIFF[run.difficulty].label}・書類 ${game.docsGot}/${game.docTotal}${game.remainingDocFloors().length ? `（残り: ${game.remainingDocFloors().map((f) => f + 'F').join('・')}）` : ''}</p>
    <div class="menu">${mi('resume', '再開', { primary: true })}${mi('settings', '設定')}${mi('help2', '操作方法')}${mi('retry', 'リトライ', { sub: 'このステージを最初から（残機は初期値に戻る）' })}${mi('quit', 'タイトルへ戻る')}</div></div>`, [], { onBack: resume });
}
function resume() {
  state = 'play'; $('#screen').innerHTML = ''; menu = null;
  input.releaseAll();
  if (playTime >= bgmAt) audio.resumeBgm(); else audio.clearPaused();
  layout(true);
}
handlers.resume = resume;
handlers.retry = () => retryStage();
handlers.quit = () => { audio.stopAll(); game = null; titleScreen(); };
handlers.help2 = () => { helpScreen(); menu.onBack = pauseScreen; document.querySelector('[data-act="back"]').dataset.act = 'backPause'; };
handlers.backPause = () => pauseScreen();

function resultScreen() {
  state = 'result';
  run.score = game.score; run.lives = game.lives;
  save.markCleared(run.stage);
  const hi = save.submitScore(run.score);
  const last = run.stage >= STAGES.length - 1;
  if (last) { audio.playJingle('allclear'); }
  const mins = Math.floor(playTime / 60), secs = Math.floor(playTime % 60);
  showScreen(`<div class="panel"><h2>${last ? '全ステージ達成！' : 'ステージクリア'}</h2><p class="sub">${STAGES[run.stage].name}から脱出しました${last ? '。すべての書類が本部に届きました。' : ''}</p>
    <div class="big">${run.score.toLocaleString()}</div>
    <table class="tbl"><tr><td>書類</td><td>${game.docsGot} / ${game.docTotal}</td></tr><tr><td>撃破</td><td>${game.kills}</td></tr><tr><td>時間</td><td>${mins}:${String(secs).padStart(2, '0')}</td></tr><tr><td>残機</td><td>${game.lives}</td></tr><tr><td>ハイスコア</td><td>${hi ? '更新！ ' : ''}${save.data.hi.toLocaleString()}</td></tr></table>
    <div class="menu" style="margin-top:14px">${last ? mi('quit', 'タイトルへ', { primary: true }) : mi('next', '次のステージへ', { primary: true, sub: STAGES[run.stage + 1].name })}${last ? '' : mi('quit', 'タイトルへ')}</div></div>`, [], { onBack: null });
}
handlers.next = () => { run.stage++; startStage(); };
function gameoverScreen() {
  state = 'gameover';
  const hi = save.submitScore(game.score);
  showScreen(`<div class="panel"><h2>ゲームオーバー</h2><p class="sub">${STAGES[run.stage].name}・書類 ${game.docsGot}/${game.docTotal}</p>
    <div class="big">${game.score.toLocaleString()}</div><p class="note">${hi ? 'ハイスコア更新！' : `ハイスコア ${save.data.hi.toLocaleString()}`}</p>
    <div class="menu" style="margin-top:10px">${mi('retry', 'リトライ', { primary: true, sub: 'このステージを最初から' })}${mi('quit', 'タイトルへ戻る')}</div></div>`, [], { onBack: null });
}

// ---- HUD ----
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function setHtml(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).innerHTML = v; } }
function toast(msg, kind = '', sec = 2.4) { const t = $('#toast'); t.textContent = msg; t.className = kind; t.hidden = false; toastT = sec; }
function updateHud(dt) {
  if (!game) return;
  setText('#h-score', game.score.toLocaleString());
  setText('#h-hi', Math.max(save.data.hi, game.score).toLocaleString());
  setText('#h-docs', `${game.docsGot}/${game.docTotal}`);
  setText('#h-floor', `${game.playerFloor}F`);
  setHtml('#h-left', game.remainingDocFloors().map((f) => `<span>${f}F</span>`).join(''));
  setHtml('#h-lives', '<i></i>'.repeat(Math.max(0, game.lives - (game.phase === 'dead' ? 1 : 0))));
  const hint = S.hints && game.hint && state === 'play' ? game.hint : '';
  if (hudCache.hint !== hint) { hudCache.hint = hint; $('#hint').textContent = hint; $('#hint').hidden = !hint; }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('#toast').hidden = true; }
  const touch = touchUi() && state === 'play';
  $('#touch').hidden = !touch;
  $('#hint').style.bottom = touch ? (innerWidth > innerHeight ? '14px' : `${Math.max(210, Math.min(innerHeight * 0.36, 330)) + 8}px`) : '';
  const ctx = game.player.ctx;
  setText('#t-ctx', !ctx ? '↑' : { door: '書類', escUp: '上へ', call: '呼ぶ', car: '上昇', escDown: '↑' }[ctx.kind] || '↑');
  drawMinimap();
}
function drawMinimap() {
  const mm = $('#minimap'); const c = mm.getContext('2d');
  const st = game.stage; const n = st.floors;
  const w = mm.width, h = mm.height;
  c.clearRect(0, 0, w, h);
  c.fillStyle = 'rgba(8,12,22,.85)'; c.fillRect(0, 0, w, h);
  const fh = (h - 8) / n;
  const docs = new Set(game.remainingDocFloors());
  for (let f = 1; f <= n; f++) {
    const y = h - 4 - f * fh;
    c.fillStyle = docs.has(f) ? '#e0414f' : 'rgba(255,255,255,.08)';
    c.fillRect(6, y + 1, w - 12, Math.max(1, fh - 2));
  }
  c.fillStyle = '#36f08a'; c.fillRect(w - 10, h - 4 - fh, 6, fh - 1);
  const py = h - 4 - (game.player.y / 3 + 1) * fh;
  c.fillStyle = '#ff9b3a'; c.beginPath(); c.arc(w / 2, py + fh / 2, Math.max(3, fh * 0.7), 0, 7); c.fill();
  mm.style.height = Math.min(innerHeight * 0.35, 220) + 'px';
}

// ---- 入出力のつなぎ ----
input.onPadChange = (on) => { toast(on ? 'ゲームパッドが接続されました' : 'ゲームパッドが切断されました（一時停止）', 'info', 2.2); if (!on) pause(); };
input.onDevice = () => layout(true);
$('#btn-pause').addEventListener('click', () => pause());
addEventListener('blur', () => pause());
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); audio.suspend(); } else if (audioStarted) audio.resume(); });

// ---- ループ ----
let last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 0, frameMs = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  const t0 = performance.now();
  const inp = input.poll();
  if (state === 'play' && game) {
    if (inp.edge.pause) pause();
    else {
      game.step(dt, inp.held);
      playTime += dt;
      if (bgmAt && playTime >= bgmAt && game.phase === 'play') { audio.playBgm('stage'); bgmAt = 0; }
      const evs = game.drainEvents();
      R.onEvents(game, evs);
      playGameEvents(audio, game, evs, { panOf: (x) => (x - game.player.x) / W * 0.8 });
      for (const ev of evs) {
        if (ev.type === 'needDocs') toast(`書類があと ${ev.left} 件：${ev.floors.map((f) => f + 'F').join('・')}`, '', 2.6);
        if (ev.type === 'doc' && ev.got === ev.total) toast('書類をすべて回収！ 1 階の出口へ', 'info', 3);
      }
      if (game.phase === 'clear' && game.phaseT > 2.4) resultScreen();
      if (game.phase === 'gameover' && game.phaseT > 2.6) gameoverScreen();
    }
  } else {
    menuInput(inp.edge);
    if (state === 'title' && demo) {
      demo.step(dt, demoBot.input()); demo.drainEvents();
      if (demo.phase === 'clear' || demo.time > 150) startDemo();
    }
  }
  const g = state === 'title' || !game ? demo : game;
  R.noPrompts = g === demo;
  if (g) R.draw(g, now / 1000, state === 'play' ? dt : (state === 'title' ? dt : 0));
  if (state === 'play' || state === 'pause') updateHud(dt);
  frameMs = performance.now() - t0;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (DEBUG) debugInfo(); }
}
function debugInfo() {
  const d = $('#debug'); d.hidden = false;
  const [bw, bh] = R.bufferSize;
  const g = game || demo;
  d.textContent = `fps ${fps.toFixed(1)}  frame ${frameMs.toFixed(2)}ms\nbuffer ${bw}x${bh}  css ${innerWidth}x${innerHeight}  dpr ${devicePixelRatio}\nstate ${state}  phase ${g && g.phase}  enemies ${g ? g.enemies.length : 0}\naudio ${audio.ctx ? audio.ctx.state : 'off'} render ${audio.renderMs.toFixed(0)}ms  device ${input.device}`;
}
if (DEBUG) {
  addEventListener('keydown', (e) => {
    if (!game) return;
    if (e.code === 'KeyI') { game.opts.invincible = !game.opts.invincible; toast('（デバッグ）無敵 ' + (game.opts.invincible ? 'オン' : 'オフ'), 'info'); }
    if (e.code === 'KeyC') { for (const d of game.doors) if (d.kind === 'doc' && !d.collected) { d.collected = true; game.docsGot++; } toast('（デバッグ）書類をすべて回収済みにしました', 'info'); }
  });
}
window.__ns = { get game() { return game; }, get demo() { return demo; }, get state() { return state; }, audio, R, save, input, startRun, pause, resume };

layout(true);
titleScreen();
$('#loading').hidden = true;
requestAnimationFrame(frame);
