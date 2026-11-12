// チップ音源風のシンセサイザー（純粋な計算。ブラウザでも Node でも同じ波形を作る）。
// 矩形波 2 音（デューティ 12.5/25/50%、polyBLEP で帯域制限）・16 段の三角波 1 音・LFSR ノイズ 1 音。
// 曲は MML 風の文字列で書き、サンプル単位で正確なループ位置を持つバッファへ事前レンダリングする（再生中の負荷なし、つなぎ目のクリックなし）。
export const SR = 44100;

const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
export const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---- MML の解釈 ----
// o4 オクターブ / < > 上下 / l8 既定の長さ / v12 音量(0-15) / @1 デューティ(0:12.5 1:25 2:50) / q7 ゲート(1-8)
// c d e f g a b（+ # 半音上・- 半音下）長さ（数字、付点 .）/ r 休符 / & タイ / [ ... ]3 繰り返し
// ドラム用: k(キック) s(スネア) h(ハイハット) o(オープンハット) t(タム)
function expandRepeats(src) {
  let s = src;
  const re = /\[([^\[\]]*)\](\d*)/;
  while (re.test(s)) s = s.replace(re, (_, body, n) => Array(Number(n || 2)).fill(body).join(' '));
  return s;
}

export function parseMML(src, tempo) {
  const s = expandRepeats(src.replace(/;[^\n]*/g, ' '));
  const events = [];
  let i = 0, oct = 4, len = 8, vol = 12, duty = 1, gate = 7, t = 0;
  const beat = 60 / tempo; // 四分音符
  const num = () => { let m = /^\d+/.exec(s.slice(i)); if (!m) return null; i += m[0].length; return Number(m[0]); };
  const dur = () => {
    let n = num(); let d = (4 / (n || len)) * beat;
    let add = d / 2;
    while (s[i] === '.') { d += add; add /= 2; i++; }
    return d;
  };
  while (i < s.length) {
    const ch = s[i++].toLowerCase();
    if (/\s|\|/.test(ch)) continue;
    if (ch === 'o') oct = num();
    else if (ch === '<') oct--;
    else if (ch === '>') oct++;
    else if (ch === 'l') len = num();
    else if (ch === 'v') vol = num();
    else if (ch === '@') duty = num();
    else if (ch === 'q') gate = num();
    else if (ch in NOTE) {
      let m = NOTE[ch];
      while (s[i] === '+' || s[i] === '#' || s[i] === '-') { m += s[i] === '-' ? -1 : 1; i++; }
      const d = dur();
      const midi = (oct + 1) * 12 + m;
      const last = events[events.length - 1];
      if (last && last.tie && last.midi === midi) { last.dur += d; last.tie = false; }
      else events.push({ t, dur: d, midi, vol, duty, gate });
      t += d;
      if (s[i] === '&') { events[events.length - 1].tie = true; i++; }
    } else if (ch === 'r') { t += dur(); }
    else if ('ksht'.includes(ch) || ch === 'x') {
      const d = dur();
      events.push({ t, dur: d, drum: ch, vol, gate });
      t += d;
    } else if (ch === '&') { /* tie handled above */ }
  }
  return { events, length: t };
}

// ---- 音色 ----
function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
const DUTY = [0.125, 0.25, 0.5];

function renderPulse(buf, ev, start, inst) {
  const f0 = midiHz(ev.midi);
  const n = Math.floor(ev.dur * (ev.gate / 8) * SR);
  const rel = Math.floor((inst.release ?? 0.025) * SR);
  const amp = (ev.vol / 15) * (inst.gain ?? 0.22);
  const duty = DUTY[ev.duty ?? inst.duty ?? 1];
  let ph = 0;
  const total = n + rel;
  for (let k = 0; k < total && start + k < buf.length; k++) {
    const tt = k / SR;
    let env;
    const a = inst.attack ?? 0.004;
    if (tt < a) env = tt / a;
    else env = Math.max(inst.sustain ?? 0.6, Math.exp(-(tt - a) / (inst.decay ?? 0.18)));
    if (k >= n) env *= 1 - (k - n) / rel;
    let f = f0;
    if (inst.vib && tt > inst.vibDelay) f *= 1 + inst.vib * Math.sin(2 * Math.PI * 5.6 * (tt - inst.vibDelay));
    if (inst.slide && tt < inst.slide) f *= Math.pow(2, (-1 + tt / inst.slide) * (inst.slideSemi ?? 1) / 12);
    const dt = f / SR;
    let v = ph < duty ? 1 : -1;
    v += polyBlep(ph, dt);
    v -= polyBlep((ph - duty + 1) % 1, dt);
    ph += dt; if (ph >= 1) ph -= 1;
    buf[start + k] += v * env * amp;
  }
}

