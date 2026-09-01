// The five editor panels. Each returns an element with a `refresh()` for
// cheap text updates, so dragging a slider never rebuilds the DOM under the
// user's finger.

import {
  el, svg, clear, numberRow, selectRow, toggleRow, compassDial, protractor,
  enableDragReorder,
} from './widgets.js';
import { swatchEl, drawSwatch } from './swatch.js';
import { surfaceEditor } from './surfaceEditor.js';
import { eventIcon, strikeDipMark } from './icons.js';
import {
  ROCKS, rock, makeLayer, makeEvent, EVENT_TYPES, EVENT_ORDER,
  MAX_LAYERS, MAX_EVENTS, PRESETS, defaultDocument, totalThickness,
  FAULT_KINDS, FAULT_KIND_ORDER, faultRake, faultSense, unconformityDatums,
} from '../geo/model.js';
import { quadrantBearing } from '../geo/math.js';
import { formatReading, FLAT_DIP } from '../render/markers.js';
import { formatLine, formatPlane } from '../geo/stereonet.js';
import { surfaceRange, niceContourInterval, isDemSurface } from '../geo/surfaces.js';
import { misfit as fitMisfit, unitCheck } from '../geo/infer.js';
import { formatLonLat } from '../field/geo.js';
import { readyBlock, packsBlock } from './map/panels.js';
import { STAGES, unlocked, tryUnlock, passwordFor } from '../unlock.js';

// ---------------------------------------------------------------------------
// Stratigraphy
// ---------------------------------------------------------------------------

export function layersPanel(ctx) {
  const root = el('div', { class: 'panel' });
  let expanded = null;

  const build = () => {
    clear(root);
    const doc = ctx.store.doc;

    root.appendChild(sectionHead(
      'Stratigraphic column',
      'Youngest unit at the top, the way you would draw it in a notebook.',
    ));

    const list = el('div', { class: 'layer-list' });

    // Unconformities live in the event history but they cut the column, so
    // they are drawn here too, at the level they truncate. Placed by the
    // derived count, so a divider can never sit where the geometry does not —
    // stacked unconformities clamp each other.
    const datums = unconformityDatums(doc);
    const uncBefore = new Map();
    for (const ev of doc.events) {
      if (ev.type === 'unconformity' && ev.enabled !== false) {
        const at = datums.get(ev.id)?.above ?? 0;
        if (!uncBefore.has(at)) uncBefore.set(at, []);
        uncBefore.get(at).push(ev);
      }
    }

    doc.layers.forEach((layer, i) => {
      for (const ev of uncBefore.get(i) || []) list.appendChild(unconformityDivider(ctx, ev));
      list.appendChild(layerRow(ctx, layer, i, expanded === layer.id, (id) => {
        expanded = expanded === id ? null : id;
        build();
      }));
    });
    for (const ev of uncBefore.get(doc.layers.length) || []) {
      list.appendChild(unconformityDivider(ctx, ev));
    }

    list.appendChild(basementRow(ctx));
    enableDragReorder(list, {
      rowSel: '.layer-row:not(.basement)',
      gripSel: '.layer-grip',
      idKey: 'layerId',
      // The column is drawn youngest-first, which is already model order.
      // Unconformities count units from the top, so their dividers stay put
      // and a unit dragged across one changes which side of it it sits on.
      commit: (ids) => ctx.store.edit((d) => {
        d.layers = reorderById(d.layers, ids);
      }, { structural: true }),
    });
    enableDividerDrag(list, ctx);
    root.appendChild(list);

    const total = Math.round(totalThickness(doc.layers));
    root.appendChild(el('div', { class: 'panel-foot' }, [
      el('button', {
        class: 'btn primary',
        text: '+ Add unit',
        disabled: doc.layers.length >= MAX_LAYERS,
        onclick: () => {
          ctx.store.edit((d) => {
            d.layers.unshift(makeLayer(pickNextRock(d.layers), 150));
          }, { structural: true });
        },
      }),
      el('span', { class: 'foot-note', text: `${doc.layers.length} units · ${total} m total` }),
    ]));
  };

  build();
  root.refresh = build;
  return root;
}

function pickNextRock(layers) {
  const used = layers[0]?.rockId;
  const order = ['sandstone', 'shale', 'limestone', 'siltstone', 'conglomerate', 'dolostone'];
  return order.find((r) => r !== used) || 'sandstone';
}

function layerRow(ctx, layer, index, isOpen, toggle) {
  const doc = ctx.store.doc;
  const r = rock(layer.rockId);
  const color = layer.color || r.color;
  const pattern = layer.pattern != null ? layer.pattern : r.pattern;

  const sw = swatchEl(color, pattern, 'swatch');
  const head = el('button', { class: `layer-head ${isOpen ? 'open' : ''}`, type: 'button' }, [
    sw,
    el('div', { class: 'layer-title' }, [
      el('div', { class: 'layer-name', text: layer.name || r.label }),
      el('div', { class: 'layer-sub', text: `${Math.round(layer.thickness)} m · unit ${doc.layers.length - index}` }),
    ]),
    el('span', { class: 'chev', text: isOpen ? '▾' : '▸' }),
  ]);
  head.addEventListener('click', () => toggle(layer.id));

  // The grip sits outside the header so grabbing it never opens the editor.
  const grip = el('button', {
    class: 'layer-grip', type: 'button',
    'aria-label': 'Drag to move this unit through the column',
    title: 'Drag to move this unit through the column',
  }, [el('span', { text: '⠿' })]);

  const row = el('div', { class: 'layer-row' }, [
    el('div', { class: 'layer-main' }, [grip, head]),
  ]);
  row.dataset.layerId = layer.id;
  if (!isOpen) return row;

  const body = el('div', { class: 'layer-body' });

  body.appendChild(el('div', { class: 'ctl' }, [
    el('label', { class: 'ctl-label', text: 'Rock type' }),
    rockPicker(layer.rockId, (id) => {
      ctx.store.edit((d) => {
        const L = d.layers[index];
        const nr = rock(id);
        L.rockId = id;
        L.name = nr.label;
        L.color = nr.color;
        L.pattern = nr.pattern;
      }, { structural: true });
    }),
  ]));

  body.appendChild(numberRow({
    label: 'Thickness', value: layer.thickness, min: 5, max: 1200, step: 5, unit: 'm',
    onChange: (v) => ctx.store.edit((d) => { d.layers[index].thickness = v; },
      { coalesce: `thk:${layer.id}` }),
  }));

  body.appendChild(el('div', { class: 'ctl' }, [
    el('label', { class: 'ctl-label', text: 'Color' }),
    colorStrip(color, (hex) => {
      ctx.store.edit((d) => { d.layers[index].color = hex; }, { structural: true });
    }),
  ]));

  body.appendChild(el('div', { class: 'row-actions' }, [
    el('button', {
      class: 'btn small', text: '↑ Younger', disabled: index === 0,
      onclick: () => ctx.store.edit((d) => {
        [d.layers[index - 1], d.layers[index]] = [d.layers[index], d.layers[index - 1]];
      }, { structural: true }),
    }),
    el('button', {
      class: 'btn small', text: '↓ Older', disabled: index === doc.layers.length - 1,
      onclick: () => ctx.store.edit((d) => {
        [d.layers[index + 1], d.layers[index]] = [d.layers[index], d.layers[index + 1]];
      }, { structural: true }),
    }),
    el('button', {
      class: 'btn small danger', text: 'Delete', disabled: doc.layers.length <= 1,
      onclick: () => ctx.store.edit((d) => {
        d.layers.splice(index, 1);
        // Unconformities count layers from the top, so anything below the
        // deleted unit has to shift up with it.
        for (const ev of d.events) {
          if (ev.type === 'unconformity' && ev.aboveCount > index) ev.aboveCount--;
        }
      }, { structural: true }),
    }),
  ]));

  row.appendChild(body);
  return row;
}

function basementRow(ctx) {
  const doc = ctx.store.doc;
  const r = rock(doc.basementRockId);
  return el('div', { class: 'layer-row basement' }, [
    // Basement has no grip — it is not a unit and cannot be reordered — but it
    // keeps the gap so its swatch still lines up with the column above.
    el('div', { class: 'layer-main' }, [
      el('div', { class: 'layer-grip spacer' }),
      el('div', { class: 'layer-head static' }, [
        swatchEl(r.color, r.pattern, 'swatch'),
        el('div', { class: 'layer-title' }, [
          el('div', { class: 'layer-name', text: 'Basement' }),
          el('div', { class: 'layer-sub', text: 'everything below the column' }),
        ]),
      ]),
    ]),
  ]);
}

function unconformityDivider(ctx, ev) {
  // A row of humps all on the same side, the way the symbol is drawn on a
  // section. Written out rather than using smooth-curve reflection, which
  // alternates the humps above and below the line and pushes half of them
  // outside the viewBox.
  let d = 'M0 11';
  for (let x = 0; x < 200; x += 20) d += ` Q ${x + 10} 1 ${x + 20} 11`;
  const wave = svg('svg', {
    viewBox: '0 0 200 14', class: 'unc-wave', preserveAspectRatio: 'none',
  }, [svg('path', { d, fill: 'none' })]);

  // Dragging the divider is the honest way to set where an unconformity sits:
  // it is a boundary in the column, and moving it is visibly a repartition
  // rather than a number whose consequences you have to infer.
  const grip = el('button', {
    class: 'unc-grip', type: 'button',
    'aria-label': 'Drag to move the unconformity through the column',
    title: 'Drag to move the unconformity through the column',
  }, [el('span', { text: '⠿' })]);

  const body = el('button', {
    class: 'unc-body', type: 'button',
    onclick: () => ctx.selectEvent(ev.id, 'history'),
  }, [wave, el('span', { class: 'unc-label', text: ev.name })]);

  const row = el('div', { class: 'unc-divider' }, [grip, body]);
  row.dataset.evId = ev.id;
  return row;
}

