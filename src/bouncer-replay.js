// src/bouncer-replay.js — 1-bar record & replay for Bouncer (opt-in)
export function createReplay(){
  let mode = 'live'; // 'live' | 'recording' | 'replay'
  let samples = [];  // [{t,x,y}]
  let hits = [];     // [{t, name}]
  let recStart = 0;
  let replayStart = 0;
  let barLen = 1;

  function armRecord(now, _barLen){
    mode = 'recording'; samples = []; hits = []; recStart = now; barLen = Math.max(0.25, _barLen||1);
  }
  function addSample(now, x, y){
    if (mode !== 'recording') return;
    const t = now - recStart;
    if (t <= barLen) samples.push({ t, x, y });
    if (t > barLen){ mode = 'live'; }
  }
  function addHit(now, name){
    if (mode !== 'recording') return;
    const t = now - recStart;
    if (t <= barLen) hits.push({ t, name });
  }
  function endRecord(){ mode = 'live'; }

  function startReplay(now){ if (samples.length){ mode = 'replay'; replayStart = now; } }
  function stopReplay(){ mode = 'live'; }

  function getReplayPos(now){
    if (mode !== 'replay' || !samples.length) return null;
    const t = (now - replayStart) % barLen;
    // find segment
    let i = 0;
    while (i+1 < samples.length && samples[i+1].t < t) i++;
    const a = samples[i], b = samples[Math.min(i+1, samples.length-1)];
    const d = Math.max(1e-4, b.t - a.t);
    const u = Math.min(1, Math.max(0, (t - a.t)/d));
    return { x: a.x + (b.x - a.x)*u, y: a.y + (b.y - a.y)*u };
  }

  function getHitsToTrigger(now, lastNow){
    if (mode !== 'replay' || !hits.length) return [];
    const t0 = ((lastNow - replayStart) % barLen + barLen) % barLen;
    const t1 = ((now - replayStart) % barLen + barLen) % barLen;
    const wrap = t1 < t0;
    const out = [];
    for (const h of hits){
      if (!wrap){
        if (h.t >= t0 && h.t < t1) out.push(h.name);
      } else {
        if (h.t >= t0 || h.t < t1) out.push(h.name);
      }
    }
    return out;
  }

  return {
    // state
    get mode(){ return mode; },
    get hasRecording(){ return samples.length > 0; },
    get barLength(){ return barLen; },
    // control
    armRecord,
    addSample,
    addHit,
    endRecord,
    startReplay,
    stopReplay,
    getReplayPos,
    getHitsToTrigger,
  };
}
