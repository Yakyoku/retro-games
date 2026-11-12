// 実行時の例外を画面内に表示する（ブラウザの開発者ツールを開けない環境向け）。
// 通常の <script>（module ではない）として最初に読み込む。module の読み込み失敗も拾う。
(function () {
  'use strict';
  var box = null, list = [];
  function ensure() {
    if (box) return box;
    box = document.createElement('div');
    box.id = 'err-overlay';
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;max-height:45vh;overflow:auto;z-index:99999;' +
      'background:rgba(30,0,8,.94);color:#ffd7dd;font:13px/1.45 ui-monospace,Consolas,monospace;' +
      'border:1px solid #ff4d6d;border-radius:8px;padding:10px 12px;white-space:pre-wrap;box-shadow:0 8px 40px #000';
    var close = document.createElement('button');
    close.textContent = '×';
    close.style.cssText = 'position:sticky;top:0;float:right;background:#ff4d6d;color:#fff;border:0;border-radius:4px;font-size:16px;cursor:pointer;padding:0 8px';
    close.onclick = function () { box.style.display = 'none'; };
    box.appendChild(close);
    (document.body || document.documentElement).appendChild(box);
    return box;
  }
  function show(title, detail) {
    var msg = '[' + new Date().toLocaleTimeString() + '] ' + title + (detail ? '\n' + detail : '');
    list.push(msg);
    window.__errors = list;
    var add = function () { var b = ensure(); b.style.display = 'block'; var p = document.createElement('div');
      p.style.cssText = 'border-top:1px solid #6b1a2a;padding:6px 0'; p.textContent = msg; b.appendChild(p); };
    if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
  }
  window.addEventListener('error', function (e) {
    if (e.target && e.target !== window && (e.target.src || e.target.href)) {
      show('読み込み失敗: ' + (e.target.src || e.target.href)); return;
    }
    show('Error: ' + e.message, (e.error && e.error.stack) || (e.filename + ':' + e.lineno + ':' + e.colno));
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason; show('Unhandled rejection: ' + (r && r.message || r), r && r.stack);
  });
  window.__showError = show;
})();
