// Music Toy — Web + PWA starter with accurate audio scheduling
// Next step: swap sample pitch via granular/AudioWorklet for constant length.

const noteFreqs = { C:261.63, 'C#':277.18, D:293.66, 'D#':311.13, E:329.63, F:349.23, 'F#':369.99, G:392.0, 'G#':415.3, A:440.0, 'A#':466.16, B:493.88 };
const noteNames = Object.keys(noteFreqs);
const baseNote = 'C'; // reference sample pitch
const baseFreq = noteFreqs[baseNote];

const NUM_STEPS = 8;
const DEFAULT_BPM = 120;

const TOYS = [
  { name: 'Kick', type: 'sample', url: './assets/samples/RP4_KICK_1.mp3' },
  { name: 'Snare', type: 'sample', url: './assets/samples/Brk_Snr.mp3' },
  { name: 'Hat', type: 'sample', url: './assets/samples/Cev_H2.mp3' },
  { name: 'Clap', type: 'sample', url: './assets/samples/Heater-6.mp3' }, // placeholder
];

let ac; // AudioContext
let unlocked = false;
let buffers = {};
let gridState = {}; // per row: [{active, noteIndex}, ...]
let isPlaying = false;
let bpm = DEFAULT_BPM;

// High-precision scheduler
let currentStep = 0;
let nextNoteTime = 0;  // in ac.currentTime
const scheduleAheadTime = 0.12; // seconds to schedule ahead
const lookahead = 25;  // ms setInterval tick

// Canvas toy state (bouncer)
const canvas = document.getElementById('bouncer');
const ctx = canvas.getContext('2d');
const blocks = [
  { x: 120, y: 160, w: 32, h: 32, note: 'C' },
  { x: 200, y: 60,  w: 32, h: 32, note: 'E' },
  { x: 280, y: 120, w: 32, h: 32, note: 'G' },
  { x: 360, y: 90,  w: 32, h: 32, note: 'B' }
];
let ball = null;
let dragging = false, startX=0, startY=0, mouseX=0, mouseY=0;

// ---------- Audio Core ----------
function beatSeconds() {
  return 60 / bpm; // quarter note
}
function stepSeconds() {
  // 8 steps per bar, 4/4 = 2 steps per beat -> half-beat grid
  return beatSeconds() / 2;
}

function getPlaybackRateForNote(note) {
  return noteFreqs[note] / baseFreq;
}

async function loadSample(url) {
  const res = await fetch(url);
  const ab = await res.arrayBuffer();
  return await ac.decodeAudioData(ab);
}

function playSampleAtTime(buffer, when, rate=1) {
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  src.connect(ac.destination);
  src.start(when);
}

function playToneOnce(freq, when) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.22, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.25);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(when);
  osc.stop(when + 0.26);
}

// ---------- Scheduler ----------
function scheduleStep(stepIndex, time) {
  // for each row, if active at step, schedule a note
  TOYS.forEach(row => {
    const step = gridState[row.name][stepIndex];
    if (!step.active) return;

    const note = noteNames[step.noteIndex];
    if (row.type === 'sample') {
      // TODO: swap with time-preserving pitch engine
      const rate = getPlaybackRateForNote(note);
      playSampleAtTime(buffers[row.name], time, rate);
    } else if (row.type === 'tone') {
      playToneOnce(noteFreqs[note], time);
    }
  });

  // visual step marker
  markPlayingColumn(stepIndex, time);
}

function schedulerTick() {
  while (nextNoteTime < ac.currentTime + scheduleAheadTime) {
    scheduleStep(currentStep, nextNoteTime);

    nextNoteTime += stepSeconds();
    currentStep = (currentStep + 1) % NUM_STEPS;

    if (currentStep === 0) {
      // loop boundary — you can reset the bouncer here if desired
      // (we keep it continuous per your latest preference)
    }
  }
}

let schedulerInterval = null;
function startScheduler() {
  if (schedulerInterval) clearInterval(schedulerInterval);
  nextNoteTime = ac.currentTime + 0.05;
  schedulerInterval = setInterval(schedulerTick, lookahead);
}
function stopScheduler() {
  if (schedulerInterval) clearInterval(schedulerInterval);
  schedulerInterval = null;
}

