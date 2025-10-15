const GUIDE_TOGGLE_CLASS = 'guide-launcher';
const GUIDE_OPEN_CLASS = 'is-open';

function initGuidePanel(api) {
  if (!api) return;
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

    const header = panel.querySelector('.tutorial-goals-header');
    const tasks = panel.querySelector('.tutorial-goals-tasks');
    const progress = panel.querySelector('.tutorial-goals-progress');
    const reward = panel.querySelector('.tutorial-goals-reward');

    if (header && (tasks || progress || reward)) {
      const content = [tasks, progress, reward].filter(Boolean);
      const isFirst = index === 0;

      if (isFirst) {
        // First goal starts expanded
        panel.style.cursor = 'default';
      } else {
        // Other goals start collapsed
        panel.classList.add('is-collapsed');
        content.forEach(el => el.style.display = 'none');
        panel.style.cursor = 'pointer';
      }

      panel.addEventListener('click', (e) => {
        if (e.target.closest('button, a, input, select')) {
          return;
        }
        const wasCollapsed = panel.classList.contains('is-collapsed');
        panel.classList.toggle('is-collapsed', !wasCollapsed);
        content.forEach(el => el.style.display = wasCollapsed ? '' : 'none');
        panel.style.cursor = wasCollapsed ? 'default' : 'pointer';
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
