// src/debug-hud.js
(function () {
  const shouldEnable = (() => {
    try {
      const params = new URLSearchParams(window.location.search || '');
      if (params.get('debugHUD') === '1') return true;
      return window.localStorage?.getItem('mt_debug_hud') === '1';
    } catch {
      return false;
    }
  })();

  if (!shouldEnable) {
    try {
      window.__HUD = { log() {}, refresh() {} };
    } catch {}
    return;
  }

  // --------- state ---------
  const BUF_MAX = 400;
  const buf = []; // store lines for copy

  // --------- DOM ---------
  const hud = document.createElement('div');
  hud.id = 'debugHUD';
  hud.setAttribute('role', 'log');
  hud.innerHTML = `
    <div> class="debugHUD-head">
      <strong>Debug HUD</strong>
      <div class="debugHUD-actions">
        <button type="button" id="debugHUDFullscreen">Force FS</button>
        <button type="button" id="debugHUDCopy">Copy</button>
        <button type="button" id="debugHUDClear">Clear</button>
      </div>
    </div>
    <div class="debugHUD-flags" id="debugHUDFlags"></div>
    <div class="debugHUD-body" id="debugHUDBody"></div>
    <div class="debugHUD-foot" id="debugHUDFoot"></div>
  `;

  function onReady(fn){ if (document.readyState === 'complete' || document.readyState === 'interactive') queueMicrotask(fn); else document.addEventListener('DOMContentLoaded', fn, { once: true }); }
  onReady(() => {
    document.body.appendChild(hud);
    document.getElementById('debugHUDClear')?.addEventListener('click', () => {
      const body = document.getElementById('debugHUDBody');
      if (body) body.innerHTML = '';
      buf.length = 0;
    });

    document.getElementById('debugHUDCopy')?.addEventListener('click', async () => {
      const footer = getFooterSnapshot();
      const text = buf.slice().join('\n') + '\n\n' + footer;
      try {
        await navigator.clipboard.writeText(text);
        print('Copied HUD logs to clipboard');
      } catch {
        // fallback: show a prompt for manual copy
        print('Clipboard write failed; opening prompt');
        window.prompt('Copy logs:', text);
      }
    });

    document.getElementById('debugHUDFullscreen')?.addEventListener('click', () => {
      print('Force pseudo-fullscreen pressed');
      document.documentElement.classList.add('pseudo-fullscreen');
      // fire a couple of resizes to make canvases refit on iOS
      setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
      updateFlags(); updateFooter();
    });

    updateFlags();
    updateFooter();
  });

  // --------- helpers ---------
  function pad(n, w = 2) { return String(n).padStart(w, '0'); }
  function ts() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3,'0')}`;
  }

  function print(line) {
    const body = document.getElementById('debugHUDBody');
    if (!body) return;
    const msg = `[${ts()}] ${line}`;
    const div = document.createElement('div');
    div.className = 'debugHUD-line';
    div.textContent = msg;
    body.prepend(div);
    buf.push(msg);
    while (body.childNodes.length > 120) body.removeChild(body.lastChild);
    while (buf.length > BUF_MAX) buf.shift();
  }

  function getDetect() {
    const ua = navigator.userAgent || '';
    const plat = navigator.platform || '';
    const touchCapable = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isIpadOSMacUA = ua.includes('Mac OS X') && touchCapable;
    const isIOS = /iPad|iPhone|iPod/.test(plat) || /iPad|iPhone|iPod/.test(ua) || isIpadOSMacUA;
    const canRealFullscreen = !isIOS && (
      document.fullscreenEnabled || document.webkitFullscreenEnabled || document.msFullscreenEnabled
    );
    const inRealFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
    const pseudoFS = document.documentElement.classList.contains('pseudo-fullscreen');
    const vv = window.visualViewport;
    const vw = Math.round((vv?.width || window.innerWidth));
    const vh = Math.round((vv?.height || window.innerHeight));
    return { ua, plat, touchCapable, isIOS, canRealFullscreen, inRealFS, pseudoFS, vw, vh };
  }

  function getFooterSnapshot() {
    const d = getDetect();
    return [
      `UA: ${d.ua}`,
      `Plat: ${d.plat}`,
      `touchCapable=${d.touchCapable} isIOS=${d.isIOS} canRealFS=${d.canRealFullscreen}`,
      `vw×vh=${d.vw}×${d.vh}  realFS=${d.inRealFS}  pseudoFS=${d.pseudoFS}`,
      `html.class="${document.documentElement.className}"`
    ].join('\n');
  }

  function updateFooter() {
    const foot = document.getElementById('debugHUDFoot');
    if (!foot) return;
    foot.innerHTML = getFooterSnapshot().replace(/\n/g, '<br/>');
  }

  function updateFlags() {
    const flags = document.getElementById('debugHUDFlags');
    if (!flags) return;
    const d = getDetect();
    flags.innerHTML = `
      <span class="flag ${d.isIOS ? 'on':'off'}">iOS</span>
      <span class="flag ${d.canRealFullscreen ? 'on':'off'}">RealFS</span>
      <span class="flag ${d.inRealFS ? 'on':'off'}">InReal</span>
      <span class="flag ${d.pseudoFS ? 'on':'off'}">PseudoFS</span>
    `;
  }

  // --------- instrument the FS button (capture) ---------
  function wireFSButton() {
    const btn = document.getElementById('fullscreenBtn');
    if (!btn) return false;

    const cap = true;
    ['touchstart','pointerdown','pointerup','click'].forEach(evt => {
      btn.addEventListener(evt, (e) => {
        const pe = (typeof e.defaultPrevented === 'boolean') ? e.defaultPrevented : false;
        print(`FSBtn ${evt} (defaultPrevented=${pe})`);
        setTimeout(() => { updateFlags(); updateFooter(); }, 30);
      }, { capture: cap, passive: true });
    });
    return true;
  }

  // track global events too
  const rel = () => setTimeout(() => { print('event: fullscreenchange'); updateFlags(); updateFooter(); }, 0);
  ['fullscreenchange','webkitfullscreenchange','MSFullscreenChange'].forEach(evt => {
    document.addEventListener(evt, rel);
  });
  window.addEventListener('resize', () => { print('event: resize'); updateFlags(); updateFooter(); }, { passive: true });
  window.addEventListener('orientationchange', () => { print('event: orientationchange'); updateFlags(); updateFooter(); }, { passive: true });
  document.addEventListener('readystatechange', () => { print(`readyState=${document.readyState}`); updateFlags(); updateFooter(); });

  // hook app’s FS module if present
  const tryHookFS = () => {
    const fs = window.__Fullscreen;
    if (!fs || fs.__debugHUDHooked) return;
    fs.__debugHUDHooked = true;
    const enter = fs.enter?.bind(fs);
    const exit  = fs.exit?.bind(fs);
    if (enter) fs.enter = (...args) => { print('FS.enter() called'); const r = enter(...args); setTimeout(() => { updateFlags(); updateFooter(); }, 30); return r; };
    if (exit)  fs.exit  = (...args) => { print('FS.exit() called');  const r = exit(...args);  setTimeout(() => { updateFlags(); updateFooter(); }, 30); return r; };
  };

  function boot() {
    wireFSButton();
    tryHookFS();
    updateFlags(); updateFooter();
    print('HUD ready');
    setInterval(() => { updateFlags(); updateFooter(); }, 1000);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });

  // expose
  window.__HUD = { log: print, refresh: () => { updateFlags(); updateFooter(); } };
})();
