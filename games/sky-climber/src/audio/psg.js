// Sky Climber VR — AY-3-8910 系の PSG（矩形波 3 声＋ノイズ）をソフトウェアで再現して、曲と効果音をオフライン合成する。
// 参考作品の基板は AY-3-8910 ×1（約 1.536MHz）＋ROM の声サンプル（MAME の cclimber ドライバーで確認、docs/REFERENCES.md）。
// ここで再現するのは「音源の仕組み」（周期の量子化・16 段の対数音量・17bit LFSR ノイズ・60Hz の音量操作）で、原作の曲や音そのものではない。
export const AY_CLOCK = 1536000;
// AY-3-8910 の 16 段の音量（おおむね 1 段 ≈ 3dB の対数。0 は無音）
export const AY_VOL = [0, 0.0106, 0.0150, 0.0222, 0.0320, 0.0466, 0.0665, 0.1039, 0.1237, 0.1986, 0.2803, 0.3548, 0.4702, 0.6030, 0.7530, 1.0];
export const FRAME = 1 / 60; // ドライバーは 60Hz で音量・音程を書き換える（当時の一般的な作り）

// 周波数 → トーン周期（12bit）→ 実際に鳴る周波数（量子化で少し音程がずれるのも当時どおり）
export const tonePeriod = (f) => Math.max(1, Math.min(4095, Math.round(AY_CLOCK / (16 * f))));
export const periodFreq = (p) => AY_CLOCK / (16 * p);
export const noteFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// frames: 60Hz ごとの各チャンネルのレジスター値の列 [{ a:{p,v,t,n}, b:..., c:..., np }]
//   p=トーン周期, v=音量 0..15, t=トーン有効, n=ノイズ有効、np=ノイズ周期(1..31)
export function renderFrames(frames, sampleRate = 44100, gain = 0.32) {
  const spf = sampleRate / 60;
  const total = Math.ceil(frames.length * spf);
  const out = new Float32Array(total);
  const ph = [0, 0, 0], sq = [1, 1, 1];
  let lfsr = 1, noiseOut = 1, nph = 0;
  const chans = ['a', 'b', 'c'];
  // 出力の DC を取る 1 次ハイパス（当時の出力コンデンサー相当）と、聞きやすさのための軽いローパス
  let hpPrevIn = 0, hpPrevOut = 0, lp = 0;
  const hpA = 1 - 2 * Math.PI * 20 / sampleRate, lpA = 1 - Math.exp(-2 * Math.PI * 9000 / sampleRate);
  for (let i = 0; i < total; i++) {
    const fr = frames[Math.min(frames.length - 1, Math.floor(i / spf))];
    // ノイズ（17bit LFSR、AY と同じタップ）
    const nf = AY_CLOCK / (16 * Math.max(1, fr.np || 16)) / 2;
    nph += nf / sampleRate;
    while (nph >= 1) { nph -= 1; const bit = (lfsr ^ (lfsr >> 3)) & 1; lfsr = (lfsr >> 1) | (bit << 16); noiseOut = lfsr & 1; }
    let mix = 0;
    for (let k = 0; k < 3; k++) {
      const c = fr[chans[k]]; if (!c || !c.v) continue;
      const f = periodFreq(c.p || 1);
      // 矩形波（周期の半分ずつで反転）。ナイキストを超える分は平均値に
      ph[k] += f / sampleRate;
      let tone;
      if (f > sampleRate / 2) tone = 0.5; else { while (ph[k] >= 1) ph[k] -= 1; tone = ph[k] < 0.5 ? 1 : 0; }
      const t = c.t === false ? 1 : tone, n = c.n ? noiseOut : 1;
      mix += (t & n) * AY_VOL[c.v | 0]; // AY: (トーン or 無効) and (ノイズ or 無効)
    }
    const x = mix * gain;
    const hp = hpA * (hpPrevOut + x - hpPrevIn); hpPrevIn = x; hpPrevOut = hp;
    lp += (hp - lp) * lpA;
    out[i] = lp;
  }
  return out;
}

