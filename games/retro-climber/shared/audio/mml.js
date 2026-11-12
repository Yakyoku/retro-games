// 鉄骨レスキュー — 小さな MML（Music Macro Language）。曲はすべて自作で、この書式で書く。
// 書式: t<テンポ> o<オクターブ> l<既定の長さ> v<音量 0-15> @<音色 0:12.5% 1:25% 2:50% 3:三角 4:ノイズ>
//       c d e f g a b（+ / # で半音上、- で半音下）、数字で長さ（4=四分）、. で付点、r 休符、< > でオクターブ移動、& でつなぐ
//       q<1-8> で音の長さの割合（スタッカート）
// 返り値: [{ t: 開始（拍）, d: 長さ（拍）, f: 周波数 | null, v, w, q }] と全体の拍数
const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export function parseMML(src) {
  const s = src.replace(/\s+/g, '').toLowerCase();
  let i = 0, o = 4, l = 4, v = 12, w = 2, q = 7, t = 0, tempo = 120;
  const notes = [];
  const num = () => { let n = ''; while (i < s.length && /[0-9]/.test(s[i])) n += s[i++]; return n ? parseInt(n, 10) : null; };
  const len = () => {
    const n = num(); let d = 4 / (n || l);
    let dd = d; while (s[i] === '.') { dd /= 2; d += dd; i++; }
    return d;
  };
  while (i < s.length) {
    const ch = s[i++];
    if (ch in NOTE) {
      let semi = NOTE[ch];
      while (s[i] === '+' || s[i] === '#' || s[i] === '-') semi += s[i++] === '-' ? -1 : 1;
      let d = len();
      const midi = 12 * (o + 1) + semi;
      // タイ: c4&8 も c4&c8 も同じ音をつなぐ
      while (s[i] === '&') { i++; if (s[i] in NOTE) { i++; while (s[i] === '+' || s[i] === '#' || s[i] === '-') i++; } d += len(); }
      notes.push({ t, d, f: 440 * Math.pow(2, (midi - 69) / 12), midi, v, w, q });
      t += d;
    } else if (ch === 'r') { t += len(); }
    else if (ch === 'o') o = num() ?? o;
    else if (ch === '<') o--;
    else if (ch === '>') o++;
    else if (ch === 'l') l = num() ?? l;
    else if (ch === 'v') v = num() ?? v;
    else if (ch === '@') w = num() ?? w;
    else if (ch === 'q') q = num() ?? q;
    else if (ch === 't') tempo = num() ?? tempo;
  }
  return { notes, beats: t, tempo };
}
