import {uiMode} from './ui-mode.js';
const buttons = document.querySelectorAll('#ui-mode [data-ui-mode]');
const sync = mode => {
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.uiMode === mode));
};
for (const button of buttons) button.addEventListener('click', () => uiMode.set(button.dataset.uiMode));
sync(uiMode.get());
uiMode.subscribe(sync);