function rockPicker(currentId, onPick) {
  const grid = el('div', { class: 'rock-grid' });
  let lastGroup = null;
  for (const r of ROCKS) {
    if (r.id === 'basement') continue;
    if (r.group !== lastGroup) {
      lastGroup = r.group;
      grid.appendChild(el('div', { class: 'rock-group', text: r.group }));
    }
    const cv = document.createElement('canvas');
    cv.className = 'rock-swatch';
    requestAnimationFrame(() => drawSwatch(cv, r.color, r.pattern, 0.7));
    const b = el('button', {
      class: `rock-btn ${r.id === currentId ? 'active' : ''}`, type: 'button',
      title: r.label, onclick: () => onPick(r.id),
    }, [cv, el('span', { text: r.label })]);
    grid.appendChild(b);
  }
  return grid;
}

const PALETTE = [
  '#e8c86a', '#d7c08d', '#c9955c', '#c46b4a', '#a8452f',
  '#8fb6cd', '#6f97b8', '#4d7fa3', '#a9c4b6', '#7d8a83',
  '#96917c', '#8a9c78', '#5c6b64', '#2f2f33', '#d98f8f',
  '#b07f95', '#6e6a80', '#c09a86', '#dfe3e0', '#ded0e4',
];

function colorStrip(current, onPick) {
  const wrap = el('div', { class: 'color-strip' });
  for (const c of PALETTE) {
    wrap.appendChild(el('button', {
      class: `color-dot ${c.toLowerCase() === String(current).toLowerCase() ? 'active' : ''}`,
      type: 'button', style: { background: c }, title: c,
      onclick: () => onPick(c),
    }));
  }
  const custom = el('input', { class: 'color-input', type: 'color', value: current });
  custom.addEventListener('change', () => onPick(custom.value));
  wrap.appendChild(custom);
  return wrap;
}

// ---------------------------------------------------------------------------
// Geologic history
// ---------------------------------------------------------------------------

export function historyPanel(ctx) {
  const root = el('div', { class: 'panel' });

  const build = () => {
    clear(root);
    const doc = ctx.store.doc;

    root.appendChild(sectionHead(
      'Geologic history',
      'Newest event at the top. Each event deforms everything older than it.',
    ));

    const add = el('div', { class: 'add-grid' });
    for (const type of EVENT_ORDER) {
      const def = EVENT_TYPES[type];
      add.appendChild(el('button', {
        class: 'add-btn', type: 'button', title: def.blurb,
        disabled: doc.events.length >= MAX_EVENTS,
        onclick: () => {
          const ev = makeEvent(type);
          ctx.store.edit((d) => {
            d.events.push(ev);
            // A new event is the youngest, so a block wound back before it
            // would answer "add a fault" by showing no fault at all.
            d.settings.timeStep = null;
          }, { structural: true });
          ctx.selectEvent(ev.id, 'history');
        },
      }, [
        el('span', { class: 'add-icon' }, [eventIcon(type)]),
        el('span', { text: def.label }),
      ]));
    }
    root.appendChild(add);

    if (!doc.events.length) {
      root.appendChild(el('div', { class: 'empty' }, [
        el('p', { text: 'No events yet — the beds are flat-lying.' }),
        el('p', { class: 'dim', text: 'Add a tilt, fold or fault above, or load a preset from the View tab.' }),
      ]));
      return;
    }

    root.appendChild(timeMachine(ctx));

    const list = el('div', { class: 'event-list' });
    // Displayed youngest-first so the list reads like the block does.
    for (let i = doc.events.length - 1; i >= 0; i--) {
      list.appendChild(eventRow(ctx, doc.events[i], i));
    }
    enableDragReorder(list, {
      rowSel: '.event-row',
      gripSel: '.event-grip',
      idKey: 'evId',
      // Drawn youngest-first, so the model order is this order reversed.
      commit: (ids) => ctx.store.edit((d) => {
        d.events = reorderById(d.events, ids.slice().reverse());
      }, { structural: true }),
    });
    root.appendChild(el('div', { class: 'timeline' }, [
      el('span', { class: 'time-cap', text: 'youngest' }),
      list,
      el('span', { class: 'time-cap', text: 'oldest' }),
    ]));
  };

  /**
   * The cheap path, matching the one in the Field panel: same rows, restated.
   * Every summary line is derived from parameters a slider is dragging, and
   * with the stereonet open beside the block a stale "axis 020/15" sits in
   * plain sight next to a net that has already moved on.
   */
  root.refreshReadings = () => {
    const doc = ctx.store.doc;
    const at = ctx.timeStep();
    for (const row of root.querySelectorAll('.event-row')) {
      const ev = doc.events.find((e) => e.id === row.dataset.evId);
      const sub = row.querySelector('.event-sub');
      if (ev && sub) sub.textContent = summarise(ev, doc);
      // Events the slider has not reached yet are on the list but not in the
      // block, and a row that looked the same either way would make the block
      // look wrong rather than early.
      const index = doc.events.findIndex((e) => e.id === row.dataset.evId);
      row.classList.toggle('ahead', index >= at);
    }
    root.querySelector('.time-machine')?.restate();
  };

  build();
  root.refresh = build;
  return root;
}

/**
 * The time machine: run the history from flat-lying beds to the block on
 * screen, a step at a time.
 *
 * A block diagram states a conclusion. The list of events beside it states the
 * argument, but a student reading "tilt, unconformity, fault" still has to
 * hold three deformations in their head at once and imagine the result. This
 * shows them instead.
 *
 * The readout carries the part that is easy to get wrong. Winding back past an
 * unconformity does not only remove the erosion — it removes the units that
 * were deposited on it, because those units did not exist yet, and a student
 * who sees them stay would learn the opposite of what an unconformity is. So
 * the control names them: "not yet deposited: Sandstone, Shale".
 */
function timeMachine(ctx) {
  const n = ctx.timeSpan();
  const range = el('input', {
    class: 'range time-range', type: 'range', min: 0, max: n, step: 1,
    'aria-label': 'How much of the history has happened',
  });
  const readout = el('div', { class: 'time-read' });
  const pending = el('div', { class: 'time-pending' });
  const play = el('button', {
    class: 'time-play', type: 'button', 'aria-label': 'Play the history through',
  });

  range.addEventListener('input', () => {
    ctx.stopPlayIfRunning();
    ctx.setTimeStep(Number(range.value), true);
  });
  play.addEventListener('click', () => ctx.togglePlay());

  const restate = () => {
    const doc = ctx.store.doc;
    const at = ctx.timeStep();
    const total = ctx.timeSpan();
    range.max = total;
    range.value = at;
    range.style.setProperty('--p', total ? at / total : 1);

    const on = doc.events.filter((e) => e.enabled !== false);
    clear(readout);
    readout.appendChild(el('strong', {
      text: at >= total ? 'Present day'
        : at === 0 ? 'Before any event'
          : on[at - 1].name,
    }));
    readout.appendChild(el('span', {
      text: at >= total ? ` · all ${total} ${total === 1 ? 'event' : 'events'}`
        : at === 0 ? ' · flat-lying beds'
          : ` · ${at} of ${total}`,
    }));

    // Which units the history has not laid down yet. Read off the view rather
    // than worked out here, so the list can only ever say what the block is
    // actually showing.
    const missing = doc.layers.slice(0, doc.layers.length - ctx.doc().layers.length);
    clear(pending);
    if (missing.length) {
      pending.appendChild(el('span', {
        text: `Not yet deposited: ${missing.map((l) => l.name).join(', ')}`,
      }));
    }

    play.classList.toggle('on', ctx.playing());
    play.textContent = ctx.playing() ? '❚❚' : '▶';
    play.title = ctx.playing() ? 'Stop' : 'Play the history through';
  };

  const box = el('div', { class: 'time-machine' }, [
    el('div', { class: 'time-head' }, [
      el('label', { class: 'ctl-label', text: 'Wind it back' }),
      readout,
    ]),
    el('div', { class: 'time-row' }, [play, range]),
    pending,
    el('div', {
      class: 'ctl-hint',
      text: 'Drag to run the history forward from flat-lying beds. Everything '
        + 'the block shows — the map face, a tap on it, the cross section — is '
        + 'the block as it stood at that moment.',
    }),
  ]);
  box.restate = restate;
  restate();
  return box;
}

