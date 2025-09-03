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
function wireAll() {
  const activeThemeKey = getActiveThemeKey();
  const theme = THEMES[activeThemeKey];
  if (!theme) {
    console.warn(`[boot-theme] Active theme "${activeThemeKey}" not found.`);
    return;
  }
  console.log(`[boot-theme] Wiring all toys with theme: ${activeThemeKey}`);

  /** Helper to apply an instrument to a panel and update its UI */
  function applyToPanel(panel, instrument, instrumentList) {
    if (!panel || !instrument) return;

    // 1. Set data attribute for the toy's internal logic to use.
    panel.dataset.instrument = instrument;

    // 2. Update the instrument <select> dropdown if it exists.
    const select = panel.querySelector('select.toy-instrument');
    if (select) {
      select.innerHTML = '';
      (instrumentList || []).forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = toTitleCase(name);
        select.appendChild(opt);
      });
      select.value = instrument;
    }

    // 3. Dispatch an event to notify the toy that its instrument has changed.
    panel.dispatchEvent(new CustomEvent('toy-instrument', {
      detail: { value: instrument },
      bubbles: true,
    }));
  }

  // --- Wire up all toy types ---

  const gridPanels = document.querySelectorAll('.toy-panel[data-toy="loopgrid"]');
  if (gridPanels.length > 0 && theme.grids) {
    const instruments = resolveGridSamples();
    gridPanels.forEach((panel, i) => applyToPanel(panel, theme.grids[i % theme.grids.length], instruments));
  }

  const bouncerPanels = document.querySelectorAll('.toy-panel[data-toy="bouncer"]');
  if (bouncerPanels.length > 0 && theme.bouncer) {
    const instruments = resolveBouncerSamples();
    bouncerPanels.forEach((panel, i) => applyToPanel(panel, theme.bouncer[i % theme.bouncer.length], instruments));
  }

  const ripplerPanels = document.querySelectorAll('.toy-panel[data-toy="rippler"]');
  if (ripplerPanels.length > 0 && theme.rippler) {
    const instruments = resolveRipplerSamples();
    ripplerPanels.forEach((panel, i) => applyToPanel(panel, theme.rippler[i % theme.rippler.length], instruments));
  }

  const wheelPanels = document.querySelectorAll('.toy-panel[data-toy*="wheel"]');
  if (wheelPanels.length > 0 && theme.wheel) {
    const instruments = resolveWheelSamples();
    wheelPanels.forEach((panel, i) => applyToPanel(panel, theme.wheel[i % theme.wheel.length], instruments));
  }
}

// Expose a global API for the theme switcher and console access.
window.ThemeBoot = {
  setTheme,
  wireAll,
  getActiveThemeKey,
};