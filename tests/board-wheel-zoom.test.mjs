import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WheelZoomLerper} from '../src/zoom/WheelZoomLerper.js';
import {setGestureTransform} from '../src/zoom/ZoomCoordinator.js';
import {BOARD_ZOOM_MIN,BOARD_ZOOM_MAX} from '../src/board-zoom-limits.js';

test('real wheel input reaches the shared 2.5% limit and zooms back in',t=>{
 const previousFrame=globalThis.requestAnimationFrame;
 globalThis.requestAnimationFrame=()=>1;
 t.after(()=>{if(previousFrame)globalThis.requestAnimationFrame=previousFrame;else delete globalThis.requestAnimationFrame;});
 const lerper=new WheelZoomLerper(()=>{});
 // Test input/target calculation without starting an animation frame loop.
 lerper._kick=()=>{};
 setGestureTransform({scale:.3,x:0,y:0});
 lerper.setTargetFromWheel(10000,400,300);
 assert.equal(lerper.state.targetScale,BOARD_ZOOM_MIN);
 assert.ok(lerper.state.targetScale<.075);
 setGestureTransform({scale:BOARD_ZOOM_MIN,x:lerper.state.targetX,y:lerper.state.targetY});
 lerper.setTargetFromWheel(-100,400,300);
 assert.ok(lerper.state.targetScale>BOARD_ZOOM_MIN);
 lerper.setTarget(100,0,0);assert.equal(lerper.state.targetScale,BOARD_ZOOM_MAX);
});

test('viewport and overview controls use the shared bounds rather than a second zoom limit',()=>{
 for(const name of ['board-viewport.js','overview-button.js']){
  const source=readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
  assert.match(source,/import .*BOARD_ZOOM_MIN.*board-zoom-limits/);
  assert.doesNotMatch(source,/const SCALE_MIN = [\d.]+/);
 }
});
