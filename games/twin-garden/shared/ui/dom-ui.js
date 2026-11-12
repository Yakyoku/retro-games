// ツイン・ガーデン — HTML のメニュー・HUD・お知らせ（2D 版と、VR 版の通常画面で使う）
// 文字は DOM なので 4K でもにじまない。[漢字|かな] は <ruby> にする。
import { MARK_ORDER, markSVG } from './marks.js';
import { C } from '../core/config.js';
import { STAGES } from '../core/stages.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function ruby(s) {
  let out = '', last = 0;
  const re = /\[([^|\]]+)\|([^\]]+)\]/g;
  let m;
  while ((m = re.exec(s))) { out += esc(s.slice(last, m.index)) + `<ruby>${esc(m[1])}<rt>${esc(m[2])}</rt></ruby>`; last = re.lastIndex; }
  return out + esc(s.slice(last));
}

export class DomUI {
  constructor(root) {
    this.root = root;
    root.insertAdjacentHTML('beforeend', `
      <div id="hud" class="hud" hidden>
        <div class="hud-l"><div class="hud-k">${ruby('[得点|とくてん]')}</div><div class="hud-v" id="h-score">0</div></div>
        <div class="hud-c">
          <div class="hud-stage" id="h-stage"></div>
          <div class="ebar" id="h-ebar"><div class="efill" id="h-efill"></div><div class="emark" style="left:${(100 / 150) * 100}%"></div><span id="h-etext"></span></div>
        </div>
        <div class="hud-r">
          <div class="hud-row"><span class="hud-k">${ruby('[残機|ざんき]')}</span><span id="h-lives"></span></div>
          <div class="hud-row"><span class="hud-k">${ruby('[残|のこ]り')}</span><span id="h-left"></span></div>
          <div class="hud-gems" id="h-gems"></div>
        </div>
      </div>
      <div id="banner" class="banner" hidden></div>
      <div id="menu" class="menu" hidden><div class="panel" role="dialog" aria-modal="true"></div></div>
      <div id="toast" class="toast" hidden></div>`);
    this.$ = (id) => root.querySelector('#' + id);
    this.hudEl = this.$('hud');
    this.menuEl = this.$('menu');
    this.panel = this.menuEl.querySelector('.panel');
    this.bannerEl = this.$('banner');
    this.bannerT = 0;
    this.cache = {};
  }

  // ───────── メニュー ─────────
  showMenu(def, focus, app) {
    this.menuEl.hidden = false;
    this.menuEl.classList.toggle('over-game', !!app.game);
    const items = def.items.map((it, i) => {
      const v = it.value ? `<span class="mv">${ruby(it.value())}</span>` : '';
      const arrows = it.kind === 'slider' || it.kind === 'toggle' ? ' has-adj' : '';
      return `<li class="mi${i === focus ? ' focus' : ''}${arrows}" data-i="${i}" tabindex="-1"><span class="ml">${ruby(it.label)}${it.desc ? `<small>${ruby(it.desc)}</small>` : ''}</span>${v}</li>`;
    }).join('');
    const pad = app.input.padNames();
    this.panel.innerHTML = `
      ${def.id === 'title' ? `<div class="logo"><span class="dot r"></span><span class="dot b"></span></div>` : ''}
      <h1>${ruby(def.title)}</h1>${def.sub ? `<p class="sub">${ruby(def.sub)}</p>` : ''}
      ${def.lines ? `<div class="lines">${def.lines.map((l) => `<p>${ruby(l)}</p>`).join('')}</div>` : ''}
      <ul class="items">${items}</ul>
      ${def.note ? `<p class="note">${ruby(def.note)}</p>` : ''}
      <p class="keys">${ruby(`↑↓：[選|えら]ぶ　←→：[調整|ちょうせい]　Enter / ${pad.ok}：[決定|けってい]　Esc / ${pad.back}：[戻|もど]る`)}</p>
      ${def.id === 'title' ? `<p class="made">MADE WITH CLAUDE ・ リブルラブルの「ラインで囲む」遊びを参考にしたファンメイドの作品です（公式作品ではありません）</p>` : ''}`;
    for (const li of this.panel.querySelectorAll('.mi')) {
      const i = +li.dataset.i;
      li.addEventListener('pointerenter', () => { if (app.focus !== i) { app.focus = i; for (const x of this.panel.querySelectorAll('.mi')) x.classList.toggle('focus', +x.dataset.i === i); } });
      li.addEventListener('click', (e) => {
        const it = def.items[i];
        if (it.adj && it.kind === 'slider') {
          const r = li.getBoundingClientRect();
          it.adj(e.clientX < r.left + r.width / 2 ? -1 : 1); app.audio.unlock(); app.audio.sfx('move'); app.refreshMenu();
        } else app.activate(i);
      });
    }
    const f = this.panel.querySelector('.mi.focus');
    if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
  }
  hideMenu() { this.menuEl.hidden = true; }

