

// --- App top bar (Play/Stop/BPM) ---
(function(){
  function ensureTopbar(){
    if (document.querySelector('.app-topbar')) return;
    const bar = document.createElement('div');
    bar.className = 'app-topbar';

    const left = document.createElement('div'); left.className = 'app-topbar-left';
    const title = document.createElement('div'); title.className = 'app-title'; title.textContent = 'Music Toy';
    left.appendChild(title);

    const right = document.createElement('div'); right.className = 'app-topbar-right';
    const play = document.createElement('button'); play.id='play'; play.type='button'; play.className='top-btn'; play.textContent='Play';
    const stop = document.createElement('button'); stop.id='stop'; stop.type='button'; stop.className='top-btn'; stop.textContent='Stop';
    const bpm  = document.createElement('input'); bpm.id='bpm'; bpm.type='number'; bpm.min='40'; bpm.max='240'; bpm.step='1'; bpm.className='top-bpm';
    bpm.setAttribute('inputmode','numeric');
    right.append(play, stop, bpm);

    bar.append(left, right);
    document.body.prepend(bar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureTopbar);
  else ensureTopbar();
})();
