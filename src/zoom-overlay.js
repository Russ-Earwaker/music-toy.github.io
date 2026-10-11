// Compatibility entry point for existing callers; Advanced stays on the board.
import {zoomInPanel,zoomOutPanel} from './toy-advanced.js';
export {zoomInPanel,zoomOutPanel};
window.zoomInPanel=zoomInPanel;
window.zoomOutPanel=zoomOutPanel;