function eventRow(ctx, ev, index) {
  const doc = ctx.store.doc;
  const def = EVENT_TYPES[ev.type];
  const isOpen = ctx.selectedEventId === ev.id;
  const disabled = ev.enabled === false;

  const head = el('button', {
    class: `event-head ${isOpen ? 'open' : ''} ${disabled ? 'off' : ''}`, type: 'button',
  }, [
    el('span', { class: 'event-icon' }, [eventIcon(ev.type)]),
    el('div', { class: 'event-title' }, [
      el('div', { class: 'event-name', text: ev.name }),
      el('div', { class: 'event-sub', text: summarise(ev, doc) }),
    ]),
    el('span', { class: 'chev', text: isOpen ? '▾' : '▸' }),
  ]);
  head.addEventListener('click', () => ctx.selectEvent(isOpen ? null : ev.id, 'history'));

  // The grip sits outside the header so grabbing it never toggles the editor.
  const grip = el('button', {
    class: 'event-grip', type: 'button',
    'aria-label': 'Drag to move this event in time',
    title: 'Drag to move this event in time',
  }, [el('span', { text: '⠿' })]);

  const row = el('div', { class: `event-row ${index >= ctx.timeStep() ? 'ahead' : ''}` }, [
    el('div', { class: 'event-main' }, [grip, head]),
  ]);
  row.dataset.evId = ev.id;
  if (!isOpen) return row;

  const body = el('div', { class: 'event-body' });
  body.appendChild(el('div', { class: 'ctl-hint standalone', text: def.blurb }));
  buildEventControls(ctx, ev, index, body);

  body.appendChild(el('div', { class: 'row-actions' }, [
    el('button', {
      class: 'btn small', text: '↑ Later', disabled: index === doc.events.length - 1,
      title: 'Move this event forward in time',
      onclick: () => ctx.store.edit((d) => {
        [d.events[index + 1], d.events[index]] = [d.events[index], d.events[index + 1]];
      }, { structural: true }),
    }),
    el('button', {
      class: 'btn small', text: '↓ Earlier', disabled: index === 0,
      title: 'Move this event back in time',
      onclick: () => ctx.store.edit((d) => {
        [d.events[index - 1], d.events[index]] = [d.events[index], d.events[index - 1]];
      }, { structural: true }),
    }),
    el('button', {
      class: 'btn small', text: disabled ? 'Enable' : 'Disable',
      title: 'Temporarily remove this event without deleting it',
      onclick: () => ctx.store.edit((d) => {
        d.events[index].enabled = d.events[index].enabled === false;
      }, { structural: true }),
    }),
    el('button', {
      class: 'btn small danger', text: 'Delete',
      onclick: () => ctx.store.edit((d) => { d.events.splice(index, 1); }, { structural: true }),
    }),
  ]));

  row.appendChild(body);
  return row;
}

/**
 * Which compass direction the steep limb faces, for the ends of the slider.
 *
 * A signed number with no direction on it is a number you have to discover by
 * dragging. The two sides are ninety degrees either side of the axis, so they
 * can just be named — and they are renamed when the axis turns.
 */
function vergenceEnds(ev) {
  const a = (ev.trend || 0) + 90;
  return [`steep to ${quadrantBearing((a + 180) % 360)}`, `steep to ${quadrantBearing(a % 360)}`];
}

function summarise(ev, doc) {
  const p = (n) => String(Math.round(n)).padStart(3, '0');
  switch (ev.type) {
    case 'tilt': return `${p(ev.strike)}/${Math.round(ev.dip)}  (${quadrantBearing(ev.strike)})`;
    // Same trend/plunge notation the stereonet reports a fitted axis in, so a
    // student can hold their answer up against the event that produced it.
    // Shape and reach are named only when they are doing something, so the
    // ordinary symmetric fold reads exactly as it always did.
    case 'fold': return [
      `axis ${formatLine(ev)}`,
      `λ ${Math.round(ev.wavelength)} m`,
      `A ${Math.round(ev.amplitude)} m`,
      ev.profile && ev.profile.length ? 'fitted profile' : null,
      Math.abs(ev.vergence || 0) > 0.02 ? 'verging' : null,
      Math.abs(ev.hinge || 0) > 0.02 ? ((ev.hinge > 0) ? 'sharp hinges' : 'box hinges') : null,
      (ev.reachAlong > 0 || ev.reachAcross > 0) ? 'dies out' : null,
    ].filter(Boolean).join(' · ');
    case 'domebasin': return `${ev.amplitude >= 0 ? 'Dome' : 'Basin'} · ${Math.round(Math.abs(ev.amplitude))} m · r ${Math.round(ev.radiusA)} m`;
    case 'fault': return `${p(ev.strike)}/${Math.round(ev.dip)} · ${faultSense(ev)} · slip ${Math.round(ev.slip)} m`;
    case 'dike': return `${p(ev.strike)}/${Math.round(ev.dip)} · ${Math.round(ev.thickness)} m · ${rock(ev.rockId).label}`;
    case 'pluton': return `${rock(ev.rockId).label} · ${Math.round(ev.radiusX)}×${Math.round(ev.radiusY)}×${Math.round(ev.radiusZ)} m`;
    case 'unconformity': {
      const L = doc.layers;
      const above = unconformityDatums(doc).get(ev.id)?.above ?? 0;
      const under = above > 0 && L[above - 1] ? `beneath ${L[above - 1].name}` : 'no cover yet';
      return `${under} · ${ev.surface.kind} surface`;
    }
    default: return '';
  }
}

/**
 * Drag an unconformity divider through the stratigraphic column.
 *
 * Unlike a row drag this moves a *boundary*, not an item: the drop index is
 * how many units end up above the unconformity, which is exactly `aboveCount`.
 * Boundary n sits above layer row n, so the target is the first row whose
 * midpoint is still below the finger.
 */
function enableDividerDrag(list, ctx) {
  let drag = null;
  const line = el('div', { class: 'drop-line' });
  const rows = () => [...list.querySelectorAll('.layer-row:not(.basement)')];

  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.unc-grip');
    if (!grip || drag) return;
    const row = grip.closest('.unc-divider');
    if (!row) return;

    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    drag = { row, pointerId: e.pointerId, startY: e.clientY, target: null };
    row.classList.add('dragging');
  });

  list.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.row.style.transform = `translateY(${e.clientY - drag.startY}px)`;

    const rs = rows();
    let idx = rs.length;
    for (let i = 0; i < rs.length; i++) {
      const b = rs[i].getBoundingClientRect();
      if (e.clientY < b.top + b.height / 2) { idx = i; break; }
    }
    drag.target = idx;
    if (idx < rs.length) list.insertBefore(line, rs[idx]);
    else rs[rs.length - 1].after(line);
  });

  const finish = (e) => {
    if (!drag || (e && e.pointerId !== drag.pointerId)) return;
    const { row, target } = drag;
    row.classList.remove('dragging');
    row.style.transform = '';
    line.remove();
    drag = null;

    if (target == null) return;
    const id = row.dataset.evId;
    ctx.store.edit((d) => {
      const ev = d.events.find((x) => x.id === id);
      if (ev) ev.aboveCount = target;
    }, { structural: true });
  };

  list.addEventListener('pointerup', finish);
  list.addEventListener('pointercancel', finish);
}

/** Reorder a document array to match a list of ids, or leave it alone. */
function reorderById(arr, ids) {
  const byId = new Map(arr.map((x) => [x.id, x]));
  const next = ids.map((x) => byId.get(x)).filter(Boolean);
  return next.length === arr.length ? next : arr;
}

// --- per-event parameter controls ------------------------------------------

