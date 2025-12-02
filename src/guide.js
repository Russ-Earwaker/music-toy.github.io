const GUIDE_TOGGLE_CLASS = 'guide-launcher';
const GUIDE_OPEN_CLASS = 'is-open';

let hostRef = null;
let toggleRef = null;
let panelsRef = null;
let lastApi = null;
const goalExpansionState = new Map();
let highlighterRef = null;
let highlightNextTask = false;
let openFirstGoalNextRender = false;
const GUIDE_TAP_ACK_KEY = 'guide:task-tap-ack';
let activeGoalId = null;
let goalPickerRef = null;
let moreGoalsButtonRef = null;
let lastGuideContext = null;
let buttonsWrapRef = null;
let lastActiveTaskSelectionId = null;

function getHighlighterHost() {
  if (typeof document === 'undefined') return null;
  return document.querySelector('.topbar-menu-wrap')
    || document.querySelector('.app-topbar')
    || document.getElementById('topbar')
    || null;
}

function setActiveGoal(goalId) {
  const prev = activeGoalId || null;
  activeGoalId = goalId || null;
  if (prev !== activeGoalId && typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('guide:active-goal-change', { detail: { previous: prev, next: activeGoalId } })
      );
    } catch {}
  }
  try {
    if (typeof window !== 'undefined') {
      window.__guideActiveGoal = activeGoalId;
    }
  } catch {}
}

function getActiveGoal(goals, { completedGoals = new Set(), claimedRewards = new Set() } = {}) {
  const list = Array.isArray(goals) ? goals : [];
  if (!list.length) return null;
  if (activeGoalId) {
    const match = list.find(goal => {
      if (!goal || !goal.id) return false;
      if (goal.id !== activeGoalId) return false;
      // Allow already-completed/claimed goals to be reselected intentionally
      return true;
    });
    if (match) return match;
  }
  // Prefer goals that are completed but not claimed before moving on
  const pendingReward = list.find(goal => goal && goal.id && completedGoals.has(goal.id) && !claimedRewards.has(goal.id));
  if (pendingReward) return pendingReward;
  return list.find(goal => {
    if (!goal || !goal.id) return false;
    if (completedGoals.has(goal.id)) return false;
    if (claimedRewards.has(goal.id)) return false;
    return !(goal.isClaimed || goal.claimed || goal.completed);
  }) || list[0];
}

function closeGoalPicker() {
  if (goalPickerRef && goalPickerRef.isConnected) {
    goalPickerRef.remove();
  }
  goalPickerRef = null;
}

