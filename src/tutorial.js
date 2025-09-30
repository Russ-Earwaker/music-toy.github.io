import { initToyUI } from './toyui.js';
import { createDrawGrid } from './drawgrid.js';
import { connectDrawGridToPlayer } from './drawgrid-player.js';

(function() {
    const tutorialButton = document.querySelector('[data-action="tutorial"]');
    if (!tutorialButton) return;

    let tutorialActive = false;
    let tutorialToy = null;
    const mainBoard = document.getElementById('board');
    const originalToys = Array.from(mainBoard.querySelectorAll('.toy-panel'));

    tutorialButton.addEventListener('click', () => {
        tutorialActive = !tutorialActive;
        document.body.classList.toggle('tutorial-active', tutorialActive);

        if (tutorialActive) {
            // Hide original toys
            originalToys.forEach(toy => toy.style.display = 'none');

            // Create tutorial toy
            tutorialToy = document.createElement('section');
            tutorialToy.id = 'tutorial-drawgrid';
            tutorialToy.className = 'toy-panel';
            tutorialToy.dataset.toy = 'drawgrid';
            tutorialToy.dataset.instrument = 'AcousticGuitar';
            mainBoard.appendChild(tutorialToy);

            // Initialize the toy
            initToyUI(tutorialToy, { toyName: 'DrawGrid Tutorial' });
            createDrawGrid(tutorialToy, { toyId: 'tutorial-drawgrid' });
            connectDrawGridToPlayer(tutorialToy);

        } else {
            // Show original toys
            originalToys.forEach(toy => toy.style.display = '');

            // Remove tutorial toy
            if (tutorialToy) {
                tutorialToy.remove();
                tutorialToy = null;
            }
        }
    });
})();