import { overviewMode } from './overview-mode.js';

document.addEventListener('DOMContentLoaded', () => {
    const topbar = document.getElementById('topbar');
    if (!topbar) return;

    let controls = topbar.querySelector('.topbar-controls');
    if (!controls) {
        controls = document.createElement('div');
        controls.className = 'topbar-controls';
        topbar.appendChild(controls);
    }

    let overviewButton = document.getElementById('overview-mode-button');
    if (!overviewButton) {
        overviewButton = document.createElement('button');
        overviewButton.type = 'button';
        overviewButton.id = 'overview-mode-button';
        overviewButton.title = 'Toggle Overview Mode';
        overviewButton.setAttribute('aria-label', 'Toggle Overview Mode');
        overviewButton.setAttribute('aria-pressed', 'false');
        overviewButton.dataset.helpLabel = 'Toggle Overview';
        overviewButton.innerHTML = '<span>OV</span>';
    }

    let resetButton = document.getElementById('reset-view-button');
    if (!resetButton) {
        resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.id = 'reset-view-button';
        resetButton.title = 'Reset View';
        resetButton.setAttribute('aria-label', 'Reset View');
        resetButton.dataset.helpLabel = 'Reset View';
        resetButton.innerHTML = '<span>Reset</span>';
    }

    let readout = document.getElementById('zoom-readout');
    if (!readout) {
        readout = document.createElement('div');
        readout.id = 'zoom-readout';
    }

    controls.append(overviewButton, resetButton, readout);

    const getScale = () => {
        const scale = typeof window.__boardScale === 'number' ? window.__boardScale : 1;
        return Number.isFinite(scale) && scale > 0 ? scale : 1;
    };

    const formatScale = (scale) => `Zoom ${scale.toFixed(scale >= 10 ? 1 : 2)}x`;

    const updateReadout = (scale = getScale()) => {
        readout.textContent = formatScale(scale);
    };

    const updateOverviewState = () => {
        const active = !!overviewMode?.isActive?.();
        overviewButton.classList.toggle('is-active', active);
        overviewButton.setAttribute('aria-pressed', active ? 'true' : 'false');
    };

    if (!overviewButton.__bound) {
        overviewButton.addEventListener('click', () => {
            overviewMode?.toggle?.(true);
        });
        overviewButton.__bound = true;
    }

    if (!resetButton.__bound) {
        resetButton.addEventListener('click', () => {
            try {
                overviewMode?.exit?.(false);
            } catch {}
            if (typeof window.resetBoardView === 'function') {
                window.resetBoardView();
            } else {
                window.setBoardScale?.(1);
                window.panTo?.(0, 0);
            }
            updateOverviewState();
            updateReadout();
        });
        resetButton.__bound = true;
    }

    window.addEventListener('board:scale', (event) => {
        const nextScale = event?.detail?.scale;
        if (typeof nextScale === 'number' && Number.isFinite(nextScale)) {
            updateReadout(nextScale);
        } else {
            updateReadout();
        }
    });

    window.addEventListener('overview:change', () => {
        updateOverviewState();
        updateReadout();
    });

    updateOverviewState();
    updateReadout();
});