function buildEventControls(ctx, ev, index, body) {
  const set = (key) => (v) => ctx.store.edit((d) => { d.events[index][key] = v; },
    { coalesce: `${ev.id}:${key}` });

  const nameRow = el('input', { class: 'name-input', type: 'text', value: ev.name });
  nameRow.addEventListener('change', () => ctx.store.edit(
    (d) => { d.events[index].name = nameRow.value || EVENT_TYPES[ev.type].label; },
    { structural: true },
  ));
  body.appendChild(el('div', { class: 'ctl' }, [
    el('label', { class: 'ctl-label', text: 'Label' }), nameRow,
  ]));

  switch (ev.type) {
    case 'tilt': {
      const dial = compassDial({ label: 'Strike', value: ev.strike, dip: ev.dip, onChange: set('strike') });
      body.appendChild(dial);
      body.appendChild(protractor({
        label: 'Dip', value: ev.dip, max: 89,
        onChange: (v) => { dial.setDip(v); set('dip')(v); },
      }));
      break;
    }

    case 'fold': {
      body.appendChild(compassDial({ label: 'Axis trend', value: ev.trend, onChange: set('trend') }));
      body.appendChild(protractor({ label: 'Plunge', value: ev.plunge, max: 80, onChange: set('plunge') }));
      body.appendChild(numberRow({
        label: 'Wavelength', value: ev.wavelength, min: 200, max: 6000, step: 25, unit: 'm',
        onChange: set('wavelength'), hint: 'Crest-to-crest distance.',
      }));
      body.appendChild(numberRow({
        label: 'Amplitude', value: ev.amplitude, min: 0, max: 1200, step: 10, unit: 'm',
        onChange: set('amplitude'), hint: 'Half the height from trough to crest.',
      }));
      body.appendChild(numberRow({
        label: 'Hinge shift', value: ev.phase, min: -180, max: 180, step: 5, unit: '°',
        onChange: set('phase'), hint: 'Slides the anticlines across the block.',
      }));

      // --- the shape of the fold, not just its size ------------------------
      // A cosine has symmetric limbs and rounded hinges and cannot be talked
      // out of either. These two are the smallest honest way to say otherwise,
      // and they are separate controls because they are separate observations:
      // which limb is steeper is not the same question as how sharp the hinge
      // is, and a fold can do one without the other.
      body.appendChild(el('div', { class: 'sub-head', text: 'Shape' }));
      if (ev.profile && ev.profile.length) {
        // A fitted profile is not a cosine and the sliders below shape a
        // cosine, so say what the fold is carrying and offer the way back.
        const wrap = el('div', { class: 'ctl-hint standalone' });
        wrap.appendChild(el('span', { text: 'This fold\u2019s cross-section was solved from your mapping rather than assumed, as a series of harmonics. Wavelength above is the fundamental the series is built on, and amplitude its peak. Vergence and hinge shape still warp it. ' }));
        const reset = el('button', { class: 'btn small', text: 'Replace with a plain cosine' });
        reset.onclick = () => set('profile')([]);
        wrap.appendChild(reset);
        body.appendChild(wrap);
      }
      const verge = numberRow({
        label: 'Vergence', value: ev.vergence || 0, min: -0.9, max: 0.9, step: 0.05,
        ends: vergenceEnds(ev),
        onChange: (v) => { set('vergence')(v); verge.setEnds(...vergenceEnds({ ...ev, vergence: v })); },
        hint: 'Moves the troughs off centre, so one limb is short and steep and the other long and gentle. Zero is a symmetric fold; the crests keep their height either way.',
      });
      body.appendChild(verge);
      body.appendChild(numberRow({
        label: 'Hinge shape', value: ev.hinge || 0, min: -0.9, max: 0.9, step: 0.05,
        ends: ['flat crests', 'tight hinges'],
        onChange: set('hinge'),
        hint: 'Where the steep part of each limb sits. Left opens the crests and troughs out into a box fold, flat on top with steep sides; right pulls the steepness against the hinges and tightens them. Both hinges change together, so this is never vergence. A true chevron — straight limbs, angular hinge — is not in this family: tightening here always flattens the middle of the limb.',
      }));

      // --- how far it reaches ----------------------------------------------
      // Without this a fold is infinite, which is why one fitted structure has
      // to serve a whole map and why an open limb in one corner cannot coexist
      // with a tight train in another.
      body.appendChild(el('div', { class: 'sub-head', text: 'How far it reaches' }));
      body.appendChild(numberRow({
        label: 'Along the axis', value: ev.reachAlong || 0, min: 0, max: 6000, step: 50, unit: 'm',
        onChange: set('reachAlong'),
        hint: 'The fold fades to nothing this far along its own hinge. Zero means it never does.',
      }));
      body.appendChild(numberRow({
        label: 'Across the axis', value: ev.reachAcross || 0, min: 0, max: 6000, step: 50, unit: 'm',
        onChange: set('reachAcross'),
        hint: 'How far the train of folds carries sideways before dying out. Zero means it never does.',
      }));
      body.appendChild(el('div', { class: 'ctl-hint standalone', text:
        'Both at zero is a fold that runs at full amplitude to every edge of the block, which is what this event used to be and is still the right answer for one structure filling one map. Set them and the fold becomes local — which is what lets a second fold, with its own shape, hold a different part of the block.' }));

      body.appendChild(centerRow(ctx, ev, index, ['centerX', 'centerY']));
      break;
    }

    case 'domebasin': {
      body.appendChild(numberRow({
        label: 'Amplitude', value: ev.amplitude, min: -1200, max: 1200, step: 10, unit: 'm',
        onChange: set('amplitude'), hint: 'Positive makes a dome, negative a basin.',
      }));
      body.appendChild(numberRow({
        label: 'Radius (long)', value: ev.radiusA, min: 100, max: 3000, step: 25, unit: 'm',
        onChange: set('radiusA'),
      }));
      body.appendChild(numberRow({
        label: 'Radius (short)', value: ev.radiusB, min: 100, max: 3000, step: 25, unit: 'm',
        onChange: set('radiusB'),
      }));
      body.appendChild(compassDial({ label: 'Long-axis trend', value: ev.azimuth, onChange: set('azimuth') }));
      body.appendChild(centerRow(ctx, ev, index, ['centerX', 'centerY']));
      break;
    }

    case 'fault': {
      const dial = compassDial({ label: 'Strike', value: ev.strike, dip: ev.dip, onChange: set('strike') });
      body.appendChild(dial);
      body.appendChild(protractor({
        label: 'Dip', value: ev.dip, max: 90,
        onChange: (v) => { dial.setDip(v); set('dip')(v); },
      }));

      // Kind first, obliquity second. Rake is the derived quantity and is
      // reported rather than dialed, because "normal" is what a student
      // means and 090 is only how it gets written down.
      const kindDef = () => FAULT_KINDS[ev.kind] || FAULT_KINDS.normal;
      const senseNote = el('div', { class: 'sense-note' });
      const refreshNote = () => {
        const k = kindDef();
        senseNote.textContent = `${faultSense(ev)} · rake ${Math.round(faultRake(ev))}°`;
        obliqRow.setEnds(k.neg, k.pos);
      };

      body.appendChild(el('div', { class: 'ctl' }, [
        el('label', { class: 'ctl-label', text: 'Fault type' }),
        el('div', { class: 'segmented' }, FAULT_KIND_ORDER.map((id) => el('button', {
          class: `seg ${ev.kind === id ? 'active' : ''}`, type: 'button',
          title: FAULT_KINDS[id].blurb, text: FAULT_KINDS[id].label,
          onclick: () => ctx.store.edit((d) => { d.events[index].kind = id; }, { structural: true }),
        }))),
      ]));
      body.appendChild(el('div', { class: 'ctl-hint standalone', text: kindDef().blurb }));

      const obliqRow = numberRow({
        label: 'Oblique slip', value: ev.obliquity || 0, min: -90, max: 90, step: 5, unit: '°',
        ends: [kindDef().neg, kindDef().pos],
        hint: 'Zero is a pure slip of the chosen type; the ends are the pure opposite.',
        onChange: (v) => {
          ev.obliquity = v;             // keep the local copy in step for the note
          refreshNote();
          set('obliquity')(v);
        },
      });
      body.appendChild(obliqRow);
      body.appendChild(senseNote);
      refreshNote();

      body.appendChild(numberRow({
        label: 'Slip', value: ev.slip, min: 0, max: 2000, step: 10, unit: 'm',
        onChange: set('slip'), hint: 'Displacement of the hanging wall along the rake.',
      }));
      body.appendChild(centerRow(ctx, ev, index, ['centerX', 'centerY', 'centerZ']));
      break;
    }

    case 'dike': {
      const dial = compassDial({ label: 'Strike', value: ev.strike, dip: ev.dip, onChange: set('strike') });
      body.appendChild(dial);
      body.appendChild(protractor({
        label: 'Dip', value: ev.dip, max: 90,
        onChange: (v) => { dial.setDip(v); set('dip')(v); },
        // A dip near 0 makes this a sill rather than a dike.
      }));
      body.appendChild(numberRow({
        label: 'Thickness', value: ev.thickness, min: 5, max: 600, step: 5, unit: 'm',
        onChange: set('thickness'),
      }));
      body.appendChild(rockRow(ctx, ev, index, ['basalt', 'gabbro', 'granite', 'diorite', 'tuff']));
      body.appendChild(numberRow({
        label: 'Top', value: ev.topZ, min: -2000, max: 1500, step: 25, unit: 'm',
        onChange: set('topZ'), hint: 'Set below the surface for a blind intrusion.',
      }));
      body.appendChild(numberRow({
        label: 'Bottom', value: ev.bottomZ, min: -4000, max: 500, step: 25, unit: 'm',
        onChange: set('bottomZ'),
      }));
      body.appendChild(centerRow(ctx, ev, index, ['centerX', 'centerY']));
      break;
    }

    case 'pluton': {
      body.appendChild(rockRow(ctx, ev, index, ['granite', 'diorite', 'gabbro', 'basalt']));
      body.appendChild(numberRow({
        label: 'Radius E–W', value: ev.radiusX, min: 50, max: 2500, step: 25, unit: 'm', onChange: set('radiusX'),
      }));
      body.appendChild(numberRow({
        label: 'Radius N–S', value: ev.radiusY, min: 50, max: 2500, step: 25, unit: 'm', onChange: set('radiusY'),
      }));
      body.appendChild(numberRow({
        label: 'Radius vertical', value: ev.radiusZ, min: 50, max: 2500, step: 25, unit: 'm', onChange: set('radiusZ'),
      }));
      body.appendChild(compassDial({ label: 'Long-axis trend', value: ev.azimuth, onChange: set('azimuth') }));
      body.appendChild(centerRow(ctx, ev, index, ['centerX', 'centerY', 'centerZ']));
      break;
    }

    case 'unconformity': {
      const doc = ctx.store.doc;
      const L = doc.layers;
      const datum = unconformityDatums(doc).get(ev.id);
      const above = datum ? datum.above : Math.min(Math.max(0, ev.aboveCount | 0), L.length);
      const depth = datum ? Math.round(-datum.base) : 0;

      // Named, not counted. An unconformity is a boundary in the column, and
      // saying which unit it sits under makes it obvious that moving it hands
      // a unit from one side to the other — where a bare count reads as though
      // the erosion had simply bitten deeper.
      body.appendChild(selectRow({
        label: 'Erosion surface sits beneath',
        value: String(above),
        options: [
          { value: '0', label: 'Nothing — no cover deposited yet' },
          ...L.map((l, i) => ({
            value: String(i + 1),
            label: `${l.name} (unit ${L.length - i})`,
          })),
        ],
        onChange: (v) => ctx.store.edit((d) => { d.events[index].aboveCount = Number(v); },
          { structural: true }),
      }));

      const names = (a, b) => L.slice(a, b).map((l) => l.name).join(', ') || '—';
      body.appendChild(el('div', { class: 'unc-split' }, [
        el('div', { class: 'unc-split-row' }, [
          el('span', { class: 'unc-split-key', text: 'Deposited after' }),
          el('span', { class: 'unc-split-val', text: names(0, above) }),
        ]),
        el('div', { class: 'unc-split-row' }, [
          el('span', { class: 'unc-split-key', text: 'Eroded into' }),
          el('span', { class: 'unc-split-val', text: names(above, L.length) }),
        ]),
      ]));
      body.appendChild(el('div', {
        class: 'ctl-hint standalone',
        text: above > 0
          ? `The column has a fixed set of units, so moving the surface down`
            + ` hands one to the younger side rather than adding a new one.`
            + ` It sits ${depth} m down, at the base of ${L[above - 1].name}.`
          : 'With nothing deposited on it, the surface is not an unconformity'
            + ' yet and the block is unchanged.',
      }));
      body.appendChild(selectRow({
        label: 'Younger beds',
        value: ev.fill || 'flat',
        options: [
          { value: 'flat', label: 'Lie flat and onlap the surface' },
          { value: 'drape', label: 'Drape over the buried topography' },
        ],
        onChange: (v) => ctx.store.edit((d) => { d.events[index].fill = v; }, { structural: true }),
      }));
      body.appendChild(el('div', { class: 'sub-head', text: 'Erosion surface' }));
      body.appendChild(el('div', {
        class: 'ctl-hint standalone',
        text: 'Its relief is what truncates the older beds and gives the younger'
          + ' ones something to onlap; its depth follows the unit above.',
      }));
      body.appendChild(surfaceEditor(ev.surface, (patch, key) => {
        ctx.store.edit((d) => { Object.assign(d.events[index].surface, patch); },
          { coalesce: `${ev.id}:${key}` });
      }, { showBase: false }));
      break;
    }
  }
}

