// 2D アーケードモード: 画面遷移（難易度・ステージ選択 → チュートリアル → プレイ → 結果 → 次の面 → 全クリア）、HUD、保存、音
import { createGame2D, createTutorial2D, step, nextStage, TUTORIAL_STEPS_2D } from '../../shared/game2d.js';
import { createRenderer2D } from '../../shared/render2d.js';
import { createInput } from '../../shared/input.js';
import { installTouch } from '../../shared/touch.js';
import { createMenu, CREDIT } from '../../shared/ui.js';
import { installNoZoom } from '../../shared/no-zoom.js';
import { makeFrameClock } from '../../shared/frame-clock.js';
import { loadAudio, EVENT_SFX } from '../../shared/audio-safe.js';
import { DIFFICULTIES, DIFFICULTY_IDS, RULES } from '../../shared/config.js';
import { STAGES_2D } from '../../shared/stages.js';
import { makeScore } from '../../shared/rules.js';
import * as save from '../../shared/save.js';

const DEBUG = /[?&]debug=1/.test(location.search);
const cv = document.getElementById('cv');
const $ = (id) => document.getElementById(id);
const hud = $('hud');
const S = save.settings();
const input = createInput();
const audio = await loadAudio(S);
const menu = createMenu(document.body, { onSound: (n) => audio.play(n) });
const renderer = createRenderer2D(cv);
const touch = installTouch(input, { onPause: () => { if (mode === 'play') pause(); else input.tap('back'); } });
$('loading').remove();

let mode = 'menu';     // 'menu' | 'play' | 'paused'
let g = null;          // 現在のゲーム
let run = null;        // { kind: 'run'|'practice'|'tutorial', difficulty }
let acc = 0, lastT = 0, simT = 0;
const clock = makeFrameClock();
let unlocked = false;

installNoZoom(() => { if (g) renderer.layout(g); });

async function ensureAudio() { if (unlocked) return; unlocked = true; try { await audio.unlock(); } catch {} }
addEventListener('pointerdown', ensureAudio, { capture: true });
addEventListener('keydown', ensureAudio, { capture: true });

function toast(t, ms = 1600) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('on'), ms); }
const diffName = () => DIFFICULTIES[S.difficulty].label;
const recKey = (kind) => save.recordKey('2d', run ? run.difficulty : S.difficulty, kind === 'practice' ? 'practice' : 'run');

