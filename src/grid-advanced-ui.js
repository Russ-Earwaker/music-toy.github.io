// ===============================
// File: grid-advanced-ui.js
// Purpose: Make the header creation idempotent and de-dupe accidental double headers
// Scope: Minimal, DOM-only. No external imports required.
// ===============================

(function () {
  const TOY_SELECTOR = '.toy-panel[data-toy="loopgrid"]';

  // Run once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  function init() {
    document.querySelectorAll(TOY_SELECTOR).forEach(ensureSingleHeaderForPanel);

    // In case panels are mounted dynamically later (e.g., hot-reloads or lazy renders)
    const rootObs = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes && m.addedNodes.forEach((n) => {
          if (n.nodeType === 1 && n.matches && n.matches(TOY_SELECTOR)) {
            ensureSingleHeaderForPanel(n);
          } else if (n.nodeType === 1) {
            n.querySelectorAll && n.querySelectorAll(TOY_SELECTOR).forEach(ensureSingleHeaderForPanel);
          }
        });
      }
    });
    rootObs.observe(document.documentElement, { childList: true, subtree: true });
  }

  function ensureSingleHeaderForPanel(panel) {
    // 1) If multiple headers exist, prefer a non-auto header; otherwise keep the first and remove the rest
    dedupeHeaders(panel);

    // 2) If no header exists yet, create a temporary auto header, but also watch for a real one
    let header = panel.querySelector(':scope > .toy-header');
    if (!header) {
      header = createAutoHeader(panel);
      panel.insertBefore(header, panel.firstElementChild || null);

      // Observe the panel for a subsequently injected real header
      const obs = new MutationObserver(() => {
        const headers = panel.querySelectorAll(':scope > .toy-header');
        const real = Array.from(headers).find((h) => !h.hasAttribute('data-autoheader'));
        const auto = Array.from(headers).find((h) => h.hasAttribute('data-autoheader'));
        if (real && auto && real !== auto) {
          // Move any right-controls children we added into the real header if the real lacks them
          const autoRight = auto.querySelector('.toy-controls-right');
          if (autoRight) {
            const realRight = real.querySelector('.toy-controls-right') || createRightControls(real);
            // migrate known children (adv-only group, buttons we injected, etc.)
            Array.from(autoRight.children).forEach((ch) => realRight.appendChild(ch));
          }
          auto.remove();
          obs.disconnect();
        }
      });
      obs.observe(panel, { childList: true, subtree: false });

      // Give late renderers a chance before we lock in layout
      requestAnimationFrame(() => dedupeHeaders(panel));
    }

    // 3) Ensure a right-controls container exists so content does not pile left and collapse
    ensureRightControls(header || panel.querySelector(':scope > .toy-header'));

    // 4) Make the injected advanced-only group layout stable (no vertical squish)
    ensureAdvOnlyGroup(panel);
  }

  function dedupeHeaders(panel) {
    const headers = Array.from(panel.querySelectorAll(':scope > .toy-header'));
    if (headers.length <= 1) return;

    const real = headers.find((h) => !h.hasAttribute('data-autoheader'));
    if (real) {
      headers.forEach((h) => {
        if (h !== real) h.remove();
      });
      return;
    }
    // No real header? Keep the first auto and remove others
    const keep = headers[0];
    headers.slice(1).forEach((h) => h.remove());
  }

  function createAutoHeader(panel) {
    const header = document.createElement('div');
    header.className = 'toy-header';
    header.setAttribute('data-autoheader', 'true');
    // Minimal, robust layout so buttons do not compress even if global CSS is missing or overridden
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.gap = '10px';
    header.style.padding = '8px 10px';
    header.style.zIndex = '20';

    const title = panel.querySelector(':scope > .toy-title') || document.createElement('div');
    if (!title.classList.contains('toy-title')) {
      title.className = 'toy-title';
      title.textContent = panel.getAttribute('data-title') || 'Drum';
    }

    const right = createRightControls(header);

    header.appendChild(title);
    header.appendChild(right);
    return header;
  }

  function createRightControls(header) {
    const right = document.createElement('div');
    right.className = 'toy-controls-right';
    right.style.display = 'inline-flex';
    right.style.alignItems = 'center';
    right.style.gap = '8px';
    header.appendChild(right);
    return right;
  }

  function ensureRightControls(header) {
    if (!header) return;
    let right = header.querySelector(':scope > .toy-controls-right');
    if (!right) right = createRightControls(header);
    // Protect against CSS resets that strip line-height and padding
    right.style.display = 'inline-flex';
    right.style.alignItems = 'center';
  }

  function ensureAdvOnlyGroup(panel) {
    const header = panel.querySelector(':scope > .toy-header');
    if (!header) return;
    const right = header.querySelector(':scope > .toy-controls-right') || createRightControls(header);

    let adv = right.querySelector(':scope > .adv-only');
    if (!adv) {
      adv = document.createElement('div');
      adv.className = 'adv-only';
      adv.style.display = 'inline-flex';
      adv.style.alignItems = 'center';
      adv.style.gap = '6px';
      right.appendChild(adv);
    }

    // Ensure presence of placeholders (Random and Clear) only once; behavior is handled elsewhere
    if (!adv.querySelector('[data-role="random-notes"]')) {
      const rnd = document.createElement('button');
      rnd.className = 'toy-btn';
      rnd.type = 'button';
      rnd.dataset.role = 'random-notes';
      rnd.textContent = 'Rnd Notes';
      // Local padding in case global CSS is overridden
      rnd.style.padding = '6px 12px';
      rnd.style.lineHeight = '1.2';
      adv.appendChild(rnd);
    }

    if (!adv.querySelector('[data-role="clear-notes"]')) {
      const clr = document.createElement('button');
      clr.className = 'toy-btn';
      clr.type = 'button';
      clr.dataset.role = 'clear-notes';
      clr.textContent = 'Clear';
      clr.style.padding = '6px 12px';
      clr.style.lineHeight = '1.2';
      adv.appendChild(clr);
    }

    // Toggle visibility based on zoom state if the project uses .toy-zoomed
    const sync = () => {
      const zoomed = panel.classList.contains('toy-zoomed');
      adv.style.display = zoomed ? 'inline-flex' : 'none';
    };
    sync();

    // Observe zoom class changes
    const mo = new MutationObserver(() => sync());
    mo.observe(panel, { attributes: true, attributeFilter: ['class'] });
  }
})();