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

function normalizeLaneRoleToken(rawValue) {
  const raw = String(rawValue || '').trim().toLowerCase();
  if (raw === 'bass' || raw === 'drum' || raw === 'groove' || raw === 'rhythm') return BEAT_EVENT_ROLES.BASS;
  if (raw === 'lead' || raw === 'melody' || raw === 'phrase') return BEAT_EVENT_ROLES.LEAD;
  if (raw === 'accent' || raw === 'fx' || raw === 'effect') return BEAT_EVENT_ROLES.ACCENT;
  if (raw === 'motion' || raw === 'cosmetic' || raw === 'texture' || raw === 'ambient') return BEAT_EVENT_ROLES.MOTION;
  return '';
}

function normalizeRegisterClassToken(rawValue) {
  const raw = String(rawValue || '').trim().toLowerCase();
  if (raw === 'low' || raw === 'mid' || raw === 'high') return raw;
  if (raw === 'sub') return 'low';
  if (raw === 'mid_low' || raw === 'mid-low' || raw === 'midlow') return 'mid';
  if (raw === 'mid_high' || raw === 'mid-high' || raw === 'midhigh') return 'high';
  return '';
}

function normalizeCombatRoleToken(rawValue) {
  const raw = String(rawValue || '').trim().toLowerCase();
  if (raw === 'foundation' || raw === 'melodic' || raw === 'percussive' || raw === 'texture' || raw === 'punctuation') return raw;
  return '';
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

function getEntryPitchRank(entry) {
  const explicit = Math.trunc(Number(entry?.pitchRank));
  if (Number.isFinite(explicit) && explicit >= 1 && explicit <= 5) return explicit;
  const oct = parseEntryBaseOctave(entry);
  if (Number.isFinite(oct)) {
    if (oct <= 2) return 1;
    if (oct === 3) return 2;
    if (oct === 4) return 3;
    if (oct === 5) return 4;
    if (oct >= 6) return 5;
  }
  return null;
}

function entryHasToy(entry, toyKey) {
  const key = String(toyKey || '').trim().toLowerCase();
  if (!key) return false;
  const toys = Array.isArray(entry?.recommendedToys) ? entry.recommendedToys : [];
  return toys.map((t) => String(t || '').trim().toLowerCase()).includes(key);
}

function entryHasAnyRecommendedToy(entry) {
  return Array.isArray(entry?.recommendedToys) && entry.recommendedToys.length > 0;
}

function entryMatchesTheme(entry, themeKey) {
  const key = String(themeKey || '').trim();
  if (!key) return true;
  const themes = Array.isArray(entry?.themes) ? entry.themes : [];
  return themes.includes(key);
}

function entryRoleCompatible(entry, roleKey) {
  if (!entry || !roleKey) return false;
  const laneRole = normalizeLaneRoleToken(entry?.laneRole);
  if (roleKey === BEAT_EVENT_ROLES.BASS) {
    // Bass foundation should stay on explicit bass-lane instruments.
    return laneRole === BEAT_EVENT_ROLES.BASS;
  }
  return true;
}

function entryLaneScore(entry, roleKey, roleToys) {
  const type = String(entry?.type || '').trim().toLowerCase();
  const family = String(entry?.instrumentFamily || '').trim().toLowerCase();
  const fn = String(entry?.functionTag || '').trim().toLowerCase();
  const id = String(entry?.id || '').trim().toLowerCase();
  const display = String(entry?.display || '').trim().toLowerCase();
  const pitchRank = getEntryPitchRank(entry);
  const laneRole = normalizeLaneRoleToken(entry?.laneRole);
  const registerClass = normalizeRegisterClassToken(entry?.registerClass);
  const combatRole = normalizeCombatRoleToken(entry?.combatRole);
  const laneHints = Array.isArray(entry?.laneHints) ? entry.laneHints.map((h) => String(h || '').trim().toLowerCase()) : [];
  const hasLoop = roleToys.some((t) => t === 'loopgrid' || t === 'loopgrid-drum') && (entryHasToy(entry, 'loopgrid') || entryHasToy(entry, 'loopgrid-drum'));
  const hasDraw = roleToys.includes('drawgrid') && entryHasToy(entry, 'drawgrid');
  const text = `${type} ${family} ${fn} ${id} ${display}`;
  const isPercussive = /drum|percussion|djembe|clap|cowbell|snare|hihat|hat|kick/.test(text);
  const isBassLike = /bass|kick|sub/.test(text);
  const isMotionLike = /effect|fx|noise|texture|ambient|wind|sweep|whoosh/.test(text);
  const isTonalLeadLike = /piano|string|guitar|kalimba|marimba|xylophone|glockenspiel|ukulele|synth|wind|flute|lead/.test(text);

  let score = 0;
  if (entry?.priority) score += 2.4;
  if (laneRole && laneRole === roleKey) score += 8;
  else if (laneRole) score -= 3;
  if (laneHints.includes(roleKey)) score += 4.5;

  if (roleKey === BEAT_EVENT_ROLES.BASS) {
    if (registerClass === 'low') score += 2.6;
    else if (registerClass === 'mid') score += 0.8;
    else if (registerClass === 'high') score -= 1.6;
    if (combatRole === 'foundation') score += 2.8;
    else if (combatRole === 'percussive') score += 0.9;
    else if (combatRole === 'melodic') score -= 0.8;
    if (hasLoop) score += 3;
    if (isBassLike) score += 3;
    if (isPercussive) score += 1.5;
    if (Number.isFinite(pitchRank)) {
      if (pitchRank <= 2) score += 3.5;
      else if (pitchRank === 3) score += 1.2;
      else score -= 2;
    }
    if (isMotionLike) score -= 1;
    if (hasDraw) score -= 1;
    return score;
  }

  if (roleKey === BEAT_EVENT_ROLES.LEAD) {
    if (registerClass === 'high') score += 2;
    else if (registerClass === 'mid') score += 1.2;
    else if (registerClass === 'low') score -= 1.6;
    if (combatRole === 'melodic') score += 2.2;
    else if (combatRole === 'foundation') score -= 1;
    if (hasDraw) score += 3;
    if (hasLoop) score += 0.8;
    if (isTonalLeadLike) score += 2;
    if (isPercussive) score -= 1.5;
    if (Number.isFinite(pitchRank)) {
      if (pitchRank >= 3 && pitchRank <= 5) score += 3;
      else if (pitchRank === 2) score += 0.5;
      else if (pitchRank === 1) score -= 2;
    }
    return score;
  }

  if (roleKey === BEAT_EVENT_ROLES.MOTION) {
    if (combatRole === 'texture') score += 2.4;
    else if (combatRole === 'melodic') score -= 0.6;
    if (hasDraw) score += 1.5;
    if (isMotionLike) score += 3;
    if (isPercussive) score += 1;
    if (isBassLike) score -= 2;
    if (Number.isFinite(pitchRank)) {
      if (pitchRank >= 4) score += 1.5;
      else if (pitchRank <= 2) score -= 1.5;
    }
    return score;
  }

  // Accent lane
  if (registerClass === 'mid') score += 1.1;
  if (combatRole === 'percussive' || combatRole === 'punctuation') score += 1.8;
  else if (combatRole === 'foundation') score -= 0.6;
  if (hasLoop || hasDraw) score += 1.5;
  if (isPercussive) score += 2;
  if (isMotionLike) score += 0.5;
  if (isBassLike) score -= 0.5;
  if (Number.isFinite(pitchRank)) {
    if (pitchRank >= 2 && pitchRank <= 4) score += 2;
    else if (pitchRank === 1 || pitchRank === 5) score -= 0.8;
  }
  return score;
}

function pickRoleInstrument(themeKey, role, usedIds = null, previousId = '') {
  const roleKey = normalizeRole(role, BEAT_EVENT_ROLES.ACCENT);
  const roleToys = ROLE_TOY_KEYS[roleKey] || ROLE_TOY_KEYS[BEAT_EVENT_ROLES.ACCENT];
  const used = usedIds instanceof Set ? usedIds : new Set();
  if (previousId) used.add(String(previousId || '').trim());
  const entries = Array.isArray(getInstrumentEntries?.()) ? getInstrumentEntries() : [];
  const eligibleEntries = entries.filter((e) => e?.id && entryHasAnyRecommendedToy(e) && entryRoleCompatible(e, roleKey));
  if (eligibleEntries.length) {
    const unused = eligibleEntries.filter((e) => e?.id && !used.has(String(e.id || '').trim()));
    const toyPool = unused.filter((e) => roleToys.some((toy) => entryHasToy(e, toy)));
    const anyToyPool = eligibleEntries.filter((e) => roleToys.some((toy) => entryHasToy(e, toy)));
    const bassToyPool = roleKey === BEAT_EVENT_ROLES.BASS
      ? toyPool.filter((e) => entryHasToy(e, 'loopgrid') || entryHasToy(e, 'loopgrid-drum'))
      : toyPool;
    const bassAnyToyPool = roleKey === BEAT_EVENT_ROLES.BASS
      ? anyToyPool.filter((e) => entryHasToy(e, 'loopgrid') || entryHasToy(e, 'loopgrid-drum'))
      : anyToyPool;
    const basePool = toyPool.length
      ? (bassToyPool.length ? bassToyPool : toyPool)
      : (unused.length ? unused : ((bassAnyToyPool.length ? bassAnyToyPool : (anyToyPool.length ? anyToyPool : eligibleEntries))));
    const themed = basePool.filter((e) => entryMatchesTheme(e, themeKey));
    const scoringPool = themed.length ? themed : basePool;
    const roleScoringPool = roleKey === BEAT_EVENT_ROLES.BASS
      ? scoringPool.filter((e) => entryHasToy(e, 'loopgrid') || entryHasToy(e, 'loopgrid-drum'))
      : scoringPool;
    if (roleScoringPool.length) {
      const explicitLanePool = roleScoringPool.filter((entry) => normalizeLaneRoleToken(entry?.laneRole) === roleKey);
      const weightedPool = explicitLanePool.length ? explicitLanePool : roleScoringPool;
      const priorityWeightedPool = weightedPool.filter((entry) => entry?.priority === true);
      const selectionPool = priorityWeightedPool.length ? priorityWeightedPool : weightedPool;
      const ranked = weightedPool
        .slice()
        .sort((a, b) => {
          const sa = entryLaneScore(a, roleKey, roleToys);
          const sb = entryLaneScore(b, roleKey, roleToys);
          if (sb !== sa) return sb - sa;
          return String(a?.id || '').localeCompare(String(b?.id || ''));
        });
      const rankedFromSelection = selectionPool
        .slice()
        .sort((a, b) => {
          const sa = entryLaneScore(a, roleKey, roleToys);
          const sb = entryLaneScore(b, roleKey, roleToys);
          if (sb !== sa) return sb - sa;
          return String(a?.id || '').localeCompare(String(b?.id || ''));
        });
      const topScore = entryLaneScore(rankedFromSelection[0], roleKey, roleToys);
      const nearBest = rankedFromSelection.filter((e) => (topScore - entryLaneScore(e, roleKey, roleToys)) <= 0.75);
      const pickPool = nearBest.length ? nearBest : rankedFromSelection;
      const picked = pickPool[Math.floor(Math.random() * pickPool.length)] || rankedFromSelection[0];
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

function canReuseRoleInstrumentId(instrumentId, themeKey, role) {
  const id = String(instrumentId || '').trim();
  if (!id) return false;
  const roleKey = normalizeRole(role, BEAT_EVENT_ROLES.ACCENT);
  const roleToys = ROLE_TOY_KEYS[roleKey] || ROLE_TOY_KEYS[BEAT_EVENT_ROLES.ACCENT];
  const entries = Array.isArray(getInstrumentEntries?.()) ? getInstrumentEntries() : [];
  const entry = entries.find((e) => String(e?.id || '').trim() === id) || null;
  if (!entry) return false;
  if (!entryHasAnyRecommendedToy(entry)) return false;
  if (!entryRoleCompatible(entry, roleKey)) return false;
  if (!entryMatchesTheme(entry, themeKey)) return false;
  return roleToys.some((toy) => entryHasToy(entry, toy));
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
      const prevReusable = prev && canReuseRoleInstrumentId(prev, currentTheme, role);
      const picked = prevReusable ? prev : pickRoleInstrument(currentTheme, role, used, prev);
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