  // ───────── HUD ─────────
  hud(g, app) {
    this.hudEl.hidden = !g;
    if (!g) return;
    const set = (id, html) => { if (this.cache[id] !== html) { this.cache[id] = html; this.$(id).innerHTML = html; } };
    set('h-score', String(g.score).padStart(6, '0'));
    const st = g.kind === 'bonus' ? `ボーナス　${ruby('[' + stripR(g.bonus.def.name) + '|' + g.bonus.def.ruby + ']')}　<b>${Math.ceil(g.bonus.t / 60)}</b>${ruby('[秒|びょう]')}` :
      g.def.lesson ? ruby(g.def.name) : `${g.def.number}${ruby('[面|めん]')}／12　${ruby(`[${g.def.name}|${g.def.ruby}]`)}`;
    set('h-stage', st);
    const lives = Number.isFinite(g.lives) ? '<i class="life"></i>'.repeat(Math.max(0, g.lives)) : '∞';
    set('h-lives', lives);
    set('h-left', g.kind === 'bonus' && g.bonus.type !== 'harvest' ? '—' : `<i class="mush"></i>×${g.mush.filter((m) => m.alive).length}`);
    set('h-gems', MARK_ORDER.map((m, i) => `<span class="gem${g.gemsGot & (1 << i) ? ' got' : ''}">${markSVG(m, 20, !!(g.gemsGot & (1 << i)))}</span>`).join(''));
    const e = g.energy, pw = g.powerT > 0;
    const fill = this.$('h-efill');
    const w = `${(e / C.energyMax) * 100}%`;
    if (fill.style.width !== w) fill.style.width = w;
    this.$('h-ebar').classList.toggle('power', pw);
    this.$('h-ebar').classList.toggle('low', !pw && e < 25);
    set('h-etext', pw ? `むてき ${Math.ceil(g.powerT / 60)}` : `${Math.ceil(e)}`);
    this.banner(g, app);
  }

  banner(g) {
    let html = '';
    if (g.phase === 'intro') html = g.def.lesson ? `<h2>${ruby(g.def.name)}</h2>${g.def.steps.map((s) => `<p>${ruby(rubyAuto(s))}</p>`).join('')}` : `<h2>${g.def.number}${ruby('[面|めん]')}　${ruby(`[${g.def.name}|${g.def.ruby}]`)}</h2><p>${ruby(rubyAuto(g.def.tip))}</p>`;
    else if (g.phase === 'bonusIntro') html = `<h2>ボーナス　${ruby(`[${g.bonus.def.name}|${g.bonus.def.ruby}]`)}</h2><p>${ruby(rubyAuto(g.bonus.def.tip))}（20${ruby('[秒|びょう]')}）</p>`;
    else if (g.phase === 'clear') html = `<h2>クリア！</h2>${g.pendingBonus ? `<p>${ruby('[宝|たから]がそろった！　ボーナスへ')}</p>` : ''}`;
    else if (g.phase === 'miss') html = `<h2 class="bad">ミス</h2><p>${Number.isFinite(g.lives) ? (g.lives > 0 ? ruby(`[残機|ざんき] ${g.lives}　[面|めん]の[最初|さいしょ]から`) : '') : ''}</p>`;
    else if (g.phase === 'bonusEnd') html = `<h2>ボーナス ${g.bonus.points}${ruby('[点|てん]')}</h2>`;
    else if (g.phase === 'gameover') html = `<h2 class="bad">ゲームオーバー</h2>`;
    else if (g.phase === 'complete') html = `<h2>${g.mode === 'arcade' ? ruby('[全|ぜん]12[面|めん]クリア！') : 'クリア！'}</h2>`;
    else if (g.kind === 'bonus' && g.bonus.type === 'memory' && g.bonus.showT > 0) html = `<p>${ruby('[光|ひか]った[場所|ばしょ]を[覚|おぼ]えよう')}</p>`;
    if (this.cache.banner !== html) { this.cache.banner = html; this.bannerEl.innerHTML = html; this.bannerEl.hidden = !html; }
  }
}

