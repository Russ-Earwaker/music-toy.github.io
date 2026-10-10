import { STRUCTURE_TYPES, structureTypeLabel } from './structure-types.js';
export const MODIFIER_TYPES = Object.freeze(['transpose','chord-progression']);
export const LOGIC_NODE_TYPES = Object.freeze([...STRUCTURE_TYPES, ...MODIFIER_TYPES]);
export const isModifier = type => MODIFIER_TYPES.includes(type);
export const normalizeSemitones = value => Math.max(-12, Math.min(12, Math.trunc(Number(value) || 0)));
export const logicNodeLabel = type => type === 'transpose' ? 'Transpose' : type === 'chord-progression' ? 'Chord Progression' : structureTypeLabel(type);
export const signedSemitones = value => Number(value) > 0 ? '+' + value : String(value);
