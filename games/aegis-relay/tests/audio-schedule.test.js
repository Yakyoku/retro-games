// 曲と効果音の予約の検査: 模擬の AudioContext で時計を手で進め、発音時刻を楽譜と照合する。
// ・ループ 2・3 周目もずれない（継ぎ目の時刻が正確）  ・同じ曲を二重に始めない  ・切り替えで音が残らない
// ・層（合体・緊張）とコアの曲への切り替えは小節の頭  ・効果音の連打は発音数の上限で抑える  ・旧チップ音源も同じ時計で動く
import test from 'node:test';
import assert from 'node:assert/strict';

let clock = 0;
const starts = []; // 音源ノードの start(t)
class P { constructor(v = 1) { this.value = v; this.log = []; } setValueAtTime(v, t) { this.log.push(['set', v, t]); } linearRampToValueAtTime(v, t) { this.log.push(['lin', v, t]); } setTargetAtTime(v, t) { this.log.push(['tgt', v, t]); } exponentialRampToValueAtTime() {} cancelScheduledValues() {} }
class N { constructor() { this.conn = []; } connect(d) { this.conn.push(d); } disconnect() { this.conn.length = 0; } }
const node = (props = {}) => Object.assign(new N(), props);
const src = (kind) => { const s = node({ kind, frequency: new P(), detune: new P(0), playbackRate: new P(), loop: false, setPeriodicWave() {}, stop(t) { this.stopAt = t; } }); s.start = (t) => { starts.push({ t, kind, node: s }); }; return s; };
function mkCtx() {
  return {
    get currentTime() { return clock; }, sampleRate: 48000, state: 'running', destination: new N(),
    createGain: () => node({ gain: new P() }), createOscillator: () => src('osc'), createBufferSource: () => src('buf'), createPeriodicWave: () => ({}),
    createBiquadFilter: () => node({ frequency: new P(), Q: new P() }), createStereoPanner: () => node({ pan: new P(0) }),
    createConvolver: () => node({}), createDelay: () => node({ delayTime: new P() }), createWaveShaper: () => node({}),
    createDynamicsCompressor: () => node({ threshold: new P(), knee: new P(), ratio: new P(), attack: new P(), release: new P() }),
    createBuffer(c, len, sr) { const d = Array.from({ length: c }, () => new Float32Array(len)); return { duration: len / sr, getChannelData: (i) => d[i] }; },
    resume() {}, suspend() {},
  };
}
const { createAudio, compileSong } = await import('../shared/audio/engine.js');
const { SONGS } = await import('../shared/audio/songs.js');
const { SONGS: CHIP_SONGS } = await import('../shared/audio/chip-songs.js');
const { compileSong: compileChip } = await import('../shared/audio/chip.js');

// 時計を 30〜50ms ずつ（ゆらぎ付きで）進めながら予約処理を呼ぶ
function advance(a, until, each) { let k = 0; while (clock < until) { clock += 0.03 + ((k++ * 7) % 5) * 0.005; each?.(); a.pump(); } }
function setup(start = 1.0) {
  clock = start; starts.length = 0; const notes = [];
  const a = createAudio({ context: mkCtx(), onNote: (e, at, M) => notes.push({ e, at, song: M.name }) }); a.unlock();
  return { a, notes };
}
const T0 = 1.06; // playMusic は 0.06 秒先から始める

for (const name of ['title', 'stageA', 'stageB', 'stageC', 'core']) {
  test(`${name}: ループ 1〜3 周目の全音符の発音時刻が楽譜どおり（誤差 1ns 未満）`, () => {
    const { a, notes } = setup(); a.playMusic(name);
    const c = compileSong(SONGS[name]), L = c.len - c.loopAt, end = T0 + c.len + 2 * L;
    advance(a, end + 0.5);
    const expect = [];
    for (const e of c.events) if (!e.L) expect.push(T0 + e.t);
    for (let k = 1; k <= 2; k++) for (const e of c.events) if (!e.L && e.t >= c.loopAt - 1e-9) expect.push(T0 + c.len + (k - 1) * L + (e.t - c.loopAt));
    expect.sort((x, y) => x - y);
    const got = notes.map((n) => n.at).filter((t) => t < end - 1e-9).sort((x, y) => x - y);
    assert.equal(got.length, expect.length, `音符数 ${got.length} vs ${expect.length}`);
    let maxErr = 0; for (let i = 0; i < expect.length; i++) maxErr = Math.max(maxErr, Math.abs(got[i] - expect[i]));
    assert.ok(maxErr < 1e-9, `最大誤差 ${maxErr}s`);
    // 実際のノードの start 時刻も、楽譜の時刻のどれかと一致する（予約は必ず未来の時刻）
    const set = new Set(expect.map((t) => t.toFixed(6)));
    for (const s of starts) if (s.t != null && s.t < end - 1e-9) assert.ok(set.has(s.t.toFixed(6)), `楽譜にない発音 ${s.t}`);
    assert.equal(a.stats.songs, 1);
  });
}

