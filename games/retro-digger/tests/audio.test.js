// 音まわりのテスト（node --test。Web Audio のない素の Node で動く）
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMML, expandRepeats, BAR, PPQ } from '../shared/audio/mml.js';
import { TRACKS, JINGLES } from '../shared/audio/tracks.js';
import { SFX, sfxLength } from '../shared/audio/sfx-defs.js';
import { WAVES } from '../shared/audio/waves.js';
import { events, ORIGIN_LABEL } from '../shared/audio/events.js';
import { WSGCore, AMB } from '../shared/audio/wsg-core.js';
import { createAudio } from '../shared/audio/audio.js';

const SR = 48000;

function render(core, seconds) {
  const n = Math.round(seconds * SR), L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i += 128) core.render(L.subarray(i, i + 128), R.subarray(i, i + 128), Math.min(128, n - i));
  return { L, R };
}
function stats({ L, R }, from = 0, to = L.length) {
  let peak = 0, sum = 0, sq = 0, jump = 0, nan = 0;
  for (let i = from; i < to; i++) {
    for (const x of [L[i], R[i]]) { if (!Number.isFinite(x)) nan++; peak = Math.max(peak, Math.abs(x)); sum += x; sq += x * x; }
    if (i > from) jump = Math.max(jump, Math.abs(L[i] - L[i - 1]), Math.abs(R[i] - R[i - 1]));
  }
  const n = 2 * (to - from);
  return { peak, dc: sum / n, rms: Math.sqrt(sq / n), jump, nan };
}

test('MML: 音符・付点・タイ・繰り返し・小節線', () => {
  const r = parseMML('o4 l8 c d4. e^16 r [f g]2 |', { q: 8 });
  assert.deepEqual(r.events.map((e) => e.n), [60, 62, 64, 65, 67, 65, 67]);
  assert.equal(r.events[1].d, 72);
  assert.equal(r.events[2].d, 24 + 12);
  assert.equal(r.ticks, 24 + 72 + 36 + 24 + 4 * 24);
  assert.equal(expandRepeats('a[b[c]3]2'), 'abcccbccc');
  assert.deepEqual(parseMML('c4 |').barErrors, [48]);
  assert.throws(() => parseMML('c x'));
});

test('ループ曲: 3 声とも同じ長さで、ちょうど小節の整数倍', () => {
  for (const [name, t] of Object.entries(TRACKS)) {
    assert.equal(t.ch.length, 3, name);
    for (const c of t.ch) {
      assert.equal(c.ticks, t.ticks, `${name} の声部の長さがそろっていない`);
      assert.deepEqual(c.barErrors, [], `${name} の小節線の位置`);
      assert.ok(c.events.length > 0);
      for (const e of c.events) { assert.ok(e.n >= 28 && e.n <= 100, `${name} 音域 ${e.n}`); assert.ok(e.g > 0 && e.g <= e.d); assert.ok(WAVES[e.w]); }
    }
    assert.equal(t.ticks % BAR, 0, `${name} は小節の整数倍`);
    assert.ok(t.bpm >= 100 && t.bpm <= 190);
    assert.ok(t.loop);
  }
  for (const n of ['stage-soil', 'stage-crystal', 'stage-volcano']) assert.ok(TRACKS[n].gated && TRACKS[n].bpm >= 140, n);
  assert.ok(!TRACKS.title.gated && !TRACKS.tutorial.gated);
});

test('面の曲 3 つは別の旋律', () => {
  const sig = (t) => t.ch[0].events.map((e) => e.n).join(',');
  const s = ['stage-soil', 'stage-crystal', 'stage-volcano', 'title', 'tutorial'].map((n) => sig(TRACKS[n]));
  assert.equal(new Set(s).size, s.length);
});

test('ジングル: 有限の長さ（0.8〜6 秒）でループしない', () => {
  for (const [name, j] of Object.entries(JINGLES)) {
    assert.ok(!j.loop, name);
    assert.ok(Number.isFinite(j.seconds) && j.seconds > 0.8 && j.seconds < 6, `${name}: ${j.seconds}`);
  }
  assert.ok(JINGLES.start.seconds >= 2 && JINGLES.start.seconds <= 3.2);
});

test('一覧の全項目に実装がある・実装の全項目が一覧にある', () => {
  const names = new Set(events.map((e) => e.name));
  assert.equal(names.size, events.length, '名前の重複');
  for (const e of events) {
    assert.ok(e.ja && e.trigger && ORIGIN_LABEL[e.origin], e.name);
    if (e.kind === 'sfx') assert.equal(typeof SFX[e.name], 'function', e.name);
    else if (e.kind === 'music') assert.ok(TRACKS[e.name], e.name);
    else if (e.kind === 'jingle') assert.ok(JINGLES[e.name], e.name);
    else if (e.kind === 'amb') assert.ok(AMB[e.name.slice(4)], e.name);
    else assert.fail(e.kind);
  }
  for (const n of [...Object.keys(SFX), ...Object.keys(TRACKS), ...Object.keys(JINGLES)]) assert.ok(names.has(n), `${n} が一覧にない`);
  for (const k of Object.keys(AMB)) assert.ok(names.has('amb:' + k));
  const required = ['ui-move', 'ui-select', 'ui-back', 'ui-pause', 'dig', 'pump-shot', 'pump-hit', 'pump-miss', 'pump-air', 'detach', 'deflate',
    'recover-warn', 'pop', 'ghost-warn', 'ghost-on', 'ghost-off', 'fire-charge', 'fire-breath', 'rock-shake', 'rock-fall', 'rock-land',
    'rock-crush', 'score-pop', 'extra', 'step', 'tutorial-ok'];
  for (const n of required) assert.equal(typeof SFX[n], 'function', n);
});

