// src/sound-theme.js
// Sound theme selection + instrument picking from samples.csv catalog.

import { getAllThemes, getInstrumentEntries } from './instrument-catalog.js';

const SOUND_THEME_KEY = 'music-toy-sound-theme';
const NO_THEME_VALUE = '';

function normalizeTheme(value) {
  if (!value) return NO_THEME_VALUE;
  return String(value).trim();
}

function getStoredTheme() {
  try {
    return normalizeTheme(localStorage.getItem(SOUND_THEME_KEY));
  } catch {
    return NO_THEME_VALUE;
  }
}

export function getSoundThemeKey() {
  return getStoredTheme();
}

export function setSoundThemeKey(nextTheme, { silent = false } = {}) {
  const theme = normalizeTheme(nextTheme);
  try {
    localStorage.setItem(SOUND_THEME_KEY, theme);
  } catch {}
  if (!silent) {
    try {
      window.dispatchEvent(new CustomEvent('sound-theme:change', { detail: { theme } }));
    } catch {}
  }
  return theme;
}

export function getSoundThemes() {
  return getAllThemes ? getAllThemes() : [];
}

export function getSoundThemeLabel(theme) {
  return theme ? String(theme) : 'No Theme';
}

export function pickRandomSoundTheme() {
  const themes = getSoundThemes();
  if (!themes.length) return NO_THEME_VALUE;
  const idx = Math.floor(Math.random() * themes.length);
  return themes[idx] || NO_THEME_VALUE;
}

function matchesTheme(entry, theme) {
  if (!theme) return true;
  return Array.isArray(entry?.themes) && entry.themes.includes(theme);
}

function matchesRecommended(entry, toyType) {
  if (!toyType) return false;
  const key = String(toyType).toLowerCase();
  return Array.isArray(entry?.recommendedToys) && entry.recommendedToys.includes(key);
}
function matchesPriority(entry) {
  return !!entry?.priority;
}

function pickFromList(entries, usedIds) {
  if (!entries.length) return '';
  const used = usedIds instanceof Set ? usedIds : new Set(usedIds || []);
  const unused = entries.filter((entry) => entry?.id && !used.has(entry.id));
  const pool = unused.length ? unused : entries;
  const choice = pool[Math.floor(Math.random() * pool.length)];
  return choice?.id || '';
}

export function pickInstrumentForToy(toyType, { theme, usedIds, preferPriority = true } = {}) {
  const entries = getInstrumentEntries ? getInstrumentEntries() : [];
  if (!entries.length) return 'tone';

  const themeKey = normalizeTheme(theme);
  const used = usedIds instanceof Set ? usedIds : new Set(usedIds || []);
  const unusedEntries = entries.filter((entry) => entry?.id && !used.has(entry.id));

  const pickFromBucket = (bucket) => {
    if (!Array.isArray(bucket) || !bucket.length) return '';
    if (preferPriority) {
      const pri = bucket.filter((entry) => matchesPriority(entry));
      const pickedPri = pickFromList(pri, new Set());
      if (pickedPri) return pickedPri;
    }
    return pickFromList(bucket, new Set());
  };

  const pickByRuleOrder = (pool) => {
    if (!Array.isArray(pool) || !pool.length) return '';
    const b1 = pool.filter((entry) => matchesTheme(entry, themeKey) && matchesRecommended(entry, toyType));
    const picked1 = pickFromBucket(b1);
    if (picked1) return picked1;

    const b2 = pool.filter((entry) => matchesRecommended(entry, toyType));
    const picked2 = pickFromBucket(b2);
    if (picked2) return picked2;

    return pickFromBucket(pool);
  };

  // Rule order:
  // 1) Unused first
  // 2) Within unused: theme+toy, then toy, then any remaining unused
  // 3) If no unused choices remain: theme+toy, then toy, then any remaining
  const pickedUnused = pickByRuleOrder(unusedEntries);
  if (pickedUnused) return pickedUnused;
  const pickedAny = pickByRuleOrder(entries);
  if (pickedAny) return pickedAny;

  return 'tone';
}

export function collectUsedInstruments({ includeChained = true } = {}) {
  const used = new Set();
  const panels = Array.from(document.querySelectorAll('.toy-panel'));
  panels.forEach((panel) => {
    if (!includeChained && (panel.dataset?.prevToyId || panel.dataset?.chainParent)) return;
    const id = panel.dataset?.instrument;
    if (id) used.add(id);
  });
  return used;
}

function applyInstrumentToPanel(panel, instrumentId) {
  if (!panel || !instrumentId) return;
  panel.dataset.instrument = instrumentId;
  panel.dataset.instrumentPersisted = '1';
  try {
    panel.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: instrumentId }, bubbles: true }));
    panel.dispatchEvent(new CustomEvent('toy:instrument', { detail: { name: instrumentId, value: instrumentId }, bubbles: true }));
  } catch {}
}

export function applySoundThemeToScene({ theme } = {}) {
  const themeKey = normalizeTheme(theme);
  const panels = Array.from(document.querySelectorAll('.toy-panel'));
  const used = new Set();

  const targets = panels.filter((panel) => !(panel.dataset?.prevToyId || panel.dataset?.chainParent));
  targets.forEach((panel) => {
    const toyType = panel.dataset?.toy || '';
    const picked = pickInstrumentForToy(toyType, { theme: themeKey, usedIds: used });
    if (!picked) return;
    used.add(picked);
    applyInstrumentToPanel(panel, picked);
  });
}