function stripR(s) { return s; }
// 練習・ヒントの文に出る漢字へ読みがなを付ける（よく出る語だけ）
const AUTO = [['赤', 'あか'], ['青', 'あお'], ['動', 'うご'], ['杭', 'くい'], ['引', 'ひ'], ['掛', 'か'], ['自分', 'じぶん'], ['横切', 'よこぎ'], ['囲', 'かこ'], ['全部', 'ぜんぶ'], ['本番', 'ほんばん'], ['少', 'すこ'], ['減', 'へ'],
  ['植物', 'しょくぶつ'], ['回復', 'かいふく'], ['貯', 'た'], ['秒間', 'びょうかん'], ['芽', 'め'], ['育', 'そだ'], ['宝箱', 'たからばこ'], ['宝', 'たから'], ['隠', 'かく'], ['大', 'おお'], ['教', 'おし'], ['小', 'ちい'], ['盤', 'ばん'], ['以下', 'いか'], ['見', 'み'],
  ['飛', 'と'], ['出', 'だ'], ['集', 'あつ'], ['左右', 'さゆう'], ['同時', 'どうじ'], ['回', 'まわ'], ['列', 'れつ'], ['細長', 'ほそなが'], ['作', 'つく'], ['端', 'はし'], ['一部', 'いちぶ'], ['角', 'かど'], ['追', 'お'], ['込', 'こ'], ['閉', 'と'], ['真', 'ま'], ['中', 'なか'],
  ['分', 'わ'], ['形', 'かたち'], ['口', 'くち'], ['入', 'はい'], ['別々', 'べつべつ'], ['島', 'しま'], ['順番', 'じゅんばん'], ['長', 'なが'], ['輪', 'わ'], ['匂', 'にお'], ['絞', 'しぼ'], ['格子', 'こうし'], ['倍率', 'ばいりつ'], ['上', 'あ'], ['十字', 'じゅうじ'], ['庭', 'にわ'],
  ['攻', 'せ'], ['近', 'ちか'], ['本', 'ほん'], ['組', 'くみ'], ['考', 'かんが'], ['内', 'うち'], ['外', 'そと'], ['二重', 'にじゅう'], ['最後', 'さいご'], ['光', 'ひか'], ['場所', 'ばしょ'], ['覚', 'おぼ'], ['花', 'はな'], ['時間内', 'じかんない'], ['捕', 'つか'], ['周', 'しゅう'],
  ['左', 'ひだり'], ['右', 'みぎ'], ['使', 'つか'], ['秒', 'びょう'], ['無敵', 'むてき'], ['矢印', 'やじるし'], ['練習', 'れんしゅう'], ['4本', '4ほん'], ['内側', 'うちがわ'], ['1周', '1しゅう'], ['8秒間', '8びょうかん']];
AUTO.sort((a, b) => b[0].length - a[0].length);
export function rubyAuto(s) {
  if (/\[/.test(s)) return s;
  let out = '';
  for (let i = 0; i < s.length;) {
    const hit = AUTO.find(([k]) => s.startsWith(k, i));
    if (hit && /[一-鿿]/.test(hit[0])) { out += `[${hit[0]}|${hit[1]}]`; i += hit[0].length; }
    else { out += s[i]; i++; }
  }
  return out;
}
export { STAGES };