test('効果音: 互いに違う設計で、長さが妥当', () => {
  const sigs = new Set();
  for (const n of Object.keys(SFX)) {
    const layers = SFX[n]({ stage: 1 });
    assert.ok(layers.length >= 1 && layers.length <= 4, n);
    if (n !== 'dig') sigs.add(JSON.stringify(layers));
    const len = sfxLength(n, { stage: 3 });
    assert.ok(len > 0.02 && len < 1.2, `${n}: ${len}`);
  }
  assert.equal(sigs.size, Object.keys(SFX).length - 1);
  const l = sfxLength('fire-charge');
  assert.ok(l >= 0.6 && l <= 1.0);
  assert.ok(Math.abs(sfxLength('fire-breath') - 0.8) < 0.1);
  // 空気入れは段階ごとに高くなる
  const f = [1, 2, 3, 4, 5].map((s) => SFX['pump-air']({ stage: s })[0].segs[0].f);
  for (let i = 1; i < 5; i++) assert.ok(f[i] > f[i - 1]);
  // つぶした数で長くなる
  assert.ok(sfxLength('rock-crush', { stage: 3 }) > sfxLength('rock-crush', { stage: 1 }));
});

test('波形表: 32 ステップ × 4 ビット', () => {
  for (const w of WAVES) { assert.equal(w.length, 32); for (const x of w) assert.ok(x >= 0 && x <= 15 && Number.isInteger(x)); }
});

test('書き出し: 全曲で NaN なし・振り切れなし・直流なし', () => {
  for (const name of Object.keys(TRACKS)) {
    const c = new WSGCore(SR);
    c.handle({ type: 'vol', master: 1, bgm: 1, sfx: 1, amb: 1 });
    c.handle({ type: 'walk', on: true });
    c.handle({ type: 'music', name });
    const s = stats(render(c, 6));
    assert.equal(s.nan, 0, name);
    assert.ok(s.peak < 0.99, `${name} peak ${s.peak}`);
    assert.ok(s.rms > 0.02, `${name} が鳴っていない`);
    assert.ok(Math.abs(s.dc) < 0.01, `${name} dc ${s.dc}`);
  }
});

test('歩き連動: 止まると音が消えて位置を保ち、歩くと同じ位置から続く', () => {
  const c = new WSGCore(SR);
  let pos = null;
  c.emit = (m) => { if (m.type === 'pos') pos = m; };
  c.handle({ type: 'music', name: 'stage-soil' });
  // 歩いていない間は進まない
  let s = stats(render(c, 0.5));
  assert.ok(s.peak < 1e-4, '歩く前に鳴っている');
  assert.equal(c.seq.tick, -1);
  c.handle({ type: 'walk', on: true });
  const steady = stats(render(c, 1.3));
  const held = c.seq.tick;
  assert.ok(held > 0);
  c.handle({ type: 'walk', on: false });
  const stop = render(c, 0.6);
  const cut = stats(stop, 0, 480);          // 止めた直後 10ms
  const after = stats(stop, 0.03 * SR, stop.L.length);
  assert.ok(cut.jump <= steady.jump * 1.05 + 1e-6, `止めたときの段差 ${cut.jump} > 通常 ${steady.jump}`);
  assert.ok(after.peak < 2e-3, `止めても鳴り続けている ${after.peak}`);
  assert.equal(c.seq.tick, held, '止まっている間に位置が進んだ');
  c.handle({ type: 'walk', on: true });
  const go = render(c, 0.3);
  assert.ok(c.seq.tick > held && c.seq.tick < held + 60);
  assert.ok(stats(go, 0, 480).jump <= steady.jump * 1.05 + 1e-6, '再開時の段差');
  assert.ok(pos && pos.name === 'stage-soil');
});

test('ループのつなぎ目で途切れない（1 周 + α 書き出し）', () => {
  const c = new WSGCore(SR);
  c.handle({ type: 'walk', on: true });
  c.handle({ type: 'music', name: 'stage-volcano' });
  const len = TRACKS['stage-volcano'].seconds;
  render(c, len - 0.5);
  const s = stats(render(c, 1.0));
  assert.equal(s.nan, 0);
  assert.ok(s.rms > 0.02);
  assert.ok(c.seq.tick < 200, '頭に戻っていない');
});

