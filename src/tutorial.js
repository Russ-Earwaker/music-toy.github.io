import { initToyUI } from './toyui.js';
import { createDrawGrid } from './drawgrid.js';
import { connectDrawGridToPlayer } from './drawgrid-player.js';
import { getSnapshot, applySnapshot } from './persistence.js';
import { setHelpActive, isHelpActive } from './help-overlay.js';
import { isRunning, stop as stopTransport } from './audio-core.js';
import { startParticleStream, stopParticleStream } from './tutorial-fx.js';

const GOAL_FLOW = [
  {
    id: 'draw-intro',
    title: 'Draw out a tune',
    reward: {
      description: 'Unlocks the Clear and Randomise buttons.',
      icons: [
        { type: 'asset', label: 'Clear', icon: "../assets/UI/T_ButtonClear.png", accent: '#f87171' },
        { type: 'asset', label: 'Randomise', icon: "../assets/UI/T_ButtonRandom.png" },
      ],
    },
    tasks: [
      {
        id: 'draw-line',
        label: 'Draw your first line.',
        requirement: 'draw-line',
        showSwipePrompt: true,
      },
      {
        id: 'press-play',
        label: 'Press the Play button to start the toy.',
        requirement: 'press-play',
      },
      {
        id: 'toggle-node',
        label: 'Tap a note on the line to mute and unmute it.',
        requirement: 'toggle-node',
      },
    ],
  },
  {
    id: 'clear-random',
    title: 'Randomise and clear',
    reward: {
      description: 'Unlocks the Add Toy button.',
      icons: [
        { type: 'symbol', label: 'Add Toy', symbol: '+' },
      ],
    },
    tasks: [
      {
        id: 'press-clear',
        label: 'Press the Clear button.',
        requirement: 'press-clear',
      },
      {
        id: 'press-random',
        label: 'Press the Randomise button.',
        requirement: 'press-random',
      },
    ],
  },
];