function openGoalPicker(context) {
  closeGoalPicker();
  const ctx = context || lastGuideContext || {};
  let goals = Array.isArray(ctx.goals) ? ctx.goals : [];
  const api = ctx.api || lastApi || (typeof window !== 'undefined' ? window.TutorialGoalsAPI : null);
  if ((!goals.length || !api) && api?.getGoals) {
    try { goals = api.getGoals() || goals; } catch {}
  }
  if (!goals.length || !api?.createPanel) return;

  const toSet = (value) =>
    (value instanceof Set
      ? new Set(value)
      : new Set(Array.isArray(value) ? value : []));

  const progress = api?.getGuideProgress?.() || {};
  const completedTasks = ctx.completedTasks || toSet(progress.completedTasks || []);
  const completedGoals = ctx.completedGoals || toSet(progress.completedGoals || []);
  const claimedRewards = ctx.claimedRewards || toSet(progress.claimedRewards || []);
  const pendingRewards = ctx.pendingRewards || new Set(
    [...completedGoals].filter((id) => !claimedRewards.has(id))
  );
  const totalRewards = goals.length;
  const collectedRewards = claimedRewards.size;

  goalPickerRef = document.createElement('div');
  goalPickerRef.className = 'guide-goal-picker';

  const backdrop = document.createElement('div');
  backdrop.className = 'guide-goal-picker__backdrop';
  goalPickerRef.appendChild(backdrop);

  const sheet = document.createElement('div');
  sheet.className = 'guide-goal-picker__sheet';
  goalPickerRef.appendChild(sheet);

  const header = document.createElement('div');
  header.className = 'guide-goal-picker__header';
  header.innerHTML = `Goals · <span class="guide-goal-picker__stars"><img src="/assets/UI/T_Star.png" alt="Stars" /> ${collectedRewards}/${totalRewards}</span>`;
  sheet.appendChild(header);

  const list = document.createElement('div');
  list.className = 'guide-goal-picker__list';
  sheet.appendChild(list);

  goals.forEach((goal, index) => {
    const panel = api.createPanel?.() || document.createElement('div');
    panel.classList.add('guide-goal-picker-item');
    panel.style.display = 'block';
    panel.style.visibility = 'visible';
    panel.style.position = 'relative';
    panel.style.left = '0';
    panel.style.top = '0';
    panel.style.transform = 'none';
    panel.style.opacity = '1';
    panel.style.width = '100%';
    panel.style.maxWidth = '100%';

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
        showClaimButton: false,
        activeTaskId,
        completedTaskIds: completedTasks || new Set(),
        completedGoals: completedGoals || new Set(),
        claimedRewards: claimedRewards || new Set(),
        pendingRewards: pendingRewards || new Set(),
      });
    } catch (err) {
      console.warn('[guide] populatePanel picker failed', err);
    }

    let headerEl = panel.querySelector('.tutorial-goals-header');
    if (!headerEl) {
      headerEl = document.createElement('div');
      headerEl.className = 'tutorial-goals-header';
      headerEl.textContent = goal?.title || 'Goal';
      panel.prepend(headerEl);
    }

    const bodyWrapper = document.createElement('div');
    const bodyContent = [];
    const tasks = panel.querySelector('.tutorial-goals-tasklist');
    const progressEl = panel.querySelector('.goal-progress');
    const reward = panel.querySelector('.tutorial-goals-reward');
    if (tasks) bodyContent.push(tasks);
    if (progressEl) bodyContent.push(progressEl);
    if (reward) bodyContent.push(reward);
    bodyWrapper.className = 'goal-body-wrapper';
    bodyContent.forEach(el => bodyWrapper.appendChild(el));
    if (!panel.contains(bodyWrapper)) panel.appendChild(bodyWrapper);
    bodyWrapper.style.display = 'none';

    panel.classList.add('is-collapsed', 'guide-goal-picker-card');
    headerEl.style.cursor = 'pointer';

    const activate = () => {
      if (claimedRewards.has(goal?.id)) {
        // Starting a fresh replay session for this goal:
        try {
          if (typeof window !== 'undefined') {
            const raw = (window.__guideReplayTasks && Array.isArray(window.__guideReplayTasks))
              ? window.__guideReplayTasks
              : [];
            const next = new Map(raw.map(([g, list]) => [g, new Set(list || [])]));
            next.set(goal.id, new Set());
            window.__guideReplayTasks = Array.from(next.entries()).map(
              ([g, set]) => [g, Array.from(set)]
            );
          }
        } catch {}
      }

      if (goal?.id) setActiveGoal(goal.id);
      if (highlighterRef) highlighterRef.classList.remove('is-visible');
      highlightNextTask = false;
      closeGoalPicker();
      openFirstGoalNextRender = true;
      if (lastApi) renderGuide(lastApi, { source: 'goal-picker-select' });
      if (hostRef && panelsRef) {
        hostRef.classList.add(GUIDE_OPEN_CLASS);
        panelsRef.style.display = 'block';
        panelsRef.classList.add('is-visible');
      }
    };

    headerEl.addEventListener('click', activate);
    list.appendChild(panel);
  });

  document.body.appendChild(goalPickerRef);
  const clickOutside = (ev) => {
    if (!goalPickerRef) return;
    if (!goalPickerRef.contains(ev.target)) {
      closeGoalPicker();
    }
  };
  backdrop.addEventListener('click', closeGoalPicker);
  document.addEventListener('mousedown', clickOutside, { once: true });
}

function showHighlighterForElement(el) {
  if (!highlighterRef || !el) return false;
  attachHighlighter();
  const rect = el.getBoundingClientRect();
  if (!rect || !Number.isFinite(rect.top) || !Number.isFinite(rect.right)) return false;
  highlighterRef.style.left = `${rect.right}px`;
  highlighterRef.style.top = `${rect.top + rect.height / 2}px`;
  highlighterRef.classList.add('is-visible');
  return true;
}

