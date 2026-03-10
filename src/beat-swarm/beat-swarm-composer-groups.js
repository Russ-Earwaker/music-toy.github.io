import {
  normalizeCallResponseLane,
  pickComposerGroupTemplate,
  createComposerGroupStepLoop,
} from './beat-swarm-groups.js';

function chooseIndexed(items, index = 0, fallback = '') {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return fallback;
  const i = ((Math.trunc(Number(index) || 0) % list.length) + list.length) % list.length;
  return String(list[i] || fallback);
}

export function pickComposerGroupShape(options = null) {
  return chooseIndexed(options?.shapes, options?.index, String(options?.fallback || 'circle'));
}

export function pickComposerGroupColor(options = null) {
  return chooseIndexed(options?.colors, options?.index, String(options?.fallback || '#ff8b6e'));
}

export function createComposerEnemyGroupProfile(options = null) {
  const groupIndex = Math.max(0, Math.trunc(Number(options?.groupIndex) || 0));
  const constants = options?.constants && typeof options.constants === 'object' ? options.constants : {};
  const roles = options?.roles && typeof options.roles === 'object' ? options.roles : {};
  const threat = options?.threat && typeof options.threat === 'object' ? options.threat : {};

  const stepsPerBar = Math.max(1, Math.trunc(Number(constants.stepsPerBar) || 8));
  const notesMin = Math.max(1, Math.trunc(Number(constants.notesMin) || 3));
  const notesMax = Math.max(notesMin, Math.trunc(Number(constants.notesMax) || 5));
  const loopHitsMin = Math.max(1, Math.trunc(Number(constants.loopHitsMin) || 2));
  const loopHitsMax = Math.max(loopHitsMin, Math.trunc(Number(constants.loopHitsMax) || 3));
  const performersMin = Math.max(1, Math.trunc(Number(constants.performersMin) || 1));
  const performersMax = Math.max(performersMin, Math.trunc(Number(constants.performersMax) || 2));
  const sizeMin = Math.max(1, Math.trunc(Number(constants.sizeMin) || 4));
  const sizeMax = Math.max(sizeMin, Math.trunc(Number(constants.sizeMax) || 7));
  const actions = Array.isArray(constants.actions) ? constants.actions : ['projectile'];

  const randRange = typeof options?.randRange === 'function' ? options.randRange : ((a, b) => a + (Math.random() * (b - a)));
  const normalizeRole = typeof options?.normalizeRole === 'function' ? options.normalizeRole : ((x, y) => String(x || y || '').trim().toLowerCase());
  const normalizeNoteName = typeof options?.normalizeNoteName === 'function' ? options.normalizeNoteName : ((x) => String(x || '').trim());
  const clampNoteToPool = typeof options?.clampNoteToPool === 'function' ? options.clampNoteToPool : ((x) => x);
  const getPaletteArrangementControls = typeof options?.getPaletteArrangementControls === 'function' ? options.getPaletteArrangementControls : (() => ({ density: 0.5, octaveEmphasis: 0.5, accentStrength: 0.5 }));
  const getCurrentSwarmEnergyStateName = typeof options?.getCurrentSwarmEnergyStateName === 'function' ? options.getCurrentSwarmEnergyStateName : (() => 'main_mid');
  const getEnergyStateThemePreset = typeof options?.getEnergyStateThemePreset === 'function' ? options.getEnergyStateThemePreset : (() => null);
  const pickRandomArrayItem = typeof options?.pickRandomArrayItem === 'function' ? options.pickRandomArrayItem : (() => null);
  const getLockedMotifHook = typeof options?.getLockedMotifHook === 'function' ? options.getLockedMotifHook : (() => null);
  const getComposerMotifScopeKey = typeof options?.getComposerMotifScopeKey === 'function' ? options.getComposerMotifScopeKey : (() => 'default');
  const getSwarmPentatonicNoteByIndex = typeof options?.getSwarmPentatonicNoteByIndex === 'function' ? options.getSwarmPentatonicNoteByIndex : (() => 'C4');
  const createStepPattern = typeof options?.createStepPattern === 'function' ? options.createStepPattern : ((p) => (Array.isArray(p) ? p : []));
  const applyStepPatternDensity = typeof options?.applyStepPatternDensity === 'function' ? options.applyStepPatternDensity : ((p) => (Array.isArray(p) ? p : []));
  const pickEnemyInstrumentIdForToyRandom = typeof options?.pickEnemyInstrumentIdForToyRandom === 'function' ? options.pickEnemyInstrumentIdForToyRandom : (() => '');
  const resolveSwarmSoundInstrumentId = typeof options?.resolveSwarmSoundInstrumentId === 'function' ? options.resolveSwarmSoundInstrumentId : (() => '');

  const leadRole = String(roles.lead || 'lead');
  const bassRole = String(roles.bass || 'bass');
  const fullThreat = String(threat.full || 'full').trim().toLowerCase() || 'full';
  const templateLike = options?.templateLike || null;
  const template = templateLike || pickComposerGroupTemplate({
    templates: options?.templates,
    groupIndex,
    energyState: getCurrentSwarmEnergyStateName(),
    normalizeRole: (roleName) => normalizeRole(roleName, leadRole),
    bassRole,
    fullThreat,
  }) || {};

  const arrangement = getPaletteArrangementControls();
  const templateId = String(template?.id || `template-${groupIndex}`);
  const role = normalizeRole(template?.role || leadRole, leadRole);
  const theme = getEnergyStateThemePreset();
  const phrase = pickRandomArrayItem(theme?.composerPhrases, null);
  const lockedHook = getLockedMotifHook(getComposerMotifScopeKey(), 4);

  const fallbackNotesCount = Math.max(notesMin, Math.min(notesMax, Math.trunc(randRange(notesMin, notesMax + 1))));
  const notes = Array.isArray(template?.notes) && template.notes.length
    ? template.notes.map((n, i) => clampNoteToPool(normalizeNoteName(n), i))
    : (Array.isArray(phrase?.notes) && phrase.notes.length
      ? phrase.notes.map((n, i) => clampNoteToPool(normalizeNoteName(n), i))
      : (Array.isArray(lockedHook?.notes) && lockedHook.notes.length
        ? lockedHook.notes.map((n, i) => clampNoteToPool(normalizeNoteName(n), i))
        : Array.from({ length: fallbackNotesCount }, (_, i) => getSwarmPentatonicNoteByIndex(i))));

  const templateSteps = Array.isArray(template?.motif?.steps) ? template.motif.steps : null;
  const stepsBase = Array.isArray(templateSteps) && templateSteps.length
    ? createStepPattern(templateSteps, stepsPerBar)
    : (Array.isArray(phrase?.steps) ? createStepPattern(phrase.steps, stepsPerBar) : createComposerGroupStepLoop({
      stepsPerBar,
      minHits: loopHitsMin,
      maxHits: loopHitsMax,
      rand: Math.random,
    }));
  const steps = applyStepPatternDensity(stepsBase, arrangement.density, { minHits: 1, maxHits: Math.max(2, stepsPerBar - 1) });

  let actionType = String(
    template?.actionType || phrase?.actionType
    || actions[Math.max(0, Math.min(actions.length - 1, Math.trunc(Math.random() * actions.length)))]
    || 'projectile'
  );
  if (arrangement.accentStrength < 0.38) actionType = 'projectile';

  const threatLevel = String(template?.threatLevel || fullThreat).trim().toLowerCase() || fullThreat;
  const performerBase = Math.max(performersMin, Math.min(performersMax, Math.trunc(Number(template?.performers) || randRange(performersMin, performersMax + 1))));
  const sizeBase = Math.max(sizeMin, Math.min(sizeMax, Math.trunc(Number(template?.size) || randRange(sizeMin, sizeMax + 1))));
  const performerBias = arrangement.density > 0.64 ? 1 : (arrangement.density < 0.34 ? -1 : 0);
  const sizeBias = arrangement.octaveEmphasis > 0.62 ? 1 : (arrangement.octaveEmphasis < 0.32 ? -1 : 0);
  const performers = Math.max(performersMin, Math.min(performersMax, performerBase + performerBias));
  const size = Math.max(sizeMin, Math.min(sizeMax, sizeBase + sizeBias));

  const toyKey = role === bassRole ? 'loopgrid-drum' : 'drawgrid';
  const instrumentLane = role === bassRole ? 'bass' : 'lead';
  const instrument = pickEnemyInstrumentIdForToyRandom(toyKey, null, { lane: instrumentLane, role }) || resolveSwarmSoundInstrumentId('projectile') || 'tone';

  return {
    templateId,
    role,
    notes,
    steps,
    actionType,
    threatLevel,
    performers,
    size,
    instrument,
    callResponseLane: normalizeCallResponseLane(template?.callResponseLane || 'call', 'call'),
    motif: {
      id: String(template?.motif?.id || `${templateId}-motif`),
      steps: steps.slice(0, stepsPerBar),
    },
    shape: pickComposerGroupShape({ shapes: constants.shapes, index: groupIndex, fallback: 'circle' }),
    color: pickComposerGroupColor({ colors: constants.colors, index: groupIndex, fallback: '#ff8b6e' }),
  };
}
