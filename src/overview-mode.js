import { publishFrameStart } from './zoom/ZoomCoordinator.js';

const DEFAULT_OVERVIEW_SCALE = 0.3;
const DEFAULT_NORMAL_SCALE = 1;

const OVERVIEW_ZOOM_THRESHOLD = 0.36;

const overviewState = {
    isActive: false,
    zoomThreshold: OVERVIEW_ZOOM_THRESHOLD, // Zoom out further to activate
    zoomReturnLevel: OVERVIEW_ZOOM_THRESHOLD, // Same level to exit for symmetry
    previousScale: 1,
    positions: new Map(), // id -> { left, top, width, height }
    transitioning: false, // latch while we zoom in to a toy
    enteredByButton: false,
    buttonNormalScale: DEFAULT_NORMAL_SCALE,
    buttonOverviewScale: DEFAULT_OVERVIEW_SCALE,
    buttonCenterWorld: null
};

const DOUBLE_TAP_MS = 320; // tweak between ~250–350ms to taste
let lastTap = { time: 0, id: null };

let dragInfo = {
    isDragging: false,
    target: null,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    moved: false,
    shield: null,
    pointerId: null,
    usingPointer: false,
    usingTouch: false
};

let squelchClicksUntil = 0;
const SQUELCH_MS = 250;

// Only absorb click-ish events; drag paths are handled explicitly.
// Don’t absorb 'dblclick' so desktop double-click can register as two taps.
const CLICKY_EVENTS = ['click', 'contextmenu'];

let docAbsorbArmed = false;

// ---- Overview logging gate ----
const OV_DEBUG = false;
const ovdbg = (...args) => { if (OV_DEBUG) console.debug(...args); };
const ovlog = (...args) => { if (OV_DEBUG) console.log(...args); };

// ---- Event-based diagnostics (toggle with localStorage.setItem('OV_EVENTS','1')) ----
const OV_EVENTS_ON = (typeof localStorage !== 'undefined' && localStorage.getItem('OV_EVENTS') === '1');
function emitOV(name, detail = {}) {
  if (!OV_EVENTS_ON) return;
  const payload = { t: (performance?.now?.() ?? Date.now()), ...detail };
  try {
    window.dispatchEvent(new CustomEvent(`overview:${name}`, { detail: payload }));
  } catch {}
}