function renderTri(buf, ev, start, inst) {
  const f = midiHz(ev.midi);
  const n = Math.floor(ev.dur * (ev.gate / 8) * SR);
  const rel = Math.floor(0.012 * SR);
  const amp = (ev.vol / 15) * (inst.gain ?? 0.34);
  let ph = 0;
  for (let k = 0; k < n + rel && start + k < buf.length; k++) {
    let env = k < n ? 1 : 1 - (k - n) / rel;
    if (k < 60) env *= k / 60;
    // 16 段の三角波（チップ音源らしい段つき）。段の角は軽く丸める
    const tri = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4;
    const q = Math.round(tri * 7.5) / 7.5;
    buf[start + k] += (q * 0.8 + tri * 0.2) * env * amp;
    ph += f / SR; if (ph >= 1) ph -= 1;
  }
}

function lfsr(short) {
  let r = 1;
  return () => { const bit = ((r >> 0) ^ (r >> (short ? 6 : 1))) & 1; r = (r >> 1) | (bit << 14); return (r & 1) ? 1 : -1; };
}

export function renderNoiseHit(buf, start, { len, rate, decay, gain, short = false, pitchDrop = 0, tone = 0, toneF = 0 }) {
  const n = Math.floor(len * SR);
  const rnd = lfsr(short);
  let acc = 0, cur = rnd();
  let ph = 0;
  for (let k = 0; k < n && start + k < buf.length; k++) {
    const tt = k / SR;
    const r = rate * Math.pow(2, -pitchDrop * tt);
    acc += r / SR;
    while (acc >= 1) { acc -= 1; cur = rnd(); }
    let env = Math.exp(-tt / decay);
    if (k > n - 200) env *= (n - k) / 200;
    let v = cur * gain * env;
    if (tone) {
      const f = toneF * Math.pow(2, -pitchDrop * tt * 0.5);
      v += Math.sin(2 * Math.PI * ph) * tone * env;
      ph += f / SR;
    }
    buf[start + k] += v;
  }
}

const DRUM = {
  k: { len: 0.16, rate: 900, decay: 0.05, gain: 0.10, tone: 0.42, toneF: 120, pitchDrop: 5 },
  s: { len: 0.18, rate: 9000, decay: 0.06, gain: 0.26, tone: 0.10, toneF: 210, pitchDrop: 1 },
  h: { len: 0.05, rate: 30000, decay: 0.012, gain: 0.14, short: true },
  x: { len: 0.20, rate: 26000, decay: 0.08, gain: 0.13, short: true },
  t: { len: 0.2, rate: 2000, decay: 0.08, gain: 0.08, tone: 0.32, toneF: 160, pitchDrop: 2.5 },
};

export function renderSong(song) {
  const tracks = song.tracks.map((tr) => ({ ...tr, parsed: parseMML(tr.mml, song.tempo) }));
  const length = Math.max(...tracks.map((t) => t.parsed.length));
  const n = Math.ceil(length * SR);
  const tail = song.loop ? 0 : Math.floor(0.6 * SR);
  const buf = new Float32Array(n + tail);
  for (const tr of tracks) {
    for (const ev of tr.parsed.events) {
      const start = Math.round(ev.t * SR);
      if (ev.drum) { const d = DRUM[ev.drum]; renderNoiseHit(buf, start, { ...d, gain: d.gain * (ev.vol / 12), tone: (d.tone || 0) * (ev.vol / 12) }); }
      else if (tr.voice === 'tri') renderTri(buf, ev, start, tr);
      else renderPulse(buf, ev, start, tr);
    }
  }
  // ループする曲は、末尾からはみ出した余韻を先頭に足し戻す（つなぎ目で音が切れない・クリックが出ない）
  if (song.loop) {
    const over = new Float32Array(Math.floor(0.4 * SR));
    // はみ出し分はバッファ外なので、もう一度末尾の数音を長めの配列でレンダリングし直す
    const ext = new Float32Array(n + over.length);
    for (const tr of tracks) for (const ev of tr.parsed.events) {
      const start = Math.round(ev.t * SR);
      if (start + ev.dur * SR + 0.05 * SR < n) continue;
      if (ev.drum) { const d = DRUM[ev.drum]; renderNoiseHit(ext, start, { ...d, gain: d.gain * (ev.vol / 12), tone: (d.tone || 0) * (ev.vol / 12) }); }
      else if (tr.voice === 'tri') renderTri(ext, ev, start, tr);
      else renderPulse(ext, ev, start, tr);
    }
    for (let k = 0; k < over.length; k++) buf[k] += ext[n + k];
  }
  // 簡単な 1 次ローパス（チップ音源の出力段のような、角の取れた高域）
  let y = 0; const a = song.lp ?? 0.55;
  if (song.loop) { for (let k = n - 2000; k < n; k++) y += a * (buf[k] - y); }
  for (let k = 0; k < buf.length; k++) { y += a * (buf[k] - y); buf[k] = y; }
  return { data: buf, loop: !!song.loop, loopStart: 0, loopEnd: n / SR, length: buf.length / SR };
}

