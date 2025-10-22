const GUIDE_TOGGLE_CLASS = 'guide-launcher';
const GUIDE_OPEN_CLASS = 'is-open';

let hostRef = null;
let toggleRef = null;
let panelsRef = null;
let lastApi = null;
const goalExpansionState = new Map();

function ensureStyles() {
  if (document.getElementById('tutorial-styles')) return;
  const link = document.createElement('link');
  link.id = 'tutorial-styles';
  link.rel = 'stylesheet';
  link.href = 'src/tutorial.css';
  document.head.appendChild(link);
}

function ensureHost() {
  if (hostRef && panelsRef && toggleRef) return hostRef;

  hostRef = document.querySelector(`.${GUIDE_TOGGLE_CLASS}`) || document.createElement('div');
  hostRef.className = GUIDE_TOGGLE_CLASS;

  if (!toggleRef || !toggleRef.isConnected) {
    toggleRef = document.createElement('button');
    toggleRef.type = 'button';
    toggleRef.className = 'toy-btn guide-toggle';
    toggleRef.textContent = 'Guide';
    toggleRef.style.fontSize = '1.75rem';
    hostRef.appendChild(toggleRef);
  }

  if (!panelsRef || !panelsRef.isConnected) {
    panelsRef = document.createElement('div');
    panelsRef.className = 'guide-panels-container';
    hostRef.appendChild(panelsRef);
  }

  if (!toggleRef.__guideBound) {
    toggleRef.addEventListener('click', () => {
      const willOpen = !hostRef.classList.contains(GUIDE_OPEN_CLASS);
      hostRef.classList.toggle(GUIDE_OPEN_CLASS, willOpen);
      panelsRef.style.display = willOpen ? 'block' : 'none';
      panelsRef.classList.toggle('is-visible', willOpen);
      if (!willOpen) {
        panelsRef.querySelectorAll('.is-active-guide-task').forEach(el => el.classList.remove('is-active-guide-task'));
        window.dispatchEvent(new CustomEvent('guide:task-deactivate', { bubbles: true, composed: true }));
      }
      try {
        window.__guideDebug = Object.assign({}, window.__guideDebug || {}, {
          lastToggle: { open: willOpen, at: Date.now() },
        });
      } catch {}
      console.info('[guide] toggle', { open: willOpen, goalCount: Number(hostRef.dataset.goalCount || 0) });
    });
    toggleRef.__guideBound = true;
  }

  if (!hostRef.isConnected) {
    panelsRef.style.display = 'none';
    document.body.appendChild(hostRef);
  }
  return hostRef;
}

function closeGuide() {
  if (!hostRef) hostRef = document.querySelector(`.${GUIDE_TOGGLE_CLASS}`) || hostRef;
  if (!panelsRef) panelsRef = document.querySelector('.guide-panels-container') || panelsRef;
  if (!hostRef || !panelsRef) return;
  hostRef.classList.remove(GUIDE_OPEN_CLASS);
  panelsRef.style.display = 'none';
  panelsRef.classList.remove('is-visible');
  panelsRef.querySelectorAll('.is-active-guide-task').forEach((taskEl) => {
    taskEl.classList.remove('is-active-guide-task');
  });
  try {
    window.dispatchEvent(new CustomEvent('guide:task-deactivate', { bubbles: true, composed: true }));
  } catch {}
}

function clearPanels() {
  if (!panelsRef) return;
  while (panelsRef.firstChild) panelsRef.removeChild(panelsRef.firstChild);
}

