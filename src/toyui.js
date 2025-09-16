// src/toyui.js — panel chrome + events (<=300 lines)
import { zoomInPanel, zoomOutPanel } from './zoom-overlay.js';
import { getInstrumentNames } from './audio-samples.js';
import { installVolumeUI } from './volume-ui.js';
import { getIdForDisplayName, getDisplayNameForId, getAllIds } from './instrument-catalog.js';
import { openInstrumentPicker } from './instrument-picker.js';

const $ = (sel, root=document)=> root.querySelector(sel);

function ensureHeader(panel, titleText){
  let header = panel.querySelector('.toy-header');
  if (!header){
    header = document.createElement('div'); header.className = 'toy-header';
    header.setAttribute('data-drag-handle', '1'); // Make the whole header draggable
    const left = document.createElement('div'); left.className = 'toy-title'; left.textContent = '';
    const right = document.createElement('div'); right.className = 'toy-controls-right';
    header.append(left, right); panel.prepend(header);
  } else {
    // Ensure existing headers are also draggable and not just the title.
    if (!header.hasAttribute('data-drag-handle')) {
      header.setAttribute('data-drag-handle', '1');
      const title = header.querySelector('.toy-title[data-drag-handle]');
      if (title) title.removeAttribute('data-drag-handle');
    }
  }
  return header;
}

function ensureBody(panel){
  if (!panel.querySelector('.toy-body')){
    const body = document.createElement('div'); body.className='toy-body'; panel.appendChild(body);
  }
}

function ensureFooter(panel){
  let footer = panel.querySelector('.toy-footer');
  if (!footer){ footer = document.createElement('div'); footer.className='toy-footer'; panel.appendChild(footer); }
  return footer;
}

/**
 * Formats an instrument ID (like 'acoustic_guitar' or 'PianoMiddleC')
 * into a human-readable "Title Case" string.
 */
function toTitleCase(str) {
  if (!str) return '';
  return String(str)
    .replace(/[_-]/g, ' ') // a_b -> a b
    .replace(/([a-z])([A-Z])/g, '$1 $2') // aB -> a B
    .replace(/\b\w/g, char => char.toUpperCase());
}

function btn(label){ const b=document.createElement('button'); b.type='button'; b.className='toy-btn'; b.textContent=label; return b; }

function buildInstrumentSelect(panel){
  let sel = panel.querySelector('select.toy-instrument');
  const header = ensureHeader(panel);
  const right = header.querySelector('.toy-controls-right');

  if (!sel){
    sel = document.createElement('select'); sel.className = 'toy-instrument'; sel.title = 'Instrument';
    // shown only in Advanced via CSS
    right.appendChild(sel);
  }

  // (Population handled by ensure-advanced.js after samples-ready)
  // We only wire the change event here.
  if (!sel.__wired){
    sel.__wired = true;
    sel.addEventListener('change', ()=>{
      const value = sel.value;
      panel.dataset.instrument = value;
      try{ panel.dispatchEvent(new CustomEvent('toy-instrument', { detail:{ value }, bubbles:true })); }catch{}
      try{ panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name:value, value }, bubbles:true })); }catch{}
    });
  }
  return sel;
}

