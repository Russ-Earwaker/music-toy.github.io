// src/theme-switcher.js
// Populates and manages the theme selection dropdown in the topbar.

import { THEMES } from './themes.js';
import { getActiveThemeKey } from './theme-manager.js';

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

function initThemeSwitcher() {
  const select = document.getElementById('theme-select');
  if (!select) {
    // Silently skip if topbar theme select is not present.
    return;
  }

  // 1. Populate options from themes.js
  select.innerHTML = ''; // Clear any hardcoded options
  for (const key in THEMES) {
    const theme = THEMES[key];
    const option = document.createElement('option');
    option.value = key;
    // Use the theme's display name, or format the key as a fallback
    option.textContent = theme.name || toTitleCase(key);
    select.appendChild(option);
  }

  // 2. Set the initial value from the theme manager
  try {
    const activeTheme = getActiveThemeKey();
    if (activeTheme) select.value = activeTheme;
  } catch (e) {
    console.warn('[theme-switcher] Could not get active theme on boot.', e);
  }

  // Apply is handled by the topbar options panel button.
}

// Wait for the DOM to be ready before manipulating it.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initThemeSwitcher, { once: true });
else initThemeSwitcher();
