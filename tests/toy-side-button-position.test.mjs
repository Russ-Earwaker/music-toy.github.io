import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  TOY_SIDE_BUTTON_SIZE,
  TOY_SIDE_BUTTON_Z_INDEX,
  applyToySideButtonPosition,
  measureToySideAnchor,
  resolveToySideAnchorY,
} from '../src/toy-side-button-position.js';

function mockStyle() {
  const values = new Map();
  return {
    setProperty(name, value) { values.set(name, value); },
    getPropertyValue(name) { return values.get(name) || ''; },
  };
}

test('an unsettled Bouncer body falls back to the panel right-edge centre', () => {
  assert.equal(resolveToySideAnchorY({ panelHeight: 380, bodyTop: 62, bodyHeight: 0 }), 190);
});

test('all settled toy bodies anchor at their vertical centre', () => {
  assert.equal(resolveToySideAnchorY({ panelHeight: 380, bodyTop: 48, bodyHeight: 300 }), 198);
  assert.equal(resolveToySideAnchorY({ panelHeight: 260, bodyTop: 40, bodyHeight: 177 }), 128.5);
});

test('transformed rect measurement resolves back into panel-local coordinates', () => {
  const body = {
    offsetTop: 48,
    offsetHeight: 300,
    getBoundingClientRect: () => ({ top: 124, height: 150 }),
  };
  const panel = {
    offsetHeight: 380,
    getBoundingClientRect: () => ({ top: 100, height: 190 }),
    querySelector: () => body,
  };
  const anchor = measureToySideAnchor(panel);
  assert.equal(anchor.localY, 198);
  assert.equal(anchor.clientY, 199);
});

test('shared side-button contract fixes anchor, hit area, offset, scaling, and z-order', () => {
  const body = {
    offsetTop: 48,
    offsetHeight: 300,
    getBoundingClientRect: () => ({ top: 48, height: 300 }),
  };
  const panel = {
    offsetHeight: 380,
    getBoundingClientRect: () => ({ top: 0, height: 380 }),
    querySelector: () => body,
  };
  const button = { style: mockStyle(), dataset: {} };
  applyToySideButtonPosition(panel, button);
  assert.equal(button.style.getPropertyValue('--c-btn-size'), `${TOY_SIDE_BUTTON_SIZE}px`);
  assert.equal(button.style.left, '100%');
  assert.equal(button.style.right, 'auto');
  assert.equal(button.style.top, '198px');
  assert.equal(button.style.transform, 'translateY(-50%)');
  assert.equal(button.style.zIndex, String(TOY_SIDE_BUTTON_Z_INDEX));
  assert.equal(button.dataset.sideButtonPosition, 'shared');
});

test('shared connector ports retain the established side anchor without per-toy overrides', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(main, /getToyPoint: getChainAnchor/);
  assert.match(main, /measureToySideAnchor\(panel\)/);
  assert.doesNotMatch(main, /right:\s*-65px/);
  assert.doesNotMatch(css, /data-toy=["']bouncer["'][^{}]*toy-chain-btn/);
  assert.match(css, /\.toy-chain-btn\s*\{[\s\S]*?left:\s*100%;[\s\S]*?z-index:\s*10050;/);
});
