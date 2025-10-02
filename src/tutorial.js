import { initToyUI } from './toyui.js';
import { createDrawGrid } from './drawgrid.js';
import { connectDrawGridToPlayer } from './drawgrid-player.js';
import { getSnapshot, applySnapshot } from './persistence.js';
import { setHelpActive, isHelpActive } from './help-overlay.js';

const GOAL_FLOW = [
  {
    id: 'draw-intro',
    title: 'Draw out a tune',
    reward: {
      description: 'Unlocks the Clear and Randomise buttons.',
      icons: [
        { type: 'asset', label: 'Clear', icon: "../assets/UI/T_ButtonClear.png" },
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
        if (!(el instanceof HTMLElement)) return;
        if (el.classList.contains('tutorial-control-locked')) return;
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
    if (!panel.__tutorialControlMap) {
      panel.__tutorialControlMap = {
        clear: panel.querySelector('[data-action="clear"]'),
        random: panel.querySelector('[data-action="random"]'),
        randomNotes: panel.querySelector('[data-action="random-notes"]'),
        randomBlocks: panel.querySelector('[data-action="random-cubes"]'),
        eraser: panel.querySelector('[data-erase]'),
      };
    }
    return panel.__tutorialControlMap;
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
        el.setAttribute('aria-disabled', 'false');
      }
      if (wasLocked) unlocked.push(el);
    });
    return unlocked;
  }

  function disconnectControlObserver(panel) {
    if (panel && panel.__tutorialLockObserver) {
      try { panel.__tutorialLockObserver.disconnect(); } catch {}
      panel.__tutorialLockObserver = null;
    }
  }

  function observeControlAdditions(panel) {
    if (!panel) return;
    disconnectControlObserver(panel);
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches('.toy-header button, .toy-header select, .toy-header .c-btn, .toy-mode-btn, .toy-chain-btn')) {
            if (!node.classList.contains('tutorial-control-locked')) {
              node.dataset.tutorialOrigDisplay = node.style.display || '';
              node.classList.add('tutorial-control-locked');
              if (node.matches('button, select')) {
                try { node.disabled = true; } catch {}
                node.setAttribute('aria-disabled', 'true');
              }
            }
          }
          if (typeof node.querySelectorAll === 'function') {
            node.querySelectorAll('button, select, .c-btn, .toy-mode-btn, .toy-chain-btn').forEach(child => {
              if (child === tutorialButton || child.dataset?.action === 'toggle-play') return;
              if (!child.classList.contains('tutorial-control-locked')) {
                child.dataset.tutorialOrigDisplay = child.style.display || '';
                child.classList.add('tutorial-control-locked');
                if (child.matches('button, select')) {
                  try { child.disabled = true; } catch {}
                  child.setAttribute('aria-disabled', 'true');
                }
              }
            });
          }
        });
      });
    });
    try {
      observer.observe(panel, { childList: true, subtree: true });
      panel.__tutorialLockObserver = observer;
    } catch {}
  }

  function buildGoalPanel() {
    const container = document.createElement('aside');
    container.id = 'tutorial-goals';
    container.className = 'tutorial-goals-panel';
    container.innerHTML = [
      '<header class="tutorial-goals-header">',
      '  <div class="tutorial-goals-eyebrow">Goal</div>',
      '  <h2 class="tutorial-goals-title"></h2>',
      '  <p class="tutorial-goals-caption"></p>',
      '</header>',
      '<section class="tutorial-goals-tasks">',
      '  <ol class="tutorial-goals-tasklist"></ol>',
      '</section>',
      '<section class="tutorial-goals-progress">',
      '  <div class="goal-progress-bar">',
      '    <div class="goal-progress-fill"></div>',
      '  </div>',
      '  <div class="goal-progress-summary"></div>',
      '</section>',
      '<footer class="tutorial-goals-reward">',
      '  <div class="goal-reward-label">Reward</div>',
      '  <p class="goal-reward-description"></p>',
      '  <div class="goal-reward-icons"></div>',
      '</footer>'
    ].join('');
    return container;
  }

  function ensureGoalPanel() {
    if (!goalPanel) goalPanel = buildGoalPanel();
    if (!goalPanel.isConnected) {
      document.body.appendChild(goalPanel);
    }
    requestAnimationFrame(() => {
      goalPanel.classList.add('is-visible');
    });
  }

  function teardownGoalPanel() {
    if (!goalPanel) return;
    goalPanel.classList.remove('is-visible');
    if (goalPanel.isConnected) {
      goalPanel.remove();
    }
  }

  function renderGoalPanel() {
    if (!goalPanel) return;
    const titleEl = goalPanel.querySelector('.tutorial-goals-title');
    const captionEl = goalPanel.querySelector('.tutorial-goals-caption');
    const listEl = goalPanel.querySelector('.tutorial-goals-tasklist');
    const progressFill = goalPanel.querySelector('.goal-progress-fill');
    const progressSummary = goalPanel.querySelector('.goal-progress-summary');
    const rewardDescription = goalPanel.querySelector('.goal-reward-description');
    const rewardIcons = goalPanel.querySelector('.goal-reward-icons');

    if (!tutorialState || tutorialState.goalIndex >= GOAL_FLOW.length) {
      titleEl.textContent = 'All goals complete';
      captionEl.textContent = 'Enjoy exploring the full drawgrid controls.';
      listEl.innerHTML = '';
      const completeItem = document.createElement('li');
      completeItem.className = 'goal-task is-complete';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'goal-task-label';
      labelSpan.textContent = "You've unlocked everything!";
      completeItem.appendChild(labelSpan);
      listEl.appendChild(completeItem);
      progressFill.style.width = '100%';
      progressSummary.textContent = 'All tasks complete';
      rewardDescription.textContent = 'All tutorial rewards unlocked.';
      rewardIcons.innerHTML = '';
      return;
    }

    const goal = GOAL_FLOW[tutorialState.goalIndex];
    const totalTasks = goal.tasks.length;
    const completedTasks = Math.min(tutorialState.taskIndex, totalTasks);
    const rewardUnlocked = tutorialState.unlockedRewards && tutorialState.unlockedRewards.has(goal.id);

    titleEl.textContent = goal.title;
    captionEl.textContent = goal.caption || 'Complete the tasks below to progress.';

    listEl.innerHTML = '';
    goal.tasks.forEach((task, index) => {
      const li = document.createElement('li');
      li.className = 'goal-task';
      if (index < completedTasks) {
        li.classList.add('is-complete');
      } else if (index === completedTasks) {
        li.classList.add('is-active');
      } else {
        li.classList.add('is-hidden');
      }

      const indexSpan = document.createElement('span');
      indexSpan.className = 'goal-task-index';
      indexSpan.textContent = String(index + 1);
      li.appendChild(indexSpan);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'goal-task-label';
      labelSpan.textContent = task.label;
      li.appendChild(labelSpan);

      if (index === completedTasks) {
        const status = document.createElement('span');
        status.className = 'goal-task-status';
        status.textContent = 'Current task';
        li.appendChild(status);
      }

      listEl.appendChild(li);
    });

    const progress = totalTasks ? Math.max(0, Math.min(100, (completedTasks / totalTasks) * 100)) : 0;
    progressFill.style.width = progress + '%';
    progressSummary.innerHTML = '<strong>' + completedTasks + ' / ' + totalTasks + '</strong> tasks complete';

    rewardDescription.textContent = goal.reward ? goal.reward.description : '';
    rewardIcons.innerHTML = '';
    if (goal.reward && Array.isArray(goal.reward.icons)) {
      goal.reward.icons.forEach(icon => {
        const wrapper = document.createElement('div');
        wrapper.className = 'goal-reward-icon';
        wrapper.dataset.goalId = goal.id;
        if (rewardUnlocked) wrapper.classList.add('is-unlocked');

        const btn = document.createElement('div');
        btn.className = 'c-btn';
        btn.style.setProperty('--c-btn-size', '56px');
        btn.style.pointerEvents = 'none';
        btn.innerHTML = '<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>';
        const core = btn.querySelector('.c-btn-core');
        core.setAttribute('role', 'img');
        if (icon.type === 'asset') {
          core.style.setProperty('--c-btn-icon-url', "url('" + icon.icon + "')");
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

  function unlockReward(goalId) {
    if (!tutorialState) return;
    if (!tutorialState.unlockedRewards) tutorialState.unlockedRewards = new Set();
    tutorialState.unlockedRewards.add(goalId);
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
      }
    });
  }

  function unlockSpawnerToggle() {
    const toggle = spawnerControls.toggle;
    if (!toggle) return null;
    const wasLocked = toggle.classList.contains('tutorial-locked-control');
    toggle.classList.remove('tutorial-locked-control');
    if (toggle.dataset.tutorialOrigDisplay !== undefined) {
      toggle.style.display = toggle.dataset.tutorialOrigDisplay;
      delete toggle.dataset.tutorialOrigDisplay;
    }
    return wasLocked ? toggle : null;
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

  function handleTaskEnter(task) {
    if (!task) return;
    if (task.showSwipePrompt) {
      helpWasActiveBeforeTutorial = isHelpActive();
      if (!helpWasActiveBeforeTutorial) {
        helpActivatedForTask = true;
        try { setHelpActive(true); } catch {}
      } else {
        helpActivatedForTask = false;
      }
    } else if (helpActivatedForTask) {
      try { setHelpActive(false); } catch {}
      helpActivatedForTask = false;
    }
  }

  function completeCurrentTask() {
    const goal = getCurrentGoal();
    const task = getCurrentTask();
    if (!goal || !task) {
      renderGoalPanel();
      return;
    }

    tutorialState.taskIndex += 1;

    if (tutorialState.taskIndex >= goal.tasks.length) {
      const newlyUnlocked = applyGoalReward(goal);
      newlyUnlocked.forEach(animateUnlock);

      tutorialState.goalIndex += 1;
      tutorialState.taskIndex = 0;
      hasDetectedLine = false;

      const nextGoal = getCurrentGoal();
      if (nextGoal) {
        handleTaskEnter(nextGoal.tasks[0] || null);
      } else if (helpActivatedForTask && !helpWasActiveBeforeTutorial) {
        try { setHelpActive(false); } catch {}
        helpActivatedForTask = false;
      }

      renderGoalPanel();
    } else {
      handleTaskEnter(getCurrentTask());
      renderGoalPanel();
    }
  }

  function maybeCompleteTask(requirement) {
    const task = getCurrentTask();
    if (!task || task.requirement !== requirement) return;
    completeCurrentTask();
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

  function handleNodeToggle() {
    if (!tutorialActive || !tutorialState) return;
    maybeCompleteTask('toggle-node');
  }

  function setupPanelListeners(panel) {
    if (!panel) return;
    const updateHandler = event => handleDrawgridUpdate(event.detail || {});
    addListener(panel, 'drawgrid:update', updateHandler);
    addListener(panel, 'drawgrid:node-toggle', handleNodeToggle);

    const map = getControlMap(panel);
    if (map.clear) {
      addListener(map.clear, 'click', () => maybeCompleteTask('press-clear'));
    }
    if (map.random) {
      addListener(map.random, 'click', () => maybeCompleteTask('press-random'));
    }
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
    observeControlAdditions(panel);
    getControlMap(panel);
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

  function initializeTutorialState() {
    tutorialState = {
      goalIndex: 0,
      taskIndex: 0,
      unlockedRewards: new Set(),
    };
    hasDetectedLine = false;
    renderGoalPanel();
    handleTaskEnter(getCurrentTask());
  }

  function cleanupPanel(panel) {
    if (!panel) return;
    disconnectControlObserver(panel);
    if (panel.__tutorialLockedControls) {
      panel.__tutorialLockedControls.forEach(el => {
        if (!el) return;
        el.classList.remove('tutorial-control-locked');
        if (el.dataset.tutorialOrigDisplay !== undefined) {
          el.style.display = el.dataset.tutorialOrigDisplay;
          delete el.dataset.tutorialOrigDisplay;
        }
        if (el.matches('button, select')) {
          el.disabled = false;
          el.removeAttribute('aria-disabled');
        }
      });
      panel.__tutorialLockedControls = null;
    }
  }

  function applyGoalReward(goal) {
    if (!goal) return [];
    const newlyUnlocked = [];
    if (goal.id === 'draw-intro' && tutorialToy) {
      newlyUnlocked.push(...unlockPanelControls(tutorialToy, ['clear', 'random']));
    }
    if (goal.id === 'clear-random') {
      const toggle = unlockSpawnerToggle();
      if (toggle) newlyUnlocked.push(toggle);
    }
    unlockReward(goal.id);
    return newlyUnlocked;
  }
  function enterTutorial() {
    if (tutorialActive) return;
    tutorialActive = true;

    updateButtonVisual();

    previousSnapshot = null;
    try {
      previousSnapshot = getSnapshot();
    } catch (err) {
      console.warn('[tutorial] snapshot capture failed', err);
    }

    storedScroll = { x: window.scrollX || 0, y: window.scrollY || 0 };
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    document.body.classList.add('tutorial-active');

    hideOriginalToys();
    setUpSpawnerControls();

    helpWasActiveBeforeTutorial = isHelpActive();

    tutorialToy = spawnTutorialToy();
    ensureGoalPanel();
    initializeTutorialState();

    if (tutorialToy) {
      tutorialToy.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function exitTutorial() {
    if (!tutorialActive) return;
    tutorialActive = false;

    updateButtonVisual();

    removeTutorialListeners();

    if (tutorialToy) {
      if (tutorialFromFactory && window && window.MusicToyFactory && typeof window.MusicToyFactory.destroy === 'function') {
        try {
          window.MusicToyFactory.destroy(tutorialToy);
        } catch (err) {
          console.warn('[tutorial] factory destroy failed', err);
          cleanupPanel(tutorialToy);
          tutorialToy.remove();
        }
      } else {
        cleanupPanel(tutorialToy);
        tutorialToy.remove();
      }
    }
    tutorialToy = null;
    tutorialFromFactory = false;

    restoreSpawnerControls();
    teardownGoalPanel();
    showOriginalToys();
    document.body.classList.remove('tutorial-active');

    if (!helpWasActiveBeforeTutorial && isHelpActive()) {
      try { setHelpActive(false); } catch {}
    }
    helpActivatedForTask = false;

    if (previousSnapshot) {
      try {
        applySnapshot(previousSnapshot);
      } catch (err) {
        console.warn('[tutorial] failed to restore scene', err);
      }
    }

    window.scrollTo({ left: storedScroll.x, top: storedScroll.y, behavior: 'auto' });

    if (previousFocus) {
      try {
        previousFocus.focus({ preventScroll: true });
      } catch {}
      previousFocus = null;
    }

    previousSnapshot = null;
    tutorialState = null;
    hasDetectedLine = false;
  }

  tutorialButton.addEventListener('click', () => {
    if (tutorialActive) exitTutorial();
    else enterTutorial();
  });

  updateButtonVisual();
})();
