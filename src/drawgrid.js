// src/drawgrid.js
// Minimal, scoped Drawing Grid — 16x12, draw strokes, build snapped nodes on release.
// Strictly confined to the provided panel element.
import { buildPalette, midiToName } from './note-helpers.js';

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
  Object.assign(grid.style,  { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 1 });
  Object.assign(paint.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 2 });
  Object.assign(nodesCanvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 3, pointerEvents: 'none' });
  body.appendChild(grid);
  body.appendChild(paint);
  body.appendChild(nodesCanvas);

  const gctx = grid.getContext('2d');
  const pctx = paint.getContext('2d', { willReadFrequently: true });
  const nctx = nodesCanvas.getContext('2d');

  // State
  let cols = initialCols;
  let cssW=0, cssH=0, cw=0, ch=0, topPad=0, dpr=1;
  let drawing=false, erasing=false;
  // The `strokes` array is removed. The paint canvas is now the source of truth.
  let cur = null;
  let lastStroke = null; // Store the last completed stroke object
  let currentMap = null; // Store the current node map {active, nodes}
  let nodeCoordsForHitTest = []; // For draggable nodes
  let erasedColsThisDrag = new Set(); // For eraser hit-testing
  let draggedNode = null; // { col, row }
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
      else erasedColsThisDrag.clear(); // Clear on tool toggle
    });

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
        autoTuneBtn.setAttribute('aria-pressed', String(autoTune));
        resnapAndRedraw();
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
        cols = parseInt(stepsSel.value, 10);
        panel.dataset.steps = String(cols);
        resnapAndRedraw();
      });
    }
  }

  function resnapAndRedraw() {
    const hasContent = !!lastStroke;
    layout(true); // This redraws the grid and clears the paint canvas.

    if (hasContent) {
      requestAnimationFrame(() => {
        if (!panel.isConnected) return;
        // To resnap, we first draw the stored stroke onto the cleared canvas...
        drawFullStroke(pctx, lastStroke);
        // ...then we can read it to generate the new node map.
        const map = snapToGrid();
        // The canvas already has the line from the previous step, so we just draw nodes on top.
        // Notify the player of the new state
        panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: map }));
        currentMap = map;
        drawNodes(map.nodes);
      });
    } else {
      api.clear();
    }
  }

  panel.addEventListener('toy-zoom', () => {
    // When zooming in or out, the panel's size changes.
    // We force a layout call to ensure everything is redrawn correctly.
    // A double rAF waits for the browser to finish style recalculation and layout
    // after the panel is moved in the DOM, preventing a "flash of blank canvas".
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!panel.isConnected) return;
        layout(true);
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

      dpr = newDpr;
      cssW = newW;
      cssH = newH;
      const w = cssW * dpr;
      const h = cssH * dpr;
      grid.width = w; grid.height = h;
      paint.width = w; paint.height = h;
      nodesCanvas.width = w; nodesCanvas.height = h;
      gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Scale the last drawn line if the canvas was resized
      if (lastStroke && oldW > 0 && oldH > 0) {
        const scaleX = cssW / oldW;
        const scaleY = cssH / oldH;
        lastStroke.pts = lastStroke.pts.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));
      }

      // Define the grid area inset by the safe area
      gridArea = {
        x: safeArea,
        y: safeArea,
        w: cssW > safeArea * 2 ? cssW - 2 * safeArea : 0,
        h: cssH > safeArea * 2 ? cssH - 2 * safeArea : 0,
      };

      // All calculations are now relative to the gridArea
      topPad = Math.max(24, Math.round(gridArea.h * 0.12));
      cw = gridArea.w / cols;
      ch = gridArea.h > topPad ? (gridArea.h - topPad) / rows : 0;

      // Update eraser cursor size
      const eraserWidth = getLineWidth() * 2;
      eraserCursor.style.width = `${eraserWidth}px`;
      eraserCursor.style.height = `${eraserWidth}px`;

      drawGrid();
      // On resize, the drawing is cleared. This is a simple way to handle complex redraw logic.
      pctx.clearRect(0,0,cssW,cssH);
      nctx.clearRect(0,0,cssW,cssH);

      // If a resize happens (like entering advanced mode), restore the visuals.
      if (lastStroke) {
        drawFullStroke(pctx, lastStroke);
      }
      if (currentMap) {
        drawNodes(currentMap.nodes);
      }
    }
  }

  function flashColumn(col) {
    // Save current grid state to restore after flash
    const currentGridData = gctx.getImageData(0, 0, grid.width, grid.height);

    const x = gridArea.x + col * cw;
    const w = cw;
    gctx.fillStyle = 'rgba(255, 255, 255, 0.6)'; // Brighter white flash
    gctx.fillRect(x, 0, w, cssH);

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
                gctx.fillRect(x, 0, w, cssH);
            }
        }, 30);
    }, 100); // Start fade after a short hold
  }

  function drawGrid(){
    gctx.clearRect(0,0,cssW,cssH);
    // top activation strip
    gctx.fillStyle = 'rgba(255,255,255,0.08)';
    gctx.fillRect(gridArea.x, gridArea.y, gridArea.w, topPad);

    // Draw a border between activation strip and grid
    gctx.strokeStyle = 'rgba(255,255,255,0.5)';
    gctx.lineWidth = 1.5;
    gctx.beginPath();
    gctx.moveTo(gridArea.x, gridArea.y + topPad);
    gctx.lineTo(gridArea.x + gridArea.w, gridArea.y + topPad);
    gctx.stroke();

    // Internal grid lines
    gctx.strokeStyle='rgba(255,255,255,0.4)';
    // verticals (full height of gridArea, to show columns in activation strip)
    for(let i=1;i<cols;i++){ gctx.beginPath(); gctx.moveTo(gridArea.x + i*cw, gridArea.y); gctx.lineTo(gridArea.x + i*cw, gridArea.y + gridArea.h); gctx.stroke(); }
    // horizontals (grid area only)
    for(let j=1;j<rows;j++){ gctx.beginPath(); gctx.moveTo(gridArea.x, gridArea.y + topPad + j*ch); gctx.lineTo(gridArea.x + gridArea.w, gridArea.y + topPad + j*ch); gctx.stroke(); }
  }

  // A helper to draw a complete stroke from a point array.
  // This is used to create a clean image for snapping.
  function drawFullStroke(ctx, stroke) {
    if (!stroke || !stroke.pts || stroke.pts.length < 1) return;
    ctx.beginPath();
    if (stroke.pts.length === 1) {
      const lineWidth = getLineWidth();
      ctx.fillStyle = 'rgba(95,179,255,0.95)';
      ctx.arc(stroke.pts[0].x, stroke.pts[0].y, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(stroke.pts[0].x, stroke.pts[0].y);
      for (let i = 1; i < stroke.pts.length; i++) {
        ctx.lineTo(stroke.pts[i].x, stroke.pts[i].y);
      }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = getLineWidth();
      ctx.strokeStyle = 'rgba(95,179,255,0.95)';
      ctx.stroke();
    }
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

    const nodeCoords = []; // Store coordinates of each node: {x, y, col, row, radius}
    nodeCoordsForHitTest = []; // Clear for new set
    const radius = Math.max(3, Math.min(cw, ch) * 0.15);

    // First, find all node center points
    for (let c = 0; c < cols; c++) {
        if (nodes[c] && nodes[c].size > 0) {
            for (const r of nodes[c]) {
                const x = gridArea.x + c * cw + cw * 0.5;
                const y = gridArea.y + topPad + r * ch + ch * 0.5;
                const nodeData = { x, y, col: c, row: r, radius: radius * 1.5 }; // Use a larger hit area
                nodeCoords.push(nodeData);
                nodeCoordsForHitTest.push(nodeData);
            }
        }
    }

    // --- Draw connecting lines ---
    nctx.beginPath();
    nctx.strokeStyle = 'rgba(255, 200, 80, 0.6)';
    nctx.lineWidth = 2;

    // Group nodes by column for easier and more efficient lookup
    const colsMap = new Map();
    for (const node of nodeCoords) {
        if (!colsMap.has(node.col)) colsMap.set(node.col, []);
        colsMap.get(node.col).push(node);
    }

    for (let c = 0; c < cols - 1; c++) {
        const currentColNodes = colsMap.get(c);
        const nextColNodes = colsMap.get(c + 1);
        if (currentColNodes && nextColNodes) {
            for (const node of currentColNodes) {
                // Connect each node in the current column to all nodes in the next
                for (const nextNode of nextColNodes) {
                    nctx.moveTo(node.x, node.y);
                    nctx.lineTo(nextNode.x, nextNode.y);
                }
            }
        }
    }
    nctx.stroke();

    // --- Draw the dots on top of the lines ---
    nctx.fillStyle = 'rgba(255, 200, 80, 0.95)';
    for (const node of nodeCoords) {
        nctx.beginPath();
        nctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        nctx.fill();
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
            const r = [...nodes[c]][0]; // Get the first (and only) row for this column
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

  function snapToGrid(){
    // build a map: for each column, choose at most one row where line crosses
    const active = Array(cols).fill(false);
    const nodes = Array.from({length:cols}, ()=> new Set());
    const w = paint.width;
    const h = paint.height;
    if (!w || !h) return { active, nodes }; // Abort if canvas is not ready
    const data = pctx.getImageData(0, 0, w, h).data;

    for (let c=0;c<cols;c++){
      // Define the scan area for the column, extending to the canvas edges for the first and last columns.
      // This allows drawing "outside the lines" to be snapped correctly.
      const xStart_css = (c === 0) ? 0 : gridArea.x + c * cw;
      const xEnd_css = (c === cols - 1) ? cssW : gridArea.x + (c + 1) * cw;
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

        // Convert average Y position to the nearest row index, if it's in the grid area
        // The note grid starts at gridArea.y + topPad
        const r_initial = Math.round((avgY_css - (gridArea.y + topPad)) / ch);
        if (r_initial >= 0 && r_initial < rows) {
          let r_final = r_initial;

          if (autoTune) {
            // 1. Get the MIDI note for the visually-drawn row
            const drawnMidi = chromaticPalette[r_initial];

            // 2. Find the nearest note in the pentatonic scale
            let nearestMidi = pentatonicPalette[0];
            let minDiff = Math.abs(drawnMidi - nearestMidi);
            for (const pNote of pentatonicPalette) {
              const diff = Math.abs(drawnMidi - pNote);
              if (diff < minDiff) { minDiff = diff; nearestMidi = pNote; }
            }

            // 3. Find which row in the chromatic scale corresponds to that pentatonic note
            const correctedRow = chromaticPalette.indexOf(nearestMidi);
            if (correctedRow !== -1) r_final = correctedRow;
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
        if (erasedColsThisDrag.has(node.col)) continue;

        if (Math.hypot(p.x - node.x, p.y - node.y) < eraserRadius) {
            const col = node.col;
            erasedColsThisDrag.add(col);

            // Remove node data from the model first
            if (currentMap && currentMap.nodes[col]) {
                currentMap.nodes[col].clear();
                currentMap.active[col] = false;
            }

            // Start the animation. It will handle drawing the remaining nodes.
            animateErasedNode(node);
            flashColumn(col);

            // Clear the blue line in that column
            const x = gridArea.x + col * cw;
            const w = cw;
            pctx.clearRect(x, 0, w, cssH);

            lastStroke = null;

            // Notify the player of the change
            panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap }));
        }
    }
  }

  function onPointerDown(e){
    const rect = paint.getBoundingClientRect();
    const p = { x:e.clientX-rect.left, y:e.clientY-rect.top };

    // In advanced mode, check for dragging a node first.
    if (panel.classList.contains('toy-zoomed')) {
      for (const node of nodeCoordsForHitTest) {
        if (Math.hypot(p.x - node.x, p.y - node.y) < node.radius) {
          draggedNode = { col: node.col, row: node.row };
          drawing = true; // To capture move and up events
          paint.style.cursor = 'grabbing';
          paint.setPointerCapture?.(e.pointerId);
          return; // Prevent drawing a new line
        }
      }
    }

    drawing=true;
    paint.setPointerCapture?.(e.pointerId);

    if (erasing) {
      erasedColsThisDrag.clear(); // Reset on new drag
      eraseNodeAtPoint(p);
      eraseAtPoint(p);
      lastStroke = null; // Erasing invalidates the logical stroke
    } else {
      // When starting a new line, clear everything first.
      pctx.clearRect(0, 0, cssW, cssH);
      cur = { pts:[p] };
      drawFullStroke(pctx, cur);
      lastStroke = null; // A new stroke is in progress
    }
  }
  function onPointerMove(e){
    const rect = paint.getBoundingClientRect();
    const p = { x:e.clientX-rect.left, y:e.clientY-rect.top };

    // Update cursor for draggable nodes in advanced mode
    if (panel.classList.contains('toy-zoomed') && !draggedNode) {
      let onNode = false;
      for (const node of nodeCoordsForHitTest) {
        if (Math.hypot(p.x - node.x, p.y - node.y) < node.radius) {
          onNode = true;
          break;
        }
      }
      paint.style.cursor = onNode ? 'grab' : 'default';
    }

    if (draggedNode && drawing) {
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      const newRow = clamp(Math.round((p.y - (gridArea.y + topPad)) / ch), 0, rows - 1);

      if (newRow !== draggedNode.row && currentMap) {
          currentMap.nodes[draggedNode.col].delete(draggedNode.row);
          currentMap.nodes[draggedNode.col].add(newRow);
          draggedNode.row = newRow;
          lastStroke = null; // The original gesture is now invalid
          
          // Redraw only the nodes canvas; the blue line on the paint canvas is untouched.
          drawNodes(currentMap.nodes);
      }
      return;
    }

    if (erasing) {
      const eraserRadius = getLineWidth();
      // The visual cursor's transform should be offset by its radius to center it.
      eraserCursor.style.transform = `translate(${p.x - eraserRadius}px, ${p.y - eraserRadius}px)`;

      if (drawing) { // only erase if pointer is down
        eraseAtPoint(p);
        eraseNodeAtPoint(p); // Also check for node collision on move
      }
      return; // Don't do drawing logic if erasing
    }

    if (!drawing) return; // Guard for drawing logic below

    if (cur) {
      cur.pts.push(p);
      // Redraw the entire stroke on each move for reliability
      pctx.clearRect(0, 0, cssW, cssH);
      drawFullStroke(pctx, cur);
    }
  }
  function onPointerUp(e){
    if (draggedNode) {
      panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap }));
      draggedNode = null;
      paint.style.cursor = 'default';
    }

    if (!drawing) return;
    drawing=false;

    const strokeToProcess = cur;
    cur = null;

    if (!erasing && strokeToProcess) {
      lastStroke = { pts: strokeToProcess.pts }; // Save the completed stroke
      // This is the most robust way to handle the browser's asynchronous rendering.
      // We wait for the next animation frame to do our work, ensuring the browser
      // is ready for new drawing commands.
      requestAnimationFrame(() => {
        if (!panel.isConnected) return; // Safety check

        // 1. Clear the paint canvas to ensure a clean state.
        pctx.clearRect(0, 0, cssW, cssH);
        // 2. Draw the final, complete stroke.
        drawFullStroke(pctx, strokeToProcess);
        // 3. Now, immediately read the paint canvas to generate the node map.
        const map = snapToGrid();
        currentMap = map;
        panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: map }));
        // 4. Draw the nodes on their own canvas.
        drawNodes(map.nodes);
      });
    } else if (erasing) {
      // When erasing, we just stop. State was updated on move. The line is visually gone.
      erasedColsThisDrag.clear();
    }
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
  observer.observe(body);

  const api = {
    panel,
    clear: ()=>{
      pctx.clearRect(0,0,cssW,cssH);
      nctx.clearRect(0,0,cssW,cssH);
      lastStroke = null;
      nodeCoordsForHitTest = [];
      const emptyMap = {active:Array(cols).fill(false),nodes:Array.from({length:cols},()=>new Set())};
      currentMap = emptyMap;
      panel.dispatchEvent(new CustomEvent('drawgrid:update',{detail:emptyMap}));
    },
    setErase:(v)=>{ erasing=!!v; },
  };

  panel.addEventListener('toy-clear', api.clear);

  // The ResizeObserver only fires on *changes*. We must call layout() once
  // manually to render the initial state. requestAnimationFrame ensures
  // the browser has finished its own layout calculations first.
  requestAnimationFrame(layout);

  return api;
}
