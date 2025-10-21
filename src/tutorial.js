import { getSnapshot, applySnapshot } from './persistence.js';
import { setHelpActive, isHelpActive } from './help-overlay.js';
import { isRunning, stop as stopTransport } from './audio-core.js';
import { startParticleStream, stopParticleStream } from './tutorial-fx.js';

function whenSwipeAPIReady(panel, fn, tries=30){
  if (!panel) return;
  if (typeof panel.setSwipeVisible === 'function' && typeof panel.startGhostGuide === 'function'){
    try { fn(); } catch {}
    return;
  }
  if (tries <= 0) return;
  requestAnimationFrame(()=> whenSwipeAPIReady(panel, fn, tries-1));
}

const TUTORIAL_ZOOM = 1.15; // adjust to taste (1.0-1.3 are good)

const GOAL_FLOW = [
  {
    id: 'place-toy',
    title: 'Place a Toy',
    reward: {
      description: 'Collect your first star.',
      icons: [
        { type: 'symbol', label: 'Star Reward', symbol: '\u2605', accent: '#facc15' },
      ],
    },
    tasks: [
      {
        id: 'place-any-toy',
        label: 'Open the Add Toy menu and drag or tap to place any toy',
        requirement: 'place-any-toy',
      },
      {
        id: 'interact-new-toy',
        label: 'Interact with your new toy.',
        requirement: 'interact-any-toy',
      },
      {
        id: 'press-play',
        label: 'Press the Play button to start the toy.',
        requirement: 'press-play',
      },
    ],
  },
  {
    id: 'clear-random',
    title: 'Randomise and clear',
    reward: {
      description: 'Collect a gleaming star for exploring controls.',
      icons: [
        { type: 'symbol', label: 'Star Reward', symbol: '\u2605', accent: '#facc15' },
      ],
    },
    tasks: [
      {
        id: 'press-random',
        label: 'Press any Randomise button.',
        requirement: 'press-random',
      },
      {
        id: 'press-clear',
        label: 'Press any Clear button.',
        requirement: 'press-clear',
      },
    ],
  },
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
        id: 'add-draw-toy',
        label: 'Add a Draw Line Toy',
        requirement: 'add-toy-drawgrid',
      },
      {
        id: 'draw-line',
        label: 'Make a line on a draw line toy',
        requirement: 'draw-line',
        showSwipePrompt: true,
      },
      {
        id: 'press-play',
        label: 'Press the play button',
        requirement: 'press-play',
      },
      {
        id: 'toggle-node',
        label: 'Tap a note to mute or unmute it.',
        requirement: 'toggle-node',
      },
      {
        id: 'drag-note',
        label: 'Drag a note up or down.',
        requirement: 'drag-note',
      },
    ],
  },
  {
    id: 'add-toy',
    title: 'Add another toy',
    reward: {
      description: 'Unlocks the Help button',
      icons: [
        { type: 'symbol', label: 'Help', symbol: '?' },
      ],
    },
    tasks: [
      {
        id: 'add-rhythm-toy',
        label: 'Open the Add Toy menu and drag in a new Simple Rhythm toy',
        requirement: 'add-toy-loopgrid',
      },
      {
        id: 'add-rhythm-note',
        label: 'Add a rhythm to the new toy',
        requirement: 'add-note-new-toy',
      },
    ],
  },
  {
    id: 'get-help',
    title: 'Help!',
    reward: {
      description: 'Unlocks all buttons on toys, all toys in the Add Toy menu, and camera controls.',
      icons: [
        { type: 'symbol', label: 'Help', symbol: '?' }
      ],
    },
    tasks: [
      {
        id: 'press-help',
        label: 'Press the Help button.',
        requirement: 'press-help',
      },
    ],
  },
  {
    id: 'dummy-goal-1',
    title: 'Dummy Goal 1',
    reward: {
      description: 'This is a dummy reward.',
      icons: [
        { type: 'symbol', label: 'Dummy', symbol: 'D' },
      ],
    },
    tasks: [
      {
        id: 'dummy-task-1',
        label: 'Do a dummy task.',
        requirement: 'dummy-req-1',
      },
    ],
  },
  {
    id: 'dummy-goal-2',
    title: 'Dummy Goal 2',
    reward: {
      description: 'Another dummy reward.',
      icons: [
        { type: 'symbol', label: 'Dummy 2', symbol: 'D' },
      ],
    },
    tasks: [
      {
        id: 'dummy-task-2',
        label: 'Do another dummy task.',
        requirement: 'dummy-req-2',
      },
    ],
  },
  {
    id: 'dummy-goal-3',
    title: 'Dummy Goal 3',
    reward: {
      description: 'Yet another dummy reward.',
      icons: [
        { type: 'symbol', label: 'Dummy 3', symbol: 'D' },
      ],
    },
    tasks: [
      {
        id: 'dummy-task-3',
        label: 'Do yet another dummy task.',
        requirement: 'dummy-req-3',
      },
    ],
  },
];

const GOAL_BY_ID = new Map(GOAL_FLOW.map(goal => [goal.id, goal]));
const TASK_INFO_BY_ID = new Map();
const TASKS_BY_REQUIREMENT = new Map();

GOAL_FLOW.forEach((goal) => {
  const tasks = Array.isArray(goal.tasks) ? goal.tasks : [];
  tasks.forEach((task, index) => {
    if (!task) return;
    const taskId = task.id || `task-${index}`;
    TASK_INFO_BY_ID.set(taskId, { goalId: goal.id, taskIndex: index, requirement: task.requirement });
    if (!task.requirement) return;
    if (!TASKS_BY_REQUIREMENT.has(task.requirement)) TASKS_BY_REQUIREMENT.set(task.requirement, []);
    TASKS_BY_REQUIREMENT.get(task.requirement).push({ goalId: goal.id, taskId, taskIndex: index });
  });
});

const GUIDE_PROGRESS_STORAGE_KEY = 'music-toy-guide-progress.v1';

function createEmptyGuideProgress() {
  return {
    tasks: new Set(),
    goals: new Set(),
    claimedRewards: new Set(),
  };
}

function arrayToSet(value) {
  if (value instanceof Set) return value;
  if (!Array.isArray(value)) return new Set();
  return new Set(value);
}

