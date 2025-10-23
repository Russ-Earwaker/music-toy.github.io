import { overviewMode } from './overview-mode.js';

document.addEventListener('DOMContentLoaded', () => {
    const button = document.createElement('div');
    button.id = 'overview-mode-button';
    button.classList.add('circular-button');
    button.textContent = 'O'; // Placeholder
    document.body.appendChild(button);

    const zoomReadout = document.createElement('div');
    zoomReadout.id = 'zoom-readout';
    document.body.appendChild(zoomReadout);

    button.addEventListener('click', () => {
        overviewMode.toggle(true);
    });

    window.addEventListener('board:scale', (e) => {
        zoomReadout.textContent = `Zoom: ${e.detail.scale.toFixed(2)}`;
    });
});
