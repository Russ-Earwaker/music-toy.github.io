export const MUSICAL_ROLES = Object.freeze(['melody', 'accompaniment', 'percussion']);
export const normalizeMusicalRole = role => role === 'bass' ? 'accompaniment' : role;
export const defaultMusicalRole = toyType => toyType === 'drawgrid' ? 'melody'
  : ['loopgrid', 'loopgrid-drum'].includes(toyType) ? 'percussion' : null;
export function initializeToyMusicalRole(panel) {
  if (panel.dataset.musicalRole || panel.dataset.musicalRoleLegacy === '1') return;
  const role = defaultMusicalRole(panel.dataset.toy);
  if (role) panel.dataset.musicalRole = role;
}
export function restoreToyMusicalRole(panel, state) {
  if (!state) return;
  if (['loopgrid', 'loopgrid-drum'].includes(panel.dataset.toy)) {
    panel.dataset.musicalRole = 'percussion';
    delete panel.dataset.musicalRoleLegacy;
  } else if (MUSICAL_ROLES.includes(normalizeMusicalRole(state.musicalRole))) {
    panel.dataset.musicalRole = normalizeMusicalRole(state.musicalRole);
    delete panel.dataset.musicalRoleLegacy;
  } else {
    delete panel.dataset.musicalRole;
    panel.dataset.musicalRoleLegacy = '1';
    // Simple Rhythm's normal mode is percussion, including restored scenes.
    if (['loopgrid', 'loopgrid-drum'].includes(panel.dataset.toy)) panel.dataset.musicalRole = 'percussion';
  }
  panel.dispatchEvent?.(new CustomEvent('toy:role', { bubbles: true }));
}
export function setToyMusicalRole(panel, role) {
  role = normalizeMusicalRole(role);
  if (panel.dataset.toy !== 'drawgrid' || !['melody', 'accompaniment'].includes(role)) return false;
  panel.dataset.musicalRole = role;
  delete panel.dataset.musicalRoleLegacy;
  panel.dispatchEvent(new CustomEvent('toy:role', { detail: { musicalRole: role }, bubbles: true }));
  return true;
}
