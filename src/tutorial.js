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

const TUTORIAL_ZOOM = 1.15; // adjust to taste (1.0–1.3 are good)

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
        id: 'add-draw-toy',
        label: 'Open the Add Toy menu and drag in a new Draw Line toy',
        requirement: 'add-toy-drawgrid',
      },
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
];

function cloneGoal(goal) {
  if (!goal) return null;
  try {
    return JSON.parse(JSON.stringify(goal));
  } catch {
    return null;
  }
}



(function() {
  const tutorialButton = document.querySelector('[data-action="tutorial"]');
  const board = document.getElementById('board');
  if (!tutorialButton || !board) return;

  let tutorialActive = false;
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
  const debugTutorial = (...args) => {
    if (typeof window === 'undefined' || !window.DEBUG_TUTORIAL_LOCKS) return;
    try { console.debug('[tutorial]', ...args); } catch (_) { try { console.log('[tutorial]', ...args); } catch {} }
  };

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
      <button class="tutorial-claim-btn" type="button">Claim Reward</button>
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

    const titleEl = panelEl.querySelector('.tutorial-goals-title');
    if (titleEl) titleEl.textContent = goal.title || '';

    const listEl = panelEl.querySelector('.tutorial-goals-tasklist');
    if (listEl) {
      listEl.innerHTML = '';
      tasks.forEach((task, index) => {
        const li = document.createElement('li');
        li.className = 'goal-task';
        li.dataset.taskId = task.id || `task-${index}`;
        if (index < taskIndex) li.classList.add('is-complete');
        else if (index === taskIndex) li.classList.add('is-active');
        else li.classList.add('is-hidden');
        li.innerHTML = `<span class="goal-task-index">${index + 1}</span><span class="goal-task-label">${task.label || ''}</span>`;
        listEl.appendChild(li);
      });
    }

    const completedTasks = Math.min(taskIndex, tasks.length);
    const progressFill = panelEl.querySelector('.goal-progress-fill');
    if (progressFill) {
      const pct = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;
      progressFill.style.width = `${pct}%`;
    }
    const progressSummary = panelEl.querySelector('.goal-progress-summary');
    if (progressSummary) {
      progressSummary.innerHTML = `<strong>${completedTasks} / ${tasks.length}</strong> tasks complete`;
    }

    const reward = goal.reward || {};
    const rewardDescription = panelEl.querySelector('.goal-reward-description');
    if (rewardDescription) rewardDescription.textContent = reward.description || '';

    const rewardIcons = panelEl.querySelector('.goal-reward-icons');
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
        btn.style.display = 'none';
        btn.classList.remove('is-visible');
        btn.disabled = true;
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

    populateGoalPanel(goalPanel, goal, {
      taskIndex: tutorialState.taskIndex,
      unlockedRewards: tutorialState.unlockedRewards,
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
      btn.textContent = 'Claim Reward';
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

    if (task.id === 'add-draw-toy') {
      ensureGoalPanel();
      temporaryUnlockSpawnerControl('toggle');

      whenVisible('.toy-spawner-toggle', (targetEl) => {
        const startParticles = () => {
          const taskEl = goalPanel?.querySelector('.goal-task.is-active') 
                      || goalPanel?.querySelector('.goal-row.is-active');
          if (taskEl && targetEl?.isConnected) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                startParticleStream(taskEl, targetEl);
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
    else if (task.id === 'add-rhythm-toy') {
      ensureGoalPanel();

      // When the + button is visible, start the line from the active task → + button
      whenVisible('.toy-spawner-toggle', (targetEl) => {
        const startParticles = () => {
          const taskEl = goalPanel?.querySelector('.goal-task.is-active') 
                      || goalPanel?.querySelector('.goal-row.is-active');
          if (taskEl && targetEl?.isConnected) {
            // two rAFs = layout stable & canvases sized
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                startParticleStream(taskEl, targetEl);
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

      // IMPORTANT: use the actual class name from toy-spawner.js → .toy-spawner-name
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
                startParticleStream(taskEl, targetEl);
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

    // When entering the "draw-line" task, use the toy's own APIs.
// This avoids duplicate DOM overlays and guarantees correct z-order.
if (task.id === 'draw-line' && tutorialToy) {
  whenSwipeAPIReady(tutorialToy, () => {
    console.debug('[tutorial] starting ghost guide + hint on draw-line');
    // Show the toy's built-in word overlay (uses "DRAW" inside drawgrid)
    tutorialToy.setSwipeVisible(true, { immediate: true });
    
        // Compute local coords inside the drawgrid panel (not viewport coords)
        const r = tutorialToy.getBoundingClientRect();
        const pad = 24; // keep inside the grid area a bit
        const startX = pad;
        const endX   = Math.max(pad + 1, r.width - pad);
        const startY = pad;
        const endY   = Math.max(pad + 1, r.height - pad);
    
        // One sweep of the ghost finger; drawgrid.js handles fade/opacity (~30%)
        tutorialToy.startGhostGuide({
          startX,
          endX,
          startY,
          endY,
          duration: 2000,   // ms per sweep
          wiggle: true,
          trail: true,
          trailEveryMs: 50,
          trailCount: 3,
          trailSpeed: 1.2
        });
    
        // Loop the sweep with a short pause
        if (tutorialToy.__ghostLoop) clearInterval(tutorialToy.__ghostLoop);
        tutorialToy.__ghostLoop = setInterval(() => {
          tutorialToy.startGhostGuide({
            startX, endX, startY, endY,
            duration: 2000,
            wiggle: true,
            trail: true,
            trailEveryMs: 50,
            trailCount: 3,
            trailSpeed: 1.2
          });
        }, 2000 /*duration*/ + 1000 /*pause*/);  });
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
      const targetVisible =
        targetEl &&
        !targetEl.classList.contains('tutorial-control-locked') &&
        !targetEl.classList.contains('tutorial-hide-play-button') &&
        (isPlayTask || !targetEl.classList.contains('tutorial-play-hidden')) &&
        (targetEl.offsetParent !== null || getComputedStyle(targetEl).display !== 'none');
  
      if (targetVisible) {
        const taskEl = goalPanel?.querySelector('.goal-task.is-active');
        if (taskEl) startParticleStream(taskEl, targetEl);
  
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
          targetEl.classList.add('tutorial-pulse-target', 'tutorial-active-pulse');
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
      renderGoalPanel();
      updateClaimButtonVisibility();
      stopParticleStream();
      document.querySelectorAll('.tutorial-pulse-target, .tutorial-active-pulse, .tutorial-addtoy-pulse').forEach(el => {
        el.classList.remove('tutorial-pulse-target', 'tutorial-active-pulse', 'tutorial-addtoy-pulse');
      });
      return;
    }

    renderGoalPanel();
    handleTaskEnter(getCurrentTask());
  }

  function maybeCompleteTask(requirement) {
    if (tutorialState?.pendingRewardGoalId) return false;
    const task = getCurrentTask();
    if (task && task.requirement === requirement) {
      completeCurrentTask();
      return true;
    }
    return false;
  }

  function handleDrawgridUpdate(detail) {
    if (!tutorialActive || !tutorialState) return;
    const nodes = detail && detail.nodes;
    // As soon as a real line exists, remove the hint + ghost
    if (!hasDetectedLine && Array.isArray(nodes)) {
      const madeAny = nodes.some(set => set && set.size > 0);
      if (madeAny) {
        try { tutorialToy.stopGhostGuide?.(); } catch {}
        if (tutorialToy.__ghostLoop) {
          clearInterval(tutorialToy.__ghostLoop);
          tutorialToy.__ghostLoop = null;
        }
        tutorialToy.setSwipeVisible?.(false);
      }
    }
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
    if (controlMap.clear)  addListener(controlMap.clear,  'click', () => maybeCompleteTask('press-clear'));
    if (controlMap.random) addListener(controlMap.random, 'click', () => maybeCompleteTask('press-random'));

    // NEW: also complete tasks when the toy’s own events fire (more robust than click-only)
    addListener(panel, 'toy-clear',  () => maybeCompleteTask('press-clear'));
    addListener(panel, 'toy-reset',  () => maybeCompleteTask('press-clear'));   // some flows dispatch this too
    addListener(panel, 'toy-random', () => maybeCompleteTask('press-random'));
  }



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

  const onNoteAdd = () => {
    if (hasActiveLoopgrid(newToy)) {
      maybeCompleteTask('add-note-new-toy');
    }
  };

  if (!newToy.__tutorialRhythmHooked) {
    newToy.__tutorialRhythmHooked = true;
    const rhythmEvents = [
      'loopgrid:update',
      'grid:notechange',
      'grid:drum-tap',
      'loopgrid:tap',
      'toy-random',
      'toy-update',
      'change',
      'toy-random-notes'
    ];
    rhythmEvents.forEach(evt => addListener(newToy, evt, onNoteAdd));
    addListener(newToy, 'toy-clear', () => requestAnimationFrame(onNoteAdd));
  }
  onNoteAdd();

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
    if (tutorialToy.__ghostLoop) {
      clearInterval(tutorialToy.__ghostLoop);
      tutorialToy.__ghostLoop = null;
    }
    tutorialToy.setSwipeVisible?.(false);

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

  tutorialButton.addEventListener('click', () => tutorialActive ? exitTutorial() : enterTutorial());
  updateButtonVisual();

  try {
    if (!window.TutorialGoalsAPI) {
      const api = {
        getGoals: () => GOAL_FLOW.map(cloneGoal).filter(Boolean),
        getGoalById: (id) => cloneGoal(GOAL_FLOW.find(goal => goal.id === id)),
        createPanel: () => buildGoalPanel(),
        populatePanel: (panel, goal, options) => populateGoalPanel(panel, goal, options),
      };
      window.TutorialGoalsAPI = Object.freeze(api);
      window.dispatchEvent(new CustomEvent('tutorial:goals-ready', { detail: api }));
    }
  } catch (err) {
    console.warn('[tutorial] expose goal API failed', err);
  }
})();