// ---------------- 画面 ----------------
function titleScreen() {
  mode = 'menu'; hud.hidden = true; audio.music.start('title'); audio.amb.stop();
  const hi = save.getRecord(save.recordKey('2d', S.difficulty, 'run')).hi;
  menu.show({
    kicker: 'ARCADE 2D', title: '地底探検：ポンプ・パトロール', credit: true,
    text: `地面の断面を掘り進み、ポンプで敵を膨らませて倒す。岩の支えを掘れば、まとめて落とせる。\n通しプレイのハイスコア（${diffName()}）: ${hi.toLocaleString()}`,
    items: [
      { label: '難易度', kind: 'choice', get: () => S.difficulty, set: (v) => { save.setSetting('difficulty', v); titleScreen(); },
        options: DIFFICULTY_IDS.map((id) => ({ value: id, label: DIFFICULTIES[id].label })), sub: '残機・膨らませる回数・予兆の長さが変わる' },
      { label: '通しプレイ', sub: '1〜6 面を続けて遊ぶ（記録に残る）', action: () => startRun('run') },
      { label: '練習（ステージ選択）', sub: 'クリアした面までを選んで練習（記録は通しプレイと別）', action: practiceScreen },
      { label: '遊び方（チュートリアル）', sub: '掘る・ポンプ・落石を順番に試す', action: () => startTutorial(null) },
      { label: '操作方法', action: helpScreen },
      { label: '設定', action: () => settingsScreen(titleScreen) },
      { label: 'トップページへ戻る', back: true, action: () => { location.href = '../../'; } },
    ],
    onBack: () => { location.href = '../../'; },
  });
}
function practiceScreen() {
  const n = DEBUG ? 6 : save.unlocked('2d', S.difficulty);
  menu.show({
    kicker: 'PRACTICE · ' + diffName(), title: '練習するステージ',
    items: [...STAGES_2D.map((st, i) => ({ label: `${i + 1}. ${st.name}`, sub: i < n ? st.goal : 'まだ選べません（通しプレイか、ひとつ前の面をクリア）', disabled: i >= n, action: () => startRun('practice', i) })),
      { label: '戻る', back: true, action: titleScreen }],
    onBack: titleScreen,
  });
}
function helpScreen() {
  menu.show({ kicker: 'HOW TO PLAY', title: '操作方法', wide: true, html: true,
    text: '<table>' +
      '<tr><td>移動</td><td>矢印キー／WASD　・　十字キー／左スティック　・　画面左のパッド</td></tr>' +
      '<tr><td>ポンプ</td><td>Space／J　・　A ボタン（RT でも可）　・　右の「ポンプ」ボタン<br>連打でも長押しでも、送気は 0.3 秒ごと</td></tr>' +
      '<tr><td>一時停止</td><td>Escape／P　・　メニューボタン　・　右上の II</td></tr>' +
      '<tr><td>メニュー</td><td>上下で選ぶ・Enter／A で決定・Backspace／B で戻る・左右で値を変える</td></tr>' +
      '</table>\n<b>ルール</b>　膨らんで止まっている敵には触れても平気。ポンプを外すと 1 秒後から縮み始める。' +
      '岩の真下を掘って離れると、揺れてから落ちる（落下中の岩は自分にも当たる）。火炎型は向きを決めて溜めてから炎を吐く。炎は土で止まる。',
    items: [{ label: '戻る', back: true, action: titleScreen }], onBack: titleScreen });
}
function settingsScreen(back) {
  const vol = (k, label) => ({ label, kind: 'slider', get: () => S.vol[k], set: (v) => { S.vol[k] = v; save.persist(); audio.setVolumes(S.vol); }, step: 0.1 });
  menu.show({ kicker: 'SETTINGS', title: '設定',
    items: [vol('master', '全体の音量'), vol('bgm', '音楽'), vol('sfx', '効果音'), vol('amb', '環境音（洞窟の気配）'),
      { label: '消音', kind: 'toggle', get: () => S.muted, set: (v) => { save.setSetting('muted', v); audio.setMuted(v); } },
      { label: 'FPS を表示', kind: 'toggle', get: () => S.showFps, set: (v) => save.setSetting('showFps', v) },
      { label: 'チュートリアルをもう一度見る', sub: '次の通しプレイの前に表示', action: () => { S.tutorialDone['2d'] = false; save.persist(); toast('次の通しプレイの前に表示します'); } },
      { label: '戻る', back: true, action: back }],
    foot: save.saveStatus === 'unavailable' ? 'このブラウザでは保存できません（設定はこのページを閉じるまで有効）' : '設定と記録はこのブラウザの中に保存されます',
    onBack: back });
}

// ---------------- プレイ ----------------
function startRun(kind, stageIndex = 0) {
  run = { kind, difficulty: S.difficulty, startStage: stageIndex };
  if (kind === 'run' && !S.tutorialDone['2d']) { startTutorial(() => startRun(kind, stageIndex)); return; }
  g = createGame2D({ difficulty: S.difficulty, stageIndex, score: makeScore(), seed: (Date.now() & 0xffff) });
  beginStage();
}
function startTutorial(after) {
  run = { kind: 'tutorial', difficulty: S.difficulty, after };
  g = createTutorial2D({ difficulty: 'easy', score: makeScore() });
  beginStage();
}
async function beginStage() {
  menu.hide(); hud.hidden = false; mode = 'play'; input.reset(); touch.reset();
  renderer.layout(g);
  updateHud(true);
  const theme = STAGES_2D[g.stageIndex] ? STAGES_2D[g.stageIndex].theme : 'soil';
  audio.music.stop();
  audio.amb.start(g.tut ? 'soil' : theme);
  if (!g.tut) { g.holdStart = true; await audio.jingle('start'); g.holdStart = false; }
  if (g.tut) audio.music.start('tutorial'); else audio.music.start('stage-' + theme);
}
function pause() {
  if (mode !== 'play') return;
  mode = 'paused'; audio.suspend(); input.reset(); touch.reset();
  menu.show({ kicker: 'PAUSE', title: '一時停止', credit: true,
    items: [
      { label: '続ける', action: resume },
      { label: '設定', action: () => settingsScreen(() => { mode = 'play'; pause(); }) },
      ...(g.tut ? [{ label: 'チュートリアルを飛ばす', action: finishTutorial }] : [{ label: 'この面をやり直す', sub: run.kind === 'run' ? '通しプレイでは得点を 0 からやり直します' : '', action: retryStage }]),
      { label: 'タイトルへ', back: true, action: () => { audio.resume(); audio.music.stop(); titleScreen(); } },
    ], onBack: resume });
}
function resume() { menu.hide(); mode = 'play'; input.reset(); audio.resume(); lastT = 0; }
function retryStage() {
  audio.resume();
  const st = g.stageIndex;
  g = createGame2D({ difficulty: run.difficulty, stageIndex: st, score: makeScore(), seed: (Date.now() & 0xffff) });
  beginStage();
}
function finishTutorial() {
  S.tutorialDone['2d'] = true; save.persist(); audio.resume();
  const after = run.after;
  if (after) after(); else titleScreen();
}

