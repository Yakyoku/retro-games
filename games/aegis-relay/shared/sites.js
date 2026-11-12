// 公開先（2 サイト）。相互リンクに使う。ローカルの dist（VARIANT=all）では同じサイト内の相対パスへ
export const SITES = { '2d': 'https://aegis-relay-2d.netlify.app/', '3d': 'https://aegis-relay-vr.netlify.app/' };
export function otherUrl(current) {
  const target = current === '2d' ? '3d' : '2d';
  // VARIANT=all の dist では /play2d/ と /play3d/ が同居している
  if (/\/play(2|3)d\//.test(location.pathname)) return location.pathname.replace(/play(2|3)d\//, target === '2d' ? 'play2d/' : 'play3d/') + location.search;
  return SITES[target];
}
