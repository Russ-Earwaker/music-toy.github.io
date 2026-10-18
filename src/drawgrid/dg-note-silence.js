import {authoredNotesAt} from './dg-authored-notes.js';
import {eventMuted} from '../free-play-silence.js';
// A folded cell may contain several voices; keep it lit while any voice sounds.
export function authoredCellSilent(panel,col,row){
 const voices=authoredNotesAt(panel,col,row);
 return voices.length>0&&voices.every(eventMuted);
}