function onEvents(g) {
  for (const e of g.events) {
    const name = EVENT_SFX[e.type];
    const pan = e.enemy ? Math.max(-1, Math.min(1, (e.enemy.x - g.board.cols / 2) / (g.board.cols / 2))) * 0.6 : 0;
    if (name) audio.play(name, { pan, stage: e.stage || (e.count | 0) });
    if (e.type === 'pop' || e.type === 'rock-crush') audio.play('score-pop');
    if (e.type === 'miss') { audio.music.stop(); audio.jingle('miss'); }
    if (e.type === 'respawn') audio.music.start('stage-' + g.board.theme);
    if (e.type === 'clear') { audio.music.stop(); if (!g.tut) audio.jingle('clear'); }
    if (e.type === 'gameover') { audio.music.stop(); audio.jingle('gameover'); }
    if (e.type === 'extra') toast('残機が 1 つ増えた！');
    if (e.type === 'miss-soft') toast('あぶない！ 開始位置に戻ります');
  }
}

function afterClear() {
  if (g.tut) {
    menu.show({ kicker: 'TUTORIAL', title: 'チュートリアル完了', text: 'これで基本はばっちり。本番の敵は道をたどって追いかけ、ときどき土を通り抜ける（その前に体が揺れて砂の輪郭になる）。',
      items: [{ label: run.after ? '通しプレイを始める' : 'タイトルへ', action: finishTutorial }], onBack: finishTutorial });
    mode = 'menu'; return;
  }
  const kind = run.kind; const idx = g.stageIndex;
  save.unlock('2d', run.difficulty, idx + 2);
  mode = 'menu';
  if (kind === 'practice') {
    const better = save.submitRecord(recKey('practice'), g.score.score, idx + 1);
    menu.show({ kicker: 'PRACTICE CLEAR', title: `${idx + 1}. ${STAGES_2D[idx].name} クリア`, text: `得点 ${g.score.score.toLocaleString()}${better ? '\n練習の最高記録を更新！' : ''}`,
      items: [
        ...(idx + 1 < 6 ? [{ label: `次の面（${idx + 2}. ${STAGES_2D[idx + 1].name}）を練習`, action: () => startRun('practice', idx + 1) }] : []),
        { label: 'もう一度', action: () => startRun('practice', idx) }, { label: 'タイトルへ', back: true, action: titleScreen }], onBack: titleScreen });
    return;
  }
  if (idx + 1 >= STAGES_2D.length) {
    const better = save.submitRecord(recKey('run'), g.score.score, 6);
    audio.jingle(better ? 'highscore' : 'allclear');
    menu.show({ kicker: 'ALL CLEAR', title: '全 6 面クリア！', credit: true,
      text: `${diffName()}　最終得点 ${g.score.score.toLocaleString()}　残機 ${g.lives}${better ? '\nハイスコア更新！' : ''}`,
      items: [{ label: '新しく挑戦する', action: () => startRun('run') }, { label: 'タイトルへ', back: true, action: titleScreen }], onBack: titleScreen });
    return;
  }
  menu.show({ kicker: `STAGE ${idx + 1} CLEAR`, title: `${STAGES_2D[idx].name} クリア`,
    text: `得点 ${g.score.score.toLocaleString()}（クリア +${RULES.score.clear}）　残機 ${g.lives}\n次: ${idx + 2}. ${STAGES_2D[idx + 1].name}`,
    items: [{ label: '次の面へ', action: () => { nextStage(g); beginStage(); } }, { label: 'タイトルへ（記録して終わる）', back: true, action: () => { save.submitRecord(recKey('run'), g.score.score, idx + 1); titleScreen(); } }],
    onBack: () => {} });
}
function gameOver() {
  mode = 'menu';
  const better = run.kind === 'tutorial' ? false : save.submitRecord(recKey(run.kind), g.score.score, g.stageIndex);
  menu.show({ kicker: 'GAME OVER', title: 'ゲームオーバー', text: `得点 ${g.score.score.toLocaleString()}　${g.stageIndex + 1} 面まで${better ? '\nハイスコア更新！' : ''}`,
    items: [{ label: '新しく挑戦する', sub: '得点を 0 から', action: () => startRun(run.kind, run.kind === 'practice' ? g.stageIndex : 0) }, { label: 'タイトルへ', back: true, action: titleScreen }],
    onBack: titleScreen });
}

