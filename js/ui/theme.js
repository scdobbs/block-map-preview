// Light and dark.
//
// The stylesheet defines every chrome colour as a custom property on :root
// and redefines the set under [data-theme="light"]. Canvases cannot read a
// stylesheet, so anything that paints chrome with a 2D context or WebGL asks
// here for the same tokens and repaints when they change. Geology keeps its
// own colours in both: rock, unit, fault and station colours are what they
// are on any paper.
//
// The choice is a fact about this phone, not about a block or a notebook, so
// it lives in localStorage beside the last-open section.

const KEY = 'blockdiagram.theme';
const CHOICES = new Set(['auto', 'dark', 'light']);

/** What was chosen: 'auto', 'dark' or 'light'. */
export function themeChoice() {
  try {
    const v = localStorage.getItem(KEY);
    return CHOICES.has(v) ? v : 'auto';
  } catch { return 'auto'; }
}

/** What is on screen right now: 'dark' or 'light'. */
export function activeTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function resolve(choice) {
  if (choice === 'dark' || choice === 'light') return choice;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Apply a choice. The attribute drives the stylesheet; the meta tag colours
 * the browser chrome to match; the event tells the canvases to repaint.
 */
export function setTheme(choice) {
  const c = CHOICES.has(choice) ? choice : 'auto';
  try { localStorage.setItem(KEY, c); } catch { /* private browsing */ }
  apply(resolve(c));
}

function apply(theme) {
  const root = document.documentElement;
  const was = root.dataset.theme;
  root.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', cssVar('--bg'));
  _palette = null;
  if (was !== theme) window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}

/** Follow the system setting while the choice is 'auto'. */
export function watchSystemTheme() {
  const mq = window.matchMedia?.('(prefers-color-scheme: light)');
  if (!mq) return;
  const onChange = () => { if (themeChoice() === 'auto') apply(resolve('auto')); };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else mq.addListener(onChange);
  // index.html set the attribute before first paint; make sure the meta tag
  // and the resolved value agree with it.
  apply(resolve(themeChoice()));
}

/** One token, as the stylesheet currently has it. */
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

let _palette = null;

/**
 * The chrome colours the canvases need, read once per theme.
 *
 * Named for what they paint rather than for a hue, so a canvas asks for
 * "the frame colour" and gets whichever theme's frame that is.
 */
export function palette() {
  if (_palette) return _palette;
  const v = cssVar;
  _palette = {
    bg: v('--bg'),
    ink: v('--ink'),
    inkDim: v('--ink-dim'),
    inkFaint: v('--ink-faint'),
    line: v('--line'),
    rule: v('--rule'),
    panel: v('--bg-2'),
    accent: v('--accent'),
    measured: v('--measured'),
    canvas: v('--canvas'),
    canvas2: v('--canvas-2'),
    hair1: v('--hair-1'),
    scene: v('--scene'),
    frame: v('--frame'),
    text: v('--frame-text'),
    textDim: v('--frame-text-dim'),
    textFaint: v('--frame-text-faint'),
    grid: v('--frame-grid'),
    ground: v('--ground-line'),
    groundHalo: v('--ground-halo'),
    halo: v('--halo'),
  };
  return _palette;
}

/** A '#rrggbb' token as the integer three.js wants. */
export function hexInt(hex) {
  const h = String(hex || '').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return Number.isFinite(n) ? n : 0;
}