function hasLocalStorage() {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function loadGuideProgress() {
  if (!hasLocalStorage()) return createEmptyGuideProgress();
  try {
    const raw = localStorage.getItem(GUIDE_PROGRESS_STORAGE_KEY);
    if (!raw) return createEmptyGuideProgress();
    const parsed = JSON.parse(raw);
    return {
      tasks: arrayToSet(parsed.tasks),
      goals: arrayToSet(parsed.goals),
      claimedRewards: arrayToSet(parsed.claimedRewards),
    };
  } catch {
    return createEmptyGuideProgress();
  }
}

const guideProgress = loadGuideProgress();
const requirementCompletionState = new Map();
const drawToyPanels = new Set();
const drawToyLineState = new Map();
let lastPlacedToy = null;

function saveGuideProgress() {
  if (!hasLocalStorage()) return;
  try {
    const payload = {
      tasks: Array.from(guideProgress.tasks),
      goals: Array.from(guideProgress.goals),
      claimedRewards: Array.from(guideProgress.claimedRewards),
    };
    localStorage.setItem(GUIDE_PROGRESS_STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

function getGuideProgressSnapshot() {
  return {
    completedTasks: Array.from(guideProgress.tasks),
    completedGoals: Array.from(guideProgress.goals),
    claimedRewards: Array.from(guideProgress.claimedRewards),
  };
}

function dispatchGuideProgressUpdate(source) {
  try {
    const detail = { source, progress: getGuideProgressSnapshot() };
    window.dispatchEvent(new CustomEvent('guide:progress-update', { detail }));
  } catch {}
}

function markGuideTaskComplete(goalId, taskId) {
  if (!goalId || !taskId) return false;
  const beforeSize = guideProgress.tasks.size;
  guideProgress.tasks.add(taskId);
  const goal = GOAL_BY_ID.get(goalId);
  let goalUpdated = false;
  if (goal) {
    const tasks = Array.isArray(goal.tasks) ? goal.tasks : [];
    const allComplete = tasks.every(task => !task?.id || guideProgress.tasks.has(task.id));
    if (allComplete) {
      if (!guideProgress.goals.has(goalId)) goalUpdated = true;
      guideProgress.goals.add(goalId);
    }
  }
  if (guideProgress.tasks.size !== beforeSize || goalUpdated) {
    saveGuideProgress();
    dispatchGuideProgressUpdate({ goalId, taskId, via: 'markGuideTaskComplete' });
    return true;
  }
  return false;
}

function markGuideTaskIncomplete(goalId, taskId) {
  if (!goalId || !taskId) return false;
  const hadTask = guideProgress.tasks.delete(taskId);
  let goalChanged = false;
  const goal = GOAL_BY_ID.get(goalId);
  if (goal) {
    const tasks = Array.isArray(goal.tasks) ? goal.tasks : [];
    const stillComplete = tasks.every(task => !task?.id || guideProgress.tasks.has(task.id));
    if (!stillComplete && guideProgress.goals.has(goalId)) {
      guideProgress.goals.delete(goalId);
      goalChanged = true;
    }
  }
  if (hadTask || goalChanged) {
    saveGuideProgress();
    dispatchGuideProgressUpdate({ goalId, taskId, via: 'markGuideTaskIncomplete' });
    return true;
  }
  return false;
}

function markGuideRewardClaimed(goalId) {
  if (!goalId) return false;
  if (!guideProgress.goals.has(goalId)) return false;
  const prior = guideProgress.claimedRewards.size;
  guideProgress.claimedRewards.add(goalId);
  if (guideProgress.claimedRewards.size !== prior) {
    saveGuideProgress();
    dispatchGuideProgressUpdate({ goalId, via: 'markGuideRewardClaimed' });
    return true;
  }
  return false;
}

function claimGuideReward(goalId) {
  return markGuideRewardClaimed(goalId);
}

function resetGuideProgress() {
  guideProgress.tasks.clear();
  guideProgress.goals.clear();
  guideProgress.claimedRewards.clear();
  lastPlacedToy = null;
  requirementCompletionState.clear();
  drawToyPanels.clear();
  drawToyLineState.clear();
  saveGuideProgress();
  dispatchGuideProgressUpdate({ via: 'resetGuideProgress' });
}

function recordRequirementProgress(requirement, shouldComplete = true) {
  if (!requirement) return { updated: false, blocked: false };
  const entries = TASKS_BY_REQUIREMENT.get(requirement);
  if (!entries || !entries.length) return { updated: false, blocked: false };
  let changed = false;
  let blocked = false;
  let attemptedCompletion = false;
  const goalsTouched = new Set();
  entries.forEach(({ goalId, taskId, taskIndex }) => {
    goalsTouched.add(goalId);
    if (shouldComplete) {
      const goal = GOAL_BY_ID.get(goalId);
      if (goal) {
        const tasks = Array.isArray(goal.tasks) ? goal.tasks : [];
        let index = Number.isFinite(taskIndex) ? taskIndex : tasks.findIndex((task, idx) => (task?.id || `task-${idx}`) === taskId);
        if (index < 0) {
          index = tasks.findIndex((task, idx) => (task?.id || `task-${idx}`) === taskId);
        }
        if (index >= 0) {
          let prerequisitesComplete = true;
          for (let i = 0; i < index; i++) {
            const prevTask = tasks[i];
            const prevId = prevTask?.id || `task-${i}`;
            if (prevId && !guideProgress.tasks.has(prevId)) {
              prerequisitesComplete = false;
              break;
            }
          }
          if (!prerequisitesComplete) {
            blocked = true;
            return;
          }
        }
      }
      attemptedCompletion = true;
      const didUpdate = markGuideTaskComplete(goalId, taskId);
      if (didUpdate) changed = true;
    } else {
      const didUpdate = markGuideTaskIncomplete(goalId, taskId);
      if (didUpdate) changed = true;
    }
  });
  if (!shouldComplete) {
    return { updated: changed, blocked: false };
  }
  const blockedWithoutAttempt = blocked && !attemptedCompletion;
  if (changed) return { updated: true, blocked: blockedWithoutAttempt };
  // Even if no individual task was new, a previously incomplete goal might flip to complete
  let goalChanged = false;
  goalsTouched.forEach((goalId) => {
    const goal = GOAL_BY_ID.get(goalId);
    if (!goal) return;
    const tasks = Array.isArray(goal.tasks) ? goal.tasks : [];
    const allComplete = tasks.every(task => !task?.id || guideProgress.tasks.has(task.id));
    if (allComplete && !guideProgress.goals.has(goalId)) {
      guideProgress.goals.add(goalId);
      goalChanged = true;
    }
  });
  if (goalChanged) {
    saveGuideProgress();
    dispatchGuideProgressUpdate({ requirement, via: 'recordRequirementProgress' });
    return { updated: true, blocked: blockedWithoutAttempt };
  }
  // If we attempted to record but prerequisites prevented it, surface blocked state
  if (!changed && !goalChanged && blockedWithoutAttempt) {
    return { updated: false, blocked: true };
  }
  return { updated: false, blocked: blockedWithoutAttempt };
}

function cloneGoal(goal) {
  if (!goal) return null;
  try {
    return JSON.parse(JSON.stringify(goal));
  } catch {
    return null;
  }
}



(function() {
  console.log('[tutorial] script boot', { readyState: document.readyState });
  function exposeGoalsAPI(){
    try {
      if (!window.TutorialGoalsAPI) {
        const api = {
          getGoals: () => GOAL_FLOW.map(cloneGoal).filter(Boolean),
          getGoalById: (id) => cloneGoal(GOAL_FLOW.find(goal => goal.id === id)),
          createPanel: () => buildGoalPanel(),
          populatePanel: (panel, goal, options) => populateGoalPanel(panel, goal, options),
          getGuideProgress: () => getGuideProgressSnapshot(),
          claimReward: (goalId) => claimGuideReward(goalId),
        };
        window.TutorialGoalsAPI = Object.freeze(api);
        window.dispatchEvent(new CustomEvent('tutorial:goals-ready', { detail: api }));
      }
    } catch (err) {
      console.warn('[tutorial] expose goal API failed', err);
    }
  }

  exposeGoalsAPI();

  const tutorialButton = document.querySelector('[data-action="tutorial"]');
  const board = document.getElementById('board');
  console.log('[tutorial] element probe', { hasTutorialButton: !!tutorialButton, hasBoard: !!board, readyState: document.readyState });
  if (!board) return;

  let tutorialActive = false;
  let autoToyIgnoreCount = 0;
  let autoToyIgnoreDeadline = 0;

  const guideToyTracker = (() => {
    let seenToyPanels = new WeakSet();
    const seedExistingPanels = () => {
      board.querySelectorAll('.toy-panel').forEach((panel) => {
        if (panel instanceof HTMLElement) {
          seenToyPanels.add(panel);
        }
      });
    };
    seedExistingPanels();

    const handlePanel = (panel) => {
      if (!(panel instanceof HTMLElement)) return;
      if (!panel.classList.contains('toy-panel')) return;
      if (tutorialActive) return;
      const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      if (autoToyIgnoreCount > 0) {
        if (now <= autoToyIgnoreDeadline) {
          autoToyIgnoreCount--;
          seenToyPanels.add(panel);
          return;
        }
        autoToyIgnoreCount = 0;
      }
      if (panel.dataset?.tutorial === 'true') {
        seenToyPanels.add(panel);
        return;
      }
      if (seenToyPanels.has(panel)) return;
      seenToyPanels.add(panel);
      registerToyInteraction(panel);
      maybeCompleteTask('place-any-toy');
      const toyType = panel.dataset?.toy;
      if (toyType === 'drawgrid') {
        maybeCompleteTask('add-toy-drawgrid');
      } else if (toyType === 'loopgrid') {
        maybeCompleteTask('add-toy-loopgrid');
      }
    };

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            if (node.classList.contains('toy-panel')) handlePanel(node);
            node.querySelectorAll?.('.toy-panel').forEach(handlePanel);
          }
        });
      });
    });

    observer.observe(board, { childList: true, subtree: true });
    return {
      disconnect: () => observer.disconnect(),
      reset: () => {
        seenToyPanels = new WeakSet();
        seedExistingPanels();
      },
    };
  })();

  let tutorialToy = null;
  let goalPanel = null;
  let previousSnapshot = null;
  let previousFocus = null;
  let storedScroll = { x: 0, y: 0 };
  let helpWasActiveBeforeTutorial = false;
  let helpActivatedForTask = false;
  let tutorialListeners = [];
  let hasDetectedLine = false;
  let spawnerControls = {};
  const tempSpawnerUnlocks = new Set();
  let tutorialState = null;
  let claimButton = null;
  let guideHighlightCleanup = null;

  function hasAnyDrawToyWithLine() {
    for (const value of drawToyLineState.values()) {
      if (value) return true;
    }
    return false;
  }

  function panelHasDrawLine(panel) {
    if (!(panel instanceof HTMLElement)) return false;
    try {
      if (panel.__drawToy && typeof panel.__drawToy.hasActiveNotes === 'function') {
        return !!panel.__drawToy.hasActiveNotes();
      }
      if (panel.__drawToy && typeof panel.__drawToy.getState === 'function') {
        const state = panel.__drawToy.getState();
        const nodes = state?.nodes?.list;
        if (Array.isArray(nodes)) {
          return nodes.some(col => Array.isArray(col) && col.length > 0);
        }
      }
    } catch {}
    return false;
  }

  function refreshDrawToyRequirement() {
    const hasDrawToy = drawToyPanels.size > 0;
    if (hasDrawToy) {
      maybeCompleteTask('add-toy-drawgrid');
    } else {
      setRequirementProgress('add-toy-drawgrid', false);
    }
  }

  function refreshDrawLineRequirement() {
    const hasLine = hasAnyDrawToyWithLine();
    if (hasLine) {
      hasDetectedLine = true;
      maybeCompleteTask('draw-line');
    } else {
      hasDetectedLine = false;
      setRequirementProgress('draw-line', false);
    }
  }

  function syncTutorialProgressForGoal(goalId) {
    if (!goalId || !tutorialActive || !tutorialState) return;
    const currentGoal = getCurrentGoal();
    if (!currentGoal || currentGoal.id !== goalId) return;
    const tasks = Array.isArray(currentGoal.tasks) ? currentGoal.tasks : [];
    let nextIndex = tasks.length;
    for (let i = 0; i < tasks.length; i++) {
      const taskId = tasks[i]?.id;
      if (taskId && !guideProgress.tasks.has(taskId)) {
        nextIndex = i;
        break;
      }
    }
    if (nextIndex >= tasks.length) {
      tutorialState.taskIndex = tasks.length;
      return;
    }
    const prevIndex = tutorialState.taskIndex;
    const prevPending = tutorialState.pendingRewardGoalId;
    tutorialState.pendingRewardGoalId = null;
    tutorialState.taskIndex = nextIndex;
    if (prevIndex !== nextIndex || prevPending) {
      renderGoalPanel();
      const nextTask = getCurrentTask();
      if (nextTask) handleTaskEnter(nextTask);
    }
  }

  function setRequirementProgress(requirement, shouldComplete) {
    if (!requirement) return false;
    requirementCompletionState.set(requirement, shouldComplete);
    const { updated, blocked } = recordRequirementProgress(requirement, shouldComplete);
    if (shouldComplete && blocked && !updated) {
      requirementCompletionState.set(requirement, false);
    }
    if (!shouldComplete) {
      const entries = TASKS_BY_REQUIREMENT.get(requirement) || [];
      const goals = new Set(entries.map(entry => entry.goalId).filter(Boolean));
      goals.forEach(syncTutorialProgressForGoal);
    }
    return updated;
  }

  const debugTutorial = (...args) => {
    if (typeof window === 'undefined' || !window.DEBUG_TUTORIAL_LOCKS) return;
    try { console.debug('[tutorial]', ...args); } catch (_) { try { console.log('[tutorial]', ...args); } catch {} }
  };

  function registerToyInteraction(panel) {
    if (!(panel instanceof HTMLElement)) return;
    if (lastPlacedToy && lastPlacedToy !== panel) {
      lastPlacedToy.classList.remove('tutorial-pulse-target', 'tutorial-active-pulse', 'tutorial-addtoy-pulse');
    }
    lastPlacedToy = panel;
    if (panel.__tutorialInteractionHooked) return;

    const toyType = (panel.dataset?.toy || '').toLowerCase();
    const markInteraction = () => maybeCompleteTask('interact-any-toy');

    const add = (evt, handler, opts) => {
      try { panel.addEventListener(evt, handler, opts); } catch { panel.addEventListener(evt, handler); }
    };

    if (toyType === 'drawgrid') {
      drawToyPanels.add(panel);
      refreshDrawToyRequirement();
      const computePanelHasLine = () => panelHasDrawLine(panel);

      drawToyLineState.set(panel, computePanelHasLine());
      refreshDrawLineRequirement();

      const handleDrawUpdate = (nodes) => {
        const hasNodes = Array.isArray(nodes) ? nodes.some(set => set && set.size > 0) : false;
        drawToyLineState.set(panel, hasNodes);
        refreshDrawLineRequirement();
        if (hasNodes) markInteraction();
      };

      add('drawgrid:ready', () => {
        drawToyLineState.set(panel, computePanelHasLine());
        refreshDrawLineRequirement();
      }, { once: true, passive: true });

      add('drawgrid:update', (e) => {
        handleDrawUpdate(e?.detail?.nodes);
      }, { passive: true });
      add('drawgrid:node-toggle', () => {
        maybeCompleteTask('toggle-node');
        markInteraction();
      }, { passive: true });
      add('drawgrid:node-drag', () => {
        maybeCompleteTask('drag-note');
        markInteraction();
      }, { passive: true });
      add('toy-remove', () => {
        drawToyPanels.delete(panel);
        drawToyLineState.delete(panel);
        refreshDrawToyRequirement();
        refreshDrawLineRequirement();
      }, { once: true });
    } else if (toyType === 'loopgrid' || toyType === 'loopgrid-drum') {
      const manualEvents = ['grid:notechange', 'grid:drum-tap', 'loopgrid:tap'];
      manualEvents.forEach(evt => {
        add(evt, () => markInteraction(), { passive: true });
      });
      const randomEvents = ['toy-random', 'toy-random-notes', 'toy-random-cubes', 'toy-random-blocks', 'loopgrid:random'];
      randomEvents.forEach(evt => {
        add(evt, () => markInteraction(), { passive: true });
      });
      add('loopgrid:update', (event) => {
        const reason = event?.detail?.reason;
        if (reason === 'step-toggle' || reason === 'note-change') {
          markInteraction();
        }
      }, { passive: true });
    } else if (toyType === 'bouncer') {
      const canvas = panel.querySelector('.bouncer-canvas, canvas');
      if (canvas) {
        const pointerHandler = () => markInteraction();
        try { canvas.addEventListener('pointerup', pointerHandler, { once: true }); } catch { canvas.addEventListener('pointerup', pointerHandler, { once: true }); }
      } else {
        try { panel.addEventListener('pointerup', () => markInteraction(), { once: true }); } catch { panel.addEventListener('pointerup', () => markInteraction(), { once: true }); }
      }
    } else if (toyType === 'rippler') {
      const canvas = panel.querySelector('.rippler-canvas, canvas');
      if (canvas) {
        const pointerHandler = () => markInteraction();
        try { canvas.addEventListener('pointerup', pointerHandler, { once: true }); } catch { canvas.addEventListener('pointerup', pointerHandler, { once: true }); }
      } else {
        try { panel.addEventListener('pointerup', () => markInteraction(), { once: true }); } catch { panel.addEventListener('pointerup', () => markInteraction(), { once: true }); }
      }
    } else {
      const pointerHandler = () => markInteraction();
      try { panel.addEventListener('pointerup', pointerHandler, { once: true }); } catch { panel.addEventListener('pointerup', pointerHandler, { once: true }); }
    }

    panel.__tutorialInteractionHooked = true;
  }

  const describeElement = (el) => {
    if (!(el instanceof HTMLElement)) return String(el);
    const parts = [el.tagName.toLowerCase()];
    if (el.id) parts.push('#' + el.id);
    if (el.classList?.length) parts.push('.' + Array.from(el.classList).join('.'));
    if (el.dataset?.action) parts.push(`[data-action="${el.dataset.action}"]`);
    return parts.join('');
  };

  const CONTROL_SELECTORS = {
    clear: '[data-action="clear"]',
    random: '[data-action="random"]',
    play: '#topbar [data-action="toggle-play"]',
    instrument: '.toy-inst-btn, select.toy-instrument, [data-action="instrument"]',
    help: '.toy-spawner-help',
  };

  const TASK_TARGETS = {
    'press-play': 'play',
    'press-clear': 'clear',
    'press-random': 'random',
    'press-help': 'help',
  };
  function updatePlayButtonVisual(btn, playing) {
    if (!btn) return;
    const core = btn.querySelector('.c-btn-core');
    const url = playing ? "url('../assets/UI/T_ButtonPause.png')" : "url('../assets/UI/T_ButtonPlay.png')";
    if (core) core.style.setProperty('--c-btn-icon-url', url);
    else btn.textContent = playing ? 'Pause' : 'Play';
    btn.title = playing ? 'Pause' : 'Play';
  }

  const defaultLabel = tutorialButton ? (tutorialButton.textContent?.trim() || 'Tutorial') : 'Tutorial';

  function updateButtonVisual() {
    if (!tutorialButton) return;
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
    tutorialListeners.forEach((listener) => {
      if (listener.disconnect) {
        try { listener.disconnect(); } catch {}
      } else {
        const { target, type, handler, options } = listener;
        try { target.removeEventListener(type, handler, options); } catch {}
      }
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

  function isGoalPanelVisible() {
    if (!goalPanel || !goalPanel.isConnected) return false;
    if (goalPanel.getClientRects().length === 0) return false;
    try {
      const style = window.getComputedStyle(goalPanel);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    } catch {}
    return true;
  }

  function frameTutorialPanels(panels, options = {}) {
    const board = document.getElementById('board');
    if (!board) return null;
    const input = Array.isArray(panels) ? panels : [panels];
    const filtered = input.filter(panel => panel && panel instanceof HTMLElement && panel.isConnected && board.contains(panel));
    const unique = Array.from(new Set(filtered));
    if (!unique.length) return null;

    const padding = Number.isFinite(options.padding) ? Math.max(0, options.padding) : 160;
    const currentScale = Number(window.__boardScale) || 1;
    const boardRect = board.getBoundingClientRect();
    const boardWidth = Math.max(1, board.offsetWidth || (boardRect.width && currentScale ? boardRect.width / currentScale : 0) || 1);
    const boardHeight = Math.max(1, board.offsetHeight || (boardRect.height && currentScale ? boardRect.height / currentScale : 0) || 1);

    let minLeft = Infinity;
    let maxRight = -Infinity;
    let minTop = Infinity;
    let maxBottom = -Infinity;
    for (const panel of unique) {
      const rect = panel.getBoundingClientRect();
      const left = (rect.left - boardRect.left) / currentScale;
      const right = (rect.right - boardRect.left) / currentScale;
      const top = (rect.top - boardRect.top) / currentScale;
      const bottom = (rect.bottom - boardRect.top) / currentScale;
      if (![left, right, top, bottom].every(Number.isFinite)) continue;
      if (left < minLeft) minLeft = left;
      if (right > maxRight) maxRight = right;
      if (top < minTop) minTop = top;
      if (bottom > maxBottom) maxBottom = bottom;
    }
    if (!Number.isFinite(minLeft) || !Number.isFinite(maxRight) || !Number.isFinite(minTop) || !Number.isFinite(maxBottom)) {
      return null;
    }

    const bboxWidth = Math.max(1, maxRight - minLeft);
    const bboxHeight = Math.max(1, maxBottom - minTop);

    const viewportWidth = window.visualViewport?.width ?? window.innerWidth ?? 1280;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight ?? 720;

    const leftBound = Math.max(24, Math.min(padding, 120));
    const topBound = Math.max(24, Math.min(padding, 120));
    let usableWidth = Math.max(240, viewportWidth - leftBound * 2);
    let usableHeight = Math.max(240, viewportHeight - topBound * 2);

    let targetScale = Math.min(usableWidth / bboxWidth, usableHeight / bboxHeight);
    targetScale = Math.max(0.5, Math.min(2.5, targetScale));

    if (isGoalPanelVisible()) {
      try {
        const goalRect = goalPanel.getBoundingClientRect();
        if (Number.isFinite(goalRect.left)) {
          const goalSafeLeft = goalRect.left - Math.max(24, Math.min(padding, 120));
          const safeWidth = goalSafeLeft - leftBound;
          if (safeWidth > 0) {
            const maxScaleForGoal = safeWidth / bboxWidth;
            if (Number.isFinite(maxScaleForGoal) && maxScaleForGoal > 0) {
              targetScale = Math.min(targetScale, Math.max(0.5, Math.min(2.5, maxScaleForGoal)));
            }
            usableWidth = Math.max(240, safeWidth);
          }
        }
      } catch {}
    }

    if (options.limitToCurrentScale !== false && targetScale > currentScale) {
      targetScale = currentScale;
    }
    if (Number.isFinite(options.desiredScale)) {
      const desired = Math.max(0.5, Math.min(2.5, options.desiredScale));
      if (options.limitToCurrentScale === false && desired > targetScale) {
        targetScale = Math.min(desired, Math.max(0.5, Math.min(2.5, usableWidth / bboxWidth)));
      } else {
        targetScale = Math.min(targetScale, desired);
      }
    }
    targetScale = Math.max(0.5, Math.min(2.5, targetScale));

    const centerX = minLeft + bboxWidth / 2;
    const centerY = minTop + bboxHeight / 2;
    const centerXFromCenter = centerX - boardWidth / 2;
    const centerYFromCenter = centerY - boardHeight / 2;
    const safeCenterX = leftBound + usableWidth / 2;
    const safeCenterY = topBound + usableHeight / 2;

    let targetX = Math.round(safeCenterX - targetScale * centerXFromCenter);
    let targetY = Math.round(safeCenterY - targetScale * centerYFromCenter);

    const originX = boardWidth / 2;
    let rightBound = viewportWidth - leftBound;
    if (isGoalPanelVisible()) {
      try {
        const goalRect = goalPanel.getBoundingClientRect();
        if (Number.isFinite(goalRect.left)) {
          rightBound = Math.max(leftBound + 1, goalRect.left - leftBound);
        }
      } catch {}
    }
    const minX = leftBound - (minLeft - originX) * targetScale - originX;
    const maxX = rightBound - (maxRight - originX) * targetScale - originX;
    if (Number.isFinite(minX) && targetX < minX) targetX = minX;
    if (Number.isFinite(maxX) && targetX > maxX) targetX = maxX;

    const originY = boardHeight / 2;
    const bottomBound = viewportHeight - topBound;
    const minY = topBound - (minTop - originY) * targetScale - originY;
    const maxY = bottomBound - (maxBottom - originY) * targetScale - originY;
    if (Number.isFinite(minY) && targetY < minY) targetY = minY;
    if (Number.isFinite(maxY) && targetY > maxY) targetY = maxY;

    const prevLock = window.__tutorialZoomLock;
    window.__tutorialZoomLock = false;
    try {
      if (typeof window.setBoardScale === 'function') {
        window.setBoardScale(targetScale);
      } else {
        window.__boardScale = targetScale;
      }
      if (typeof window.panTo === 'function') {
        window.panTo(targetX, targetY);
      } else {
        board.style.transformOrigin = '50% 50%';
        board.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) scale(${targetScale})`;
        window.__boardX = targetX;
        window.__boardY = targetY;
      }
    } finally {
      window.__tutorialZoomLock = prevLock;
    }
    window.__boardScale = targetScale;
    window.__boardX = targetX;
    window.__boardY = targetY;
    return { scale: targetScale, x: targetX, y: targetY };
  }

  function hasActiveLoopgrid(panel) {
    if (!panel) return false;
    const state = panel.__gridState;
    if (state?.steps && state.steps.some(Boolean)) return true;
    const activeCell = panel.querySelector('.sequencer-wrap .is-on, .sequencer-wrap .is-active, .sequencer-wrap .active, .sequencer-wrap .enabled, .node.active, .node.on, .node.is-active, .grid-cube.is-on, .grid-cube.active');
    return !!activeCell;
  }

  function isPanelInViewport(panel, margin = 24) {
    if (!panel?.isConnected) return false;
    const rect = panel.getBoundingClientRect();
    if (!rect || rect.width < 2 || rect.height < 2) return false;
    const vw = window.visualViewport?.width ?? window.innerWidth ?? 0;
    const vh = window.visualViewport?.height ?? window.innerHeight ?? 0;
    if (vw <= 0 || vh <= 0) return true;
    return rect.right > margin && rect.bottom > margin && rect.left < vw - margin && rect.top < vh - margin;
  }

  function withZoomUnlock(fn) {
    const prev = window.__tutorialZoomLock;
    window.__tutorialZoomLock = false;
    try {
      return fn();
    } finally {
      window.__tutorialZoomLock = prev;
    }
  }

  function captureBoardViewport() {
    const scale = Number(window.__boardScale);
    const x = Number(window.__boardX);
    const y = Number(window.__boardY);
    return {
      scale: Number.isFinite(scale) ? scale : 1,
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
    };
  }

  function applyBoardViewport(view) {
    if (!view) return;
    const board = document.getElementById('board');
    const targetScale = Math.max(0.5, Math.min(2.5, Number(view.scale) || 1));
    const targetX = Number.isFinite(view.x) ? view.x : 0;
    const targetY = Number.isFinite(view.y) ? view.y : 0;
    withZoomUnlock(() => {
      if (typeof window.setBoardScale === 'function') {
        window.setBoardScale(targetScale);
      } else if (board) {
        board.style.transformOrigin = '50% 50%';
        board.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) scale(${targetScale})`;
      }
      if (typeof window.panTo === 'function') {
        window.panTo(targetX, targetY);
      } else if (board) {
        board.style.transformOrigin = '50% 50%';
        board.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) scale(${targetScale})`;
      }
      window.__boardScale = targetScale;
      window.__boardX = targetX;
      window.__boardY = targetY;
    });
  }

  function resetBoardViewport() {
    try {
      localStorage.setItem('boardViewport', JSON.stringify({ scale: 1, x: 0, y: 0 }));
      if (typeof window.setBoardScale === 'function') window.setBoardScale(1);
      if (typeof window.panTo === 'function') window.panTo(0, 0);
    } catch {}
  }

  function ensurePanelsVisible(panels, attempts) {
    const arr = (Array.isArray(panels) ? panels : [panels]).filter(panel => panel && panel.isConnected);
    if (!arr.length) return false;
    const originalViewport = captureBoardViewport();

    const ops = Array.isArray(attempts) && attempts.length ? attempts : [
      () => withZoomUnlock(() => frameTutorialPanels(arr, { limitToCurrentScale: true })),
      () => withZoomUnlock(() => frameTutorialPanels(arr, { limitToCurrentScale: false })),
      () => {
        if (arr[1] && typeof window.centerBoardOnElement === 'function') {
          withZoomUnlock(() => window.centerBoardOnElement(arr[1], TUTORIAL_ZOOM));
        }
      },
      () => {
        if (typeof window.centerBoardOnElement === 'function') {
          withZoomUnlock(() => window.centerBoardOnElement(arr[0], TUTORIAL_ZOOM));
        }
      },
    ];

    for (const attempt of ops) {
      const snapshot = captureBoardViewport();
      try {
        attempt?.();
      } catch (err) {
        console.warn('[tutorial] frame attempt failed', err);
      }
      ensurePanelsClearGoal(arr);
      if (arr.every(panel => isPanelInViewport(panel))) {
        return true;
      }
      applyBoardViewport(snapshot);
    }

    applyBoardViewport(originalViewport);
    return arr.every(panel => isPanelInViewport(panel));
  }

  function ensurePanelsClearGoal(panels, margin = 24) {
    if (!isGoalPanelVisible() || typeof window.panTo !== 'function') return;
    const arr = Array.isArray(panels) ? panels : [panels];
    const candidates = arr.filter(panel => panel?.isConnected);
    if (candidates.length < 2) return;
    const goalRect = goalPanel.getBoundingClientRect();
    if (!goalRect || !Number.isFinite(goalRect.left)) return;
    const limit = goalRect.left - margin;
    const currentX = Number(window.__boardX) || 0;
    const currentY = Number(window.__boardY) || 0;
    let maxOverlap = 0;
    candidates.forEach(panel => {
      if (!panel?.isConnected) return;
      const rect = panel.getBoundingClientRect();
      if (!rect) return;
      const overlap = rect.right - limit;
      if (overlap > maxOverlap) maxOverlap = overlap;
    });
    if (maxOverlap > 1) {
      const newX = Math.round(currentX - maxOverlap);
      window.panTo(newX, currentY);
      window.__boardX = newX;
      window.__boardY = currentY;
    }
  }

  function lockTutorialControls(panel) {
    if (!panel) return;
    debugTutorial('lockTutorialControls:start', describeElement(panel));
    panel.querySelectorAll('.toy-mode-btn, .toy-chain-btn').forEach(btn => {
      debugTutorial('remove-existing-mode-control', describeElement(btn));
      btn.remove();
    });
    const header = panel.querySelector('.toy-header');
    if (!header) {
      debugTutorial('lockTutorialControls:no-header', describeElement(panel));
      if (!panel.__tutorialHeaderWaiter) {
        const observer = new MutationObserver(() => {
          const headerNow = panel.querySelector('.toy-header');
          if (headerNow) {
            try { observer.disconnect(); } catch {}
            panel.__tutorialHeaderWaiter = null;
            lockTutorialControls(panel);
          }
        });
        observer.observe(panel, { childList: true, subtree: true });
        panel.__tutorialHeaderWaiter = observer;
      }
      return;
    }
    const locked = panel.__tutorialLockedControls || [];

    const lockElement = (el) => {
      if (!(el instanceof HTMLElement) || el.classList.contains('tutorial-control-locked')) return;
      if (tutorialState?.unlockedRewards?.has?.('add-toy') && el.matches('.toy-inst-btn, select.toy-instrument, [data-action="instrument"]')) {
        return;
      }
      el.classList.add('tutorial-control-locked');
      if (el.matches('button, select')) {
        if (el.dataset.tutorialWasDisabled === undefined) {
          el.dataset.tutorialWasDisabled = el.disabled ? '1' : '0';
        }
        try { el.disabled = true; } catch {}
        el.setAttribute('aria-disabled', 'true');
      }
      if (el.dataset.tutorialOrigDisplay === undefined) {
        el.dataset.tutorialOrigDisplay = el.style.display || '';
      }
      if (el.matches('.toy-inst-btn, select.toy-instrument, [data-action="instrument"]')) {
        el.classList.add('tutorial-instrument-hidden');
        el.setAttribute('aria-hidden', 'true');
      }
      debugTutorial('lock', describeElement(el));
      if (!locked.includes(el)) locked.push(el);
    };

    const lockInstrumentElements = (node) => {
      if (!node || tutorialState?.unlockedRewards?.has?.('add-toy')) return;
      const targets = [];
      if (node instanceof HTMLElement && node.matches('.toy-inst-btn, select.toy-instrument, [data-action="instrument"]')) {
        targets.push(node);
      }
      if (node.querySelectorAll) {
        node.querySelectorAll('.toy-inst-btn, select.toy-instrument, [data-action="instrument"]').forEach(el => targets.push(el));
      }
      targets.forEach(lockElement);
    };

    if (header) {
      if (panel.__tutorialHeaderObserver) {
        try { panel.__tutorialHeaderObserver.disconnect(); } catch {}
      }
      header.querySelectorAll('button, select, .c-btn').forEach(lockElement);
      lockInstrumentElements(header);

      const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            if (node.matches && node.matches('button, select, .c-btn')) lockElement(node);
            if (node.querySelectorAll) {
              node.querySelectorAll('button, select, .c-btn').forEach(lockElement);
            }
            lockInstrumentElements(node);
          }
        }
      });

      debugTutorial('lockTutorialControls:observe-header', describeElement(header));
      observer.observe(header, { childList: true, subtree: true });
      panel.__tutorialHeaderObserver = observer;
    }

    if (panel.__tutorialModeObserver) {
      try { panel.__tutorialModeObserver.disconnect(); } catch {}
    }
    const modeObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches && (node.matches('.toy-mode-btn') || node.matches('.toy-chain-btn'))) {
            debugTutorial('remove-mode-control', describeElement(node));
            node.remove();
            continue;
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('.toy-mode-btn, .toy-chain-btn').forEach(btn => {
              debugTutorial('remove-mode-control', describeElement(btn));
              btn.remove();
            });
          }
          lockInstrumentElements(node);
        }
      }
    });
    debugTutorial('lockTutorialControls:observe-panel', describeElement(panel));
    modeObserver.observe(panel, { childList: true, subtree: true });
    panel.__tutorialModeObserver = modeObserver;

    lockInstrumentElements(panel);
    panel.__tutorialLockedControls = locked;
  }

  function getControlMap(panel) {
    if (!panel) return {};
    if (!panel.__tutorialControlMap) panel.__tutorialControlMap = {};
    const map = panel.__tutorialControlMap;
    Object.keys(CONTROL_SELECTORS).forEach(key => {
      const selector = CONTROL_SELECTORS[key];
      if (!selector) return;
      const panelEl = panel?.isConnected ? panel.querySelector(selector) : null;
      if (panelEl) {
        map[key] = panelEl;
        return;
      }
      const cached = map[key];
      if (cached && document.body.contains(cached)) return;
      map[key] = document.querySelector(selector) || null;
    });
    return map;
  }

  function unlockPanelControls(panel, keys = []) {
    if (!panel) return [];
    const map = getControlMap(panel);
    const unlocked = [];
    keys.forEach(key => {
      const selector = CONTROL_SELECTORS[key];
      const candidates = [];
      if (selector && panel?.isConnected) {
        panel.querySelectorAll(selector).forEach(el => {
          if (!(el instanceof HTMLElement)) return;
          if (!candidates.includes(el)) candidates.push(el);
        });
      }
      const mapped = map[key];
      if (mapped instanceof HTMLElement && panel?.isConnected && panel.contains(mapped) && !candidates.includes(mapped)) {
        candidates.push(mapped);
      }
      if (!candidates.length && selector) {
        document.querySelectorAll(selector).forEach(el => {
          if (!(el instanceof HTMLElement)) return;
          const ownerPanel = el.closest('.toy-panel');
          if (ownerPanel !== panel) return;
          if (!candidates.includes(el)) candidates.push(el);
        });
      }
      if (!panel.__tutorialUnlockObservers) panel.__tutorialUnlockObservers = {};
      if (!candidates.length) {
        debugTutorial('unlock-wait', key, selector || '(no selector)');
        if (!panel.__tutorialUnlockObservers[key] && selector) {
          const observer = new MutationObserver(() => {
            const retry = Array.from(panel.querySelectorAll(selector)).filter(el => el instanceof HTMLElement);
            if (retry.length) {
              try { observer.disconnect(); } catch {}
              panel.__tutorialUnlockObservers[key] = null;
              const unlockedNow = unlockPanelControls(panel, [key]);
              if (unlockedNow?.length) {
                requestAnimationFrame(() => unlockedNow.forEach(animateUnlock));
              }
            }
          });
          try { observer.observe(panel, { childList: true, subtree: true }); } catch {}
          panel.__tutorialUnlockObservers[key] = observer;
        }
        return;
      }
      if (panel.__tutorialUnlockObservers?.[key]) {
        try { panel.__tutorialUnlockObservers[key].disconnect(); } catch {}
        panel.__tutorialUnlockObservers[key] = null;
      }
      debugTutorial('unlock-candidates', key, candidates.map(describeElement).join(', '));
      candidates.forEach(el => {
        el.classList.remove('tutorial-instrument-hidden');
        const wasLocked = el.classList.contains('tutorial-control-locked');
        if (!wasLocked) {
          debugTutorial('unlock-skip', key, describeElement(el));
        } else {
          el.classList.remove('tutorial-control-locked');
        }
        if (el.matches('button, select')) {
          const wasDisabled = el.dataset.tutorialWasDisabled;
          const shouldEnable = wasDisabled === '0' || wasDisabled === undefined;
        if (shouldEnable) {
          el.disabled = false;
          el.removeAttribute('aria-disabled');
        } else {
          el.setAttribute('aria-disabled', 'true');
          }
          delete el.dataset.tutorialWasDisabled;
        }
        if (el.dataset.tutorialOrigDisplay !== undefined) {
          const orig = el.dataset.tutorialOrigDisplay;
          if (orig) el.style.display = orig;
          else el.style.removeProperty('display');
          delete el.dataset.tutorialOrigDisplay;
        } else {
          try { el.style.removeProperty('display'); } catch {}
        }
        el.removeAttribute('aria-hidden');
        if (!unlocked.includes(el)) unlocked.push(el);
        debugTutorial('unlock', key, describeElement(el));
      });
      if (candidates[0]) {
        map[key] = candidates[0];
      }
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
    tempSpawnerUnlocks.clear();
  }

  function relockTemporarySpawnerControls() {
    tempSpawnerUnlocks.forEach(el => {
      if (!el || !el.classList) return;
      if (el.dataset.tutorialTempUnlock !== '1') return;
      el.classList.add('tutorial-locked-control');
      if (el.dataset.tutorialOrigDisplay !== undefined) {
        el.style.display = el.dataset.tutorialOrigDisplay;
      } else {
        el.style.removeProperty('display');
      }
      delete el.dataset.tutorialTempUnlock;
    });
    tempSpawnerUnlocks.clear();
  }

  function temporaryUnlockSpawnerControl(key) {
    const el = spawnerControls[key];
    if (!el || !el.classList) return false;
    if (!el.classList.contains('tutorial-locked-control')) return false;
    el.classList.remove('tutorial-locked-control');
    if (el.dataset.tutorialOrigDisplay !== undefined) {
      el.style.display = el.dataset.tutorialOrigDisplay;
    } else {
      el.style.removeProperty('display');
    }
    el.dataset.tutorialTempUnlock = '1';
    tempSpawnerUnlocks.add(el);
    return true;
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
    if (tempSpawnerUnlocks.has(el)) {
      tempSpawnerUnlocks.delete(el);
      delete el.dataset.tutorialTempUnlock;
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
      if (toggle) {
        unlocked.push(toggle);
        toggle.classList.add('tutorial-pulse-target', 'tutorial-active-pulse');
        const rewardIcon = goalPanel?.querySelector('.goal-reward-icon .toy-spawner-toggle');
        if (rewardIcon) {
          startParticleStream(rewardIcon, toggle);
        }
      }
    }
    if (goal.id === 'add-toy') {
      const help = unlockSpawnerControl('help');
      if (help) {
        unlocked.push(help);
      }
      // Unlock camera controls at the same time as help
      window.__tutorialZoomLock = false;
    }
    if (goal.id === 'get-help') {
      // Unlock all controls on all toys
      document.querySelectorAll('.toy-panel:not(.tutorial-hidden)').forEach(panel => {
        if (panel && panel.__tutorialLockedControls) {
          const allKeys = Object.keys(CONTROL_SELECTORS);
          unlocked.push(...unlockPanelControls(panel, allKeys));
        }
      });

      // Unlock all spawner controls
      const spawnerKeys = Object.keys(spawnerControls);
      spawnerKeys.forEach(key => {
        const el = unlockSpawnerControl(key);
        if (el) unlocked.push(el);
      });

      // Unlock all toy spawner items
      const style = document.getElementById('tutorial-add-toy-style');
      if (style) style.remove();
      document.querySelectorAll('.toy-spawner-item').forEach(item => {
        item.classList.remove('tutorial-locked-control');
        item.style.opacity = '';
        item.style.filter = '';
        item.style.pointerEvents = '';
        item.style.cursor = '';
        const label = item.querySelector('.toy-spawner-name');
        if (label && item.dataset.tutorialOrigLabel) {
            label.textContent = item.dataset.tutorialOrigLabel;
            delete item.dataset.tutorialOrigLabel;
        }
      });
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
      </footer>
      <button class="tutorial-claim-btn" type="button">Collect Reward</button>
    `;
    return container;
  }

  function populateGoalPanel(panelEl, goal, options = {}) {
    if (!panelEl || !goal) return;
    const tasks = Array.isArray(goal.tasks) ? goal.tasks : [];
    const rawTaskIndex = Number.isFinite(options.taskIndex) ? options.taskIndex : 0;
    const taskIndex = Math.max(0, Math.min(tasks.length, rawTaskIndex));
    const unlockedInput = options.unlockedRewards;
    const unlockedRewards = unlockedInput instanceof Set
      ? unlockedInput
      : new Set(Array.isArray(unlockedInput) ? unlockedInput : []);
    const completedTasksInput = options.completedTaskIds;
    const completedTaskIds = completedTasksInput instanceof Set
      ? new Set(completedTasksInput)
      : new Set(Array.isArray(completedTasksInput) ? completedTasksInput : []);
    if (!completedTaskIds.size && taskIndex > 0) {
      for (let i = 0; i < taskIndex && i < tasks.length; i++) {
        const fallbackId = tasks[i]?.id || `task-${i}`;
        completedTaskIds.add(fallbackId);
      }
    }
    const completedGoalsInput = options.completedGoals;
    const completedGoals = completedGoalsInput instanceof Set
      ? completedGoalsInput
      : new Set(Array.isArray(completedGoalsInput) ? completedGoalsInput : []);
    const claimedRewardsInput = options.claimedRewards;
    const claimedRewards = claimedRewardsInput instanceof Set
      ? claimedRewardsInput
      : new Set(Array.isArray(claimedRewardsInput) ? claimedRewardsInput : []);
    const pendingRewardsInput = options.pendingRewards;
    const pendingRewards = pendingRewardsInput instanceof Set
      ? pendingRewardsInput
      : new Set(Array.isArray(pendingRewardsInput) ? pendingRewardsInput : []);

    const headerEl = panelEl.querySelector('.tutorial-goals-header');
    const titleEl = panelEl.querySelector('.tutorial-goals-title');
    if (titleEl) titleEl.textContent = goal.title || '';

    const goalId = goal.id || '';
    const goalComplete = goalId ? completedGoals.has(goalId) : false;
    const rewardClaimed = goalId ? claimedRewards.has(goalId) : false;
    const hasPendingReward = goalId ? pendingRewards.has(goalId) : (goalComplete && !rewardClaimed);

    panelEl.classList.toggle('is-goal-complete', goalComplete);
    panelEl.classList.toggle('has-pending-reward', hasPendingReward);
    panelEl.classList.toggle('is-reward-claimed', rewardClaimed);
    if (headerEl) headerEl.classList.toggle('has-pending-reward', hasPendingReward);
    if (titleEl) titleEl.classList.toggle('is-goal-complete', goalComplete);

    const resolvedActiveTaskId = (() => {
      if (options.activeTaskId) return options.activeTaskId;
      if (taskIndex < tasks.length && tasks[taskIndex]?.id) return tasks[taskIndex].id;
      const firstIncomplete = tasks.find((task, index) => {
        const taskId = task?.id || `task-${index}`;
        return !completedTaskIds.has(taskId);
      });
      return firstIncomplete?.id || null;
    })();

    const listEl = panelEl.querySelector('.tutorial-goals-tasklist');
    if (listEl) {
      listEl.innerHTML = '';
      tasks.forEach((task, index) => {
        const taskId = task?.id || `task-${index}`;
        const li = document.createElement('li');
        li.className = 'goal-task';
        li.dataset.taskId = taskId;
        if (completedTaskIds.has(taskId)) li.classList.add('is-complete');
        if (resolvedActiveTaskId && resolvedActiveTaskId === taskId) li.classList.add('is-active');
        li.innerHTML = `<span class="goal-task-index">${index + 1}</span><span class="goal-task-label">${task?.label || ''}</span>`;
        listEl.appendChild(li);
      });
    }

    const completedTasksCount = tasks.reduce((count, task, index) => {
      const taskId = task?.id || `task-${index}`;
      return completedTaskIds.has(taskId) ? count + 1 : count;
    }, 0);
    const progressFill = panelEl.querySelector('.goal-progress-fill');
    if (progressFill) {
      const pct = tasks.length > 0 ? (completedTasksCount / tasks.length) * 100 : 0;
      progressFill.style.width = `${pct}%`;
    }
    const progressSummary = panelEl.querySelector('.goal-progress-summary');
    if (progressSummary) {
      progressSummary.innerHTML = `<strong>${completedTasksCount} / ${tasks.length}</strong> tasks complete`;
    }

    const reward = goal.reward || {};
    const rewardSection = panelEl.querySelector('.tutorial-goals-reward');
    const rewardDescription = rewardSection ? rewardSection.querySelector('.goal-reward-description') : panelEl.querySelector('.goal-reward-description');
    if (rewardDescription) rewardDescription.textContent = reward.description || '';

    const rewardIcons = rewardSection ? rewardSection.querySelector('.goal-reward-icons') : panelEl.querySelector('.goal-reward-icons');
    if (rewardIcons) {
      rewardIcons.innerHTML = '';
      if (reward && Array.isArray(reward.icons)) {
        reward.icons.forEach(icon => {
          const wrapper = document.createElement('div');
          wrapper.className = 'goal-reward-icon';
          if (goal.id && unlockedRewards.has(goal.id)) wrapper.classList.add('is-unlocked');

          const isAddToy = (goal.id === 'clear-random') &&
            ((icon.label && /add\s*toy/i.test(icon.label)) || icon.symbol === '+');

          if (isAddToy) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'toy-spawner-toggle toy-btn is-preview';
            btn.setAttribute('aria-label', icon.label || 'Add Toy');
            btn.innerHTML = '<span aria-hidden="true">+</span>';
            btn.style.pointerEvents = 'none';
            wrapper.appendChild(btn);
            rewardIcons.appendChild(wrapper);
            return;
          }

          const btn = document.createElement('button');
          btn.type = 'button';
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

    if (options.showClaimButton === false) {
      const btn = panelEl.querySelector('.tutorial-claim-btn');
      if (btn) {
        if (rewardSection && btn.parentElement !== rewardSection) rewardSection.appendChild(btn);
        btn.style.display = 'none';
        btn.classList.remove('is-visible');
        btn.disabled = true;
      }
    } else if (options.showClaimButton === true) {
      const btn = panelEl.querySelector('.tutorial-claim-btn');
      if (btn) {
        if (rewardSection && btn.parentElement !== rewardSection) rewardSection.appendChild(btn);
        const pending = hasPendingReward;
        btn.style.display = pending ? '' : 'none';
        btn.textContent = 'Collect Reward';
        btn.dataset.goalId = goalId;
        if (pending) {
          btn.classList.add('is-visible');
          btn.disabled = false;
        } else {
          btn.classList.remove('is-visible');
          btn.disabled = true;
        }
      }
    }

    panelEl.dataset.goalId = goal.id || '';
  }

  function ensureGoalPanel() {
    if (!goalPanel) goalPanel = buildGoalPanel();
    if (!goalPanel.isConnected) document.body.appendChild(goalPanel);
    if (!claimButton && goalPanel) {
      claimButton = goalPanel.querySelector('.tutorial-claim-btn');
      if (claimButton) {
        claimButton.addEventListener('click', () => claimCurrentGoalReward());
      }
    }
    if (!goalPanel.querySelector('.goal-particles-behind')) {
      const c = document.createElement('canvas');
      c.className = 'goal-particles-behind';
      goalPanel.appendChild(c);
    }
    if (!document.querySelector('.tutorial-particles-front')) {
      const c2 = document.createElement('canvas');
      c2.className = 'tutorial-particles-front';
      document.body.appendChild(c2);
    }
    updateClaimButtonVisibility();
    requestAnimationFrame(() => goalPanel.classList.add('is-visible'));
  }

  function teardownGoalPanel() {
    if (!goalPanel) return;
    goalPanel.classList.remove('is-visible');
    if (claimButton) {
      claimButton.classList.remove('is-visible');
      claimButton.disabled = true;
    }
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
      updateClaimButtonVisibility();
      return;
    }

    const progress = getGuideProgressSnapshot();
    const completedTaskSet = new Set(progress.completedTasks || []);
    const completedGoalSet = new Set(progress.completedGoals || []);
    const claimedRewardSet = new Set(progress.claimedRewards || []);
    const pendingRewardSet = new Set([...completedGoalSet].filter(id => !claimedRewardSet.has(id)));

    populateGoalPanel(goalPanel, goal, {
      taskIndex: tutorialState.taskIndex,
      unlockedRewards: tutorialState.unlockedRewards,
      activeTaskId: getCurrentTask()?.id || null,
      completedTaskIds: completedTaskSet,
      completedGoals: completedGoalSet,
      claimedRewards: claimedRewardSet,
      pendingRewards: pendingRewardSet,
    });
    updateClaimButtonVisibility();
  }

  function updateClaimButtonVisibility() {
    if (!goalPanel) return;
    const btn = claimButton || goalPanel.querySelector('.tutorial-claim-btn');
    if (!btn) return;
    if (!tutorialState) {
      btn.classList.remove('is-visible');
      btn.disabled = true;
      return;
    }
    const goal = getCurrentGoal();
    const pendingGoalId = tutorialState.pendingRewardGoalId || null;
    const awaitingClaim = !!pendingGoalId && goal && goal.id === pendingGoalId;
    if (awaitingClaim) {
      btn.classList.add('is-visible');
      btn.disabled = false;
      btn.textContent = 'Collect Reward';
    } else {
      btn.classList.remove('is-visible');
      btn.disabled = true;
    }
  }

  function claimCurrentGoalReward() {
    if (!tutorialState) return;
    const pendingGoalId = tutorialState.pendingRewardGoalId;
    if (!pendingGoalId) return;
    const goal = GOAL_FLOW.find(g => g.id === pendingGoalId);
    if (!goal) {
      tutorialState.pendingRewardGoalId = null;
      updateClaimButtonVisibility();
      return;
    }
    const unlocked = applyGoalReward(goal) || [];
    debugTutorial('reward-claimed', goal.id, 'unlocked', unlocked.length);
    if (unlocked.length) {
      requestAnimationFrame(() => unlocked.forEach(animateUnlock));
    }
    markGuideRewardClaimed(goal.id);
    tutorialState.pendingRewardGoalId = null;
    tutorialState.goalIndex++;
    tutorialState.taskIndex = 0;
    hasDetectedLine = false;
    renderGoalPanel();
    updateClaimButtonVisibility();
    const nextTask = getCurrentTask();
    if (nextTask) {
      handleTaskEnter(nextTask);
    } else {
      stopParticleStream();
    }
  }

  function whenVisible(selector, callback, timeout = 2000) {
    const startTime = Date.now();
    const check = () => {
        const el = document.querySelector(selector);
        if (el && (el.offsetParent !== null || el.getClientRects().length > 0)) {
            callback(el);
        } else if (Date.now() - startTime < timeout) {
            requestAnimationFrame(check);
        }
    };
    check();
  }

  function handleTaskEnter(task) {
    stopParticleStream();
    document.querySelectorAll('.tutorial-pulse-target').forEach(el => el.classList.remove('tutorial-pulse-target'));
    document.querySelectorAll('.tutorial-active-pulse').forEach(el => el.classList.remove('tutorial-active-pulse'));
    relockTemporarySpawnerControls();

    if (!task) return;

    let handledSpecial = false;

    if (task.id === 'place-any-toy' || task.id === 'add-draw-toy') {
      ensureGoalPanel();
      temporaryUnlockSpawnerControl('toggle');

      whenVisible('.toy-spawner-toggle', (targetEl) => {
        const startParticles = () => {
          const taskEl = goalPanel?.querySelector('.goal-task.is-active') 
                      || goalPanel?.querySelector('.goal-row.is-active');
          if (taskEl && targetEl?.isConnected) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                startParticleStream(taskEl, targetEl, { layer: 'behind-target' });
              });
            });

            targetEl.classList.add('tutorial-pulse-target', 'tutorial-addtoy-pulse');
            targetEl.classList.add('tutorial-flash');
            setTimeout(() => targetEl.classList.remove('tutorial-flash'), 320);
          }
        };

        startParticles();
        window.addEventListener('resize', startParticles, { passive: true });
        tutorialListeners.push({
          target: window,
          type: 'resize',
          handler: startParticles,
          options: { passive: true }
        });
      });

      document.getElementById('tutorial-add-draw-style')?.remove();
      const style = document.createElement('style');
      style.id = 'tutorial-add-draw-style';
      style.textContent = `
    body.tutorial-active .toy-spawner-item:not([data-tutorial-keep="draw"]) {
      pointer-events: none !important;
      opacity: 0.35 !important;
      filter: grayscale(1) !important;
      cursor: not-allowed !important;
    }
    body.tutorial-active .toy-spawner-item[data-tutorial-keep="draw"] {
      pointer-events: auto !important;
      opacity: 1 !important;
      filter: none !important;
      cursor: pointer !important;
    }
  `;
      document.head.appendChild(style);

      const applyKeepFlags = () => {
        document.querySelectorAll('.toy-spawner-item').forEach(item => {
          if (!(item instanceof HTMLElement)) return;
          if (item.dataset.toyType === 'drawgrid') {
            item.dataset.tutorialKeep = 'draw';
            const label = item.querySelector('.toy-spawner-name');
            if (label) label.textContent = 'Draw Line';
          } else if (item.dataset.tutorialKeep === 'draw') {
            delete item.dataset.tutorialKeep;
          }
        });
      };
      applyKeepFlags();
      let debounceTimeout;
      const debouncedApplyKeepFlags = () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(applyKeepFlags, 50);
      };
      const renameObserver = new MutationObserver(debouncedApplyKeepFlags);
      const listHost = document.querySelector('.toy-spawner-list');
      if (listHost) renameObserver.observe(listHost, { childList: true, subtree: true });
      else renameObserver.observe(document.body, { childList: true, subtree: true });

      tutorialListeners.push({
        disconnect: () => {
          try { style.remove(); } catch {}
          try { renameObserver.disconnect(); } catch {}
        }
      });
      handledSpecial = true;

    }
    else if (task.id === 'interact-new-toy') {
      handledSpecial = true;
      ensureGoalPanel();

      let disposed = false;
      let retryTimer = 0;

      const attach = () => {
        if (disposed) return;
        const targetToy = lastPlacedToy && lastPlacedToy.isConnected ? lastPlacedToy : null;
        if (!targetToy) {
          retryTimer = window.setTimeout(attach, 160);
          return;
        }

        targetToy.classList.add('tutorial-guide-foreground');
        const startParticles = () => {
          const taskEl = goalPanel?.querySelector('.goal-task.is-active');
          if (taskEl && targetToy.isConnected) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                startParticleStream(taskEl, targetToy, { layer: 'behind-target' });
              });
            });
          }
        };

        startParticles();
        window.addEventListener('resize', startParticles, { passive: true });

        tutorialListeners.push({
          target: window,
          type: 'resize',
          handler: startParticles,
          options: { passive: true }
        });

        tutorialListeners.push({
          disconnect: () => {
            window.removeEventListener('resize', startParticles);
            targetToy.classList.remove('tutorial-guide-foreground');
            stopParticleStream();
          }
        });
      };

      attach();

      tutorialListeners.push({
        disconnect: () => {
          disposed = true;
          if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = 0;
          }
        }
      });
    }
    else if (task.id === 'add-rhythm-toy') {
      ensureGoalPanel();

      // When the + button is visible, start the line from the active task -> + button
      whenVisible('.toy-spawner-toggle', (targetEl) => {
        const startParticles = () => {
          const taskEl = goalPanel?.querySelector('.goal-task.is-active') 
                      || goalPanel?.querySelector('.goal-row.is-active');
          if (taskEl && targetEl?.isConnected) {
            // two rAFs = layout stable & canvases sized
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                startParticleStream(taskEl, targetEl, { layer: 'behind-target' });
              });
            });

            // Highlight + button while task is active
            targetEl.classList.add('tutorial-pulse-target', 'tutorial-addtoy-pulse');
            // One-off accent flash
            targetEl.classList.add('tutorial-flash');
            setTimeout(() => targetEl.classList.remove('tutorial-flash'), 320);
          }
        };

        // Start now and also restart on resize (keeps path correct)
        startParticles();
        window.addEventListener('resize', startParticles, { passive: true });

        // Clean up when task completes / goal changes
        tutorialListeners.push({
          target: window,
          type: 'resize',
          handler: startParticles,
          options: { passive: true }
        });
      });

      // Grey out all toy cards EXCEPT the one we want to allow (Simple Rhythm)
      // (keep your existing greying/rename logic here)
      const style = document.createElement('style');
      style.id = 'tutorial-add-toy-style';
      style.textContent = `
    body.tutorial-active .toy-spawner-item:not([data-tutorial-keep="true"]) {
      pointer-events: none !important;
      opacity: 0.35 !important;
      filter: grayscale(1) !important;
      cursor: not-allowed !important;
    }
  `;
      document.head.appendChild(style);

      // IMPORTANT: use the actual class name from toy-spawner.js -> .toy-spawner-name
      const renameObserver = new MutationObserver(() => {
        document.querySelectorAll('.toy-spawner-item').forEach(item => {
          const label = item.querySelector('.toy-spawner-name');
          if (!label) return;

          // If we still see "Loop Grid", change its display label and whitelist it
          if (label.textContent.includes('Loop Grid')) {
            if (!item.dataset.tutorialOrigLabel) {
              item.dataset.tutorialOrigLabel = label.textContent;
              label.textContent = 'Simple Rhythm';
            }
            item.dataset.tutorialKeep = 'true';
          }

          // Also whitelist if it already says "Simple Rhythm"
          if (label.textContent.includes('Simple Rhythm')) {
            item.dataset.tutorialKeep = 'true';
          }
        });
      });
      const listHost = document.querySelector('.toy-spawner-list');
      if (listHost) renameObserver.observe(listHost, { childList: true, subtree: true });
      else renameObserver.observe(document.body, { childList: true, subtree: true });

      // Clean-up when leaving the task
      tutorialListeners.push({
        disconnect: () => {
          try { style.remove(); } catch {}
          try { renameObserver.disconnect(); } catch {}
        }
      });
      handledSpecial = true;
    } else if (task.id === 'press-help') {
      ensureGoalPanel();

      whenVisible('.toy-spawner-help', (targetEl) => {
        const startParticles = () => {
          const taskEl = goalPanel?.querySelector('.goal-task.is-active');
          if (taskEl && targetEl?.isConnected) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                startParticleStream(taskEl, targetEl, { layer: 'behind-target' });
              });
            });

            targetEl.classList.add('tutorial-pulse-target', 'tutorial-addtoy-pulse');
            targetEl.classList.add('tutorial-flash');
            setTimeout(() => targetEl.classList.remove('tutorial-flash'), 320);
          }
        };

        startParticles();
        window.addEventListener('resize', startParticles, { passive: true });

        tutorialListeners.push({
          target: window,
          type: 'resize',
          handler: startParticles,
          options: { passive: true }
        });
      });
    } else {
      // On any non-add-toy task, stop the stream + remove pulse
      stopParticleStream();
      document.querySelector('.toy-spawner-toggle')?.classList.remove('tutorial-pulse-target', 'tutorial-addtoy-pulse', 'tutorial-flash');
    }

    if (!handledSpecial) {
      const targetKey = TASK_TARGETS[task.id];
      const targetEl = targetKey ? (getControlMap(tutorialToy)[targetKey] || document.querySelector(CONTROL_SELECTORS[targetKey])) : null;
      if (task.id === 'press-play' && targetEl) {
        targetEl.classList.remove('tutorial-hide-play-button');
        if (targetEl.dataset.tutorialOrigDisplay !== undefined) {
          targetEl.style.display = targetEl.dataset.tutorialOrigDisplay;
        } else {
          targetEl.style.removeProperty('display');
        }
        if (targetEl.dataset.tutorialOrigVisibility !== undefined) {
          const vis = targetEl.dataset.tutorialOrigVisibility;
          if (vis) targetEl.style.visibility = vis;
          else targetEl.style.removeProperty('visibility');
        } else {
          targetEl.style.removeProperty('visibility');
        }
        if (targetEl.dataset.tutorialOrigOpacity !== undefined) {
          const op = targetEl.dataset.tutorialOrigOpacity;
          if (op) targetEl.style.opacity = op;
          else targetEl.style.removeProperty('opacity');
        } else {
          targetEl.style.removeProperty('opacity');
        }
        targetEl.disabled = false;
        targetEl.removeAttribute('aria-hidden');
        window.tutorialSpacebarDisabled = false;
      }
      const isPlayTask = task.id === 'press-play';
      const isToggleTask = task.id === 'toggle-node';
      const isDragTask = task.id === 'drag-note';
      const targetVisible =
        targetEl &&
        !targetEl.classList.contains('tutorial-control-locked') &&
        !targetEl.classList.contains('tutorial-hide-play-button') &&
        (isPlayTask || !targetEl.classList.contains('tutorial-play-hidden')) &&
        (targetEl.offsetParent !== null || getComputedStyle(targetEl).display !== 'none');
  
      if (targetVisible) {
        const taskEl = goalPanel?.querySelector('.goal-task.is-active');
        if (taskEl) {
          if (isToggleTask) {
            startParticleStream(taskEl, targetEl, { layer: 'behind-target' });
          } else if (isDragTask) {
            startParticleStream(taskEl, targetEl, { layer: 'behind-target' });
          } else {
            startParticleStream(taskEl, targetEl, { layer: 'behind-target' });
          }
        }
  
        if (isPlayTask) {
          const playButtonContainer = targetEl;

          // guard (before rAF)
          playButtonContainer.classList.add('tutorial-play-hidden');
          playButtonContainer.style.transformOrigin = '50% 50%';
          playButtonContainer.style.willChange = 'transform, opacity';
  
          // reveal + force layout before anim
          
  
  requestAnimationFrame(() => {
            if (!playButtonContainer.isConnected) return;
  
            // Reveal + ensure container guards are applied, then force layout
            playButtonContainer.classList.remove('tutorial-play-hidden');
            playButtonContainer.style.removeProperty('visibility');
            playButtonContainer.style.opacity = '1';
            playButtonContainer.removeAttribute('aria-hidden');
            void playButtonContainer.offsetWidth;
  
            const playButtonVisual = playButtonContainer.querySelector('.c-btn-core');
            // Flash accent on the core (optional, keep your visual feedback)
            if (playButtonVisual) {
              playButtonVisual.classList.add('tutorial-flash');
              setTimeout(() => playButtonVisual.classList.remove('tutorial-flash'), 320);
            }
  
            const finish = () => {
              // enable ongoing pulses and clear guards
              playButtonContainer.classList.add('tutorial-active-pulse');
              if (playButtonVisual) playButtonVisual.classList.add('tutorial-pulse-target');
  
              playButtonContainer.style.removeProperty('transform');
              playButtonContainer.style.removeProperty('will-change');
              playButtonContainer.style.removeProperty('opacity');
            };
  
            // Animate the WRAPPER so the entire button (core + ring) scales together
            if (!playButtonContainer.animate) {
              finish();
            } else {
              const anim = playButtonContainer.animate(
                [
                  { transform: 'scale(0)',    opacity: 1, offset: 0.00 },
                  { transform: 'scale(2.0)',  opacity: 1, offset: 0.60 },
                  { transform: 'scale(0.92)', opacity: 1, offset: 0.85 },
                  { transform: 'scale(1.0)',  opacity: 1, offset: 1.00 }
                ],
                { duration: 1200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both', composite: 'replace' }
              );
              anim.onfinish = finish;
              anim.oncancel = finish;
            }
          });
        } else {
          if (task.id === 'draw-line') {
            const drawPanel = targetEl.closest('.toy-panel');
            if (drawPanel) {
              drawPanel.classList.add('tutorial-guide-foreground');
            }
          } else if (isToggleTask) {
            targetEl.classList.add('tutorial-guide-foreground');
            try { targetEl.dispatchEvent(new CustomEvent('tutorial:highlight-notes', { detail: { active: true } })); } catch {}
          } else if (isDragTask) {
            targetEl.classList.add('tutorial-guide-foreground');
            try { targetEl.dispatchEvent(new CustomEvent('tutorial:highlight-drag', { detail: { active: true } })); } catch {}
          } else {
            targetEl.classList.add('tutorial-pulse-target', 'tutorial-active-pulse');
          }
        }
      } else {
        stopParticleStream();
      }

    }
    if (helpActivatedForTask) {
      try { setHelpActive(false); } catch {}
      helpActivatedForTask = false;
    }
  }
  function completeCurrentTask() {
    const goal = getCurrentGoal();
    if (!goal || !tutorialState) return;
    if (tutorialState.pendingRewardGoalId) return;

    tutorialState.taskIndex++;
    if (tutorialState.taskIndex >= goal.tasks.length) {
      tutorialState.taskIndex = goal.tasks.length;
      tutorialState.pendingRewardGoalId = goal.id;
      debugTutorial('goal-ready', goal.id);
      const reward = goal.reward || null;
      const shouldAutoClaim = !reward || reward.autoClaim;
      if (shouldAutoClaim) {
        claimCurrentGoalReward();
      } else {
        renderGoalPanel();
        updateClaimButtonVisibility();
        stopParticleStream();
        document.querySelectorAll('.tutorial-pulse-target, .tutorial-active-pulse, .tutorial-addtoy-pulse, .tutorial-guide-foreground').forEach(el => {
          if (el.matches?.('.toy-panel[data-toy="drawgrid"]')) {
            try { el.dispatchEvent(new CustomEvent('tutorial:highlight-notes', { detail: { active: false } })); } catch {}
            try { el.dispatchEvent(new CustomEvent('tutorial:highlight-drag', { detail: { active: false } })); } catch {}
          }
          el.classList.remove('tutorial-pulse-target', 'tutorial-active-pulse', 'tutorial-addtoy-pulse', 'tutorial-guide-foreground');
        });
      }
      return;
    }

    renderGoalPanel();
    handleTaskEnter(getCurrentTask());
  }

  function maybeCompleteTask(requirement) {
    const progressChanged = setRequirementProgress(requirement, true);
    if (progressChanged && !tutorialActive) {
      if (typeof guideHighlightCleanup === 'function') {
        try { guideHighlightCleanup(); } catch {}
        guideHighlightCleanup = null;
      } else {
        stopParticleStream();
      }
      document.querySelectorAll('.tutorial-pulse-target, .tutorial-active-pulse, .tutorial-addtoy-pulse, .tutorial-guide-foreground').forEach(el => {
        if (el.matches?.('.toy-panel[data-toy="drawgrid"]')) {
          try { el.dispatchEvent(new CustomEvent('tutorial:highlight-notes', { detail: { active: false } })); } catch {}
          try { el.dispatchEvent(new CustomEvent('tutorial:highlight-drag', { detail: { active: false } })); } catch {}
        }
        el.classList.remove('tutorial-pulse-target', 'tutorial-active-pulse', 'tutorial-addtoy-pulse', 'tutorial-guide-foreground');
      });
    }
    if (tutorialState?.pendingRewardGoalId) return progressChanged;
    const task = getCurrentTask();
    if (task && task.requirement === requirement) {
      completeCurrentTask();
      return true;
    }
    return progressChanged;
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
    registerToyInteraction(panel);
    const markInteraction = () => maybeCompleteTask('interact-any-toy');
    addListener(panel, 'drawgrid:update', (e) => {
      handleDrawgridUpdate(e.detail);
      markInteraction();
    });
    addListener(panel, 'drawgrid:node-toggle', () => {
      markInteraction();
    });

    const controlMap = getControlMap(panel);
    if (controlMap.clear) {
      addListener(controlMap.clear, 'click', () => {
        maybeCompleteTask('press-clear');
        markInteraction();
      });
    }
    if (controlMap.random) {
      addListener(controlMap.random, 'click', () => {
        maybeCompleteTask('press-random');
        markInteraction();
      });
      // Some toys emit dedicated events when randomising; listen for those too
      ['toy-random', 'toy-random-cubes', 'toy-random-blocks', 'loopgrid:random'].forEach(evt => {
        addListener(panel, evt, () => {
          maybeCompleteTask('press-random');
          markInteraction();
        });
      });
    } else {
      addListener(panel, 'toy-random', () => {
        maybeCompleteTask('press-random');
        markInteraction();
      });
    }

    addListener(panel, 'toy-clear', () => {
      maybeCompleteTask('press-clear');
      markInteraction();
    });
    addListener(panel, 'toy-reset', () => {
      maybeCompleteTask('press-clear');
      markInteraction();
    });
  }



  const updatePlayRequirement = () => {
    const playing = typeof isRunning === 'function' ? !!isRunning() : false;
    if (playing) {
      maybeCompleteTask('press-play');
    } else {
      setRequirementProgress('press-play', false);
    }
  };

  document.addEventListener('transport:resume', updatePlayRequirement, { passive: true });
  document.addEventListener('transport:pause', updatePlayRequirement, { passive: true });
  updatePlayRequirement();

  const scheduleDrawToySync = () => {
    requestAnimationFrame(() => {
      try {
        board?.querySelectorAll?.('.toy-panel[data-toy="drawgrid"]').forEach((panel) => {
          if (!(panel instanceof HTMLElement)) return;
          if (!panel.__tutorialInteractionHooked) {
            registerToyInteraction(panel);
          } else {
            drawToyPanels.add(panel);
            drawToyLineState.set(panel, panelHasDrawLine(panel));
          }
        });
        refreshDrawToyRequirement();
        refreshDrawLineRequirement();
      } catch {}
    });
  };

  scheduleDrawToySync();

  function enterTutorial() {
    window.__useBoardCentering = true;
    if (tutorialActive) return;
    tutorialActive = true;

    updateButtonVisual();

    if (!document.getElementById('tutorial-override-styles')) {
      const style = document.createElement('style');
      style.id = 'tutorial-override-styles';
      style.textContent = `.tutorial-instrument-hidden { display: none !important; }`;
      document.head.appendChild(style);
    }

    const boardObserver = new MutationObserver(mutations => {
      if (!tutorialActive) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.matches && node.matches('.toy-panel[data-toy="loopgrid"]')) {
            const newToy = node;
            registerToyInteraction(newToy);
            maybeCompleteTask('place-any-toy');
            const didComplete = maybeCompleteTask('add-toy-loopgrid');
            if (didComplete) {
              stopParticleStream();
              document.querySelector('.toy-spawner-toggle')?.classList.remove('tutorial-pulse-target', 'tutorial-addtoy-pulse', 'tutorial-flash', 'tutorial-active-pulse');
            }

/***** << GPT:TUTORIAL_PLACE_AND_FRAME_BOTH START >> *****/
try {
  if (!tutorialToy || !newToy?.isConnected) return;

  if (!newToy.__tutorialOnboarded) {
    newToy.__tutorialOnboarded = true;
    lockTutorialControls(newToy);
    if (tutorialState?.unlockedRewards?.has?.('draw-intro')) {
      unlockPanelControls(newToy, ['clear', 'random']);
    }
    setupPanelListeners(newToy);
  }

  const onNoteAdd = ({ markInteract = false } = {}) => {
    if (!hasActiveLoopgrid(newToy)) return;
    maybeCompleteTask('add-note-new-toy');
    if (markInteract) maybeCompleteTask('interact-any-toy');
  };

  const scheduleNoteCheck = (markInteract = false) => {
    const exec = () => onNoteAdd({ markInteract });
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(exec);
    } else {
      setTimeout(exec, 16);
    }
  };

  if (!newToy.__tutorialRhythmHooked) {
    newToy.__tutorialRhythmHooked = true;
    const manualEvents = ['grid:notechange', 'grid:drum-tap', 'loopgrid:tap'];
    manualEvents.forEach(evt => addListener(newToy, evt, () => scheduleNoteCheck(true)));

    const stateEvents = ['loopgrid:update', 'toy-update', 'change'];
    stateEvents.forEach(evt => addListener(newToy, evt, () => scheduleNoteCheck(false)));

    const randomEvents = ['toy-random', 'toy-random-notes'];
    randomEvents.forEach(evt => addListener(newToy, evt, () => scheduleNoteCheck(true)));

    addListener(newToy, 'toy-clear', () => scheduleNoteCheck(false));
  }
  scheduleNoteCheck(false);

  const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) => setTimeout(fn, 16));
  const settle = (fn) => raf(() => raf(fn));
  settle(() => {
    if (!tutorialActive || !tutorialToy?.isConnected || !newToy?.isConnected) return;
    const panels = [tutorialToy, newToy];
    const attempts = [
      () => withZoomUnlock(() => frameTutorialPanels(panels, { limitToCurrentScale: true })),
      () => withZoomUnlock(() => frameTutorialPanels(panels, { limitToCurrentScale: false })),
      () => {
        if (typeof window.centerBoardOnElement === 'function') {
          withZoomUnlock(() => window.centerBoardOnElement(newToy, TUTORIAL_ZOOM));
        }
      },
      () => {
        if (typeof window.centerBoardOnElement === 'function') {
          withZoomUnlock(() => window.centerBoardOnElement(tutorialToy, TUTORIAL_ZOOM));
        }
      },
    ];
    ensurePanelsVisible(panels, attempts);
  });
} catch (err) {
  console.warn('[tutorial] place/frame both toys failed', err);
}
/***** << GPT:TUTORIAL_PLACE_AND_FRAME_BOTH END >> *****/

          } else if (node.matches && node.matches('.toy-panel[data-toy="drawgrid"]') && node.dataset.tutorial !== 'true') {
            const newToy = node;
            registerToyInteraction(newToy);
            maybeCompleteTask('place-any-toy');
            lockTutorialControls(newToy);
            setupPanelListeners(newToy);
            if (!tutorialToy || !tutorialToy.isConnected) {
              tutorialToy = newToy;
              newToy.dataset.tutorial = 'true';
              newToy.classList.add('tutorial-panel');
              const drawPanels = [newToy];
              const drawAttempts = [
                () => withZoomUnlock(() => frameTutorialPanels(drawPanels, { limitToCurrentScale: true })),
                () => withZoomUnlock(() => frameTutorialPanels(drawPanels, { limitToCurrentScale: false })),
                () => {
                  if (typeof window.centerBoardOnElement === 'function') {
                    withZoomUnlock(() => window.centerBoardOnElement(newToy, TUTORIAL_ZOOM));
                  }
                },
              ];
              ensurePanelsVisible(drawPanels, drawAttempts);
            }
            const didCompleteDraw = maybeCompleteTask('add-toy-drawgrid');
            if (didCompleteDraw) {
              stopParticleStream();
              document.querySelector('.toy-spawner-toggle')?.classList.remove('tutorial-pulse-target', 'tutorial-addtoy-pulse', 'tutorial-flash', 'tutorial-active-pulse');
              relockTemporarySpawnerControls();
              document.getElementById('tutorial-add-draw-style')?.remove();
              document.querySelectorAll('.toy-spawner-item[data-tutorial-keep="draw"]').forEach(item => {
                if (item instanceof HTMLElement) delete item.dataset.tutorialKeep;
              });
            }
          }
          else if (node.matches && node.matches('.toy-panel') && node.dataset.tutorial !== 'true') {
            const newToy = node;
            registerToyInteraction(newToy);
            maybeCompleteTask('place-any-toy');
          }
        }
      }
    });
    boardObserver.observe(board, { childList: true });
    tutorialListeners.push({ disconnect: () => boardObserver.disconnect() });

    if (!document.getElementById('tutorial-styles')) {
      const link = document.createElement('link');
      link.id = 'tutorial-styles';
      link.rel = 'stylesheet';
      link.href = 'src/tutorial.css';
      document.head.appendChild(link);
    }

    previousSnapshot = null;
    try { previousSnapshot = getSnapshot(); } catch {}
