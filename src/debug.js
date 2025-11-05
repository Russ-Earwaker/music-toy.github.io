window.debugBoard = () => {
    const board = document.getElementById('board');
    if (!board) {
        console.log('Board not found.');
        return;
    }
    console.log('Board Info:');
    console.log('  Bounding Rect:', board.getBoundingClientRect());
    console.log('  Offset Width/Height:', board.offsetWidth, board.offsetHeight);
    console.log('  Transform:', board.style.transform);
};

window.debugTutorialToy = () => {
    const toy = document.querySelector('.tutorial-panel');
    if (!toy) {
        console.log('Tutorial toy not found.');
        return;
    }
    console.log('Tutorial Toy Info:');
    console.log('  Bounding Rect:', toy.getBoundingClientRect());
    console.log('  Style Left/Top:', toy.style.left, toy.style.top);
};

window.debugViewport = () => {
    console.log('Viewport Info:');
    console.log('  Scale:', window.__boardScale);
    console.log('  Pan X:', window.__boardX);
    console.log('  Pan Y:', window.__boardY);
};

const DEBUG_HELPERS_VERBOSE = false;
if (DEBUG_HELPERS_VERBOSE) {
    console.log('Debug helpers loaded. Use debugBoard(), debugTutorialToy(), and debugViewport() in the console.');
}
