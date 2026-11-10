// VOIDBLOOM — 物語と設定の文（すべてオリジナル）
export const STORY = {
  intro: '観測史に記録のない星域で、金属でできた花が咲いた。\n花は星を呑み、殻と肉と鋼の群れを産み落としながら、虚空に根を広げていく。\n人はそれを VOIDBLOOM と呼んだ。\n\n花芯へ届く機体は一機だけ。種子の形をした無敵の盾「SEED」を抱いた試験機、SABLE WREN。',
};
export function ENDING_TEXT(s) {
  return [
    'HEART OF THE BLOOM は、音もなく枯れた。',
    '', '花弁は灰となって散り、礁は硝子の静けさを取り戻した。',
    '鋼の方舟は墓標のまま、星の流れに沈んでいく。',
    '', 'SEED は最後の光を残し、ふたたび固い殻に閉じた。',
    'いつか、どこかで、また花が咲くまで。',
    '', `SCORE ${String(s.score).padStart(8, '0')}   CONTINUE ${s.continues}   MISS ${s.stats.deaths}`,
    '', '— 撃つボタンで 2 周目へ（敵弾が速くなります）—',
    '', 'MADE WITH CLAUDE',
  ].join('\n');
}
