import { getIdForDisplayName, getInstrumentEntries } from '../instrument-catalog.js';
import { getSoundThemeKey, pickInstrumentForToy } from '../sound-theme.js';
import { BEAT_EVENT_ROLES } from './beat-events.js';

const PALETTE_MIN_BARS = 48;
const PALETTE_MAX_BARS = 72;
const PALETTE_EVOLVE_BARS = 4;

const ROLE_TOY_KEYS = Object.freeze({
  [BEAT_EVENT_ROLES.BASS]: Object.freeze(['loopgrid-drum', 'loopgrid']),
  [BEAT_EVENT_ROLES.LEAD]: Object.freeze(['drawgrid', 'loopgrid']),
  [BEAT_EVENT_ROLES.ACCENT]: Object.freeze(['loopgrid', 'drawgrid']),
  [BEAT_EVENT_ROLES.MOTION]: Object.freeze(['drawgrid', 'loopgrid']),
});

const ROLE_FALLBACK_DISPLAY = Object.freeze({
  [BEAT_EVENT_ROLES.BASS]: 'Bass Tone 4',
  [BEAT_EVENT_ROLES.LEAD]: 'Tone (Sine)',
  [BEAT_EVENT_ROLES.ACCENT]: 'Tone (Sine)',
  [BEAT_EVENT_ROLES.MOTION]: 'Tone (Sine)',
});

const ROLE_LIST = Object.freeze([
  BEAT_EVENT_ROLES.BASS,
  BEAT_EVENT_ROLES.LEAD,
  BEAT_EVENT_ROLES.ACCENT,
  BEAT_EVENT_ROLES.MOTION,
]);

export const BEAT_SWARM_DEFAULT_PALETTE = Object.freeze({
  id: 'beat-swarm-default',
  gameplay: Object.freeze({
    playerWeapons: Object.freeze({
      projectile: Object.freeze({ family: 'projectile' }),
      boomerang: Object.freeze({ family: 'boomerang' }),
      hitscan: Object.freeze({ family: 'hitscan' }),
      beam: Object.freeze({ family: 'beam' }),
    }),
    explosion: Object.freeze({ family: 'explosion' }),
    enemyDeath: Object.freeze({
      small: Object.freeze({ family: 'enemy-death-small' }),
      medium: Object.freeze({ family: 'enemy-death-medium' }),
      large: Object.freeze({ family: 'enemy-death-large' }),
    }),
  }),
  roles: Object.freeze({
    bass: Object.freeze({ family: 'bass' }),
    lead: Object.freeze({ family: 'lead' }),
    accent: Object.freeze({ family: 'accent' }),
    motion: Object.freeze({ family: 'motion' }),
  }),
});

function normalizeRole(roleName, fallback = BEAT_EVENT_ROLES.ACCENT) {
  const s = String(roleName || '').trim().toLowerCase();
  if (s === 'bass' || s === 'drum' || s === 'loop' || s === 'groove') return BEAT_EVENT_ROLES.BASS;
  if (s === 'lead' || s === 'phrase') return BEAT_EVENT_ROLES.LEAD;
  if (s === 'accent') return BEAT_EVENT_ROLES.ACCENT;
  if (s === 'motion' || s === 'cosmetic') return BEAT_EVENT_ROLES.MOTION;
  return normalizeRole(fallback, BEAT_EVENT_ROLES.ACCENT);
}