function shouldShowTapHighlighter() {
  try {
    const topbarMenu = document.getElementById('topbar-menu');
    const menuOpen = topbarMenu && !topbarMenu.hasAttribute('hidden');
    if (menuOpen) return false;

    const api = lastApi;
    if (!api) return false;
    const goals = api.getGoals?.() || [];
    if (!Array.isArray(goals) || goals.length === 0) return false;
    const firstGoal = goals[0];
    if (!firstGoal || !firstGoal.id) return false;
    const firstTask = Array.isArray(firstGoal.tasks) ? firstGoal.tasks[0] : null;
    if (!firstTask || !firstTask.id) return false;
    const progress = api.getGuideProgress?.() || {};
    const completedGoals = new Set(progress.completedGoals || []);
    const claimedRewards = new Set(progress.claimedRewards || []);
    const completedTasks = new Set(progress.completedTasks || []);
    const activeGoal = getActiveGoal(goals, { completedGoals, claimedRewards });
    if (!activeGoal || activeGoal.id !== firstGoal.id) return false;
    if (completedTasks.has(firstTask.id)) return false;
    return true;
  } catch {
    return false;
  }
}

function showHighlighterForGuide() {
  ensureHost();
  if (!toggleRef || !toggleRef.isConnected) return false;
  if (!shouldShowTapHighlighter()) return false;
  return showHighlighterForElement(toggleRef);
}

function attachHighlighter() {
  if (!highlighterRef) return;
  const host = getHighlighterHost();
  if (!host) return;
  if (highlighterRef.parentElement !== host) host.appendChild(highlighterRef);
}

function ensureHighlighter() {
  const existing = Array.from(document.querySelectorAll('.guide-task-highlighter'));
  if (existing.length > 0) {
    highlighterRef = existing[0];
    for (let i = 1; i < existing.length; i += 1) {
      existing[i].remove();
    }
  }
  if (!highlighterRef) {
    highlighterRef = document.createElement('div');
    highlighterRef.className = 'guide-task-highlighter';
    highlighterRef.innerHTML = `
      <div class="guide-task-highlighter-arrow"></div>
      <div class="guide-task-highlighter-text">TAP</div>
    `;
  }
  attachHighlighter();
  updateHighlighterTapState();
}

function readGuideTapAcknowledged() {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    return !!window.localStorage.getItem(GUIDE_TAP_ACK_KEY);
  } catch {
    return false;
  }
}

function setGuideTapAcknowledged(value) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (value) {
      window.localStorage.setItem(GUIDE_TAP_ACK_KEY, '1');
    } else {
      window.localStorage.removeItem(GUIDE_TAP_ACK_KEY);
    }
  } catch {}
}

function updateHighlighterTapState() {
  if (!highlighterRef) return;
  const shouldHide = readGuideTapAcknowledged();
  highlighterRef.classList.toggle('guide-task-highlighter--tap-hidden', shouldHide);
}

function addGuidePulse() { try { window.dispatchEvent(new CustomEvent('guide:request-pulse')); } catch (e) { console.warn('guide:request-pulse failed', e); } }

function removeGuidePulse() { try { window.dispatchEvent(new CustomEvent('guide:cancel-pulse')); } catch (e) { console.warn('guide:cancel-pulse failed', e); } }

function isPlaceAToyIntroActive(api) {
  try {
    const goals = api?.getGoals?.() || [];
    if (!Array.isArray(goals)) return false;
    const activeGoal = goals.find((goal) => goal && (goal.active || goal.isActive || goal.isCurrent));
    if (!activeGoal) return false;
    const title = String(activeGoal.title || '').toLowerCase();
    if (!title.includes('place a toy')) return false;
    const tasks = Array.isArray(activeGoal.tasks) ? activeGoal.tasks : [];
    if (!tasks.length) return false;
    const firstTask = tasks[0];
    return !!firstTask && !firstTask.completed;
  } catch {
    return false;
  }
}

function ensureStyles() {
  if (!document.getElementById('tutorial-styles')) {
    const link = document.createElement('link');
    link.id = 'tutorial-styles';
    link.rel = 'stylesheet';
    link.href = 'src/tutorial.css';
    document.head.appendChild(link);
  }
  if (!document.getElementById('guide-styles')) {
    const guideLink = document.createElement('link');
    guideLink.id = 'guide-styles';
    guideLink.rel = 'stylesheet';
    guideLink.href = 'src/guide.css';
    document.head.appendChild(guideLink);
  }
}

