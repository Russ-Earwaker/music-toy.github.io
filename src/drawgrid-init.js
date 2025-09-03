// src/drawgrid-init.js
// Boot drawing grid only for panels with data-toy="drawgrid".
import { createDrawGrid } from './drawgrid.js';
import { initToyUI } from './toyui.js';

export function initDrawGrid(panel){
  if (!panel || panel.__drawgridInit) return panel?.__drawToy;
  initToyUI(panel, { toyName: 'Draw Grid' });
  const toy = createDrawGrid(panel, { toyId: panel.id || 'drawgrid-1' });
  panel.__drawgridInit = true;
  panel.__drawToy = toy;
  return toy;
}

function boot(){
  const panel = document.getElementById('drawgrid1');
  if (panel) initDrawGrid(panel);
}
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
