// 読み込み画面（進捗・失敗理由・再試行）と実行時エラーの表示。各ページの最初に通常の <script> で読む
(function () {
  const L = document.getElementById('loader');
  const bar = L && L.querySelector('.bar i');
  const msg = L && L.querySelector('.msg');
  const errEl = L && L.querySelector('.err');
  window.__owProgress = function (p, text) { if (bar) bar.style.width = Math.round(p * 100) + '%'; if (msg && text) msg.textContent = text; };
  window.__owReady = function () { if (L) L.remove(); };
  function fail(text) {
    if (!L || !document.body.contains(L)) {
      // 起動後のエラーは画面の端に小さく出す（遊びは止めない）
      let e = document.getElementById('rterr');
      if (!e) { e = document.createElement('div'); e.id = 'rterr'; e.style.cssText = 'position:absolute;left:8px;bottom:8px;max-width:60vw;font:11px monospace;color:#ff9aa0;background:rgba(0,0,0,.7);padding:4px 6px;z-index:30;white-space:pre-wrap;pointer-events:none'; document.body.appendChild(e); }
      e.textContent = 'エラー: ' + text; return;
    }
    if (errEl) errEl.textContent = '読み込みに失敗しました\n' + text;
    if (!L.querySelector('button')) {
      const b = document.createElement('button'); b.textContent = '再試行'; b.onclick = function () { location.reload(); }; L.appendChild(b);
    }
  }
  window.__owFail = fail;
  addEventListener('error', function (e) { fail((e.message || 'error') + (e.filename ? '\n' + e.filename.split('/').slice(-2).join('/') + ':' + e.lineno : '')); });
  addEventListener('unhandledrejection', function (e) { fail(String(e.reason && (e.reason.stack || e.reason.message) || e.reason)); });
  // 一定時間たっても起動しなければ理由を出す（無限ロードにしない）
  setTimeout(function () { if (L && document.body.contains(L) && !(errEl && errEl.textContent)) fail('起動に時間がかかっています（通信状態を確認して再試行してください）'); }, 20000);
  // iPad / iPhone Safari のピンチ・ダブルタップ拡大を止める（盤面がずれるのを防ぐ）
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) { document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false }); });
  let lastTouch = 0;
  document.addEventListener('touchend', function (e) { const n = Date.now(); if (n - lastTouch < 320) e.preventDefault(); lastTouch = n; }, { passive: false });
  document.addEventListener('touchmove', function (e) { if (e.touches.length > 1 || !e.target.closest('.menu')) e.preventDefault(); }, { passive: false });
})();