// ---- MML（自作の曲を書くための小さな記法） ----
// 音符 c d e f g a b（+ # で半音上・- で半音下）、数字=長さ（4=4分）、. =付点、r=休符、o=オクターブ、< > =オクターブ上下、
// l=既定の長さ、v=音量(0-15)、@=音色、q=ゲート(1-8、8=レガート)、&=タイ。| は小節線（読み飛ばす）
export function parseMML(src, bpm) {
  const ev = []; let o = 4, l = 8, v = 12, inst = 'lead', q = 7, t = 0; let i = 0;
  const num = () => { let s = ''; while (i < src.length && /[0-9]/.test(src[i])) s += src[i++]; return s ? +s : null; };
  const beat = 60 / bpm;
  const lenOf = (n) => { let d = (4 / n) * beat; let add = d / 2; while (src[i] === '.') { d += add; add /= 2; i++; } return d; };
  const SEMI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  while (i < src.length) {
    const ch = src[i++].toLowerCase();
    if (/\s|\|/.test(ch)) continue;
    if (ch === 'o') { o = num(); continue; }
    if (ch === '<') { o--; continue; }
    if (ch === '>') { o++; continue; }
    if (ch === 'l') { l = num(); continue; }
    if (ch === 'v') { v = num(); continue; }
    if (ch === 'q') { q = num(); continue; }
    if (ch === '@') { let s = ''; while (i < src.length && /[a-z0-9]/i.test(src[i])) s += src[i++]; inst = s; continue; }
    if (ch === 'r' || SEMI[ch] != null) {
      let semi = ch === 'r' ? null : SEMI[ch];
      while (src[i] === '+' || src[i] === '#' || src[i] === '-') { semi += src[i] === '-' ? -1 : 1; i++; }
      const n = num(); const d = lenOf(n || l);
      let dur = d;
      while (src[i] === '&') { i++; const n2 = num(); dur += lenOf(n2 || l); }
      if (semi != null) ev.push({ t, dur, gate: dur * (q >= 8 ? 1 : q / 8), midi: 12 * (o + 1) + semi, v, inst });
      t += dur; continue;
    }
    throw new Error(`MML: 読めない文字 "${ch}" (${i})`);
  }
  return { events: ev, length: t };
}

// 音色: 60Hz ごとの音量（ソフトウェア包絡）と音程の揺れ。f=フレーム番号、g=ゲート中か
export const INSTRUMENTS = {
  lead:  { env: (f, g, v) => g ? Math.max(v - 2, v - Math.floor(f / 4)) : Math.max(0, v - 2 - 2 * f), vib: { delay: 14, depth: 0.012, rate: 6 } },
  pluck: { env: (f, g, v) => Math.max(0, v - Math.floor(f / 2)) },
  stab:  { env: (f, g, v) => g ? Math.max(0, v - f) : 0 },
  bass:  { env: (f, g, v) => g ? Math.max(v - 3, v - Math.floor(f / 3)) : Math.max(0, v - 4 - 3 * f) },
  bell:  { env: (f, g, v) => Math.max(0, v - Math.floor(f / 6)), vib: { delay: 0, depth: 0.006, rate: 8 } },
  snare: { noise: 6, env: (f, g, v) => Math.max(0, v - 2 * f) },
  hat:   { noise: 1, env: (f, g, v) => Math.max(0, v - 4 * f) },
  kick:  { env: (f, g, v) => Math.max(0, v - 2 * f), sweep: -0.12 },
};

// 曲（トラック: ch='a'|'b'|'c'）→ 60Hz のフレーム列。drums トラックは鳴っている間チャンネル c を奪う（当時の 3 声のやりくり）
export function songToFrames(song) {
  const tracks = song.tracks.map((tr) => ({ ...tr, ...parseMML(tr.mml, song.bpm) }));
  const length = Math.max(...tracks.map((t) => t.length));
  const nFrames = Math.round(length * 60) + (song.tail ?? 30);
  const frames = Array.from({ length: nFrames }, () => ({ a: null, b: null, c: null, np: 16 }));
  for (const tr of tracks) {
    for (const e of tr.events) {
      const ins = INSTRUMENTS[e.inst] || INSTRUMENTS.lead;
      const f0 = Math.round(e.t * 60), gEnd = Math.round((e.t + e.gate) * 60);
      const end = Math.min(nFrames, Math.round((e.t + e.dur) * 60));
      for (let f = f0; f < end; f++) {
        const rel = f - f0, gate = f < gEnd;
        let vol = ins.env(rel, gate, e.v);
        if (vol <= 0) continue;
        let freq = noteFreq(e.midi + (song.transpose || 0));
        if (ins.vib && rel > ins.vib.delay) freq *= 1 + ins.vib.depth * Math.sin(2 * Math.PI * ins.vib.rate * (rel / 60));
        if (ins.sweep) freq *= Math.pow(2, ins.sweep * rel);
        const reg = { p: tonePeriod(freq), v: Math.min(15, vol), t: !ins.noise, n: !!ins.noise };
        const fr = frames[f];
        if (tr.drums) { fr.c = reg; fr.np = ins.noise || 16; fr.drum = true; }
        else if (!(tr.ch === 'c' && fr.drum)) fr[tr.ch] = reg;
      }
    }
  }
  return { frames, loopFrames: Math.round(length * 60), length };
}

// ループ曲: ループ 1 周ぶんの長さに切り、はみ出た余韻を先頭へ重ねる（継ぎ目で音が切れない・跳ばない）
export function renderSong(song, sampleRate = 44100) {
  const { frames, loopFrames } = songToFrames(song);
  const pcm = renderFrames(frames, sampleRate, song.gain ?? 0.30);
  if (!song.loop) return { pcm, sampleRate, loop: false };
  const n = Math.round(loopFrames * sampleRate / 60);
  const out = pcm.slice(0, n);
  for (let i = n; i < pcm.length; i++) out[(i - n) % n] += pcm[i];
  return { pcm: out, sampleRate, loop: true };
}
