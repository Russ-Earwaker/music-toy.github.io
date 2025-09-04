// src/debug-overlay.js
(function(){
  const style = `
    .dbg-overlay{position:fixed;inset:auto 12px 12px 12px;background:#111a;color:#f88;
      font:12px/1.4 system-ui;padding:10px 12px;border:1px solid #f55a;border-radius:8px;
      max-height:45vh;overflow:auto;z-index:999999}
    .dbg-overlay h3{margin:0 0 6px 0;font-weight:600;color:#fff}
    .dbg-overlay pre{white-space:pre-wrap;margin:6px 0;color:#fee}
  `;
  const box = document.createElement('div');
  box.className = 'dbg-overlay';
  box.style.display = 'none';
  box.innerHTML = '<h3>Runtime errors</h3><div class="dbg-log"></div>';
  const styleEl = document.createElement('style'); styleEl.textContent = style;
  document.head.appendChild(styleEl);
  document.body.appendChild(box);
  const log = box.querySelector('.dbg-log');
  function show(msg){
    box.style.display = 'block';
    const pre = document.createElement('pre');
    pre.textContent = msg;
    log.appendChild(pre);
  }
  window.addEventListener('error', (e)=>{
    show(`[error] ${e.message}\n${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener('unhandledrejection', (e)=>{
    const r = e.reason;
    const msg = (r && (r.stack || r.message)) || String(r);
    show(`[unhandled] ${msg}`);
  });
})();
