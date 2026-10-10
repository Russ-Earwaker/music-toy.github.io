import { CHORD_ROOTS, resolveChordAtTick } from './chord-progression.js';
import { transposeNote, isPitchedEvent } from './note-transpose.js';
const pc = n => ((n%12)+12)%12;
const intervals = quality => quality==='minor'?[0,3,7]:[0,4,7];
const scaleIntervals = quality => quality==='minor'?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
export const TOY_MUSICAL_ROLES = Object.freeze({
  'loopgrid-drum':'percussion',chordwheel:'harmony',
  loopgrid:'melody',drawgrid:'melody',bouncer:'melody',rippler:'melody'
});
export function classifyMusicalRole({toyType,instrument,entry,options={},occurrence=null}={}) {
  if (!isPitchedEvent(instrument,entry,options,occurrence) || TOY_MUSICAL_ROLES[toyType]==='percussion') return 'percussion';
  // Chord Wheel already authors voicings: never quantize its voices as melody.
  if (TOY_MUSICAL_ROLES[toyType]==='harmony') return 'harmony';
  const explicit=options.musicalRole ?? occurrence?.musicalRole;
  if (['bass','melody','harmony'].includes(explicit)) return explicit;
  if (/(^|[ _-])(bass|contrabass)([ _-]|$)/i.test(String(entry?.instrumentType ?? '')+' '+String(instrument))) return 'bass';
  return TOY_MUSICAL_ROLES[toyType] ?? 'melody';
}
export function noteMidi(note) {
  if(typeof note==='number'&&Number.isFinite(note))return note;
  const m=/^([A-G])([#b]?)(-?\d+)$/i.exec(String(note).trim());if(!m)return null;
  return (Number(m[3])+1)*12+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1].toUpperCase()]+(m[2]==='#'?1:m[2]==='b'?-1:0);
}
const tones = chord => intervals(chord.quality).map(i=>pc(CHORD_ROOTS.indexOf(chord.root)+i));
const scaleCache = new WeakMap();
// Score major/natural-minor scales by missing progression triad tones. Ties
// prefer the first chord's root/mode, then stable chromatic order.
export function deriveProgressionScale(chords) {
  if(scaleCache.has(chords))return scaleCache.get(chords);
  const candidates=CHORD_ROOTS.flatMap((root,index)=>['major','minor'].map(quality=>{
    const pitches=scaleIntervals(quality).map(i=>pc(index+i));
    const missing=chords.flatMap(tones).filter(n=>!pitches.includes(n)).length;
    const anchor=root===chords[0].root && quality===chords[0].quality?0:1;
    return {root,quality,pitches:Object.freeze(pitches),score:missing*100+anchor};
  })).sort((a,b)=>a.score-b.score);
  const {score,...chosen}=candidates[0];const result=Object.freeze(chosen);scaleCache.set(chords,result);return result;
}
// A neutral authored reference avoids first-activation/order dependence and
// remains stable through progression edits and timbre changes. Callers may
// supply referenceHarmony explicitly when authoring material in another home key.
const DEFAULT_REFERENCE = Object.freeze({root:'C',quality:'major'});
const nearest = (midi,pitches) => {
  // Lower-pitch ties make this monotone and independent of scheduler ordering,
  // lookahead partitions, previous notes, pause/resume, or overlapping voices.
  for(let distance=0;distance<=6;distance++){
    if(pitches.includes(pc(midi-distance)))return midi-distance;
    if(pitches.includes(pc(midi+distance)))return midi+distance;
  }
  return midi;
};
function fitRegister(midi,register) {
  if(!register)return midi;
  const low=Number(register.minMidi),high=Number(register.maxMidi);
  if(!Number.isFinite(low)||!Number.isFinite(high)||high<low)return midi;
  const variants=Array.from({length:21},(_,i)=>midi+(i-10)*12).filter(n=>n>=low&&n<=high);
  return variants.sort((a,b)=>Math.abs(a-midi)-Math.abs(b-midi)||a-b)[0]??midi;
}
export function adaptNoteToHarmony({sourcePitch,eventTick,harmony,role='melody',referenceHarmony=DEFAULT_REFERENCE,register}={}) {
  const chord=resolveChordAtTick({harmony},eventTick),midi=noteMidi(sourcePitch);
  if(!chord||midi==null||role==='percussion'||role==='harmony')return sourcePitch;
  let result=midi;
  if(role==='bass'){
    const reference=CHORD_ROOTS.includes(referenceHarmony?.root)?referenceHarmony:DEFAULT_REFERENCE;
    const homeRoot=CHORD_ROOTS.indexOf(reference.root),targetRoot=CHORD_ROOTS.indexOf(chord.root);
    const home=intervals(reference.quality),target=intervals(chord.quality);
    // Interpret each source note as its nearest home triad degree. Root wins
    // equal distances. Preserve the source octave and chord-relative motion.
    const candidates=home.flatMap((interval,degree)=>[-12,0,12].map(o=>{
      const root=midi-pc(midi-homeRoot)+o;
      return {degree,pitch:root+interval,root};
    })).sort((a,b)=>Math.abs(a.pitch-midi)-Math.abs(b.pitch-midi)||a.degree-b.degree||a.pitch-b.pitch);
    const chosen=candidates[0];
    const movement=pc(targetRoot-homeRoot+6)-6;
    result=chosen.root+movement+target[chosen.degree];
  }else{
    const scale=deriveProgressionScale(harmony.chords);
    // Active chord tones remain valid even for a non-diatonic progression.
    result=nearest(midi,[...new Set([...scale.pitches,...tones(chord)])]);
  }
  return transposeNote(sourcePitch,fitRegister(result,register)-midi);
}
export function resolveMusicalPitch({sourcePitch,eventTick,context,role='melody',referenceHarmony,register}={}) {
  const chord=role==='percussion'?null:resolveChordAtTick(context,eventTick);
  const adaptedNote=adaptNoteToHarmony({sourcePitch,eventTick,harmony:context?.harmony,role,referenceHarmony,register});
  const transpose=role==='percussion'?0:Math.trunc(Number(context?.transposeSemitones)||0);
  return Object.freeze({sourceNote:sourcePitch,eventTick,role,resolvedChord:chord,
    scale:role!=='percussion'&&context?.harmony?deriveProgressionScale(context.harmony.chords):null,
    referenceHarmony:referenceHarmony??DEFAULT_REFERENCE,adaptedNote,transpose,finalNote:transposeNote(adaptedNote,transpose)});
}