// ---- 効果音（関数で直接合成） ----
function sweep(buf, start, { len, f0, f1, duty = 2, gain = 0.25, curve = 1, tri = false, decay = 1e9 }) {
  const n = Math.floor(len * SR);
  let ph = 0;
  for (let k = 0; k < n && start + k < buf.length; k++) {
    const u = k / n;
    const f = f0 * Math.pow(f1 / f0, Math.pow(u, curve));
    const dt = f / SR;
    let v;
    if (tri) v = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4;
    else { const d = DUTY[duty]; v = (ph < d ? 1 : -1) + polyBlep(ph, dt) - polyBlep((ph - d + 1) % 1, dt); }
    let env = Math.exp(-(k / SR) / decay);
    if (k < 40) env *= k / 40;
    if (k > n - 120) env *= (n - k) / 120;
    buf[start + k] += v * gain * env;
    ph += dt; if (ph >= 1) ph -= 1;
  }
}
const mk = (sec) => new Float32Array(Math.ceil(sec * SR));
const at = (s) => Math.floor(s * SR);

export const SFX_DEFS = {
  shot(b = mk(0.14)) { sweep(b, 0, { len: 0.1, f0: 1500, f1: 220, duty: 2, gain: 0.2, curve: 0.6 }); renderNoiseHit(b, 0, { len: 0.05, rate: 18000, decay: 0.015, gain: 0.16 }); return b; },
  eshot(b = mk(0.18)) { sweep(b, 0, { len: 0.14, f0: 820, f1: 130, duty: 1, gain: 0.2, curve: 0.5 }); renderNoiseHit(b, 0, { len: 0.07, rate: 9000, decay: 0.025, gain: 0.14 }); return b; },
  windup(b = mk(0.09)) { sweep(b, 0, { len: 0.035, f0: 2400, f1: 1800, duty: 0, gain: 0.08 }); sweep(b, at(0.045), { len: 0.035, f0: 1600, f1: 1300, duty: 0, gain: 0.07 }); return b; },
  kill(b = mk(0.42)) { renderNoiseHit(b, 0, { len: 0.4, rate: 7000, decay: 0.12, gain: 0.2, pitchDrop: 3 }); sweep(b, 0, { len: 0.3, f0: 660, f1: 70, duty: 1, gain: 0.13, curve: 0.8 }); return b; },
  kick(b = mk(0.16)) { sweep(b, 0, { len: 0.12, f0: 220, f1: 55, tri: true, gain: 0.45 }); renderNoiseHit(b, 0, { len: 0.06, rate: 5000, decay: 0.02, gain: 0.18 }); return b; },
  kickSwing(b = mk(0.18)) { renderNoiseHit(b, 0, { len: 0.17, rate: 3000, decay: 0.08, gain: 0.08, pitchDrop: -2 }); return b; },
  jump(b = mk(0.12)) { sweep(b, 0, { len: 0.11, f0: 330, f1: 780, duty: 1, gain: 0.09, curve: 0.7 }); return b; },
  land(b = mk(0.08)) { sweep(b, 0, { len: 0.06, f0: 140, f1: 60, tri: true, gain: 0.25 }); return b; },
  lightHit(b = mk(0.2)) { renderNoiseHit(b, 0, { len: 0.18, rate: 32000, decay: 0.05, gain: 0.16, short: true }); sweep(b, 0, { len: 0.12, f0: 2600, f1: 2100, duty: 0, gain: 0.07, decay: 0.04 }); return b; },
  lightCrash(b = mk(0.5)) { renderNoiseHit(b, 0, { len: 0.45, rate: 24000, decay: 0.12, gain: 0.22, short: true }); renderNoiseHit(b, 0, { len: 0.2, rate: 800, decay: 0.06, gain: 0.1, tone: 0.3, toneF: 90, pitchDrop: 3 }); return b; },
  carStart(b = mk(0.2)) { sweep(b, 0, { len: 0.18, f0: 70, f1: 110, tri: true, gain: 0.25 }); return b; },
  carStop(b = mk(0.6)) { sweep(b, 0, { len: 0.28, f0: 1318.5, f1: 1318.5, duty: 2, gain: 0.07, decay: 0.12 }); sweep(b, at(0.16), { len: 0.4, f0: 1046.5, f1: 1046.5, duty: 2, gain: 0.07, decay: 0.15 }); return b; },
  carPass(b = mk(0.06)) { sweep(b, 0, { len: 0.04, f0: 1760, f1: 1760, duty: 0, gain: 0.035, decay: 0.02 }); return b; },
  carWarn(b = mk(0.36)) { for (const s of [0, 0.18]) sweep(b, at(s), { len: 0.1, f0: 1975, f1: 1975, duty: 1, gain: 0.06 }); return b; },
  carLimit(b = mk(0.12)) { sweep(b, 0, { len: 0.1, f0: 180, f1: 160, duty: 1, gain: 0.08 }); return b; },
  call(b = mk(0.18)) { renderNoiseHit(b, 0, { len: 0.02, rate: 12000, decay: 0.005, gain: 0.12 }); sweep(b, at(0.02), { len: 0.12, f0: 1568, f1: 1568, duty: 0, gain: 0.06, decay: 0.06 }); return b; },
  doorWarn(b = mk(0.5)) { for (const s of [0, 0.2]) sweep(b, at(s), { len: 0.12, f0: 196, f1: 185, duty: 1, gain: 0.1 }); return b; },
  doorOpen(b = mk(0.3)) { renderNoiseHit(b, 0, { len: 0.28, rate: 2500, decay: 0.12, gain: 0.08, pitchDrop: -1.5 }); return b; },
  doorEnter(b = mk(0.25)) { renderNoiseHit(b, 0, { len: 0.22, rate: 3500, decay: 0.08, gain: 0.08, pitchDrop: -1 }); sweep(b, 0, { len: 0.06, f0: 300, f1: 200, tri: true, gain: 0.2 }); return b; },
  bulletCover(b = mk(0.16)) { sweep(b, 0, { len: 0.14, f0: 3200, f1: 1900, duty: 0, gain: 0.06, decay: 0.05 }); renderNoiseHit(b, 0, { len: 0.03, rate: 20000, decay: 0.01, gain: 0.1 }); return b; },
  needDocs(b = mk(0.34)) { for (const s of [0, 0.16]) sweep(b, at(s), { len: 0.12, f0: 233, f1: 220, duty: 2, gain: 0.09 }); return b; },
  crush(b = mk(0.4)) { renderNoiseHit(b, 0, { len: 0.38, rate: 1500, decay: 0.12, gain: 0.25, tone: 0.3, toneF: 70, pitchDrop: 2 }); return b; },
  dodge(b = mk(0.14)) { renderNoiseHit(b, 0, { len: 0.13, rate: 6000, decay: 0.05, gain: 0.07, pitchDrop: -3 }); return b; },
  // 補助音（VR メニューなど）。設定で無効にできる
  uiMove(b = mk(0.05)) { sweep(b, 0, { len: 0.035, f0: 1318.5, f1: 1318.5, duty: 0, gain: 0.04, decay: 0.02 }); return b; },
  uiOk(b = mk(0.14)) { sweep(b, 0, { len: 0.05, f0: 1046.5, f1: 1046.5, duty: 1, gain: 0.05 }); sweep(b, at(0.05), { len: 0.08, f0: 1568, f1: 1568, duty: 1, gain: 0.05, decay: 0.05 }); return b; },
  uiBack(b = mk(0.12)) { sweep(b, 0, { len: 0.1, f0: 784, f1: 523, duty: 1, gain: 0.05 }); return b; },
};

// かごの走行音（1 秒でちょうど整数周期になる周波数を使い、ループのつなぎ目を作らない）
export function carHumLoop() {
  const n = SR; const b = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const t = k / n;
    const tri = (f) => { const ph = (t * f) % 1; return ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4; };
    const trem = 0.8 + 0.2 * Math.sin(2 * Math.PI * 6 * t);
    b[k] = (tri(55) * 0.16 + tri(110) * 0.05 + ((t * 165) % 1 < 0.125 ? 0.02 : -0.02)) * trem;
  }
  return { data: b, loop: true, loopStart: 0, loopEnd: 1, length: 1 };
}