// ---------------- HUD ----------------
let hudCache = '';
function updateHud(force) {
  if (!g) return;
  const hi = Math.max(g.score.score, save.getRecord(recKey(run.kind)).hi);
  const step = g.tut ? TUTORIAL_STEPS_2D[g.tut.step] : null;
  const dev = input.device;
  const goal = g.tut ? step.text + (dev === 'gamepad' ? '（A ボタンでポンプ）' : dev === 'touch' ? '（右のボタンでポンプ）' : '')
    : g.phase === 'ready' ? g.board.goal : '';
  const key = [g.score.score, hi, g.lives, g.stageIndex, goal].join('|');
  if (!force && key === hudCache) return;
  hudCache = key;
  $('h-score').textContent = g.score.score.toLocaleString();
  $('h-hi').textContent = hi.toLocaleString();
  $('h-lives').innerHTML = '<i></i>'.repeat(Math.min(8, g.lives));
  $('h-stage').textContent = g.tut ? 'TUTORIAL' : `STAGE ${g.stageIndex + 1} / 6`;
  $('h-sname').textContent = g.tut ? 'れんしゅう' : g.board.name;
  $('h-diff').textContent = (run.kind === 'practice' ? '練習・' : '') + DIFFICULTIES[run.difficulty].label;
  $('h-goal').textContent = goal;
}

// ---------------- ループ ----------------
let fpsN = 0, fpsT = 0, fps = 0;
function frame(now) {
  requestAnimationFrame(frame);
  input.poll();
  const inp = input.read();
  const dt = clock(now);
  if (menu.open) menu.handle(inp);
  if (mode === 'play' && g) {
    if (inp.pressed.has('pause') || inp.pressed.has('back') && input.device === 'gamepad') { pause(); }
    else if (!g.holdStart) {
      acc = Math.min(acc + dt, 0.25);
      while (acc >= RULES.tick) {
        step(g, inp); acc -= RULES.tick; simT += RULES.tick;
        onEvents(g);
        inp.pressed.clear();
        if (g.phase !== 'play' && g.phase !== 'ready' && g.phase !== 'miss') break;
      }
      audio.music.setWalking(g.phase === 'play' && g.player.moving && !g.tut);
      if (g.phase === 'clear' && g.phaseT >= RULES.clearDuration * 0.6) afterClear();
      else if (g.phase === 'over' && g.phaseT >= 0.1) { setTimeout(gameOver, 1800); g.phase = 'overShown'; }
    }
    updateHud();
  } else audio.music.setWalking(false);
  if (g) renderer.draw(g, mode === 'play' ? acc / RULES.tick : 1, mode === 'play' ? simT : simT);
  else drawIdle(now);
  fpsN++; if (now - fpsT > 500) { fps = Math.round(fpsN * 1000 / (now - fpsT)); fpsN = 0; fpsT = now; if (S.showFps || DEBUG) $('h-sname').dataset.fps = fps; }
  if ((S.showFps || DEBUG) && g) $('h-diff').textContent = `${DIFFICULTIES[run.difficulty].label} · ${fps}fps · ${cv.width}×${cv.height}`;
}
// タイトル中の背景（最初の面を飾りとして描く）
let idleG = null;
function drawIdle(now) {
  if (!idleG) { idleG = createGame2D({ difficulty: 'easy', score: makeScore() }); idleG.phase = 'play'; renderer.layout(idleG); }
  renderer.draw(idleG, 1, now / 1000);
}

// 一時停止の自動化: タブ非表示・フォーカス喪失
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (mode === 'play') pause(); audio.suspend(); } else if (mode !== 'play') { /* 再開はメニューから */ } });
addEventListener('blur', () => { if (mode === 'play') pause(); });
addEventListener('resize', () => { if (g) renderer.layout(g); else if (idleG) renderer.layout(idleG); });

if (DEBUG) {
  addEventListener('keydown', (e) => {
    if (!g || mode !== 'play') return;
    if (e.code === 'KeyN') { for (const en of g.enemies) en.alive = false; }
    if (e.code === 'KeyI') { g.player.guard = 9999; toast('無敵'); }
  });
  window.__game = () => g;
}
window.__credit = CREDIT;
titleScreen();
requestAnimationFrame(frame);
