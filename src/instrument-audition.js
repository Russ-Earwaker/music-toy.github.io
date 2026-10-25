import {resumeAudioContextIfNeeded,setToyVolume} from './audio-core.js';
import {triggerInstrument,cancelScheduledToySources} from './audio-samples.js';
import {isPitchedEvent} from './note-transpose.js';
import {withPlaybackOccurrence} from './playback-context.js';

export const PALETTE_PREVIEW_BUS='paint-palette-preview';
// Same engine as the instrument picker; no toy, authored note or transport action.
export function createInstrumentAudition({resume=resumeAudioContextIfNeeded,volume=setToyVolume,trigger=triggerInstrument,cancel=cancelScheduledToySources}={}){
 return async function audition(id){
  if(!id)return false;
  await resume();
  const pitched=isPitchedEvent(id);
  volume(PALETTE_PREVIEW_BUS,.5);cancel(PALETTE_PREVIEW_BUS);
  return withPlaybackOccurrence(null,()=>trigger(id,'C4',undefined,PALETTE_PREVIEW_BUS,{
   // Keep the instrument's own envelope and sample tail, as the picker does.
   // A custom strum envelope cuts samples short and replaces synth timbres.
   pitched,pitchShift:pitched,octave:4,
  }));
 };
}
export const auditionInstrument=createInstrumentAudition();