test('同じ曲は二重に始めない。止めると世代の出口が 0 へフェードし、以後は何も予約されない', () => {
  const { a, notes } = setup(); a.playMusic('stageA'); advance(a, 2);
  a.playMusic('stageA'); a.playMusic('stageA'); assert.equal(a.stats.songs, 1);
  const before = notes.length; a.stopMusic(); assert.equal(a.musicName, null);
  const stopAt = clock; advance(a, stopAt + 3);
  assert.equal(notes.length, before, '停止後に予約が増えた');
  // 止めた後に鳴る予定だった音（先読みぶん）は、世代のフェード（0 への直線）で消える
  assert.ok(notes.some((n) => n.at > stopAt), '先読みぶんがあるはず');
});

test('ジングルの終わりに、次の曲がぴったり続く（開始ジングル → ステージ曲）', () => {
  const { a, notes } = setup(); let ended = 0;
  a.playMusic('startA', () => { ended++; a.playMusic('stageA'); });
  const j = compileSong(SONGS.startA);
  advance(a, T0 + j.len + 1);
  assert.equal(ended, 1); assert.equal(a.musicName, 'stageA');
  const first = Math.min(...notes.filter((n) => n.song === 'stageA').map((n) => n.at));
  assert.ok(Math.abs(first - (T0 + j.len)) < 1e-9, `ステージ曲の頭 ${first} / ジングルの終わり ${T0 + j.len}`);
});

test('コアの曲への切り替えは小節の頭。前の曲はそこで終わり、音が残らない', () => {
  const { a, notes } = setup(); a.playMusic('stageA', null, { skipIntro: true });
  const c = compileSong(SONGS.stageA);
  // イントロを飛ばすと、最初の音はループの頭の音
  advance(a, 1.5);
  assert.ok(Math.abs(Math.min(...notes.map((n) => n.at)) - T0) < 1e-9);
  assert.ok(notes.filter((n) => Math.abs(n.at - T0) < 1e-9).every((n) => Math.abs(n.e.t - c.loopAt) < 1e-9));
  advance(a, T0 + c.bar * 2.37);
  const asked = clock; a.playMusic('core', null, { sync: 'bar' }); assert.equal(a.musicName, 'core');
  advance(a, asked + 4);
  const bound = T0 + c.bar * 3;
  const core = notes.filter((n) => n.song === 'core'), old = notes.filter((n) => n.song === 'stageA');
  assert.ok(Math.abs(Math.min(...core.map((n) => n.at)) - bound) < 1e-9, 'コアの曲の頭が小節の頭でない');
  assert.ok(Math.max(...old.map((n) => n.at)) < bound - 1e-6, '前の曲が小節の頭を越えて予約された');
  assert.ok(old.some((n) => n.at > asked), '切り替えを頼んだ後も、小節の頭までは前の曲が続く');
});