function renderGuide(api, { source = 'unknown' } = {}) {
  ensureStyles();
  ensureHost();
  if (api) lastApi = api;

  const stamp = Date.now();
  let goals = [];
  if (api) {
    try {
      goals = api.getGoals?.() || [];
    } catch (err) {
      console.warn('[guide] getGoals threw', err);
    }
  }
  if (!Array.isArray(goals)) goals = [];
  const hasGoals = goals.length > 0;
  const toSet = (value) => (value instanceof Set ? new Set(value) : new Set(Array.isArray(value) ? value : []));
  const progress = api?.getGuideProgress?.() || {};
  const completedTasks = toSet(progress.completedTasks || []);
  const completedGoals = toSet(progress.completedGoals || []);
  const claimedRewards = toSet(progress.claimedRewards || []);
  const pendingRewards = new Set([...completedGoals].filter((id) => !claimedRewards.has(id)));

  hostRef.dataset.guideState = hasGoals ? 'has-goals' : 'no-goals';
  hostRef.dataset.goalCount = String(goals.length);

  clearPanels();

  if (hasGoals && api?.createPanel) {
    const activePanels = [];
    const claimedPanels = [];
    const panelMeta = [];
    let expandedCount = 0;

    goals.forEach((goal, index) => {
      const panel = api.createPanel?.();
      if (!panel) {
        console.warn('[guide] createPanel returned no panel', { index, goal });
        return;
      }
      const goalId = goal?.id;
      const goalClaimed = goalId ? claimedRewards.has(goalId) : false;
      const willBeFirstActive = !goalClaimed && activePanels.length === 0;
      panel.classList.add('guide-goals-panel');
      panel.removeAttribute('id');

      try {
        const goalTasks = Array.isArray(goal.tasks) ? goal.tasks : [];
        let activeTaskId = null;
        for (const task of goalTasks) {
          const taskId = task?.id;
          if (!taskId) continue;
          if (!completedTasks.has(taskId)) {
            activeTaskId = taskId;
            break;
          }
        }

        api.populatePanel?.(panel, goal, {
          taskIndex: 0,
          showClaimButton: true,
          activeTaskId,
          completedTaskIds: completedTasks,
          completedGoals,
          claimedRewards,
          pendingRewards,
        });
      } catch (err) {
        console.warn('[guide] populatePanel failed', err);
      }


      const claimBtn = panel.querySelector('.tutorial-claim-btn');
      if (claimBtn && !claimBtn.__guideBound) {
        claimBtn.__guideBound = true;
        claimBtn.addEventListener('click', () => {
          const targetGoalId = claimBtn.dataset.goalId || goal.id;
          window.dispatchEvent(new CustomEvent('guide:task-deactivate', { bubbles: true, composed: true }));
          if (typeof api.claimReward === 'function') {
            api.claimReward(targetGoalId);
          }
        });
      }

      panel.querySelectorAll('.goal-task').forEach((taskEl) => {
        taskEl.style.cursor = 'pointer';
        taskEl.addEventListener('click', () => {
          const isActive = taskEl.classList.contains('is-active-guide-task');
          if (isActive) {
            taskEl.classList.remove('is-active-guide-task');
            window.dispatchEvent(new CustomEvent('guide:task-deactivate', { bubbles: true, composed: true }));
          } else {
            const currentActive = panel.querySelector('.is-active-guide-task');
            if (currentActive) {
              currentActive.classList.remove('is-active-guide-task');
              window.dispatchEvent(new CustomEvent('guide:task-deactivate', { bubbles: true, composed: true }));
            }
            taskEl.classList.add('is-active-guide-task');
            const taskId = taskEl.dataset.taskId;
            if (taskId) {
              window.dispatchEvent(new CustomEvent('guide:task-click', {
                detail: { taskId, taskElement: taskEl },
                bubbles: true,
                composed: true,
              }));
            }
          }
        });
      });

      const header = panel.querySelector('.tutorial-goals-header');
      const tasks = panel.querySelector('.tutorial-goals-tasks');
      const progress = panel.querySelector('.tutorial-goals-progress');
      const reward = panel.querySelector('.tutorial-goals-reward');

      if (header && (tasks || progress || reward)) {
        const bodyContent = [tasks, progress, reward].filter(Boolean);
        const bodyWrapper = document.createElement('div');
        bodyWrapper.className = 'goal-body-wrapper';
        bodyWrapper.style.background = 'rgba(0,0,0,0.2)';
        bodyWrapper.style.padding = '10px';
        bodyWrapper.style.borderRadius = '8px';
        bodyContent.forEach((el) => bodyWrapper.appendChild(el));
        panel.appendChild(bodyWrapper);

        const stateKey = goalId || `__index_${index}`;
        const storedExpanded = stateKey ? goalExpansionState.get(stateKey) : undefined;
        const shouldExpand = storedExpanded !== undefined ? !!storedExpanded : willBeFirstActive;
        if (shouldExpand) expandedCount += 1;
        if (stateKey) goalExpansionState.set(stateKey, shouldExpand);

        header.style.cursor = 'pointer';
        panel.classList.toggle('is-collapsed', !shouldExpand);
        bodyWrapper.style.display = shouldExpand ? '' : 'none';
        panelMeta.push({ panel, bodyWrapper, stateKey });

        header.addEventListener('click', () => {
          const isCollapsed = panel.classList.contains('is-collapsed');
          panel.classList.toggle('is-collapsed', !isCollapsed);
          const nowCollapsed = panel.classList.contains('is-collapsed');
          bodyWrapper.style.display = nowCollapsed ? 'none' : '';
          if (nowCollapsed) {
            if (expandedCount > 0) expandedCount -= 1;
          } else {
            expandedCount += 1;
          }
          if (stateKey) goalExpansionState.set(stateKey, !nowCollapsed);
          if (nowCollapsed) {
            panel.querySelectorAll('.is-active-guide-task').forEach(task => task.classList.remove('is-active-guide-task'));
            window.dispatchEvent(new CustomEvent('guide:task-deactivate', { bubbles: true, composed: true }));
          }
        });
      }

      if (goalClaimed) {
        panel.classList.add('is-collapsed');
        panel.querySelectorAll('.goal-task.is-active-guide-task').forEach((taskEl) => taskEl.classList.remove('is-active-guide-task'));
        const existingWrapper = panel.querySelector('.goal-body-wrapper');
        if (existingWrapper) existingWrapper.style.display = 'none';
        window.dispatchEvent(new CustomEvent('guide:task-deactivate', { bubbles: true, composed: true }));
        if (goalId) goalExpansionState.set(goalId, false);
        claimedPanels.push(panel);
      } else {
        activePanels.push(panel);
      }

    });

    const orderedPanels = [...activePanels, ...claimedPanels];
    orderedPanels.forEach(panel => panelsRef.appendChild(panel));

    if (expandedCount === 0 && orderedPanels.length > 0) {
      const targetPanel = orderedPanels[0];
      const meta = panelMeta.find(entry => entry.panel === targetPanel);
      if (meta && meta.bodyWrapper) {
        targetPanel.classList.remove('is-collapsed');
        meta.bodyWrapper.style.display = '';
        expandedCount = 1;
        if (meta.stateKey) goalExpansionState.set(meta.stateKey, true);
      }
    }
  } else {
    const empty = document.createElement('div');
    empty.className = 'guide-empty-state';
    empty.textContent = 'Guide will unlock once tutorial goals are available.';
    panelsRef.appendChild(empty);
  }

  const open = hostRef.classList.contains(GUIDE_OPEN_CLASS);
  panelsRef.style.display = open ? 'block' : 'none';
  panelsRef.classList.toggle('is-visible', open);

  try {
    window.__guideDebug = Object.assign({}, window.__guideDebug || {}, {
      lastRender: stamp,
      goalCount: goals.length,
      source,
      host: hostRef,
    });
  } catch {}

  console.info('[guide] render', { source, goals: goals.length });
}

