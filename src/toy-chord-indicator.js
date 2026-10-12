import {resolveChordAtTick, chordLabel} from './chord-progression.js';

// The caller supplies the same selected occurrence and transport position as
// the visible playhead. Lookahead events never advance this display.
export function activeToyChord({instance, currentTick, playing, role} = {}) {
  if (!playing || !instance?.active || !['melody','accompaniment'].includes(role)
      || !Number.isFinite(currentTick) || currentTick < instance.startTick
      || currentTick >= (instance.endTick ?? Infinity)) return null;
  const chord = resolveChordAtTick(instance.context, currentTick);
  return chord ? chordLabel(chord) : null;
}

export function createToyChordIndicator() {
  const badges = new WeakMap();
  return function update(panel, playback) {
    const label = activeToyChord(playback);
    let badge = badges.get(panel);
    if (!label) { if (badge && !badge.hidden) badge.hidden = true; return; }
    if (!badge?.isConnected) {
      const name = panel.querySelector('.master-name,.instance-name');
      if (!name) return;
      let anchor = name.closest('.toy-chord-anchor');
      if (!anchor) {
        anchor = document.createElement('span'); anchor.className = 'toy-chord-anchor';
        name.before(anchor); anchor.append(name);
      }
      badge = document.createElement('span'); badge.className = 'toy-active-chord';
      anchor.append(badge); badges.set(panel, badge);
    }
    const changed = badge.textContent !== label || badge.hidden;
    if (changed) {
      badge.classList.remove('chord-change');
      badge.textContent = label;
      badge.setAttribute('aria-label', `Current chord: ${label}`);
      badge.hidden = false;
      void badge.offsetWidth;
      badge.classList.add('chord-change');
    }
  };
}