(function() {
  const tutorialButton = document.querySelector('[data-action="tutorial"]');
  const board = document.getElementById('board');
  if (!tutorialButton || !board) return;

  let tutorialActive = false;
  let tutorialToy = null;
  let tutorialFromFactory = false;
  let goalPanel = null;
  let previousSnapshot = null;
  let previousFocus = null;
  let storedScroll = { x: 0, y: 0 };
  let helpWasActiveBeforeTutorial = false;
  let helpActivatedForTask = false;
  let tutorialListeners = [];
  let hasDetectedLine = false;
  let spawnerControls = {};
  let tutorialState = null;

  const CONTROL_SELECTORS = {
    clear: '[data-action="clear"]',
    random: '[data-action="random"]',
    play: '#topbar [data-action="toggle-play"]',
  };

  const TASK_TARGETS = {
    'press-play': 'play',
    'press-clear': 'clear',
    'press-random': 'random',
  };
  function updatePlayButtonVisual(btn, playing) {
    if (!btn) return;
    const core = btn.querySelector('.c-btn-core');
    const url = playing ? "url('../assets/UI/T_ButtonPause.png')" : "url('../assets/UI/T_ButtonPlay.png')";
    if (core) core.style.setProperty('--c-btn-icon-url', url);
    else btn.textContent = playing ? 'Pause' : 'Play';
    btn.title = playing ? 'Pause' : 'Play';
  }

  const defaultLabel = tutorialButton.textContent?.trim() || 'Tutorial';

  function updateButtonVisual() {
    tutorialButton.textContent = tutorialActive ? 'Exit Tutorial' : defaultLabel;
    tutorialButton.setAttribute('aria-pressed', tutorialActive ? 'true' : 'false');
  }

  function hideOriginalToys() {
    board.querySelectorAll('.toy-panel').forEach(panel => {
      if (panel.classList.contains('tutorial-panel')) return;
      panel.classList.add('tutorial-hidden');
      panel.setAttribute('aria-hidden', 'true');
    });
  }

  function showOriginalToys() {
    board.querySelectorAll('.toy-panel').forEach(panel => {
      panel.classList.remove('tutorial-hidden');
      panel.removeAttribute('aria-hidden');
    });
  }

  function addListener(target, type, handler, options) {
    if (!target) return;
    target.addEventListener(type, handler, options);
    tutorialListeners.push({ target, type, handler, options });
  }

  function removeTutorialListeners() {
    tutorialListeners.forEach(({ target, type, handler, options }) => {
      try { target.removeEventListener(type, handler, options); } catch {}
    });
    tutorialListeners = [];
  }

  function animateUnlock(el) {
    if (!el) return;
    const dramatic = el.dataset?.action === 'clear' || el.dataset?.action === 'random';
    if (el.animate) {
      const keyframes = dramatic
        ? [
            { transform: 'scale(0.2)', opacity: 0 },
            { transform: 'scale(1.3)', opacity: 1 },
            { transform: 'scale(0.92)', opacity: 1 },
            { transform: 'scale(1)', opacity: 1 }
          ]
        : [
            { transform: 'scale(0.8)', opacity: 0 },
            { transform: 'scale(1.05)', opacity: 1 },
            { transform: 'scale(1)', opacity: 1 }
          ];
      el.animate(keyframes, { duration: dramatic ? 480 : 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }
    el.classList.add('tutorial-unlock-animate');
    el.addEventListener('animationend', () => el.classList.remove('tutorial-unlock-animate'), { once: true });
  }

  function lockTutorialControls(panel) {
    if (!panel) return;
    panel.querySelectorAll('.toy-mode-btn, .toy-chain-btn').forEach(btn => btn.remove());
    const header = panel.querySelector('.toy-header');
    const locked = [];
    if (header) {
      header.querySelectorAll('button, select, .c-btn').forEach(el => {
        if (!(el instanceof HTMLElement) || el.classList.contains('tutorial-control-locked')) return;
        el.dataset.tutorialOrigDisplay = el.style.display || '';
        el.classList.add('tutorial-control-locked');
        if (el.matches('button, select')) {
          try { el.disabled = true; } catch {}
          el.setAttribute('aria-disabled', 'true');
        }
        locked.push(el);
      });
    }
    panel.__tutorialLockedControls = locked;
  }

  function getControlMap(panel) {
    if (!panel) return {};
    if (!panel.__tutorialControlMap) panel.__tutorialControlMap = {};
    const map = panel.__tutorialControlMap;
    Object.keys(CONTROL_SELECTORS).forEach(key => {
      const selector = CONTROL_SELECTORS[key];
      if (!selector) return;
      let el = map[key];
      if (!el || !document.body.contains(el)) {
        el = (panel?.isConnected ? panel.querySelector(selector) : null) || document.querySelector(selector);
        map[key] = el || null;
      }
    });
    return map;
  }

  function unlockPanelControls(panel, keys = []) {
    if (!panel) return [];
    const map = getControlMap(panel);
    const unlocked = [];
    keys.forEach(key => {
      const el = map[key];
      if (!el) return;
      const wasLocked = el.classList.contains('tutorial-control-locked');
      el.classList.remove('tutorial-control-locked');
      if (el.dataset.tutorialOrigDisplay !== undefined) {
        el.style.display = el.dataset.tutorialOrigDisplay;
        delete el.dataset.tutorialOrigDisplay;
      } else {
        el.style.removeProperty('display');
      }
      if (el.matches('button, select')) {
        el.disabled = false;
        el.removeAttribute('aria-disabled');
      }
      if (wasLocked) unlocked.push(el);
    });
    return unlocked;
  }

  function setUpSpawnerControls() {
    spawnerControls = {
      toggle: document.querySelector('.toy-spawner-toggle'),
      trash: document.querySelector('.toy-spawner-trash'),
      help: document.querySelector('.toy-spawner-help'),
    };
    Object.values(spawnerControls).forEach(el => {
      if (!el) return;
      if (!el.dataset.tutorialOrigDisplay) {
        el.dataset.tutorialOrigDisplay = el.style.display || '';
      }
      el.classList.add('tutorial-locked-control');
    });
  }

  function restoreSpawnerControls() {
    Object.values(spawnerControls).forEach(el => {
      if (!el) return;
      el.classList.remove('tutorial-locked-control');
      if (el.dataset.tutorialOrigDisplay !== undefined) {
        el.style.display = el.dataset.tutorialOrigDisplay;
        delete el.dataset.tutorialOrigDisplay;
      } else {
        el.style.removeProperty('display');
      }
    });
    spawnerControls = {};
  }

  function unlockReward(goalId) {
    if (!tutorialState) return;
    if (!tutorialState.unlockedRewards) tutorialState.unlockedRewards = new Set();
    tutorialState.unlockedRewards.add(goalId);
  }

  function unlockSpawnerControl(key) {
    const el = spawnerControls[key];
    if (!el) return null;
    const wasLocked = el.classList.contains('tutorial-locked-control');
    el.classList.remove('tutorial-locked-control');
    if (el.dataset.tutorialOrigDisplay !== undefined) {
      el.style.display = el.dataset.tutorialOrigDisplay;
      delete el.dataset.tutorialOrigDisplay;
    } else {
      el.style.removeProperty('display');
    }
    return wasLocked ? el : null;
  }

  function applyGoalReward(goal) {
    if (!goal || !tutorialState) return [];
    if (!tutorialState.unlockedRewards) tutorialState.unlockedRewards = new Set();
    if (tutorialState.unlockedRewards.has(goal.id)) return [];

    const unlocked = [];
    if (goal.id === 'draw-intro' && tutorialToy) {
      unlocked.push(...unlockPanelControls(tutorialToy, ['clear', 'random']));
    }
    if (goal.id === 'clear-random') {
      const toggle = unlockSpawnerControl('toggle');
      if (toggle) unlocked.push(toggle);
    }

    unlockReward(goal.id);
    return unlocked.filter(Boolean);
  }

  function buildGoalPanel() {
    const container = document.createElement('aside');
    container.id = 'tutorial-goals';
    container.className = 'tutorial-goals-panel';
    container.innerHTML = `
      <header class="tutorial-goals-header">
        <div class="tutorial-goals-eyebrow">Goal</div>
        <h2 class="tutorial-goals-title"></h2>
      </header>
      <section class="tutorial-goals-tasks">
        <ol class="tutorial-goals-tasklist"></ol>
      </section>
      <section class="tutorial-goals-progress">
        <div class="goal-progress-bar"><div class="goal-progress-fill"></div></div>
        <div class="goal-progress-summary"></div>
      </section>
      <footer class="tutorial-goals-reward">
        <div class="goal-reward-label">Reward</div>
        <p class="goal-reward-description"></p>
        <div class="goal-reward-icons"></div>
      </footer>`;
    return container;
  }

  function ensureGoalPanel() {
    if (!goalPanel) goalPanel = buildGoalPanel();
    if (!goalPanel.isConnected) document.body.appendChild(goalPanel);
    requestAnimationFrame(() => goalPanel.classList.add('is-visible'));
  }

  function teardownGoalPanel() {
    if (!goalPanel) return;
    goalPanel.classList.remove('is-visible');
  }

  function getCurrentGoal() {
    if (!tutorialState) return null;
    return GOAL_FLOW[tutorialState.goalIndex] || null;
  }

  function getCurrentTask() {
    const goal = getCurrentGoal();
    if (!goal) return null;
    return goal.tasks[tutorialState.taskIndex] || null;
  }

  function renderGoalPanel() {
    if (!goalPanel) return;
    const goal = getCurrentGoal();
    if (!tutorialState || !goal) {
      return;
    }

    const { taskIndex } = tutorialState;
    const { title, tasks, reward } = goal;
    goalPanel.querySelector('.tutorial-goals-title').textContent = title;
    const listEl = goalPanel.querySelector('.tutorial-goals-tasklist');
    listEl.innerHTML = '';
    tasks.forEach((task, index) => {
      const li = document.createElement('li');
      li.className = 'goal-task';
      li.dataset.taskId = task.id;
      if (index < taskIndex) li.classList.add('is-complete');
      else if (index === taskIndex) li.classList.add('is-active');
      else li.classList.add('is-hidden');
      li.innerHTML = `<span class="goal-task-index">${index + 1}</span><span class="goal-task-label">${task.label}</span>`;
      listEl.appendChild(li);
    });

    const completedTasks = Math.min(taskIndex, tasks.length);
    goalPanel.querySelector('.goal-progress-fill').style.width = `${(completedTasks / tasks.length) * 100}%`;
    goalPanel.querySelector('.goal-progress-summary').innerHTML = `<strong>${completedTasks} / ${tasks.length}</strong> tasks complete`;
    goalPanel.querySelector('.goal-reward-description').textContent = reward.description;

    const rewardIcons = goalPanel.querySelector('.goal-reward-icons');
    rewardIcons.innerHTML = '';
    if (reward && Array.isArray(reward.icons)) {
      reward.icons.forEach(icon => {
        const wrapper = document.createElement('div');
        wrapper.className = 'goal-reward-icon';
        if (tutorialState?.unlockedRewards?.has(goal.id)) wrapper.classList.add('is-unlocked');

        const btn = document.createElement('div');
        btn.className = 'c-btn';
        btn.style.setProperty('--c-btn-size', '56px');
        if (icon.accent) btn.style.setProperty('--accent', icon.accent);
        btn.style.pointerEvents = 'none';
        btn.innerHTML = '<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>';
        const core = btn.querySelector('.c-btn-core');
        core.setAttribute('role', 'img');
        if (icon.type === 'asset') {
          core.style.setProperty('--c-btn-icon-url', `url('${icon.icon}')`);
          core.setAttribute('aria-label', icon.label || '');
        } else {
          core.textContent = icon.symbol || '+';
          core.setAttribute('aria-label', icon.label || icon.symbol || '+');
        }

        wrapper.appendChild(btn);
        rewardIcons.appendChild(wrapper);
      });
    }
  }

  function handleTaskEnter(task) {
    stopParticleStream();
    document.querySelectorAll('.tutorial-pulse-target').forEach(el => el.classList.remove('tutorial-pulse-target'));

    if (!task) return;

    const targetKey = TASK_TARGETS[task.id];
    const targetEl = targetKey ? (getControlMap(tutorialToy)[targetKey] || document.querySelector(CONTROL_SELECTORS[targetKey])) : null;
    if (task.id === 'press-play' && targetEl) {
      targetEl.classList.remove('tutorial-hide-play-button');
      if (targetEl.dataset.tutorialOrigDisplay !== undefined) {
        targetEl.style.display = targetEl.dataset.tutorialOrigDisplay;
      } else {
        targetEl.style.removeProperty('display');
      }
      targetEl.disabled = false;
      window.tutorialSpacebarDisabled = false;
    }
    const targetVisible = targetEl && !targetEl.classList.contains('tutorial-control-locked') && !targetEl.classList.contains('tutorial-hide-play-button') && (targetEl.offsetParent !== null || getComputedStyle(targetEl).display !== 'none');

    if (targetVisible) {
      const taskEl = goalPanel?.querySelector('.goal-task.is-active');
      if (taskEl) startParticleStream(taskEl, targetEl);

      if (task.id === 'press-play') {
        targetEl.style.transform = '';

        targetEl.animate([
          { transform: 'scale(0)', opacity: 0 },
          { transform: 'scale(1.2)', opacity: 1 },
          { transform: 'scale(0.9)', opacity: 1 },
          { transform: 'scale(1)', opacity: 1 }
        ], {
          duration: 600,
          easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }).onfinish = () => {
          targetEl.classList.add('tutorial-pulse-target');
        };
      } else {
        targetEl.classList.add('tutorial-pulse-target');
      }
    } else {
      stopParticleStream();
    }

    if (helpActivatedForTask) {
      try { setHelpActive(false); } catch {}
      helpActivatedForTask = false;
    }
  }

  function completeCurrentTask() {
    const goal = getCurrentGoal();
    if (!goal) return;

    tutorialState.taskIndex++;
    if (tutorialState.taskIndex >= goal.tasks.length) {
      applyGoalReward(goal).forEach(animateUnlock);
      tutorialState.goalIndex++;
      tutorialState.taskIndex = 0;
      hasDetectedLine = false;
    }

    renderGoalPanel();
    handleTaskEnter(getCurrentTask());
  }

  function maybeCompleteTask(requirement) {
    const task = getCurrentTask();
    if (task && task.requirement === requirement) {
      completeCurrentTask();
    }
  }

  function handleDrawgridUpdate(detail) {
    if (!tutorialActive || !tutorialState) return;
    const nodes = detail && detail.nodes;
    const hasNodes = Array.isArray(nodes) ? nodes.some(set => set && set.size > 0) : false;
    if (!hasDetectedLine && hasNodes) {
      hasDetectedLine = true;
      maybeCompleteTask('draw-line');
    }
  }

  function setupPanelListeners(panel) {
    if (!panel) return;
    addListener(panel, 'drawgrid:update', (e) => handleDrawgridUpdate(e.detail));
    addListener(panel, 'drawgrid:node-toggle', () => maybeCompleteTask('toggle-node'));
    const controlMap = getControlMap(panel);
    if (controlMap.clear) addListener(controlMap.clear, 'click', () => maybeCompleteTask('press-clear'));
    if (controlMap.random) addListener(controlMap.random, 'click', () => maybeCompleteTask('press-random'));
  }

  function spawnTutorialToy() {
    const factory = window && window.MusicToyFactory;
    const boardRect = board.getBoundingClientRect();
    const logicalWidth = board.offsetWidth || boardRect.width || window.innerWidth || 1280;
    const logicalHeight = board.offsetHeight || boardRect.height || window.innerHeight || 720;
    const centerX = logicalWidth / 2;
    const centerY = Math.min(logicalHeight / 2, logicalHeight - 240);

    let panel = null;
    tutorialFromFactory = false;

    if (factory && typeof factory.create === 'function') {
      try {
        panel = factory.create('drawgrid', { centerX, centerY, instrument: 'AcousticGuitar' });
        tutorialFromFactory = !!panel;
      } catch (err) {
        console.warn('[tutorial] factory create failed, falling back', err);
        panel = null;
        tutorialFromFactory = false;
      }
    }

    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'tutorial-drawgrid';
      panel.className = 'toy-panel';
      panel.dataset.toy = 'drawgrid';
      panel.dataset.instrument = 'AcousticGuitar';
      board.appendChild(panel);
      initToyUI(panel, { toyName: 'DrawGrid Tutorial' });
      createDrawGrid(panel, { toyId: panel.id });
      connectDrawGridToPlayer(panel);
      try { panel.dispatchEvent(new CustomEvent('toy-clear', { bubbles: true })); } catch {}
    }

    panel.classList.add('tutorial-panel');
    panel.dataset.tutorial = 'true';
    panel.style.zIndex = '60';

    lockTutorialControls(panel);
    setupPanelListeners(panel);

    requestAnimationFrame(() => {
      if (!panel.isConnected) return;
      const width = panel.offsetWidth || 0;
      const height = panel.offsetHeight || 0;
      const boardWidth = board.offsetWidth || boardRect.width || window.innerWidth || 1280;
      const boardHeight = board.offsetHeight || boardRect.height || window.innerHeight || 720;
      const left = Math.max(16, Math.round((boardWidth - width) / 2));
      const top = Math.max(72, Math.round(Math.min((boardHeight - height) / 2, boardHeight - height - 32)));
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
    });

    return panel;
  }

  function enterTutorial() {
    if (tutorialActive) return;
    tutorialActive = true;

    updateButtonVisual();

    if (!document.getElementById('tutorial-styles')) {
      const link = document.createElement('link');
      link.id = 'tutorial-styles';
      link.rel = 'stylesheet';
      link.href = 'src/tutorial.css';
      document.head.appendChild(link);
    }

    previousSnapshot = null;
    try { previousSnapshot = getSnapshot(); } catch {}
    storedScroll = { x: window.scrollX || 0, y: window.scrollY || 0 };
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    helpWasActiveBeforeTutorial = isHelpActive();
    if (helpWasActiveBeforeTutorial) {
      try { setHelpActive(false); } catch {}
    }

    setUpSpawnerControls();

    window.tutorialSpacebarDisabled = true;
    const playBtn = document.querySelector(CONTROL_SELECTORS.play);
    const transportWasRunning = typeof isRunning === 'function' ? isRunning() : false;
    if (transportWasRunning) {
      try { stopTransport(); } catch {}
    }
    if (playBtn) {
      if (playBtn.dataset.tutorialOrigDisplay === undefined) playBtn.dataset.tutorialOrigDisplay = playBtn.style.display || '';
      playBtn.style.display = 'none';
      playBtn.disabled = true;
      playBtn.classList.add('tutorial-hide-play-button');
      playBtn.classList.remove('tutorial-pulse-target');
      updatePlayButtonVisual(playBtn, false);
    }

    document.body.classList.add('tutorial-active');
    hideOriginalToys();
    tutorialToy = spawnTutorialToy();
    ensureGoalPanel();

    tutorialState = { goalIndex: 0, taskIndex: 0, unlockedRewards: new Set() };
    hasDetectedLine = false;

    const playBtnListener = document.querySelector(CONTROL_SELECTORS.play);
    if (playBtnListener) addListener(playBtnListener, 'click', () => maybeCompleteTask('press-play'));

    renderGoalPanel();
    handleTaskEnter(getCurrentTask());
  }

  function exitTutorial() {
    if (!tutorialActive) return;
    tutorialActive = false;

    updateButtonVisual();

    window.tutorialSpacebarDisabled = false;
    const playBtn = document.querySelector(CONTROL_SELECTORS.play);
    if (playBtn) {
      playBtn.disabled = false;
      playBtn.classList.remove('tutorial-hide-play-button');
      playBtn.classList.remove('tutorial-pulse-target');
      if (playBtn.dataset.tutorialOrigDisplay !== undefined) {
        playBtn.style.display = playBtn.dataset.tutorialOrigDisplay;
        delete playBtn.dataset.tutorialOrigDisplay;
      } else {
        playBtn.style.removeProperty('display');
      }
      updatePlayButtonVisual(playBtn, false);
    }

    if (helpWasActiveBeforeTutorial) {
      try { setHelpActive(true); } catch {}
    } else {
      try { setHelpActive(false); } catch {}
    }
    helpActivatedForTask = false;
    helpWasActiveBeforeTutorial = false;

    stopParticleStream();
    removeTutorialListeners();
    if (tutorialToy) tutorialToy.remove();
    teardownGoalPanel();
    showOriginalToys();
    document.body.classList.remove('tutorial-active');

    restoreSpawnerControls();

    if (previousSnapshot) {
      try { applySnapshot(previousSnapshot); } catch {}
    }
    window.scrollTo({ left: storedScroll.x, top: storedScroll.y, behavior: 'auto' });
    if (previousFocus) {
      try { previousFocus.focus({ preventScroll: true }); } catch {}
    }

    tutorialToy = null;
    tutorialFromFactory = false;
    tutorialState = null;
    previousSnapshot = null;
    previousFocus = null;
    hasDetectedLine = false;
  }

  tutorialButton.addEventListener('click', () => tutorialActive ? exitTutorial() : enterTutorial());
  updateButtonVisual();
})();