window.addEventListener('guide:progress-update', () => {
  if (lastApi) {
    renderGuide(lastApi, { source: 'progress-update' });
  }
});

window.addEventListener('guide:close', () => closeGuide());

function startWhenReady() {
  renderGuide(null, { source: 'bootstrap-placeholder' });

  if (window.TutorialGoalsAPI) {
    console.info('[guide] TutorialGoalsAPI available on load');
    renderGuide(window.TutorialGoalsAPI, { source: 'direct' });
    return;
  }

  console.info('[guide] waiting for tutorial:goals-ready event');
  try { window.__guideDebug = Object.assign({}, window.__guideDebug || {}, { waiting: true }); } catch {}

  let fallbackTimer = setTimeout(() => {
    console.warn('[guide] tutorial API not ready after delay, keeping placeholder');
    try { window.__guideDebug = Object.assign({}, window.__guideDebug || {}, { fallbackAt: Date.now() }); } catch {}
  }, 2500);

  window.addEventListener('tutorial:goals-ready', (event) => {
    console.info('[guide] tutorial:goals-ready received');
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    const api = event?.detail || window.TutorialGoalsAPI;
    renderGuide(api, { source: 'event' });
    try { window.__guideDebug = Object.assign({}, window.__guideDebug || {}, { waiting: false }); } catch {}
  }, { once: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startWhenReady, { once: true });
} else {
  startWhenReady();
}
