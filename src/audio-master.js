// src/audio-master.js — central master volume/mute with events (<=300 lines)
export const AudioMaster = (function(){
  let volume = 1.0; // 0..1
  let muted = false;
  function getVolume(){ return muted ? 0 : volume; }
  function setVolume(v){ volume = Math.max(0, Math.min(1, Number(v)||0)); return getVolume(); }
  function setMute(m){ muted = !!m; return getVolume(); }
  try{
    document.addEventListener('audio:master-volume', (e)=>{ setVolume(e && e.detail && e.detail.value); }, { passive:true });
    document.addEventListener('audio:master-mute',   (e)=>{ setMute(e && e.detail && e.detail.value);   }, { passive:true });
  }catch{}
  return { getVolume, setVolume, setMute };
})();