test('層（合体・緊張）は次の小節の頭から加わり、小節の頭で抜ける。基本の層とずれない', () => {
  const { a, notes } = setup(); a.playMusic('stageB');
  const c = compileSong(SONGS.stageB), bar = c.bar;
  advance(a, T0 + bar * 5.4); assert.equal(notes.filter((n) => n.e.L).length, 0, '頼む前は層なし');
  a.setLayers({ dock: true }); advance(a, T0 + bar * 9.4); a.setLayers({ dock: false, danger: true }); advance(a, T0 + bar * 13.2); a.setLayers({ danger: false }); advance(a, T0 + bar * 16);
  for (const [L, from, to] of [[1, 6, 10], [2, 10, 14]]) {
    const got = notes.filter((n) => n.e.L === L).map((n) => n.at).sort((x, y) => x - y);
    const expect = c.events.filter((e) => e.L === L && e.t >= from * bar - 1e-9 && e.t < to * bar - 1e-9).map((e) => T0 + e.t);
    assert.equal(got.length, expect.length, `層 ${L}: ${got.length} vs ${expect.length}`);
    for (let i = 0; i < got.length; i++) assert.ok(Math.abs(got[i] - expect[i]) < 1e-9);
  }
  // 層を入れたまま曲を変えると、新しい曲では頭から層が鳴る
  a.setLayers({ dock: true }); a.playMusic('core'); const t = clock; advance(a, t + 1);
  assert.ok(notes.some((n) => n.song === 'core' && n.e.L === 1 && n.at < t + 0.1));
});

test('効果音の連打: 同じフレームに大量に頼んでも、発音数は上限以内（優先度の低い音から落とす）', () => {
  const { a } = setup(); const n0 = starts.length;
  for (let f = 0; f < 60; f++) { // 60 フレームぶん、毎フレーム 40 個
    for (let i = 0; i < 10; i++) { a.se('shot', { x: 10 }); a.se('kill', { x: 200 }); a.se('hit', { x: 120 }); a.se('killBig', { x: 60 }); }
    assert.ok(a.stats.voices <= 10, `同時発音 ${a.stats.voices}`);
    clock += 1 / 60;
  }
  const made = starts.length - n0;
  assert.ok(made > 20 && made < 80, `1 秒で ${made} 音（2400 回の依頼）`);
  assert.equal(a.stats.se, made); assert.ok(a.stats.seDropped > 2000);
  // 上限いっぱいでも、優先度の高い音（自機の撃墜）は必ず鳴る
  const before = a.stats.se; a.se('die', { x: 120 }); assert.equal(a.stats.se, before + 1);
  // 定位: 左端の音は左、右端の音は右、メニューの音は中央
  const panOf = (name, x) => { clock += 1; a.se(name, { x }); const s = starts[starts.length - 1].node; return s.conn[0].conn[0].pan.value; };
  assert.ok(panOf('kill', 0) < -0.7 && panOf('kill', 240) > 0.7 && Math.abs(panOf('kill', 120)) < 1e-9 && panOf('uiOk', 0) === 0);
  // 鎖は枚数が増えるほど高い
  clock += 1; a.se('chainStep', { n: 1, x: 100 }); const r1 = starts[starts.length - 1].node.playbackRate.value;
  clock += 1; a.se('chainStep', { n: 5, x: 100 }); assert.ok(starts[starts.length - 1].node.playbackRate.value > r1 * 1.5);
});

test('旧チップ音源（設定: クラシック）: 曲名の対応・ループの時刻・モダンとの切り替え', () => {
  const { a } = setup(); a.setStyle('chip'); a.playMusic('stageA'); assert.equal(a.musicName, 'stageA'); assert.equal(a.style, 'chip');
  const c = compileChip(CHIP_SONGS.run), t0 = 1.05;
  advance(a, t0 + c.len * 2 + 0.5);
  const expect = []; for (let k = 0; k < 2; k++) for (const tr of c.tracks) for (const n of tr.notes) expect.push(t0 + k * c.len + n.t);
  expect.sort((x, y) => x - y);
  const got = starts.filter((s) => s.kind === 'osc' && s.t != null && s.t < t0 + c.len * 2 - 1e-9).map((s) => s.t).sort((x, y) => x - y);
  assert.equal(got.length, expect.length);
  for (let i = 0; i < got.length; i++) assert.ok(Math.abs(got[i] - expect[i]) < 1e-9);
  // モダンへ戻すと、同じ曲がモダン音源で頭から始まる（旧音源の予約は止まる）
  const { a: b, notes } = setup(); b.setStyle('chip'); b.playMusic('title'); advance(b, 3);
  b.setStyle('modern'); assert.equal(b.musicName, 'title'); const t = clock; advance(b, t + 2);
  assert.ok(notes.length > 10 && notes.every((n) => n.at >= t));
  const oscAfter = starts.filter((s) => s.t > t + 0.3).length; b.setStyle('chip'); assert.equal(b.musicName, 'title');
  assert.ok(oscAfter > 0);
});
