# Theme System — Quick Install (Non-destructive)

This adds switchable **music themes** without touching your existing files.

## Files (drop into your `src/`)
- `themes.js` — registry of themes and their instruments
- `theme-manager.js` — small helper API to query/resolve the active theme
- `boot-theme.js` — optional, wires the active theme into your boot flow
- `THEME-INSTALL.md` — these notes

## 1) Import order (index.html or your bundler entry)
Make sure these load **after** your current scripts so the shim can call your functions.

```html
<script type="module" src="./src/themes.js"></script>
<script type="module" src="./src/theme-manager.js"></script>
<script type="module" src="./src/boot-theme.js"></script>
```

If you bundle with Vite, just import `./boot-theme.js` somewhere after your main boot.

## 2) Hook points (minimal)
`boot-theme.js` looks for any of these globals and uses what it finds:

- `createGridToy(index, instrumentId)` **or** `assignGridInstrument(index, instrumentId)`
- `createWheelToy(instrumentId)` **or** `assignWheelInstrument(instrumentId)`
- `createBouncerToy(instrumentId)` **or** `assignBouncerInstrument(instrumentId)`
- `createRipplerToy(instrumentId)` **or** `assignRipplerInstrument(instrumentId)`

If your names differ, either:
- Rename your functions to match (thin wrappers are fine), **or**
- Edit `boot-theme.js` to call your real functions (kept <300 lines).

## 3) Sample name mapping
Edit `SAMPLE_ALIASES` in `theme-manager.js` if your `samples.csv` uses different IDs.

## 4) Switch theme at runtime (optional)
Open DevTools console:
```js
ThemeBoot.setTheme("default");       // or any theme key from THEMES
ThemeBoot.wireAll();
```

## 5) First theme (included)
- Grids: `djembe_bass`, `djembe_tone`, `djembe_slap`, `hand_clap`
- Wheel: `acoustic_guitar`
- Bouncer: `xylophone`
- Rippler: `kalimba`

Everything kept under 300 lines and additive — no destructive edits required.
