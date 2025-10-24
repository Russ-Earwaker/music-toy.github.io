
const overviewState = {
    isActive: false,
    zoomThreshold: 0.36, // Zoom out further to activate
    zoomReturnLevel: 0.57, // Zoom in closer on return
    previousScale: 1
};

let dragInfo = { isDragging: false, target: null, startX: 0, startY: 0, initialX: 0, initialY: 0 };

function setCursorRecursive(element, cursor) {
    if (!element) return;
    const originalCursor = getComputedStyle(element).cursor;
    element.style.cursor = cursor;
    element.style.setProperty('cursor', cursor, 'important');
    console.log('DEBUG: Processed element:', element.tagName, element.className, 'ID:', element.id, 'Original cursor:', originalCursor, 'New cursor:', cursor);
    for (let child of element.children) {
        setCursorRecursive(child, cursor);
    }
}

function restoreCursorRecursive(element) {
    if (!element) return;
    element.style.removeProperty('cursor');
    console.log('DEBUG: Restored cursor on element:', element.tagName, element.className, 'ID:', element.id);
    for (let child of element.children) {
        restoreCursorRecursive(child);
    }
}

function enterOverviewMode(isButton) {
    if (overviewState.isActive) return;
    overviewState.isActive = true;
    overviewState.previousScale = window.__boardScale;
    document.body.classList.add('overview-mode');
    console.log('Entering Overview Mode, previousScale:', overviewState.previousScale, 'current boardScale:', window.__boardScale);

    if (isButton) {
        console.log('Setting board scale to 0.36 for overview mode, current scale:', window.__boardScale);
        window.setBoardScale(0.36);
        console.log('After setting scale to 0.36, actual scale:', window.__boardScale);
        // Dispatch event to trigger layout recalculation in toys
        window.dispatchEvent(new CustomEvent('board:scale', { detail: { scale: 0.36 } }));
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
        // Ensure cursor is default on headers and footers and all their descendants
        const header = panel.querySelector('.toy-header');
        const footer = panel.querySelector('.toy-footer');
        setCursorRecursive(header, 'default');
        setCursorRecursive(footer, 'default');
        panel.addEventListener('mousedown', onToyMouseDown);
    });
}

function exitOverviewMode(isButton) {
    if (!overviewState.isActive) return;
    overviewState.isActive = false;
    document.body.classList.remove('overview-mode');
    console.log('Exiting Overview Mode, restoring scale to:', overviewState.previousScale, 'current scale:', window.__boardScale);

    const overviewText = document.getElementById('overview-mode-text');
    if (overviewText) {
        overviewText.remove();
    }

    if (isButton) {
        console.log('Restoring board scale from overview mode, target:', overviewState.previousScale, 'current:', window.__boardScale);
        window.setBoardScale(overviewState.previousScale);
        console.log('After restoring scale, actual scale:', window.__boardScale);
        // Dispatch event to trigger layout recalculation in toys
        window.dispatchEvent(new CustomEvent('board:scale', { detail: { scale: overviewState.previousScale } }));
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
        // Restore original cursor styles on headers and footers and all their descendants
        const header = panel.querySelector('.toy-header');
        const footer = panel.querySelector('.toy-footer');
        restoreCursorRecursive(header);
        restoreCursorRecursive(footer);
        panel.removeEventListener('mousedown', onToyMouseDown);
    });
}

function onToyMouseDown(e) {
    if (!overviewState.isActive) return;

    const panel = e.currentTarget;
    const header = panel.querySelector('.toy-header');
    const footer = panel.querySelector('.toy-footer');

    // Check if click is within header or footer bounds
    if (header && footer) {
        const headerRect = header.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();

        // Header area: top of panel
        const isInHeader = e.clientY <= headerRect.bottom;
        // Footer area: bottom of panel
        const isInFooter = e.clientY >= footerRect.top;

        if (isInHeader || isInFooter) {
            return;
        }
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
        // This was a tap, zoom in on the toy
        window.centerBoardOnElement(dragInfo.target, overviewState.zoomReturnLevel);
        exitOverviewMode(false);
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
