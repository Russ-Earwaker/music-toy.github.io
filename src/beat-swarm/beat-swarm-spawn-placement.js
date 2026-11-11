import { screenToLogical } from '../coordinates/viewport-space.js';
import { SWARM_CAMERA_TARGET_SCALE, ENEMY_FALLBACK_SPAWN_MARGIN_PX } from './beat-swarm-mode-constants.js';
// Preserve the historical 42 logical-unit gap at the authored camera zoom.
export const ENEMY_SPAWN_MARGIN_WORLD = ENEMY_FALLBACK_SPAWN_MARGIN_PX / SWARM_CAMERA_TARGET_SCALE;
// Cover 42/94-unit bodies, rotation, birth/note pulses and their 18/34-unit glow.
export const ENEMY_SPAWN_RADIUS_LOGICAL = Object.freeze({ small: 64, large: 128 });
export function getVisibleBeatSwarmLogicalBounds(space) {
  if(!space)return {left:0,right:1600,top:0,bottom:900};
  const rect=space.displayRect,tl=screenToLogical(space,{x:rect.left,y:rect.top}),br=screenToLogical(space,{x:rect.left+rect.width,y:rect.top+rect.height});
  return {left:tl.x,right:br.x,top:tl.y,bottom:br.y};
}
export function getVisibleBeatSwarmWorldRect(player, scale, logical = {left:0,right:1600,top:0,bottom:900}) {
  const s=Math.max(.001,Number(scale)||1);
  return {left:player.x+(logical.left-800)/s,right:player.x+(logical.right-800)/s,top:player.y+(logical.top-450)/s,bottom:player.y+(logical.bottom-450)/s};
}
export function getSpawnFormationBounds(points) {
  return {left:Math.min(...points.map(p=>p.x-(p.radiusWorld||0))),right:Math.max(...points.map(p=>p.x+(p.radiusWorld||0))),top:Math.min(...points.map(p=>p.y-(p.radiusWorld||0))),bottom:Math.max(...points.map(p=>p.y+(p.radiusWorld||0)))};
}
export function spawnBoundsIntersect(a,b) {return a.left<=b.right&&a.right>=b.left&&a.top<=b.bottom&&a.bottom>=b.top;}
export function getSpawnEntrySide(points,rect) {
 const bounds=getSpawnFormationBounds(points);
 if(bounds.right<rect.left)return 'left';if(bounds.left>rect.right)return 'right';if(bounds.bottom<rect.top)return 'top';if(bounds.top>rect.bottom)return 'bottom';
 const point=points[0],dx=(point.x-(rect.left+rect.right)/2)/((rect.right-rect.left)/2),dy=(point.y-(rect.top+rect.bottom)/2)/((rect.bottom-rect.top)/2);
 return Math.abs(dx)>=Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'top':'bottom');
}
export function stageBeatSwarmFormation(points,rect,side=getSpawnEntrySide(points,rect),margin=ENEMY_SPAWN_MARGIN_WORLD) {
 const before=getSpawnFormationBounds(points);let dx=0,dy=0;const gap=Math.max(0,margin)+.001;
 if(side==='left')dx=Math.min(0,rect.left-gap-before.right);
 else if(side==='right')dx=Math.max(0,rect.right+gap-before.left);
 else if(side==='top')dy=Math.min(0,rect.top-gap-before.bottom);
 else if(side==='bottom')dy=Math.max(0,rect.bottom+gap-before.top);
 else throw new Error('Unknown BeatSwarm entry side: '+side);
 const staged=points.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
 return {points:staged,side,offset:{x:dx,y:dy},bounds:getSpawnFormationBounds(staged),originalBounds:before,visibleRect:{...rect},margin};
}

// Threat emission waits for a visible body centre, not just its padded glow envelope.
export function hasEnemyEnteredSpawnView(point, rect) {
 const x=point.x??point.wx,y=point.y??point.wy;
 return x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom;
}
