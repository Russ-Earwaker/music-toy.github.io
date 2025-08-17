// src/rippler.contracts.js
// JSDoc typedefs for the rippler modules. Purely informational; no behavior.

/**
 * @typedef {Object} Ripple
 * @property {number} startTime - Audio-time seconds when the ripple started.
 * @property {number} speed     - Pixels per second radial expansion speed.
 * @property {number} offR      - Optional initial radius offset.
 * @property {number} x         - Center x (px).
 * @property {number} y         - Center y (px).
 */

/**
 * @typedef {Object} GeneratorRef
 * @property {number} x
 * @property {number} y
 * @property {number} r
 * @property {boolean} placed
 * @property {(px:number, py:number)=>void} place
 * @property {(px:number, py:number)=>void} set
 */

/**
 * drawWaves signature
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} now
 * @param {number} speed
 * @param {Ripple[]} ripples
 * @param {number} NUM_STEPS
 * @param {()=>number} stepSeconds
 * @returns {void}
 */

/**
 * drawParticles signature
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} now - audio-time
 * @param {Ripple[]} ripples
 * @param {{x:number, y:number}} center
 * @returns {void}
 */

/**
 * makeGetBlockRects signature
 * @param {(nx:number)=>number} n2x
 * @param {(ny:number)=>number} n2y
 * @param {{scale?:number}} sizing
 * @param {number} BASE
 * @param {Array<Object>} blocks
 * @returns {()=>Array<{x:number,y:number,w:number,h:number}>}
 */

export const __rippler_contracts = true;
