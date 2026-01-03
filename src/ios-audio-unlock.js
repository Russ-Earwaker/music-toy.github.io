// src/ios-audio-unlock.js
// One-time, belt-and-braces unlock for iOS/WebKit + "resume on visibility".
import { ensureAudioContext, peekAudioContext } from './audio-core.js';

// Track whether we've already had a real user gesture so we don't
// spin up the AudioContext during passive events like pageshow/visibility.
let userGestureSeen = false;

function playSilentClick(ctx) {
  try {
    // Short silent buffer is the most reliable unlock across iOS versions.
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    // Start ASAP; don't schedule in the future (gesture must contain it).
    s.start(0);
  } catch {}
}

function shouldAttempt(reason) {
  if (reason === 'gesture') return true;
  if (userGestureSeen) return true;
  // Only resume on non-gesture events if a context already exists.
  return !!peekAudioContext();
}

async function tryResume(reason) {
  if (!shouldAttempt(reason)) return;
  try {
    const ctx = ensureAudioContext();
    if (ctx.state !== 'running') {
      // Some iOS builds need an audible-ish routing to fully unblock
      playSilentClick(ctx);
      await ctx.resume();
      // Optional: onstatechange sometimes fires "interrupted" -> "running"
    }
  } catch (e) {
    // Swallow; we'll try again on the next gesture/visibilitychange
  }
}

export function installIOSAudioUnlock() {
  if (window.__mtIOSUnlockInstalled) return;
  window.__mtIOSUnlockInstalled = true;

  const once = { once: true, passive: false, capture: true };
  const tryOnce = async (e) => {
    // Keep the gesture "active"; prevent page zoom/scroll on the very first tap.
    userGestureSeen = true;
    try {
      const tgt = e?.target;
      const tag = tgt?.tagName ? String(tgt.tagName).toUpperCase() : '';
      const type = (tag === 'INPUT') ? String(tgt.type || '').toLowerCase() : '';
      const isFormControl = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON';
      const isEditable = !!tgt?.isContentEditable;
      const allowDefault = isFormControl || isEditable || type === 'range';
      if (!allowDefault) e.preventDefault();
    } catch {}
    await tryResume('gesture');
    // Remove all listeners after first success attempt
    remove();
  };

  function remove() {
    ['pointerdown','touchstart','mousedown','keydown','click'].forEach(t => {
      window.removeEventListener(t, tryOnce, true);
    });
  }

  // First real user gesture wins
  ['pointerdown','touchstart','mousedown','keydown','click'].forEach(t => {
    window.addEventListener(t, tryOnce, once);
  });

  // If the tab returns to foreground on iOS, try to re-resume
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { tryResume('visible'); }
  }, { passive: true, capture: false });

  // On iOS PWA / standalone, sometimes pages load "suspended": retry shortly after load
  window.addEventListener('pageshow', () => { tryResume('pageshow'); }, { passive: true });
}
