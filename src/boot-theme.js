// src/boot-theme.js
// Wires the active theme into your boot flow.

import { THEMES } from './themes.js';
import {
  getActiveThemeKey,
  setActiveThemeKey,
  resolveGridSamples,
  resolveBouncerSamples,
  resolveRipplerSamples,
  resolveWheelSamples
} from './theme-manager.js';

// Load instrument entries from CSV and return [{id, display}] with unique display labels
async function loadInstrumentEntries(){
  try{
    const url = './assets/samples/samples.csv';
    const res = await fetch(url);
    if (res && res.ok){
      const txt = await res.text();
      const lines = txt.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return [];
      const header = lines.shift().split(',').map(s=>s.trim());
      const idIdx   = header.findIndex(h=>/^(id|name|instrument_id|instrument)$/i.test(h));
      const dispIdx = header.findIndex(h=>/^(display\s*_?name|display|label|title)$/i.test(h));
      const out = [];
      for (const line of lines){
        const cells = line.split(',');
        const id = (cells[idIdx]||'').trim();
        const display = (cells[dispIdx]||'').trim();
        if (id && display){ out.push({ id, display }); }
      }
      const byLabel = new Map();
      for (const ent of out){ if (!byLabel.has(ent.display)) byLabel.set(ent.display, ent.id); }
      return Array.from(byLabel.entries()).map(([display, id])=>({ id, display }))
                  .sort((a,b)=> a.display.localeCompare(b.display));
    }
  }catch{}
  return [];
}

/**
 * Sets the active theme and persists it.
 * @param {string} key The key of the theme to set (e.g., "default").
 */
function setTheme(key) {
  console.log(`[boot-theme] Setting theme to: ${key}`);
  setActiveThemeKey(key);
}

/**
 * Formats a string from snake_case or kebab-case to Title Case.
 * @param {string} str The input string.
 * @returns {string} The formatted string.
 */
function toTitleCase(str) {
  if (!str) return '';
  return str.replace(/[_-]/g, ' ').replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

/**
 * Finds all toy panels, assigns instruments from the current theme,
 * and updates their instrument selection UI.
 */
async function wireAll() {
  const activeThemeKey = getActiveThemeKey();
  const theme = THEMES[activeThemeKey];
  if (!theme) {
    console.warn(`[boot-theme] Active theme "${activeThemeKey}" not found.`);
    return;
  }
  console.log(`[boot-theme] Wiring all toys with theme: ${activeThemeKey}`);
  // Preload full instrument list (CSV display names) once
  let allEntries = [];
  try { allEntries = await loadInstrumentEntries(); } catch {}

  /** Helper to apply an instrument to a panel and update its UI */
  function applyToPanel(panel, instrument) {
    if (!panel || !instrument) return;

    // 1. Set data attribute for the toy's internal logic to use.
    panel.dataset.instrument = String(instrument || '');

    // 2. Update the instrument <select> dropdown if it exists.
    const select = panel.querySelector('select.toy-instrument');
    if (select) {
      const list = Array.isArray(allEntries) ? allEntries : [];
      select.innerHTML = '';
      for (const ent of list){
        const opt = document.createElement('option');
        opt.value = String(ent.id||'').toLowerCase(); // normalize id
        opt.textContent = ent.display; // CSV display name only
        select.appendChild(opt);
      }
      try { select.value = panel.dataset.instrument; } catch {}
    }

    // 3. Dispatch both event flavors to notify all listeners.
    panel.dispatchEvent(new CustomEvent('toy-instrument', {
      detail: { value: instrument },
      bubbles: true,
    }));
    panel.dispatchEvent(new CustomEvent('toy:instrument', {
      detail: { name: instrument, value: instrument },
      bubbles: true,
    }));
  }

  // --- Wire up all toy types ---

  const gridPanels = document.querySelectorAll('.toy-panel[data-toy="loopgrid"], .toy-panel[data-toy="loopgrid-drum"]');
  if (gridPanels.length > 0 && theme.grids) {
    resolveGridSamples();
    gridPanels.forEach((panel, i) => applyToPanel(panel, theme.grids[i % theme.grids.length]));
  }

  const bouncerPanels = document.querySelectorAll('.toy-panel[data-toy="bouncer"]');
  if (bouncerPanels.length > 0 && theme.bouncer) {
    resolveBouncerSamples();
    bouncerPanels.forEach((panel, i) => applyToPanel(panel, theme.bouncer[i % theme.bouncer.length]));
  }

  const ripplerPanels = document.querySelectorAll('.toy-panel[data-toy="rippler"]');
  if (ripplerPanels.length > 0 && theme.rippler) {
    resolveRipplerSamples();
    ripplerPanels.forEach((panel, i) => applyToPanel(panel, theme.rippler[i % theme.rippler.length]));
  }

  const wheelPanels = document.querySelectorAll('.toy-panel[data-toy*="wheel"]');
  if (wheelPanels.length > 0 && theme.wheel) {
    resolveWheelSamples();
    wheelPanels.forEach((panel, i) => applyToPanel(panel, theme.wheel[i % theme.wheel.length]));
  }
}

// Expose a global API for the theme switcher and console access.
window.ThemeBoot = {
  setTheme,
  wireAll,
  getActiveThemeKey,
};
