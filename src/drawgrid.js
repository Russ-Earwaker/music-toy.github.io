// src/drawgrid.js
// Minimal, scoped Drawing Grid — 16x12, draw strokes, build snapped nodes on release.
// Strictly confined to the provided panel element.

export function createDrawGrid(panel, { cols: initialCols = 8, rows = 12, toyId, bpm = 120 } = {}) {
  // The init script now guarantees the panel is a valid HTMLElement with the correct dataset.
  // The .toy-body is now guaranteed to exist by initToyUI, which runs first.
  const body = panel.querySelector('.toy-body');

  if (!body) {
    console.error('[drawgrid] Fatal: could not find .toy-body element!');
    return;
  }

  // Layers
  const grid = document.createElement('canvas'); grid.setAttribute('data-role','drawgrid-grid');
  const paint = document.createElement('canvas'); paint.setAttribute('data-role','drawgrid-paint');
  Object.assign(grid.style,  { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block' });
  Object.assign(paint.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block' });
  body.appendChild(grid);  // Grid canvas is on the bottom
  body.appendChild(paint); // Paint canvas is on top

  const gctx = grid.getContext('2d');
  const pctx = paint.getContext('2d', { willReadFrequently: true });

  // State
  let cols = initialCols;
  let cssW=0, cssH=0, cw=0, ch=0, topPad=0, dpr=1;
  let drawing=false, erasing=false;
  // The `strokes` array is removed. The paint canvas is now the source of truth.
  let cur = null;
  
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
    er.addEventListener('click', ()=>{ erasing = !erasing; er.setAttribute('aria-pressed', String(erasing)); });

    // Steps dropdown
    let stepsSel = right.querySelector('.drawgrid-steps');
    if (!stepsSel) {
      stepsSel = document.createElement('select');
      stepsSel.className = 'drawgrid-steps';
      stepsSel.innerHTML = `<option value="8">8 steps</option><option value="16">16 steps</option>`;
      stepsSel.value = String(cols);
      right.appendChild(stepsSel);

      stepsSel.addEventListener('change', () => {
        // Grab the current canvas content before it gets cleared by layout().
        const existingPaintData = (paint.width > 0 && paint.height > 0) ? pctx.getImageData(0, 0, paint.width, paint.height) : null;
        const hasContent = existingPaintData && Array.from(existingPaintData.data).some(v => v > 0);

        cols = parseInt(stepsSel.value, 10);
        panel.dataset.steps = String(cols);
        layout(true); // This redraws the grid and clears the paint canvas.

        if (hasContent) {
          requestAnimationFrame(() => {
            if (!panel.isConnected) return;

            // Temporarily restore the old drawing to read it
            pctx.putImageData(existingPaintData, 0, 0);
            const map = snapToGrid();

            // Clear the temporary drawing and draw the new snapped nodes
            pctx.clearRect(0, 0, cssW, cssH);
            drawNodes(map.nodes);

            // Notify the player of the new state
            panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: map }));
          });
        } else {
          // If there was no drawing, just clear the state.
          api.clear();
        }
      });
    }
  }

  const observer = new ResizeObserver(layout);

  function layout(force = false){
    const newDpr = window.devicePixelRatio || 1;
    const r = body.getBoundingClientRect();
    const newW = Math.max(1, r.width|0);
    const newH = Math.max(1, r.height|0);

    if (force || newW !== cssW || newH !== cssH || newDpr !== dpr) {
      dpr = newDpr;
      cssW = newW;
      cssH = newH;
      const w = cssW * dpr;
      const h = cssH * dpr;
      grid.width = w; grid.height = h;
      paint.width = w; paint.height = h;
      gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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

      drawGrid();
      // On resize, the drawing is cleared. This is a simple way to handle complex redraw logic.
      pctx.clearRect(0,0,cssW,cssH);
    }
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
      const lineWidth = Math.max(4, Math.round(Math.min(cw, ch) * 0.35));
      ctx.fillStyle = 'rgba(95,179,255,0.95)';
      ctx.arc(stroke.pts[0].x, stroke.pts[0].y, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(stroke.pts[0].x, stroke.pts[0].y);
      for (let i = 1; i < stroke.pts.length; i++) {
        ctx.lineTo(stroke.pts[i].x, stroke.pts[i].y);
      }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(4, Math.round(Math.min(cw, ch) * 0.35));
      ctx.strokeStyle = 'rgba(95,179,255,0.95)';
      ctx.stroke();
    }
  }
  function eraseAtPoint(p) {
    const R = Math.max(8, Math.round(Math.min(cw,ch)*0.30));
    pctx.save();
    pctx.globalCompositeOperation = 'destination-out';
    pctx.beginPath();
    pctx.arc(p.x, p.y, R, 0, Math.PI * 2);
    pctx.fillStyle = '#000';
    pctx.fill();
    pctx.restore();
  }

  function drawNodes(nodes) {
    if (!nodes) return;

    const nodeCoords = []; // Store coordinates of each node: {x, y, col}

    // First, find all node center points
    for (let c = 0; c < cols; c++) {
        if (nodes[c] && nodes[c].size > 0) {
            for (const r of nodes[c]) {
                const x = gridArea.x + c * cw + cw * 0.5;
                const y = gridArea.y + topPad + r * ch + ch * 0.5;
                nodeCoords.push({ x, y, col: c });
            }
        }
    }

    // --- Draw connecting lines ---
    pctx.beginPath();
    pctx.strokeStyle = 'rgba(255, 200, 80, 0.6)';
    pctx.lineWidth = 2;

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
                    pctx.moveTo(node.x, node.y);
                    pctx.lineTo(nextNode.x, nextNode.y);
                }
            }
        }
    }
    pctx.stroke();

    // --- Draw the dots on top of the lines ---
    pctx.fillStyle = 'rgba(255, 200, 80, 0.95)';
    const radius = Math.max(3, Math.min(cw, ch) * 0.15);
    for (const node of nodeCoords) {
        pctx.beginPath();
        pctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        pctx.fill();
    }
  }

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
        if (avgY_css >= gridArea.y + topPad) {
          const r = Math.round((avgY_css - (gridArea.y + topPad)) / ch);
          if (r >= 0 && r < rows) {
            nodes[c].add(r);
            active[c] = true;
          }
        }
      }
    }
    return {active, nodes};
  }

  function onPointerDown(e){
    drawing=true;
    paint.setPointerCapture?.(e.pointerId);
    const rect = paint.getBoundingClientRect();
    const p = { x:e.clientX-rect.left, y:e.clientY-rect.top };

    if (erasing) {
      eraseAtPoint(p);
    } else {
      // When starting a new line, clear everything first.
      pctx.clearRect(0, 0, cssW, cssH);
      cur = { pts:[p] };
      drawFullStroke(pctx, cur);
    }
  }
  function onPointerMove(e){
    if (!drawing) return;
    const rect = paint.getBoundingClientRect();
    const p = { x:e.clientX-rect.left, y:e.clientY-rect.top };

    if (erasing) {
      eraseAtPoint(p);
    } else if (cur) {
      cur.pts.push(p);
      // Redraw the entire stroke on each move for reliability
      pctx.clearRect(0, 0, cssW, cssH);
      drawFullStroke(pctx, cur);
    }
  }
  function onPointerUp(e){
    if (!drawing) return;
    drawing=false;

    const strokeToProcess = cur;
    cur = null;

    if (!erasing && strokeToProcess) {
      // This is the most robust way to handle the browser's asynchronous rendering.
      // We wait for the next animation frame to do our work, ensuring the browser
      // is ready for new drawing commands.
      requestAnimationFrame(() => {
        if (!panel.isConnected) return; // Safety check

        // 1. Clear the canvas to ensure a clean state.
        pctx.clearRect(0, 0, cssW, cssH);
        // 2. Draw the final, complete stroke.
        drawFullStroke(pctx, strokeToProcess);
        // 3. Now, immediately read it. The browser must process the draw command
        //    we just issued in this same task before moving on.
        const map = snapToGrid();
        panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: map }));
        // 4. Draw the nodes on top of the line we just drew.
        drawNodes(map.nodes);
      });
    } else if (erasing) {
      const map = snapToGrid();
      panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: map }));
    }
  }

  paint.addEventListener('pointerdown', onPointerDown);
  paint.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  observer.observe(body);

  const api = {
    panel,
    clear: ()=>{ pctx.clearRect(0,0,cssW,cssH); panel.dispatchEvent(new CustomEvent('drawgrid:update',{detail:{active:Array(cols).fill(false),nodes:Array.from({length:cols},()=>new Set())}})); },
    setErase:(v)=>{ erasing=!!v; },
  };

  panel.addEventListener('toy-clear', api.clear);

  // The ResizeObserver only fires on *changes*. We must call layout() once
  // manually to render the initial state. requestAnimationFrame ensures
  // the browser has finished its own layout calculations first.
  requestAnimationFrame(layout);

  return api;
}
