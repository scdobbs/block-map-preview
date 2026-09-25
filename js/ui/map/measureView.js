// The full-screen clinometer.
//
// A reading is taken with the phone lying on rock, held at arm's length, often
// at an awkward angle and usually in bright sun. That is not a moment for a
// panel sharing the screen with a map: the numbers need to be readable without
// leaning in, and the symbol needs to be big enough to check at a glance that
// the app is describing the surface actually under the phone.
//
// The card turns with the phone, as a compass card does, so north on the
// dial is north on the ground; the strike-and-dip symbol is drawn on the
// card in map orientation. Together those put the strike line on the screen
// along the real strike of the surface the phone is lying on, which is the
// check that matters: look at the rock, look at the phone, and see that the
// app is describing the surface actually under it.

import { el, svg, clear, chipsRow, textRow, selectRow, toggleRow, noteRow } from '../widgets.js';
import { quadrantBearing } from '../../geo/math.js';
import { FEATURES, PLANAR_FEATURES, LINEAR_FEATURES, feature, isLinearFeature,
  CERTAINTIES, ROCKS, knownUnitNames, canBeOverturned } from '../../field/model.js';
import { vecToTrendPlunge } from '../../geo/stereonet.js';
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

  // When the reading is destined for a station that already exists, say so —
  // otherwise the only difference on screen is the wording of one button.
  const forStation = el('div', { class: 'mf-target' });

  node.appendChild(el('div', { class: 'mf-head' }, [
    modeSwitch,
    forStation,
    el('button', {
      class: 'mf-close', type: 'button', 'aria-label': 'Close',
      onclick: () => ctx.close(),
    }, [el('span', { text: '×' })]),
  ]));

  // Everything between the header and the buttons scrolls. The reading and
  // what it was a reading of are recorded from one screen, so the details
  // sit under the dial rather than on a panel you have to close this to
  // reach.
  const body = el('div', { class: 'mf-scroll' });
  node.appendChild(body);

  // --- the dial -----------------------------------------------------------
  const face = svg('svg', { viewBox: '0 0 200 200', class: 'mf-dial' });
  // Everything printed on the card turns with the phone's heading.
  const card = svg('g', { class: 'mf-card-g' });
  buildRose(card);
  face.appendChild(card);

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
  // The lubber line: the phone's own top edge, fixed while the card turns.
  face.appendChild(svg('path', { d: `M ${C} ${C - R - 4} l -5 -7 h 10 Z`, class: 'mf-lubber' }));

  // Tapping the face holds the reading. The button below does the same thing,
  // but the face is where you are already looking and it is a much larger
  // target than a button when the phone is flat on a rock at arm's length.
  const dialWrap = el('div', { class: 'mf-dial-wrap', role: 'button', tabindex: '0',
    title: 'Tap to hold the reading' }, [face]);
  dialWrap.addEventListener('click', () => ctx.captureCompass());
  body.appendChild(dialWrap);

  // --- readout ------------------------------------------------------------
  const big = el('div', { class: 'mf-big', text: '—' });
  const sub = el('div', { class: 'mf-sub', text: '' });
  const units = el('div', { class: 'mf-units', text: '' });
  // The same measurement stated the other way round. A plane's dip line is a
  // line, and the line the phone's edge reads lies in a plane, and both are
  // held by the same capture — so there is no reason to make anyone flip modes
  // to see the number they were about to ask for.
  const derived = el('div', { class: 'mf-derived', text: '' });

  // A plan-view dial cannot show an inclination, so the tilt gets its own
  // small side elevation: a horizon, and the surface leaning off it.
  const incl = svg('svg', { viewBox: '0 0 120 74', class: 'mf-incl' });
  incl.appendChild(svg('line', { x1: 8, y1: 14, x2: 112, y2: 14, class: 'mf-horizon' }));
  const inclRay = svg('line', { x1: 8, y1: 14, x2: 100, y2: 14, class: 'mf-ray' });
  const inclArc = svg('path', { class: 'mf-arc' });
  incl.append(inclArc, inclRay);

  body.appendChild(el('div', { class: 'mf-readout' }, [
    el('div', { class: 'mf-numbers' }, [big, sub, units, derived]),
    el('div', { class: 'mf-incl-wrap' }, [incl]),
  ]));

  // --- steadiness ---------------------------------------------------------
  const bar = el('div', { class: 'mf-steady' }, [el('span', { class: 'mf-steady-fill' })]);
  const steadyText = el('div', { class: 'mf-steady-text', text: '' });
  body.append(bar, steadyText);

  // --- what it is ---------------------------------------------------------
  const chips = el('div', { class: 'chips mf-chips' });
  body.appendChild(chips);

  // --- the rest of the record ----------------------------------------------
  const details = buildDetails(ctx);
  body.appendChild(details.node);

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
  node.appendChild(el('div', { class: 'mf-actions' }, [holdBtn, saveBtn, why, foot]));

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
    // The card follows the phone; a held reading freezes the card with it,
    // so the picture captured is the picture kept.
    const heading = held ? d.heading : s.heading;
    card.setAttribute('transform', heading == null ? '' : `rotate(${-heading} ${C} ${C})`);

    const ready = held || s.ready;
    strikeLine.style.display = linear ? 'none' : '';
    dipTick.style.display = linear ? 'none' : '';
    arrow.style.display = linear ? '' : 'none';

    if (!ready || inc == null) {
      big.textContent = '—';
      sub.textContent = s.settling ? 'settling…' : 'waiting for the sensor…';
      units.textContent = '';
      derived.textContent = '';
      spin.style.opacity = '.25';
      setBar(0, false);
      steadyText.textContent = '';
    } else {
      spin.style.opacity = '1';
      // Map orientation on a card that has itself been turned.
      spin.setAttribute('transform', az == null ? '' : `rotate(${az - (heading || 0)} ${C} ${C})`);

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

      // In Plane mode: the dip line, which is the strike turned 90 degrees and
      // is what a trend/plunge of the same surface would read if the phone's
      // edge were laid straight down the dip.
      // In Line mode: the plane the phone's back is on, which for slickenlines
      // is the fault the striae are on.
      if (linear) {
        const ps = held ? d.strike : s.strike;
        const pd = held ? d.dip : s.dip;
        derived.textContent = ps == null || pd == null ? ''
          : `on a plane  ${pad3(ps)}/${Math.round(pd)}  strike / dip`;
      } else {
        derived.textContent = az == null ? ''
          : `dip line  ${pad3((az + 90) % 360)}/${Math.round(inc)}  trend / plunge`;
      }

      const fill = Math.max(0, Math.min(1, 1 - ((scatter ?? 0) / 6)));
      setBar(held ? 1 : fill, held || s.still);
      steadyText.textContent = held
        ? `held · captured with ${(d.scatter ?? 0).toFixed(1)}° of scatter`
        : `${(scatter ?? 0).toFixed(1)}° scatter${s.still ? ' · steady' : ' · still moving'}`;
    }

    holdBtn.textContent = held ? 'Take a new reading' : 'Hold the reading';
    holdBtn.classList.toggle('primary', !held);
    details.refresh();

    const target = ctx.measureTarget?.() || null;
    forStation.textContent = target ? `→ station ${target.name || '—'}` : '';
    saveBtn.textContent = target ? `Update station ${target.name || ''}`.trim() : 'Save station';

    const reason = ctx.blockingReason();
    saveBtn.disabled = !!reason;
    why.textContent = reason || '';

    // Everything that will be written down with the reading, stated where it
    // is being taken rather than on a settings page.
    const fix = ctx.geoState().fix;
    const elev = ctx.groundElevation();
    foot.textContent = [
      // A reading going onto an existing station does not need a fix, and
      // showing one would imply it was about to be used.
      target ? 'filling in an existing station' : (fix ? `± ${Math.round(fix.accuracy)} m` : 'no fix'),
      target ? null : (fix ? `${Math.round(fixAge(fix))}s old` : null),
      target ? null : (elev == null ? null : `${Math.round(elev)} m`),
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

/**
 * Unit, rock type, confidence, way-up and note: the same fields the Measure
 * panel has, written into the same draft, so a station can be recorded whole
 * without leaving the dial.
 *
 * Built once. The sensors refresh this view several times a second, and a
 * form rebuilt that often would throw away a half-typed note, so refresh()
 * only pushes a value into a control when the draft has changed under it:
 * after a save empties the note, or when the feature chips move off bedding
 * and the overturned switch stops applying.
 */
function buildDetails(ctx) {
  const draft = ctx.draft;
  const doc = ctx.doc();
  const node = el('div', { class: 'mf-details' });

  const known = knownUnitNames(doc);
  const listId = 'mf-unit-names';
  node.appendChild(el('datalist', { id: listId }, known.map((k) => el('option', { value: k.name }))));

  const linkUnit = (name) => {
    draft.unitName = String(name || '').trim();
    const u = doc.units.find((x) => x.name.toLowerCase() === draft.unitName.toLowerCase());
    draft.unitId = u ? u.id : null;
    if (u) draft.rockId = u.rockId;
  };

  let unitChips = null;
  if (known.length) {
    unitChips = chipsRow({
      label: 'Unit',
      value: draft.unitName,
      options: known.slice(0, 8).map((k) => ({ id: k.name, label: k.name })),
      onChange: (v) => { linkUnit(v); unitText.input.value = draft.unitName; syncRock(); ctx.touchDraft(); },
    });
    node.appendChild(unitChips);
  }
  const unitText = textRow({
    label: known.length ? 'Or type a unit name' : 'Unit',
    value: draft.unitName, list: listId,
    onChange: (v) => { linkUnit(v); unitChips?.setValue(draft.unitName); syncRock(); ctx.touchDraft(); },
  });
  node.appendChild(unitText);

  const rockRow = selectRow({
    label: 'Rock type',
    value: draft.rockId || 'sandstone',
    options: ROCKS.map((r) => ({ value: r.id, label: `${r.group} — ${r.label}` })),
    onChange: (v) => { draft.rockId = v; ctx.touchDraft(); },
  });
  const rockSelect = rockRow.querySelector('select');
  const syncRock = () => { rockSelect.value = draft.rockId || 'sandstone'; };
  node.appendChild(rockRow);

  node.appendChild(chipsRow({
    label: 'Confidence',
    value: draft.certainty,
    options: CERTAINTIES.map((c) => ({ id: c.id, label: c.label, hint: c.hint })),
    onChange: (v) => { draft.certainty = v; ctx.touchDraft(); },
  }));

  // Bedding only, for the reason the Measure panel gives: nothing else has a
  // younger side to be on the wrong one of.
  const overturned = toggleRow({
    label: 'Overturned',
    value: draft.overturned === true,
    onChange: (v) => { draft.overturned = v; ctx.touchDraft(); },
  });
  node.appendChild(overturned);

  const note = noteRow({
    label: 'Note', value: draft.note, rows: 2,
    onChange: (v) => { draft.note = v; ctx.touchDraft(); },
  });
  node.appendChild(note);

  let lastNote = draft.note;
  let lastUnit = draft.unitName;
  node.refresh = () => {
    overturned.style.display = canBeOverturned(draft.feature) ? '' : 'none';
    if (draft.note !== lastNote) { lastNote = draft.note; note.input.value = draft.note || ''; }
    if (draft.unitName !== lastUnit) {
      lastUnit = draft.unitName;
      unitText.input.value = draft.unitName || '';
      unitChips?.setValue(draft.unitName);
      syncRock();
    }
  };
  return { node, refresh: node.refresh };
}

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
