// 地底探検：ポンプ・パトロール — 音の窓口（メインスレッド側）。
// 使い方: const audio = createAudio(); ボタンなどの操作の中で audio.unlock(); あとは play / music / jingle / amb。
// AudioWorklet が使えなければ ScriptProcessor で同じ音源（wsg-core.js）を回す。
// AudioContext にはこのファイルの関数の中でだけ触れる（Node のテストで読み込んでも動くように）。
import { WSGCore } from './wsg-core.js';
import { JINGLES, JINGLE_TAIL } from './tracks.js';
import { SFX } from './sfx-defs.js';
import { events } from './events.js';

export { events };

export function createAudio() {
  let ctx = null, node = null, core = null, mode = 'none', ready = false, setup = null;
  const vols = { master: 0.8, bgm: 0.7, sfx: 0.9, amb: 0.5 };
  let muted = false, walking = false, musicName = null, ambKind = null;
  const pending = new Map();
  let jid = 0;
  const listeners = new Set();

  const post = (m) => {
    if (!ready) return;
    if (mode === 'worklet') node.port.postMessage(m);
    else core.handle(m);
  };
  const onMessage = (m) => {
    if (!m) return;
    if (m.type === 'jingleEnd') finish(m.id);
    for (const fn of listeners) { try { fn(m); } catch (e) { console.error(e); } }
  };
  function finish(id) { const p = pending.get(id); if (p) { pending.delete(id); clearTimeout(p.timer); p.resolve(); } }
  const syncAll = () => {
    post({ type: 'vol', ...vols, muted });
    post({ type: 'walk', on: walking });
    if (musicName) post({ type: 'music', name: musicName });
    if (ambKind) post({ type: 'amb', kind: ambKind });
  };

  async function build() {
    try {
      if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') throw new Error('AudioWorklet なし');
      await ctx.audioWorklet.addModule(new URL('./wsg-worklet.js', import.meta.url));
      node = new AudioWorkletNode(ctx, 'retro-digger-wsg', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      node.port.onmessage = (e) => onMessage(e.data);
      mode = 'worklet';
    } catch (err) {
      // 予備: メインスレッドで同じ音源を回す（古い Safari など）
      core = new WSGCore(ctx.sampleRate);
      core.emit = (m) => setTimeout(() => onMessage(m), 0);
      node = ctx.createScriptProcessor(2048, 1, 2);
      node.onaudioprocess = (e) => {
        const L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1);
        core.render(L, R, L.length);
      };
      mode = 'script';
      console.warn('[audio] AudioWorklet が使えないので ScriptProcessor で再生します:', err && err.message);
    }
    node.connect(ctx.destination);
    ready = true;
    syncAll();
  }

  // ユーザー操作（クリック・タッチ・キー・XR の開始ボタン）の中で呼ぶ。何度呼んでもよい。
  function unlock() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return Promise.resolve(false);
    if (!ctx) {
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch { ctx = new AC(); }
      // iOS Safari: 操作の中で無音を 1 回鳴らすと確実に音が出るようになる
      try {
        const b = ctx.createBuffer(1, 1, ctx.sampleRate), s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination); s.start(0);
      } catch { /* 無視 */ }
    }
    // 'suspended' だけでなく iOS の 'interrupted'（電話・別アプリ）からも戻す。操作の中で同期的に呼ぶのが大事
    const resumed = ctx.state !== 'running' ? Promise.resolve(ctx.resume()).catch(() => {}) : Promise.resolve();
    if (!setup) setup = build().catch((e) => { console.error('[audio] 初期化に失敗', e); });
    return Promise.all([resumed, setup]).then(() => ctx.state === 'running');
  }

  function setVolumes(v = {}) {
    for (const k of ['master', 'bgm', 'sfx', 'amb']) if (Number.isFinite(v[k])) vols[k] = Math.max(0, Math.min(1, v[k]));
    post({ type: 'vol', ...vols, muted });
  }
  function setMuted(b) { muted = !!b; post({ type: 'vol', ...vols, muted }); }

  function play(name, opts = {}) {
    if (typeof SFX[name] !== 'function') return; // 知らない名前は黙って無視
    const o = opts || {};
    post({ type: 'sfx', name, opts: { pan: +o.pan || 0, gain: Number.isFinite(o.gain) ? o.gain : 1, stage: o.stage | 0 } });
  }

  const music = {
    start(name) { musicName = name; post({ type: 'music', name }); },
    stop() { musicName = null; post({ type: 'musicStop' }); },
    setWalking(b) { b = !!b; if (b === walking) return; walking = b; post({ type: 'walk', on: b }); },
    get walking() { return walking; },
    get current() { return musicName; },
  };

  // 鳴り終わったら解決する Promise を返す。鳴っている間は曲を止めておき、終わると元の位置から続ける。
  function jingle(name) {
    const j = JINGLES[name];
    if (!j) return Promise.resolve();
    const id = ++jid, ms = (j.seconds + JINGLE_TAIL) * 1000;
    return new Promise((resolve) => {
      // 音が出せない状態でもゲームの進行が止まらないよう、長さ分（音源が動いていれば +4 秒の保険）で必ず解決する
      const timer = setTimeout(() => finish(id), ready ? ms + 4000 : ms);
      pending.set(id, { resolve, timer });
      post({ type: 'jingle', name, id });
    });
  }

  const amb = {
    start(kind) { ambKind = kind; post({ type: 'amb', kind }); },
    stop() { ambKind = null; post({ type: 'ambStop' }); },
  };

  function suspend() { if (ctx && ctx.state === 'running') return ctx.suspend().catch(() => {}); return Promise.resolve(); }
  function resume() { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') return Promise.resolve(ctx.resume()).catch(() => {}); return Promise.resolve(); }
  function stopAll() {
    musicName = null; ambKind = null;
    post({ type: 'stopAll' });
    for (const id of [...pending.keys()]) finish(id);
  }

  return {
    unlock, setVolumes, setMuted, play, music, jingle, amb, suspend, resume, stopAll, events,
    // 補助（音確認ページ用）
    onMessage(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get mode() { return mode; },
    get state() { return ctx ? ctx.state : 'none'; },
    get volumes() { return { ...vols }; },
    get muted() { return muted; },
  };
}
