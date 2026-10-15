import {readFileSync,writeFileSync} from 'node:fs';
const dir=new URL('./debug-output/',import.meta.url);
const read=name=>{const buffer=readFileSync(new URL(name,dir));return{buffer,rate:buffer.readUInt32LE(24),samples:(buffer.length-44)/2};};
function save(name,source,parts){
 const chunks=parts.map(([start,duration])=>source.buffer.subarray(44+Math.round(start*source.rate)*2,44+Math.min(source.samples,Math.round((start+duration)*source.rate))*2));
 const data=Buffer.concat(chunks),header=Buffer.from(source.buffer.subarray(0,44));header.writeUInt32LE(36+data.length,4);header.writeUInt32LE(data.length,40);writeFileSync(new URL(name,dir),Buffer.concat([header,data]));
}
function rms(source,start,duration){let sum=0,count=0;for(let i=Math.round(start*source.rate);i<Math.min(source.samples,Math.round((start+duration)*source.rate));i++){const value=source.buffer.readInt16LE(44+i*2)/32768;sum+=value*value;count++;}return Math.sqrt(sum/count);}
const full=read('auto-arrange-v1-4-mix-2026-10-14T18-16-10-471Z.wav'),phrase=read('auto-arrange-v1-4-melody-2026-10-14T18-16-10-471Z.wav'),levels=read('auto-arrange-v1-4-melody-2026-10-14T17-48-39-276Z.wav');
save('auto-arrange-v1-4-full-16-bars.wav',full,[[0,32.5]]);save('auto-arrange-v1-4-isolated-melody.wav',phrase,[[0,16]]);
const quiet=rms(levels,0,8);let loudStart=8,loud=0;
for(let start=8;start+8<=levels.samples/levels.rate;start+=1){const energy=rms(levels,start,8);if(energy>loud){loud=energy;loudStart=start;}}
save('auto-arrange-v1-4-quiet-then-loud.wav',levels,[[0,8],[loudStart,8]]);
const summary={format:'mono PCM16 WAV, actual production bus captures without volume normalization',quietRms:quiet,loudRms:loud,rmsRatio:loud/quiet,loudSourceOffsetSeconds:loudStart,files:['auto-arrange-v1-4-full-16-bars.wav','auto-arrange-v1-4-isolated-melody.wav','auto-arrange-v1-4-quiet-then-loud.wav']};
writeFileSync(new URL('auto-arrange-v1-4-audio-proof.json',dir),JSON.stringify(summary,null,2)+'\n');console.log(summary);
