// src/drawgrid/dg-hydration-helpers.js

export function createDgHydrationHelpers(getState) {
  function scheduleHydrationLayoutRetry(panel, layoutFn) {
    const S = getState();
    if (S.hydrationState.retryRaf) return;
    if (!S.__dgHydrationPendingRedraw) return;
    S.hydrationState.retryRaf = requestAnimationFrame(() => {
      S.hydrationState.retryRaf = 0;
      if (!S.__dgHydrationPendingRedraw) return;
      if (!panel?.isConnected) return;
      S.hydrationState.retryCount++;
      try { layoutFn?.(); } catch {}
      if (S.hydrationState.retryCount < 6 && S.__dgHydrationPendingRedraw) {
        scheduleHydrationLayoutRetry(panel, layoutFn);
      } else {
        S.hydrationState.retryCount = 0;
      }
    });
  }

  function inCommitWindow(nowTs) {
    const S = getState();
    if (Number.isFinite(S.__dgBypassCommitUntil) && nowTs < S.__dgBypassCommitUntil) return false;
    const win = (typeof window !== 'undefined') ? window : null;
    const lp = win?.__LAST_POINTERUP_DIAG__;
    const gestureSettle = win?.__GESTURE_SETTLE_UNTIL_TS || (lp?.t0 ? lp.t0 + 200 : 0);
    const deferUntil = S.__dgDeferUntilTs || 0;
    const guardUntil = Math.max(gestureSettle || 0, deferUntil);
    return guardUntil > 0 && nowTs < guardUntil;
  }

  return { scheduleHydrationLayoutRetry, inCommitWindow };
}
