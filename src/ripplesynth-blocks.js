// src/ripplesynth-blocks.js
// Shared drawing logic for cube-like blocks used in Bouncer, Wheel, etc.

import { drawBlock, drawThirdsGuides } from './toyhelpers.js';

/**
 * Draws a section of blocks, handling active states, flashing, and advanced UI hints.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<Object>} blocks - Array of block objects {x,y,w,h,active,noteIndex,flashEnd,flashDur,...}
 * @param {number} offsetX
 * @param {number} offsetY
 * @param {number|null} selectedIndex - Index of the currently selected block.
 * @param {number} scale - Visual scale factor.
 * @param {Array<string>} noteNames - Full list of note names for labels.
 * @param {Object} sizing - Sizing helper from the toy.
 * @param {any} notePalette - (Not currently used, for future expansion).
 * @param {string|null} whichThird - 'up', 'toggle', 'down' for interaction hints.
 * @param {number} now - Current time in seconds from performance.now().
 */
export function drawBlocksSection(ctx, blocks, offsetX = 0, offsetY = 0, selectedIndex = null, scale = 1, noteNames = [], sizing = null, notePalette = null, whichThird = null, now = 0) {
  if (!ctx || !Array.isArray(blocks)) return;

  const isZoomed = sizing?.isZoomed ? sizing.isZoomed() : (sizing?.scale > 1.1);

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b) continue;

    // Calculate flash intensity (0-1). Use the strongest of time-based and instant channels.
    let flash = 0;
    if (b.flashEnd && b.flashDur) {
      const elapsed = now - (b.flashEnd - b.flashDur);
      if (elapsed >= 0 && elapsed < b.flashDur) {
        flash = Math.max(flash, 1.0 - (elapsed / b.flashDur));
      }
    }
    const flashProp = Math.max(0, b.flash || 0, b.cflash || 0, b.pulse || 0);
    flash = Math.max(flash, flashProp);

    const isActive = b.active !== false;
    const baseColor = isActive ? '#ff8c00' : '#333';

    const opts = {
      baseColor: baseColor,
      active: isActive || flash > 0.1,
      flash,
      offsetX,
      offsetY,
      noteLabel: (isZoomed ? (b.labelOverride ?? ((b.noteIndex != null) ? (noteNames[b.noteIndex] || '') : null)) : null),
      showArrows: isZoomed,
      // Use the beveled 'button' style in both modes for consistency with Bouncer
      variant: 'button'
    };

    drawBlock(ctx, b, opts);

    if (isZoomed && i === selectedIndex) {
      drawThirdsGuides(ctx, { x: b.x + offsetX, y: b.y + offsetY, w: b.w, h: b.h });
    }
  }
}
