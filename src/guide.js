const GUIDE_TOGGLE_CLASS = 'guide-launcher';
const GUIDE_OPEN_CLASS = 'is-open';

function initGuidePanel(api) {
  if (!api) return;

  // Ensure CSS is loaded
  if (!document.getElementById('tutorial-styles')) {
    const link = document.createElement('link');
    link.id = 'tutorial-styles';
    link.rel = 'stylesheet';
    link.href = 'src/tutorial.css';
    document.head.appendChild(link);
  }

  const allGoals = api.getGoals?.() || [];
  if (!allGoals.length) return;

  const host = document.createElement('div');
  host.className = `${GUIDE_TOGGLE_CLASS}`;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'toy-btn guide-toggle';
  toggle.textContent = 'Guide';
  toggle.style.fontSize = '1.75rem'; // Double the font size
  host.appendChild(toggle);

  const panelsContainer = document.createElement('div');
  panelsContainer.className = 'guide-panels-container';
  host.appendChild(panelsContainer);

  allGoals.forEach((goal, index) => {
    const panel = api.createPanel?.();
    if (!panel) return;
    panel.classList.add('guide-goals-panel');
    panel.removeAttribute('id');
    panel.querySelector('.tutorial-claim-btn')?.remove();

    api.populatePanel?.(panel, goal, { taskIndex: 0, showClaimButton: false });

    panel.querySelectorAll('.goal-task').forEach(taskEl => {
      taskEl.style.cursor = 'pointer';
      taskEl.addEventListener('click', () => {
        const isActive = taskEl.classList.contains('is-active-guide-task');

        // If it's already active, we're deactivating it.
        if (isActive) {
          taskEl.classList.remove('is-active-guide-task');
          window.dispatchEvent(new CustomEvent('guide:task-deactivate', { bubbles: true, composed: true }));
        } else {
          // Deactivate any other active task
          const currentActive = panel.querySelector('.is-active-guide-task');
          if (currentActive) {
            currentActive.classList.remove('is-active-guide-task');
            window.dispatchEvent(new CustomEvent('guide:task-deactivate', { bubbles: true, composed: true }));
          }
          // Activate the new one
          taskEl.classList.add('is-active-guide-task');
          const taskId = taskEl.dataset.taskId;
          if (taskId) {
            window.dispatchEvent(new CustomEvent('guide:task-click', {
              detail: { taskId, taskElement: taskEl },
              bubbles: true,
              composed: true
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
      bodyContent.forEach(el => bodyWrapper.appendChild(el));
      panel.appendChild(bodyWrapper);

      const isFirst = index === 0;

      header.style.cursor = 'pointer';

      if (isFirst) {
        // First goal starts expanded
        panel.classList.remove('is-collapsed');
      } else {
        // Other goals start collapsed
        panel.classList.add('is-collapsed');
        bodyWrapper.style.display = 'none';
      }

      header.addEventListener('click', () => {
        const isCollapsed = panel.classList.contains('is-collapsed');
        panel.classList.toggle('is-collapsed', !isCollapsed);
        bodyWrapper.style.display = isCollapsed ? '' : 'none';
      });
    }

    panelsContainer.appendChild(panel);
  });

  panelsContainer.style.display = 'none';

  toggle.addEventListener('click', () => {
    const willOpen = !host.classList.contains(GUIDE_OPEN_CLASS);
    host.classList.toggle(GUIDE_OPEN_CLASS, willOpen);
    panelsContainer.style.display = willOpen ? 'block' : 'none';
    panelsContainer.classList.toggle('is-visible', willOpen);
  });

  document.body.appendChild(host);
}

function startWhenReady() {
  if (window.TutorialGoalsAPI) {
    initGuidePanel(window.TutorialGoalsAPI);
    return;
  }
  window.addEventListener('tutorial:goals-ready', (event) => {
    initGuidePanel(event?.detail || window.TutorialGoalsAPI);
  }, { once: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startWhenReady, { once: true });
} else {
  startWhenReady();
}
