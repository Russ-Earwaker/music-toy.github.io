// src/theme-manager.js
// Small helper API to query/resolve the active theme.

import { THEMES } from './themes.js';

const THEME_KEY = 'music-toy-theme';

/** Gets the key for the currently active theme from localStorage. */
export function getActiveThemeKey() {
  const saved = localStorage.getItem(THEME_KEY);
  // Ensure the saved theme exists, otherwise fall back to 'default'.
  if (saved && THEMES[saved]) {
    return saved;
  }
  return 'default';
}

/** Saves the key for the active theme to localStorage. */
export function setActiveThemeKey(key) {
  if (THEMES[key]) {
    localStorage.setItem(THEME_KEY, key);
  } else {
    console.warn(`[theme-manager] Theme "${key}" not found.`);
  }
}

/** Returns the full object for the currently active theme. */
function getActiveTheme() {
  const key = getActiveThemeKey();
  return THEMES[key] || THEMES['default'] || {};
}

/** Resolves the list of instruments for Grid toys from the active theme. */
export function resolveGridSamples() {
  return getActiveTheme().grids || [];
}

/** Resolves the list of instruments for Bouncer toys from the active theme. */
export function resolveBouncerSamples() {
  return getActiveTheme().bouncer || [];
}

/** Resolves the list of instruments for Rippler toys from the active theme. */
export function resolveRipplerSamples() {
  return getActiveTheme().rippler || [];
}

/** Resolves the list of instruments for Wheel toys from the active theme. */
export function resolveWheelSamples() {
  return getActiveTheme().wheel || [];
}