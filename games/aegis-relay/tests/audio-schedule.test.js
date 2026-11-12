// 曲の予約: 模擬の AudioContext で時計を手で進め、全音符の発音時刻を楽譜と照合する（ループ 2・3 周目もずれないこと）
import test from 'node:test';
import assert from 'node:assert/strict';

const starts = [];
class P { constructor() { this.value = 1; } setValueAtTime() {} linearRampToValueAtTime() {} setTargetAtTime() {} exponentialRampToValueAtTime() {} cancelScheduledValues() {} }
class N { connect() {} disconnect() {} }
class Osc extends N { constructor() { super(); this.frequency = new P(); } setPeriodicWave() {} start(t) { starts.push({ t, hz: this.f }); } stop() {} }
let clock = 0;
const ctx = {
  get currentTime() { return clock; }, sampleRate: 8000, state: 'running', destination: new N(),
  createGain() { const g = new N(); g.gain = new P(); return g; },
  createOscillator() { return new Osc(); }, createPeriodicWave() { return {}; },
  createBuffer(c, len) { return { getChannelData: () => new Float32Array(len) }; },
  createBufferSource() { const s = new N(); s.playbackRate = new P(); s.start = () => {}; s.stop = () => {}; return s; },
  resume() {}, suspend() {},
};
globalThis.AudioContext = function () { return ctx; };
let tick = null; globalThis.setInterval = (f) => { tick = f; return 1; };

const { createAudio, compileSong } = await import('../shared/audio/engine.js');
const { SONGS } = await import('../shared/audio/songs.js');

for (const name of ['title', 'run', 'nave', 'core']) {
  test(`${name}: ループ 1〜3 周目の発音時刻が楽譜どおり`, () => {
    starts.length = 0; clock = 1.0;
    const a = createAudio(); a.unlock(); a.playMusic(name);
    const comp = compileSong(SONGS[name]);
    const t0 = 1.05, L = comp.len;
    // 時計を 40ms ずつ（ゆらぎ付きで）進めながら予約処理を呼ぶ
    let k = 0; while (clock < t0 + L * 3 + 0.5) { clock += 0.03 + ((k++ * 7) % 5) * 0.005; tick(); }
    const tones = starts.map((s) => s.t).sort((x, y) => x - y);
    const expect = [];
    for (let loop = 0; loop < 3; loop++) for (const tr of comp.tracks) for (const n of tr.notes) expect.push(t0 + loop * L + n.t);
    expect.sort((x, y) => x - y);
    const got = tones.filter((t) => t < t0 + L * 3 - 1e-9);
    assert.equal(got.length, expect.length, `音符数 ${got.length} vs ${expect.length}`);
    let maxErr = 0; for (let i = 0; i < expect.length; i++) maxErr = Math.max(maxErr, Math.abs(got[i] - expect[i]));
    assert.ok(maxErr < 1e-9, `最大誤差 ${maxErr}s`);
    a.stopMusic();
  });
}
