// src/baseMusicToy/toyVisibilityObserver.js
// DrawGrid-standard visibility system:
// - IntersectionObserver-based (preferred over getBoundingClientRect polling)
// - Tracks boolean "isVisible" (ONSCREEN) and a 3-state classification:
//   OFFSCREEN / NEARSCREEN / ONSCREEN
//
// Base owns the mechanism; toy owns the policy reaction (tiers, culling, etc.)

export function createToyVisibilityObserver({
  panel,
  root = null,                 // optional root element for IO
  thresholdRatio = 0.06,       // match DrawGrid semantics
  onChange = null,             // ({ visible, state, ratio, entry }) => void
} = {}) {
  const st = {
    observer: null,
    visible: true,
    state: 'ONSCREEN',
    ratio: 1,
  };

  const hasIO = (typeof window !== 'undefined') && ('IntersectionObserver' in window);
  if (!hasIO || !panel) {
    return {
      st,
      disconnect() {},
      getVisible: () => st.visible,
      getState: () => st.state,
      getRatio: () => st.ratio,
    };
  }

  function classify(entry) {
    const ratio = (typeof entry?.intersectionRatio === 'number')
      ? entry.intersectionRatio
      : (entry?.isIntersecting ? 1 : 0);

    const nextState = (!entry?.isIntersecting || ratio <= 0)
      ? 'OFFSCREEN'
      : (ratio >= thresholdRatio ? 'ONSCREEN' : 'NEARSCREEN');

    const visible = !!(entry?.isIntersecting && (
      typeof entry?.intersectionRatio !== 'number' ? true : (entry.intersectionRatio >= thresholdRatio)
    ));

    return { visible, state: nextState, ratio };
  }

  try {
    st.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target !== panel) continue;
        const c = classify(entry);
        const changed =
          (c.visible !== st.visible) ||
          (c.state !== st.state) ||
          (Math.abs((c.ratio || 0) - (st.ratio || 0)) > 0.02);

        if (!changed) continue;

        st.visible = c.visible;
        st.state = c.state;
        st.ratio = c.ratio;

        try {
          if (typeof onChange === 'function') onChange({ ...c, entry });
        } catch {}
      }
    }, {
      root: root || null,
      threshold: [0, thresholdRatio],
    });

    st.observer.observe(panel);
  } catch {
    // ignore
  }

  return {
    st,
    disconnect() {
      try { st.observer?.disconnect?.(); } catch {}
      st.observer = null;
    },
    getVisible: () => st.visible,
    getState: () => st.state,
    getRatio: () => st.ratio,
  };
}

