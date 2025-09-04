// src/toy-hydration-observer.js
// Logs when toy panels receive DOM children so we know their initializers ran.
(function(){
  const toIds = (arr)=>arr.map(el=>el.id||el.getAttribute('data-toy-id')||el.getAttribute('data-toy'));
  const targets = Array.from(document.querySelectorAll('[data-toy], [data-toy-id]'));
  if (!targets.length) return;
  console.log('[toy-observer] watching', toIds(targets));
  const mo = new MutationObserver((muts)=>{
    for (const m of muts) {
      if (m.type === 'childList' && (m.addedNodes?.length || m.removedNodes?.length)) {
        const id = m.target.id || m.target.getAttribute('data-toy-id') || m.target.getAttribute('data-toy');
        console.log('[toy-observer] change @', id, 'added:', m.addedNodes.length, 'removed:', m.removedNodes.length);
      }
      if (m.type === 'attributes' && m.attributeName) {
        const id = m.target.id || m.target.getAttribute('data-toy-id') || m.target.getAttribute('data-toy');
        console.log('[toy-observer] attr @', id, m.attributeName, '=>', m.target.getAttribute(m.attributeName));
      }
    }
  });
  targets.forEach(t => mo.observe(t, { childList:true, subtree:false, attributes:true }));
})();
