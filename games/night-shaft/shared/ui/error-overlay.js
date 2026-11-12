// 実行時エラーを画面に出す（白画面のまま止まらないように）。再読み込みボタンつき
export function installErrorOverlay(label) {
  const show = (msg) => {
    if (document.getElementById('err-overlay')) return;
    const d = document.createElement('div');
    d.id = 'err-overlay';
    d.setAttribute('role', 'alert');
    d.style.cssText = 'position:fixed;inset:auto 12px 12px 12px;z-index:9999;background:#2a0f14;color:#ffd7d7;border:1px solid #ff6b6b;border-radius:12px;padding:12px 14px;font:13px/1.5 system-ui,sans-serif;max-height:40vh;overflow:auto';
    d.innerHTML = `<b>${label}: 問題が起きました</b><br><code style="white-space:pre-wrap"></code><br><button style="margin-top:8px;padding:8px 14px;border-radius:8px;border:0;background:#ff6b6b;color:#200;font-weight:700">再読み込み</button>`;
    d.querySelector('code').textContent = String(msg).slice(0, 800);
    d.querySelector('button').onclick = () => location.reload();
    document.body.appendChild(d);
  };
  window.addEventListener('error', (e) => show(e.message + (e.filename ? `\n${e.filename}:${e.lineno}` : '')));
  window.addEventListener('unhandledrejection', (e) => show(e.reason && (e.reason.stack || e.reason.message) || e.reason));
  return show;
}
