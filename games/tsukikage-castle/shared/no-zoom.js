// 月影の魔城（VOIDBLOOM から複製）— タブレット・スマホで「画面がずれる」のを防ぐ
// iPad / iPhone の Safari は viewport の user-scalable=no を無視するので、ダブルタップや 2 本指で
// ページ全体が拡大・移動してしまう（ゲーム画面が右下へずれ、ボタンが画面外へ出る）。
// ここでは ① 拡大のジェスチャーを止める ② 万一拡大されたら元に戻す ③ 見えている大きさが変わるたびに盤面を合わせ直す。
export function installNoZoom(onLayout) {
  const opt = { passive: false };
  const stop = (e) => { if (e.cancelable) e.preventDefault(); };
  // ① WebKit のピンチ（gesture*）・ページのスクロール・ダブルタップ拡大を止める
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, stop, opt);
  document.addEventListener('touchmove', stop, opt);
  document.addEventListener('dblclick', stop, opt);
  let lastEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = performance.now();
    if (now - lastEnd < 350) {
      // 速い 2 回目のタップ: 拡大を止める。メニュー項目・ボタンはクリックを代わりに送る
      stop(e);
      const t = e.target && e.target.closest && e.target.closest('li, button, a, [data-tap]');
      if (t && !t.classList.contains('t-btn')) t.click();
    }
    lastEnd = now;
  }, opt);
  // ② 拡大されていたら viewport を書き直して等倍へ戻し、スクロールを先頭へ
  const meta = document.querySelector('meta[name=viewport]');
  const base = 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';
  let fixing = false;
  function unzoom() {
    const vv = window.visualViewport;
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    if (!vv || vv.scale <= 1.01 || fixing || !meta) return;
    fixing = true;
    meta.setAttribute('content', 'width=device-width,initial-scale=1.0001,maximum-scale=1.0001,user-scalable=no,viewport-fit=cover');
    requestAnimationFrame(() => { meta.setAttribute('content', base); window.scrollTo(0, 0); fixing = false; });
  }
  // ③ 見えている大きさの変化（ツールバーの出し入れ・回転・分割表示）を全部拾う
  let lastW = 0, lastH = 0;
  function check() {
    unzoom();
    const w = window.innerWidth, h = window.innerHeight;
    if (w !== lastW || h !== lastH) { lastW = w; lastH = h; onLayout(); }
  }
  addEventListener('resize', check);
  addEventListener('orientationchange', () => setTimeout(check, 250));
  if (window.visualViewport) { visualViewport.addEventListener('resize', check); visualViewport.addEventListener('scroll', check); }
  addEventListener('pageshow', check);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(check, 100); });
  setInterval(check, 500); // どのイベントも来ない端末のための見回り
  check();
  return { check };
}
