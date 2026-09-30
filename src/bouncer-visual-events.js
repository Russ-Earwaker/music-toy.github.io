export function createBouncerVisualEventQueue() {
  const pending = [];

  function enqueue(event = {}) {
    const audioTime = Number(event.audioTime);
    if (!Number.isFinite(audioTime)) return false;
    pending.push({ ...event, audioTime });
    pending.sort((a, b) => a.audioTime - b.audioTime);
    return true;
  }

  function drain(audioTime, playbackInstanceId = null) {
    const now = Number(audioTime);
    if (!Number.isFinite(now)) return [];
    const due = [];
    for (let index = 0; index < pending.length;) {
      const event = pending[index];
      if (event.playbackInstanceId && playbackInstanceId && event.playbackInstanceId !== playbackInstanceId) {
        pending.splice(index, 1);
        continue;
      }
      if (event.audioTime > now) break;
      pending.splice(index, 1);
      due.push(event);
    }
    return due;
  }

  function clear() { pending.length = 0; }
  return { enqueue, drain, clear, get size() { return pending.length; } };
}