// ---------- UI Grid ----------
function buildGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  grid.style.gridTemplateRows = `repeat(${TOYS.length}, auto)`;

  TOYS.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'row';

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = row.name;
    rowEl.appendChild(label);

    gridState[row.name] = [];
    for (let i=0;i<NUM_STEPS;i++) {
      const step = document.createElement('div');
      step.className = 'step';

      // per-step note state
      let noteIndex = 0;

      const noteEl = document.createElement('div');
      noteEl.className = 'note';
      noteEl.textContent = noteNames[noteIndex];

      const controls = document.createElement('div');
      controls.className = 'note-controls';

      const up = document.createElement('button');
      up.textContent = '▲';
      const down = document.createElement('button');
      down.textContent = '▼';

      up.onclick = (e) => { e.stopPropagation(); if (noteIndex < noteNames.length-1) noteIndex++; noteEl.textContent = noteNames[noteIndex]; };
      down.onclick = (e) => { e.stopPropagation(); if (noteIndex > 0) noteIndex--; noteEl.textContent = noteNames[noteIndex]; };

      controls.appendChild(up);
      controls.appendChild(down);

      step.appendChild(noteEl);
      step.appendChild(controls);

      step.onclick = () => {
        const s = gridState[row.name][i];
        s.active = !s.active;
        step.classList.toggle('active', s.active);
      };

      gridState[row.name][i] = {
        active: false,
        get noteIndex() { return noteIndex; }
      };

      rowEl.appendChild(step);
    }

    grid.appendChild(rowEl);
  });
}

function markPlayingColumn(stepIndex, when) {
  // remove old
  document.querySelectorAll('.step.playing').forEach(el => el.classList.remove('playing'));
  // mark each row's current step
  TOYS.forEach((row, r) => {
    const rowEl = document.querySelectorAll('.row')[r];
    const stepEl = rowEl.children[stepIndex + 1]; // +1 because of label col
    if (stepEl) stepEl.classList.add('playing');
  });
}

// ---------- Bouncer (continuous update) ----------
function spawnBall(x, y, vx, vy) {
  ball = { x, y, vx, vy, r: 10 };
}

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  startX = e.clientX - rect.left; startY = e.clientY - rect.top; dragging = true;
});
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top;
});
canvas.addEventListener('mouseup', (e) => {
  if (!dragging) return;
  const rect = canvas.getBoundingClientRect();
  const endX = e.clientX - rect.left, endY = e.clientY - rect.top;
  const vx = (endX - startX) / 10;
  const vy = (endY - startY) / 10;
  spawnBall(startX, startY, vx, vy);
  dragging = false;
});

function drawBouncer() {
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // blocks
  blocks.forEach(b => {
    ctx.fillStyle = '#ff8c00';
    ctx.fillRect(b.x, b.y, b.w, b.h);
  });

  // guideline
  if (dragging) {
    ctx.strokeStyle = 'lime';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(mouseX, mouseY);
    ctx.stroke();
  }

  // ball
  if (ball) {
    ball.x += ball.vx; ball.y += ball.vy;
    if (ball.x - ball.r < 0 || ball.x + ball.r > canvas.width) ball.vx *= -1;
    if (ball.y - ball.r < 0 || ball.y + ball.r > canvas.height) ball.vy *= -1;

    // collisions with blocks + trigger tone
    blocks.forEach(b => {
      const hit = (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w &&
                   ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h);
      if (hit) {
        // naive bounce
        ball.vx *= -1; ball.vy *= -1;
        if (unlocked) playToneOnce(noteFreqs[b.note], ac.currentTime);
      }
    });

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(drawBouncer);
}

// ---------- Audio unlock + transport ----------
function setupUnlock() {
  const overlay = document.getElementById('unlock');
  const btn = document.getElementById('unlock-btn');
  btn.addEventListener('click', async () => {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    if (ac.state === 'suspended') await ac.resume();
    unlocked = true;
    overlay.classList.add('hidden');

    // load buffers after unlock for iOS
    for (const row of TOYS) {
      buffers[row.name] = await loadSample(row.url);
    }
  }, { once: true });
}

function setupTransport() {
  const playBtn = document.getElementById('play');
  const stopBtn = document.getElementById('stop');
  const bpmInput = document.getElementById('bpm');

  bpmInput.addEventListener('change', () => {
    bpm = Math.max(40, Math.min(240, Number(bpmInput.value)||DEFAULT_BPM));
  });

  playBtn.addEventListener('click', async () => {
    if (!unlocked) return; // require user gesture unlock first
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') await ac.resume();
    if (isPlaying) return;

    isPlaying = true;
    startScheduler();
  });

  stopBtn.addEventListener('click', () => {
    if (!isPlaying) return;
    isPlaying = false;
    stopScheduler();
    currentStep = 0;
  });
}

// ---------- Boot ----------
function boot() {
  setupUnlock();
  buildGrid();
  drawBouncer();
  setupTransport();
}

boot();

// Expose for later advanced modules (e.g., granular shifter)
export { ac, TOYS, buffers, gridState, noteNames, noteFreqs, baseFreq, getPlaybackRateForNote };
