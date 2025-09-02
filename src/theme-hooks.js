// src/theme-hooks.js (<=300 lines)
// Assign instruments to toys via events/selects.
import { pickFromSelect } from "./theme-manager.js";

const fire = (panel, value)=>{ try{ panel.dispatchEvent(new CustomEvent("toy-instrument", { detail:{ value } })); }catch{} };

export function assignGridInstrument(index, id){
  const panel = document.querySelector(`#grid${index+1}`) || document.querySelectorAll('[data-toy="loopgrid"]')[index];
  if (!panel) return false; const value = pickFromSelect(panel, id); fire(panel, value); return true;
}
export function assignWheelInstrument(id){
  const panel = document.querySelector('[data-toy*="wheel"]');
  if (!panel) return false; const value = pickFromSelect(panel, id); fire(panel, value); return true;
}
export function assignBouncerInstrument(id){
  const panel = document.querySelector('[data-toy="bouncer"]');
  if (!panel) return false; const value = pickFromSelect(panel, id); fire(panel, value); return true;
}
export function assignRipplerInstrument(id){
  const panel = document.querySelector('[data-toy="rippler"]');
  if (!panel) return false; const value = pickFromSelect(panel, id); fire(panel, value); return true;
}
