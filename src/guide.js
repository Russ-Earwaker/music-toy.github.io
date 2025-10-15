const GUIDE_TOGGLE_CLASS = 'guide-launcher';
const GUIDE_OPEN_CLASS = 'is-open';

function initGuidePanel(api) {
  if (!api) return;
  const goals = typeof api.getGoalById === 'function'
    ? (api.getGoalById('draw-intro') || (api.getGoals?.() || [])[0])
    : (api.getGoals?.() || [])[0];
  if (!goals) return;

  const host = document.createElement('div');
  host.className = `${GUIDE_TOGGLE_CLASS}`;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'toy-btn guide-toggle';
  toggle.textContent = 'Guide';
  host.appendChild(toggle);

  const panel = api.createPanel?.();
  if (!panel) return;
  panel.classList.add('guide-goals-panel');
  panel.removeAttribute('id');
  panel.querySelector('.tutorial-claim-btn')?.remove();

  api.populatePanel?.(panel, goals, { taskIndex: 0, showClaimButton: false });
  panel.style.display = 'none';
  host.appendChild(panel);

  toggle.addEventListener('click', () => {
    const willOpen = !host.classList.contains(GUIDE_OPEN_CLASS);
    host.classList.toggle(GUIDE_OPEN_CLASS, willOpen);
    panel.style.display = willOpen ? 'block' : 'none';
    panel.classList.toggle('is-visible', willOpen);
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
