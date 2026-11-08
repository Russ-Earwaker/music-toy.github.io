import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getInstrumentDisplayLabel,loadInstrumentEntries} from '../src/instrument-catalog.js';
test('palette display names are stable before loading and across ID casing and separators',async()=>{
 const examples=[['PIANO','Piano'],['KALIMBA','Kalimba'],['SYNTH PLUCK LEAD SHORT','Synth Pluck Lead Short'],['HI-HAT CLOSED','Hi-Hat Closed']];
 for(const [id,label]of examples)assert.equal(getInstrumentDisplayLabel(id),label);
 const old=globalThis.fetch;globalThis.fetch=async()=>({ok:true,text:async()=>fs.readFileSync(new URL('../samples.csv',import.meta.url),'utf8')});
 try{await loadInstrumentEntries();for(const [id,label]of examples)for(const value of [id,id.toLowerCase(),id.toLowerCase().replace(/ /g,'_')])assert.equal(getInstrumentDisplayLabel(value),label);}finally{globalThis.fetch=old;}
});
