// ===============================
// File: grid-ui-extras.js
// Purpose: Safely add extra controls to the header without causing layout squish or duplicates
// ===============================

(function () {
  const TOY_SELECTOR = '.toy-panel[data-toy="loopgrid"]';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  function init() {
    document.querySelectorAll(TOY_SELECTOR).forEach(attachExtras);

    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes && m.addedNodes.forEach((n) => {
          if (n.nodeType === 1 && n.matches && n.matches(TOY_SELECTOR)) {
            attachExtras(n);
          } else if (n.nodeType === 1) {
            n.querySelectorAll && n.querySelectorAll(TOY_SELECTOR).forEach(attachExtras);
          }
        });
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  function attachExtras(panel) {
    // This script's functionality has been superseded by the main `toyui.js`
    // module, which now correctly creates all necessary buttons ("Rnd Notes", "Clear")
    // for the loopgrid toy. To prevent duplicate buttons and layout issues,
    // we will disable this script's logic by returning early.
    return;

    const header = panel.querySelector(':scope > .toy-header');
    if (!header) return; // grid-advanced-ui will create one if needed

    const right = header.querySelector(':scope > .toy-controls-right') || createRightControls(header);

    // Ensure idempotency: do not create duplicates if hot reloaded
    let rnd = right.querySelector(':scope > .adv-only [data-role="random-notes"]');
    let clr = right.querySelector(':scope > .adv-only [data-role="clear-notes"]');

    if (!rnd || !clr) {
      let adv = right.querySelector(':scope > .adv-only');
      if (!adv) {
        adv = document.createElement('div');
        adv.className = 'adv-only';
        adv.style.display = 'inline-flex';
        adv.style.alignItems = 'center';
        adv.style.gap = '6px';
        right.appendChild(adv);
      }

      if (!rnd) {
        rnd = document.createElement('button');
        rnd.className = 'toy-btn';
        rnd.type = 'button';
        rnd.dataset.role = 'random-notes';
        rnd.textContent = 'Rnd Notes';
        rnd.style.padding = '6px 12px';
        rnd.style.lineHeight = '1.2';
        adv.appendChild(rnd);
      }

      if (!clr) {
        clr = document.createElement('button');
        clr.className = 'toy-btn';
        clr.type = 'button';
        clr.dataset.role = 'clear-notes';
        clr.textContent = 'Clear';
        clr.style.padding = '6px 12px';
        clr.style.lineHeight = '1.2';
        adv.appendChild(clr);
      }
    }

    // Respect zoom visibility if used
    const sync = () => {
      const adv = right.querySelector(':scope > .adv-only');
      if (!adv) return;
      const zoomed = panel.classList.contains('toy-zoomed');
      adv.style.display = zoomed ? 'inline-flex' : 'none';
    };
    sync();

    const mo = new MutationObserver(() => sync());
    mo.observe(panel, { attributes: true, attributeFilter: ['class'] });
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
})();