// src/drawgrid.js
// Minimal, scoped Drawing Grid — 16x12, draw strokes, build snapped nodes on release.
// Strictly confined to the provided panel element.
import { buildPalette, midiToName } from './note-helpers.js';
import { drawBlock } from './toyhelpers.js';

const STROKE_COLORS = [
  'rgba(95,179,255,0.95)',  // Blue
  'rgba(255,95,179,0.95)',  // Pink
  'rgba(95,255,179,0.95)',  // Green
  'rgba(255,220,95,0.95)', // Yellow
];
let colorIndex = 0;

export function createDrawGrid(panel, { cols: initialCols = 8, rows = 12, toyId, bpm = 120 } = {}) {
  // The init script now guarantees the panel is a valid HTMLElement with the correct dataset.
  // The .toy-body is now guaranteed to exist by initToyUI, which runs first.
  const body = panel.querySelector('.toy-body');

  if (!body) {
    console.error('[drawgrid] Fatal: could not find .toy-body element!');
    return;
  }

  // Eraser cursor
  const eraserCursor = document.createElement('div');
  eraserCursor.className = 'drawgrid-eraser-cursor';
  body.appendChild(eraserCursor);

  // Layers
  const grid = document.createElement('canvas'); grid.setAttribute('data-role','drawgrid-grid');
  const paint = document.createElement('canvas'); paint.setAttribute('data-role','drawgrid-paint');
  const nodesCanvas = document.createElement('canvas'); nodesCanvas.setAttribute('data-role', 'drawgrid-nodes');
  const flashCanvas = document.createElement('canvas'); flashCanvas.setAttribute('data-role', 'drawgrid-flash');
  Object.assign(grid.style,  { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 1 });
  Object.assign(paint.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 2 });
  Object.assign(flashCanvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 3, pointerEvents: 'none' });
  Object.assign(nodesCanvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 4, pointerEvents: 'none' });
  body.appendChild(grid);
  body.appendChild(paint);
  body.appendChild(nodesCanvas);
  body.appendChild(flashCanvas);

  const gctx = grid.getContext('2d', { willReadFrequently: true });
  const pctx = paint.getContext('2d', { willReadFrequently: true });
  const nctx = nodesCanvas.getContext('2d', { willReadFrequently: true });
  const fctx = flashCanvas.getContext('2d', { willReadFrequently: true });

  // State
  let cols = initialCols;
  let cssW=0, cssH=0, cw=0, ch=0, topPad=0, dpr=1;
  let drawing=false, erasing=false;
  // The `strokes` array is removed. The paint canvas is now the source of truth.
  let cur = null;
  let strokes = []; // Store all completed stroke objects
  let currentMap = null; // Store the current node map {active, nodes, disabled}
  let nodeCoordsForHitTest = []; // For draggable nodes
  let nodeGroupMap = []; // Per-column Map(row -> groupId or [groupIds]) to avoid cross-line connections and track z-order
  let nextDrawTarget = null; // Can be 1 or 2. Determines the next special line.
  let flashes = new Float32Array(cols);
  let playheadCol = -1;
  let erasedTargetsThisDrag = new Set(); // For eraser hit-testing of specific nodes (currently unused)
  let manualOverrides = Array.from({ length: initialCols }, () => new Set()); // per-column node rows overridden by drags
  let draggedNode = null; // { col, row, group? }
  let pendingNodeTap = null; // potential tap for toggle
  let pendingActiveMask = null; // preserve active columns across resolution changes
  let previewGid = null; // 1 or 2 while drawing a special line preview
  let autoTune = true; // Default to on
  
  const safeArea = 40;
  let gridArea = { x: 0, y: 0, w: 0, h: 0 };

  panel.dataset.steps = String(cols);

  // UI: ensure Eraser button exists in header
  const header = panel.querySelector('.toy-header');
  if (header){
    const right = header.querySelector('.toy-controls-right') || header;
    let er = header.querySelector('[data-erase]');
    if (!er){
      er = document.createElement('button'); er.type='button'; er.textContent='Eraser'; er.className='toy-btn'; er.setAttribute('data-erase','1');
      right.appendChild(er);
    }
    er.addEventListener('click', ()=>{
      erasing = !erasing;
      er.setAttribute('aria-pressed', String(erasing));
      if (!erasing) eraserCursor.style.display = 'none';
      else erasedTargetsThisDrag.clear(); // Clear on tool toggle
    });

    // --- Generator Line Buttons (Advanced Mode Only) ---
    const generatorButtonsWrap = document.createElement('div');
    generatorButtonsWrap.className = 'drawgrid-generator-buttons';
    panel.appendChild(generatorButtonsWrap);

    const btnLine1 = document.createElement('button');
    btnLine1.type = 'button';
    btnLine1.className = 'toy-btn';
    btnLine1.dataset.line = '1';
    btnLine1.textContent = 'Draw Line 1';
    generatorButtonsWrap.appendChild(btnLine1);

    const btnLine2 = document.createElement('button');
    btnLine2.type = 'button';
    btnLine2.className = 'toy-btn';
    btnLine2.dataset.line = '2';
    btnLine2.textContent = 'Draw Line 2';
    generatorButtonsWrap.appendChild(btnLine2);

    function updateGeneratorButtons() {
        const hasLine1 = strokes.some(s => s.generatorId === 1);
        const hasLine2 = strokes.some(s => s.generatorId === 2);

        btnLine1.textContent = hasLine1 ? 'Redraw Line 1' : 'Draw Line 1';
        btnLine2.textContent = hasLine2 ? 'Redraw Line 2' : 'Draw Line 2';

        const a1 = nextDrawTarget === 1;
        const a2 = nextDrawTarget === 2;
        btnLine1.classList.toggle('active', a1);
        btnLine2.classList.toggle('active', a2);
        btnLine1.setAttribute('aria-pressed', String(a1));
        btnLine2.setAttribute('aria-pressed', String(a2));
    }
    try { panel.__dgUpdateButtons = updateGeneratorButtons; } catch{}

    function handleGeneratorButtonClick(e) {
        const lineNum = parseInt(e.target.dataset.line, 10);
        // Toggle arming for this line; do not modify existing strokes here
        if (nextDrawTarget === lineNum) {
            nextDrawTarget = null; // disarm
        } else {
            nextDrawTarget = lineNum; // arm
        }
        updateGeneratorButtons();
    }

    btnLine1.addEventListener('click', handleGeneratorButtonClick);
    btnLine2.addEventListener('click', handleGeneratorButtonClick);

    // Auto-tune toggle
    let autoTuneBtn = right.querySelector('.drawgrid-autotune');
    if (!autoTuneBtn) {
      autoTuneBtn = document.createElement('button');
      autoTuneBtn.type = 'button';
      autoTuneBtn.className = 'toy-btn drawgrid-autotune';
      autoTuneBtn.textContent = 'Auto-tune: On';
      autoTuneBtn.setAttribute('aria-pressed', 'true');
      right.appendChild(autoTuneBtn);

      autoTuneBtn.addEventListener('click', () => {
        autoTune = !autoTune;
        autoTuneBtn.textContent = `Auto-tune: ${autoTune ? 'On' : 'Off'}`;
        autoTuneBtn.setAttribute('aria-pressed', String(autoTune)); // This will re-snap all nodes
        resnapAndRedraw(false);
      });
    }

    // Steps dropdown
    let stepsSel = right.querySelector('.drawgrid-steps');
    if (!stepsSel) {
      stepsSel = document.createElement('select');
      stepsSel.className = 'drawgrid-steps';
      stepsSel.innerHTML = `<option value="8">8 steps</option><option value="16">16 steps</option>`;
      stepsSel.value = String(cols);
      right.appendChild(stepsSel);

      stepsSel.addEventListener('change', () => {
        const prevCols = cols;
        const prevActive = currentMap?.active ? Array.from(currentMap.active) : null;
        cols = parseInt(stepsSel.value, 10);
        panel.dataset.steps = String(cols);
        flashes = new Float32Array(cols);
        // Reset manual overrides on resolution changes to avoid mismatches
        manualOverrides = Array.from({ length: cols }, () => new Set());
        // Invalidate the node cache on all strokes since grid dimensions changed.
        for (const s of strokes) { s.cachedNodes = null; }
        if (prevActive) {
          pendingActiveMask = { prevCols, prevActive };
          // Also apply immediately to currentMap if present (for cases with no strokes)
          if (currentMap && Array.isArray(currentMap.active)) {
            const newCols = cols;
            const mapped = Array(newCols).fill(false);
            if (prevCols === newCols) {
              for (let i = 0; i < newCols; i++) mapped[i] = !!prevActive[i];
            } else if (newCols % prevCols === 0) {
              const f = newCols / prevCols;
              for (let i = 0; i < prevCols; i++) {
                for (let j = 0; j < f; j++) mapped[i * f + j] = !!prevActive[i];
              }
            } else if (prevCols % newCols === 0) {
              const f = prevCols / newCols;
              for (let i = 0; i < newCols; i++) {
                let any = false;
                for (let j = 0; j < f; j++) any = any || !!prevActive[i * f + j];
                mapped[i] = any;
              }
            } else {
              for (let i = 0; i < newCols; i++) {
                const src = Math.floor(i * prevCols / newCols);
                mapped[i] = !!prevActive[src];
              }
            }
            currentMap.active = mapped;
          }
        }
        resnapAndRedraw(true);
      });
    }

    // Randomize button
    let randomBtn = right.querySelector('.drawgrid-random');
    if (!randomBtn) {
      randomBtn = document.createElement('button');
      randomBtn.type = 'button';
      randomBtn.className = 'toy-btn drawgrid-random';
      randomBtn.textContent = 'Randomize';
      right.appendChild(randomBtn);

      randomBtn.addEventListener('click', () => {
        // Ensure data structures exist
        if (!currentMap) {
          currentMap = { active: Array(cols).fill(false), nodes: Array.from({length:cols},()=>new Set()), disabled: Array.from({length:cols},()=>new Set()) };
        }

        // Clear all existing lines and nodes
        strokes = [];
        nodeGroupMap = Array.from({ length: cols }, () => new Map());
        pctx.clearRect(0, 0, cssW, cssH);
        nctx.clearRect(0, 0, cssW, cssH);

        // Build a smooth, dramatic wiggly line across the full grid height using Catmull-Rom interpolation
        try {
          const leftX = gridArea.x;
          const rightX = gridArea.x + gridArea.w;
          const minY = gridArea.y + topPad + ch*0.2; // keep safely inside grid rows
          const maxY = gridArea.y + topPad + rows*ch - ch*0.2;
          const K = Math.max(6, Math.round(gridArea.w / Math.max(1, cw*0.9))); // control points
          const cps = [];
          for (let i=0;i<K;i++){
            const t = i/(K-1);
            const x = leftX + (rightX-leftX)*t;
            // bias extremes sometimes to reach near full height
            const r = Math.random();
            let y;
            if (r < 0.2) y = minY + (Math.random()*ch*0.6);
            else if (r > 0.8) y = maxY - (Math.random()*ch*0.6);
            else y = minY + Math.random()*(maxY-minY);
            cps.push({ x, y });
          }
          // Catmull-Rom interpolation
          function cr(p0,p1,p2,p3,t){
            const t2=t*t, t3=t2*t;
            const a = (-t3+2*t2-t)/2, b = (3*t3-5*t2+2)/2, c = (-3*t3+4*t2+t)/2, d = (t3-t2)/2;
            return a*p0 + b*p1 + c*p2 + d*p3;
          }
          const pts = [];
          const samplesPerSeg = Math.max(8, Math.round(cw/3));
          for (let i=0;i<cps.length-1;i++){
            const p0 = cps[Math.max(0,i-1)], p1=cps[i], p2=cps[i+1], p3=cps[Math.min(cps.length-1,i+2)];
            for (let s=0;s<=samplesPerSeg;s++){
              const t = s/samplesPerSeg;
              const x = cr(p0.x, p1.x, p2.x, p3.x, t);
              let y = cr(p0.y, p1.y, p2.y, p3.y, t);
              // clamp and bias toward row centers to ensure snap coverage
              y = Math.max(minY, Math.min(maxY, y));
              // optional: nudge toward nearest row center a bit
              const rowF = (y - (gridArea.y + topPad)) / ch;
              const rowCenterY = (Math.round(rowF) + 0.5) * ch + gridArea.y + topPad;
              y = 0.85 * y + 0.15 * rowCenterY;
              pts.push({ x, y });
            }
          }
          // Create as special Line 1 so connectors and colors apply
          const stroke = { pts, color: '#fff', isSpecial: true, generatorId: 1 };
          strokes.push(stroke);
          drawFullStroke(pctx, stroke);
          // Snap to nodes from strokes
          regenerateMapFromStrokes();
          // Randomly disable some notes and columns to mimic prior cube randomisation
          try {
            if (currentMap) {
              // Cap how many notes are turned off per active column:
              // 1..3 for typical grids, 1..6 for 16-step grids
              const maxOff = (cols >= 16) ? 6 : 3;
              const minOff = 1;
              for (let c = 0; c < cols; c++) {
                const rowsSet = currentMap.nodes[c];
                const hasNodes = rowsSet && rowsSet.size > 0;
                if (!hasNodes) continue;
                // With 40% chance, mute the whole column
                const muteCol = Math.random() < 0.4;
                currentMap.active[c] = !muteCol;
                if (!currentMap.disabled) currentMap.disabled = Array.from({length:cols},()=>new Set());
                const disSet = currentMap.disabled[c];
                // Disable a bounded number of rows in active columns
                if (!muteCol) {
                  const rowsArr = Array.from(rowsSet);
                  // Ensure at least one row remains enabled; if only one, disable 0
                  const maxDisable = Math.max(0, rowsArr.length - 1);
                  if (maxDisable === 0) {
                    // nothing to disable
                  } else {
                    const limit = Math.max(1, Math.min(maxOff, maxDisable));
                    const minThis = Math.min(minOff, limit);
                    const offCount = Math.floor(Math.random() * (limit - minThis + 1)) + minThis;
                  // Shuffle and take first offCount entries
                  for (let i = rowsArr.length - 1; i > 0; i--) {
                    const j = (Math.random() * (i + 1)) | 0; const t = rowsArr[i]; rowsArr[i] = rowsArr[j]; rowsArr[j] = t;
                  }
                    for (let k = 0; k < offCount && k < rowsArr.length; k++) disSet.add(rowsArr[k]);
                  }
                  // Recompute active based on remaining enabled nodes
                  const anyOn = Array.from(currentMap.nodes[c]).some(r => !disSet.has(r));
                  currentMap.active[c] = anyOn;
                }
              }
            }
          } catch {}
        } catch(e){ try{ console.warn('[drawgrid random special line]', e); }catch{} }

        drawGrid();
        drawNodes(currentMap.nodes);
        panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap }));
      });
    }
  }

  // New central helper to redraw the paint canvas and regenerate the node map from the `strokes` array.