function parseEntryBaseOctave(entry) {
  const base = String(entry?.baseNote || '').trim();
  const m = base.match(/-?\d+/);
  if (m) {
    const n = Math.trunc(Number(m[0]));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function entryHasToy(entry, toyKey) {
  const key = String(toyKey || '').trim().toLowerCase();
  if (!key) return false;
  const toys = Array.isArray(entry?.recommendedToys) ? entry.recommendedToys : [];
  return toys.map((t) => String(t || '').trim().toLowerCase()).includes(key);
}

function entryMatchesTheme(entry, themeKey) {
  const key = String(themeKey || '').trim();
  if (!key) return true;
  const themes = Array.isArray(entry?.themes) ? entry.themes : [];
  return themes.includes(key);
}

function entryLaneScore(entry, roleKey, roleToys) {
  const type = String(entry?.type || '').trim().toLowerCase();
  const id = String(entry?.id || '').trim().toLowerCase();
  const display = String(entry?.display || '').trim().toLowerCase();
  const oct = parseEntryBaseOctave(entry);
  const hasLoop = roleToys.some((t) => t === 'loopgrid' || t === 'loopgrid-drum') && (entryHasToy(entry, 'loopgrid') || entryHasToy(entry, 'loopgrid-drum'));
  const hasDraw = roleToys.includes('drawgrid') && entryHasToy(entry, 'drawgrid');
  const text = `${type} ${id} ${display}`;
  const isPercussive = /drum|percussion|djembe|clap|cowbell|effect/.test(text);
  const isBassLike = /bass|kick/.test(text);
  const isTonalLeadLike = /piano|string|guitar|kalimba|marimba|xylophone|glockenspiel|ukulele|synth/.test(text);

  let score = 0;
  if (entry?.priority) score += 0.5;

  if (roleKey === BEAT_EVENT_ROLES.BASS) {
    if (hasLoop) score += 3;
    if (isBassLike) score += 3;
    if (isPercussive) score += 1.5;
    if (Number.isFinite(oct)) {
      if (oct <= 3) score += 3;
      else if (oct === 4) score += 1;
      else score -= 2;
    }
    if (hasDraw) score -= 1;
    return score;
  }

  if (roleKey === BEAT_EVENT_ROLES.LEAD) {
    if (hasDraw) score += 3;
    if (isTonalLeadLike) score += 2;
    if (isPercussive) score -= 1.5;
    if (Number.isFinite(oct)) {
      if (oct >= 4 && oct <= 6) score += 3;
      else if (oct === 3) score += 0.5;
      else if (oct <= 2) score -= 2;
    }
    return score;
  }

  if (roleKey === BEAT_EVENT_ROLES.MOTION) {
    if (hasDraw) score += 1.5;
    if (isPercussive) score += 2;
    if (isBassLike) score -= 2;
    if (Number.isFinite(oct)) {
      if (oct >= 4) score += 1.5;
      else if (oct <= 2) score -= 1.5;
    }
    return score;
  }

  // Accent lane
  if (hasLoop || hasDraw) score += 1.5;
  if (isPercussive) score += 2;
  if (isBassLike) score -= 0.5;
  if (Number.isFinite(oct)) {
    if (oct >= 3 && oct <= 5) score += 2;
    else if (oct <= 2 || oct >= 6) score -= 0.8;
  }
  return score;
}

function pickRoleInstrument(themeKey, role, usedIds = null, previousId = '') {
  const roleKey = normalizeRole(role, BEAT_EVENT_ROLES.ACCENT);
  const roleToys = ROLE_TOY_KEYS[roleKey] || ROLE_TOY_KEYS[BEAT_EVENT_ROLES.ACCENT];
  const used = usedIds instanceof Set ? usedIds : new Set();
  if (previousId) used.add(String(previousId || '').trim());
  const entries = Array.isArray(getInstrumentEntries?.()) ? getInstrumentEntries() : [];
  if (entries.length) {
    const unused = entries.filter((e) => e?.id && !used.has(String(e.id || '').trim()));
    const toyPool = unused.filter((e) => roleToys.some((toy) => entryHasToy(e, toy)));
    const basePool = toyPool.length ? toyPool : (unused.length ? unused : entries);
    const themed = basePool.filter((e) => entryMatchesTheme(e, themeKey));
    const scoringPool = themed.length ? themed : basePool;
    if (scoringPool.length) {
      const ranked = scoringPool
        .slice()
        .sort((a, b) => {
          const sa = entryLaneScore(a, roleKey, roleToys);
          const sb = entryLaneScore(b, roleKey, roleToys);
          if (sb !== sa) return sb - sa;
          return String(a?.id || '').localeCompare(String(b?.id || ''));
        });
      const topScore = entryLaneScore(ranked[0], roleKey, roleToys);
      const nearBest = ranked.filter((e) => (topScore - entryLaneScore(e, roleKey, roleToys)) <= 0.75);
      const pickPool = nearBest.length ? nearBest : ranked;
      const picked = pickPool[Math.floor(Math.random() * pickPool.length)] || ranked[0];
      const pickedId = String(picked?.id || '').trim();
      if (pickedId) return pickedId;
    }
  }
  for (const toyKey of roleToys) {
    const picked = String(pickInstrumentForToy?.(toyKey, {
      theme: themeKey,
      usedIds: used,
      preferPriority: true,
    }) || '').trim();
    if (picked) return picked;
  }
  const fallback = String(getIdForDisplayName?.(ROLE_FALLBACK_DISPLAY[roleKey] || '') || '').trim();
  return fallback || 'tone';
}

function nextPaletteDurationBars() {
  return PALETTE_MIN_BARS + Math.floor(Math.random() * ((PALETTE_MAX_BARS - PALETTE_MIN_BARS) + 1));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function clampRange(value, lo, hi) {
  return Math.max(Number(lo) || 0, Math.min(Number(hi) || 0, Number(value) || 0));
}

export function createBeatSwarmPaletteRuntime() {
  let currentTheme = '';
  let paletteIndex = 0;
  let lastAppliedBar = -1;
  let paletteStartBar = 0;
  let nextPaletteBar = nextPaletteDurationBars();
  let nextEvolveBar = PALETTE_EVOLVE_BARS;
  let roleInstruments = Object.create(null);
  let arrangement = {
    brightness: 0.5,
    filter: 0.45,
    density: 0.5,
    octaveEmphasis: 0.5,
    accentStrength: 0.5,
  };
  let evolveSeed = 1;

  function reseedPalette(barIndex = 0, preserveRoles = false) {
    const bar = Math.max(0, Math.trunc(Number(barIndex) || 0));
    currentTheme = String(getSoundThemeKey?.() || '').trim();
    const used = new Set();
    const nextMap = Object.create(null);
    for (const role of ROLE_LIST) {
      const prev = preserveRoles ? String(roleInstruments[role] || '').trim() : '';
      const picked = prev || pickRoleInstrument(currentTheme, role, used, '');
      nextMap[role] = picked;
      if (picked) used.add(picked);
    }
    roleInstruments = nextMap;
    arrangement = {
      brightness: clamp01(arrangement.brightness),
      filter: clamp01(arrangement.filter),
      density: clamp01(arrangement.density),
      octaveEmphasis: clamp01(arrangement.octaveEmphasis),
      accentStrength: clamp01(arrangement.accentStrength),
    };
    paletteStartBar = bar;
    nextPaletteBar = bar + nextPaletteDurationBars();
    nextEvolveBar = bar + PALETTE_EVOLVE_BARS;
    paletteIndex += 1;
    evolveSeed = ((paletteIndex * 2654435761) ^ (bar * 2246822519)) >>> 0;
  }

  function evolveArrangement(barIndex = 0) {
    const bar = Math.max(0, Math.trunc(Number(barIndex) || 0));
    const span = Math.max(1, (nextPaletteBar - paletteStartBar) || PALETTE_MIN_BARS);
    const phase = clamp01((bar - paletteStartBar) / span);
    const seed01 = ((evolveSeed % 1000) / 1000);
    const bias = (seed01 - 0.5) * 0.16;
    const target = {
      brightness: clampRange(0.28 + (phase * 0.46) + bias, 0.18, 0.92),
      filter: clampRange(0.72 - (phase * 0.34) - (bias * 0.6), 0.12, 0.9),
      density: clampRange(0.22 + (phase * 0.58) + (bias * 0.5), 0.16, 0.9),
      octaveEmphasis: clampRange(0.2 + (phase * 0.5) + (bias * 0.35), 0.08, 0.92),
      accentStrength: clampRange(0.24 + (phase * 0.56) + (bias * 0.4), 0.12, 0.95),
    };
    const blend = 0.38;
    arrangement = {
      brightness: clampRange(arrangement.brightness + ((target.brightness - arrangement.brightness) * blend), 0.18, 0.92),
      filter: clampRange(arrangement.filter + ((target.filter - arrangement.filter) * blend), 0.12, 0.9),
      density: clampRange(arrangement.density + ((target.density - arrangement.density) * blend), 0.16, 0.9),
      octaveEmphasis: clampRange(arrangement.octaveEmphasis + ((target.octaveEmphasis - arrangement.octaveEmphasis) * blend), 0.08, 0.92),
      accentStrength: clampRange(arrangement.accentStrength + ((target.accentStrength - arrangement.accentStrength) * blend), 0.12, 0.95),
    };
    nextEvolveBar = bar + PALETTE_EVOLVE_BARS;
  }

  function noteSectionDirective(directive = null) {
    const sectionId = String(directive?.sectionId || '').trim().toLowerCase();
    const energyState = String(directive?.energyState || '').trim().toLowerCase();
    const intensity = clamp01(directive?.intensity);
    const sectionBoost = (
      sectionId.includes('chorus') || energyState === 'peak' || energyState === 'clash'
    ) ? 0.06 : (
      sectionId.includes('verse') || energyState === 'break' || energyState === 'intro'
    ) ? -0.05 : 0;
    arrangement = {
      brightness: clampRange(arrangement.brightness + (sectionBoost * 0.7), 0.18, 0.92),
      filter: clampRange(arrangement.filter + (sectionBoost * 0.35), 0.12, 0.9),
      density: clampRange(arrangement.density + sectionBoost + ((intensity - 0.5) * 0.05), 0.16, 0.9),
      octaveEmphasis: clampRange(arrangement.octaveEmphasis + (sectionBoost * 0.45), 0.08, 0.92),
      accentStrength: clampRange(arrangement.accentStrength + sectionBoost + ((intensity - 0.5) * 0.08), 0.12, 0.95),
    };
  }

  function updateForBar(barIndex = 0) {
    const bar = Math.max(0, Math.trunc(Number(barIndex) || 0));
    if (lastAppliedBar === bar) return;
    lastAppliedBar = bar;
    const themeKey = String(getSoundThemeKey?.() || '').trim();
    if (!roleInstruments[BEAT_EVENT_ROLES.BASS]) {
      reseedPalette(bar, false);
      return;
    }
    // Theme change is the only event that should force a fresh timbre family selection.
    if (themeKey !== currentTheme) {
      reseedPalette(bar, false);
      return;
    }
    // Lifetime rollover keeps role timbres stable and only advances arrangement evolution.
    if (bar >= nextPaletteBar) {
      reseedPalette(bar, true);
      return;
    }
    if (bar >= nextEvolveBar) evolveArrangement(bar);
  }

  function resolveRoleInstrument(roleName, fallback = 'tone') {
    const role = normalizeRole(roleName, BEAT_EVENT_ROLES.ACCENT);
    const id = String(roleInstruments[role] || '').trim();
    return id || String(fallback || 'tone').trim() || 'tone';
  }

  function reset(barIndex = 0) {
    lastAppliedBar = -1;
    reseedPalette(barIndex, false);
    lastAppliedBar = Math.max(0, Math.trunc(Number(barIndex) || 0));
  }

  function invalidate() {
    lastAppliedBar = -1;
  }

  function getSnapshot() {
    return {
      id: BEAT_SWARM_DEFAULT_PALETTE.id,
      theme: currentTheme,
      paletteIndex,
      paletteStartBar,
      nextPaletteBar,
      nextEvolveBar,
      arrangement: {
        brightness: Number(arrangement.brightness) || 0,
        filter: Number(arrangement.filter) || 0,
        density: Number(arrangement.density) || 0,
        octaveEmphasis: Number(arrangement.octaveEmphasis) || 0,
        accentStrength: Number(arrangement.accentStrength) || 0,
      },
      roles: {
        bass: String(roleInstruments[BEAT_EVENT_ROLES.BASS] || '').trim(),
        lead: String(roleInstruments[BEAT_EVENT_ROLES.LEAD] || '').trim(),
        accent: String(roleInstruments[BEAT_EVENT_ROLES.ACCENT] || '').trim(),
        motion: String(roleInstruments[BEAT_EVENT_ROLES.MOTION] || '').trim(),
      },
    };
  }

  return {
    palette: BEAT_SWARM_DEFAULT_PALETTE,
    updateForBar,
    noteSectionDirective,
    resolveRoleInstrument,
    reset,
    invalidate,
    getSnapshot,
  };
}
