// Screen-space scene contract. Future painted backgrounds can supply a canvas
// through getBackgroundLayer(), or mark a canvas data-fluid-background.
// Deliberately excludes UI and the liquid overlay itself; no DOM screenshots.
export function createFluidScene({document:doc,window:win,getBackgroundLayer}={}){
 const canvas=doc.createElement('canvas');let ctx;
 return {capture({width,height,dpr,transform}){
  if(!doc.querySelectorAll)return null;
  ctx??=canvas.getContext('2d');if(!ctx)return null;
  // Cap scene uploads independently of presentation DPR.
  const ratio=Math.min(dpr,1),w=Math.round(width*ratio),h=Math.round(height*ratio);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
  const board=doc.querySelector('.board-viewport-main, .board-viewport');
  ctx.fillStyle=board?'#000':(win.getComputedStyle?.(doc.body).backgroundColor||'#0b111b');ctx.fillRect(0,0,width,height);
  if(board){
   const rect=board.getBoundingClientRect(),style=win.getComputedStyle(board,'::before');
   const spacing=(parseFloat(style.getPropertyValue('--board-grid-spacing'))||90)*transform.scale;
   ctx.save();ctx.beginPath();ctx.rect(rect.left,rect.top,rect.width,rect.height);ctx.clip();
   ctx.fillStyle=style.getPropertyValue('--board-dot-color').trim()||'#131c2a';
   const ox=parseFloat(style.getPropertyValue('--board-grid-offset-x'))||-45,oy=parseFloat(style.getPropertyValue('--board-grid-offset-y'))||-45;
   const sx=((transform.x+ox*transform.scale+spacing*.5)%spacing+spacing)%spacing,sy=((transform.y+oy*transform.scale+spacing*.5)%spacing+spacing)%spacing;
   for(let y=sy;y<height;y+=spacing)for(let x=sx;x<width;x+=spacing){ctx.beginPath();ctx.arc(x,y,Math.max(1,spacing*.022),0,Math.PI*2);ctx.fill();}ctx.restore();
  }
  const layers=[...doc.querySelectorAll('canvas[data-fluid-background], .simple-draw-surface canvas, canvas[data-role="drawgrid-grid"], canvas[data-role="drawgrid-paint"], canvas[data-role="drawgrid-nodes"]')];
  const extra=getBackgroundLayer?.();if(extra&&!layers.includes(extra))layers.push(extra);
  for(const layer of layers){
   const r=layer.getBoundingClientRect();if(!r.width||!r.height||!layer.width||!layer.height)continue;
   const style=win.getComputedStyle?.(layer);if(style?.visibility==='hidden'||style?.display==='none')continue;
   ctx.save();ctx.globalAlpha=Number(style?.opacity??1);ctx.drawImage(layer,r.left,r.top,r.width,r.height);ctx.restore();
  }
  // Live authoring SVG uses world coordinates. Read its path without modifying it.
  for(const path of doc.querySelectorAll('.simple-draw-creation-stroke path')){
   const matrix=path.getScreenCTM();if(!matrix)continue;ctx.save();ctx.transform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f);
   ctx.strokeStyle=path.getAttribute('stroke')||'#79dbff';ctx.lineWidth=Number(path.getAttribute('stroke-width'))||6;ctx.lineCap=ctx.lineJoin='round';ctx.stroke(new Path2D(path.getAttribute('d')||''));ctx.restore();
  }
  return canvas;
 },destroy(){canvas.width=canvas.height=1;}};
}

