// サウンドテストページ
import { createAudio, events } from './shared/audio/audio.js';

const audio = createAudio();
const $ = (id) => document.getElementById(id);
const KIND = { music: '曲', jingle: 'ジングル', sfx: '効果音', amb: '環境音' };
const el = (tag, props = {}, html = '') => Object.assign(document.createElement(tag), props, html ? { innerHTML: html } : {});
const tag = (e) => `<span class="tag ${e.origin === 'original' ? 'o' : ''}">${e.origin === 'original' ? '原作にある種類' : '補助音'}</span>`;

function status() { $('status').textContent = `音: ${audio.state} / 方式: ${audio.mode === 'worklet' ? 'AudioWorklet' : audio.mode === 'script' ? 'ScriptProcessor（予備）' : '-'}`; }

$('unlock').onclick = async () => {
  await audio.unlock();
  $('gate').remove();
  status();
};
// どの操作でも unlock（iOS の 'interrupted' から戻すため）
addEventListener('pointerdown', () => { audio.unlock().then(status); }, { capture: true });

// 曲
let current = null;
for (const e of events.filter((x) => x.kind === 'music')) {
  const gated = e.name.startsWith('stage-');
  const b = el('button', {}, `<span><b>${e.name}</b><br><small>${e.ja}</small></span><span class="tag">${gated ? '歩き連動' : '通常再生'}</span>`);
  b.onclick = () => {
    document.querySelectorAll('#tracks button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on'); current = e.name; audio.music.start(e.name);
  };
  $('tracks').append(b);
}
$('musicStop').onclick = () => { audio.music.stop(); current = null; document.querySelectorAll('#tracks button').forEach((x) => x.classList.remove('on')); };

// 歩く/止まる
let latched = false, held = false;
function applyWalk() {
  const on = latched || held;
  audio.music.setWalking(on);
  $('walk').classList.toggle('on', on);
  $('walk').textContent = on ? '歩いている' : '止まっている（押している間 歩く）';
}
const w = $('walk');
w.addEventListener('pointerdown', (ev) => { held = true; w.setPointerCapture(ev.pointerId); applyWalk(); });
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) w.addEventListener(t, () => { held = false; applyWalk(); });
$('walkLatch').onclick = () => { latched = !latched; $('walkLatch').classList.toggle('on', latched); applyWalk(); };
addEventListener('keydown', (ev) => { if (ev.code === 'Space' && !ev.repeat) { ev.preventDefault(); held = true; applyWalk(); } });
addEventListener('keyup', (ev) => { if (ev.code === 'Space') { held = false; applyWalk(); } });
audio.onMessage((m) => {
  if (m.type !== 'pos') return;
  $('pos').style.width = `${(100 * Math.max(0, m.tick)) / m.ticks}%`;
  $('posText').textContent = `位置: ${m.name} ${Math.max(0, m.tick)} / ${m.ticks} ティック（${m.running ? '進行中' : '停止中'}）`;
});

// ジングル
for (const e of events.filter((x) => x.kind === 'jingle')) {
  const b = el('button', {}, `<span><b>${e.name}</b><br><small>${e.ja}</small></span>${tag(e)}`);
  b.onclick = async () => { b.classList.add('on'); await audio.jingle(e.name); b.classList.remove('on'); };
  $('jingles').append(b);
}
// 環境音
for (const kind of ['soil', 'crystal', 'volcano']) {
  const b = el('button', { textContent: { soil: '土', crystal: '水晶', volcano: '火山' }[kind] });
  b.onclick = () => { document.querySelectorAll('#ambs button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); audio.amb.start(kind); };
  $('ambs').append(b);
}
const ambOff = el('button', { textContent: '環境音を止める' });
ambOff.onclick = () => { document.querySelectorAll('#ambs button').forEach((x) => x.classList.remove('on')); audio.amb.stop(); };
$('ambs').append(ambOff);

// 効果音
const opt = (id) => +$(id).value;
for (const id of ['stage', 'pan', 'gain']) $(id).oninput = () => { $(id + 'V').textContent = $(id).value; };
for (const e of events.filter((x) => x.kind === 'sfx')) {
  const b = el('button', { title: e.trigger }, `<b>${e.name}</b><br><small>${e.ja}</small><br>${tag(e)}`);
  b.onclick = () => audio.play(e.name, { stage: opt('stage'), pan: opt('pan'), gain: opt('gain') });
  $('sfx').append(b);
}

// 音量
const names = { master: '全体', bgm: '曲', sfx: '効果音', amb: '環境音' };
for (const [k, v] of Object.entries(audio.volumes)) {
  const l = el('label', {}, `${names[k]}<input type="range" min="0" max="1" step="0.05" value="${v}"><span>${v}</span>`);
  const r = l.querySelector('input');
  r.oninput = () => { l.querySelector('span').textContent = r.value; audio.setVolumes({ [k]: +r.value }); };
  $('vols').append(l);
}
$('mute').onclick = () => { audio.setMuted(!audio.muted); $('mute').classList.toggle('on', audio.muted); };
let paused = false;
$('pause').onclick = async () => { paused = !paused; await (paused ? audio.suspend() : audio.resume()); $('pause').classList.toggle('on', paused); status(); };
$('stopAll').onclick = () => {
  audio.stopAll(); current = null;
  document.querySelectorAll('#tracks .on, #jingles .on, #ambs .on, #walkLatch').forEach((x) => x.classList.remove('on'));
  latched = false; applyWalk();
};
// タブが隠れたら止める
document.addEventListener('visibilitychange', () => { if (document.hidden) audio.suspend(); else if (!paused) audio.resume().then(status); });

// 一覧表
for (const e of events) {
  $('table').append(el('tr', {}, `<td><code>${e.name}</code></td><td>${KIND[e.kind]}</td><td>${e.ja}</td><td>${e.trigger}</td><td>${e.originLabel}${e.basis ? `<br><small>${e.basis}</small>` : ''}</td>`));
}
status();
