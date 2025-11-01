const overviewState = {
    isActive: false,
    zoomThreshold: 0.36, // Zoom out further to activate
    zoomReturnLevel: 0.57, // Zoom in closer on return
    previousScale: 1,
    positions: new Map(), // id -> { left, top, width, height }
    transitioning: false // latch while we zoom in to a toy
};

let dragInfo = { isDragging: false, target: null, startX: 0, startY: 0, initialX: 0, initialY: 0 };

function enterOverviewMode(isButton) {
    if (overviewState.isActive) return;
    overviewState.isActive = true;
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
    overviewState.previousScale = window.__boardScale;
    document.body.classList.add('overview-mode');
    try {
        window.dispatchEvent(new CustomEvent('overview:change', { detail: { active: true } }));
    } catch {}
    console.log('Entering Overview Mode, previousScale:', overviewState.previousScale, 'current boardScale:', window.__boardScale);

    if (isButton) {
        console.log('Setting board scale to 0.36 for overview mode, current scale:', window.__boardScale);
        window.setBoardScale(0.36);
        console.log('After setting scale to 0.36, actual scale:', window.__boardScale);
        // Do not dispatch board:scale here; board-viewport.apply() will emit it.
    }

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
        panel.addEventListener('mousedown', onToyMouseDown);
    });
}

function exitOverviewMode(isButton) {
    if (!overviewState.isActive) return;
    overviewState.isActive = false;
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
    console.log('Exiting Overview Mode', {
        willRestoreScale: !!isButton,
        previousScale: overviewState.previousScale,
        currentScale: window.__boardScale
    });

    const overviewText = document.getElementById('overview-mode-text');
    if (overviewText) {
        overviewText.remove();
    }

    if (isButton) {
        console.log('Restoring board scale from overview mode, target:', overviewState.previousScale, 'current:', window.__boardScale);
        window.setBoardScale(overviewState.previousScale);
        console.log('overview-mode: setBoardScale called with', overviewState.previousScale);
        console.log('After restoring scale, actual scale:', window.__boardScale);
        // Do not dispatch board:scale here; board-viewport.apply() will emit it.
    }

    // Restore the original appearance of all toys
    document.querySelectorAll('.toy-panel').forEach(panel => {
        panel.style.background = '';
        panel.style.border = '';
        panel.style.boxShadow = '';
        const body = panel.querySelector('.toy-body');
        if (body) {
            body.style.background = '';
        }
        panel.removeEventListener('mousedown', onToyMouseDown);
    });
}

function onToyMouseDown(e) {
    if (!overviewState.isActive) return;

    const panel = e.currentTarget;
    const header = panel.querySelector('.toy-header');
    const footer = panel.querySelector('.toy-footer');

    // Check if the event target is inside the header or footer
    if (header.contains(e.target) || footer.contains(e.target)) {
        return;
    }

    const target = e.currentTarget;
    dragInfo = {
        isDragging: true,
        target: target,
        startX: e.clientX,
        startY: e.clientY,
        initialX: target.offsetLeft,
        initialY: target.offsetTop,
        moved: false
    };

    window.addEventListener('mousemove', onToyMouseMove);
    window.addEventListener('mouseup', onToyMouseUp);
    e.preventDefault();
}

function onToyMouseMove(e) {
    if (!dragInfo.isDragging) return;

    const dx = e.clientX - dragInfo.startX;
    const dy = e.clientY - dragInfo.startY;

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        dragInfo.moved = true;
    }

    if (dragInfo.moved) {
        const newX = dragInfo.initialX + dx / window.__boardScale;
        const newY = dragInfo.initialY + dy / window.__boardScale;
        dragInfo.target.style.left = `${newX}px`;
        dragInfo.target.style.top = `${newY}px`;
    }
}

function onToyMouseUp(e) {
    if (!dragInfo.isDragging) return;

    if (!dragInfo.moved) {
        const panel = dragInfo.target?.closest?.('.toy-panel') || dragInfo.target;
        if (!panel) {
            console.warn('[overview] tap target missing panel reference');
        }
        const id = panel?.id || panel?.dataset?.toyid || panel?.dataset?.toy;
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
            console.debug('[overview] tap center (snapshot+body)', { id, snap, innerLeft, innerTop, innerW, innerH, wc: worldCenter });
        } else if (window.getWorldCenter) {
            worldCenter = window.getWorldCenter(panel);
            console.debug('[overview] tap center (fallback getWorldCenter)', { id, wc: worldCenter });
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
            console.debug('[overview] snapshot forward-projection', {
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

    dragInfo.isDragging = false;
    window.removeEventListener('mousemove', onToyMouseMove);
    window.removeEventListener('mouseup', onToyMouseUp);
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
