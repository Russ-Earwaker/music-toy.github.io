import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BASIC_LOGIC_TYPES,ADVANCED_LOGIC_GROUPS,logicCreationEntry} from '../src/logic-creation-menu.js';

test('creation hierarchy uses the six established labels and two Advanced categories',()=>{
 assert.deepEqual(BASIC_LOGIC_TYPES.map(t=>logicCreationEntry(t).name),['Sequence','Together','Repeat']);
 assert.deepEqual(ADVANCED_LOGIC_GROUPS.map(g=>[g.label,g.types.map(t=>logicCreationEntry(t).name)]),[
  ['Structure',['Timeline']],['Musical',['Chord Progression','Transpose']]]);
 for(const type of [...BASIC_LOGIC_TYPES,...ADVANCED_LOGIC_GROUPS.flatMap(g=>g.types)])assert.doesNotMatch(logicCreationEntry(type).description,/modifier|runtime|context|definition/i);
});

test('dock and midpoint consume the common taxonomy and popup instead of independent catalogs',async()=>{
 const [main,spawner,view]=await Promise.all(['main.js','toy-spawner.js','connection-view.js'].map(f=>readFile(new URL('../src/'+f,import.meta.url),'utf8')));
 assert.match(main,/BASIC_LOGIC_TYPES\.map\(logicCreationEntry\)/);
 assert.match(spawner,/openAdvancedLogic\(\{anchor:state\.logicToggle/);
 assert.match(view,/s \? STRUCTURE_TYPES : BASIC_LOGIC_TYPES/);
 assert.match(view,/openAdvancedLogic\(\{anchor:menuReturnFocus/);
 assert.doesNotMatch(main,/getCatalog:\(\)=>\[\.\.\.LOGIC_NODE_TYPES/);
});
