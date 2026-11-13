// Sky Climber VR — サウンドテスト（試聴・波形・ループの継ぎ目・参照音との A/B・WAV 書き出し）
import { AudioEngine } from './audio/audio.js';
import { SONGS } from './audio/music.js';
import { SFX, renderSfx } from './audio/sfx.js';
import { VOICES, synthVoice } from './audio/voice.js';
import { renderSong } from './audio/psg.js';
import { MODERN_SONGS, STEMS, MODERN_SFX_NAMES } from './audio/modern-songs.js';
const A = new AudioEngine(); window.__snd = A;
const $ = (s) => document.querySelector(s);
let last = null, refBuf = null, abTimer = null;
const DESC = {
  title: 'タイトル', start: 'ゲーム開始', climb1: '昼の市街地（ループ）', climb2: '夕方の商業地区（ループ）', climb3: 'ネオンの夜景（ループ）', climb4: '超高層ビル（ループ）', practice: '練習壁（ループ）',
  clear1: '1 棟目クリア', clear2: '2 棟目クリア', clear3: '3 棟目クリア', clear4: '4 棟目クリア', allclear: '4 棟達成', gameover: 'ゲームオーバー', bird: '鳥の登場', crane: '鉄骨の予告',
  reach: '手を伸ばす', grab: 'つかむ', windowWarn: '窓が閉まりだす', windowClose: '窓が閉まる', windowOpen: '窓が開く', dropFall: '落下物', dropBreak: '割れる', birdCall: '鳥の声', flap: '羽ばたき',
  buzz: 'ネオンの予告', zap: '放電', creak: 'きしみ', motor: 'ゴンドラ', hit: '命中', fall: '落下', grace: '両手が離れた', combo1: 'コンボ 1', combo2: 'コンボ 2', combo3: 'コンボ 3', respawn: '復帰', uiMove: 'カーソル', uiOk: '決定', uiBack: '戻る', floor: '10m ごと',
  yoisho: '「よいしょ」', itte: '「いてっ」', are: '「あれ〜」', ganbare: '「がんばれ」', yatta: '「やったー」', wa: '「わっ」', kora: '住人「こらー」', hoi: '住人「ほいっ」', okaeri: 'パイロット',
};
async function unlock() { await A.unlock(); $('#mode').textContent = `現在: ${A.mode === 'vr' ? 'モダン音源（空間）' : A.mode === 'retrovr' ? 'レトロ音源（空間）' : 'クラシック音響'}・${A.ctx.sampleRate}Hz${A.mode === 'vr' && !A.modernReady ? '・モダン音源を準備中…' : ''}`; }
function draw(canvas, buf) {
  const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height, d = buf.getChannelData(0);
  c.fillStyle = '#050b18'; c.fillRect(0, 0, W, H); c.strokeStyle = '#ffd34a'; c.beginPath();
  for (let x = 0; x < W; x++) { const i0 = Math.floor(x / W * d.length), i1 = Math.floor((x + 1) / W * d.length); let mn = 1, mx = -1; for (let i = i0; i < i1; i++) { if (d[i] < mn) mn = d[i]; if (d[i] > mx) mx = d[i]; } c.moveTo(x, H / 2 - mx * H / 2); c.lineTo(x, H / 2 - mn * H / 2); }
  c.stroke();
}
function stats(buf, name) {
  const d = buf.getChannelData(0); let pk = 0, rms = 0; for (const v of d) { pk = Math.max(pk, Math.abs(v)); rms += v * v; } rms = Math.sqrt(rms / d.length);
  $('#info').textContent = `${name}: ${buf.duration.toFixed(3)} 秒・最大 ${(20 * Math.log10(pk || 1e-9)).toFixed(1)} dBFS・RMS ${(20 * Math.log10(rms || 1e-9)).toFixed(1)} dBFS${pk >= 0.999 ? '（音割れの恐れ）' : ''}`;
}
function wav(buf) {
  const d = buf.getChannelData(0), sr = buf.sampleRate, b = new DataView(new ArrayBuffer(44 + d.length * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); b.setUint32(4, 36 + d.length * 2, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true); b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, d.length * 2, true);
  for (let i = 0; i < d.length; i++) b.setInt16(44 + i * 2, Math.max(-32767, Math.min(32767, Math.round(d[i] * 32767))), true);
  return new Blob([b], { type: 'audio/wav' });
}
function addBtn(root, name, onPlay, getBuf, getModern) {
  const el = document.createElement('div');
  el.innerHTML = `<button>${name}<small>${DESC[name] || ''}</small></button>`;
  const dl = document.createElement('a'); dl.textContent = 'WAV'; dl.href = '#'; dl.style.fontSize = '12px'; dl.style.marginLeft = '6px';
  dl.onclick = async (e) => { e.preventDefault(); await unlock(); let b = getBuf(); if (getModern) { const m = await getModern(); if (m) b = m; } dl.href = URL.createObjectURL(wav(b)); dl.download = `skyclimber-${name}.wav`; dl.onclick = null; dl.click(); };
  el.firstChild.onclick = async () => { await unlock(); let b = getBuf(); onPlay(); if (getModern) { const m = await getModern(); if (m) b = m; } last = b; draw($('#wave'), b); stats(b, name); };
  el.appendChild(dl); root.appendChild(el);
}
// モダン音源の曲は全ステムを重ねた波形を表示する（鳴らすのはエンジンのステム再生）
async function modernMix(k) { if (MODERN_SONGS[k]) { const s = await A.modernSong(k); const n = s.stems.drums.length, out = A.ctx.createBuffer(2, n, A.ctx.sampleRate); for (const st of STEMS) { if (st === 'tension') continue; for (let c = 0; c < 2; c++) { const d = s.stems[st].getChannelData(c), o = out.getChannelData(c); for (let i = 0; i < n; i++) o[i] += d[i]; } } return out; } return A.modernJingle(k); }
for (const k of Object.keys(SONGS)) addBtn($('#songs'), k, () => { A.stopMusic(0.02); A.music(k, { loop: SONGS[k].loop }); }, () => A.songBuffer(k), () => (A.modern ? modernMix(k) : null));
for (const k of Object.keys(SFX)) addBtn($('#sfx'), k, () => A.play(k, { pos: { x: Math.random() * 4 - 2, y: 1.6, z: -1 } }), () => A.buf['sfx:' + k], () => (A.modern && A.mbuf[k] ? A.mbuf[k][0] : null));
// モダン音源だけにある音（素材別のつかむ音・割れる音・心拍・街の音・ループ素材）
for (const k of MODERN_SFX_NAMES.filter((n) => !SFX[n])) addBtn($('#sfx'), k, () => { const b = A.mbuf[k] && A.mbuf[k][(A.rr[k] = ((A.rr[k] ?? -1) + 1) % A.mbuf[k].length)]; if (!b) return; const s = A.ctx.createBufferSource(); s.buffer = b; s.connect(A.bus.sfx); s.start(); }, () => (A.mbuf[k] && A.mbuf[k][0]) || A.buf['sfx:grab']);
for (const k of Object.keys(VOICES)) addBtn($('#voices'), k, () => A.play(k), () => A.buf['voice:' + k], () => (A.modern ? A.mvoice[k] : null));
for (const k of Object.keys(SONGS).filter((k) => SONGS[k].loop)) {
  const b = document.createElement('button'); b.innerHTML = `${k}<small>終わり 2 秒 → 先頭 2 秒</small>`;
  b.onclick = async () => { await unlock(); const buf = A.songBuffer(k), sr = buf.sampleRate, d = buf.getChannelData(0), n = sr * 2; const out = A.ctx.createBuffer(1, n * 2, sr), o = out.getChannelData(0);
    o.set(d.subarray(d.length - n), 0); o.set(d.subarray(0, n), n); const s = A.ctx.createBufferSource(); s.buffer = out; s.connect(A.bus.bgm); s.start(); draw($('#wave'), out);
    $('#info').textContent = `${k}: 継ぎ目の段差 ${(Math.abs(d[d.length - 1] - d[0])).toFixed(4)}（0 に近いほど良い）`; };
  $('#seams').appendChild(b);
}
$('#m-vr').onclick = async () => { await unlock(); A.setMode('vr'); unlock(); };
$('#m-retro').onclick = async () => { await unlock(); A.setMode('retrovr'); unlock(); };
// 適応型音楽の確認: 高度・片手・危険・残機をスライダーとボタンで変えて、層の出入りを聴く
const I = { height01: 1, oneHand: false, danger: false, lives: 3 };
$('#i-h').oninput = (e) => { I.height01 = +e.target.value; A.setIntensity(I); };
for (const [id, k] of [['i-one', 'oneHand'], ['i-danger', 'danger']]) $('#' + id).onclick = (e) => { I[k] = !I[k]; e.target.style.borderColor = I[k] ? '#ffd34a' : ''; A.setIntensity(I); };
$('#i-lives').onclick = (e) => { I.lives = I.lives === 1 ? 3 : 1; e.target.style.borderColor = I.lives === 1 ? '#ffd34a' : ''; A.setIntensity(I); };
$('#i-tape').onclick = () => { A.tape ? A.tapeStart() : A.tapeStop(); };
$('#i-pause').onclick = () => A.setPaused(!A.paused);
$('#m-classic').onclick = async () => { await unlock(); A.setMode('classic'); unlock(); };
$('#stop').onclick = () => { A.stopMusic(0.02); clearInterval(abTimer); };
$('#ref').onchange = async (e) => { await unlock(); const f = e.target.files[0]; if (!f) return; refBuf = await A.ctx.decodeAudioData(await f.arrayBuffer()); draw($('#wave-ref'), refBuf); };
const playBuf = (b, g = 1) => { if (!b) return; const s = A.ctx.createBufferSource(); s.buffer = b; const gn = A.ctx.createGain(); gn.gain.value = g; s.connect(gn); gn.connect(A.bus.sfx); s.start(); return s; };
const rms = (b) => { const d = b.getChannelData(0); let r = 0; for (const v of d) r += v * v; return Math.sqrt(r / d.length) || 1e-6; };
$('#ab-a').onclick = async () => { await unlock(); if (!refBuf) return alert('参照音のファイルを選んでください'); playBuf(refBuf, last ? rms(last) / rms(refBuf) : 1); };
$('#ab-b').onclick = async () => { await unlock(); playBuf(last); };
$('#ab-loop').onclick = async () => { await unlock(); if (!refBuf || !last) return alert('参照音と制作音（どれか 1 つ鳴らす）を用意してください'); let a = true; clearInterval(abTimer); abTimer = setInterval(() => { playBuf(a ? refBuf : last, a ? rms(last) / rms(refBuf) : 1); a = !a; }, 2000); };
const EV = [['ゲーム開始', 'start', '短いファンファーレ 1.6 秒 → 面の曲（ループ）'], ['手を伸ばす', 'reach', '4 フレーム（67ms）の上昇音'], ['つかむ', 'grab', 'ノイズの破裂＋低音 6 フレーム。VR は手の位置に置く・振動 30ms'],
  ['窓が閉まりだす', 'windowWarn', '2 音の往復 24 フレーム（予告時間のあいだ）。予告音は距離で消えない'], ['窓が閉まる', 'windowClose', 'ノイズの「バタン」14 フレーム'], ['落下物の予告', 'kora', '住人の声「こらー」→ 落とす瞬間「ほいっ」'],
  ['落下', 'dropFall', '0.9 秒の下降音'], ['鳥', 'birdCall', '鳴き声＋登場の短い旋律'], ['命中', 'hit', '速い下降＋「いてっ」'], ['落ちる', 'fall', '長い下降＋「あれ〜」・短い暗転'], ['屋上到達', 'clearN', '面ごとに違うジングル＋「やったー」'], ['止まっている', 'ganbare', '6 秒動かないと「がんばれ」1 回']];
$('#events').innerHTML = '<tr><th>出来事</th><th>音</th><th>発音の条件・長さ</th></tr>' + EV.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
