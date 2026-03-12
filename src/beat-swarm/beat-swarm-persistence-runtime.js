export function installBeatSwarmPersistenceRuntime(deps = {}) {
  const state = deps.state && typeof deps.state === 'object' ? deps.state : {};
  const helpers = deps.helpers && typeof deps.helpers === 'object' ? deps.helpers : {};
  const windowObj = deps.windowObj;
  const documentObj = deps.documentObj;
  const persistIfActive = () => {
    if (!state.isActive?.()) return;
    helpers.persistBeatSwarmState?.();
  };
  try {
    windowObj?.addEventListener?.('beforeunload', persistIfActive, { capture: true });
    windowObj?.addEventListener?.('pagehide', persistIfActive, { capture: true });
  } catch {}

  const restore = helpers.consumeBeatSwarmPersistedState?.();
  if (!restore?.active) return;
  const doRestore = () => {
    try { helpers.enterBeatSwarmMode?.({ restoreState: restore }); } catch {}
    try {
      if (!helpers.isRunning?.()) helpers.startTransport?.();
    } catch {}
  };
  if (documentObj?.readyState === 'complete' || documentObj?.readyState === 'interactive') {
    setTimeout(doRestore, 0);
  } else {
    windowObj?.addEventListener?.('DOMContentLoaded', doRestore, { once: true });
  }
}
