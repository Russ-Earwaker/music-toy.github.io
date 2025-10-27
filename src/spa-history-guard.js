(() => {
  if (!history.state || !history.state.__guard) {
    history.replaceState({ __guard: true }, '', location.href);
  }
  window.addEventListener('popstate', (e) => {
    // Immediately push the same state back so back-swipe does nothing
    history.pushState({ __guard: true }, '', location.href);
  });
})();