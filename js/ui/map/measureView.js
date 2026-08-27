// The full-screen clinometer.
//
// A reading is taken with the phone lying on rock, held at arm's length, often
// at an awkward angle and usually in bright sun. That is not a moment for a
// panel sharing the screen with a map: the numbers need to be readable without
// leaning in, and the symbol needs to be big enough to check at a glance that
// the app is describing the surface actually under the phone.
//
// So the dial is fixed north-up and the symbol turns inside it, rather than the
// compass card turning under a fixed lubber line. A card that spins is right
// for walking a bearing; for reading a structure the useful thing is to see the
// strike-and-dip mark in the same orientation it will have on the map.

import { el, svg, clear } from '../widgets.js';
import { quadrantBearing } from '../../geo/math.js';
import { FEATURES, PLANAR_FEATURES, LINEAR_FEATURES, feature, isLinearFeature }
  from '../../field/model.js';
import { formatDeclination } from '../../field/declination.js';
import { fixAge } from '../../field/sensors.js';

const R = 88;      // dial radius in viewBox units
const C = 100;     // dial centre

export function measureView(ctx) {
  const node = el('div', { class: 'measure-full' });

  // --- header -------------------------------------------------------------
  const modeBtns = {};
  const makeMode = (id, label) => {
    const b = el('button', {
      class: 'mode-btn', type: 'button',
      onclick: () => ctx.setGeometry(id),
    }, [el('span', { text: label })]);
    modeBtns[id] = b;
    return b;
  };
  const modeSwitch = el('div', { class: 'mode-switch inline' }, [
    makeMode('planar', 'Plane'),
    makeMode('linear', 'Line'),
  ]);

  node.appendChild(el('div', { class: 'mf-head' }, [
    modeSwitch,
    el('button', {
      class: 'mf-close', type: 'button', 'aria-label': 'Close',
      onclick: () => ctx.close(),
    }, [el('span', { text: '×' })]),
  ]));

  // --- the dial -----------------------------------------------------------
  const face = svg('svg', { viewBox: '0 0 200 200', class: 'mf-dial' });
  buildRose(face);

  // Everything that turns with the reading lives in one group, so a new
  // sample is a transform and two numbers rather than a rebuild.
  const spin = svg('g', { class: 'mf-spin' });
  const strikeLine = svg('line', {
    x1: C, y1: C - (R - 10), x2: C, y2: C + (R - 10), class: 'mf-strike',
  });
  const dipTick = svg('line', { x1: C, y1: C, x2: C + 40, y2: C, class: 'mf-dip' });
  const arrow = svg('path', { class: 'mf-arrow' });
  // No number is drawn on the symbol. It would have to live inside the group
  // that turns, so it would lie on its side at half the compass headings, and
  // at a steep dip the tick reaches the ring where the bearings are printed
  // and the two collide. The angle is already given three ways: the length of
  // the tick, the readout below, and the side elevation beside it.
  spin.append(strikeLine, dipTick, arrow);
  face.appendChild(spin);
  face.appendChild(svg('circle', { cx: C, cy: C, r: 4, class: 'mf-hub' }));

  node.appendChild(el('div', { class: 'mf-dial-wrap' }, [face]));

  // --- readout ------------------------------------------------------------
  const big = el('div', { class: 'mf-big', text: '—' });
  const sub = el('div', { class: 'mf-sub', text: '' });
  const units = el('div', { class: 'mf-units', text: '' });

  // A plan-view dial cannot show an inclination, so the tilt gets its own
  // small side elevation: a horizon, and the surface leaning off it.
  const incl = svg('svg', { viewBox: '0 0 120 74', class: 'mf-incl' });
  incl.appendChild(svg('line', { x1: 8, y1: 14, x2: 112, y2: 14, class: 'mf-horizon' }));
  const inclRay = svg('line', { x1: 8, y1: 14, x2: 100, y2: 14, class: 'mf-ray' });
  const inclArc = svg('path', { class: 'mf-arc' });
  incl.append(inclArc, inclRay);

  node.appendChild(el('div', { class: 'mf-readout' }, [
    el('div', { class: 'mf-numbers' }, [big, sub, units]),
    el('div', { class: 'mf-incl-wrap' }, [incl]),
  ]));

  // --- steadiness ---------------------------------------------------------
  const bar = el('div', { class: 'mf-steady' }, [el('span', { class: 'mf-steady-fill' })]);
  const steadyText = el('div', { class: 'mf-steady-text', text: '' });
  node.append(bar, steadyText);

  // --- what it is ---------------------------------------------------------
  const chips = el('div', { class: 'chips mf-chips' });
  node.appendChild(chips);

  // --- actions ------------------------------------------------------------
  const holdBtn = el('button', {
    class: 'btn wide mf-hold', type: 'button', text: 'Hold the reading',
    onclick: () => ctx.captureCompass(),
  });
  const saveBtn = el('button', {
    class: 'btn primary wide mf-save', type: 'button', text: 'Save station',
    onclick: () => ctx.recordStation(),
  });
  const why = el('div', { class: 'mf-why', text: '' });
  const foot = el('div', { class: 'mf-foot', text: '' });
  node.append(holdBtn, saveBtn, why, foot);

  // -------------------------------------------------------------------------

  let lastChipKey = null;

  const paintChips = (geometry) => {
    const list = geometry === 'linear' ? LINEAR_FEATURES : PLANAR_FEATURES;
    const key = geometry + ':' + ctx.draft.feature;
    if (key === lastChipKey) return;
    lastChipKey = key;
    clear(chips);
    for (const f of list) {
      chips.appendChild(el('button', {
        class: `chip ${f.id === ctx.draft.feature ? 'on' : ''}`,
        type: 'button', title: f.hint,
        onclick: () => { ctx.setFeature(f.id); },
      }, [el('span', { text: f.label })]));
    }
  };

  node.refresh = () => {
    const d = ctx.draft;
    const s = ctx.clinoState();
    const geometry = isLinearFeature(d.feature) ? 'linear' : 'planar';
    const linear = geometry === 'linear';

    for (const [id, b] of Object.entries(modeBtns)) {
      b.classList.toggle('on', id === geometry);
    }
    paintChips(geometry);

    // Held values win over live ones: once a reading is captured the display
    // must stop moving, or there is no way to see what was captured.
    const held = d.held;
    const az = held ? (linear ? d.trend : d.strike) : (linear ? s.trend : s.strike);
    const inc = held ? (linear ? d.plunge : d.dip) : (linear ? s.plunge : s.dip);
    const scatter = held ? d.scatter : (linear ? s.lineScatter : s.scatter);

    const ready = held || s.ready;
    strikeLine.style.display = linear ? 'none' : '';
    dipTick.style.display = linear ? 'none' : '';
    arrow.style.display = linear ? '' : 'none';

    if (!ready || inc == null) {
      big.textContent = '—';
      sub.textContent = s.settling ? 'settling…' : 'waiting for the sensor…';
      units.textContent = '';
      spin.style.opacity = '.25';
      setBar(0, false);
      steadyText.textContent = '';
    } else {
      spin.style.opacity = '1';
      spin.setAttribute('transform', az == null ? '' : `rotate(${az} ${C} ${C})`);

      if (linear) {
        // A single-headed arrow: a lineation has a down-plunge direction even
        // though it has no sense of movement.
        const len = R - 16;
        arrow.setAttribute('d',
          `M ${C} ${C} L ${C} ${C - len} M ${C - 9} ${C - len + 15} L ${C} ${C - len} L ${C + 9} ${C - len + 15}`);
      } else {
        // Tick length carries the dip, the way the map symbol does.
        const tick = 22 + (inc / 90) * 40;
        dipTick.setAttribute('x2', C + tick);
      }

      big.textContent = az == null ? `${Math.round(inc)}°` : `${pad3(az)} / ${Math.round(inc)}`;
      units.textContent = az == null ? '' : (linear ? 'trend / plunge' : 'strike / dip');
      sub.textContent = az == null
        ? (linear ? 'plunge only — no compass reference' : 'dip only — no compass reference')
        : `${quadrantBearing(az)} · ${linear ? 'plunges' : 'dips'} ${Math.round(inc)}°`;

      drawIncl(inclRay, inclArc, inc);

      const fill = Math.max(0, Math.min(1, 1 - ((scatter ?? 0) / 6)));
      setBar(held ? 1 : fill, held || s.still);
      steadyText.textContent = held
        ? `held · captured with ${(d.scatter ?? 0).toFixed(1)}° of scatter`
        : `${(scatter ?? 0).toFixed(1)}° scatter${s.still ? ' · steady' : ' · still moving'}`;
    }

    holdBtn.textContent = held ? 'Take a new reading' : 'Hold the reading';
    holdBtn.classList.toggle('primary', !held);

    const reason = ctx.blockingReason();
    saveBtn.disabled = !!reason;
    why.textContent = reason || '';

    // Everything that will be written down with the reading, stated where it
    // is being taken rather than on a settings page.
    const fix = ctx.geoState().fix;
    const elev = ctx.groundElevation();
    foot.textContent = [
      fix ? `± ${Math.round(fix.accuracy)} m` : 'no fix',
      fix ? `${Math.round(fixAge(fix))}s old` : null,
      elev == null ? null : `${Math.round(elev)} m`,
      `declination ${formatDeclination(ctx.declination())}`,
      s.needsCalibration ? 'compass needs calibrating' : null,
    ].filter(Boolean).join('  ·  ');
    foot.classList.toggle('warn', !!s.needsCalibration);
  };

  const setBar = (t, good) => {
    bar.firstChild.style.width = `${Math.max(0, Math.min(1, t)) * 100}%`;
    bar.classList.toggle('ready', !!good);
  };

  node.refresh();
  return node;
}

