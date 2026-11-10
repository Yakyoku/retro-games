import { GameAudio } from './shared/audio/audio.js';
import { SONG_DEFS, SONG_ORDER } from './shared/audio/songs.js';
import { SFX, SFX_LABEL } from './shared/audio/sfx.js';
import { PATCHES } from './shared/audio/patches.js';

const audio = new GameAudio();
const $ = (id) => document.getElementById(id);
$('start').onclick = async () => { await audio.init(); $('start').remove(); $('mode').textContent = audio.mode === 'worklet' ? '再生方式: AudioWorklet（音声スレッド）' : '再生方式: ScriptProcessor（予備）'; };
let playing = null;
for (const id of SONG_ORDER) {
  const b = document.createElement('button');
  b.innerHTML = `<span>${SONG_DEFS[id].title}</span><small>${id} · ${SONG_DEFS[id].tempo} BPM</small>`;
  b.onclick = () => { playing = id; audio.music(id, { restart: true }); for (const x of $('songs').children) x.classList.toggle('on', x === b); };
  $('songs').appendChild(b);
}
$('stop').onclick = () => { audio.fade(1.5); for (const x of $('songs').children) x.classList.remove('on'); };
for (const id of Object.keys(SFX)) {
  const b = document.createElement('button'); b.innerHTML = `${SFX_LABEL[id] || id}<br><small>${id} · ${SFX[id].ch.toUpperCase()}</small>`; b.onclick = () => audio.sfx(id); $('sfx').appendChild(b);
}
$('vol').oninput = (e) => audio.setVolume({ master: e.target.value / 10 });
for (let k = 0; k < 12; k++) { const d = document.createElement('div'); if (k >= 8) d.className = 'pcm'; d.innerHTML = '<i></i>'; $('meters').appendChild(d); const l = document.createElement('span'); l.textContent = k < 8 ? 'FM' + k : 'PCM' + (k - 8); $('labels').appendChild(l); }
PATCHES.forEach((p, k) => { const o = document.createElement('option'); o.value = k; o.textContent = `${k}: ${p.name}（ALG ${p.alg} / FB ${p.fb}）`; $('patch').appendChild(o); });
const WHITE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
const BLACKS = new Set([1, 3, 6, 8, 10, 13, 15, 18, 20, 22]);
for (let n = 0; n <= 24; n++) {
  const d = document.createElement('div'); if (BLACKS.has(n)) d.className = 'b';
  d.onpointerdown = () => noteOn(n); d.onpointerup = d.onpointerleave = () => noteOff(n); $('kb').appendChild(d);
}
let held = null;
function noteOn(n) { if (!audio.ready) return; held = n; audio.post({ type: 'note', on: true, ch: 6, patch: +$('patch').value, note: 12 * (+$('oct').value + 1) + n }); }
function noteOff(n) { if (held === n) { audio.post({ type: 'note', on: false, ch: 6 }); held = null; } }
const KEYMAP = 'awsedftgyhujk';
addEventListener('keydown', (e) => { if (e.repeat) return; const i = KEYMAP.indexOf(e.key); if (i >= 0) noteOn(i); });
addEventListener('keyup', (e) => { const i = KEYMAP.indexOf(e.key); if (i >= 0) noteOff(i); });
(function loop() { requestAnimationFrame(loop); const m = audio.meter || []; [...$('meters').children].forEach((d, k) => { d.firstChild.style.height = Math.min(100, (m[k] || 0) * 260) + '%'; }); })();