function ensureHost() {
  if (hostRef && panelsRef && toggleRef) {
    attachHighlighter();
    return hostRef;
  }

  hostRef = document.querySelector(`.${GUIDE_TOGGLE_CLASS}`) || document.createElement('div');
  hostRef.className = GUIDE_TOGGLE_CLASS;

  ensureHighlighter();

  if (!buttonsWrapRef || !buttonsWrapRef.isConnected) {
    buttonsWrapRef = document.createElement('div');
    buttonsWrapRef.className = 'guide-launcher-buttons';
    hostRef.appendChild(buttonsWrapRef);
  }

  if (!panelsRef || !panelsRef.isConnected) {
    panelsRef = document.querySelector('.guide-panels-container') || document.createElement('div');
    panelsRef.className = 'guide-panels-container';
    hostRef.appendChild(panelsRef);
  }

  if (!toggleRef || !toggleRef.isConnected) {
    toggleRef = document.createElement('button');
    toggleRef.type = 'button';
    toggleRef.className = 'c-btn guide-toggle';
    toggleRef.id = 'guide-button';
    toggleRef.title = 'Guide';
    toggleRef.dataset.helpLabel = 'Guide';
    toggleRef.dataset.helpPosition = 'top';
    toggleRef.setAttribute('aria-label', 'Guide');
    toggleRef.innerHTML = '<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>';
    buttonsWrapRef.appendChild(toggleRef);
  } else {
    toggleRef.classList.add('c-btn');
    if (toggleRef.parentElement !== buttonsWrapRef) {
      buttonsWrapRef.appendChild(toggleRef);
    }
  }
  toggleRef.id = 'guide-button';
  toggleRef.title = 'Guide';
  if (!toggleRef.dataset.helpLabel) toggleRef.dataset.helpLabel = 'Guide';
  if (!toggleRef.dataset.helpPosition) toggleRef.dataset.helpPosition = 'top';
  toggleRef.setAttribute('aria-label', 'Guide');
  const toggleCore = toggleRef.querySelector('.c-btn-core');
  if (toggleCore) {
    toggleCore.style.setProperty('--c-btn-icon-url', "url('/assets/UI/T_Guide.png')");
  }

  if (!moreGoalsButtonRef || !moreGoalsButtonRef.isConnected) {
    moreGoalsButtonRef = document.createElement('button');
    moreGoalsButtonRef.type = 'button';
    moreGoalsButtonRef.className = 'c-btn guide-more-goals';
    moreGoalsButtonRef.style.display = 'none';
    moreGoalsButtonRef.title = 'More goals';
    moreGoalsButtonRef.dataset.helpLabel = 'Goal select menu';
    moreGoalsButtonRef.dataset.helpPosition = 'right';
    moreGoalsButtonRef.setAttribute('aria-label', 'More goals');
    moreGoalsButtonRef.innerHTML = '<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>';
    buttonsWrapRef.appendChild(moreGoalsButtonRef);
  }
  const moreCore = moreGoalsButtonRef?.querySelector('.c-btn-core');
  if (moreCore) {
    moreCore.style.setProperty('--c-btn-icon-url', "url('/assets/UI/T_3Dots.png')");
  }
  if (moreGoalsButtonRef && !moreGoalsButtonRef.dataset.helpLabel) {
    moreGoalsButtonRef.dataset.helpLabel = 'Goal select menu';
  }
  if (moreGoalsButtonRef && !moreGoalsButtonRef.dataset.helpPosition) {
    moreGoalsButtonRef.dataset.helpPosition = 'right';
  }

  if (!toggleRef.__guideBound) {
    toggleRef.addEventListener('click', () => {
      const willOpen = !hostRef.classList.contains(GUIDE_OPEN_CLASS);
      hostRef.classList.toggle(GUIDE_OPEN_CLASS, willOpen);
      panelsRef.style.display = willOpen ? 'block' : 'none';
      panelsRef.classList.toggle('is-visible', willOpen);
      if (moreGoalsButtonRef) {
        moreGoalsButtonRef.style.display = willOpen ? '' : 'none';
      }
      if (willOpen && highlightNextTask) {
        setTimeout(() => {
          let firstTaskEl = null;
          if (shouldShowTapHighlighter()) {
            const firstTaskId = getFirstGoalFirstTaskId();
            if (firstTaskId && panelsRef) {
              firstTaskEl = panelsRef.querySelector(`.goal-task[data-task-id="${firstTaskId}"]`);
            }
          }
          if (!firstTaskEl || !showHighlighterForElement(firstTaskEl)) {
            if (highlighterRef) highlighterRef.classList.remove('is-visible');
          }
        }, 100);
        highlightNextTask = false;
      }
      if (!willOpen) {
        closeGoalPicker();
        if (highlighterRef) highlighterRef.classList.remove('is-visible');
        panelsRef.querySelectorAll('.is-active-guide-task').forEach(el => el.classList.remove('is-active-guide-task'));
        window.dispatchEvent(new CustomEvent('guide:task-deactivate', { bubbles: true, composed: true }));
        try { window.dispatchEvent(new CustomEvent('guide:close', { bubbles: true, composed: true })); } catch {}
      } else {
        try { window.dispatchEvent(new CustomEvent('guide:open', { bubbles: true, composed: true })); } catch {}
      }
      try {
        window.__guideDebug = Object.assign({}, window.__guideDebug || {}, {
          lastToggle: { open: willOpen, at: Date.now() },
        });
      } catch {}
      console.info('[guide] toggle', { open: willOpen, goalCount: Number(hostRef.dataset.goalCount || 0) });
    });
    toggleRef.__guideBound = true;

    try { if (isPlaceAToyIntroActive(api || lastApi)) addGuidePulse(); else removeGuidePulse(); } catch {}
  }

  if (!hostRef.isConnected) {
    panelsRef.style.display = 'none';
    document.body.appendChild(hostRef);
  }
  if (moreGoalsButtonRef && !moreGoalsButtonRef.__guideBound) {
    moreGoalsButtonRef.__guideBound = true;
    moreGoalsButtonRef.addEventListener('click', () => {
      try {
        window.dispatchEvent(new CustomEvent('guide:open-goal-picker', { bubbles: true, composed: true }));
      } catch {}
    });
  }
  return hostRef;
}

