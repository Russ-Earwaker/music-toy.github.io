// src/zoom-normalizer.js
// Cleanup only: unwrap any .zoom-normalizer wrappers created earlier. No new changes applied.
(function(){
  function unwrap(n){
    const parent = n.parentNode;
    if (!parent) return;
    while (n.firstChild) parent.insertBefore(n.firstChild, n);
    parent.removeChild(n);
  }
  function undoAll(){
    document.querySelectorAll('.zoom-normalizer').forEach(unwrap);
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', undoAll);
  } else {
    undoAll();
  }
})();