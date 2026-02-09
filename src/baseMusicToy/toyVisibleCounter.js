// src/baseMusicToy/toyVisibleCounter.js
// DrawGrid-standard "visibleCount" counter:
// - Each panel contributes 0/1 to a global visibleCount
// - Caller decides what "visible" means; base only maintains consistency
//
// Why: multiple toys want "how many toys are visible?" without copy/paste bugs.

export function createToyVisibleCounter({
  getCount = () => 0,
  setCount = (n) => {},
  // Per-toy unique flag name to store on the panel object (keeps it multi-instance safe).
  panelFlag = '__bmCountedVisible',
} = {}) {
  const read = () => {
    try {
      const v = Number(getCount());
      return Number.isFinite(v) ? v : 0;
    } catch {
      return 0;
    }
  };
  const write = (n) => {
    try { setCount(Math.max(0, n | 0)); } catch {}
  };

  function setPanelVisible(panel, visible) {
    const next = !!visible;
    let counted = false;
    try { counted = !!panel?.[panelFlag]; } catch { counted = false; }

    if (next && !counted) {
      try { panel[panelFlag] = true; } catch {}
      write(read() + 1);
      return true;
    }
    if (!next && counted) {
      try { panel[panelFlag] = false; } catch {}
      write(read() - 1);
      return true;
    }
    return false;
  }

  function clearPanel(panel) {
    try {
      if (panel && panel[panelFlag]) {
        panel[panelFlag] = false;
        write(read() - 1);
        return true;
      }
    } catch {}
    return false;
  }

  return {
    setPanelVisible,
    clearPanel,
  };
}

