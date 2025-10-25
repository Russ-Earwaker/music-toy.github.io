// src/drawgrid-fit.js
// Make Draw Grid measure from layout pixels (transform-immune), like rippler/bouncer.
(function () {
  function getBody(panel) { return panel.querySelector('.toy-body') || panel; }
  function getWrap(body) {
    let wrap = body.querySelector('.drawgrid-size-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'drawgrid-size-wrap';
      wrap.style.position = 'relative';
      wrap.style.width = '100%';
      wrap.style.height = '100%';
      wrap.style.overflow = 'hidden';
      // Move existing canvases into the wrap on first run
      [...body.childNodes].forEach(n => {
        if (n.nodeType === 1) wrap.appendChild(n);
      });
      body.appendChild(wrap);
    }
    return wrap;
  }

  function applyOne(panel) {
    const body = getBody(panel);
    const wrap = getWrap(body);
    // Measure with offsetWidth/offsetHeight (transform-immune)
    const w = body.offsetWidth;
    const h = body.offsetHeight;
    wrap.style.width  = w + 'px';
    wrap.style.height = h + 'px';
  }

  function applyAll() {
    document.querySelectorAll('.toy-panel[data-toy="drawgrid"]').forEach(applyOne);
  }

  let raf = 0;
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(applyAll); };

  function init() {
    applyAll(); // Apply to any toys that already exist

    // Wire to board scale changes
    window.addEventListener('board:scale', schedule);

    // Add listener for visibilitychange (resume tab)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) schedule();
    });

    // Optional: fullscreenchange
    document.addEventListener('fullscreenchange', schedule);

    // Also listen to window resize
    window.addEventListener('resize', schedule);

    try {
      const ro = new ResizeObserver(schedule);
      
      // Observe existing toys' bodies
      document.querySelectorAll('.toy-panel[data-toy="drawgrid"] .toy-body')
        .forEach(el => ro.observe(el));

      // Observe board for new drawgrid toys
      const board = document.getElementById('board');
      if (board) {
        const mo = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === 1 && node.matches('.toy-panel[data-toy="drawgrid"]')) {
                // Run fit logic on the new toy
                applyOne(node);
                // Observe the new toy for resizes
                const body = getBody(node);
                if (body) ro.observe(body);
              }
            }
          }
        });
        mo.observe(board, { childList: true });
      }
    } catch(e) {
      console.error('drawgrid-fit failed to init observers', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