function safeScale(value, fallback = DEFAULT_NORMAL_SCALE) {
  const n = typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readBoardScale() {
  try {
    const z = typeof window?.getZoomState === 'function' ? window.getZoomState() : null;
    const live = typeof z?.currentScale === 'number' ? z.currentScale : z?.targetScale;
    if (Number.isFinite(live) && live > 0) return live;
  } catch {}
  return safeScale(window.__boardScale, DEFAULT_NORMAL_SCALE);
}

function getViewportCenterWorld() {
    try {
        if (typeof window?.getViewportCenterWorld === 'function') {
            return window.getViewportCenterWorld();
        }
    } catch {}
    return null;
}

function px(n) { return Math.round(n) + 'px'; }

function snapOverlaysOnce() {
    // Publish committed camera for followers, but do not dispatch any overlay snaps.
    try { publishFrameStart(); } catch {}
    try {
        requestAnimationFrame(() => {
            try { publishFrameStart(); } catch {}
        });
    } catch {}
}

function getEventClientX(e) {
    if (Number.isFinite(e?.clientX)) return e.clientX;
    if (e?.touches?.length) return e.touches[0].clientX;
    if (e?.changedTouches?.length) return e.changedTouches[0].clientX;
    return 0;
}

function getEventClientY(e) {
    if (Number.isFinite(e?.clientY)) return e.clientY;
    if (e?.touches?.length) return e.touches[0].clientY;
    if (e?.changedTouches?.length) return e.changedTouches[0].clientY;
    return 0;
}

function panelParts(panel) {
    return {
        header: panel?.querySelector?.('.toy-header'),
        body: panel?.querySelector?.('.toy-body'),
        footer: panel?.querySelector?.('.toy-footer')
    };
}

// Cache panel/body rects per frame to avoid repeated layout reads during zoom/overview.
const __ovRectCache = new WeakMap();
function measurePartRectWithinPanel(panel, el) {
    if (!panel || !el) return null;
    // Avoid forced reflow during pinch/zoom; reuse last cached rect if available.
    if (typeof window !== 'undefined' && window.__mtZoomGesturing) {
        const cachedZoom = __ovRectCache.get(panel);
        if (cachedZoom && cachedZoom.panel === panel && cachedZoom.el === el) {
            return cachedZoom.rect;
        }
        // If we're mid-gesture with no cache, skip measurement for now.
        return null;
    }
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const cached = __ovRectCache.get(panel);
    if (cached && cached.panel === panel && cached.el === el && (now - cached.ts) < 200) {
        return cached.rect;
    }
    const pr = panel.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const rect = {
        top: er.top - pr.top,
        left: er.left - pr.left,
        width: er.width,
        height: er.height
    };
    __ovRectCache.set(panel, { panel, el, rect, ts: now });
    return rect;
}

function ensureShield(panel) {
    let shield = panel.querySelector(':scope > .ov-shield');
    if (!shield) {
        shield = document.createElement('div');
        shield.className = 'ov-shield';
        panel.appendChild(shield);
    }
    return shield;
}

// Block stray clicks that slip through right after a drag
window.addEventListener('click', (e) => {
    if (typeof performance !== 'undefined' && performance.now() < squelchClicksUntil) {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
    }
}, { capture: true });

const docAbsorbHandler = (ev) => {
    try {
        if (!document?.documentElement?.classList?.contains('board-overview')) return;
    } catch {
        return;
    }
    ovdbg('[overview][doc absorb]', ev.type, 'target=', ev.target?.tagName || '(unknown)');
    if (ev.cancelable) ev.preventDefault();
    ev.stopImmediatePropagation();
    ev.stopPropagation();
};

function armDocAbsorb() {
    if (docAbsorbArmed) return;
    if (typeof document === 'undefined') return;
    CLICKY_EVENTS.forEach(type => {
        document.addEventListener(type, docAbsorbHandler, { capture: true, passive: false });
    });
    docAbsorbArmed = true;
}

function disarmDocAbsorb() {
    if (!docAbsorbArmed) return;
    if (typeof document === 'undefined') return;
    CLICKY_EVENTS.forEach(type => {
        document.removeEventListener(type, docAbsorbHandler, true);
    });
    docAbsorbArmed = false;
}

function bindPanelDragCapture(panel) {
    if (!panel) return;
    const handler = (ev) => {
        if (!overviewState.isActive) return;
        const { header, footer } = panelParts(panel);
        if ((header && header.contains?.(ev.target)) || (footer && footer.contains?.(ev.target))) return;
        onToyMouseDown(ev);
    };
    if (panel.__ovDownCaps) {
        for (const [type, fn] of panel.__ovDownCaps) {
            panel.removeEventListener(type, fn, true);
        }
    }
    panel.__ovDownCaps = new Map();
    ['pointerdown', 'touchstart', 'mousedown'].forEach((type) => {
        panel.addEventListener(type, handler, { capture: true, passive: false });
        panel.__ovDownCaps.set(type, handler);
    });
    ovdbg('[overview][bind] capture downs on', panel.id || '(no-id)');
}

function enterOverviewMode(isButton) {
    if (overviewState.isActive) return;
    const buttonTriggered = !!isButton;
    const currentScale = readBoardScale();
    overviewState.enteredByButton = buttonTriggered;
    overviewState.previousScale = currentScale;
    if (buttonTriggered) {
        overviewState.buttonNormalScale = currentScale;
        overviewState.buttonOverviewScale = safeScale(overviewState.buttonOverviewScale, DEFAULT_OVERVIEW_SCALE);
        overviewState.buttonCenterWorld = getViewportCenterWorld();
    }
    overviewState.isActive = true;
    lastTap = { time: 0, id: null };
    // Broadcast: all toys should enter non-reactive mode.
    // Non-reactive = suppress home resets/springs and snap size maps, not a physics freeze.
    try { window.dispatchEvent(new CustomEvent('overview:transition', { detail: { active: true } })); } catch {}
    overviewState.transitioning = false;
    overviewState.positions.clear();
    try {
        const board = document.querySelector('#board');
        board?.querySelectorAll(':scope > .toy-panel').forEach(panel => {
            const id = panel.id || panel.dataset.toyid || panel.dataset.toy;
            if (!id) return;
            const computed = getComputedStyle(panel);
            let left = parseFloat(panel.style.left || computed.left || '0');
            if (!Number.isFinite(left)) left = 0;
            let top = parseFloat(panel.style.top || computed.top || '0');
            if (!Number.isFinite(top)) top = 0;
            const width = Number.isFinite(panel.offsetWidth) ? panel.offsetWidth : parseFloat(computed.width || '0') || 0;
            const height = Number.isFinite(panel.offsetHeight) ? panel.offsetHeight : parseFloat(computed.height || '0') || 0;
            overviewState.positions.set(id, { left, top, width, height });
        });
    } catch (err) {
        console.warn('[overview] failed to snapshot panel positions', err);
    }
    const boardForClass = document.querySelector('#board, main#board, .world, .canvas-world');
    if (boardForClass) boardForClass.classList.add('board-overview');
    let panels = [];
    try {
        panels = Array.from(document.querySelectorAll('#board .toy-panel'));
        panels.forEach(panel => {
            try { panel.dispatchEvent(new CustomEvent('overview:precommit', { bubbles: true })); } catch {}
        });
        panels.forEach(panel => {
            const { header, footer } = panelParts(panel);
            const bodyEl = panel.querySelector('.toy-body') ||
                panel.querySelector('.toy-interactive, .grid-canvas, .drawgrid-canvas, .loopgrid-grid, .rippler-canvas, .bouncer-canvas, .wheel-canvas, .cells, canvas, svg');
            panel.classList.add('ov-body-border');
            bindPanelDragCapture(panel);

            if (bodyEl) {
                try {
                    const shield = ensureShield(panel);
                    const supportsPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;
                    const absorb = (ev) => {
                        ovdbg('[overview][shield absorb]', ev.type, 'on', panel.id || '(no-id)', 'target=', ev.target?.tagName || '(unknown)', ev.target?.className || '');
                        if (ev.cancelable) ev.preventDefault();
                        ev.stopImmediatePropagation();
                        ev.stopPropagation();
                    };

                    if (panel.__ovPanelAbsorbHandler) {
                        CLICKY_EVENTS.forEach(type => panel.removeEventListener(type, panel.__ovPanelAbsorbHandler, true));
                    }
                    const panelAbsorb = (ev) => {
                        ovdbg('[overview][panel absorb]', ev.type, 'on', panel.id || '(no-id)');
                        if (ev.cancelable) ev.preventDefault();
                        ev.stopImmediatePropagation();
                        ev.stopPropagation();
                    };
                    panel.__ovPanelAbsorbHandler = panelAbsorb;
                    CLICKY_EVENTS.forEach(type => panel.addEventListener(type, panelAbsorb, { capture: true, passive: false }));

                    const onShieldPointerDown = (ev) => {
                      ovdbg('[overview] drag start attempt', { id: panel.id || '(no-id)', type: ev.type });
                      if (dragInfo.isDragging && (dragInfo.usingPointer || dragInfo.usingTouch)) {
                          absorb(ev);
                          return;
                      }
                      if (typeof ev.button === 'number' && ev.button !== 0) {
                          absorb(ev);
                          return;
                      }
                      // Kick off drag on the shield so we can move panels reliably.
                      try { onToyMouseDown(ev); } catch {}
                      squelchClicksUntil = (typeof performance !== 'undefined' ? performance.now() : 0) + SQUELCH_MS;
                      absorb(ev);
                    };
                    if (supportsPointerEvents) {
                        shield.addEventListener('pointerdown', onShieldPointerDown, { passive: false, capture: true });
                    } else {
                        shield.addEventListener('touchstart', onShieldPointerDown, { passive: false, capture: true });
                    }
                    shield.addEventListener('mousedown', onShieldPointerDown, { passive: false, capture: true });

                    CLICKY_EVENTS.forEach(type => shield.addEventListener(type, absorb, { capture: true, passive: false }));

                } catch (err) {
                    console.warn('[overview] failed to create shield', err);
                }
            }

            const hR = header ? measurePartRectWithinPanel(panel, header) : null;
            const fR = footer ? measurePartRectWithinPanel(panel, footer) : null;
            panel.style.setProperty('--ov-hdr-top', hR ? px(hR.top) : '0px');
            panel.style.setProperty('--ov-hdr-h', hR ? px(hR.height) : '0px');
            panel.style.setProperty('--ov-ftr-top', fR ? px(fR.top) : '0px');
            panel.style.setProperty('--ov-ftr-h', fR ? px(fR.height) : '0px');
            const id = panel.id || panel.dataset.toyid || panel.dataset.toy;
            const snap = id ? overviewState.positions.get(id) : null;
            const hdrHScreen = hR ? hR.height : 0;
            if (snap && Number.isFinite(hdrHScreen) && hdrHScreen > 0) {
                if (panel.dataset._ovCompApplied === '1') {
                    console.warn('[overview][comp] already applied; skipping', { id });
                } else {
                    const scale = window.__boardScale || 1;
                    const dyWorld = hdrHScreen / Math.max(0.0001, scale);
                    const compensatedTop = snap.top + dyWorld;
                    let appliedTop = false;
                    try {
                        const body = bodyEl ||
                            panel.querySelector('.toy-body') ||
                            panel.querySelector('.grid-canvas, .rippler-canvas, .bouncer-canvas, .wheel-canvas, canvas, svg');
                        const innerTop = body ? (body.offsetTop || 0) : 0;
                        const innerH = body ? (body.offsetHeight || 0) : (Number.isFinite(snap.height) ? snap.height : panel.offsetHeight || 0);
                        const worldBefore = {
                            x: snap.left + (panel.offsetWidth * 0.5),
                            y: snap.top + innerTop + innerH * 0.5
                        };
                        const container = document.querySelector('.board-viewport') || document.documentElement;
                        const viewW = container.clientWidth || window.innerWidth;
                        const viewH = container.clientHeight || window.innerHeight;
                        const viewCx = Math.round(viewW * 0.5);
                        const viewCy = Math.round(viewH * 0.5);
                        const z = window.getZoomState?.() || {};
                        const s = Number.isFinite(z.currentScale) ? z.currentScale : Number.isFinite(z.targetScale) ? z.targetScale : window.__boardScale || 1;
                        const tx = Number.isFinite(z.currentX) ? z.currentX : Number.isFinite(z.targetX) ? z.targetX : window.__boardX || 0;
                        const ty = Number.isFinite(z.currentY) ? z.currentY : Number.isFinite(z.targetY) ? z.targetY : window.__boardY || 0;
                        const pxBefore = Math.round(worldBefore.x * s + tx);
                        const pyBefore = Math.round(worldBefore.y * s + ty);
                        panel.style.top = `${compensatedTop}px`;
                        appliedTop = true;
                        const worldAfter = { x: worldBefore.x, y: compensatedTop + innerTop + innerH * 0.5 };
                        const pxAfter = Math.round(worldAfter.x * s + tx);
                        const pyAfter = Math.round(worldAfter.y * s + ty);
                        ovdbg('[overview][comp]', {
                            id,
                            hdrHScreen,
                            scale,
                            dyWorld,
                            snapTop: snap.top,
                            compTop: compensatedTop,
                            viewCx,
                            viewCy,
                            before: { px: pxBefore, py: pyBefore },
                            after: { px: pxAfter, py: pyAfter },
                            delta: { dx: pxAfter - pxBefore, dy: pyAfter - pyBefore }
                        });
                    } catch (e) {
                        ovdbg('[overview][comp] debug failed', e);
                    } finally {
                        if (!appliedTop) {
                            panel.style.top = `${compensatedTop}px`;
                        }
                    }
                    panel.dataset.ovCompTop = String(compensatedTop);
                    panel.dataset._ovCompApplied = '1';
                }
            }
            if (header && hR) {
                header.style.position = 'absolute';
                header.style.top = px(hR.top);
                header.style.left = '0';
                header.style.right = '0';
                header.style.height = px(hR.height);
            }
            if (footer && fR) {
                footer.style.position = 'absolute';
                footer.style.top = px(fR.top);
                footer.style.left = '0';
                footer.style.right = '0';
                footer.style.height = px(fR.height);
            }
            if (header || footer) {
                panel.classList.add('ov-freeze');
                requestAnimationFrame(() => {
                    if (header) {
                        header.style.position = '';
                        header.style.top = '';
                        header.style.left = '';
                        header.style.right = '';
                        header.style.height = '';
                    }
                    if (footer) {
                        footer.style.position = '';
                        footer.style.top = '';
                        footer.style.left = '';
                        footer.style.right = '';
                        footer.style.height = '';
                    }
                    panel.classList.add('ov-collapse');
                });
            }
        });
    } catch {}
    armDocAbsorb();

    document.body.classList.add('overview-mode');
    panels.forEach(panel => {
        try { panel.dispatchEvent(new CustomEvent('overview:commit', { bubbles: true })); } catch {}
    });
    try {
        window.dispatchEvent(new CustomEvent('overview:change', { detail: { active: true } }));
    } catch {}
    ovlog('Entering Overview Mode, previousScale:', overviewState.previousScale, 'current boardScale:', window.__boardScale);

    if (buttonTriggered) {
        const targetScale = overviewState.buttonOverviewScale;
        const targetLabel = 'button';
        const centerWorld = overviewState.buttonCenterWorld || getViewportCenterWorld();
        ovlog(`[overview] applying ${targetLabel} overview scale`, targetScale, 'current:', window.__boardScale, 'center:', centerWorld);
        try {
            if (centerWorld && Number.isFinite(centerWorld.x) && Number.isFinite(centerWorld.y)) {
                window.centerBoardOnWorldPoint?.(centerWorld.x, centerWorld.y, targetScale);
            } else {
                window.setBoardScale(targetScale);
            }
        } catch {}
        // Do not dispatch board:scale here; board-viewport.apply() will emit it.
    }
    try { snapOverlaysOnce(); } catch {}

    const overviewText = document.createElement('div');
    overviewText.id = 'overview-mode-text';
    overviewText.textContent = 'Overview Mode';
    document.body.appendChild(overviewText);

    // Hide the entire frame of all toys by making backgrounds transparent and removing borders/shadows
    document.querySelectorAll('.toy-panel').forEach(panel => {
        panel.style.background = 'transparent';
        panel.style.border = 'none';
        panel.style.boxShadow = 'none';
        const body = panel.querySelector('.toy-body');
        if (body) {
            body.style.background = 'transparent';
        }
    });
}

function exitOverviewMode(isButton) {
    if (!overviewState.isActive) return;
    const buttonTriggered = !!isButton;
    const currentScale = readBoardScale();
    if (buttonTriggered) {
        overviewState.buttonOverviewScale = safeScale(currentScale, DEFAULT_OVERVIEW_SCALE);
    }
    const wasTransitioning = overviewState.transitioning;
    overviewState.isActive = false;
    // Broadcast: toys can resume normal physics/tweens
    try { window.dispatchEvent(new CustomEvent('overview:transition', { detail: { active: false } })); } catch {}
    const panelsForEvents = Array.from(document.querySelectorAll('#board .toy-panel'));
    panelsForEvents.forEach(panel => {
        try { panel.dispatchEvent(new CustomEvent('overview:precommit', { bubbles: true })); } catch {}
    });
    overviewState.transitioning = false;
    try {
        const board = document.querySelector('#board');
        board?.querySelectorAll(':scope > .toy-panel').forEach(panel => {
            const id = panel.id || panel.dataset.toyid || panel.dataset.toy;
            const snap = id ? overviewState.positions.get(id) : null;
            if (snap) {
                panel.style.left = `${snap.left}px`;
                panel.style.top = `${snap.top}px`;
            }
        });
    } catch (err) {
        console.warn('[overview] failed to restore panel positions', err);
    }
    overviewState.positions.clear();
    document.body.classList.remove('overview-mode');
    try {
        window.dispatchEvent(new CustomEvent('overview:change', { detail: { active: false } }));
    } catch {}
    const targetScale = buttonTriggered
        ? (overviewState.enteredByButton ? safeScale(overviewState.buttonNormalScale, DEFAULT_NORMAL_SCALE) : DEFAULT_NORMAL_SCALE)
        : currentScale;
    const targetCenter = buttonTriggered ? (overviewState.buttonCenterWorld || getViewportCenterWorld()) : null;
    ovlog('Exiting Overview Mode', {
        willRestoreScale: !!isButton,
        previousScale: overviewState.previousScale,
        currentScale: window.__boardScale,
        targetScale
    });
    const shouldApplyScale = buttonTriggered;
    try {
        const boardForClass = document.querySelector('#board, main#board, .world, .canvas-world');
        if (boardForClass) boardForClass.classList.remove('board-overview');
        document.querySelectorAll('#board .toy-panel').forEach(panel => {
            panel.classList.remove('ov-collapse', 'ov-freeze', 'ov-body-border');
            panel.style.removeProperty('--ov-hdr-top');
            panel.style.removeProperty('--ov-hdr-h');
            panel.style.removeProperty('--ov-ftr-top');
            panel.style.removeProperty('--ov-ftr-h');
            delete panel.dataset.ovCompTop;
            delete panel.dataset._ovCompApplied;
            const { header, footer } = panelParts(panel);
            if (header) {
                header.style.position = '';
                header.style.top = '';
                header.style.left = '';
                header.style.right = '';
                header.style.height = '';
            }
            if (footer) {
                footer.style.position = '';
                footer.style.top = '';
                footer.style.left = '';
                footer.style.right = '';
                footer.style.height = '';
            }
            const shield = panel.querySelector(':scope > .ov-shield');
            if (shield) shield.remove();
            if (panel.__ovPanelAbsorbHandler) {
                CLICKY_EVENTS.forEach(type => panel.removeEventListener(type, panel.__ovPanelAbsorbHandler, true));
                delete panel.__ovPanelAbsorbHandler;
            }
            if (panel.__ovDownCaps) {
                for (const [type, fn] of panel.__ovDownCaps) {
                    panel.removeEventListener(type, fn, true);
                }
                delete panel.__ovDownCaps;
            }
        });
    } catch {}

    disarmDocAbsorb();

    const overviewText = document.getElementById('overview-mode-text');
    if (overviewText) {
        overviewText.remove();
    }

    if (shouldApplyScale) {
        ovlog('Restoring board scale from overview mode, target:', targetScale, 'current:', window.__boardScale, 'center:', targetCenter);
        try {
            if (targetCenter && Number.isFinite(targetCenter.x) && Number.isFinite(targetCenter.y)) {
                window.centerBoardOnWorldPoint?.(targetCenter.x, targetCenter.y, targetScale);
            } else {
                window.setBoardScale(targetScale);
            }
        } catch {}
        ovlog('overview-mode: setBoardScale called with', targetScale);
        ovlog('After restoring scale, actual scale:', window.__boardScale);
        // Do not dispatch board:scale here; board-viewport.apply() will emit it.
    } else {
        ovlog('Skipping scale restore due to active transition, target would have been', targetScale);
    }
    try { snapOverlaysOnce(); } catch {}

    // Restore the original appearance of all toys
    document.querySelectorAll('.toy-panel').forEach(panel => {
        panel.style.background = '';
        panel.style.border = '';
        panel.style.boxShadow = '';
        panel.classList.remove('ov-collapse', 'ov-freeze', 'ov-body-border');
        const body = panel.querySelector('.toy-body');
        if (body) {
            body.style.background = '';
        }
    });
    panelsForEvents.forEach(panel => {
        try { panel.dispatchEvent(new CustomEvent('overview:commit', { bubbles: true })); } catch {}
    });
    overviewState.enteredByButton = false;
    overviewState.buttonCenterWorld = null;
}

function onToyMouseDown(e) {
    if (!overviewState.isActive) return;

    if (dragInfo.isDragging) {
        if (dragInfo.usingPointer && e.type === 'mousedown') {
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
        }
        return;
    }

    const panel = e?.currentTarget?.closest?.('.toy-panel') || e?.currentTarget || e?.target?.closest?.('.toy-panel');
    if (!panel) return;

    const { header, footer } = panelParts(panel);
    if ((header && header.contains?.(e.target)) || (footer && footer.contains?.(e.target))) {
        return;
    }

    const startX = getEventClientX(e);
    const startY = getEventClientY(e);
    const shield = panel.querySelector(':scope > .ov-shield');
    const eventType = e?.type || '';
    const usingPointer = eventType.startsWith('pointer');
    const usingTouch = !usingPointer && eventType.startsWith('touch');
    const initialX = Number.isFinite(panel.offsetLeft) ? panel.offsetLeft : parseFloat(panel.style.left || '0') || 0;
    const initialY = Number.isFinite(panel.offsetTop) ? panel.offsetTop : parseFloat(panel.style.top || '0') || 0;
    dragInfo = {
        isDragging: true,
        target: panel,
        startX,
        startY,
        initialX,
        initialY,
        moved: false,
        shield,
        pointerId: usingPointer && typeof e.pointerId === 'number' ? e.pointerId : null,
        usingPointer,
        usingTouch
    };

    ovdbg('[overview] drag start', { id: panel.id || '(no-id)', type: eventType });
    emitOV('drag-start', { id: panel.id || '(no-id)', startX, startY });
    try { panel.classList.add('grabbing'); } catch {}

    if (shield) {
        shield.classList.add('grabbing');
        if (dragInfo.pointerId !== null) {
            try { shield.setPointerCapture?.(dragInfo.pointerId); } catch {}
        }
    }

    squelchClicksUntil = (typeof performance !== 'undefined' ? performance.now() : 0) + SQUELCH_MS;

    const host = dragInfo.shield || window;

    if (dragInfo.usingPointer) {
        if (dragInfo.shield && dragInfo.pointerId !== null) {
            try { dragInfo.shield.setPointerCapture?.(dragInfo.pointerId); } catch {}
        }
        host.addEventListener('pointermove', onToyPointerMove, { capture: true, passive: false });
        host.addEventListener('pointerup', onToyPointerUp, { capture: true, passive: false });
        host.addEventListener('pointercancel', onToyPointerUp, { capture: true, passive: false });
    } else if (dragInfo.usingTouch) {
        host.addEventListener('touchmove', onToyTouchMove, { capture: true, passive: false });
        host.addEventListener('touchend', onToyTouchEnd, { capture: true, passive: false });
        host.addEventListener('touchcancel', onToyTouchEnd, { capture: true, passive: false });
    } else {
        host.addEventListener('mousemove', onToyMouseMove, { capture: true });
        host.addEventListener('mouseup', onToyMouseUp, { capture: true });
    }

    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
}

function onToyMouseMove(e) {
    if (!dragInfo.isDragging) return;

    const cx = getEventClientX(e);
    const cy = getEventClientY(e);
    const dx = cx - dragInfo.startX;
    const dy = cy - dragInfo.startY;

    if (!dragInfo.moved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        dragInfo.moved = true;
    }

    if (dragInfo.moved && dragInfo.target) {
        const scale = window.__boardScale || 1;
        const newX = dragInfo.initialX + dx / Math.max(scale, 0.0001);
        const newY = dragInfo.initialY + dy / Math.max(scale, 0.0001);
                    dragInfo.target.style.left = `${newX}px`;
                    dragInfo.target.style.top = `${newY}px`;
                    emitOV('drag-move', { id: dragInfo.target.id || '(no-id)', left: newX, top: newY });    }

    ovdbg('[overview] drag move', {
        id: dragInfo.target?.id || '(no-id)',
        dx,
        dy
    });

    squelchClicksUntil = (typeof performance !== 'undefined' ? performance.now() : 0) + SQUELCH_MS;

    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
}

function onToyPointerMove(e) {
    if (dragInfo.pointerId !== null && e.pointerId !== dragInfo.pointerId) return;
    onToyMouseMove(e);
}

function onToyPointerUp(e) {
    if (dragInfo.pointerId !== null && e.pointerId !== dragInfo.pointerId) return;
    onToyMouseUp(e);
}

function onToyTouchMove(e) {
    onToyMouseMove(e);
}

function onToyTouchEnd(e) {
    onToyMouseUp(e);
}

function onToyMouseUp(e) {
    if (!dragInfo.isDragging) return;

    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    squelchClicksUntil = now + SQUELCH_MS;
    const panel = dragInfo.target?.closest?.('.toy-panel') || dragInfo.target;

    if (dragInfo.shield) {
        dragInfo.shield.classList.remove('grabbing');
        if (dragInfo.pointerId !== null) {
            try { dragInfo.shield.releasePointerCapture?.(dragInfo.pointerId); } catch {}
        }
    }

    const host = dragInfo.shield || window;

    if (dragInfo.usingPointer) {
        host.removeEventListener('pointermove', onToyPointerMove, true);
        host.removeEventListener('pointerup', onToyPointerUp, true);
        host.removeEventListener('pointercancel', onToyPointerUp, true);
        if (dragInfo.shield && dragInfo.pointerId !== null) {
            try { dragInfo.shield.releasePointerCapture?.(dragInfo.pointerId); } catch {}
        }
    } else if (dragInfo.usingTouch) {
        host.removeEventListener('touchmove', onToyTouchMove, true);
        host.removeEventListener('touchend', onToyTouchEnd, true);
        host.removeEventListener('touchcancel', onToyTouchEnd, true);
    } else {
        host.removeEventListener('mousemove', onToyMouseMove, true);
        host.removeEventListener('mouseup', onToyMouseUp, true);
    }

    ovdbg('[overview] drag end', { id: panel?.id || '(no-id)', moved: dragInfo.moved });
    try { panel?.classList?.remove('grabbing'); } catch {}
    dragInfo.shield?.classList?.remove('grabbing');

    if (dragInfo.moved && panel) {
      const id = panel.id || panel.dataset.toyid || panel.dataset.toy;
      // Prefer explicit style first, then computed fallback
      const cs = getComputedStyle(panel);
      let left = parseFloat(panel.style.left || cs.left || '0') || 0;
      let top  = parseFloat(panel.style.top  || cs.top  || '0') || 0;
      const width  = Number.isFinite(panel.offsetWidth)  ? panel.offsetWidth  : parseFloat(cs.width  || '0') || 0;
      const height = Number.isFinite(panel.offsetHeight) ? panel.offsetHeight : parseFloat(cs.height || '0') || 0;

                // Commit the updated snapshot so exitOverviewMode uses the NEW position
                try { overviewState.positions.set(id, { left, top, width, height }); } catch {}
                emitOV('drag-end', { id, left, top, width, height });
      
                ovdbg('[overview] drag commit', { id, left, top, width, height });    }

    if (!dragInfo.moved) {
      const id = panel?.id || panel?.dataset?.toyid || panel?.dataset?.toy;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const isDoubleTap = (lastTap.id === id) && ((now - lastTap.time) <= DOUBLE_TAP_MS);

      // Update tap memory
      lastTap = { time: now, id };

      let __handledSingleTap = false;
      if (!isDoubleTap) {
                  // Single tap: do NOT zoom. Optionally provide a tiny visual affordance here.
                  // e.g., panel.classList.add('ov-tap'); setTimeout(() => panel.classList.remove('ov-tap'), 150);
                  emitOV('tap', { id, tap: 'single' });
                  ovdbg('[overview] single tap (awaiting second tap)', { id });        // Absorb; don’t exit overview.
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        __handledSingleTap = true;
      }

      if (!__handledSingleTap) {
                // Double tap → proceed with the existing compute-center-and-zoom logic:
                // (keep your current worldCenter/viewCx… calculation and exitOverviewMode(false) exactly as-is)
                emitOV('tap', { id, tap: 'double' });
                emitOV('zoom-in', { id });
                ovdbg('[overview] double tap → zoom', { id });
      // Ensure the panel’s FINAL drag result is already committed (Fix #1) before zoom,
      // then run your existing “snapshot forward-projection” and exitOverviewMode(false)
      // (No further changes needed below this comment.)
      if (!panel) {
          console.warn('[overview] tap target missing panel reference');
      }
      const snap = id ? overviewState.positions.get(id) : null;
      let worldCenter = null;
      if (snap) {
          const body = panel?.querySelector?.('.toy-body') ||
              panel?.querySelector?.('.grid-canvas, .rippler-canvas, .bouncer-canvas, .wheel-canvas, canvas, svg');
          const innerLeft = body ? (body.offsetLeft || 0) : 0;
          const innerTop = body ? (body.offsetTop || 0) : 0;
          const innerW = body ? (body.offsetWidth || 0) : (Number.isFinite(snap.width) ? snap.width : panel?.offsetWidth || 0);
          const innerH = body ? (body.offsetHeight || 0) : (Number.isFinite(snap.height) ? snap.height : panel?.offsetHeight || 0);
          worldCenter = {
              x: snap.left + innerLeft + innerW * 0.5,
              y: snap.top + innerTop + innerH * 0.5
          };
          ovdbg('[overview] tap center (snapshot+body)', { id, snap, innerLeft, innerTop, innerW, innerH, wc: worldCenter });
      } else if (window.getWorldCenter) {
          worldCenter = window.getWorldCenter(panel);
          ovdbg('[overview] tap center (fallback getWorldCenter)', { id, wc: worldCenter });
      }
      if (worldCenter) {
          const container = document.querySelector('.board-viewport') || document.documentElement;
          const viewW = container.clientWidth || window.innerWidth;
          const viewH = container.clientHeight || window.innerHeight;
          const viewCx = Math.round(viewW * 0.5);
          const viewCy = Math.round(viewH * 0.5);
          const z = window.getZoomState?.() || {};
          const s = Number.isFinite(z.currentScale) ? z.currentScale : Number.isFinite(z.targetScale) ? z.targetScale : window.__boardScale || 1;
          const tx = Number.isFinite(z.currentX) ? z.currentX : Number.isFinite(z.targetX) ? z.targetX : window.__boardX || 0;
          const ty = Number.isFinite(z.currentY) ? z.currentY : Number.isFinite(z.targetY) ? z.targetY : window.__boardY || 0;
          const px = Math.round(worldCenter.x * s + tx);
          const py = Math.round(worldCenter.y * s + ty);
          ovdbg('[overview] snapshot forward-projection', {
              id,
              wc: worldCenter,
              s,
              tx,
              ty,
              viewCx,
              viewCy,
              px,
              py,
              dx: px - viewCx,
              dy: py - viewCy
          });
      }
      overviewState.transitioning = true;
      if (panel) window.__lastFocusEl = panel;
      exitOverviewMode(false);
      overviewState.transitioning = true;
      requestAnimationFrame(() => {
          if (worldCenter && Number.isFinite(worldCenter.x) && Number.isFinite(worldCenter.y)) {
              window.centerBoardOnWorldPoint?.(worldCenter.x, worldCenter.y, overviewState.zoomReturnLevel);
          } else if (panel) {
              window.centerBoardOnElement?.(panel, overviewState.zoomReturnLevel);
          }
      });
      }
    }

    dragInfo.isDragging = false;
    dragInfo.target = null;
    dragInfo.shield = null;
    dragInfo.pointerId = null;
    dragInfo.usingPointer = false;
    dragInfo.usingTouch = false;
    dragInfo.moved = false;
    dragInfo.startX = 0;
    dragInfo.startY = 0;
    dragInfo.initialX = 0;
    dragInfo.initialY = 0;

    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
}

function toggleOverviewMode(isButton) {
    if (overviewState.isActive) {
        exitOverviewMode(isButton);
    } else {
        enterOverviewMode(isButton);
    }
}

function isOverviewModeActive() {
    return overviewState.isActive;
}

export const overviewMode = {
    enter: enterOverviewMode,
    exit: exitOverviewMode,
    toggle: toggleOverviewMode,
    isActive: isOverviewModeActive,
    state: overviewState
};

try {
    window.__overviewMode = overviewMode;
} catch {}
