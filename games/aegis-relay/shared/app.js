// AEGIS RELAY — 画面の流れ（2D 版・3D 版で共通）
// boot → title → howto → play ⇄ pause（設定・再開・タイトルへ） → over → result → リトライ / タイトル
// 描画側（renderer）は app.screen / app.menu / app.game を読んで描くだけ。ルールはここと sim.js にしかない。
import { createGame, step, debug as simDebug } from './sim.js';
import { makeStepper } from './stepper.js';
import { routeSound } from './sound-map.js';
import { store, modeOf } from './store.js';
import { AREAS } from './rules.js';

export const HOWTO = [
  { h: 'あそびかた', lines: ['移動しながら前へ撃ち、空の敵と大地の標的を壊して進む。', '各エリアの最後にある「エリアコア」を壊すと次のエリアへ。', '撃ち逃しても大陸の手前から再接近できる。8 エリアの先は周回（だんだん速くなる）。'] },
  { h: 'リレー（合体）', lines: ['金色の格納庫を壊すと支援機「ARC」が出てくる。', '触れると合体し、弾が 3 列・速い連射になる。', 'やられると合体は解ける。合体中にもう一機つかまえると 5000 点。'] },
  { h: 'ボーナス', lines: ['ジェミニ: 左右から寄ってくる 2 機を、合体する前に両方壊すと 5000 点。', 'ラティス: 一列に並ぶ 8 枚のパネルを途切れずに壊すと 10000 点。', 'シジル: 大地のどこかに見えない印がある。かすかに光る場所へ撃ち込むと…'] },
  { h: '操作', lines: ['移動: 矢印 / WASD・左スティック / 十字キー', '射撃: Space / Z・A（南）ボタン（押し続けで連射）', 'ポーズ: Esc・Start　タッチ: 左でスティック、右下で射撃'] },
];

