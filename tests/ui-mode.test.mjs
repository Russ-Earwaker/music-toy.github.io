import test from 'node:test';
import assert from 'node:assert/strict';
import {createUIMode, UI_MODE_KEY} from '../src/ui-mode.js';

test('preference defaults to Simple, persists separately, reloads and ignores invalid/repeated values',()=>{
 const saved=new Map(), calls=[];
 const storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};
 const mode=createUIMode({storage,apply:value=>calls.push(value)});
 assert.equal(mode.get(),'simple');
 const notices=[];const off=mode.subscribe((...args)=>notices.push(args));
 mode.set('advanced');mode.set('advanced');mode.set('invalid');
 assert.deepEqual([...saved],[[UI_MODE_KEY,'advanced']]);
 assert.equal(createUIMode({storage}).get(),'advanced');
 assert.deepEqual(notices,[['advanced','simple']]);
 off();mode.set('simple');assert.equal(notices.length,1);
 assert.deepEqual(calls,['advanced','simple']);
});
test('unavailable storage does not prevent switching',()=>{
 const mode=createUIMode({storage:{getItem(){throw Error();},setItem(){throw Error();}}});
 mode.set('advanced');assert.equal(mode.get(),'advanced');
});
