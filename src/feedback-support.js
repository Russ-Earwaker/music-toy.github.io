// src/feedback-support.js - feedback/support overlay wiring
(() => {
  const openBtn = document.getElementById('feedback-support-btn');
  const overlay = document.getElementById('feedback-support-overlay');
  if (!openBtn || !overlay) return;

  const closeTargets = overlay.querySelectorAll('[data-action="close-feedback-support"]');
  const tabButtons = Array.from(overlay.querySelectorAll('.feedback-support-tab'));
  const panes = Array.from(overlay.querySelectorAll('.feedback-support-pane'));
  const textarea = overlay.querySelector('#feedback-support-text');
  const sendBtn = overlay.querySelector('#feedback-support-send');
  const confirm = overlay.querySelector('#feedback-support-confirm');

  let confirmTimer = 0;
  let activeTab = 'feedback';

  const setOpen = (open) => {
    overlay.hidden = !open;
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.classList.toggle('feedback-support-open', open);
    if (open) {
      setTab(activeTab);
      if (textarea) {
        setTimeout(() => textarea.focus(), 0);
      }
    } else {
      clearConfirm();
    }
  };

  const setTab = (name) => {
    activeTab = name;
    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === name;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    panes.forEach((pane) => {
      const isActive = pane.dataset.pane === name;
      pane.classList.toggle('is-active', isActive);
      pane.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });
  };

  const clearConfirm = () => {
    if (confirmTimer) {
      clearTimeout(confirmTimer);
      confirmTimer = 0;
    }
    if (confirm) {
      confirm.textContent = '';
      confirm.classList.remove('is-error');
    }
  };

  openBtn.addEventListener('click', () => setOpen(true));
  closeTargets.forEach((btn) => {
    btn.addEventListener('click', () => setOpen(false));
  });

  document.addEventListener('keydown', (event) => {
    if (!overlay.hidden && event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  });

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab) setTab(tab);
    });
  });

  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      clearConfirm();
      const value = textarea?.value?.trim() || '';
      if (!value) {
        if (confirm) {
          confirm.textContent = 'Please add a note before sending.';
          confirm.classList.add('is-error');
        }
        return;
      }
      sendBtn.disabled = true;
      if (confirm) confirm.textContent = 'Sending...';
      confirmTimer = setTimeout(() => {
        if (confirm) confirm.textContent = 'Thanks! Your feedback was sent.';
        if (textarea) textarea.value = '';
        sendBtn.disabled = false;
        confirmTimer = setTimeout(() => {
          if (confirm) confirm.textContent = '';
          confirmTimer = 0;
        }, 3500);
      }, 450);
    });
  }
})();
