export const TOY_SIDE_BUTTON_SIZE = 65;
export const TOY_SIDE_BUTTON_Z_INDEX = 10050;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function resolveToySideAnchorY({ panelHeight, bodyTop, bodyHeight } = {}) {
  const height = Math.max(0, finite(panelHeight));
  const measuredBodyHeight = Math.max(0, finite(bodyHeight));
  if (measuredBodyHeight > 0) {
    return finite(bodyTop) + measuredBodyHeight * 0.5;
  }
  return height * 0.5;
}

export function measureToySideAnchor(panel) {
  const panelHeight = Math.max(0, finite(panel?.offsetHeight));
  const panelRect = panel?.getBoundingClientRect?.() || null;
  const body = panel?.querySelector?.(':scope > .toy-body') || panel?.querySelector?.('.toy-body') || null;
  const bodyRect = body?.getBoundingClientRect?.() || null;

  let localY = null;
  if (
    panelHeight > 0 &&
    finite(panelRect?.height) > 0 &&
    finite(bodyRect?.height) > 0
  ) {
    const presentationScaleY = panelRect.height / panelHeight;
    if (presentationScaleY > 0) {
      localY = (bodyRect.top + bodyRect.height * 0.5 - panelRect.top) / presentationScaleY;
    }
  }

  if (!Number.isFinite(localY)) {
    localY = resolveToySideAnchorY({
      panelHeight,
      bodyTop: body?.offsetTop,
      bodyHeight: body?.offsetHeight,
    });
  }

  const clientY = panelRect && panelHeight > 0
    ? panelRect.top + (localY / panelHeight) * panelRect.height
    : finite(panelRect?.top) + finite(panelRect?.height) * 0.5;

  return { localY, clientY, body };
}

export function applyToySideButtonPosition(panel, button) {
  if (!panel || !button) return null;
  const anchor = measureToySideAnchor(panel);
  button.style.setProperty('--c-btn-size', `${TOY_SIDE_BUTTON_SIZE}px`);
  button.style.position = 'absolute';
  button.style.left = '100%';
  button.style.right = 'auto';
  button.style.top = `${anchor.localY}px`;
  button.style.transform = 'translateY(-50%)';
  button.style.zIndex = String(TOY_SIDE_BUTTON_Z_INDEX);
  button.dataset.sideButtonPosition = 'shared';
  return anchor;
}
