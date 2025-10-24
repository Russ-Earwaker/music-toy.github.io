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
    // Force wrap to the body's layout size (ignores transforms)
    wrap.style.width  = body.clientWidth  + 'px';
    wrap.style.height = body.clientHeight + 'px';
  }

  function applyAll() {
    document.querySelectorAll('.toy-panel[data-toy="drawgrid"]').forEach(applyOne);
  }

  let raf = 0;
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(applyAll); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAll, { once: true });
  } else {
    applyAll();
  }

  try {
    const ro = new ResizeObserver(schedule);
    document.querySelectorAll('.toy-panel[data-toy="drawgrid"] .toy-body')
      .forEach(el => ro.observe(el));
  } catch {}
})();