// ツイン・ガーデン — メニューの定義（2D の DOM 表示と VR のパネル表示で同じものを使う）
// 文字の [漢字|かな] は読みがなつき（DOM は <ruby>、VR は上に小さく）。
import { KEY_LABELS, keyName, DEFAULT_KEYS } from './input.js';
import { STAGES, LESSONS } from '../core/stages.js';

export const OTHER_SITE = {
  '2d': { url: 'https://twin-garden-vr.netlify.app/', label: 'VR版（Meta Quest 3）へ' },
  vr: { url: 'https://twin-garden-2d.netlify.app/', label: '2D版（PC・タブレット）へ' },
};

export function stripRuby(s) { return String(s).replace(/\[([^|\]]+)\|[^\]]+\]/g, '$1'); }

const pct = (v) => `${Math.round(v * 100)}%`;

export function buildMenu(app, id) {
  const st = app.store.data, S = st.settings;
  const vr = app.variant === 'vr';
  switch (id) {
    case 'title': return {
      id, title: 'ツイン・ガーデン', sub: 'TWIN GARDEN', back: null,
      note: app.store.notice || (vr ? app.xrNote || '' : ''),
      items: [
        ...(vr && app.xrSupported && !app.inXR ? [{ label: '[VR|ブイアール]で遊ぶ', ruby: true, act: () => app.enterVR() }] : []),
        { label: 'はじめる', act: () => app.openMenu('difficulty') },
        { label: '[練習|れんしゅう]', act: () => app.openMenu('practice') },
        { label: '[設定|せってい]', act: () => app.openMenu('settings') },
        { label: '[記録|きろく]', act: () => app.openMenu('records') },
        { label: '[遊|あそ]び[方|かた]', act: () => app.openMenu('howto') },
        ...(app.inXR ? [] : [{ label: OTHER_SITE[app.variant].label, act: () => { location.href = OTHER_SITE[app.variant].url; } }]),
      ],
    };
    case 'difficulty': return {
      id, title: '[難|むずか]しさを[選|えら]ぶ', back: 'title',
      items: [
        { label: 'やさしい', desc: '[敵|てき]とエネルギー[減少|げんしょう]が0.7[倍|ばい]・[残機|ざんき]5', act: () => app.startGame('easy') },
        { label: '[標準|ひょうじゅん]', desc: '[残機|ざんき]3', act: () => app.startGame('normal') },
        { label: '[難|むずか]しい', desc: '[敵|てき]とエネルギー[減少|げんしょう]が1.25[倍|ばい]・[残機|ざんき]3', act: () => app.startGame('hard') },
        { label: '[戻|もど]る', act: () => app.openMenu('title') },
      ],
      focus: ['easy', 'normal', 'hard'].indexOf(S.lastDifficulty) >= 0 ? ['easy', 'normal', 'hard'].indexOf(S.lastDifficulty) : 1,
    };
    case 'practice': {
      const reached = Math.max(st.reached.easy, st.reached.normal, st.reached.hard);
      return {
        id, title: '[練習|れんしゅう]', sub: '[記録|きろく]は[通常|つうじょう]のハイスコアとは[別|べつ]', back: 'title',
        items: [
          ...LESSONS.map((l, i) => ({ label: l.name, desc: l.steps[0], act: () => app.startGame('practice', 'lesson', i) })),
          ...STAGES.slice(0, reached).map((s) => ({ label: `${s.number}[面|めん] ${s.name}`, desc: `[練習|れんしゅう][最高|さいこう] ${st.practice[s.number] || 0}`, act: () => app.startGame('normal', 'stagePractice', s.index) })),
          { label: '[戻|もど]る', act: () => app.openMenu('title') },
        ],
      };
    }
    case 'settings': return {
      id, title: '[設定|せってい]', back: app.settingsBack || 'title',
      items: [
        { label: 'マスター[音量|おんりょう]', kind: 'slider', value: () => pct(S.master), adj: (d) => app.setVol('master', d) },
        { label: '[音楽|おんがく]', kind: 'slider', value: () => pct(S.bgm), adj: (d) => app.setVol('bgm', d) },
        { label: '[効果音|こうかおん]', kind: 'slider', value: () => pct(S.sfx), adj: (d) => app.setVol('sfx', d) },
        { label: '[消音|しょうおん]', kind: 'toggle', value: () => (S.mute ? 'オン' : 'オフ'), adj: () => app.setSetting('mute', !S.mute), act: () => app.setSetting('mute', !S.mute) },
        ...(vr ? [
          { label: 'VR[操作|そうさ]', kind: 'toggle', value: () => (S.vrControl === 'stick' ? 'スティック' : '[直接|ちょくせつ]（トリガー）'), adj: () => app.setSetting('vrControl', S.vrControl === 'stick' ? 'direct' : 'stick'), act: () => app.setSetting('vrControl', S.vrControl === 'stick' ? 'direct' : 'stick') },
          { label: '[表示|ひょうじ]', kind: 'toggle', value: () => (S.vrScale === 'table' ? '[卓上|たくじょう]' : '[没入|ぼつにゅう]スケール'), adj: () => app.setSetting('vrScale', S.vrScale === 'table' ? 'immersive' : 'table'), act: () => app.setSetting('vrScale', S.vrScale === 'table' ? 'immersive' : 'table') },
          { label: '[姿勢|しせい]', kind: 'toggle', value: () => (S.vrPosture === 'seated' ? '[座|すわ]って' : '[立|た]って'), adj: () => app.setSetting('vrPosture', S.vrPosture === 'seated' ? 'standing' : 'seated'), act: () => app.setSetting('vrPosture', S.vrPosture === 'seated' ? 'standing' : 'seated') },
          { label: '[庭|にわ]の[高|たか]さ', kind: 'slider', value: () => `${S.tableHeight >= 0 ? '+' : ''}${Math.round(S.tableHeight * 100)}cm`, adj: (d) => app.setSetting('tableHeight', round2(clamp(S.tableHeight + d * 0.05, -0.4, 0.4))) },
          { label: '[庭|にわ]までの[距離|きょり]', kind: 'slider', value: () => `${S.tableDist >= 0 ? '+' : ''}${Math.round(S.tableDist * 100)}cm`, adj: (d) => app.setSetting('tableDist', round2(clamp(S.tableDist + d * 0.05, -0.4, 0.6))) },
          { label: '[庭|にわ]の[大|おお]きさ', kind: 'slider', value: () => `${Math.round(S.tableSize * 100)}%`, adj: (d) => app.setSetting('tableSize', round2(clamp(S.tableSize + d * 0.1, 0.6, 1.6))) },
          { label: 'VR[画質|がしつ]', kind: 'toggle', value: () => (S.vrQuality === 'high' ? 'Quest 3・[高画質|こうがしつ]' : 'Quest 3・[最高画質|さいこうがしつ]'), adj: () => app.setSetting('vrQuality', S.vrQuality === 'high' ? 'ultra' : 'high'), act: () => app.setSetting('vrQuality', S.vrQuality === 'high' ? 'ultra' : 'high') },
        ] : []),
        ...(!app.inXR ? [
          { label: '[画質|がしつ]', kind: 'toggle', value: () => (S.quality === 'max' ? '[大画面|だいがめん]・[最高画質|さいこうがしつ]' : '[自動|じどう]'), adj: () => app.setSetting('quality', S.quality === 'max' ? 'auto' : 'max'), act: () => app.setSetting('quality', S.quality === 'max' ? 'auto' : 'max') },
          { label: 'キー[設定|せってい]', act: () => app.openMenu('keys') },
        ] : []),
        ...(!vr ? [{ label: 'タッチ[操作|そうさ]', kind: 'toggle', value: () => ({ auto: '[自動|じどう]', on: '[常|つね]に[表示|ひょうじ]', off: '[表示|ひょうじ]しない' })[S.showTouch], adj: () => app.setSetting('showTouch', { auto: 'on', on: 'off', off: 'auto' }[S.showTouch]), act: () => app.setSetting('showTouch', { auto: 'on', on: 'off', off: 'auto' }[S.showTouch]) }] : []),
        { label: '[戻|もど]る', act: () => app.openMenu(app.settingsBack || 'title') },
      ],
    };
    case 'keys': {
      const keys = app.input.keys;
      return {
        id, title: 'キー[設定|せってい]', sub: '[項目|こうもく]を[選|えら]んで、[新|あたら]しいキーを[押|お]す（Escで[取消|とりけし]）', back: 'settings',
        items: [
          ...Object.keys(KEY_LABELS).map((k) => ({ label: KEY_LABELS[k], kind: 'toggle', value: () => (app.capturing === k ? '…[押|お]してください' : keyName(keys[k])), act: () => app.captureKey(k) })),
          { label: '[初期設定|しょきせってい]に[戻|もど]す', act: () => { app.input.keys = { ...DEFAULT_KEYS }; app.store.data.settings.keys = null; app.store.save(); app.refreshMenu(); } },
          { label: '[戻|もど]る', act: () => app.openMenu('settings') },
        ],
      };
    }
    case 'records': return {
      id, title: '[記録|きろく]', back: 'title',
      lines: [
        `やさしい　ハイスコア ${st.high.easy}　[到達|とうたつ] ${st.reached.easy}[面|めん]`,
        `[標準|ひょうじゅん]　　ハイスコア ${st.high.normal}　[到達|とうたつ] ${st.reached.normal}[面|めん]`,
        `[難|むずか]しい　ハイスコア ${st.high.hard}　[到達|とうたつ] ${st.reached.hard}[面|めん]`,
        `[練習|れんしゅう]（[別記録|べつきろく]）　${Object.keys(st.practice).length ? Object.entries(st.practice).map(([k, v]) => `${k}[面|めん] ${v}`).join('・') : 'まだありません'}`,
      ],
      items: [{ label: '[戻|もど]る', act: () => app.openMenu('title') }],
    };
    case 'howto': return {
      id, title: '[遊|あそ]び[方|かた]', back: 'title',
      lines: vr ? [
        '[左|ひだり]スティックで[赤|あか]、[右|みぎ]スティックで[青|あお]を[動|うご]かす（[頭|あたま]の[向|む]きは[関係|かんけい]なし。[奥|おく]へ[倒|たお]すと[庭|にわ]の[奥|おく]へ）',
        '[直接操作|ちょくせつそうさ]にすると、トリガーを[握|にぎ]っている[間|あいだ]だけ、レーザーの[先|さき]へ[向|む]かう',
        'B / Y で[一時停止|いちじていし]。メニューはどちらの[手|て]のレーザーでも[選|えら]べる',
        '[赤|あか]と[青|あお]をつなぐラインを[杭|くい]に[掛|か]けて、[自分|じぶん]のラインを[横切|よこぎ]ると[囲|かこ]める',
        '[盤|ばん]の[同|おな]じ[辺|へん]に[両方|りょうほう]が[着|つ]いても、[辺|へん]とラインで[囲|かこ]める',
        '[植物|しょくぶつ]を[囲|かこ]むと[回復|かいふく]。150で8[秒|びょう][無敵|むてき]。[宝|たから]は[小|ちい]さく[囲|かこ]んで[探|さが]す',
      ] : [
        '[赤|あか]：WASD・[左|ひだり]スティック・[画面|がめん]の[左半分|ひだりはんぶん]　[青|あお]：[矢印|やじるし]キー・[右|みぎ]スティック・[画面|がめん]の[右半分|みぎはんぶん]',
        '[赤|あか]と[青|あお]をつなぐラインを[杭|くい]に[掛|か]けて、[自分|じぶん]のラインを[横切|よこぎ]ると[囲|かこ]める（バシッ！）',
        '[盤|ばん]の[同|おな]じ[辺|へん]に[両方|りょうほう]が[着|つ]いても、[辺|へん]とラインで[囲|かこ]める',
        'キノコの[子|こ]をまとめて[囲|かこ]むと[倍率|ばいりつ]アップ。[敵|てき]も[囲|かこ]めば[捕|つか]まえられる（さわるとミス）',
        '[植物|しょくぶつ]を[囲|かこ]むとエネルギー[回復|かいふく]。150まで[貯|た]めると8[秒|びょう][無敵|むてき]',
        '[大|おお]きく[囲|かこ]むと「？」で[宝|たから]のありかを[教|おし]えてくれる。[小|ちい]さく[囲|かこ]むと[宝箱|たからばこ]、[出|で]てきた6つを[集|あつ]めるとボーナス',
        'Enter：[決定|けってい]　Esc：[一時停止|いちじていし]・[戻|もど]る　ゲームパッドだけでも[全部|ぜんぶ][操作|そうさ]できます',
      ],
      items: [{ label: '[戻|もど]る', act: () => app.openMenu('title') }],
    };
    case 'pause': return {
      id, title: '[一時停止|いちじていし]', back: 'resume',
      items: [
        { label: '[再開|さいかい]', act: () => app.resume() },
        { label: '[設定|せってい]', act: () => { app.settingsBack = 'pause'; app.openMenu('settings'); } },
        ...(app.variant === 'vr' && app.inXR ? [{ label: '[表示|ひょうじ]の[切|き]り[替|か]え（[卓上|たくじょう]⇔[没入|ぼつにゅう]）', act: () => app.setSetting('vrScale', S.vrScale === 'table' ? 'immersive' : 'table') }] : []),
        { label: 'タイトルへ', act: () => app.toTitle() },
        ...(app.inXR ? [{ label: 'VRを[終|お]わる', act: () => app.exitVR() }] : []),
      ],
    };
    case 'gameover': return {
      id, title: 'ゲームオーバー', back: 'title',
      lines: app.resultLines(),
      items: [
        { label: '[再挑戦|さいちょうせん]', act: () => app.startGame(app.lastStart.difficulty, app.lastStart.mode, app.lastStart.stage) },
        { label: 'タイトルへ', act: () => app.toTitle() },
        ...(app.inXR ? [{ label: 'VRを[終|お]わる', act: () => app.exitVR() }] : []),
      ],
    };
    case 'result': return {
      id, title: app.lastResultTitle || '[結果|けっか]', back: 'title',
      lines: app.resultLines(),
      items: [
        ...(app.nextLesson != null ? [{ label: '[次|つぎ]の[練習|れんしゅう]へ', act: () => app.startGame('practice', 'lesson', app.nextLesson) }] : []),
        { label: 'もう[一度|いちど]', act: () => app.startGame(app.lastStart.difficulty, app.lastStart.mode, app.lastStart.stage) },
        { label: 'タイトルへ', act: () => app.toTitle() },
        ...(app.inXR ? [{ label: 'VRを[終|お]わる', act: () => app.exitVR() }] : []),
      ],
    };
    default: return null;
  }
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function round2(v) { return Math.round(v * 100) / 100; }
