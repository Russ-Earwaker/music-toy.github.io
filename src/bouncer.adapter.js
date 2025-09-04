// Adapter: unify bouncer boot for the init helper
// Usage 1 (module): import { boot } from './bouncer.adapter.js'; boot('toy-b1');
// Usage 2 (global): include bouncer-boot-shim.js (below) to expose window.Bouncer.boot

import { createBouncer } from './bouncer.main.js';

/**
 * Boot a bouncer into a DOM node identified by toyId or provided element.
 * Returns whatever createBouncer returns.
 */
export function boot(toyId, el){
  const root =
    el ||
    document.getElementById(toyId) ||
    document.querySelector(`[data-toy-id="${toyId}"]`);

  if (!root) throw new Error(`[bouncer.adapter] No DOM node for ${toyId}`);

  // Most builds of createBouncer accept a single 'root' arg.
  // If yours also accepts options, pass { toyId } as second arg if needed.
  try {
    return createBouncer(root, { toyId });
  } catch (e) {
    // Fallback: single-arg signature
    return createBouncer(root);
  }
}

export default { boot };