// ---------------------------------------------------------------------------

/** The fixed 0-360 card: ticks every 5, numbers every 30, letters at the quarters. */
function buildRose(face) {
  face.appendChild(svg('circle', { cx: C, cy: C, r: R, class: 'mf-face' }));
  face.appendChild(svg('circle', { cx: C, cy: C, r: R - 20, class: 'mf-inner' }));

  for (let a = 0; a < 360; a += 5) {
    const major = a % 30 === 0;
    const mid = a % 15 === 0;
    const r1 = R - (major ? 13 : mid ? 9 : 5);
    const p1 = polar(a, r1), p2 = polar(a, R - 1);
    face.appendChild(svg('line', {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      class: major ? 'mf-tick major' : mid ? 'mf-tick mid' : 'mf-tick',
    }));
  }

  const CARDINALS = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  for (let a = 0; a < 360; a += 30) {
    const p = polar(a, R - 28);
    const isCardinal = CARDINALS[a] != null;
    face.appendChild(svg('text', {
      x: p.x, y: p.y + (isCardinal ? 5 : 4),
      'text-anchor': 'middle',
      class: isCardinal ? 'mf-card' : 'mf-deg',
      text: isCardinal ? CARDINALS[a] : String(a).padStart(3, '0'),
    }));
  }
}

/** The side elevation: how far the surface leans off the horizontal. */
function drawIncl(ray, arc, deg) {
  const OX = 8, OY = 14, L = 92;
  const r = deg * Math.PI / 180;
  ray.setAttribute('x2', OX + Math.cos(r) * L);
  ray.setAttribute('y2', OY + Math.sin(r) * L);
  const AR = 34;
  const p0 = { x: OX + AR, y: OY };
  const p1 = { x: OX + Math.cos(r) * AR, y: OY + Math.sin(r) * AR };
  arc.setAttribute('d', deg < 0.5
    ? ''
    : `M ${OX} ${OY} L ${p0.x} ${p0.y} A ${AR} ${AR} 0 0 1 ${p1.x} ${p1.y} Z`);
}

function polar(azDeg, r) {
  const a = (azDeg - 90) * Math.PI / 180;
  return { x: C + Math.cos(a) * r, y: C + Math.sin(a) * r };
}

function pad3(v) { return String(Math.round(v) % 360).padStart(3, '0'); }