export function createApp({ input, audio, variant, hooks = {} }) {
  const params = new URLSearchParams(location.search);
  const DEBUG = params.has('debug');
  const app = {
    variant, screen: 'title', menu: null, game: null, howtoPage: 0, result: null, debug: DEBUG,
    flash: null, // 画面中央の短い文字（エリア名など）
    banner(text, sub, ticks = 120) { app.flash = { text, sub, t: 0, ticks }; },
  };
  let stepper = null;
  const settings = store.settings;

  const applyAudio = () => { audio.setStyle?.(settings.soundStyle); audio.setVolumes({ master: settings.master, bgm: settings.bgm, se: settings.se, mute: settings.mute }); };
  applyAudio();

  // ── メニューの定義 ──
  const pct = (v) => `${Math.round(v * 100)}%`;
  function range(label, key, min, max, stepV, fmt = pct, after) {
    return { kind: 'range', label, get: () => fmt(settings[key]), left: () => set(key, Math.max(min, +(settings[key] - stepV).toFixed(3))), right: () => set(key, Math.min(max, +(settings[key] + stepV).toFixed(3))), after };
  }
  function toggle(label, key, after, on = 'オン', off = 'オフ') { return { kind: 'toggle', label, get: () => (settings[key] ? on : off), act: () => set(key, !settings[key]), left: () => set(key, !settings[key]), right: () => set(key, !settings[key]), after }; }
  function choice(label, key, opts) {
    const idx = () => Math.max(0, opts.findIndex((o) => o[0] === settings[key]));
    return { kind: 'choice', label, get: () => opts[idx()][1], left: () => set(key, opts[(idx() + opts.length - 1) % opts.length][0]), right: () => set(key, opts[(idx() + 1) % opts.length][0]), act: () => set(key, opts[(idx() + 1) % opts.length][0]) };
  }
  function set(k, v) { store.set(k, v); applyAudio(); hooks.settingsChanged?.(k, v); }

  function settingsItems() {
    const items = [
      range('全体の音量', 'master', 0, 1, 0.1), range('曲の音量', 'bgm', 0, 1, 0.1), range('効果音の音量', 'se', 0, 1, 0.1), toggle('消音', 'mute'),
      choice('サウンド', 'soundStyle', [['modern', 'モダン'], ['chip', 'クラシック（チップ音源）']]),
      toggle('自動連射（補助・記録は別枠）', 'autofire', null, 'オン', 'オフ'),
      range('画面の揺れ', 'shake', 0, 1, 0.5), range('強い光', 'flash', 0, 1, 0.5),
      toggle('ヒットストップ（撃破の手応え）', 'hitstop'),
      choice('画質', 'quality', [['auto', '自動'], ['big', '大画面高精細'], ['quest', 'Quest 高画質'], ['light', '軽量'], ['manual', '手動']]),
      range('描画倍率（手動）', 'renderScale', 0.5, 2, 0.1, (v) => v.toFixed(1) + '×'),
      range('文字の大きさ', 'uiScale', 0.8, 1.6, 0.1, (v) => v.toFixed(1) + '×'),
      toggle('当たり判定を表示', 'hitbox'),
    ];
    if (variant === '2d') items.splice(9, 0, range('走査線（CRT 風）', 'crt', 0, 1, 0.5));
    if (variant === '3d') items.push(
      range('戦域の距離', 'vrDist', 0.6, 1.6, 0.05, (v) => v.toFixed(2)), range('戦域の高さ', 'vrHeight', -0.4, 0.4, 0.05, (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + 'm'),
      range('戦域の傾き', 'vrTilt', -0.4, 0.4, 0.05, (v) => Math.round(v * 57.3) + '°'), range('戦域の大きさ', 'vrScale', 0.6, 1.6, 0.05, (v) => v.toFixed(2) + '×'),
      { kind: 'action', label: '正面に合わせ直す（再センタリング）', act: () => hooks.recenter?.() });
    items.push({ kind: 'action', label: '戻る', act: () => back() });
    return items;
  }
  const menus = {
    title: () => ({ title: null, items: [
      { kind: 'action', label: 'ゲームスタート', act: () => startGame() },
      ...(hooks.titleExtra ? hooks.titleExtra() : []),
      { kind: 'action', label: 'あそびかた', act: () => go('howto') },
      { kind: 'action', label: '設定', act: () => go('settings', 'title') },
      { kind: 'action', label: '記録', act: () => go('records') },
      ...(hooks.otherVariant ? [{ kind: 'action', label: hooks.otherVariant.label, act: hooks.otherVariant.go }] : []),
    ] }),
    pause: () => ({ title: 'ポーズ', items: [
      { kind: 'action', label: '再開', act: () => resume() },
      { kind: 'action', label: '設定', act: () => go('settings', 'pause') },
      ...(hooks.pauseExtra ? hooks.pauseExtra() : []),
      { kind: 'action', label: 'タイトルへ戻る', act: () => toTitle() },
    ] }),
    settings: () => ({ title: '設定', items: settingsItems() }),
    howto: () => ({ title: HOWTO[app.howtoPage].h, items: [
      { kind: 'action', label: app.howtoPage < HOWTO.length - 1 ? '次へ' : 'ゲームスタート', act: () => { if (app.howtoPage < HOWTO.length - 1) { app.howtoPage++; refresh(); } else startGame(); } },
      { kind: 'action', label: '戻る', act: () => { if (app.howtoPage > 0) { app.howtoPage--; refresh(); } else back(); } },
    ] }),
    records: () => ({ title: '記録', items: [{ kind: 'action', label: '戻る', act: () => back() }] }),
    result: () => ({ title: 'リザルト', items: [
      { kind: 'action', label: 'リトライ', act: () => startGame() },
      { kind: 'action', label: 'タイトルへ', act: () => toTitle() },
    ] }),
  };
  let settingsFrom = 'title';
  function go(screen, from) {
    if (screen === 'settings') settingsFrom = from || app.screen;
    if (screen === 'howto' && app.screen !== 'howto') app.howtoPage = 0;
    app.screen = screen; refresh(0);
  }
  function refresh(keepIdx) {
    const m = menus[app.screen] ? menus[app.screen]() : null;
    if (m) m.idx = keepIdx === undefined && app.menu && app.menu.title === m.title ? Math.min(app.menu.idx, m.items.length - 1) : 0;
    app.menu = m; hooks.menuChanged?.(app);
  }
  function back() {
    audio.se('uiBack');
    if (app.screen === 'settings') return go(settingsFrom === 'pause' ? 'pause' : 'title');
    if (app.screen === 'pause') return resume();
    go('title');
  }

  function startGame() {
    audio.unlock();
    const g = createGame({ autofire: settings.autofire, invincible: DEBUG && params.has('inv'), startArea: DEBUG ? (+params.get('area') || 0) : 0 });
    app.game = g; app.result = null; app.mode = modeOf(settings);
    stepper = makeStepper(() => step(g, input.state()));
    input.clear();
    app.screen = 'play'; app.menu = null; hooks.menuChanged?.(app); hooks.gameStarted?.(g);
  }
  function pause(reason) {
    if (app.screen !== 'play') return;
    app.screen = 'pause'; app.pauseReason = reason || 'user'; input.clear(); audio.se('pause');
    setTimeout(() => { if (app.screen === 'pause' || app.screen === 'settings') audio.suspend(); }, 160);
    refresh(0);
  }
  function resume() {
    if (!app.game) return toTitle();
    audio.resume();
    input.clear(); stepper.reset(); hitstop = 0;
    // 再開直後の不意な被弾を防ぐ: 1 秒無敵（点滅）＋敵は 0.5 秒撃たない
    const p = app.game.player; if (p.alive) p.invuln = Math.max(p.invuln, 60); app.game.calm = Math.max(app.game.calm, 30);
    app.screen = 'play'; app.menu = null; hooks.menuChanged?.(app);
  }
  function toTitle() {
    audio.resume(); app.game = null; app.screen = 'title'; refresh(0); audio.playMusic('title');
  }
  function finish() {
    const g = app.game;
    const rank = store.record(app.mode, { score: g.score, area: g.area + 1, loop: g.loop + 1 }, g.flags.tainted || DEBUG);
    app.result = { score: g.score, area: g.area, loop: g.loop, rank, tainted: g.flags.tainted || DEBUG, mode: app.mode, stats: { ...g.stats }, best: store.best(app.mode) };
    app.screen = 'result'; refresh(0);
  }

  // ── メニュー操作 ──
  function menuInput(a) {
    const m = app.menu; if (!m) return;
    const it = m.items[m.idx];
    if (a === 'up') { m.idx = (m.idx + m.items.length - 1) % m.items.length; audio.se('uiMove'); }
    else if (a === 'down') { m.idx = (m.idx + 1) % m.items.length; audio.se('uiMove'); }
    else if (a === 'left' && it.left) { it.left(); audio.se('uiMove'); refresh(); return; }
    else if (a === 'right' && it.right) { it.right(); audio.se('uiMove'); refresh(); return; }
    else if (a === 'ok') { audio.unlock(); if (it.act) { audio.se('uiOk'); it.act(); if (app.screen === 'settings') refresh(); } return; }
    else if (a === 'back' || (a === 'pause' && app.screen === 'pause')) { back(); return; }
    else return;
    hooks.menuChanged?.(app);
  }
  app.select = (i) => { if (!app.menu) return; app.menu.idx = i; menuInput('ok'); };
  app.adjust = (i, dir) => { if (!app.menu) return; app.menu.idx = i; menuInput(dir < 0 ? 'left' : 'right'); };
  app.hover = (i) => { if (app.menu && app.menu.idx !== i) { app.menu.idx = i; hooks.menuChanged?.(app); } };

  // ── 毎フレーム ──
  let overT = 0, hitstop = 0, lastAlpha = 0;
  app.update = (dt) => {
    input.poll();
    const acts = input.take();
    if (app.flash) { app.flash.t += dt * 60; if (app.flash.t > app.flash.ticks) app.flash = null; }
    if (app.screen === 'play') {
      for (const a of acts) {
        if (a === 'pause' || a === 'back') { pause('user'); return 0; }
        if (DEBUG) {
          if (a === 'debugInv') { app.game.flags.invincible = !app.game.flags.invincible; app.game.flags.tainted = true; }
          if (a === 'debugNext') simDebug.nextArea(app.game);
          if (a === 'debugCore') simDebug.skipToCore(app.game);
        }
      }
      const g = app.game;
      // ヒットストップ中は論理を進めない（描画・音・頭の追跡は続く）
      if (hitstop > 0) { hitstop -= dt; routeSound(audio, [], g); return lastAlpha; }
      const alpha = lastAlpha = stepper.advance(dt);
      const evs = g.events.splice(0);
      if (evs.length) {
        routeSound(audio, evs, g);
        for (const e of evs) {
          if (settings.hitstop) {
            if (e.t === 'kill' && e.type === 'core') hitstop = Math.max(hitstop, 0.12);
            else if (e.t === 'kill' && e.big) hitstop = Math.max(hitstop, 0.05);
            else if (e.t === 'die') hitstop = Math.max(hitstop, 0.09);
            else if (e.t === 'twinBreak' || e.t === 'chainBonus' || e.t === 'sigil') hitstop = Math.max(hitstop, 0.06);
          }
          if (e.t === 'areaStart') app.banner(`AREA ${e.area + 1}${g.loop ? '  —  LOOP ' + (g.loop + 1) : ''}`, `${AREAS[e.area].name}　${AREAS[e.area].jp}`, 150);
          if (e.t === 'loop') app.banner(`LOOP ${e.loop + 1}`, '周回達成 — 敵が速くなる', 150);
          if (e.t === 'coreMiss') app.banner('CORE MISSED', '大陸の手前から再接近', 120);
          if (e.t === 'areaClear') app.banner('AREA CLEAR', g.deathsThisArea === 0 ? 'NO MISS BONUS' : '', 150);
        }
        hooks.events?.(evs, g);
      } else routeSound(audio, evs, g);
      if (g.mode === 'over') { overT += dt; if (overT > 3.2) { overT = 0; finish(); } } else overT = 0;
      return alpha;
    }
    for (const a of acts) {
      if (app.screen === 'title' && a === 'pause') continue;
      menuInput(a);
    }
    return 0;
  };
  app.pause = pause; app.resume = resume; app.toTitle = toTitle; app.startGame = startGame; app.refresh = refresh; app.go = go;
  app.settings = settings;
  refresh(0);
  return app;
}
