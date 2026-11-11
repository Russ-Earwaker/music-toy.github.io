import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewportSpace } from '../src/coordinates/viewport-space.js';
import { createBeatSwarmGameplayPresentationSpace } from '../src/beat-swarm/beat-swarm-presentation.js';
import { createBeatSwarmWorldLogicalProjection, createBeatSwarmProjectionBridge } from '../src/beat-swarm/beat-swarm-viewport-space.js';
import { ENEMY_SPAWN_MARGIN_WORLD, getVisibleBeatSwarmWorldRect, getVisibleBeatSwarmLogicalBounds, getSpawnFormationBounds, spawnBoundsIntersect, stageBeatSwarmFormation, hasEnemyEnteredSpawnView, getSpawnEntrySide } from '../src/beat-swarm/beat-swarm-spawn-placement.js';

for(const side of ['left','right','top','bottom'])test('entire small/large formation enters from '+side,()=>{
 for(const scale of [.31,.46,1])for(const camera of [{x:0,y:0},{x:18000,y:-9000}])for(const count of [1,3,12]){
  const rect=getVisibleBeatSwarmWorldRect(camera,scale);
  const points=Array.from({length:count},(_,i)=>({x:camera.x+Math.cos(i*2*Math.PI/count)*650/scale,y:camera.y+Math.sin(i*2*Math.PI/count)*650/scale,radiusWorld:(i%2?56:112)/scale}));
  const result=stageBeatSwarmFormation(points,rect,side);const b=result.bounds,m=ENEMY_SPAWN_MARGIN_WORLD;
  if(side==='left')assert.ok(b.right<rect.left-m);if(side==='right')assert.ok(b.left>rect.right+m);if(side==='top')assert.ok(b.bottom<rect.top-m);if(side==='bottom')assert.ok(b.top>rect.bottom+m);
  for(let i=0;i<count;i++){assert.ok(Math.abs(result.points[i].x-result.points[0].x-(points[i].x-points[0].x))<1e-8);assert.ok(Math.abs(result.points[i].y-result.points[0].y-(points[i].y-points[0].y))<1e-8);}
  // The unchanged approach can reach its existing authored anchor from the staged position.
  const simulated=result.points.map(p=>({...p}));let entered=false;
  for(let step=0;step<1200&&!entered;step++){for(const p of simulated){const dx=camera.x-p.x,dy=camera.y-p.y,len=Math.hypot(dx,dy)||1;p.x+=dx/len*600/60;p.y+=dy/len*600/60;}entered=spawnBoundsIntersect(getSpawnFormationBounds(simulated),rect);}
  assert.ok(entered,'an unchanged inward approach eventually intersects the visible area');
 }
});

test('current camera bounds agree with the BeatSwarm logical projection through resize and movement',()=>{
 let player={x:10000,y:-5000};
 for(const [width,height] of [[1600,900],[1920,1080],[1000,900],[1600,900]]){
  player={x:player.x+173,y:player.y-91};
  const scale=.46,space=createBeatSwarmGameplayPresentationSpace(createViewportSpace({logicalWidth:1600,logicalHeight:900,displayRect:{left:0,top:0,width,height}}));
  const world=createBeatSwarmWorldLogicalProjection({getPlayerWorld:()=>player,getWorldScale:()=>scale});
  const bridge=createBeatSwarmProjectionBridge({getViewportSpace:()=>space,logicalToWorldMap:world.logicalToWorld,worldToLogicalMap:world.worldToLogical});
  const logical=getVisibleBeatSwarmLogicalBounds(space);
  const rect=getVisibleBeatSwarmWorldRect(player,scale,logical),tl=bridge.logicalToWorld({x:logical.left,y:logical.top}),br=bridge.logicalToWorld({x:logical.right,y:logical.bottom});
  assert.deepEqual(rect,{left:tl.x,right:br.x,top:tl.y,bottom:br.y});
  const result=stageBeatSwarmFormation([{x:player.x,y:player.y,radiusWorld:112/scale}],rect,'right');
  assert.equal(spawnBoundsIntersect(result.bounds,rect),false);
 }
});

test('already offscreen and diagonal entry retain their authored side without randomization',()=>{
 const rect=getVisibleBeatSwarmWorldRect({x:0,y:0},.46);
 for(const [side,point] of [['left',{x:rect.left-500,y:0}],['right',{x:rect.right+500,y:0}],['top',{x:0,y:rect.top-500}],['bottom',{x:0,y:rect.bottom+500}]]){
  const p={...point,radiusWorld:50};assert.equal(getSpawnEntrySide([p],rect),side);assert.deepEqual(stageBeatSwarmFormation([p],rect).points[0],p);
 }
 const diagonal=[{x:rect.right+30,y:rect.bottom+30,radiusWorld:100},{x:rect.right+120,y:rect.bottom+80,radiusWorld:100}];
 const plan=stageBeatSwarmFormation(diagonal,rect);assert.equal(plan.side,'bottom');assert.equal(plan.points[1].x-plan.points[0].x,90);assert.equal(plan.points[1].y-plan.points[0].y,50);
});

test('a padded halo intersecting the view does not enable pre-entry threats',()=>{
 const rect={left:-100,right:100,top:-50,bottom:50};
 const enemy={wx:125,wy:0,radiusWorld:40};
 assert.equal(spawnBoundsIntersect(getSpawnFormationBounds([{x:enemy.wx,y:enemy.wy,radiusWorld:40}]),rect),true);
 assert.equal(hasEnemyEnteredSpawnView(enemy,rect),false);
 enemy.wx=99;assert.equal(hasEnemyEnteredSpawnView(enemy,rect),true);
});
