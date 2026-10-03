// Own the popup even while its catalog is loading. Disposal is idempotent.
export function createInstrumentPopupOwner({ panel, document, onClose, Observer = globalThis.MutationObserver }) {
  let closed = false;
  const session = {
    get closed() { return closed; },
    close(result = null) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', escape, true);
      panel?.removeEventListener('toy:dispose', dispose);
      observer?.disconnect();
      onClose(result);
    },
  };
  const escape = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); session.close(); } };
  const dispose = () => session.close();
  document.addEventListener('keydown', escape, true);
  panel?.addEventListener('toy:dispose', dispose);
  const observer = Observer && panel ? new Observer(() => { if (!panel.isConnected) session.close(); }) : null;
  observer?.observe(document.body, { childList: true, subtree: true });
  return session;
}
