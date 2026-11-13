// 保存・音・入力の補助テスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSave, writeSave, DEFAULTS, SAVE_VERSION } from '../shared/save.js';
import { SAVE_KEY } from '../shared/config.js';
import { getSongs, SONG_DEFS } from '../shared/audio/songs.js';
import { compileTrack } from '../shared/audio/mml.js';
import { FMSynth, TPQ } from '../shared/audio/synth.js';
import { PATCHES } from '../shared/audio/patches.js';
import { makeSamples } from '../shared/audio/pcm.js';
import { SFX, AUDIO_EVENTS } from '../shared/audio/sfx.js';
import { AUDIO } from '../shared/config.js';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

test('保存: 初回は既定値、書いて読み戻せる', () => {
  const st = mem();
  const a = loadSave(st); assert.equal(a.status, 'ok'); assert.equal(a.data.difficulty, 'hard');
  a.data.hi.hard = 12345; a.data.audio.music = 0.3; a.data.reached.easy = 4;
  assert.equal(writeSave(a.data, st), true);
  const b = loadSave(st); assert.equal(b.data.hi.hard, 12345); assert.equal(b.data.audio.music, 0.3); assert.equal(b.data.reached.easy, 4);
});
test('保存: 壊れたデータ・範囲外・古い版・使えない保存先でも遊べる', () => {
  assert.equal(loadSave(mem({ [SAVE_KEY]: '{oops' })).status, 'corrupt');
  const r = loadSave(mem({ [SAVE_KEY]: JSON.stringify({ v: SAVE_VERSION, audio: { music: 9 }, reached: { hard: 99 }, hi: { hard: -5 } }) }));
  assert.equal(r.data.audio.music, 1); assert.equal(r.data.reached.hard, 5); assert.equal(r.data.hi.hard, 0);
  const old = loadSave(mem({ [SAVE_KEY]: JSON.stringify({ v: 1, audio: { music: 0.2 } }) }));
  assert.equal(old.data.audio.music, 0.2); assert.equal(old.data.audio.ambient, 0.5);
  assert.equal(loadSave(mem({ [SAVE_KEY]: JSON.stringify({ v: 999 }) })).status, 'reset');
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.equal(loadSave(broken).status, 'corrupt'); assert.equal(writeSave(DEFAULTS, broken), false);
});
test('曲: 全小節が 4/4 で、ループする曲は全トラックのループ長がそろう（ずれ・無音の継ぎ目がない）', () => {
  for (const [k, d] of Object.entries(SONG_DEFS)) d.bars.forEach((b, i) => assert.equal(compileTrack(b).endTick, TPQ * 4, `${k} 小節 ${i + 1}`));
  for (const [k, s] of Object.entries(getSongs())) {
    if (SONG_DEFS[k].kind !== 'song') continue;
    const ends = new Set(s.tracks.map((t) => t.endTick)), loops = new Set(s.tracks.map((t) => t.loopTick));
    assert.equal(ends.size, 1, `${k} の長さ`); assert.equal(loops.size, 1, `${k} のループ位置`);
    assert.equal((s.tracks[0].endTick - s.tracks[0].loopTick) % (TPQ * 4), 0, `${k} ループは小節単位`);
  }
});
test('音源: 全曲・全効果音が NaN やクリップなしで鳴り、同時発音数は上限内', () => {
  const sy = new FMSynth(48000); sy.setPatches(PATCHES); sy.setSamples(makeSamples());
  assert.ok(sy.fm.length + sy.psg.length + sy.pcm.length <= AUDIO.maxVoices);
  const L = new Float32Array(48000), R = new Float32Array(48000);
  for (const [id, s] of Object.entries(getSongs())) {
    sy.playSong(s); sy.render(L, R, L.length);
    let pk = 0; for (const x of L) { assert.ok(Number.isFinite(x), id); pk = Math.max(pk, Math.abs(x)); }
    assert.ok(pk > 0.05 && pk < 0.99, `${id} の音量 ${pk}`);
  }
  for (const id of Object.keys(SFX)) { sy.playSong(null); sy.playSfx(SFX[id]); sy.render(L, R, 12000); for (let i = 0; i < 12000; i++) assert.ok(Number.isFinite(L[i]), id); }
});
test('ループの継ぎ目: ループ直前と直後で音が途切れない（無音の区間ができない）', () => {
  const sy = new FMSynth(48000); sy.setPatches(PATCHES); sy.setSamples(makeSamples());
  const s = getSongs().stage1, secs = s.tracks[0].endTick / (s.tempo * TPQ / 60);
  sy.playSong(s);
  const n = Math.floor((secs - 0.25) * 48000), A = new Float32Array(n), B = new Float32Array(n);
  sy.render(A, B, n);
  const W = new Float32Array(48000 / 2), W2 = new Float32Array(48000 / 2); sy.render(W, W2, W.length); // 継ぎ目を挟む 0.5 秒
  let maxGap = 0, run = 0; for (const x of W) { if (Math.abs(x) < 1e-4) run++; else run = 0; maxGap = Math.max(maxGap, run); }
  assert.ok(maxGap < 48000 * 0.05, `無音 ${(maxGap / 48).toFixed(1)}ms`);
});
test('効果音の対応表: 参照する効果音がすべて存在する', () => {
  const ev = { weapon: 'lance', kind: 'orb', weak: true, cause: 'pit', soft: true, deep: true };
  for (const [k, m] of Object.entries(AUDIO_EVENTS)) { const ids = m.by ? ['lance', 'dagger', 'axe', 'torch'].map((w) => m.by({ ...ev, weapon: w })) : m.sfx; for (const id of ids) if (id) assert.ok(SFX[id], `${k} → ${id}`); }
});