function clearAndRedrawFromStrokes() {
    pctx.clearRect(0, 0, cssW, cssH);
    for (const s of strokes) { drawFullStroke(pctx, s); }
    regenerateMapFromStrokes();
    try { (panel.__dgUpdateButtons || updateGeneratorButtons || function(){})() } catch(e) { try { console.warn('[drawgrid] updateGeneratorButtons not available', e); } catch{} }
  }

  // Regenerates the node map by snapping all generator strokes.
function regenerateMapFromStrokes() {
      const isZoomed = panel.classList.contains('toy-zoomed');
      const newMap = { active: Array(cols).fill(false), nodes: Array.from({ length: cols }, () => new Set()), disabled: Array.from({ length: cols }, () => new Set()) };
      const newGroups = Array.from({ length: cols }, () => new Map());

      if (isZoomed) {
        // Advanced view: snap each generator line separately and union nodes.
        const gens = strokes.filter(s => s.generatorId);
        for (const s of gens) {
          const partial = snapToGridFromStroke(s);
          for (let c = 0; c < cols; c++){
            if (partial.nodes[c]?.size > 0){
              partial.nodes[c].forEach(row => {
                newMap.nodes[c].add(row);
                // Track z-ordered group stacks per row. Only store real generator IDs (1/2), not 0/null.
                if (s.generatorId) {
                  const stack = newGroups[c].get(row) || [];
                  if (!stack.includes(s.generatorId)) stack.push(s.generatorId);
                  newGroups[c].set(row, stack);
                }
              });
              newMap.active[c] = true;
            }
          }
        }
      } else {
        // Standard view: if generator lines exist, preserve all of them; otherwise fall back to first special stroke.
        const gens = strokes.filter(s => s.generatorId);
        if (gens.length > 0){
          for (const s of gens){
            const partial = snapToGridFromStroke(s);
            for (let c = 0; c < cols; c++){
              if (partial.nodes[c]?.size > 0){
                partial.nodes[c].forEach(row => {
                  newMap.nodes[c].add(row);
                  if (s.generatorId) {
                    const stack = newGroups[c].get(row) || [];
                    if (!stack.includes(s.generatorId)) stack.push(s.generatorId);
                    newGroups[c].set(row, stack);
                  }
                });
                newMap.active[c] = true;
              }
            }
          }
        } else {
          const specialStroke = strokes.find(s => s.isSpecial);
          if (specialStroke){
            const partial = snapToGridFromStroke(specialStroke);
            for (let c = 0; c < cols; c++){
              if (partial.nodes[c]?.size > 0){
                partial.nodes[c].forEach(row => {
                  newMap.nodes[c].add(row);
                  if (specialStroke.generatorId) {
                    const stack = newGroups[c].get(row) || [];
                    if (!stack.includes(specialStroke.generatorId)) stack.push(specialStroke.generatorId);
                    newGroups[c].set(row, stack);
                  }
                });
                newMap.active[c] = true;
              }
            }
          }
        }

        // Apply manual node overrides when returning to standard view
        try {
          if (manualOverrides && Array.isArray(manualOverrides)) {
            for (let c = 0; c < cols; c++) {
              const ov = manualOverrides[c];
              if (ov && ov.size > 0) {
                newMap.nodes[c] = new Set(ov);
                // recompute active based on disabled set
                const dis = newMap.disabled?.[c] || new Set();
                const anyOn = Array.from(newMap.nodes[c]).some(r => !dis.has(r));
                newMap.active[c] = anyOn;
                // carry over groups from nodeGroupMap so we still avoid cross-line connections
                if (nodeGroupMap && nodeGroupMap[c] instanceof Map) {
                  for (const r of newMap.nodes[c]) {
                    const g = nodeGroupMap[c].get(r);
                    if (g != null) {
                      const stack = Array.isArray(g) ? g.slice() : [g];
                      newGroups[c].set(r, stack);
                    }
                  }
                }
              }
            }
          }
        } catch {}
      }

      // If a pending active mask exists (e.g., after steps change), map it to new cols
      if (pendingActiveMask && Array.isArray(pendingActiveMask.prevActive)) {
        const prevCols = pendingActiveMask.prevCols || newMap.active.length;
        const prevActive = pendingActiveMask.prevActive;
        const newCols = cols;
        const mapped = Array(newCols).fill(false);
        if (prevCols === newCols) {
          for (let i = 0; i < newCols; i++) mapped[i] = !!prevActive[i];
        } else if (newCols % prevCols === 0) {
          // upscale: duplicate each prior column's state into its segments
          const f = newCols / prevCols;
          for (let i = 0; i < prevCols; i++) {
            for (let j = 0; j < f; j++) mapped[i * f + j] = !!prevActive[i];
          }
        } else if (prevCols % newCols === 0) {
          // downscale: OR any segment to preserve activity if either subcolumn was active
          const f = prevCols / newCols;
          for (let i = 0; i < newCols; i++) {
            let any = false;
            for (let j = 0; j < f; j++) any = any || !!prevActive[i * f + j];
            mapped[i] = any;
          }
        } else {
          // fallback proportional map
          for (let i = 0; i < newCols; i++) {
            const src = Math.floor(i * prevCols / newCols);
            mapped[i] = !!prevActive[src];
          }
        }
        // Apply mapped active states but only where nodes exist
        for (let c = 0; c < newCols; c++) {
          if (newMap.nodes[c]?.size > 0) newMap.active[c] = mapped[c];
        }
        pendingActiveMask = null; // consume
      }

      // Preserve disabled nodes where positions still exist
      if (currentMap && Array.isArray(currentMap.disabled)) {
        for (let c = 0; c < cols; c++) {
          const prevDis = currentMap.disabled[c] || new Set();
          for (const r of prevDis) { if (newMap.nodes[c]?.has(r)) newMap.disabled[c].add(r); }
        }
      }
      // Recompute active flags based on disabled sets
      for (let c = 0; c < cols; c++) {
        if (!newMap.nodes[c] || newMap.nodes[c].size === 0) { newMap.active[c] = false; continue; }
        const dis = newMap.disabled?.[c] || new Set();
        const anyOn = Array.from(newMap.nodes[c]).some(r => !dis.has(r));
        newMap.active[c] = anyOn;
      }

      currentMap = newMap;
      nodeGroupMap = newGroups;
      try { (panel.__dgUpdateButtons || function(){})() } catch {}
      panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap }));
      drawNodes(currentMap.nodes);
      drawGrid();
  }

  function resnapAndRedraw(forceLayout = false) {
    const hasStrokes = strokes.length > 0;
    const hasNodes = currentMap && currentMap.nodes && currentMap.nodes.some(s => s && s.size > 0);
    // Only force layout when needed (e.g., steps/resolution change or zoom). Avoid clearing paint when unnecessary.
    layout(!!forceLayout);

    if (hasStrokes) {
      requestAnimationFrame(() => {
        if (!panel.isConnected) return;
        regenerateMapFromStrokes();
      });
    } else if (hasNodes) {
      // No strokes to regenerate from (e.g., after dragging). Preserve current nodes and do not clear paint.
      requestAnimationFrame(() => {
        if (!panel.isConnected) return;
        drawGrid();
        drawNodes(currentMap.nodes);
        panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap }));
      });
    } else {
      api.clear();
    }
  }


  panel.addEventListener('toy-zoom', () => {
    // Snapshot paint to preserve drawn/erased content across zoom transitions
    let zoomSnap = null;
    try {
      if (paint.width > 0 && paint.height > 0) {
        zoomSnap = document.createElement('canvas');
        zoomSnap.width = paint.width;
        zoomSnap.height = paint.height;
        zoomSnap.getContext('2d')?.drawImage(paint, 0, 0);
      }
    } catch {}
    // When zooming in or out, the panel's size changes.
    // We force a layout call to ensure everything is redrawn correctly.
    // A double rAF waits for the browser to finish style recalculation and layout
    // after the panel is moved in the DOM, preventing a "flash of blank canvas".
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!panel.isConnected) return;

        // If entering advanced mode, upgrade the standard-view special line to Line 1
        // so that its nodes are preserved.
    if (panel.classList.contains('toy-zoomed')) {
            const hasGeneratorLines = strokes.some(s => s.generatorId);
            if (!hasGeneratorLines) {
                // If there are no generator lines, we are effectively starting fresh
                // in advanced mode. Clear any purely visual strokes from standard view.
                strokes = [];
            }
        } else {
            // LEAVING advanced mode. Preserve generator lines; standard view will keep their nodes.
        }

        resnapAndRedraw(true);
        // Restore snapshot after layout has run
        requestAnimationFrame(() => {
          if (zoomSnap) {
            try {
              pctx.save();
              pctx.setTransform(1,0,0,1,0,0);
              pctx.drawImage(zoomSnap, 0,0, zoomSnap.width, zoomSnap.height, 0,0, paint.width, paint.height);
              pctx.restore();
            } catch {}
          }
        });
      });
    });
  });

  const observer = new ResizeObserver(layout);

  function getLineWidth() {
    return Math.max(12, Math.round(Math.min(cw, ch) * 0.85));
  }

  function layout(force = false){
    const newDpr = window.devicePixelRatio || 1;
    const r = body.getBoundingClientRect();
    const newW = Math.max(1, r.width|0);
    const newH = Math.max(1, r.height|0);

    if (force || newW !== cssW || newH !== cssH || newDpr !== dpr) {
      const oldW = cssW;
      const oldH = cssH;
      // Snapshot current paint to preserve erased/drawn content across resize
      let paintSnapshot = null;
      try {
        if (paint.width > 0 && paint.height > 0) {
          paintSnapshot = document.createElement('canvas');
          paintSnapshot.width = paint.width;
          paintSnapshot.height = paint.height;
          const psctx = paintSnapshot.getContext('2d');
          psctx.drawImage(paint, 0, 0);
        }
      } catch {}

      dpr = newDpr;
      cssW = newW;
      cssH = newH;
      const w = cssW * dpr;
      const h = cssH * dpr;
      grid.width = w; grid.height = h;
      paint.width = w; paint.height = h;
      nodesCanvas.width = w; nodesCanvas.height = h;
      flashCanvas.width = w; flashCanvas.height = h;
      gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Scale the logical stroke data if we have it and the canvas was resized
      if (strokes.length > 0 && oldW > 0 && oldH > 0) {
        const scaleX = cssW / oldW;
        const scaleY = cssH / oldH;
        if (scaleX !== 1 || scaleY !== 1) {
          for (const s of strokes) { s.pts = s.pts.map(p => ({ x: p.x * scaleX, y: p.y * scaleY })); }
        }
      }

      // Define the grid area inset by the safe area
      gridArea = {
        x: safeArea,
        y: safeArea,
        w: cssW > safeArea * 2 ? cssW - 2 * safeArea : 0,
        h: cssH > safeArea * 2 ? cssH - 2 * safeArea : 0,
      };

      // All calculations are now relative to the gridArea
      // Remove the top cube row; use a minimal padding
      topPad = 0;
      cw = gridArea.w / cols;
      ch = (gridArea.h > topPad) ? (gridArea.h - topPad) / rows : 0;

      // Update eraser cursor size
      const eraserWidth = getLineWidth() * 2;
      eraserCursor.style.width = `${eraserWidth}px`;
      eraserCursor.style.height = `${eraserWidth}px`;

      drawGrid();
      // Restore paint snapshot scaled to new size (preserves erasures)
      if (paintSnapshot) {
        try {
          pctx.save();
          // Draw in device pixels to avoid double-scaling from current transform
          pctx.setTransform(1, 0, 0, 1, 0, 0);
          pctx.drawImage(
            paintSnapshot,
            0, 0, paintSnapshot.width, paintSnapshot.height,
            0, 0, paint.width, paint.height
          );
          pctx.restore();
        } catch {}
      }
      // Clear other content canvases. The caller is responsible for redrawing nodes/overlay.
      nctx.clearRect(0, 0, cssW, cssH);
      fctx.clearRect(0, 0, cssW, cssH);
    }
  }

  function flashColumn(col) {
    // Save current grid state to restore after flash
    const currentGridData = gctx.getImageData(0, 0, grid.width, grid.height);

    const x = gridArea.x + col * cw;
    const w = cw;
    gctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    gctx.fillRect(x, gridArea.y, w, gridArea.h);

    setTimeout(() => {
        // A fade-out effect for a "fancier" feel
        let opacity = 0.6;
        const fade = setInterval(() => {
            gctx.putImageData(currentGridData, 0, 0); // Restore grid
            opacity -= 0.1;
            if (opacity <= 0) {
                clearInterval(fade);
                drawGrid(); // Final clean redraw
            } else {
                gctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                gctx.fillRect(x, gridArea.y, w, gridArea.h);
            }
        }, 30);
    }, 100); // Start fade after a short hold
  }

  function drawGrid(){
    gctx.clearRect(0, 0, cssW, cssH);

    // 1. Draw the note grid area below the top padding
    const noteGridY = gridArea.y + topPad;
    const noteGridH = gridArea.h - topPad;
    gctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    gctx.fillRect(gridArea.x, noteGridY, gridArea.w, noteGridH);

    // 2. Column highlights for active/inactive notes
    if (currentMap) {
        for (let c = 0; c < cols; c++) {
            if (currentMap.nodes[c]?.size > 0) {
                const isActive = currentMap.active[c];
                gctx.fillStyle = isActive ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.5)'; // Darker for inactive
                const x = gridArea.x + c * cw;
                gctx.fillRect(x, noteGridY, cw, noteGridH);
            }
        }
    }

    // 3. Draw the horizontal and vertical lines for the note grid
    gctx.strokeStyle='rgba(255,255,255,0.4)';
    gctx.lineWidth = 1.5;
    // Verticals
    for(let i=1;i<cols;i++){ gctx.beginPath(); gctx.moveTo(gridArea.x + i*cw, noteGridY); gctx.lineTo(gridArea.x + i*cw, gridArea.y + gridArea.h); gctx.stroke(); }
    // horizontals (grid area only)
    for(let j=1;j<rows;j++){ gctx.beginPath(); gctx.moveTo(gridArea.x, noteGridY + j*ch); gctx.lineTo(gridArea.x + gridArea.w, noteGridY + j*ch); gctx.stroke(); }

    // (Top cubes removed)
  }

  // A helper to draw a complete stroke from a point array.
  // This is used to create a clean image for snapping.
  function drawFullStroke(ctx, stroke) {
    if (!stroke || !stroke.pts || stroke.pts.length < 1) return;
    const color = stroke.color || STROKE_COLORS[0];

    ctx.save(); // Save context for potential glow effect
    const isStandard = !panel.classList.contains('toy-zoomed');
    const isOverlay = (ctx === fctx); // Only overlay animates hues; paint stays neutral for specials
    let wantsSpecial = !!stroke.isSpecial || (isOverlay && (stroke.generatorId === 1 || stroke.generatorId === 2));
    if (!wantsSpecial && isStandard) {
      const hasAnySpecial = strokes.some(s => s.isSpecial);
      if (!hasAnySpecial && stroke === cur) wantsSpecial = true; // first-line preview in standard
    }
    if (wantsSpecial && isOverlay) {
        ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }

    ctx.beginPath();
      if (stroke.pts.length === 1) {
      const lineWidth = getLineWidth();
      const p = stroke.pts[0];
      if (wantsSpecial) {
          const r = lineWidth / 2;
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          if (isOverlay) {
            const t = (performance.now ? performance.now() : Date.now());
            const gid = stroke.generatorId ?? 1; // default to Line 1 palette
            if (gid === 1) {
              const hue = 200 + 20 * Math.sin((t/800) * Math.PI * 2);
              grad.addColorStop(0, `hsl(${hue.toFixed(0)}, 100%, 75%)`);
              grad.addColorStop(0.7, `hsl(${(hue+60).toFixed(0)}, 100%, 68%)`);
              grad.addColorStop(1,  `hsla(${(hue+120).toFixed(0)}, 100%, 60%, 0.35)`);
            } else {
              const hue = 20 + 20 * Math.sin((t/900) * Math.PI * 2);
              grad.addColorStop(0, `hsl(${hue.toFixed(0)}, 100%, 70%)`);
              grad.addColorStop(0.7, `hsl(${(hue-25).toFixed(0)}, 100%, 65%)`);
              grad.addColorStop(1,  `hsla(${(hue-45).toFixed(0)}, 100%, 55%, 0.35)`);
            }
            ctx.fillStyle = grad;
          } else {
            // Paint layer: neutral for specials; overlay handles color shift
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
          }
      } else {
          ctx.fillStyle = color;
      }
      ctx.arc(p.x, p.y, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(stroke.pts[0].x, stroke.pts[0].y);
      for (let i = 1; i < stroke.pts.length; i++) {
        ctx.lineTo(stroke.pts[i].x, stroke.pts[i].y);
      }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      {
        const lw = getLineWidth() + (isOverlay ? 1.25 : 0);
        ctx.lineWidth = lw;
      }
      if (wantsSpecial) {
          const p1 = stroke.pts[0];
          const pLast = stroke.pts[stroke.pts.length - 1];
          const grad = ctx.createLinearGradient(p1.x, p1.y, pLast.x, pLast.y);
          if (isOverlay) {
            const t = (performance.now ? performance.now() : Date.now());
            const gid = stroke.generatorId ?? 1;
            if (gid === 1) {
              const hue = 200 + 20 * Math.sin((t/800) * Math.PI * 2);
              grad.addColorStop(0, `hsl(${hue.toFixed(0)}, 100%, 70%)`);
              grad.addColorStop(0.5, `hsl(${(hue+45).toFixed(0)}, 100%, 70%)`);
              grad.addColorStop(1,  `hsl(${(hue+90).toFixed(0)}, 100%, 68%)`);
            } else {
              const hue = 20 + 20 * Math.sin((t/900) * Math.PI * 2);
              grad.addColorStop(0, `hsl(${hue.toFixed(0)}, 100%, 68%)`);
              grad.addColorStop(0.5, `hsl(${(hue-25).toFixed(0)}, 100%, 66%)`);
              grad.addColorStop(1,  `hsl(${(hue-50).toFixed(0)}, 100%, 64%)`);
            }
            ctx.strokeStyle = grad;
          } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          }
      } else {
          ctx.strokeStyle = color;
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  function eraseAtPoint(p) {
    const R = getLineWidth(); // This is the radius
    pctx.save();
    pctx.globalCompositeOperation = 'destination-out';
    pctx.beginPath();
    pctx.arc(p.x, p.y, R, 0, Math.PI * 2, false);
    pctx.fillStyle = '#000';
    pctx.fill();
    pctx.restore();
  }

  function animateErasedNode(node) {
    const duration = 250; // 0.25 seconds
    const startTime = performance.now();
    const initialRadius = Math.max(3, Math.min(cw, ch) * 0.15);

    function frame(now) {
        if (!panel.isConnected) return;
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOutQuad = t => t * (2 - t);
        const easedProgress = easeOutQuad(progress);

        // Redraw the static nodes first (the map is already updated)
        drawNodes(currentMap.nodes);

        // Then draw the animating "ghost" node on top
        if (progress < 1) {
            const scale = 1 + 2.5 * easedProgress; // Scale up to 3.5x
            const opacity = 1 - progress; // Fade out

            nctx.save();
            nctx.globalAlpha = opacity;
            nctx.fillStyle = 'rgba(255, 255, 255, 1)'; // Bright white

            // Add a bright glow that fades
            nctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
            nctx.shadowBlur = 20 * (1 - progress);

            nctx.beginPath();
            nctx.arc(node.x, node.y, initialRadius * scale, 0, Math.PI * 2);
            nctx.fill();
            nctx.restore();
            requestAnimationFrame(frame);
        }
    }
    requestAnimationFrame(frame);
  }

  function drawNodes(nodes) {
    nctx.clearRect(0, 0, cssW, cssH);
    if (!nodes) { nodeCoordsForHitTest = []; return; }

    const nodeCoords = []; // Store coordinates of each node: {x, y, col, row, radius, group, disabled}
    nodeCoordsForHitTest = []; // Clear for new set
    const radius = Math.max(4, Math.min(cw, ch) * 0.20); // Bigger nodes

    // First, find all node center points
    for (let c = 0; c < cols; c++) {
        if (nodes[c] && nodes[c].size > 0) {
            for (const r of nodes[c]) {
                const x = gridArea.x + c * cw + cw * 0.5;
                const y = gridArea.y + topPad + r * ch + ch * 0.5;
                const groupEntry = (nodeGroupMap && nodeGroupMap[c]) ? (nodeGroupMap[c].get(r) ?? null) : null;
                const disabledSet = currentMap?.disabled?.[c];
                const isDisabled = !!(disabledSet && disabledSet.has(r));
                if (Array.isArray(groupEntry) && groupEntry.length > 0) {
                  // Multiple overlapped nodes at same position; respect z-order (last is top).
                  // For hit-testing, push top-most first so it is grabbed first.
                  for (let i = groupEntry.length - 1; i >= 0; i--) {
                    const gid = groupEntry[i];
                    const nodeData = { x, y, col: c, row: r, radius: radius * 1.5, group: gid, disabled: isDisabled };
                    nodeCoords.push(nodeData);
                    nodeCoordsForHitTest.push(nodeData);
                  }
                } else {
                  const groupId = (typeof groupEntry === 'number') ? groupEntry : null;
                  const nodeData = { x, y, col: c, row: r, radius: radius * 1.5, group: groupId, disabled: isDisabled }; // Use a larger hit area
                  nodeCoords.push(nodeData);
                  nodeCoordsForHitTest.push(nodeData);
                }
            }
        }
    }

    // --- Draw connecting lines ---
    nctx.lineWidth = 3; // Thicker

    // Group nodes by column for easier and more efficient lookup
    const colsMap = new Map();
    for (const node of nodeCoords) {
        if (!colsMap.has(node.col)) colsMap.set(node.col, []);
        colsMap.get(node.col).push(node);
    }

    // Stroke per segment to handle color changes and disabled nodes (no animation on connectors)
    for (let c = 0; c < cols - 1; c++) {
      const currentColNodes = colsMap.get(c);
      const nextColNodes = colsMap.get(c + 1);
      if (currentColNodes && nextColNodes) {
        const currentIsActive = currentMap?.active?.[c] ?? true;
        const nextIsActive = currentMap?.active?.[c + 1] ?? true;
        const advanced = panel.classList.contains('toy-zoomed');
        const disabledStyle = 'rgba(120, 120, 120, 0.7)';
        const colorFor = (gid, active=true) => {
          if (!active) return disabledStyle;
          if (gid === 1) return 'rgba(125, 180, 255, 0.9)'; // static bluish
          if (gid === 2) return 'rgba(255, 160, 120, 0.9)'; // static orangey
          return 'rgba(255, 255, 255, 0.85)';
        };

        const matchGroup = (g, gid) => {
          if (gid == null) return (g == null);
          return g === gid;
        };

        const drawGroupConnections = (gid) => {
          for (const node of currentColNodes) {
            if (!matchGroup(node.group ?? null, gid)) continue;
            for (const nextNode of nextColNodes) {
              if (!matchGroup(nextNode.group ?? null, gid)) continue;
              const eitherDisabled = node.disabled || nextNode.disabled || !currentIsActive || !nextIsActive;
              nctx.strokeStyle = colorFor(gid, !eitherDisabled);
              nctx.beginPath();
              nctx.moveTo(node.x, node.y);
              nctx.lineTo(nextNode.x, nextNode.y);
              nctx.stroke();
            }
          }
        };

        // Draw per group to avoid cross-line connections in both modes.
        drawGroupConnections(1);
        drawGroupConnections(2);
        drawGroupConnections(null);
      }
    }

    // --- Draw node cubes (with flash animation) on top of connectors ---
    for (const node of nodeCoords) {
        const colActive = currentMap?.active?.[node.col] ?? true;
        const nodeOn = colActive && !node.disabled;
        const flash = flashes[node.col] || 0;
        const size = radius * 2;
        const cubeRect = { x: node.x - size/2, y: node.y - size/2, w: size, h: size };

        nctx.save();
        if (flash > 0) {
          const scale = 1 + 0.15 * Math.sin(flash * Math.PI);
          nctx.translate(node.x, node.y);
          nctx.scale(scale, scale);
          nctx.translate(-node.x, -node.y);
        }
        drawBlock(nctx, cubeRect, {
          baseColor: flash > 0.01 ? '#FFFFFF' : (nodeOn ? '#ff8c00' : '#333'),
          active: flash > 0.01 || nodeOn,
          variant: 'button',
          noteLabel: null,
          showArrows: false,
        });
        nctx.restore();
    }

    drawNoteLabels(nodes);
  }

  function drawNoteLabels(nodes) {
    nctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    nctx.font = '12px system-ui, sans-serif';
    nctx.textAlign = 'center';
    nctx.textBaseline = 'bottom';
    const labelY = cssH - 10; // Position below the grid area, in the safe zone

    for (let c = 0; c < cols; c++) {
        if (nodes[c] && nodes[c].size > 0) {
            // choose first non-disabled row for label
            let r = undefined;
            const disabledSet = currentMap?.disabled?.[c] || new Set();
            for (const row of nodes[c]) { if (!disabledSet.has(row)) { r = row; break; } }
            if (r === undefined) continue;
            const midiNote = chromaticPalette[r];
            if (midiNote !== undefined) {
                const x = gridArea.x + c * cw + cw * 0.5;
                nctx.fillText(midiToName(midiNote), x, labelY);
            }
        }
    }
  }

  // --- Note Palettes for Snapping ---
  const pentatonicOffsets = [0, 3, 5, 7, 10];
  const chromaticOffsets = Array.from({length: 12}, (_, i) => i);
  // Create palettes of MIDI numbers. Reversed so top row is highest pitch.
  const chromaticPalette = buildPalette(60, chromaticOffsets, 1).reverse(); // MIDI 71 (B4) down to 60 (C4)
  const pentatonicPalette = buildPalette(60, pentatonicOffsets, 2).reverse(); // 10 notes from C4-C6 range

  function snapToGrid(sourceCtx = pctx){
    // build a map: for each column, choose at most one row where line crosses
    const active = Array(cols).fill(false);
    const nodes = Array.from({length:cols}, ()=> new Set());
    const w = paint.width;
    const h = paint.height;
    if (!w || !h) return { active, nodes }; // Abort if canvas is not ready
    const data = sourceCtx.getImageData(0, 0, w, h).data;

    for (let c=0;c<cols;c++){
      // Define the scan area strictly to the visible grid column to avoid phantom nodes
      const xStart_css = gridArea.x + c * cw;
      const xEnd_css = gridArea.x + (c + 1) * cw;
      const xStart = Math.round(xStart_css * dpr);
      const xEnd = Math.round(xEnd_css * dpr);
      
      let ySum = 0;
      let inkCount = 0;

      // Scan the column for all "ink" pixels to find the average Y position
      // We scan the full canvas height because the user can draw above or below the visual grid.
      for (let x = xStart; x < xEnd; x++) {
        for (let y = 0; y < h; y++) {
          const i = (y * w + x) * 4;
          if (data[i + 3] > 10) { // alpha threshold
            ySum += y;
            inkCount++;
          }
        }
      }

      if (inkCount > 0) {
        const avgY_dpr = ySum / inkCount;
        const avgY_css = avgY_dpr / dpr;

        // Map average Y to nearest row, clamped to valid range so strokes slightly
        // outside the grid bottom/top still snap to the nearest playable row.
        const r_clamped = Math.max(0, Math.min(rows - 1, Math.round((avgY_css - (gridArea.y + topPad)) / ch)));
        {
          let r_final = r_clamped;

          if (autoTune) {
            // 1. Get the MIDI note for the visually-drawn row
            const drawnMidi = chromaticPalette[r_clamped];

            // 2. Find the nearest note in the pentatonic scale
            let nearestMidi = pentatonicPalette[0];
            let minDiff = Math.abs(drawnMidi - nearestMidi);
            for (const pNote of pentatonicPalette) {
              const diff = Math.abs(drawnMidi - pNote);
              if (diff < minDiff) { minDiff = diff; nearestMidi = pNote; }
            }

            // 3. Map that pentatonic note into the visible chromatic range by octave wrapping
            try {
              const minC = chromaticPalette[chromaticPalette.length - 1];
              const maxC = chromaticPalette[0];
              let wrapped = nearestMidi|0;
              while (wrapped > maxC) wrapped -= 12;
              while (wrapped < minC) wrapped += 12;
              const correctedRow = chromaticPalette.indexOf(wrapped);
              if (correctedRow !== -1) r_final = correctedRow;
            } catch {}
          }

          nodes[c].add(r_final);
          active[c] = true;
        }
      }
    }
    return {active, nodes};
  }

  function eraseNodeAtPoint(p) {
    const eraserRadius = getLineWidth();
    for (const node of [...nodeCoordsForHitTest]) { // Iterate on a copy
        const key = `${node.col}:${node.row}:${node.group ?? 'n'}`;
        if (erasedTargetsThisDrag.has(key)) continue;

        if (Math.hypot(p.x - node.x, p.y - node.y) < eraserRadius) {
            const col = node.col;
            const row = node.row;
            erasedTargetsThisDrag.add(key);

            if (currentMap && currentMap.nodes[col]) {
                // Do not remove groups or nodes; mark it disabled instead so connections persist (but gray)
                if (!currentMap.disabled) currentMap.disabled = Array.from({length:cols},()=>new Set());
                currentMap.disabled[col].add(row);
                // If no enabled nodes remain, mark column inactive
                const dis = currentMap.disabled[col];
                const anyOn = Array.from(currentMap.nodes[col] || []).some(r => !dis.has(r));
                currentMap.active[col] = anyOn;
            }

            // Start the animation of the erased node only
            animateErasedNode(node);
            // Notify the player of the change
            panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap }));
        }
    }
  }

  function onPointerDown(e){
    const rect = paint.getBoundingClientRect();
    const p = { x:e.clientX-rect.left, y:e.clientY-rect.top };

    // (Top cubes removed)

    // Check for node hit first using full grid cell bounds (bigger tap area)
    for (const node of nodeCoordsForHitTest) {
      const cellX = gridArea.x + node.col * cw;
      const cellY = gridArea.y + topPad + node.row * ch;
      if (p.x >= cellX && p.x <= cellX + cw && p.y >= cellY && p.y <= cellY + ch) {
        // With eraser active: erase paint and disable this node + attached lines coloration
        if (erasing) { erasedTargetsThisDrag.clear(); eraseNodeAtPoint(p); eraseAtPoint(p); return; }
        pendingNodeTap = { col: node.col, row: node.row, x: p.x, y: p.y, group: node.group ?? null };
        drawing = true; // capture move/up
        paint.setPointerCapture?.(e.pointerId);
        return; // Defer deciding until move/up
      }
    }

    drawing=true;
    paint.setPointerCapture?.(e.pointerId);

    if (erasing) {
      erasedTargetsThisDrag.clear(); // Reset on new drag (not used but kept)
      eraseAtPoint(p); // erase visual line only
    } else {
      // When starting a new line, don't clear the canvas. This makes drawing additive.
      // If we are about to draw a special line (previewGid decided), demote any existing line of that kind.
      try {
        const isZoomed = panel.classList.contains('toy-zoomed');
        const hasLine1 = strokes.some(s => s.generatorId === 1);
        const hasLine2 = strokes.some(s => s.generatorId === 2);
        let intendedGid = null;
        if (!isZoomed) {
          if (!hasLine1 && !hasLine2) intendedGid = 1;
        } else {
          if (!hasLine1) intendedGid = 1; else if (nextDrawTarget) intendedGid = nextDrawTarget;
        }
        if (intendedGid) {
          const existing = strokes.find(s => s.generatorId === intendedGid);
          if (existing) {
            existing.isSpecial = false;
            existing.generatorId = null;
            existing.overlayColorize = true;
            // assign a random palette color
            const idx = Math.floor(Math.random() * STROKE_COLORS.length);
            existing.color = STROKE_COLORS[idx];
          }
        }
      } catch {}
      cur = { 
        pts:[p],
        color: STROKE_COLORS[colorIndex++ % STROKE_COLORS.length]
      };
      // The full stroke will be drawn on pointermove.
    }
  }
  function onPointerMove(e){
    const rect = paint.getBoundingClientRect();
    const p = { x:e.clientX-rect.left, y:e.clientY-rect.top };

    // Update cursor for draggable nodes in advanced mode
    if (panel.classList.contains('toy-zoomed') && !draggedNode) {
      let onNode = false;
      for (const node of nodeCoordsForHitTest) {
        const cellX = gridArea.x + node.col * cw;
        const cellY = gridArea.y + topPad + node.row * ch;
        if (p.x >= cellX && p.x <= cellX + cw && p.y >= cellY && p.y <= cellY + ch) { onNode = true; break; }
      }
      paint.style.cursor = onNode ? 'grab' : 'default';
    }

    // Promote pending tap to drag if moved sufficiently
    if (panel.classList.contains('toy-zoomed') && pendingNodeTap && drawing && !draggedNode) {
      const dx = p.x - pendingNodeTap.x;
      const dy = p.y - pendingNodeTap.y;
      if (Math.hypot(dx, dy) > 6) {
        draggedNode = { col: pendingNodeTap.col, row: pendingNodeTap.row, group: pendingNodeTap.group ?? null };
        paint.style.cursor = 'grabbing';
        pendingNodeTap = null;
      }
    }

    if (draggedNode && drawing) {
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      const newRow = clamp(Math.round((p.y - (gridArea.y + topPad)) / ch), 0, rows - 1);

      if (newRow !== draggedNode.row && currentMap) {
          const col = draggedNode.col;
          const oldRow = draggedNode.row;
          const gid = draggedNode.group ?? null;

          // Ensure group map exists for this column
          if (!nodeGroupMap[col]) nodeGroupMap[col] = new Map();
          const colGroupMap = nodeGroupMap[col];

          // Remove this group's presence from the old row's stack
          if (gid != null) {
            const oldArr = (colGroupMap.get(oldRow) || []).filter(g => g !== gid);
            if (oldArr.length > 0) colGroupMap.set(oldRow, oldArr); else colGroupMap.delete(oldRow);
          } else {
            // Ungrouped move: nothing in group map to update
          }

          // Update nodes set for old row only if no groups remain there
          if (!(colGroupMap.has(oldRow))) {
            // If some other ungrouped logic wants to keep it, ensure we don't remove erroneously
            currentMap.nodes[col].delete(oldRow);
          }

          // Add/move to new row; place on top of z-stack
          if (gid != null) {
            const newArr = colGroupMap.get(newRow) || [];
            // Remove any existing same gid first to avoid dupes, then push to end (top)
            const filtered = newArr.filter(g => g !== gid);
            filtered.push(gid);
            colGroupMap.set(newRow, filtered);
          }
          currentMap.nodes[col].add(newRow);

          // record manual override for standard view preservation
          try {
            if (!manualOverrides[col]) manualOverrides[col] = new Set();
            manualOverrides[col] = new Set(currentMap.nodes[col]);
          } catch {}

          draggedNode.row = newRow;
          
          // Redraw only the nodes canvas; the blue line on the paint canvas is untouched.
          drawNodes(currentMap.nodes);
          drawGrid();
      }
      return;
    }

    if (erasing) {
      const eraserRadius = getLineWidth();
      eraserCursor.style.transform = `translate(${p.x - eraserRadius}px, ${p.y - eraserRadius}px)`;
      if (drawing) { eraseAtPoint(p); eraseNodeAtPoint(p); }
      return; // Don't do drawing logic if erasing
    }

    if (!drawing) return; // Guard for drawing logic below

    if (cur) {
      cur.pts.push(p);
      // Determine if current stroke is a special-line preview (show only on overlay)
      const isZoomed = panel.classList.contains('toy-zoomed');
      const hasLine1 = strokes.some(s => s.generatorId === 1);
      const hasLine2 = strokes.some(s => s.generatorId === 2);
      previewGid = null;
      if (!isZoomed) {
        // Standard: first stroke previews as Line 1 if none yet
        if (!hasLine1 && !hasLine2) previewGid = 1;
      } else {
        // Advanced: always preview Line 1 if not yet drawn; otherwise only when explicitly armed
        if (!hasLine1) previewGid = 1;
        else if (nextDrawTarget) previewGid = nextDrawTarget;
      }
      // For normal lines (no previewGid), paint segment onto paint; otherwise, overlay will show it
      if (!previewGid) {
        const n = cur.pts.length;
        if (n >= 2) {
          const a = cur.pts[n - 2];
          const b = cur.pts[n - 1];
          pctx.save();
          pctx.lineCap = 'round';
          pctx.lineJoin = 'round';
          pctx.lineWidth = getLineWidth();
          pctx.strokeStyle = cur.color;
          pctx.beginPath();
          pctx.moveTo(a.x, a.y);
          pctx.lineTo(b.x, b.y);
          pctx.stroke();
          pctx.restore();
        }
      }
    }
  }
  function onPointerUp(e){
    if (draggedNode) {
      panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap }));
      draggedNode = null;
      paint.style.cursor = 'default';
      return;
    }

    // Tap on a node toggles column active state
    if (pendingNodeTap) {
      const col = pendingNodeTap.col;
      const row = pendingNodeTap.row;
      if (!currentMap) {
        currentMap = {
          active:Array(cols).fill(false),
          nodes:Array.from({length:cols},()=>new Set()),
          disabled:Array.from({length:cols},()=>new Set()),
        };
      } else if (!currentMap.disabled) {
        currentMap.disabled = Array.from({length:cols},()=>new Set());
      }

      const dis = currentMap.disabled[col];
      if (dis.has(row)) dis.delete(row); else dis.add(row);
      // Recompute column active: any node present and not disabled
      const anyOn = Array.from(currentMap.nodes[col] || []).some(r => !dis.has(r));
      currentMap.active[col] = anyOn;

      // Flash feedback on toggle
      flashes[col] = 1.0;
      drawGrid();
      drawNodes(currentMap.nodes);
      panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap }));
      pendingNodeTap = null;
    }

    if (!drawing) return;
    drawing=false;

    const strokeToProcess = cur;
    cur = null;

    if (erasing) {
      // Finish erasing; keep paint modifications and disabled states
      erasedTargetsThisDrag.clear();
      return;
    }

    if (!strokeToProcess) return;

    const isZoomed = panel.classList.contains('toy-zoomed');
    let shouldGenerateNodes = true;
    let isSpecial = false;
    let generatorId = null;

    if (isZoomed) {
        const hasLine1 = strokes.some(s => s.generatorId === 1);
        const hasLine2 = strokes.some(s => s.generatorId === 2);

        if (!hasLine1) {
            // No lines exist, this new one is Line 1.
            shouldGenerateNodes = true;
            isSpecial = true;
            generatorId = 1;
        } else if (nextDrawTarget) {
            // A "Draw Line" button was explicitly clicked.
            shouldGenerateNodes = true;
            isSpecial = true;
            generatorId = nextDrawTarget;
            nextDrawTarget = null; // consume target so subsequent swipes follow natural order
        } else {
            // No target armed: decorative line (no nodes)
            shouldGenerateNodes = false;
        }
        nextDrawTarget = null; // Always reset after a draw completes
        try { (panel.__dgUpdateButtons || updateGeneratorButtons)(); } catch(e){ console.warn('[drawgrid] updateGeneratorButtons missing', e); }
    } else { // Standard view logic (unchanged)
        const hasNodes = currentMap && currentMap.nodes.some(s => s.size > 0);
        if (hasNodes) {
            shouldGenerateNodes = false;
        } else {
            isSpecial = true;
            generatorId = 1; // Standard view's first line is functionally Line 1
        }
    }
    
    // Debug: log the decision for this stroke
    try { console.info('[drawgrid] up', { isZoomed, isSpecial, generatorId, shouldGenerateNodes, strokes: strokes.length }); } catch{}
    strokeToProcess.isSpecial = isSpecial;
    strokeToProcess.generatorId = generatorId;
    strokes.push({ pts: strokeToProcess.pts, color: strokeToProcess.color, isSpecial: strokeToProcess.isSpecial, generatorId: strokeToProcess.generatorId });

    // Commit just this stroke to the paint layer (neutral color for specials), preserving existing erasures
    try {
      drawFullStroke(pctx, strokeToProcess);
    } catch {}

    // Do not redraw paint from strokes here; preserve erased regions

    if (shouldGenerateNodes) {
      // Rebuild nodes immediately to ensure Advanced first swipe creates Line 1 nodes
      if (!panel.isConnected) return;
      // Only regenerate nodes; keep paint as-is
      regenerateMapFromStrokes();
    }
  }

  // A version of snapToGrid that analyzes a single stroke object instead of the whole canvas
  function snapToGridFromStroke(stroke) {
    // Check for cached nodes, but only if the column count matches.
    if (stroke.cachedNodes && stroke.cachedCols === cols) {
      return stroke.cachedNodes;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = paint.width;
    tempCanvas.height = paint.height;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    if (!tempCtx) return {active:[], nodes:[]};

    tempCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFullStroke(tempCtx, stroke);
    // Pass the temporary context to the main snapToGrid function
    const result = snapToGrid(tempCtx);
    // Cache the result against the current column count.
    try { stroke.cachedNodes = result; stroke.cachedCols = cols; } catch {}
    return result;
  }

  paint.addEventListener('pointerdown', onPointerDown);
  paint.addEventListener('pointermove', onPointerMove);
  paint.addEventListener('pointerenter', () => {
    if (erasing) eraserCursor.style.display = 'block';
  });
  paint.addEventListener('pointerleave', () => {
    eraserCursor.style.display = 'none';
    paint.style.cursor = 'default';
  });
  window.addEventListener('pointerup', onPointerUp);
  // Coalesce relayouts on wheel/resize to keep pointer math in sync with zoom changes
  let relayoutScheduled = false;
  function scheduleRelayout(force = true){
    if (relayoutScheduled) return; relayoutScheduled = true;
    requestAnimationFrame(() => { relayoutScheduled = false; layout(force); });
  }
  window.addEventListener('resize', () => scheduleRelayout(true));
  // Recompute layout on global wheel zoom (board transforms change getBoundingClientRect)
  window.addEventListener('wheel', () => scheduleRelayout(true), { passive: true });
  observer.observe(body);

  panel.addEventListener('drawgrid:playcol', (e) => {
    const col = e?.detail?.col;
    playheadCol = col;
    if (col >= 0 && col < cols) {
        if (currentMap?.active[col]) { flashes[col] = 1.0; }
    }
  });

  let rafId = 0;
  function renderLoop() {
    if (!panel.isConnected) { cancelAnimationFrame(rafId); return; }

    // Animate special stroke paint (hue cycling) without resurrecting erased areas:
    // Draw animated special strokes into flashCanvas, then mask with current paint alpha.
    const specialStrokes = strokes.filter(s => s.isSpecial);
    if (specialStrokes.length > 0 || (cur && previewGid)) {
        if (!panel.isConnected) { cancelAnimationFrame(rafId); return; }
        fctx.save();
        // Clear overlay in device pixels
        fctx.setTransform(1, 0, 0, 1, 0, 0);
        fctx.clearRect(0, 0, flashCanvas.width, flashCanvas.height);
        // Draw animated strokes with CSS transform
        fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Draw demoted colorized strokes as static overlay tints
        try {
          const colorized = strokes.filter(s => s.overlayColorize);
          for (const s of colorized) drawFullStroke(fctx, s);
        } catch {}
        // Then draw animated special lines on top of normal lines
        for (const s of specialStrokes) drawFullStroke(fctx, s);
        // Mask with paint alpha without scaling (device pixels)
        fctx.setTransform(1, 0, 0, 1, 0, 0);
        fctx.globalCompositeOperation = 'destination-in';
        fctx.drawImage(paint, 0, 0);
        // Now draw current special preview ON TOP unmasked, so full stroke is visible while drawing
        if (cur && previewGid && cur.pts && cur.pts.length) {
          fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          fctx.globalCompositeOperation = 'source-over';
          const preview = { pts: cur.pts, isSpecial: true, generatorId: previewGid };
          drawFullStroke(fctx, preview);
        }
        fctx.restore();
    } else {
        // No special strokes: ensure overlay is cleared
        fctx.setTransform(1, 0, 0, 1, 0, 0);
        fctx.clearRect(0, 0, flashCanvas.width, flashCanvas.height);
    }

    // Animate playhead flash
    let needsRedraw = false;
    for (let i = 0; i < flashes.length; i++) {
        if (flashes[i] > 0) {
            flashes[i] = Math.max(0, flashes[i] - 0.08);
            needsRedraw = true;
        }
    }
    if (needsRedraw) {
      // Redraw both grid and nodes to show node cube flash feedback
      drawGrid();
      if (currentMap) drawNodes(currentMap.nodes);
    }
    rafId = requestAnimationFrame(renderLoop);
  }
  rafId = requestAnimationFrame(renderLoop);

  const api = {
    panel,
    clear: ()=>{
      pctx.clearRect(0,0,cssW,cssH);
      nctx.clearRect(0,0,cssW,cssH);
      fctx.clearRect(0,0,cssW,cssH);
      strokes = [];
      const emptyMap = {active:Array(cols).fill(false),nodes:Array.from({length:cols},()=>new Set()), disabled:Array.from({length:cols},()=>new Set())};
      currentMap = emptyMap;
      panel.dispatchEvent(new CustomEvent('drawgrid:update',{detail:emptyMap}));
      drawGrid();
    },
    setErase:(v)=>{ erasing=!!v; },
  };

  // Add some CSS for the new buttons
  const style = document.createElement('style');
  style.textContent = `
      .toy-panel[data-toy="drawgrid"] .drawgrid-generator-buttons {
          position: absolute;
          left: -115px; /* Position outside the panel */
          top: 50%;
          transform: translateY(-50%);
          display: none; /* Hidden by default */
          flex-direction: column;
          gap: 10px;
          z-index: 10;
      }
      .toy-panel[data-toy="drawgrid"].toy-zoomed .drawgrid-generator-buttons {
          display: flex; /* Visible only in advanced mode */
      }
      .drawgrid-generator-buttons .toy-btn { width: 100px; height: 60px; font-size: 14px; }
      .drawgrid-generator-buttons .toy-btn.active { box-shadow: 0 0 8px 2px #fff; border-color: #fff; }
  `;
  panel.appendChild(style);

  panel.addEventListener('toy-clear', api.clear);

  // The ResizeObserver only fires on *changes*. We must call layout() once
  // manually to render the initial state. requestAnimationFrame ensures
  // the browser has finished its own layout calculations first.
  requestAnimationFrame(layout);

  return api;
}
