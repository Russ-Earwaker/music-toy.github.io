// Independent tick mappings over one shared AudioContext. No polling or scheduler.
export function createTickTransport({ id, getContext, ensureContext = getContext, bpm = 120, positionTick = 0, emit = () => {} }) {
  const clean = v => Math.max(0, Math.round(Number(v) || 0));
  const tempo = v => Math.max(30, Math.min(200, Number(v) || 120));
  let state = 'stopped', retained = clean(positionTick), rate = tempo(bpm);
  let originTick = retained, originAudioTime = 0, pending = null, serial = 0;
  const now = () => Number(getContext()?.currentTime) || 0;
  const audioTimeToTick = time => Number.isFinite(Number(time)) ? clean(originTick + (Number(time) - originAudioTime) * rate * 96 / 60) : retained;
  const tickToAudioTime = tick => originAudioTime + (clean(tick) - originTick) * 60 / (rate * 96);
  const position = () => state === 'playing' ? audioTimeToTick(now()) : retained;
  const rebase = tick => { retained = originTick = clean(tick); originAudioTime = now(); };
  const change = detail => emit({ transportId: id, ...detail });
  const transport = {
    id, ticksPerBeat: 96, ticksPerBar: 384, beatsPerBar: 4,
    get state() { return state; }, get bpm() { return rate; },
    get positionTick() { return position(); }, get currentTick() { return position(); },
    get currentBeat() { return Math.floor(position() / 96); },
    get currentBar() { return Math.floor(position() / 384); },
    get originTick() { return originTick; }, get originAudioTime() { return originAudioTime; },
    audioTimeToTick, tickToAudioTime, getPositionAtAudioTime: audioTimeToTick,
    nextBeatTick(tick = position(), { strict = true } = {}) {
      tick = clean(tick); return !strict && tick % 96 === 0 ? tick : (Math.floor(tick / 96) + 1) * 96;
    },
    getState() {
      const tick = position();
      return { state, bpm: rate, positionTick: tick, currentTick: tick,
        currentBeat: Math.floor(tick / 96), currentBar: Math.floor(tick / 384),
        ticksPerBeat: 96, ticksPerBar: 384, beatsPerBar: 4,
        mapping: { originTick, originAudioTime, bpm: rate } };
    },
    play() {
      if (state === 'playing') return Promise.resolve(false);
      if (pending) return pending;
      const ctx = ensureContext(), token = ++serial;
      pending = Promise.resolve(ctx.state === 'suspended' ? ctx.resume() : undefined).then(() => {
        if (token !== serial) return false;
        const fromState = state; rebase(retained); state = 'playing';
        change({ type: 'play', fromState, positionTick: retained, audioTime: now() }); return true;
      }).finally(() => { pending = null; });
      return pending;
    },
    pause() {
      ++serial;
      if (state !== 'playing') return false;
      retained = position(); state = 'paused';
      change({ type: 'pause', positionTick: retained, audioTime: now() }); return true;
    },
    setBpm(value) {
      const next = tempo(value); if (next === rate) return;
      const tick = position(), oldBpm = rate; rebase(tick); rate = next;
      change({ type: 'tempo', tick, bpm: rate, oldBpm, audioTime: now() });
    },
    seekTick(value, reason = 'seek') {
      const fromTick = position(); rebase(value);
      change({ type: 'seek', fromTick, toTick: retained, positionTick: retained, reason, audioTime: now() });
      return retained;
    },
    returnToStart() { return transport.seekTick(0, 'return-to-start'); },
    hardStop() { transport.pause(); state = 'stopped'; },
  };
  return Object.freeze(transport);
}
