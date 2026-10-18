import {normalizeMusicalRole} from './musical-role.js';
import {classifyMusicalRole} from './harmonic-adaptation.js';
import {isPitchedEvent} from './note-transpose.js';

export const ARRANGEMENT_CAPABILITIES=Object.freeze({
 drawgrid:['melody','accompaniment','rhythm'],bouncer:['melody','accompaniment','rhythm'],
 rippler:['melody','accompaniment','rhythm'],loopgrid:['rhythm'],'loopgrid-drum':['rhythm'],
 chordwheel:[],
});
export function arrangementMaterial(panel){
 const kind=panel.dataset.toy;
 const state=panel.__sharedToyState||panel.__drawToy?.getState?.()||
  (kind==='bouncer'?panel.__getBouncerSnapshot?.():kind==='rippler'?panel.__getRipplerSnapshot?.():null);
 if(kind==='drawgrid'&&state?.nodes?.list)return state.nodes.list.some((rows,i)=>state.nodes.active?.[i]!==false&&rows.some(r=>!state.nodes.disabled?.[i]?.includes(r)));
 if(['loopgrid','loopgrid-drum'].includes(kind)&&panel.__gridState?.steps)return panel.__gridState.steps.some(step=>Array.isArray(step)?step.some(Boolean):!!step);
 if(kind==='bouncer'&&state)return !!(state.lastLaunch||state.handle?.userPlaced||state.loopRec?.pattern?.length);
 if(kind==='rippler'&&state)return !!(state.generator?.placed||(Array.isArray(state.steps)&&state.steps.some(events=>events?.length)));
 // Older adapters and lazily initialized toys may have no capture API yet.
 // Unknown is not empty: never discard an authored source on that assumption.
 return null;
}
export function auditArrangementInputs(panels){
 const seen=new Set();
 return [...panels].filter(p=>!p.dataset.masterToyId||p.dataset.linkedView==='1')
  .sort((a,b)=>Number(!!a.dataset.masterToyId)-Number(!!b.dataset.masterToyId)||(a.id<b.id?-1:a.id>b.id?1:0)).map(panel=>{
   const {dataset}=panel,kind=dataset.toy,key=dataset.sharedDefinitionId||panel.id;
   const duplicate=seen.has(key);seen.add(key);
   const explicit=normalizeMusicalRole(dataset.musicalRole),empty=arrangementMaterial(panel)===false;
   const valid=['melody','accompaniment','percussion'].includes(explicit);
   const musicalRole=valid?explicit:classifyMusicalRole({toyType:kind,instrument:dataset.instrument});
   let role=musicalRole==='percussion'?'rhythm':musicalRole;
   const pitched=isPitchedEvent(dataset.instrument);
   let reason=duplicate?'another visible copy of the same definition':empty?'empty toy; left unchanged':
    !ARRANGEMENT_CAPABILITIES[kind]?.length?'special/non-musical toy; authored voicing or behavior is outside this recipe':
    ['melody-chunk','extra-rhythm'].includes(dataset.autoArrangeFill)?'existing generated source; reused by ownership policy':null;
   if(!reason&&(!ARRANGEMENT_CAPABILITIES[kind].includes(role)||(['melody','accompaniment'].includes(role)&&!pitched)))reason='authored role cannot supply pitched content with this instrument; available as texture';
   if(reason)role=null;
   return {panel,id:panel.id,definitionId:key,kind,explicit:valid,role,musicalRole,empty,pitched,
    generated:dataset.autoArrangeOrigin==='filled',reason,
    usable:!duplicate&&!empty&&!!ARRANGEMENT_CAPABILITIES[kind]?.length&&!['melody-chunk','extra-rhythm'].includes(dataset.autoArrangeFill)};
  });
}
const preference=(entry,role)=>role==='rhythm'?(['loopgrid','loopgrid-drum'].includes(entry.kind)?0:1):entry.kind==='drawgrid'?0:entry.kind==='bouncer'?1:2;
export function rankArrangementInputs(entries,role){
 return entries.filter(e=>e.role===role).sort((a,b)=>Number(a.generated)-Number(b.generated)||Number(b.explicit)-Number(a.explicit)||
  preference(a,role)-preference(b,role)||(a.id<b.id?-1:a.id>b.id?1:0));
}
export function selectInputPlan(panels){
 const audit=auditArrangementInputs(panels),sources=Object.fromEntries(['rhythm','accompaniment','melody'].map(role=>[role,rankArrangementInputs(audit,role)[0]?.panel||null]));
 const selected=new Set(Object.values(sources).filter(Boolean).map(p=>p.id));
 const extraRhythm=rankArrangementInputs(audit.filter(e=>!selected.has(e.id)),'rhythm')[0]?.panel||null;
 if(extraRhythm)selected.add(extraRhythm.id);
 const textures=audit.filter(e=>e.usable&&!selected.has(e.id)).sort((a,b)=>Number(a.generated)-Number(b.generated)||Number(b.explicit)-Number(a.explicit)||(a.id<b.id?-1:1));
 return {audit,sources,extraRhythm,textures};
}