function getFirstGoalFirstTaskId() {
  try {
    const goals = lastGuideContext?.goals || lastApi?.getGoals?.() || [];
    if (!Array.isArray(goals) || goals.length === 0) return null;
    const firstGoal = goals[0];
    const firstTask = Array.isArray(firstGoal?.tasks) ? firstGoal.tasks[0] : null;
    return firstTask?.id || null;
  } catch {
    return null;
  }
}

function closeGuide() {
  if (!hostRef) hostRef = document.querySelector(`.${GUIDE_TOGGLE_CLASS}`) || hostRef;
  if (!panelsRef) panelsRef = document.querySelector('.guide-panels-container') || panelsRef;
  if (!hostRef || !panelsRef) return;
  if (highlighterRef) highlighterRef.classList.remove('is-visible');
  hostRef.classList.remove(GUIDE_OPEN_CLASS);
  panelsRef.style.display = 'none';
  panelsRef.classList.remove('is-visible');
  panelsRef.querySelectorAll('.is-active-guide-task').forEach((taskEl) => {
    taskEl.classList.remove('is-active-guide-task');
  });
  lastActiveTaskSelectionId = null;
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
  const replayTasksRaw = (typeof window !== 'undefined' && window.__guideReplayTasks) || [];
  const replayTasks = new Map(
    Array.isArray(replayTasksRaw)
      ? replayTasksRaw.map(([g, list]) => [g, new Set(list || [])])
      : []
  );
  lastGuideContext = { goals, api, completedTasks, completedGoals, claimedRewards, pendingRewards };

  hostRef.dataset.guideState = hasGoals ? 'has-goals' : 'no-goals';
  hostRef.dataset.goalCount = String(goals.length);

  clearPanels();

  if (hasGoals && api?.createPanel) {
    const activePanels = [];
    const panelMeta = [];
    let expandedCount = 0;

    const visibleGoal = getActiveGoal(goals, { completedGoals, claimedRewards });
    if (visibleGoal && visibleGoal.id && activeGoalId !== visibleGoal.id) {
      setActiveGoal(visibleGoal.id);
    } else if (!visibleGoal && activeGoalId) {
      setActiveGoal(null);
    }

    const buildGoalPanel = (goal, index, { forceExpanded = false, lockCollapsed = false } = {}) => {
      const panel = api.createPanel?.();
      if (!panel) {
        console.warn('[guide] createPanel returned no panel', { index, goal });
        return null;
      }
      const goalId = goal?.id;
      const willBeFirstActive = activePanels.length === 0;
      panel.classList.add('guide-goals-panel');
      panel.removeAttribute('id');

      let goalTasks = Array.isArray(goal.tasks) ? goal.tasks : [];
      let replaySession = false;
      let panelCompletedTasks = completedTasks;
      let replayComplete = false;
      try {
        replaySession = claimedRewards.has(goalId) && goalId === activeGoalId;
        panelCompletedTasks = completedTasks;
        if (replaySession) {
          const sessionSet = replayTasks.get(goalId);
          panelCompletedTasks = sessionSet instanceof Set ? new Set(sessionSet) : new Set();
        }
        let activeTaskId = null;
        for (const task of goalTasks) {
          const taskId = task?.id;
          if (!taskId) continue;
          if (!panelCompletedTasks.has(taskId)) {
            activeTaskId = taskId;
            break;
          }
        }
        // If the goal is already completed/claimed, still show from the top
        if ((completedGoals.has(goalId) || claimedRewards.has(goalId)) && goalTasks.length) {
          activeTaskId = goalTasks[0]?.id || activeTaskId;
        }
        replayComplete = replaySession && goalTasks.every(
          (task) => !task?.id || panelCompletedTasks.has(task.id)
        );

        api.populatePanel?.(panel, goal, {
          taskIndex: 0,
          showClaimButton: true,
          activeTaskId,
          completedTaskIds: panelCompletedTasks,
          completedGoals,
          claimedRewards,
          pendingRewards,
          replaySession,
          replayComplete,
        });
      } catch (err) {
        console.warn('[guide] populatePanel failed', err);
      }

      if (replaySession) {
        const rewardEl = panel.querySelector('.tutorial-goals-reward');
        if (rewardEl) {
          // Hide reward UI but keep the claim/complete button visible
          rewardEl.querySelectorAll('.goal-reward-label, .goal-reward-description, .goal-reward-icons, .tutorial-goals-reward-claimed').forEach((el) => {
            el.style.display = 'none';
          });
          rewardEl.style.display = '';
        }
      }

      const claimBtn = panel.querySelector('.tutorial-claim-btn');
      if (claimBtn && !claimBtn.__guideBound) {
        claimBtn.__guideBound = true;
        claimBtn.addEventListener('click', () => {
          const targetGoalId = claimBtn.dataset.goalId || goal.id;
          openFirstGoalNextRender = true;
          window.dispatchEvent(new CustomEvent('guide:task-deactivate', { bubbles: true, composed: true }));
          const alreadyClaimed = claimedRewards.has(targetGoalId);
          if (alreadyClaimed) {
            // Replay mode: no reward, just refresh panel
            setActiveGoal(null);
            renderGuide(api, { source: 'replay-complete' });
            return;
          }
          setActiveGoal(null);
          if (typeof api.claimReward === 'function') {
            api.claimReward(targetGoalId);
          }
        });
      }
      if (claimBtn) {
        const alreadyClaimed = claimedRewards.has(goalId);
        const allDone = replaySession
          ? replayComplete
          : goalTasks.every(task => !task?.id || panelCompletedTasks.has(task.id));
        const showClaim = allDone;
        claimBtn.textContent = replaySession
          ? 'Complete'
          : (alreadyClaimed ? 'Complete' : 'Collect Reward');
        claimBtn.style.display = showClaim ? '' : 'none';
        claimBtn.classList.toggle('is-visible', showClaim);
        claimBtn.disabled = !showClaim;
      }

      if (claimedRewards.has(goalId) && !pendingRewards.has(goalId)) {
        const rewardEl = panel.querySelector('.tutorial-goals-reward');
        if (rewardEl) {
          let claimedMsg = rewardEl.querySelector('.tutorial-goals-reward-claimed');
          if (!claimedMsg) {
            claimedMsg = document.createElement('div');
            claimedMsg.className = 'tutorial-goals-reward-claimed';
            rewardEl.prepend(claimedMsg);
          }
          claimedMsg.textContent = 'Reward already claimed';
        }

        const tasksEl = panel.querySelectorAll('.goal-task');
        tasksEl.forEach((task) => {
          // For *non-active* goals, keep them visually done.
          // For the active replay session, let the per-session completion state drive styles.
          if (replaySession && goal.id === goalId) {
            task.classList.remove('goal-task-claimed');
          } else {
            task.classList.add('goal-task-claimed');
          }
        });
      } else if (!replaySession) {
        const rewardEl = panel.querySelector('.tutorial-goals-reward');
        const desc = rewardEl?.querySelector('.goal-reward-description');
        if (desc) desc.textContent = 'A Star. A symbol of Achievement.';
      }

      panel.querySelectorAll('.goal-task').forEach((taskEl) => {
        taskEl.style.cursor = 'pointer';
        taskEl.addEventListener('click', () => {
          if (highlighterRef) highlighterRef.classList.remove('is-visible');
          const isActive = taskEl.classList.contains('is-active-guide-task');
          if (isActive) {
            taskEl.classList.remove('is-active-guide-task');
            lastActiveTaskSelectionId = null;
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
              lastActiveTaskSelectionId = taskId;
              window.dispatchEvent(new CustomEvent('guide:task-click', {
                detail: { taskId, taskElement: taskEl },
                bubbles: true,
                composed: true,
              }));
            }
          }
        });
      });

      const restoreActiveTaskSelection = () => {
        if (!lastActiveTaskSelectionId) return;
        const el = panel.querySelector(`.goal-task[data-task-id="${lastActiveTaskSelectionId}"]`);
        if (!el) return;
        el.classList.add('is-active-guide-task');
        try {
          window.dispatchEvent(new CustomEvent('guide:task-click', {
            detail: { taskId: lastActiveTaskSelectionId, taskElement: el },
            bubbles: true,
            composed: true,
          }));
        } catch {}
      };

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
        const shouldExpand = forceExpanded ? true : (storedExpanded !== undefined ? !!storedExpanded : willBeFirstActive);
        if (shouldExpand) expandedCount += 1;
        if (stateKey) goalExpansionState.set(stateKey, shouldExpand);

        header.style.cursor = lockCollapsed ? 'default' : 'pointer';
        panel.classList.toggle('is-collapsed', !shouldExpand);
        bodyWrapper.style.display = shouldExpand ? '' : 'none';
        panelMeta.push({ panel, bodyWrapper, stateKey });

        if (!lockCollapsed) {
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
      }

      return panel;
    };

    if (visibleGoal) {
      const panel = buildGoalPanel(visibleGoal, 0, { forceExpanded: true });
      if (panel) activePanels.push(panel);
    }

    const orderedPanels = [...activePanels];
    orderedPanels.forEach(panel => panelsRef.appendChild(panel));

    if (openFirstGoalNextRender && orderedPanels.length > 0) {
      const targetPanel = orderedPanels[0];
      const meta = panelMeta.find(entry => entry.panel === targetPanel);
      if (meta && meta.bodyWrapper) {
        const wasCollapsed = targetPanel.classList.contains('is-collapsed');
        targetPanel.classList.remove('is-collapsed');
        meta.bodyWrapper.style.display = '';
        if (wasCollapsed) expandedCount += 1;
        if (meta.stateKey) goalExpansionState.set(meta.stateKey, true);
        openFirstGoalNextRender = false;
      }
    }

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

    // Restore previously active task highlight after render
    if (lastActiveTaskSelectionId && orderedPanels.length > 0) {
      const el = orderedPanels[0].querySelector(`.goal-task[data-task-id="${lastActiveTaskSelectionId}"]`);
      if (el) {
        el.classList.add('is-active-guide-task');
        try {
          window.dispatchEvent(new CustomEvent('guide:task-click', {
            detail: { taskId: lastActiveTaskSelectionId, taskElement: el },
            bubbles: true,
            composed: true,
          }));
        } catch {}
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
  const multipleGoals = goals.length > 1;
  if (moreGoalsButtonRef) {
    moreGoalsButtonRef.style.display = open && multipleGoals ? '' : 'none';
    moreGoalsButtonRef.disabled = !multipleGoals;
  }

  try {
    if (isPlaceAToyIntroActive(api)) addGuidePulse(); else removeGuidePulse();
  } catch {
    removeGuidePulse();
  }

  try {
    window.__guideDebug = Object.assign({}, window.__guideDebug || {}, {
      lastRender: stamp,
      goalCount: goals.length,
      source,
      host: hostRef,
    });
  } catch {}

  //console.info('[guide] render', { source, goals: goals.length });
}

window.addEventListener('guide:progress-update', () => {
  if (lastApi) {
    renderGuide(lastApi, { source: 'progress-update' });
  }
  if (!shouldShowTapHighlighter() && highlighterRef) {
    highlighterRef.classList.remove('is-visible');
    highlightNextTask = false;
  }
});

window.addEventListener('guide:open', () => {
  setGuideTapAcknowledged(true);
  updateHighlighterTapState();
  if (highlighterRef && !shouldShowTapHighlighter()) {
    highlighterRef.classList.remove('is-visible');
  }
});

window.addEventListener('guide:clear-active-task', () => {
  lastActiveTaskSelectionId = null;
  if (panelsRef) {
    panelsRef.querySelectorAll('.is-active-guide-task').forEach((taskEl) => {
      taskEl.classList.remove('is-active-guide-task');
    });
  }
  if (highlighterRef) highlighterRef.classList.remove('is-visible');
});

window.addEventListener('scene:new', () => {
  try {
    const api = window.TutorialGoalsAPI || lastApi;
    if (isPlaceAToyIntroActive(api)) addGuidePulse(); else removeGuidePulse();
  } catch {
    addGuidePulse();
  }
  goalExpansionState.clear();
  setActiveGoal(null);
  openFirstGoalNextRender = true;
  highlightNextTask = true;
  requestAnimationFrame(() => {
    if (!showHighlighterForGuide() && highlighterRef) highlighterRef.classList.remove('is-visible');
  });
  if (lastApi || window.TutorialGoalsAPI) {
    const api = lastApi || window.TutorialGoalsAPI;
    renderGuide(api, { source: 'scene-new' });
  }
}, { passive: true });

window.addEventListener('tutorial:goals-updated', () => {
  try {
    const api = window.TutorialGoalsAPI || lastApi;
    if (isPlaceAToyIntroActive(api)) addGuidePulse(); else removeGuidePulse();
  } catch {
    removeGuidePulse();
  }
}, { passive: true });

window.addEventListener('guide:close', () => closeGuide());
window.addEventListener('guide:highlight-next-task', () => {
  highlightNextTask = true;
  const guideOpen = hostRef && hostRef.classList.contains(GUIDE_OPEN_CLASS);
  if (guideOpen && panelsRef) {
    let target = null;
    if (shouldShowTapHighlighter()) {
      const firstTaskId = getFirstGoalFirstTaskId();
      if (firstTaskId) {
        target = panelsRef.querySelector(`.goal-task[data-task-id="${firstTaskId}"]`);
      }
    }
    if (target && showHighlighterForElement(target)) {
      highlightNextTask = false;
    } else if (highlighterRef) {
      highlighterRef.classList.remove('is-visible');
      highlightNextTask = false;
    }
  } else if (!showHighlighterForGuide() && highlighterRef) {
    highlighterRef.classList.remove('is-visible');
  }
});

window.addEventListener('guide:highlight-hide', () => {
  highlightNextTask = false;
  if (highlighterRef) highlighterRef.classList.remove('is-visible');
});

window.addEventListener('guide:open-goal-picker', () => {
  openGoalPicker();
});

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






if (typeof window !== 'undefined') {
  window.addEventListener('guide:task-tapped', () => {
    setGuideTapAcknowledged(true);
    updateHighlighterTapState();
  });
  window.addEventListener('scene:new', () => {
    setGuideTapAcknowledged(false);
    updateHighlighterTapState();
  });
}

window.addEventListener('drawgrid:update', (e) => {
  const { activityOnly } = e.detail || {};
  if (!activityOnly) {
    window.dispatchEvent(new Event('guide:progress-update'));
  }
});

window.addEventListener('drawgrid:activity', (e) => {
  // no pulse; optional: a very lightweight guide refresh without glow
  // renderGuide(lastApi, { source: 'drawgrid-activity', pulse:false });
});



