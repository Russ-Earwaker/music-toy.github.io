// Development-only world-attached art for judging a transparent surface.
export function drawLiquidBackground(canvas,{width,height,transform,mode='grid'}){
 canvas.width=width;canvas.height=height;
 const c=canvas.getContext('2d');c.fillStyle='#0b111b';c.fillRect(0,0,width,height);
 if(mode==='dark')return;
 const {x,y,scale}=transform;
 if(mode==='art'){
  c.save();c.translate(x,y);c.scale(scale,scale);
  const wash=c.createLinearGradient(-300,-160,300,180);wash.addColorStop(0,'#24485a');wash.addColorStop(.5,'#35415e');wash.addColorStop(1,'#56363f');
  c.fillStyle=wash;c.fillRect(-330,-210,660,420);
  c.fillStyle='#bd985c';c.beginPath();c.ellipse(-180,0,80,145,-.3,0,Math.PI*2);c.fill();
  c.fillStyle='#975d81';c.beginPath();c.ellipse(170,0,100,150,.5,0,Math.PI*2);c.fill();
  c.lineCap='round';c.lineJoin='round';
  for(const [colour,lineWidth,offset] of [['#69b9b2',42,-55],['#d87861',28,60],['#e7c68e',7,0]]){
   c.strokeStyle=colour;c.lineWidth=lineWidth;c.beginPath();c.moveTo(-290,-95+offset);c.bezierCurveTo(-100,180+offset,90,-180+offset,290,75+offset);c.stroke();
  }
  c.restore();
 }
 const spacing=50*scale;c.strokeStyle=mode==='art'?'#d2e5df':'#687f99';c.globalAlpha=mode==='art'?.15:.32;c.lineWidth=1;
 c.beginPath();for(let gx=((x%spacing)+spacing)%spacing;gx<width;gx+=spacing){c.moveTo(gx,0);c.lineTo(gx,height);}for(let gy=((y%spacing)+spacing)%spacing;gy<height;gy+=spacing){c.moveTo(0,gy);c.lineTo(width,gy);}c.stroke();c.globalAlpha=1;
}