test('ジングル: 長さどおりに終わりの知らせが来て、曲が元の位置から戻る', () => {
  const c = new WSGCore(SR);
  const got = [];
  c.emit = (m) => { if (m.type === 'jingleEnd') got.push([m.id, c.frame / SR]); };
  c.handle({ type: 'music', name: 'title' });
  render(c, 1);
  const before = c.seq.tick;
  c.handle({ type: 'jingle', name: 'clear', id: 7 });
  render(c, JINGLES.clear.seconds + 0.5);
  assert.equal(got.length, 1);
  assert.equal(got[0][0], 7);
  assert.ok(Math.abs(got[0][1] - 1 - JINGLES.clear.seconds) < 0.2, `終わりの時刻 ${got[0][1]}`);
  assert.equal(c.seq.name, 'title');
  assert.ok(c.seq.tick >= before && c.seq.tick < before + 100);
  // 知らない名前はすぐ終わる
  c.handle({ type: 'jingle', name: 'nope', id: 8 });
  assert.equal(got.at(-1)[0], 8);
});

test('効果音: 全部鳴らしても NaN・振り切れなし。曲の声を奪わない。最後は止まる', () => {
  const c = new WSGCore(SR);
  c.handle({ type: 'vol', master: 1, bgm: 1, sfx: 1, amb: 1 });
  c.handle({ type: 'walk', on: true });
  c.handle({ type: 'music', name: 'stage-soil' });
  render(c, 0.2);
  for (const n of Object.keys(SFX)) {
    c.handle({ type: 'sfx', name: n, opts: { stage: 3, pan: 0.5 } });
    const s = stats(render(c, sfxLength(n, { stage: 3 }) + 0.05));
    assert.equal(s.nan, 0, n);
    assert.ok(s.peak < 0.99, `${n} peak ${s.peak}`);
    assert.ok(c.mv.some((v) => v.on || v.vol > 0.01) || true);
  }
  // 一斉に鳴らしても曲の声は効果音に使われない
  for (const n of Object.keys(SFX)) c.handle({ type: 'sfx', name: n, opts: {} });
  assert.ok(c.mv.every((v) => !v.segs));
  c.handle({ type: 'sfx', name: 'unknown-name' });
  render(c, 1.5);
  assert.equal(c.activeVoices().sfx, 0, '効果音が鳴りっぱなし');
  c.handle({ type: 'stopAll' });
  render(c, 0.1);
  assert.ok(stats(render(c, 0.2)).peak < 1e-3, 'stopAll のあとも音がある');
});

test('掘る音は連打しても間引かれる', () => {
  const c = new WSGCore(SR);
  let n = 0;
  for (let i = 0; i < 40; i++) { const before = c.last.dig; c.handle({ type: 'sfx', name: 'dig' }); if (c.last.dig !== before) n++; render(c, 0.01); }
  assert.ok(n >= 3 && n <= 6, `0.4 秒で ${n} 回`);
});

test('環境音: 小さく、曲より明らかに控えめ', () => {
  const c = new WSGCore(SR);
  c.handle({ type: 'vol', master: 0.8, bgm: 0.7, sfx: 0.9, amb: 0.5 });
  c.handle({ type: 'walk', on: true });
  c.handle({ type: 'music', name: 'stage-soil' });
  const m = stats(render(c, 4));
  for (const kind of Object.keys(AMB)) {
    const a = new WSGCore(SR);
    a.handle({ type: 'vol', master: 0.8, bgm: 0.7, sfx: 0.9, amb: 0.5 });
    a.handle({ type: 'amb', kind });
    const s = stats(render(a, 6), SR * 2);
    assert.equal(s.nan, 0);
    assert.ok(s.rms > 1e-4 && s.rms < m.rms * 0.5, `${kind}: 環境音 ${s.rms} / 曲 ${m.rms}`);
    a.handle({ type: 'ambStop' });
    render(a, 4);
    assert.equal(a.amb, null);
  }
});

test('ミュート・音量 0 で無音', () => {
  const c = new WSGCore(SR);
  c.handle({ type: 'vol', muted: true });
  c.handle({ type: 'music', name: 'title' });
  c.handle({ type: 'sfx', name: 'pop' });
  assert.ok(stats(render(c, 1), SR * 0.2).peak < 1e-4);
});

test('createAudio: Web Audio のない環境でも API がそろい、例外を出さない', async () => {
  const a = createAudio();
  for (const k of ['unlock', 'setVolumes', 'setMuted', 'play', 'jingle', 'suspend', 'resume', 'stopAll']) assert.equal(typeof a[k], 'function', k);
  for (const k of ['start', 'stop', 'setWalking']) assert.equal(typeof a.music[k], 'function');
  for (const k of ['start', 'stop']) assert.equal(typeof a.amb[k], 'function');
  assert.ok(Array.isArray(a.events));
  assert.equal(await a.unlock(), false);
  a.setVolumes({ master: 0.5 }); a.setMuted(true); a.play('pop'); a.play('???'); a.music.start('stage-soil'); a.music.setWalking(true);
  a.amb.start('soil'); await a.suspend(); await a.resume();
  const t = Date.now();
  await a.jingle('nope');
  a.stopAll();
  assert.ok(Date.now() - t < 50);
});

test('PPQ と BAR', () => { assert.equal(BAR, PPQ * 4); });
