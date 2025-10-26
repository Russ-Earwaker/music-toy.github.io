// src/drawgrid-init.js
// Boot drawing grid only for panels with data-toy="drawgrid".
import { createDrawGrid } from './drawgrid.js';
import { connectDrawGridToPlayer } from './drawgrid-player.js';
import { initToyUI } from './toyui.js';

export function initDrawGrid(panel){
  if (!panel || panel.__drawgridInit) return panel?.__drawToy;
  // Use the canonical instrument_id directly to avoid a race condition where
  // the display name lookup fails because the instrument catalog hasn't loaded yet.
  initToyUI(panel, { toyName: 'Draw Grid', defaultInstrument: 'acoustic_guitar', });
  const toy = createDrawGrid(panel, { toyId: panel.id || 'drawgrid-1' });
  connectDrawGridToPlayer(panel);
  panel.__drawgridInit = true;
  panel.__drawToy = toy;
  return toy;
}