/* TUTORIAL_SCROLL_LOCK:START */
try {
  // Save previous overflow to restore later
  const de = document.documentElement;
  if (de && de.style) {
    if (de.dataset.prevOverflow === undefined) {
      de.dataset.prevOverflow = de.style.overflow || '';
    }
    de.style.overflow = 'hidden';
  }
  const b = document.body;
  if (b && b.style) {
    if (b.dataset.prevOverflow === undefined) {
      b.dataset.prevOverflow = b.style.overflow || '';
    }
    b.style.overflow = 'hidden';
  }
  // Ensure page scroll is reset
  window.scrollTo({ left: 0, top: 0, behavior: 'auto' });
} catch {}
/* TUTORIAL_SCROLL_LOCK:END */
  // Save current board viewport & lock zoom interactions
  window.__prevBoardViewport = {
    scale: window.__boardScale ?? 1,
    x: window.__boardX ?? 0,
    y: window.__boardY ?? 0
  };
  window.__tutorialZoomLock = true;
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
    updatePlayRequirement();
    if (playBtn) {
      if (playBtn.dataset.tutorialOrigDisplay === undefined) playBtn.dataset.tutorialOrigDisplay = playBtn.style.display || '';
      if (playBtn.dataset.tutorialOrigVisibility === undefined) playBtn.dataset.tutorialOrigVisibility = playBtn.style.visibility || '';
      if (playBtn.dataset.tutorialOrigOpacity === undefined) playBtn.dataset.tutorialOrigOpacity = playBtn.style.opacity || '';
      playBtn.classList.add('tutorial-play-hidden');
      playBtn.classList.remove('tutorial-hide-play-button');
      playBtn.classList.remove('tutorial-pulse-target');
      playBtn.disabled = true;
      playBtn.setAttribute('aria-hidden', 'true');
      updatePlayButtonVisual(playBtn, false);
    }

    document.body.classList.add('tutorial-active');
    hideOriginalToys();
    resetBoardViewport();
    tutorialToy = null;

    ensureGoalPanel();

    tutorialState = { goalIndex: 0, taskIndex: 0, unlockedRewards: new Set(), pendingRewardGoalId: null };
    hasDetectedLine = false;

    const playBtnListener = document.querySelector(CONTROL_SELECTORS.play);
    if (playBtnListener) addListener(playBtnListener, 'click', () => maybeCompleteTask('press-play'));

    const helpBtnListener = document.querySelector(CONTROL_SELECTORS.help);
    if (helpBtnListener) addListener(helpBtnListener, 'click', () => maybeCompleteTask('press-help'));

    renderGoalPanel();
    handleTaskEnter(getCurrentTask());
  }

  function exitTutorial() {
    window.__useBoardCentering = false;
    if (!tutorialActive) return;
    tutorialActive = false;

    document.getElementById('tutorial-override-styles')?.remove();
    relockTemporarySpawnerControls();
    document.getElementById('tutorial-add-draw-style')?.remove();
    document.querySelectorAll('.toy-spawner-item[data-tutorial-keep="draw"]').forEach(item => {
      if (item instanceof HTMLElement) delete item.dataset.tutorialKeep;
    });

    updateButtonVisual();

    window.tutorialSpacebarDisabled = false;
    const playBtn = document.querySelector(CONTROL_SELECTORS.play);
    if (playBtn) {
      playBtn.disabled = false;
      playBtn.classList.remove('tutorial-play-hidden');
      playBtn.classList.remove('tutorial-hide-play-button');
      playBtn.classList.remove('tutorial-pulse-target');
      playBtn.classList.remove('tutorial-active-pulse');
      playBtn.removeAttribute('aria-hidden');
      if (playBtn.dataset.tutorialOrigDisplay !== undefined) {
        playBtn.style.display = playBtn.dataset.tutorialOrigDisplay;
        delete playBtn.dataset.tutorialOrigDisplay;
      } else {
        playBtn.style.removeProperty('display');
      }
      if (playBtn.dataset.tutorialOrigVisibility !== undefined) {
        const vis = playBtn.dataset.tutorialOrigVisibility;
        if (vis) playBtn.style.visibility = vis;
        else playBtn.style.removeProperty('visibility');
        delete playBtn.dataset.tutorialOrigVisibility;
      } else {
        playBtn.style.removeProperty('visibility');
      }
      if (playBtn.dataset.tutorialOrigOpacity !== undefined) {
        const op = playBtn.dataset.tutorialOrigOpacity;
        if (op) playBtn.style.opacity = op;
        else playBtn.style.removeProperty('opacity');
        delete playBtn.dataset.tutorialOrigOpacity;
      } else {
        playBtn.style.removeProperty('opacity');
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

    try { tutorialToy.stopGhostGuide?.(); } catch {}

    stopParticleStream();
    removeTutorialListeners();
    // Unlock zoom and restore previous viewport
  window.__tutorialZoomLock = false;

  try {
    const prev = window.__prevBoardViewport;
    if (prev && window.setBoardScale && window.panTo) {
      window.setBoardScale(prev.scale ?? 1);
      window.panTo(prev.x ?? 0, prev.y ?? 0);
    }
  } catch(_) {}

  // Remove any live recenter handlers
  try {
    const focused = document.querySelector('.toy-panel.toy-focused');
    const handler = focused && focused.__tutorialRecenterHandler;
    if (handler) {
      window.removeEventListener('resize', handler);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handler);
        window.visualViewport.removeEventListener('scroll', handler);
      }
      delete focused.__tutorialRecenterHandler;
    }
  } catch(_) {}

  window.__prevBoardViewport = null;
    if (tutorialToy && tutorialToy.__tutorialHeaderObserver) {
      try { tutorialToy.__tutorialHeaderObserver.disconnect(); } catch {}
      tutorialToy.__tutorialHeaderObserver = null;
    }
    if (tutorialToy && tutorialToy.__tutorialHeaderWaiter) {
      try { tutorialToy.__tutorialHeaderWaiter.disconnect(); } catch {}
      tutorialToy.__tutorialHeaderWaiter = null;
    }
    if (tutorialToy && tutorialToy.__tutorialModeObserver) {
      try { tutorialToy.__tutorialModeObserver.disconnect(); } catch {}
      tutorialToy.__tutorialModeObserver = null;
    }
    if (tutorialToy && tutorialToy.__tutorialUnlockObservers) {
      Object.values(tutorialToy.__tutorialUnlockObservers).forEach(obs => { try { obs?.disconnect(); } catch {} });
      tutorialToy.__tutorialUnlockObservers = null;
    }
    if (tutorialToy) tutorialToy.remove();
    teardownGoalPanel();
    showOriginalToys();
    document.body.classList.remove('tutorial-active');

    restoreSpawnerControls();

    if (previousSnapshot) {
      try { applySnapshot(previousSnapshot); } catch {}
    }
/* TUTORIAL_SCROLL_UNLOCK:START */
try {
  const de = document.documentElement;
  if (de && de.style) {
    const prev = de.dataset.prevOverflow;
    if (prev !== undefined) {
      de.style.overflow = prev;
      delete de.dataset.prevOverflow;
    } else {
      de.style.removeProperty('overflow');
    }
  }
  const b = document.body;
  if (b && b.style) {
    const prev = b.dataset.prevOverflow;
    if (prev !== undefined) {
      b.style.overflow = prev;
      delete b.dataset.prevOverflow;
    } else {
      b.style.removeProperty('overflow');
    }
  }
} catch {}
/* TUTORIAL_SCROLL_UNLOCK:END */
    window.scrollTo({ left: storedScroll.x, top: storedScroll.y, behavior: 'auto' });
    if (previousFocus) {
      try { previousFocus.focus({ preventScroll: true }); } catch {}
    }

    if (tutorialState) tutorialState.pendingRewardGoalId = null;
    tutorialToy = null;
    tutorialState = null;
    previousSnapshot = null;
    previousFocus = null;
    hasDetectedLine = false;
  }

  if (tutorialButton) {
    tutorialButton.addEventListener('click', () => tutorialActive ? exitTutorial() : enterTutorial());
    updateButtonVisual();
  }

  window.addEventListener('guide:task-click', (e) => {
    const { taskId, taskElement } = (e && e.detail) || {};
    console.log('[tutorial] guide:task-click', { taskId, taskElementExists: !!taskElement });
    if (!taskId || !taskElement) return;

    // Clean up any previous highlight/handlers
    if (typeof guideHighlightCleanup === 'function') {
      try { guideHighlightCleanup(); } catch {}
      guideHighlightCleanup = null;
    }

    // Ensure canvases exist
    const panel = taskElement.closest('.guide-goals-panel');
    if (panel && !panel.querySelector('.goal-particles-behind')) {
      const c = document.createElement('canvas');
      c.className = 'goal-particles-behind';
      c.style.position = 'absolute';
      c.style.inset = '0';
      c.style.width = '100%';
      c.style.height = '100%';
      c.style.pointerEvents = 'none';
      c.style.zIndex = '590';
      panel.appendChild(c);
    }
    if (!document.querySelector('.tutorial-particles-front')) {
      const c2 = document.createElement('canvas');
      c2.className = 'tutorial-particles-front';
      document.body.appendChild(c2);
    }

    stopParticleStream();

    const highlightAddToy = (toggle) => {
      if (!toggle) return null;
      let disposed = false;
      const runParticles = () => {
        if (disposed) return;
        if (!taskElement.isConnected || !toggle.isConnected) return;
        stopParticleStream();
        console.log('[tutorial] highlightAddToy runParticles', {
          taskId,
          taskClasses: taskElement.className,
          toggleClasses: toggle.className,
        });
        startParticleStream(taskElement, toggle, { layer: 'behind-target' });
      };
      const scheduleParticles = () => {
        console.log('[tutorial] highlightAddToy scheduleParticles', { taskId });
        requestAnimationFrame(() => requestAnimationFrame(runParticles));
      };
      const onResize = () => scheduleParticles();
      console.log('[tutorial] highlightAddToy start', {
        taskId,
        toggleClasses: toggle.className,
        isConnected: toggle.isConnected,
        isVisible: toggle.offsetParent !== null || toggle.getClientRects().length > 0,
      });
      toggle.classList.add('tutorial-pulse-target', 'tutorial-active-pulse', 'tutorial-addtoy-pulse', 'tutorial-flash');
      scheduleParticles();
      window.addEventListener('resize', onResize, { passive: true });
      const flashTimer = setTimeout(() => toggle.classList.remove('tutorial-flash'), 360);

      return () => {
        disposed = true;
        window.removeEventListener('resize', onResize);
        clearTimeout(flashTimer);
        toggle.classList.remove('tutorial-flash');
        toggle.classList.remove('tutorial-pulse-target', 'tutorial-active-pulse', 'tutorial-addtoy-pulse');
        stopParticleStream();
      };
    };

    if (taskId === 'place-any-toy' || taskId === 'add-draw-toy' || taskId === 'add-rhythm-toy') {
      let disposed = false;
      let cleanupInner = null;
      let retryTimer = 0;

      const attach = () => {
        if (disposed || cleanupInner) return;
        const toggle = document.querySelector('.toy-spawner-toggle');
        console.log('[tutorial] attach toggle lookup', {
          taskId,
          toggleFound: !!toggle,
          toggleClasses: toggle ? toggle.className : null,
        });
        const visible = toggle && (toggle.offsetParent !== null || toggle.getClientRects().length > 0);
        if (!visible) {
          console.log('[tutorial] attach toggle not visible yet', { taskId });
          retryTimer = window.setTimeout(attach, 120);
          return;
        }
        console.log('[tutorial] attach toggle ready', { taskId });
        cleanupInner = highlightAddToy(toggle);
      };

      attach();

      guideHighlightCleanup = () => {
        disposed = true;
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = 0;
        }
        if (cleanupInner) {
          try { cleanupInner(); } catch {}
          cleanupInner = null;
        }
      };

      return;
    }

    if (taskId === 'interact-new-toy') {
      let disposed = false;
      let cleanupInner = null;
      let retryTimer = 0;

      const attach = () => {
        if (disposed || cleanupInner) return;
        const toy = lastPlacedToy && lastPlacedToy.isConnected ? lastPlacedToy : null;
        if (!toy) {
          retryTimer = window.setTimeout(attach, 160);
          return;
        }

        toy.classList.add('tutorial-guide-foreground');
        const runParticles = () => {
          if (disposed) return;
          if (!taskElement.isConnected || !toy.isConnected) return;
          stopParticleStream();
          startParticleStream(taskElement, toy, { layer: 'behind-target' });
        };
        const scheduleParticles = () => requestAnimationFrame(() => requestAnimationFrame(runParticles));
        const onResize = () => scheduleParticles();

        scheduleParticles();
        window.addEventListener('resize', onResize, { passive: true });

        cleanupInner = () => {
          window.removeEventListener('resize', onResize);
          toy.classList.remove('tutorial-guide-foreground');
          stopParticleStream();
        };
      };

      attach();

      guideHighlightCleanup = () => {
        disposed = true;
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = 0;
        }
        if (cleanupInner) {
          try { cleanupInner(); } catch {}
          cleanupInner = null;
        }
      };

      return;
    }

    const TASK_TARGET_SELECTORS = {
      'press-help': '.toy-spawner-help',
      'press-play': '#topbar [data-action="toggle-play"]',
      'press-clear': '.toy-panel[data-toy="drawgrid"] [data-action="clear"], .toy-panel [data-action="clear"]',
      'press-random': '.toy-panel[data-toy="drawgrid"] [data-action="random"], .toy-panel [data-action="random"]',
      'toggle-node': '.toy-panel[data-toy="drawgrid"]',
      'drag-note': '.toy-panel[data-toy="drawgrid"]',
      'draw-line': '.toy-panel[data-toy="drawgrid"] canvas[data-role="drawgrid-paint"]',
      // Guide tasks that spawn toys should aim the effect at the shared toggle button
      'add-draw-toy': '.toy-spawner-toggle',
      'add-rhythm-toy': '.toy-spawner-toggle',
    };

    const selector = TASK_TARGET_SELECTORS[taskId];
    if (!selector) {
      console.log('[tutorial] no target selector for task', { taskId });
      return;
    }

    const targetElement = document.querySelector(selector);
    if (!targetElement) {
      console.log('[tutorial] target selector found no element', { taskId, selector });
      return;
    }

    const isToggleTask = taskId === 'toggle-node';
    const isDragTask = taskId === 'drag-note';
    const panelHighlightTask = isToggleTask || isDragTask;
    const particleTarget = panelHighlightTask
      ? (targetElement.querySelector('canvas[data-role="drawgrid-nodes"]') || targetElement)
      : targetElement;
    const particleOptions = panelHighlightTask ? { layer: 'behind-target' } : null;
    let disposed = false;
    let flashTimer = null;
    const runParticles = () => {
      if (disposed) return;
      if (!taskElement.isConnected || !targetElement.isConnected) return;
      stopParticleStream();
      console.log('[tutorial] general runParticles', {
        taskId,
        taskClasses: taskElement.className,
        targetSelector: selector,
        targetClasses: targetElement.className,
      });
      if (particleOptions) {
        startParticleStream(taskElement, particleTarget, particleOptions);
      } else {
        startParticleStream(taskElement, particleTarget, { layer: 'behind-target' });
      }
    };
    const scheduleParticles = () => {
      requestAnimationFrame(() => requestAnimationFrame(runParticles));
    };
    const onResize = () => scheduleParticles();

    if (targetElement.classList.contains('tutorial-flash')) {
      targetElement.classList.remove('tutorial-flash');
      void targetElement.offsetWidth;
    }
    if (panelHighlightTask) {
      targetElement.classList.add('tutorial-guide-foreground');
      const eventName = isDragTask ? 'tutorial:highlight-drag' : 'tutorial:highlight-notes';
      try { targetElement.dispatchEvent(new CustomEvent(eventName, { detail: { active: true } })); } catch {}
    } else {
      targetElement.classList.add('tutorial-pulse-target', 'tutorial-active-pulse', 'tutorial-flash');
      flashTimer = setTimeout(() => {
        targetElement.classList.remove('tutorial-flash');
      }, 360);
    }
    scheduleParticles();
    window.addEventListener('resize', onResize, { passive: true });

    guideHighlightCleanup = () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      if (flashTimer) clearTimeout(flashTimer);
      if (panelHighlightTask) {
        targetElement.classList.remove('tutorial-guide-foreground');
        const eventName = isDragTask ? 'tutorial:highlight-drag' : 'tutorial:highlight-notes';
        try { targetElement.dispatchEvent(new CustomEvent(eventName, { detail: { active: false } })); } catch {}
      } else {
        targetElement.classList.remove('tutorial-pulse-target', 'tutorial-active-pulse', 'tutorial-flash');
      }
      stopParticleStream();
    };
  });

  window.addEventListener('guide:task-deactivate', () => {
    if (typeof guideHighlightCleanup === 'function') {
      try { guideHighlightCleanup(); } catch {}
      guideHighlightCleanup = null;
      return;
    }
    stopParticleStream();
    document.querySelectorAll('.toy-panel[data-toy="drawgrid"]').forEach(panel => {
      try { panel.dispatchEvent(new CustomEvent('tutorial:highlight-notes', { detail: { active: false } })); } catch {}
      try { panel.dispatchEvent(new CustomEvent('tutorial:highlight-drag', { detail: { active: false } })); } catch {}
      panel.classList.remove('tutorial-guide-foreground');
    });
    const spawner = document.querySelector('.toy-spawner-toggle');
    if (spawner) {
      spawner.classList.remove('tutorial-pulse-target', 'tutorial-addtoy-pulse', 'tutorial-flash');
    }
  });

  window.addEventListener('scene:new', () => {
    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    autoToyIgnoreCount = Math.max(autoToyIgnoreCount, 2);
    autoToyIgnoreDeadline = now + 1500;
    lastPlacedToy = null;
    guideToyTracker.reset?.();
    resetGuideProgress();
    document.querySelectorAll('.toy-panel[data-toy="drawgrid"]').forEach(panel => {
      try { panel.dispatchEvent(new CustomEvent('tutorial:highlight-notes', { detail: { active: false } })); } catch {}
      try { panel.dispatchEvent(new CustomEvent('tutorial:highlight-drag', { detail: { active: false } })); } catch {}
      panel.classList.remove('tutorial-guide-foreground');
    });
    scheduleDrawToySync();
    updatePlayRequirement();
  });

  document.addEventListener('click', (event) => {
    const rawTarget = event.target;
    if (!(rawTarget instanceof Element)) return;

    const playBtn = rawTarget.closest('[data-action="toggle-play"]');
    if (playBtn) {
      if (playBtn instanceof HTMLButtonElement && playBtn.disabled) return;
      if (playBtn.getAttribute('aria-disabled') === 'true') return;
      maybeCompleteTask('press-play');
      return;
    }

    const randomBtn = rawTarget.closest('[data-action="random"]');
    if (randomBtn) {
      if (randomBtn instanceof HTMLButtonElement && randomBtn.disabled) return;
      if (randomBtn.getAttribute('aria-disabled') === 'true') return;
      maybeCompleteTask('press-random');
      return;
    }

    const clearBtn = rawTarget.closest('[data-action="clear"]');
    if (clearBtn) {
      if (clearBtn instanceof HTMLButtonElement && clearBtn.disabled) return;
      if (clearBtn.getAttribute('aria-disabled') === 'true') return;
      maybeCompleteTask('press-clear');
    }
  }, { capture: true });

  const randomEvents = ['toy-random', 'toy-random-cubes', 'toy-random-blocks', 'toy-random-notes', 'loopgrid:random'];
  randomEvents.forEach(evt => document.addEventListener(evt, () => maybeCompleteTask('press-random'), { capture: true }));
  ['toy-clear', 'toy-reset'].forEach(evt => document.addEventListener(evt, () => maybeCompleteTask('press-clear'), { capture: true }));

})();