function centerRow(ctx, ev, index, keys) {
  const labels = { centerX: 'Position E', centerY: 'Position N', centerZ: 'Depth' };
  const ranges = { centerX: [-2500, 2500], centerY: [-2500, 2500], centerZ: [-3000, 800] };
  return el('div', { class: 'ctl-pair' }, keys.map((k) => numberRow({
    label: labels[k], value: ev[k], min: ranges[k][0], max: ranges[k][1], step: 25, unit: 'm',
    onChange: (v) => ctx.store.edit((d) => { d.events[index][k] = v; },
      { coalesce: `${ev.id}:${k}` }),
  })));
}

function rockRow(ctx, ev, index, ids) {
  const wrap = el('div', { class: 'ctl' }, [el('label', { class: 'ctl-label', text: 'Rock type' })]);
  const strip = el('div', { class: 'rock-strip' });
  for (const id of ids) {
    const r = rock(id);
    const cv = document.createElement('canvas');
    cv.className = 'rock-swatch';
    requestAnimationFrame(() => drawSwatch(cv, r.color, r.pattern, 0.7));
    strip.appendChild(el('button', {
      class: `rock-btn ${ev.rockId === id ? 'active' : ''}`, type: 'button',
      onclick: () => ctx.store.edit((d) => { d.events[index].rockId = id; }, { structural: true }),
    }, [cv, el('span', { text: r.label })]));
  }
  wrap.appendChild(strip);
  return wrap;
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------


/**
 * How well this block still explains the mapping it was built from.
 *
 * The verdict and the notes are what the fit decided when the block was cut,
 * so they are read off the document. The misfit is NOT: it is recomputed here,
 * every time the panel is drawn, against whatever the history says now. That
 * is the whole point of showing it — edit the fold, and this is the number
 * that tells you whether you improved the block or broke it. A stored number
 * would be a receipt for a block that no longer exists.
 */
function fitReport(ctx, doc) {
  const fit = doc.fit;
  if (!fit || !doc.survey) return null;

  const root = el('div', {});
  root.appendChild(el('div', { class: 'sub-head', text: 'How well this block fits your mapping' }));

  const now = fitMisfit(doc.events, doc.survey);
  const built = fit.built || {};
  const moved = (a, b) => (a == null || b == null ? '' : (b - a > 0.35 ? ' worse' : (a - b > 0.35 ? ' better' : '')));

  const angleVal = el('span', { class: 'stat-value' });
  const spreadVal = el('span', { class: 'stat-value' });
  const stats = [
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat-label', text: 'Readings off by' }), angleVal]),
  ];
  if (now.surfaces) {
    stats.push(el('div', { class: 'stat' }, [
      el('span', { class: 'stat-label', text: 'Contacts held to' }), spreadVal]));
  }
  const areaVal = el('span', { class: 'stat-value' });
  if (now.patches) {
    stats.push(el('div', { class: 'stat' }, [
      el('span', { class: 'stat-label', text: 'Shaded units off by' }), areaVal]));
  }
  stats.push(statRow('Readings used', String(now.n)));
  stats.push(statRow('Contacts used', String(now.surfaces)));
  root.appendChild(el('div', { class: 'stats' }, stats));

  // Rewritten in place rather than rebuilt, so dragging a fold's plunge shows
  // the misfit moving under the finger instead of the panel flickering.
  const paint = (m) => {
    angleVal.textContent = `${m.angle.toFixed(1)}°`;
    angleVal.className = `stat-value ${m.angle < 6 ? 'good' : 'warn'}`;
    if (m.surfaces) {
      spreadVal.textContent = `±${Math.round(m.spread)} m`;
      spreadVal.className = `stat-value ${m.spread < 40 ? 'good' : 'warn'}`;
    }
    if (m.patches) {
      areaVal.textContent = m.area < 0.5 ? 'inside' : `${Math.round(m.area)} m out`;
      areaVal.className = `stat-value ${m.area < 15 ? 'good' : 'warn'}`;
    }
  };
  paint(now);
  root.refreshFit = () => paint(fitMisfit(ctx.store.doc.events, ctx.store.doc.survey));

  const drift = [];
  if (built.angle != null) {
    const d = moved(built.angle, now.angle);
    if (d) drift.push(`Attitudes were ${built.angle.toFixed(1)}° when this block was built —${d} now.`);
  }
  if (built.spread != null && now.surfaces) {
    const d = moved(built.spread, now.spread);
    if (d) drift.push(`Contacts were ±${Math.round(built.spread)} m —${d} now.`);
  }
  if (drift.length) {
    root.appendChild(el('div', { class: 'ctl-hint standalone', text: drift.join(' ') }));
  }

  root.appendChild(el('div', { class: 'ctl-hint standalone', text: now.patches
    ? 'All three are live. Change an event on the History tab and they answer for the block you have now, not the one that was fitted. A shaded unit says what crops out over a whole area rather than along a line, which is what pins where the column sits — "inside" means every sampled point lands in the right unit.'
    : 'Both numbers are live. Change an event on the History tab and they answer for the block you have now, not the one that was fitted — which is the fastest way to find out whether your correction is an improvement.' }));

  // Does the block agree with the units you logged? Nothing in building the
  // column consults them, so this is the one place the two are held together.
  const uc = unitCheck(doc);
  if (uc) {
    const all = uc.agree === uc.n;
    root.appendChild(el('div', { class: 'sub-head', text: 'Units you logged' }));
    root.appendChild(el('div', { class: 'stats' }, [
      el('div', { class: 'stat' }, [
        el('span', { class: 'stat-label', text: 'Block agrees at' }),
        el('span', { class: `stat-value ${all ? 'good' : 'warn'}`,
          text: `${uc.agree} of ${uc.n}` }),
      ]),
    ]));
    if (!all) {
      const wrong = uc.rows.filter((r) => !r.ok).slice(0, 8);
      root.appendChild(el('div', { class: 'unit-check' }, wrong.map((r) => el('div', { class: 'stat' }, [
        el('span', { class: 'stat-label', text: `Station ${r.name || r.id}` }),
        el('span', { class: 'stat-value warn', text: `you ${r.mapped} · block ${r.block || '—'}` }),
      ]))));
      root.appendChild(el('div', { class: 'ctl-hint standalone', text:
        'The column is built from the contacts and never consults the unit you named at a station, so this is a genuine second opinion rather than a restatement. If the same offset runs through all of them the column is hung wrong; if one station disagrees on its own, look at that station.' }));
    } else {
      root.appendChild(el('div', { class: 'ctl-hint standalone', text:
        'The unit this block puts at each station is the one you logged there. That is an independent agreement: nothing in building the column consulted these names.' }));
    }
  }

  // Ninety degrees per reading is also what a broken observation looks like,
  // so say when that is what is happening rather than letting it read as a
  // verdict on the geology.
  if (now.blind) {
    root.appendChild(el('div', { class: 'notice warn' }, [el('p', { text:
      `${now.blind} of ${now.n} readings have no bedding beneath them in this block — inside an intrusion, or off the ground the block covers. Each is scored as a right angle, so the number above is worse than the geology is.` })]));
  }

  // What the stereonet decided, from the readings alone.
  const v = fit.verdict || {};
  const said = {
    girdle: 'a cylindrical fold', cluster: 'one attitude — a homocline',
    conical: 'a dome or a basin', scattered: 'not one structure',
    few: 'too few readings to fit anything',
  }[v.kind];
  if (said) {
    root.appendChild(el('div', { class: 'notice' }, [
      el('p', {}, [el('strong', { text: 'The stereonet said: ' }), el('span', { text: said })]),
      v.n ? el('p', { class: 'dim', text:
        `${v.n} pole${v.n === 1 ? '' : 's'}${v.misfit != null ? `, ${v.misfit.toFixed(1)}° off the fitted circle` : ''}${v.spread != null ? `, spanning ${Math.round(v.spread)}° of it` : ''}.` }) : null,
    ]));
  }

  for (const n of fit.notes || []) {
    root.appendChild(el('div', { class: 'ctl-hint standalone', text: n }));
  }
  for (const w of fit.warnings || []) {
    root.appendChild(el('div', { class: 'notice warn' }, [el('p', { text: w })]));
  }

  if (fit.units && fit.units.length) {
    root.appendChild(el('div', { class: 'sub-head', text: 'Column, read off the map' }));
    root.appendChild(el('div', { class: 'stats' }, fit.units.map((u) => el('div', { class: 'stat' }, [
      el('span', { class: 'stat-label', text: u.name || 'unnamed' }),
      el('span', { class: `stat-value ${u.measured ? '' : 'dim'}`,
        text: `${Math.round(u.thickness)} m${u.measured ? ''
          : (u.fromColumn ? ' (your column)' : ' (at least)')}` }),
    ]))));
    root.appendChild(el('div', { class: 'ctl-hint standalone', text:
      'Two contacts at a known structure differ by the thickness between them, so these were read off the map rather than measured with a tape. The top and bottom units are open-ended: nothing you mapped says how thick they are, so those two are lower bounds — enough to reach the oldest and youngest rock that actually crops out, and no claim beyond it.' }));
  }

  const c = fit.counts || {};
  const d = c.dropped || {};
  const skipped = [];
  if (d.outside) skipped.push(`${d.outside} outside the box`);
  if (d.noAttitude) skipped.push(`${d.noAttitude} with no reading yet`);
  if (d.notBedding) skipped.push(`${d.notBedding} neither bedding nor on a fault`);
  if (d.linear) skipped.push(`${d.linear} linear`);
  if (skipped.length) {
    root.appendChild(el('div', { class: 'ctl-hint standalone',
      text: `Stations not used: ${skipped.join(', ')}.` }));
  }
  if (fit.ground && fit.ground.missing) {
    root.appendChild(el('div', { class: 'notice warn' }, [el('p', { text:
      `${fit.ground.missing} elevation samples were missing when this block was cut and were filled in from their neighbours.` })]));
  }

  return root;
}

/** A label and a value, for facts the panel states rather than edits. */
function statRow(label, value) {
  return el('div', { class: 'stat' }, [
    el('span', { class: 'stat-label', text: label }),
    el('span', { class: 'stat-value', text: value }),
  ]);
}

export function terrainPanel(ctx) {
  const root = el('div', { class: 'panel' });

  const build = () => {
    clear(root);
    const doc = ctx.store.doc;

    const measured = isDemSurface(doc.topo);

    root.appendChild(sectionHead(
      measured ? 'Measured ground' : 'Land surface',
      measured
        ? 'This block is capped with real topography, sampled from the elevation data for the area you mapped.'
        : 'The map face of the block. Relief is what makes outcrop patterns interesting.',
    ));

    if (measured) {
      // No landform controls: there is nothing to set. Real ground is a place,
      // not a shape with parameters, and offering an amplitude slider for it
      // would imply the mountain could be made taller.
      const gr = doc.georef;
      root.appendChild(el('div', { class: 'stats' }, [
        gr ? statRow('Centre', formatLonLat(gr.lon0, gr.lat0)) : null,
        statRow('Datum', `${Math.round(doc.topo.datum || 0)} m above sea level`),
        statRow('Samples', `${doc.topo.nx} × ${doc.topo.ny}`),
      ].filter(Boolean)));
      root.appendChild(el('div', { class: 'ctl-hint standalone',
        text: 'Heights on this block are metres about that datum, so the middle of the ground is zero. The Map half is where this came from, and where its readings still live.' }));
    } else {
      root.appendChild(surfaceEditor(doc.topo, (patch, key) => {
        ctx.store.edit((d) => { Object.assign(d.topo, patch); }, { coalesce: `topo:${key}` });
      }));
    }

    root.appendChild(el('div', { class: 'sub-head', text: 'Contours' }));
    root.appendChild(toggleRow({
      label: 'Contour lines', value: doc.settings.showContours !== false,
      hint: 'Drawn on the map face only. Every fifth line is heavier.',
      onChange: (v) => ctx.store.edit((d) => { d.settings.showContours = v; },
        { structural: true }),
    }));
    if (doc.settings.showContours !== false) {
      const { lo, hi } = surfaceRange(doc.topo, doc.block.width, doc.block.depth);
      const auto = niceContourInterval(hi - lo);
      root.appendChild(selectRow({
        label: 'Interval',
        value: String(doc.settings.contourInterval || 0),
        options: [
          { value: '0', label: auto ? `Automatic — ${fmtInterval(auto)}` : 'Automatic — ground is flat' },
          ...[5, 10, 20, 25, 50, 100, 200, 500].map((v) => ({ value: String(v), label: `${v} m` })),
        ],
        onChange: (v) => ctx.store.edit((d) => { d.settings.contourInterval = Number(v); },
          { structural: true }),
      }));
      root.appendChild(el('div', { class: 'ctl-hint standalone', text: `Relief across the block: ${Math.round(hi - lo)} m` }));
    }

    root.appendChild(el('div', { class: 'sub-head', text: 'Block size' }));
    if (measured) {
      // Width and depth are the footprint the ground was sampled over. Change
      // them and the lid stretches or gets cropped, and every station drifts
      // off the place it was recorded — so only the depth of the block is left
      // free, which is the one that costs nothing.
      root.appendChild(el('div', { class: 'ctl-hint standalone',
        text: 'Width and north–south depth are fixed by the area you mapped — they are the footprint the ground was sampled over, and the readings are pinned to it. How deep the block is cut is still yours.' }));
    }
    for (const [key, label, max] of [
      ['width', 'Width (E–W)', 6000],
      ['depth', 'Depth (N–S)', 6000],
      ['height', 'Height', 4000],
    ]) {
      // On measured ground the footprint is not a preference. Stretching it
      // would slide every station off the place it was recorded.
      if (measured && key !== 'height') continue;
      root.appendChild(numberRow({
        label, value: doc.block[key], min: 400, max, step: 100, unit: 'm',
        onChange: (v) => ctx.store.edit((d) => { d.block[key] = v; }, { coalesce: `block:${key}` }),
      }));
    }

    root.appendChild(el('div', { class: 'sub-head', text: 'Cutaway' }));
    root.appendChild(el('div', { class: 'ctl-hint standalone', text: 'Slide a wall into the block to expose a fresh cross-section. The geology does not move — you are cutting a new face through it.' }));
    for (const [key, label, dim] of [['cutE', 'Cut in from the east', 'width'], ['cutN', 'Cut in from the north', 'depth']]) {
      root.appendChild(numberRow({
        label, value: doc.block[key] || 0, min: 0, max: Math.round(doc.block[dim] * 0.85), step: 25, unit: 'm',
        onChange: (v) => ctx.store.edit((d) => { d.block[key] = v; }, { coalesce: `block:${key}` }),
      }));
    }

    // --- cutting it open ---------------------------------------------------
    root.appendChild(el('div', { class: 'sub-head', text: 'Cut it open' }));

    const onSection = ctx.sectionOpen();
    root.appendChild(el('button', {
      class: `btn wide ${onSection ? 'armed' : ''}`, type: 'button',
      text: onSection ? 'Cross section — tap to close' : 'Cut a cross section',
      onclick: () => ctx.setSection(!onSection),
    }));
    root.appendChild(el('div', {
      class: 'ctl-hint',
      text: 'Drag A–A′ across the little map and the block is drawn along that line, '
        + 'with faults, unconformities and the ground profile on it. Tap the section '
        + 'to name a unit.',
    }));

    const onSlice = ctx.sliceOpen();
    root.appendChild(el('button', {
      class: `btn wide ${onSlice ? 'armed' : ''}`, type: 'button',
      text: onSlice ? 'Slicer — tap to put the block back' : 'Slice down through it',
      onclick: () => ctx.setSlice(!onSlice),
    }));
    root.appendChild(el('div', {
      class: 'ctl-hint',
      text: 'Lowers the top of the block, so the fresh flat face is the map you would '
        + 'get at that depth. The slider clicks on to the base of each unit in the column.',
    }));

    root.appendChild(el('div', { class: 'sub-head', text: 'Display' }));
    root.appendChild(numberRow({
      label: 'Vertical exaggeration', value: doc.settings.exaggeration, min: 0.5, max: 4, step: 0.1,
      unit: '×',
      onChange: (v) => ctx.store.edit((d) => { d.settings.exaggeration = v; },
        { coalesce: 'exag' }),
      hint: 'Display only — strikes and dips are unchanged.',
    }));
  };

  build();
  root.refresh = build;
  return root;
}

// ---------------------------------------------------------------------------
// Field measurements
// ---------------------------------------------------------------------------

export function fieldPanel(ctx) {
  const root = el('div', { class: 'panel' });
  // Rows are kept by id so a marker being dragged can have its numbers
  // rewritten in place. Rebuilding the list under the finger would be both
  // wasteful and, on a phone, visibly jumpy.
  const rows = new Map();
  let summary = null;
  let fitNode = null;

  const build = () => {
    clear(root);
    rows.clear();
    const doc = ctx.store.doc;
    const readings = ctx.readings();

    root.appendChild(sectionHead(
      'Strike & dip',
      'Drop a reading on the ground. It clings to the surface and reports the bedding beneath it — slide it around and the numbers follow.',
    ));

    const arming = ctx.markerMode() === 'add';
    root.appendChild(el('button', {
      class: `btn wide ${arming ? 'armed' : 'primary'}`,
      type: 'button',
      text: arming ? 'Placing — tap the block, or tap here to stop' : '+ Add strike & dip',
      onclick: () => ctx.setMarkerMode(arming ? null : 'add'),
    }));
    if (arming) {
      root.appendChild(el('div', { class: 'ctl-hint', text: 'Every tap on the block leaves another reading. Drag one afterwards to move it.' }));
    }

    if (!readings.length) {
      root.appendChild(el('p', { class: 'empty-note', text: 'No readings yet.' }));
    } else {
      const list = el('div', { class: 'marker-list' });
      for (const r of readings) list.appendChild(markerRow(ctx, r, rows));
      root.appendChild(list);

      root.appendChild(el('div', { class: 'panel-foot' }, [
        el('button', {
          class: 'btn small danger', text: 'Clear all',
          onclick: () => {
            if (!confirm('Remove every strike and dip reading?')) return;
            ctx.selectMarker(null);
            ctx.store.edit((d) => { d.markers = []; }, { structural: true });
          },
        }),
        el('span', {
          class: 'foot-note',
          text: `${readings.length} reading${readings.length === 1 ? '' : 's'}`,
        }),
      ]));
    }

    root.appendChild(el('div', { class: 'sub-head', text: 'Analysis' }));
    // The stereonet's finding, kept out here where it survives closing the
    // net — and where it updates live under a finger dragging a marker.
    summary = el('div', { class: 'net-summary-slot' });
    fillSummary();
    root.appendChild(summary);
    const onNet = ctx.netOpen();
    root.appendChild(el('button', {
      class: `btn wide ${onNet ? 'armed' : ''}`, type: 'button',
      text: onNet ? 'Stereonet shown — tap to hide' : 'Plot on a stereonet',
      disabled: readings.length === 0 && !onNet,
      onclick: () => ctx.setNet(!onNet),
    }));
    root.appendChild(el('div', {
      class: 'ctl-hint',
      text: readings.length === 0
        ? 'Place some readings first — a stereonet has nothing to say about an empty notebook.'
        : 'Opens beside the block. Edit a fold in History with it up and the girdle swings as you drag.',
    }));

    // Only for a block cut from a field area: an invented landform has no map
    // that was walked, so there is nothing to hold the prediction against.
    if (ctx.groundAvailable && ctx.groundAvailable()) {
      const onGround = ctx.groundOpen();
      root.appendChild(el('button', {
        class: `btn wide ${onGround ? 'armed' : ''}`, type: 'button',
        text: onGround ? 'Ground map shown — tap to hide' : 'Compare with the map you walked',
        onclick: () => ctx.setGroundMap(!onGround),
      }));
      root.appendChild(el('div', { class: 'ctl-hint', text:
        'Draws the contacts this block predicts over the ones you mapped. Where they part company is where the model and the ground disagree — which is the argument worth having. It shares the slot with the stereonet.' }));
    }

    // Everything the fit decided, for a block cut from a field area. Placed
    // here rather than left behind on the Map section: building a block takes
    // you straight to this half, and an explanation you have to navigate back
    // to is one nobody reads.
    fitNode = fitReport(ctx, doc);
    if (fitNode) root.appendChild(fitNode);

    root.appendChild(el('div', { class: 'sub-head', text: 'Display' }));
    root.appendChild(toggleRow({
      label: 'Show readings', value: doc.settings.showMarkers !== false,
      hint: 'Hide them for a clean block, without losing where they sit.',
      onChange: (v) => ctx.store.edit((d) => { d.settings.showMarkers = v; },
        { structural: true }),
    }));
    root.appendChild(numberRow({
      label: 'Symbol size', value: doc.settings.markerSize || 1,
      min: 0.5, max: 2.5, step: 0.1,
      hint: 'Bigger symbols read better across a room; smaller ones crowd less.',
      onChange: (v) => ctx.store.edit((d) => { d.settings.markerSize = v; },
        { coalesce: 'markerSize' }),
    }));
  };

  function markerRow(c, r, refs) {
    const mark = el('span', { class: 'marker-mark' }, [strikeDipMark(r.strike, r.dip)]);
    const value = el('div', { class: 'marker-value', text: formatReading(r) });
    const sub = el('div', { class: 'marker-sub', text: subText(r) });

    const row = el('div', {
      class: `marker-row ${c.selectedMarkerId() === r.id ? 'selected' : ''}`,
    }, [
      el('button', {
        class: 'marker-main', type: 'button',
        onclick: () => c.selectMarker(c.selectedMarkerId() === r.id ? null : r.id),
      }, [mark, el('div', { class: 'marker-text' }, [value, sub])]),
      el('button', {
        class: 'marker-del', type: 'button', text: '×', 'aria-label': 'Delete this reading',
        onclick: () => {
          if (c.selectedMarkerId() === r.id) c.selectMarker(null);
          c.store.edit((d) => {
            d.markers = d.markers.filter((m) => m.id !== r.id);
          }, { structural: true });
        },
      }),
    ]);
    refs.set(r.id, { row, mark, value, sub });
    return row;
  }

  /**
   * One line of what the readings add up to. Says nothing at all when there is
   * nothing to say — three readings from one limb is not a finding.
   */
  function fillSummary() {
    if (!summary) return;
    clear(summary);
    const fit = ctx.fit();
    if (fit.kind === 'few') return;

    const parts = {
      girdle: ['Fold axis', formatLine(fit.axis || { trend: 0, plunge: 0 }), 'trend / plunge'],
      cluster: ['One attitude', formatPlane(fit.mean), 'mean bedding — no fold axis'],
      conical: ['Dome or basin', `${Math.round(fit.cone.angle)}°`, 'cone half-angle — no fold axis'],
      scattered: ['Not one structure', null, 'the poles fall on no single girdle'],
    }[fit.kind];
    if (!parts) return;

    const [kind, value, note] = parts;
    summary.appendChild(el('div', { class: `net-summary ${fit.kind}` }, [
      el('span', { class: 'kind', text: kind }),
      value ? el('strong', { text: value }) : null,
      el('span', { class: 'note', text: note }),
    ]));
  }

  function subText(r) {
    const where = `${Math.round(r.x)} E, ${Math.round(r.y)} N`;
    if (r.dip == null) return `${where} · nothing bedded here`;
    if (r.dip < FLAT_DIP) return `${where} · flat-lying`;
    return `${quadrantBearing(r.strike)} · dip ${Math.round(r.dip)}° · ${where}`;
  }

  /**
   * The cheap path, used while a marker is being dragged: same DOM, new
   * numbers. Falls back to a full rebuild if the set of markers changed under
   * us, which a drag never does but an undo might.
   */
  root.refreshReadings = () => {
    const readings = ctx.readings();
    if (readings.length !== rows.size) { build(); return; }
    for (const r of readings) {
      const ref = rows.get(r.id);
      if (!ref) { build(); return; }
      ref.value.textContent = formatReading(r);
      ref.sub.textContent = subText(r);
      clear(ref.mark);
      ref.mark.appendChild(strikeDipMark(r.strike, r.dip));
      ref.row.classList.toggle('selected', ctx.selectedMarkerId() === r.id);
    }
    // Dragging a marker across a hinge swings the fitted axis, and watching
    // that happen is half the lesson.
    fillSummary();
    fitNode?.refreshFit?.();
  };

  build();
  root.refresh = build;
  return root;
}

// ---------------------------------------------------------------------------
// View, presets and files
// ---------------------------------------------------------------------------

export function viewPanel(ctx) {
  const root = el('div', { class: 'panel' });

  const build = () => {
    clear(root);
    const doc = ctx.store.doc;

    root.appendChild(sectionHead('Examples', 'Load a worked structure, then take it apart.'));
    const grid = el('div', { class: 'preset-grid' });
    for (const p of PRESETS) {
      grid.appendChild(el('button', {
        class: 'preset-btn', type: 'button', title: p.blurb,
        onclick: () => ctx.applyPreset(p),
      }, [
        el('span', { class: 'preset-name', text: p.label }),
        el('span', { class: 'preset-blurb', text: p.blurb }),
      ]));
    }
    root.appendChild(grid);

    root.appendChild(el('div', { class: 'sub-head', text: 'Viewpoint' }));

    // Map view is a mode, not a camera angle, so it gets its own latching
    // button above the six that merely point the camera somewhere.
    const onMap = ctx.mapView();
    root.appendChild(el('button', {
      class: `btn wide ${onMap ? 'armed' : ''}`, type: 'button',
      text: onMap ? 'Map view — tap to return to 3D' : 'Read it as a map (2D)',
      onclick: () => ctx.setMapView(!onMap),
    }));
    root.appendChild(el('div', {
      class: 'ctl-hint',
      text: onMap
        ? 'Straight down, north up, no perspective. Strike and dip symbols lie flat, exactly as they are printed on a geologic map.'
        : 'Flattens the block into a plan view and lays the strike and dip symbols flat — the map a geologist would be handed.',
    }));

    root.appendChild(el('div', { class: 'view-grid' }, [
      viewBtn(ctx, 'Oblique', 35, 28),
      viewBtn(ctx, 'Overhead 3D', 0, 89),
      viewBtn(ctx, 'Look north', 0, 6),
      viewBtn(ctx, 'Look east', 90, 6),
      viewBtn(ctx, 'Look south', 180, 6),
      viewBtn(ctx, 'Look west', 270, 6),
    ]));
    root.appendChild(el('button', {
      class: 'btn wide', text: onMap ? 'Recenter map' : 'Recenter block', onclick: () => ctx.frame(),
    }));

    root.appendChild(el('div', { class: 'sub-head', text: 'Display' }));
    root.appendChild(toggleRow({
      label: 'Lithology patterns', value: doc.settings.showPatterns,
      onChange: (v) => ctx.store.edit((d) => { d.settings.showPatterns = v; }, { structural: false }),
    }));
    root.appendChild(toggleRow({
      label: 'Contact lines', value: doc.settings.showContacts,
      hint: 'Dark line where two units meet.',
      onChange: (v) => ctx.store.edit((d) => { d.settings.showContacts = v; }, { structural: false }),
    }));
    root.appendChild(toggleRow({
      label: 'Fault traces', value: doc.settings.showFaults !== false,
      hint: 'Red where a fault cuts the block, on the faces and across the ground.',
      onChange: (v) => ctx.store.edit((d) => { d.settings.showFaults = v; },
        { structural: false }),
    }));
    root.appendChild(toggleRow({
      label: 'Event guides', value: doc.settings.showEventGuides !== false,
      hint: 'The plane or axes of whichever event is open in History. Turn off for a clean map.',
      onChange: (v) => ctx.store.edit((d) => { d.settings.showEventGuides = v; },
        { structural: false }),
    }));
    root.appendChild(toggleRow({
      label: 'Compass', value: doc.settings.showCompass,
      onChange: (v) => ctx.store.edit((d) => { d.settings.showCompass = v; }, { structural: true }),
    }));
    root.appendChild(selectRow({
      label: 'Rendering quality',
      value: doc.settings.quality,
      options: [
        { value: 'auto', label: 'Automatic' },
        { value: 'high', label: 'High — smooth contacts' },
        { value: 'low', label: 'Low — save battery' },
      ],
      onChange: (v) => ctx.store.edit((d) => { d.settings.quality = v; }, { structural: false }),
    }));

    root.appendChild(el('div', { class: 'sub-head', text: 'This block' }));
    const nameInput = el('input', { class: 'name-input', type: 'text', value: doc.name });
    nameInput.addEventListener('change', () => ctx.store.edit(
      (d) => { d.name = nameInput.value || 'Untitled block'; }, { structural: true },
    ));
    root.appendChild(el('div', { class: 'ctl' }, [
      el('label', { class: 'ctl-label', text: 'Name' }), nameInput,
    ]));

    root.appendChild(el('div', { class: 'row-actions wrap' }, [
      el('button', { class: 'btn', text: 'Save to file', onclick: () => ctx.exportFile() }),
      el('button', { class: 'btn', text: 'Open file', onclick: () => ctx.importFile() }),
      el('button', { class: 'btn', text: 'Save image', onclick: () => ctx.exportImage() }),
      el('button', {
        class: 'btn danger', text: 'Start over',
        onclick: () => { if (confirm('Discard this block and start fresh?')) ctx.store.replace(defaultDocument()); },
      }),
    ]));

    // Attribution and license. The source link is not decorative: the AGPL
    // requires that people who use the app over a network be able to get at
    // the source, and anyone who forks and rehosts inherits that obligation.
    root.appendChild(el('div', { class: 'about' }, [
      el('p', { text: 'Works with no signal. Add it to your home screen and it will open like any other app.' }),
      el('div', { class: 'about-rule' }),
      el('p', { class: 'about-title', text: 'Block — 3D geologic block diagrams' }),
      el('p', {}, [
        'Created by ',
        el('strong', { text: 'Stephen Dobbs' }),
        '. © 2026.',
      ]),
      el('p', {}, [
        'Licensed ',
        el('a', {
          href: 'https://www.gnu.org/licenses/agpl-3.0.html',
          target: '_blank', rel: 'noopener noreferrer', text: 'AGPL-3.0',
        }),
        '. Free to use, study and share; if you modify it and host it, you must publish your source and keep this attribution.',
      ]),
      el('p', {}, [
        el('a', {
          class: 'about-link',
          href: 'https://github.com/scdobbs/3D-block-diagrams',
          target: '_blank', rel: 'noopener noreferrer', text: 'Source code on GitHub',
        }),
      ]),
      el('p', { class: 'about-dim' }, [
        '3D rendering by ',
        el('a', {
          href: 'https://threejs.org', target: '_blank', rel: 'noopener noreferrer', text: 'three.js',
        }),
        ' (MIT).',
      ]),
    ]));
  };

  build();
  root.refresh = build;
  return root;
}

function viewBtn(ctx, label, az, el_) {
  return el('button', {
    class: 'btn small', type: 'button', text: label,
    onclick: () => ctx.setView(az, el_),
  });
}

function fmtInterval(v) {
  return v >= 1 ? `${Math.round(v)} m` : `${v} m`;
}

function sectionHead(title, sub) {
  return el('div', { class: 'section-head' }, [
    el('h2', { text: title }),
    sub ? el('p', { text: sub }) : null,
  ]);
}

// ---------------------------------------------------------------------------
// EPS 105 — the course tab
// ---------------------------------------------------------------------------
// Everything a student has to do that is not geology. Two jobs live here, and
// they are here rather than in the Map section for the same reason: both have
// to be reachable on day one, when the Map section is still locked.
//
//   Getting the phone ready. The field-ready check and the course pack were
//   built for the Areas tab and are rendered from it — a student who cannot
//   open Areas yet is exactly the student who most needs to install the map
//   and put the app on their home screen.
//
//   The stage passwords. See js/unlock.js for what this is and is not.
//
// This whole tab is course furniture. When the app stops being a class it goes
// out with js/unlock.js, and nothing else has to change.

/**
 * One stage: a password to type, or the password you already typed.
 *
 * The password is shown back after it has been entered, which is not an
 * oversight. It was read aloud to a group standing outdoors; somebody's phone
 * was in a pocket, somebody arrived late, and the alternative to showing it is
 * a student walking back across a hillside to ask. There is nothing protected
 * here that hiding it would protect — see the note in js/unlock.js.
 */
function stageCard(stage, onChange) {
  const open = unlocked(stage.id);
  const card = el('div', { class: `card stage-card ${open ? 'open' : ''}` });

  card.appendChild(el('div', { class: 'card-main static' }, [
    el('span', { class: 'card-text' }, [
      el('span', { class: 'card-title', text: stage.label }),
      el('span', { class: 'card-sub', text: stage.blurb }),
    ]),
    el('span', { class: `pill ${open ? 'good' : 'dim'}`, text: open ? 'unlocked' : 'locked' }),
  ]));

  if (open) {
    card.appendChild(el('div', { class: 'stage-pass' }, [
      el('span', { class: 'stage-pass-label', text: 'Password' }),
      el('code', { class: 'stage-pass-value', text: passwordFor(stage.id) }),
    ]));
    card.appendChild(el('div', { class: 'ctl-hint card-note',
      text: 'Kept here so you can pass it on to someone who missed it.' }));
    return card;
  }

  const error = el('p', { class: 'stage-error', hidden: true });
  const input = el('input', {
    class: 'stage-input', type: 'text', placeholder: 'Password',
    // A phone keyboard that capitalises and autocorrects is the most likely
    // reason a correct password gets refused. Turn all of it off.
    autocapitalize: 'none', autocorrect: 'off', autocomplete: 'off',
    spellcheck: 'false', enterkeyhint: 'go',
  });

  const submit = () => {
    if (tryUnlock(stage.id, input.value)) { onChange(); return; }
    error.textContent = input.value.trim()
      ? 'That is not it. Check with your instructor.'
      : 'Type the password your instructor gave you.';
    error.hidden = false;
    input.select?.();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });
  input.addEventListener('input', () => { error.hidden = true; });

  card.appendChild(el('div', { class: 'stage-entry' }, [
    input,
    el('button', { class: 'btn primary', type: 'button', text: 'Unlock', onclick: submit }),
  ]));
  card.appendChild(error);
  return card;
}

export function coursePanel(ctx) {
  const app = ctx._app;
  const node = el('div', { class: 'panel' });

  node.appendChild(sectionHead('EPS 105',
    'Get the phone ready before you leave, and unlock each stage as your instructor releases it.'));

  // Building the field section is what gives the check something to count and
  // the pack somewhere to land. It is constructed, not activated: no GPS, no
  // compass, no battery — those start only when the map is actually opened.
  const section = app.fieldSection();
  const fctx = section.panelContext();

  node.appendChild(readyBlock(fctx));
  const packs = packsBlock(fctx);
  if (packs) node.appendChild(packs);

  node.appendChild(el('div', { class: 'sub-head', text: 'Stages' }));

  const rerender = () => {
    // The mode switch and the map's own tab bar both read the gate, so the
    // whole shell is redrawn rather than this panel alone.
    app.courseUnlockChanged();
  };
  for (const stage of STAGES) node.appendChild(stageCard(stage, rerender));

  node.appendChild(el('div', { class: 'ctl-hint standalone',
    text: 'Unlocking is remembered on this phone. You will not have to type it again.' }));

  node.refreshReadings = () => {
    const p = fctx.packProgress();
    if (p) packs?.refreshBars?.(p);
  };

  return node;
}