export function initToyUI(panel, { toyName, defaultInstrument }={}){
  if (!panel) return null;
  const toyKind = String(panel.dataset.toy||'').toLowerCase();
  const header = ensureHeader(panel, toyName);
  ensureBody(panel);
  const footer = ensureFooter(panel);

  // Get header height for positioning external buttons. This must be read after
  // the header is in the DOM and has its content.
  const headerHeight = header.offsetHeight;

  // --- Instrument Name Display ---
  // This element shows the current instrument name above the header.
  let instDisplay = panel.querySelector(':scope > .toy-instrument-display');
  if (!instDisplay) {
    instDisplay = document.createElement('div');
    instDisplay.className = 'toy-instrument-display';
    Object.assign(instDisplay.style, {
      position: 'absolute',
      top: '-26px',
      right: '10px',
      background: 'rgba(0, 0, 0, 0.6)',
      color: 'white',
      fontWeight: 'bold',
      padding: '4px 10px',
      borderRadius: '6px',
      fontSize: '12px',
      pointerEvents: 'none',
      zIndex: '10',
      border: '1px solid rgba(255,255,255,0.1)'
    });
    panel.appendChild(instDisplay);
    panel.style.overflow = 'visible'; // Ensure the display isn't clipped.
  }

  // Centrally install the volume UI for every toy.
  installVolumeUI(footer);

  // Controls
  const right = header.querySelector('.toy-controls-right');
  const left = header.querySelector('.toy-title');

  // Advanced / Close buttons
  if (toyKind === 'loopgrid' || toyKind === 'bouncer' || toyKind === 'rippler' || toyKind === 'chordwheel' || toyKind === 'drawgrid') {
    // For the Drum Toy and Bouncer, use the new circular "Edit" button, positioned outside the panel.
    // We append it to the panel itself, not the header.

    // --- FIX: Set overflow directly to prevent clipping of the external button ---
    panel.style.setProperty('overflow', 'visible', 'important');

    if (!panel.querySelector(':scope > .toy-mode-btn[data-action="advanced"]')) {
        const editBtn = document.createElement('button');
        editBtn.className = 'c-btn toy-mode-btn'; editBtn.dataset.action = 'advanced'; editBtn.title = 'Edit Mode';
        // Apply positioning directly via inline styles for maximum robustness against CSS conflicts.
        const btnSize = 96;
        editBtn.style.position = 'absolute';
        editBtn.style.top = `${headerHeight - 40}px`;
        editBtn.style.left = '-48px';
        editBtn.style.zIndex = '5';
        editBtn.style.setProperty('--c-btn-size', `${btnSize}px`);
        editBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonEdit.png');"></div>`;
        panel.appendChild(editBtn);
    }
    if (!panel.querySelector(':scope > .toy-mode-btn[data-action="close-advanced"]')) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'c-btn toy-mode-btn'; closeBtn.dataset.action = 'close-advanced'; closeBtn.title = 'Close Edit Mode';
        const btnSize = 96;
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = `${headerHeight - 40}px`; // Match the edit button's vertical position
        closeBtn.style.left = '-48px';
        closeBtn.style.zIndex = '5';
        closeBtn.style.setProperty('--c-btn-size', `${btnSize}px`);
        closeBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow" style="--accent: #f87171;"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonClose.png');"></div>`;
        panel.appendChild(closeBtn);
    }
  } else {
      if (!right.querySelector('[data-action="advanced"]')) { const advBtn = btn('Advanced'); advBtn.dataset.action = 'advanced'; right.prepend(advBtn); }
      if (!right.querySelector('[data-action="close-advanced"]')) { const closeBtn = btn('Close'); closeBtn.dataset.action = 'close-advanced'; right.prepend(closeBtn); }
  }

  // Random / Clear buttons (delegated elsewhere)
  if (toyKind === 'loopgrid') {
    // For loopgrid, Random and Clear buttons are circular and inside the header on the left.
    // First, remove any old external buttons to be safe.
    panel.querySelectorAll(':scope > .loopgrid-mode-btn[data-action="random"], :scope > .loopgrid-mode-btn[data-action="clear"]').forEach(btn => btn.remove());

    // The "Random Blocks" button randomizes the step sequence.
    // It is visible in both standard and advanced modes.
    let randomBtn = left.querySelector('[data-action="random"]');
    if (!randomBtn) {
      randomBtn = document.createElement('button');
      randomBtn.className = 'c-btn';
      randomBtn.dataset.action = 'random';
      // Title and icon are set dynamically based on view mode.
      randomBtn.style.setProperty('--c-btn-size', '65px');
      randomBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonRandom.png');"></div>`;
      left.appendChild(randomBtn);
    }

    // The "Random Notes" button randomizes pitches and is only visible in advanced mode.
    let randomNotesBtn = left.querySelector('[data-action="random-notes"]');
    if (!randomNotesBtn) {
        randomNotesBtn = document.createElement('button');
        randomNotesBtn.className = 'c-btn';
        randomNotesBtn.dataset.action = 'random-notes';
        randomNotesBtn.title = 'Random Notes';
        randomNotesBtn.style.setProperty('--c-btn-size', '65px');
        randomNotesBtn.style.marginLeft = '10px';
        randomNotesBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonRandomNotes.png');"></div>`;
        left.appendChild(randomNotesBtn);
    }

    // The "Clear" button is to the right of the random buttons.
    if (!left.querySelector('[data-action="clear"]')) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'c-btn';
      clearBtn.dataset.action = 'clear';
      clearBtn.title = 'Clear';
      clearBtn.style.setProperty('--c-btn-size', '65px');
      clearBtn.style.setProperty('--accent', '#f87171');
      clearBtn.style.marginLeft = '10px'; // Add a small margin to nudge it to the right.
      clearBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonClear.png');"></div>`;
      left.appendChild(clearBtn);
    }

    // Apply margin directly via inline style for maximum robustness against CSS overrides.
    // This creates the space needed to avoid the external "Edit" button.
    left.style.setProperty('margin-left', '47px', 'important');

    // Visibility logic for advanced-only buttons and dynamic icons.
    const updateVisibility = () => {
        const isAdvanced = panel.classList.contains('toy-zoomed');
        if (randomNotesBtn) randomNotesBtn.style.display = isAdvanced ? 'inline-block' : 'none';

        // Update the main random button's icon and title based on the mode.
        if (randomBtn) {
            const iconEl = randomBtn.querySelector('.c-btn-core');
            if (isAdvanced) {
                randomBtn.title = 'Random Blocks';
                if (iconEl) iconEl.style.setProperty('--c-btn-icon-url', `url('../assets/UI/T_ButtonRandomBlocks.png')`);
            } else {
                randomBtn.title = 'Random';
                if (iconEl) iconEl.style.setProperty('--c-btn-icon-url', `url('../assets/UI/T_ButtonRandom.png')`);
            }
        }
    };
    updateVisibility();
    panel.addEventListener('toy-zoom', updateVisibility);
  } else {
    // For other toys, use standard buttons
    if (!right.querySelector('[data-action="random"]')) {
      // Bouncer gets a special icon button for its standard "Random" (new ball) action.
      // Bouncer handles its own buttons entirely within its specific block.
      if (toyKind !== 'bouncer' && toyKind !== 'rippler' && toyKind !== 'chordwheel' && toyKind !== 'drawgrid') {
        const b = btn('Random'); b.dataset.action = 'random'; right.appendChild(b);
      }
    }
    if (!right.querySelector('[data-action="clear"]')) {
      if (toyKind !== 'bouncer' && toyKind !== 'rippler' && toyKind !== 'chordwheel' && toyKind !== 'drawgrid') { // Bouncer, Rippler, Chordwheel, and DrawGrid get a special clear button on the left
        const clearBtn = document.createElement('button');
        clearBtn.className = 'c-btn';
        clearBtn.dataset.action = 'clear';
        clearBtn.title = 'Clear';
        clearBtn.style.setProperty('--c-btn-size', '38px');
        clearBtn.style.setProperty('--accent', '#f87171'); // Red accent for a destructive action
        clearBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonClear.png');"></div>`;
        right.appendChild(clearBtn);
      }
    }
  }

  // Drum-specific "Random Notes" button
  // This is now handled inside the main `if (toyKind === 'loopgrid')` block above.

  // Rippler advanced-only buttons: Random Notes + Random Blocks
  if (toyKind === 'rippler') {
    const left = header.querySelector('.toy-title');
    left.style.setProperty('margin-left', '47px', 'important');

    const editBtn = panel.querySelector(':scope > .toy-mode-btn[data-action="advanced"]');
    const closeBtn = panel.querySelector(':scope > .toy-mode-btn[data-action="close-advanced"]');

    const BTN_SIZE = '65px';

    // Standard-view "Random" button
    let randomBtn = left.querySelector('[data-action="random"]');
    if (!randomBtn) {
      randomBtn = document.createElement('button');
      randomBtn.className = 'c-btn';
      randomBtn.dataset.action = 'random';
      randomBtn.title = 'Random';
      randomBtn.style.setProperty('--c-btn-size', BTN_SIZE);
      randomBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonRandom.png');"></div>`;
      left.appendChild(randomBtn);
    }

    // Advanced-view "Random Blocks" button
    let randomBlocksBtn = left.querySelector('[data-action="random-blocks"]');
    if (!randomBlocksBtn) {
      randomBlocksBtn = document.createElement('button');
      randomBlocksBtn.className = 'c-btn';
      randomBlocksBtn.dataset.action = 'random-blocks';
      randomBlocksBtn.title = 'Random Blocks';
      randomBlocksBtn.style.setProperty('--c-btn-size', BTN_SIZE);
      randomBlocksBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonRandomBlocks.png');"></div>`;
      left.appendChild(randomBlocksBtn);
    }

    // Advanced-view "Random Notes" button
    let randomNotesBtn = left.querySelector('[data-action="random-notes"]');
    if (!randomNotesBtn) {
      randomNotesBtn = document.createElement('button');
      randomNotesBtn.className = 'c-btn';
      randomNotesBtn.dataset.action = 'random-notes';
      randomNotesBtn.title = 'Random Notes';
      randomNotesBtn.style.setProperty('--c-btn-size', BTN_SIZE);
      randomNotesBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonRandomNotes.png');"></div>`;
      left.appendChild(randomNotesBtn);
    }

    // "Clear" button (visible in both modes)
    let clearBtn = left.querySelector('[data-action="clear"]');
    if (!clearBtn) {
      clearBtn = document.createElement('button');
      clearBtn.className = 'c-btn';
      clearBtn.dataset.action = 'clear';
      clearBtn.title = 'Clear';
      clearBtn.style.setProperty('--c-btn-size', BTN_SIZE);
      clearBtn.style.setProperty('--accent', '#f87171');
      clearBtn.style.marginLeft = '10px';
      clearBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonClear.png');"></div>`;
      left.appendChild(clearBtn);
    }

    const updateVisibility = () => {
      const isAdvanced = panel.classList.contains('toy-zoomed');
      if (randomBtn) randomBtn.style.display = isAdvanced ? 'none' : 'inline-block';
      if (randomBlocksBtn) randomBlocksBtn.style.display = isAdvanced ? 'inline-block' : 'none';
      if (randomNotesBtn) randomNotesBtn.style.display = isAdvanced ? 'inline-block' : 'none';
      if (clearBtn) clearBtn.style.display = 'inline-block';

      // Margins
      if (randomBlocksBtn) randomBlocksBtn.style.marginLeft = '';
      if (randomNotesBtn) randomNotesBtn.style.marginLeft = '10px';

      if (editBtn) editBtn.style.display = isAdvanced ? 'none' : 'block';
      if (closeBtn) closeBtn.style.display = isAdvanced ? 'block' : 'none';
    };
    updateVisibility();
    panel.addEventListener('toy-zoom', updateVisibility);

    // --- Logic for external controls in Advanced mode ---
    let externalHost = panel.querySelector('.rippler-external-controls');
    if (!externalHost) {
      externalHost = document.createElement('div');
      externalHost.className = 'rippler-external-controls';
      Object.assign(externalHost.style, {
        position: 'absolute', right: '-160px', top: '50%', transform: 'translateY(-50%)',
        display: 'none', flexDirection: 'column', gap: '10px', zIndex: '10', width: '150px',
      });
      panel.appendChild(externalHost);
    }

    const moveRipplerControls = () => {
      const isAdvanced = panel.classList.contains('toy-zoomed');
      const headerRight = panel.querySelector('.toy-header .toy-controls-right');
      const quantCtrl = panel.querySelector('[class*="quant-ctrl"]');

      if (isAdvanced) {
        if (quantCtrl) externalHost.appendChild(quantCtrl);
        externalHost.style.display = 'flex';
      } else {
        if (headerRight && quantCtrl) headerRight.appendChild(quantCtrl);
        externalHost.style.display = 'none';
      }
    };

    // The control is added by another script. We watch for it to appear in the DOM.
    const mo = new MutationObserver(() => {
      const quantCtrl = panel.querySelector('[class*="quant-ctrl"]');
      if (quantCtrl) {
        moveRipplerControls(); // Move it to its initial correct place
        mo.disconnect(); // We found it, stop observing.
      }
    });
    mo.observe(panel, { childList: true, subtree: true });
    panel.addEventListener('toy-zoom', moveRipplerControls);
  }

  // Chordwheel UI
  if (toyKind === 'chordwheel') {
    const left = header.querySelector('.toy-title');
    left.style.setProperty('margin-left', '47px', 'important');

    const editBtn = panel.querySelector(':scope > .toy-mode-btn[data-action="advanced"]');
    const closeBtn = panel.querySelector(':scope > .toy-mode-btn[data-action="close-advanced"]');

    const BTN_SIZE = '65px';

    // "Random" button. Icon changes based on mode.
    let randomBtn = left.querySelector('[data-action="random"]');
    if (!randomBtn) {
      randomBtn = document.createElement('button');
      randomBtn.className = 'c-btn';
      randomBtn.dataset.action = 'random';
      randomBtn.style.setProperty('--c-btn-size', BTN_SIZE);
      randomBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonRandom.png');"></div>`;
      left.appendChild(randomBtn);
    }

    // "Clear" button
    let clearBtn = left.querySelector('[data-action="clear"]');
    if (!clearBtn) {
      clearBtn = document.createElement('button');
      clearBtn.className = 'c-btn';
      clearBtn.dataset.action = 'clear';
      clearBtn.title = 'Clear';
      clearBtn.style.setProperty('--c-btn-size', BTN_SIZE);
      clearBtn.style.setProperty('--accent', '#f87171');
      clearBtn.style.marginLeft = '10px';
      clearBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonClear.png');"></div>`;
      left.appendChild(clearBtn);
    }

    const updateVisibility = () => {
      const isAdvanced = panel.classList.contains('toy-zoomed');
      // Update the main random button's icon and title based on the mode.
      if (randomBtn) {
          const iconEl = randomBtn.querySelector('.c-btn-core');
          if (isAdvanced) {
              randomBtn.title = 'Randomize';
              if (iconEl) iconEl.style.setProperty('--c-btn-icon-url', `url('../assets/UI/T_ButtonRandomBlocks.png')`);
          } else {
              randomBtn.title = 'Randomize';
              if (iconEl) iconEl.style.setProperty('--c-btn-icon-url', `url('../assets/UI/T_ButtonRandom.png')`);
          }
      }
      if (editBtn) editBtn.style.display = isAdvanced ? 'none' : 'block';
      if (closeBtn) closeBtn.style.display = isAdvanced ? 'block' : 'none';
    };
    updateVisibility();
    panel.addEventListener('toy-zoom', updateVisibility);
  }

  // DrawGrid UI
  if (toyKind === 'drawgrid') {
    const left = header.querySelector('.toy-title');
    if (!left) {
      console.warn('[toyui] Could not find .toy-title for drawgrid to add buttons.');
      return; // Can't add buttons if the container doesn't exist.
    }
    left.style.setProperty('margin-left', '47px', 'important');

    const editBtn = panel.querySelector(':scope > .toy-mode-btn[data-action="advanced"]');
    const closeBtn = panel.querySelector(':scope > .toy-mode-btn[data-action="close-advanced"]');

    const BTN_SIZE = '65px';

    // Standard-view "Random" button
    let randomBtn = left.querySelector('[data-action="random"]');
    if (!randomBtn) {
      randomBtn = document.createElement('button');
      randomBtn.className = 'c-btn';
      randomBtn.title = 'Randomize';
      randomBtn.dataset.action = 'random';
      randomBtn.style.setProperty('--c-btn-size', BTN_SIZE);
      randomBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonRandom.png');"></div>`;
      left.appendChild(randomBtn);
    }

    // Advanced-view "Random Blocks" button
    let randomBlocksBtn = left.querySelector('[data-action="random-blocks"]');
    if (!randomBlocksBtn) {
        randomBlocksBtn = document.createElement('button');
        randomBlocksBtn.className = 'c-btn';
        randomBlocksBtn.dataset.action = 'random-blocks';
        randomBlocksBtn.title = 'Random Blocks';
        randomBlocksBtn.style.setProperty('--c-btn-size', BTN_SIZE);
        randomBlocksBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonRandomBlocks.png');"></div>`;
        left.appendChild(randomBlocksBtn);
    }

    // Advanced-view "Random Notes" button
    let randomNotesBtn = left.querySelector('[data-action="random-notes"]');
    if (!randomNotesBtn) {
        randomNotesBtn = document.createElement('button');
        randomNotesBtn.className = 'c-btn';
        randomNotesBtn.dataset.action = 'random-notes';
        randomNotesBtn.title = 'Random Notes';
        randomNotesBtn.style.setProperty('--c-btn-size', BTN_SIZE);
        randomNotesBtn.style.marginLeft = '10px';
        randomNotesBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonRandomNotes.png');"></div>`;
        left.appendChild(randomNotesBtn);
    }

    // "Clear" button
    let clearBtn = left.querySelector('[data-action="clear"]');
    if (!clearBtn) {
      clearBtn = document.createElement('button');
      clearBtn.className = 'c-btn';
      clearBtn.dataset.action = 'clear';
      clearBtn.title = 'Clear';
      clearBtn.style.setProperty('--c-btn-size', BTN_SIZE);
      clearBtn.style.setProperty('--accent', '#f87171');
      clearBtn.style.marginLeft = '10px';
      clearBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonClear.png');"></div>`;
      left.appendChild(clearBtn);
    }

    // Eraser button (specific to drawgrid, on the right)
    const right = header.querySelector('.toy-controls-right');
    if (right && !right.querySelector('[data-erase]')) {
      const eraserBtn = document.createElement('button');
      eraserBtn.className = 'c-btn';
      eraserBtn.dataset.erase = '1';
      eraserBtn.title = 'Eraser';
      eraserBtn.style.setProperty('--c-btn-size', '65px');
      eraserBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonEraser.png');"></div>`;
      right.appendChild(eraserBtn);
    }

    const updateVisibility = () => {
      const isAdvanced = panel.classList.contains('toy-zoomed');
      if (editBtn) editBtn.style.display = isAdvanced ? 'none' : 'block';
      if (closeBtn) closeBtn.style.display = isAdvanced ? 'block' : 'none';
      if (randomBtn) randomBtn.style.display = isAdvanced ? 'none' : 'inline-block';
      if (randomBlocksBtn) randomBlocksBtn.style.display = isAdvanced ? 'inline-block' : 'none';
      if (randomNotesBtn) randomNotesBtn.style.display = isAdvanced ? 'inline-block' : 'none';
    };

    updateVisibility();
    panel.addEventListener('toy-zoom', updateVisibility);

    // --- Logic for external controls in Advanced mode ---
    let externalHost = panel.querySelector('.drawgrid-external-controls');
    if (!externalHost) {
      externalHost = document.createElement('div');
      externalHost.className = 'drawgrid-external-controls';
      Object.assign(externalHost.style, { position: 'absolute', right: '-160px', top: '50%', transform: 'translateY(-50%)', display: 'none', flexDirection: 'column', gap: '10px', zIndex: '10', width: '150px' });
      panel.appendChild(externalHost);
    }
    const moveDrawGridControls = () => {
      const isAdvanced = panel.classList.contains('toy-zoomed');
      const headerRight = panel.querySelector('.toy-header .toy-controls-right');
      const stepsCtrl = panel.querySelector('.drawgrid-steps');
      const autotuneCtrl = panel.querySelector('.drawgrid-autotune');
      if (isAdvanced) { if (stepsCtrl) externalHost.appendChild(stepsCtrl); if (autotuneCtrl) externalHost.appendChild(autotuneCtrl); externalHost.style.display = 'flex'; }
      else { if (headerRight) { if (stepsCtrl) headerRight.appendChild(stepsCtrl); if (autotuneCtrl) headerRight.appendChild(autotuneCtrl); } externalHost.style.display = 'none'; }
    };
    const mo = new MutationObserver(() => { const s = panel.querySelector('.drawgrid-steps'), a = panel.querySelector('.drawgrid-autotune'); if (s && a) { moveDrawGridControls(); mo.disconnect(); } });
    mo.observe(panel, { childList: true, subtree: true });
    panel.addEventListener('toy-zoom', moveDrawGridControls);
  }

  // Bouncer has special button logic to swap "Random" for two more specific buttons in advanced mode.
  if (toyKind === 'bouncer') {
    // Bouncer buttons are now on the left, like the drum toy.
    const left = header.querySelector('.toy-title');
    const right = header.querySelector('.toy-controls-right');

    // Remove any old bouncer buttons from the right side to be safe.
    right.querySelector('[data-action="random"]')?.remove();

    // Apply margin to create space for the external "Edit" button, just like the drum toy.
    left.style.setProperty('margin-left', '47px', 'important');

    // Get the external buttons created earlier.
    const editBtn = panel.querySelector(':scope > .toy-mode-btn[data-action="advanced"]');
    const closeBtn = panel.querySelector(':scope > .toy-mode-btn[data-action="close-advanced"]');

    // --- Create all buttons on the left side, with the correct size ---
    const BTN_SIZE = '65px';

    // Standard-view "Random" button (New Ball)
    let randomBtn = left.querySelector('[data-action="random"]');
    if (!randomBtn) {
      randomBtn = document.createElement('button');
      randomBtn.className = 'c-btn';
      randomBtn.dataset.action = 'random';
      randomBtn.title = 'New Ball';
      randomBtn.style.setProperty('--c-btn-size', BTN_SIZE);
      randomBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonRandom.png');"></div>`;
      left.appendChild(randomBtn);
    }

    // Advanced-view "Random Blocks" button
    let randomCubesBtn = left.querySelector('[data-action="random-cubes"]');
    if (!randomCubesBtn) {
      randomCubesBtn = document.createElement('button');
      randomCubesBtn.className = 'c-btn';
      randomCubesBtn.dataset.action = 'random-cubes';
      randomCubesBtn.title = 'Random Blocks';
      randomCubesBtn.style.setProperty('--c-btn-size', BTN_SIZE);
      randomCubesBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonRandomBlocks.png');"></div>`;
      left.appendChild(randomCubesBtn);
    }

    // Advanced-view "Random Notes" button
    let randomNotesBtn = left.querySelector('[data-action="random-notes"]');
    if (!randomNotesBtn) {
      randomNotesBtn = document.createElement('button');
      randomNotesBtn.className = 'c-btn';
      randomNotesBtn.dataset.action = 'random-notes';
      randomNotesBtn.title = 'Random Notes';
      randomNotesBtn.style.setProperty('--c-btn-size', BTN_SIZE);
      randomNotesBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonRandomNotes.png');"></div>`;
      left.appendChild(randomNotesBtn);
    }

    // "Clear" button (visible in both modes)
    let clearBtn = left.querySelector('[data-action="clear"]');
    if (!clearBtn) {
      clearBtn = document.createElement('button');
      clearBtn.className = 'c-btn';
      clearBtn.dataset.action = 'clear';
      clearBtn.title = 'Clear';
      clearBtn.style.setProperty('--c-btn-size', BTN_SIZE);
      clearBtn.style.setProperty('--accent', '#f87171');
      clearBtn.style.marginLeft = '10px';
      clearBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonClear.png');"></div>`;
      left.appendChild(clearBtn);
    }

    // This function explicitly sets the visibility of the buttons based on the view mode.
    const updateVisibility = () => {
      const isAdvanced = panel.classList.contains('toy-zoomed');

      if (randomBtn) randomBtn.style.display = isAdvanced ? 'none' : 'inline-block';
      if (randomNotesBtn) randomNotesBtn.style.display = isAdvanced ? 'inline-block' : 'none';
      if (randomCubesBtn) randomCubesBtn.style.display = isAdvanced ? 'inline-block' : 'none';
      if (clearBtn) clearBtn.style.display = 'inline-block'; // Always visible

      // Adjust margins for layout.
      // Standard: [Random] [Clear]
      // Advanced: [Random Blocks] [Random Notes] [Clear]
      if (randomCubesBtn) randomCubesBtn.style.marginLeft = '';
      if (randomNotesBtn) randomNotesBtn.style.marginLeft = '10px';

      // Handle visibility for external Edit/Close buttons
      if (editBtn) editBtn.style.display = isAdvanced ? 'none' : 'block';
      if (closeBtn) closeBtn.style.display = isAdvanced ? 'block' : 'none';
    }
    updateVisibility(); // Set initial state
    panel.addEventListener('toy-zoom', updateVisibility); // Update on view change

    // --- Logic for external controls in Advanced mode ---
    let externalHost = panel.querySelector('.bouncer-external-controls');
    if (!externalHost) {
      externalHost = document.createElement('div');
      externalHost.className = 'bouncer-external-controls';
      Object.assign(externalHost.style, {
        position: 'absolute', right: '-260px', top: '50px',
        transform: 'none', display: 'none', flexDirection: 'column',
        gap: '20px', zIndex: '10', width: '250px',
      });
      panel.appendChild(externalHost);
    }

    const moveBouncerControls = () => {
      const isAdvanced = panel.classList.contains('toy-zoomed');
      const headerRight = panel.querySelector('.toy-header .toy-controls-right');
      const speedCtrl = panel.querySelector('[class*="speed-ctrl"]');
      const quantCtrl = panel.querySelector('[class*="quant-ctrl"]');

      if (isAdvanced) {
        if (speedCtrl) externalHost.appendChild(speedCtrl);
        if (quantCtrl) externalHost.appendChild(quantCtrl);
        externalHost.style.display = 'flex';
      } else {
        if (headerRight) {
          if (speedCtrl) headerRight.appendChild(speedCtrl);
          if (quantCtrl) headerRight.appendChild(quantCtrl);
        }
        externalHost.style.display = 'none';
      }
    };

    // The controls are added by another script. We watch for them to appear in the DOM.
    const mo = new MutationObserver(() => {
      const speedCtrl = panel.querySelector('[class*="speed-ctrl"]');
      const quantCtrl = panel.querySelector('[class*="quant-ctrl"]');
      if (speedCtrl && quantCtrl) {
        moveBouncerControls(); // Move them to their initial correct place
        mo.disconnect(); // We found them, stop observing.
      }
    });
    mo.observe(panel, { childList: true, subtree: true });

    panel.addEventListener('toy-zoom', moveBouncerControls);
  }

  // Instrument select (header, hidden in standard)
  const sel = buildInstrumentSelect(panel);
  // Remove any old instrument button to prevent duplicates
  let oldInstBtn = right.querySelector('.toy-inst-btn');
  if (oldInstBtn) oldInstBtn.remove();
  let oldExtInstBtn = panel.querySelector(':scope > .toy-inst-btn');
  if (oldExtInstBtn) oldExtInstBtn.remove();

  const instBtn = document.createElement('button');
  instBtn.className = 'c-btn toy-inst-btn';
  instBtn.title = 'Choose Instrument';
  instBtn.dataset.action = 'instrument';
  instBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonInstruments.png');"></div>`;

  if (toyKind === 'loopgrid' || toyKind === 'bouncer' || toyKind === 'rippler' || toyKind === 'chordwheel' || toyKind === 'drawgrid') {
    // For loopgrid, bouncer, rippler, chordwheel, and drawgrid, put a large instrument button inside the header.
    instBtn.style.setProperty('--c-btn-size', '65px');
    right.appendChild(instBtn);
  } else {
    // All other toys get a small instrument button inside the header on the far right.
    instBtn.style.setProperty('--c-btn-size', '38px');
    right.appendChild(instBtn);
  }

  instBtn.addEventListener('click', async ()=>{
    try{
      const chosen = await openInstrumentPicker({ panel, toyId: (panel.dataset.toyid || panel.dataset.toy || panel.id || 'master') });
      if (!chosen){
        try{ const h = panel.querySelector('.toy-header'); if (h){ h.classList.remove('pulse-accept'); h.classList.add('pulse-cancel'); setTimeout(()=> h.classList.remove('pulse-cancel'), 650); } }catch{}
        return; // cancelled
      }
      const val = String(chosen || '');
      // Update UI select to contain and select it
      let has = Array.from(sel.options).some(o=> o.value === val);
      if (!has){ const o=document.createElement('option'); o.value=val; o.textContent=val.replace(/[_-]/g,' ').replace(/\w\S*/g, t=> t[0].toUpperCase()+t.slice(1).toLowerCase()); sel.appendChild(o); }
      sel.value = val;
      // Apply to toy
      panel.dataset.instrument = val;
      try{ panel.dispatchEvent(new CustomEvent('toy-instrument', { detail:{ value: val }, bubbles:true })); }catch{}
      try{ panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name: val, value: val }, bubbles:true })); }catch{}
      try{ const h = panel.querySelector('.toy-header'); if (h){ h.classList.remove('pulse-cancel'); h.classList.add('pulse-accept'); setTimeout(()=> h.classList.remove('pulse-accept'), 650); } }catch{}
    }catch{}
  });

  // Keep select in sync when instrument changes elsewhere
  panel.addEventListener('toy-instrument', (e) => {
    const instrumentName = (e?.detail?.value || '');
    if (!instrumentName) return;
    if (instDisplay) {
      instDisplay.textContent = getDisplayNameForId(instrumentName) || toTitleCase(instrumentName);
    }
    // Ensure option exists
    const has = Array.from(sel.options).some(o=> o.value === instrumentName);
    if (!has){
      const opt = document.createElement('option');
      opt.value = instrumentName;
      opt.textContent = getDisplayNameForId(instrumentName) || toTitleCase(instrumentName);
      sel.appendChild(opt);
    }
    if (sel.value !== instrumentName) sel.value = instrumentName;
  });
  panel.addEventListener('toy:instrument', (e) => {
    const instrumentName = ((e?.detail?.name || e?.detail?.value) || '');
    if (!instrumentName) return;
    if (instDisplay) {
      instDisplay.textContent = getDisplayNameForId(instrumentName) || toTitleCase(instrumentName);
    }
    const has = Array.from(sel.options).some(o=> o.value === instrumentName);
    if (!has){
      const opt = document.createElement('option');
      opt.value = instrumentName;
      opt.textContent = getDisplayNameForId(instrumentName) || toTitleCase(instrumentName);
      sel.appendChild(opt);
    }
    if (sel.value !== instrumentName) sel.value = instrumentName;
  });


  // SAFER initial instrument resolution:
  // Prefer existing dataset (e.g., theme), then explicit default, and only then current select value.
  let initialInstrument = 'TONE';
  try {
    const fromTheme = panel.dataset.instrument;
    const fromDefault = defaultInstrument;
    const fromSelect = sel ? sel.value : null;
    const candidates = [fromTheme, fromDefault, fromSelect].filter(Boolean);
    const allIds = getAllIds();

    for (const cand of candidates) {
      // 1. Try exact, case-sensitive match first.
      if (allIds.includes(cand)) {
        initialInstrument = cand;
        break;
      }
      // 2. Fallback: try case-insensitive match. This handles `AcousticGuitar` vs `ACOUSTIC GUITAR`.
      const lowerCand = cand.toLowerCase().replace(/[\s_-]+/g, '');
      const foundId = allIds.find(id => id.toLowerCase().replace(/[\s_-]+/g, '') === lowerCand);
      if (foundId) {
        initialInstrument = foundId;
        break;
      }
    }
  } catch (e) { console.warn('[toyui] Initial instrument resolution failed', e); }

  // Apply initial instrument without letting an empty/unmatched select overwrite the theme
  if (initialInstrument) {
    panel.dataset.instrument = initialInstrument;
    // Notify toy code once; listeners will keep UI in sync
    try{ panel.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: initialInstrument }, bubbles: true })); }catch{}
    try{ panel.dispatchEvent(new CustomEvent('toy:instrument',  { detail: { name: initialInstrument, value: initialInstrument }, bubbles: true })); }catch{}
  }

  return { header, footer, body: panel.querySelector('.toy-body'), instrument: panel.dataset.instrument || initialInstrument || 'tone' };
}
