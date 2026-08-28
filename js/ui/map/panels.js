// The map section's panels: Measure, Stations, Areas, Setup.
//
// Written to the same contract as the block's panels — build an element, and
// optionally hang a `refreshReadings` on it that restates the numbers without
// rebuilding under the finger. Here that matters more than it does on the
// block, because the numbers arrive on their own: a GPS fix and a compass
// reading both update several times a second, and rebuilding the panel around
// a half-typed note would throw the note away.

import { el, clear, numberRow, selectRow, toggleRow, compassDial, protractor } from '../widgets.js';
import { swatchEl } from '../swatch.js';
import { quadrantBearing } from '../../geo/math.js';
import { FEATURES, PLANAR_FEATURES, LINEAR_FEATURES, CERTAINTIES, ROCKS, rockOf,
  unitColor, knownUnitNames, makeUnit, hasAttitude, isLinearFeature,
  formatAttitude, LINE_KINDS, LINE_CERTAINTY, lineKind, lineCertainty,
  lineLength } from '../../field/model.js';
import { formatDeclination } from '../../field/declination.js';
import { fixAge } from '../../field/sensors.js';
import { SOURCES, BASE_SOURCES, estimateArea, storageReport } from '../../field/tiles.js';
import { formatDistance, formatBytes, formatLonLat, formatDDM, distance,
  bboxSize } from '../../field/geo.js';

// ---------------------------------------------------------------------------
// Small local controls
// ---------------------------------------------------------------------------

function textRow({ label, value, placeholder, onChange, hint, list }) {
  const input = el('input', {
    class: 'name-input', type: 'text', value: value || '',
    placeholder: placeholder || '', list: list || false,
    autocapitalize: 'words', autocomplete: 'off', spellcheck: 'false',
  });
  // `change` not `input`: committing on every keystroke would push an undo
  // step per letter and save to the database forty times a word.
  input.addEventListener('change', () => onChange(input.value));
  const row = el('div', { class: 'ctl' }, [
    el('div', { class: 'ctl-head' }, [el('label', { class: 'ctl-label', text: label })]),
    input,
    hint ? el('div', { class: 'ctl-hint', text: hint }) : null,
  ]);
  row.input = input;
  return row;
}

function noteRow({ label, value, placeholder, onChange }) {
  const area = el('textarea', {
    class: 'name-input note-input', rows: 3, placeholder: placeholder || '',
  });
  area.value = value || '';
  area.addEventListener('change', () => onChange(area.value));
  const row = el('div', { class: 'ctl' }, [
    el('div', { class: 'ctl-head' }, [el('label', { class: 'ctl-label', text: label })]),
    area,
  ]);
  row.input = area;
  return row;
}

/** A row of tap targets, for a short list where a dropdown would be a step. */
function chipsRow({ label, value, options, onChange, hint }) {
  const wrap = el('div', { class: 'chips' });
  const paint = () => {
    clear(wrap);
    for (const o of options) {
      wrap.appendChild(el('button', {
        class: `chip ${o.id === value ? 'on' : ''}`, type: 'button',
        title: o.hint || o.label,
        onclick: () => { value = o.id; paint(); onChange(o.id); },
      }, [el('span', { text: o.label })]));
    }
  };
  paint();
  const row = el('div', { class: 'ctl' }, [
    label ? el('div', { class: 'ctl-head' }, [el('label', { class: 'ctl-label', text: label })]) : null,
    wrap,
    hint ? el('div', { class: 'ctl-hint', text: hint }) : null,
  ]);
  row.setValue = (v) => { value = v; paint(); };
  return row;
}

function statLine(label, value, cls = '') {
  const v = el('span', { class: `stat-value ${cls}`, text: value });
  const row = el('div', { class: 'stat' }, [
    el('span', { class: 'stat-label', text: label }), v,
  ]);
  row.set = (text, klass) => {
    v.textContent = text;
    v.className = `stat-value ${klass || ''}`;
  };
  return row;
}

/** A download in flight. Returned with handles so it can be updated in place. */
function progressBlock() {
  const fill = el('span');
  const bar = el('div', { class: 'progress-bar' }, [fill]);
  const text = el('div', { class: 'progress-text' });
  const node = el('div', { class: 'progress' }, [bar, text]);
  node.set = (p) => {
    fill.style.width = p.total ? `${Math.round((p.done / p.total) * 100)}%` : '0%';
    text.textContent = [
      `${p.done} of ${p.total} tiles`,
      formatBytes(p.bytes || 0),
      p.absent ? `${p.absent} not published` : null,
      p.failed ? `${p.failed} failed` : null,
    ].filter(Boolean).join('  ·  ');
  };
  return node;
}

/**
 * Getting the work out.
 *
 * Four buttons rather than one because they go to different places: Google
 * Earth wants KML, QGIS is happiest with GeoJSON, a marks spreadsheet wants
 * CSV, and only the backup can be read back in here.
 */
function exportBlock(ctx, { lines = false } = {}) {
  return el('div', {}, [
    el('div', { class: 'sub-head', text: 'Take it with you' }),
    el('div', { class: 'row-actions wrap' }, [
      el('button', { class: 'btn', type: 'button', text: 'Google Earth',
        title: 'KML — stations and lines, opens by double-clicking',
        onclick: () => ctx.exportKML() }),
      el('button', { class: 'btn', type: 'button', text: 'GeoJSON',
        title: 'Stations and lines, for QGIS or ArcGIS',
        onclick: () => ctx.exportGeoJSON() }),
      el('button', { class: 'btn', type: 'button',
        text: lines ? 'Lines CSV' : 'Stations CSV',
        onclick: () => (lines ? ctx.exportLinesCSV() : ctx.exportCSV()) }),
      el('button', { class: 'btn', type: 'button', text: 'Backup',
        onclick: () => ctx.exportBackup() }),
    ]),
    el('div', { class: 'ctl-hint standalone', text: lines
      ? 'KML and GeoJSON both carry the stations as well. The lines CSV holds each line as WKT, which is what QGIS reads when you add it as a delimited text layer.'
      : 'KML opens in Google Earth by double-clicking it. GeoJSON opens in QGIS or ArcGIS and carries strike, dip and dip direction as fields. Backup is the whole notebook, and it is what restores it.' }),
  ]);
}

function head(title, sub) {
  return el('div', { class: 'section-head' }, [
    el('h2', { text: title }),
    sub ? el('p', { text: sub }) : null,
  ]);
}

const pad3 = (v) => String(Math.round(v)).padStart(3, '0');

// ---------------------------------------------------------------------------
// Measure
// ---------------------------------------------------------------------------

export function measurePanel(ctx) {
  const doc = ctx.doc();
  const draft = ctx.draft;
  const node = el('div', { class: 'panel' });

  node.appendChild(head('Take a reading',
    'Stand on the outcrop, lay the phone flat on the surface, and hold it still.'));

  // --- where -------------------------------------------------------------
  node.appendChild(el('div', { class: 'sub-head', text: 'Position' }));

  const gpsStatus = statLine('Fix', '—');
  const gpsAcc = statLine('Accuracy', '—');
  const gpsAge = statLine('Age', '—');
  const gpsElev = statLine('Ground elevation', '—');
  const gpsCoord = el('div', { class: 'coord-line', text: '—' });
  node.append(el('div', { class: 'stats' }, [gpsStatus, gpsAcc, gpsAge, gpsElev]), gpsCoord);

  const gpsNote = el('div', { class: 'ctl-hint standalone' });
  node.appendChild(gpsNote);

  // --- what --------------------------------------------------------------
  node.appendChild(el('div', { class: 'sub-head', text: 'Attitude' }));

  const linear = isLinearFeature(draft.feature);

  // Plane or line first, because it decides what every control below means.
  node.appendChild(chipsRow({
    label: 'Measuring',
    value: linear ? 'linear' : 'planar',
    options: [
      { id: 'planar', label: 'A plane', hint: 'Bedding, foliation, a joint, a fault surface, a contact.' },
      { id: 'linear', label: 'A line', hint: 'A lineation, a fold hinge, slickenlines.' },
    ],
    onChange: (v) => ctx.setGeometry(v),
  }));

  node.appendChild(chipsRow({
    label: 'Feature',
    value: draft.feature,
    options: (linear ? LINEAR_FEATURES : PLANAR_FEATURES)
      .map((f) => ({ id: f.id, label: f.label, hint: f.hint })),
    onChange: (v) => ctx.setFeature(v),
  }));

  const sourceChips = chipsRow({
    label: 'Read it with',
    value: draft.source,
    options: [
      { id: 'compass', label: 'Phone compass', hint: 'Lay the phone on the surface.' },
      { id: 'manual', label: 'Type it', hint: 'From a Brunton, or by eye.' },
    ],
    onChange: (v) => { draft.source = v; ctx.rebuild(); },
  });
  node.appendChild(sourceChips);

  const liveWrap = el('div', { class: 'live' });
  node.appendChild(liveWrap);

  let heldLine = null;
  if (draft.source === 'compass') {
    heldLine = buildCompassLauncher(ctx, draft, liveWrap, linear);
  } else {
    // Typed by hand. The two controls are the same ones the History tab uses;
    // only what they are called changes with the geometry.
    const azKey = linear ? 'trend' : 'strike';
    const incKey = linear ? 'plunge' : 'dip';
    if (draft[azKey] == null) draft[azKey] = 0;
    if (draft[incKey] == null) draft[incKey] = 0;
    const dial = compassDial({
      value: draft[azKey], dip: draft[incKey], label: linear ? 'Trend' : 'Strike',
      onChange: (v) => { draft[azKey] = v; ctx.touchDraft(); },
    });
    const prot = protractor({
      value: draft[incKey], label: linear ? 'Plunge' : 'Dip', max: 90,
      onChange: (v) => { draft[incKey] = v; dial.setDip(v); ctx.touchDraft(); },
    });
    liveWrap.append(dial, prot);
    liveWrap.appendChild(el('div', { class: 'ctl-hint standalone',
      text: linear
        ? 'Trend is the compass direction the line runs toward, down-plunge.'
        : 'Strike follows the right-hand rule: with the strike direction ahead of you, the beds dip to your right.' }));
  }

  const noAttitude = toggleRow({
    label: 'No attitude here',
    value: draft.noAttitude,
    hint: 'Record the rock and the place without a measurement — scree, float, a covered contact.',
    onChange: (v) => { draft.noAttitude = v; ctx.rebuild(); },
  });
  node.appendChild(noAttitude);

  // --- which rock ---------------------------------------------------------
  node.appendChild(el('div', { class: 'sub-head', text: 'What it is' }));

  const known = knownUnitNames(doc);
  const listId = 'field-unit-names';
  const datalist = el('datalist', { id: listId },
    known.map((k) => el('option', { value: k.name })));
  node.appendChild(datalist);

  if (known.length) {
    node.appendChild(chipsRow({
      label: 'Unit',
      value: draft.unitName,
      options: known.slice(0, 8).map((k) => ({ id: k.name, label: k.name })),
      onChange: (v) => {
        draft.unitName = v;
        const u = doc.units.find((x) => x.name === v);
        draft.unitId = u ? u.id : null;
        if (u) draft.rockId = u.rockId;
        ctx.rebuild();
      },
    }));
  }

  node.appendChild(textRow({
    label: known.length ? 'Or type a unit name' : 'Unit',
    value: draft.unitName,
    placeholder: 'e.g. Wingate Sandstone',
    list: listId,
    hint: known.length ? null : 'Type it once and it becomes a tap next time.',
    onChange: (v) => {
      draft.unitName = v.trim();
      const u = doc.units.find((x) => x.name.toLowerCase() === draft.unitName.toLowerCase());
      draft.unitId = u ? u.id : null;
      if (u) draft.rockId = u.rockId;
      ctx.rebuild();
    },
  }));

  node.appendChild(selectRow({
    label: 'Rock type',
    value: draft.rockId || 'sandstone',
    options: ROCKS.map((r) => ({ value: r.id, label: `${r.group} — ${r.label}` })),
    onChange: (v) => { draft.rockId = v; ctx.touchDraft(); },
  }));

  node.appendChild(chipsRow({
    label: 'Confidence',
    value: draft.certainty,
    options: CERTAINTIES.map((c) => ({ id: c.id, label: c.label, hint: c.hint })),
    onChange: (v) => { draft.certainty = v; ctx.touchDraft(); },
  }));

  node.appendChild(noteRow({
    label: 'Note',
    value: draft.note,
    placeholder: 'Grain size, color, fossils, weathering, what it sits on…',
    onChange: (v) => { draft.note = v; ctx.touchDraft(); },
  }));

  // --- record -------------------------------------------------------------
  const recordBtn = el('button', {
    class: 'btn primary wide', type: 'button', text: 'Record station',
    onclick: () => ctx.recordStation(),
  });
  const recordWhy = el('div', { class: 'ctl-hint standalone' });
  node.append(recordBtn, recordWhy);

  // -------------------------------------------------------------------------

  node.refreshReadings = () => {
    const g = ctx.geoState();
    const fix = g.fix;
    const age = fixAge(fix);

    if (g.status === 'idle') gpsStatus.set('off', 'dim');
    else if (g.status === 'denied') gpsStatus.set('permission denied', 'bad');
    else if (g.status === 'unsupported') gpsStatus.set('not available', 'bad');
    else if (!fix) gpsStatus.set('searching…', 'warn');
    else if (age > 30) gpsStatus.set('stale', 'warn');
    else gpsStatus.set('live', 'good');

    if (fix) {
      const good = fix.accuracy <= doc.settings.minAccuracy;
      gpsAcc.set(`± ${Math.round(fix.accuracy)} m`, good ? 'good' : 'warn');
      gpsAge.set(age < 3 ? 'now' : `${Math.round(age)} s ago`, age > 30 ? 'warn' : '');
      gpsCoord.textContent = `${formatLonLat(fix.lon, fix.lat)}\n${formatDDM(fix.lon, fix.lat)}`;
    } else {
      gpsAcc.set('—'); gpsAge.set('—');
      gpsCoord.textContent = '—';
    }

    const elev = ctx.groundElevation();
    gpsElev.set(elev == null ? 'no terrain cached' : `${Math.round(elev)} m`,
      elev == null ? 'dim' : '');

    // Why the fix is bad matters more than that it is. A cold start with no
    // signal is a wait; a denied permission is a settings trip.
    if (g.status === 'denied') {
      gpsNote.textContent = 'Location is blocked for this site. Turn it on in your browser settings, then reopen the app.';
    } else if (!fix && g.status === 'acquiring') {
      gpsNote.textContent = 'With no signal the first fix comes only from the satellites, which can take a minute in the open. It is much slower under trees or against a cliff.';
    } else if (fix && !fix.good) {
      gpsNote.textContent = 'The fix is still settling. Standing still in the open for a few seconds usually tightens it.';
    } else {
      gpsNote.textContent = '';
    }

    heldLine?.refresh();

    // The record button states its own objection rather than being mutely
    // disabled — the commonest reason to be stuck here is one the student can
    // actually do something about.
    const why = ctx.blockingReason();
    recordBtn.disabled = !!why;
    recordWhy.textContent = why || '';
  };

  node.refreshReadings();
  return node;
}

/**
 * The way into the full-screen clinometer, and its permission gate.
 *
 * The reading itself is not taken here. A panel sharing the screen with a map
 * is the wrong place to hold a phone flat on a rock and watch a number settle,
 * so this is a door rather than an instrument — and it shows what came back
 * through it.
 */
function buildCompassLauncher(ctx, draft, wrap, linear) {
  const c = ctx.clinoState();

  if (c.error === 'denied') {
    wrap.appendChild(el('div', { class: 'notice' }, [
      el('p', { text: 'Motion and orientation access was declined, so the phone cannot read the rock.' }),
      el('p', { class: 'dim', text: 'Switch to "Type it", or reload the app and allow it when asked.' }),
    ]));
    return null;
  }
  if (c.error === 'unsupported') {
    wrap.appendChild(el('div', { class: 'notice' }, [
      el('p', { text: 'This browser does not report device orientation.' }),
      el('p', { class: 'dim', text: 'Use "Type it" instead — the reading is just as good, it is your compass doing the work.' }),
    ]));
    return null;
  }

  const held = el('div', { class: 'held-reading' });
  wrap.appendChild(held);

  wrap.appendChild(el('button', {
    class: 'btn primary wide', type: 'button',
    text: draft.held ? 'Open the compass again' : 'Open the compass',
    onclick: () => ctx.openMeasure(),
  }));
  wrap.appendChild(el('div', { class: 'ctl-hint standalone',
    text: 'Opens full screen. Lay the phone flat on the surface and hold it still.' }));

  const refresh = () => {
    clear(held);
    if (!draft.held) { held.classList.add('empty'); return; }
    held.classList.remove('empty');
    const az = linear ? draft.trend : draft.strike;
    const inc = linear ? draft.plunge : draft.dip;
    held.append(
      el('strong', { text: az == null ? `${Math.round(inc)}°` : `${pad3(az)}/${Math.round(inc)}` }),
      el('span', { text: ` ${linear ? 'trend / plunge' : 'strike / dip'}` }),
      el('span', { class: 'held-scatter',
        text: draft.scatter != null ? ` · ${draft.scatter.toFixed(1)}° scatter` : '' }),
    );
  };
  refresh();
  return { refresh };
}

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------

export function stationsPanel(ctx) {
  const doc = ctx.doc();
  const node = el('div', { class: 'panel' });
  const list = doc.stations;

  node.appendChild(head(`Stations · ${list.length}`,
    list.length ? 'Tap one to see it on the map and edit it.' : null));

  if (!list.length) {
    node.appendChild(el('div', { class: 'empty' }, [
      el('p', { text: 'No readings yet.' }),
      el('p', { class: 'dim', text: 'Take one on the Measure tab, or tap the map to place a station by hand.' }),
    ]));
    return node;
  }

  const fix = ctx.geoState().fix;
  // Newest first: the one you want is almost always the one you just took.
  const sorted = [...list].sort((a, b) => String(b.at).localeCompare(String(a.at)));

  for (const st of sorted) {
    const unit = st.unitId ? doc.units.find((u) => u.id === st.unitId) : null;
    const rock = rockOf(st.rockId);
    const selected = st.id === ctx.selectedStationId();

    const away = fix ? distance(fix.lon, fix.lat, st.lon, st.lat) : null;

    const card = el('div', { class: `card station-card ${selected ? 'selected' : ''}` });
    card.appendChild(el('button', {
      class: 'card-main', type: 'button',
      onclick: () => ctx.selectStation(selected ? null : st.id),
    }, [
      el('span', { class: 'card-swatch' }, [swatchEl(unit ? unitColor(unit) : rock.color, rock.pattern, 'swatch small')]),
      el('span', { class: 'card-text' }, [
        el('span', { class: 'card-title', text: `${st.name || '—'}  ${formatAttitude(st)}` }),
        el('span', { class: 'card-sub', text: [
          st.unitName || rock.label,
          st.feature !== 'bedding' ? FEATURES.find((f) => f.id === st.feature)?.label : null,
          away != null ? `${formatDistance(away)} away` : null,
        ].filter(Boolean).join(' · ') }),
      ]),
    ]));

    if (selected) card.appendChild(stationEditor(ctx, st));
    node.appendChild(card);
  }

  node.appendChild(exportBlock(ctx));
  return node;
}

function stationEditor(ctx, st) {
  const doc = ctx.doc();
  const box = el('div', { class: 'card-body' });

  const edit = (fn, coalesce) => ctx.editStation(st.id, fn, coalesce);

  box.appendChild(textRow({
    label: 'Station', value: st.name, placeholder: 'number or name',
    onChange: (v) => edit((s) => { s.name = v.trim(); }),
  }));

  const linear = isLinearFeature(st.feature);
  const has = hasAttitude(st);

  if (has) {
    const azKey = linear ? 'trend' : 'strike';
    const incKey = linear ? 'plunge' : 'dip';
    const dial = compassDial({
      value: st[azKey], dip: st[incKey], label: linear ? 'Trend' : 'Strike',
      onChange: (v) => edit((s) => { s[azKey] = v; }, `st-az:${st.id}`),
    });
    const prot = protractor({
      value: st[incKey], label: linear ? 'Plunge' : 'Dip', max: 90,
      onChange: (v) => { dial.setDip(v); edit((s) => { s[incKey] = v; }, `st-inc:${st.id}`); },
    });
    box.append(dial, prot);
  } else {
    // A station taken without a reading is not finished, and it should not be
    // a dead end. Plenty of them are deliberate at the time — a covered
    // contact, float, somewhere you could not reach the surface — and plenty
    // become measurable later, on the way back down or from the far side.
    box.appendChild(el('div', { class: 'ctl-hint standalone',
      text: 'No attitude recorded here yet.' }));
    box.appendChild(el('div', { class: 'row-actions' }, [
      el('button', {
        class: 'btn small', type: 'button', text: 'Type one in',
        onclick: () => ctx.addAttitude(st.id),
      }),
      el('button', {
        class: 'btn small primary', type: 'button', text: 'Read it now',
        title: 'Take a reading with the phone and put it on this station',
        onclick: () => ctx.openMeasure({ target: st.id }),
      }),
    ]));
  }

  // While there is no reading, the station is free to become either kind.
  // Once there is one, only features of the same kind are offered: correcting
  // bedding to a joint is an everyday mis-tap, but turning a plane into a line
  // is a different measurement, and quietly blanking the numbers to allow it
  // would lose the reading.
  if (!has) {
    box.appendChild(chipsRow({
      label: 'Measuring',
      value: linear ? 'linear' : 'planar',
      options: [
        { id: 'planar', label: 'A plane' },
        { id: 'linear', label: 'A line' },
      ],
      onChange: (v) => ctx.setStationFeature(st.id,
        v === 'linear' ? 'lineation' : 'bedding'),
    }));
  }

  box.appendChild(chipsRow({
    label: 'Feature', value: st.feature,
    options: (has ? (linear ? LINEAR_FEATURES : PLANAR_FEATURES) : FEATURES)
      .map((f) => ({ id: f.id, label: f.label, hint: f.hint })),
    onChange: (v) => (has ? edit((s) => { s.feature = v; }) : ctx.setStationFeature(st.id, v)),
  }));

  const known = knownUnitNames(doc);
  box.appendChild(textRow({
    label: 'Unit', value: st.unitName, placeholder: 'e.g. Kayenta Formation',
    list: known.length ? 'field-unit-names' : null,
    onChange: (v) => edit((s) => {
      s.unitName = v.trim();
      const u = doc.units.find((x) => x.name.toLowerCase() === s.unitName.toLowerCase());
      s.unitId = u ? u.id : null;
    }),
  }));

  box.appendChild(selectRow({
    label: 'Rock type', value: st.rockId || 'sandstone',
    options: ROCKS.map((r) => ({ value: r.id, label: `${r.group} — ${r.label}` })),
    onChange: (v) => edit((s) => { s.rockId = v; }),
  }));

  box.appendChild(noteRow({
    label: 'Note', value: st.note, placeholder: 'What you saw.',
    onChange: (v) => edit((s) => { s.note = v; }),
  }));

  // Provenance, stated plainly. This is what lets a student go back to an
  // outlier weeks later and work out whether to trust it.
  const prov = [];
  prov.push(st.source === 'compass' ? 'Read with the phone' : 'Entered by hand');
  if (st.scatter != null) prov.push(`${st.scatter.toFixed(1)}° scatter`);
  if (st.gpsAccuracy != null) prov.push(`GPS ± ${Math.round(st.gpsAccuracy)} m`);
  if (st.declination) prov.push(`declination ${formatDeclination(st.declination)}`);
  if (st.elev != null) prov.push(`${Math.round(st.elev)} m`);
  prov.push(new Date(st.at).toLocaleString());

  box.appendChild(el('div', { class: 'provenance', text: prov.join(' · ') }));
  box.appendChild(el('div', { class: 'coord-line', text: formatLonLat(st.lon, st.lat) }));

  box.appendChild(el('div', { class: 'row-actions' }, [
    el('button', { class: 'btn small', type: 'button', text: 'Center map', onclick: () => ctx.goToStation(st.id) }),
    el('button', { class: 'btn small', type: 'button', text: 'Move here', onclick: () => ctx.moveStationToFix(st.id),
      title: 'Put this station at your current position' }),
    hasAttitude(st) ? el('button', {
      class: 'btn small', type: 'button', text: 'Clear reading',
      title: 'Keep the station, drop the attitude',
      onclick: () => ctx.clearAttitude(st.id),
    }) : null,
    el('button', { class: 'btn small danger', type: 'button', text: 'Delete', onclick: () => ctx.deleteStation(st.id) }),
  ]));

  return box;
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

/**
 * Shading the units between the contacts.
 *
 * A patch is a name and a point inside the area, and the area is flooded out
 * to the surrounding contacts every time it is drawn — so nothing here edits a
 * polygon, and nothing can drift out of step with the lines.
 */
function unitsBlock(ctx, doc) {
  const wrap = el('div', {});
  wrap.appendChild(el('div', { class: 'sub-head', text: 'Units' }));

  const arming = ctx.shadeMode();
  wrap.appendChild(el('button', {
    class: `btn wide ${arming ? 'armed' : ''}`, type: 'button',
    text: arming ? 'Tap inside a unit — tap here to stop' : 'Shade a unit',
    onclick: () => ctx.toggleShadeMode(),
  }));
  wrap.appendChild(el('div', { class: 'ctl-hint standalone', text:
    'Tap anywhere inside an area your contacts enclose and it fills out to them. The colour is worked out from the lines every time, so moving a contact moves the shading with it — there is no outline to keep in step.' }));

  const patches = ctx.patches();
  if (!patches.length) return wrap;

  const wide = ctx.widePatches();
  const counts = ctx.patchCounts();
  const cell = ctx.patchCell();
  const known = knownUnitNames(doc);

  for (const p of patches) {
    const unit = (doc.units || []).find(
      (u) => String(u.name || '').trim().toLowerCase() === String(p.unitName || '').trim().toLowerCase(),
    );
    const broad = wide.has(p.id);
    const card = el('div', { class: `line-card ${broad ? 'warn' : ''}` });
    card.appendChild(el('div', { class: 'line-row' }, [
      el('span', {
        class: 'unit-dot',
        style: `background:${unit ? unitColor(unit) : ctx.patchColor(p.unitName)}${broad ? ';opacity:.35' : ''}`,
      }),
      el('span', { class: 'line-name', text: p.unitName || 'unnamed unit' }),
      el('span', { class: 'line-sub', text: broad
        ? 'not shaded — no boundary'
        : areaText(counts.get(p.id) || 0, cell, p.lat) }),
      el('button', {
        class: 'row-x', type: 'button', text: '×', 'aria-label': 'Remove this shading',
        onclick: () => ctx.deletePatch(p.id),
      }),
    ]));
    card.appendChild(textRow({
      label: 'Unit', value: p.unitName, placeholder: 'e.g. Poleta Fm',
      list: known.length ? 'field-unit-names' : null,
      onChange: (v) => ctx.editPatch(p.id, (x) => { x.unitName = v.trim(); }),
    }));
    if (broad) {
      card.appendChild(el('div', { class: 'ctl-hint standalone', text:
        'This one filled most of the sheet, so it is not shaded — a wash over the whole map would hide the very contacts you need to see to fix it. There is no boundary around this point yet. Draw the contact that bounds it, or move the tap inside an area your contacts already enclose.' }));
    }
    wrap.appendChild(card);
  }

  if (known.length) {
    wrap.appendChild(el('datalist', { id: 'field-unit-names' },
      known.map((k) => el('option', { value: k.name }))));
  }
  return wrap;
}

/** Cells to ground area. Mercator stretches with latitude, so undo that. */
function areaText(cells, cellWorld, lat) {
  if (!cells || !cellWorld) return '';
  const m = cellWorld * 2 * Math.PI * 6378137 * Math.cos((lat || 0) * Math.PI / 180);
  const a = cells * m * m;
  return a > 1e6 ? `${(a / 1e6).toFixed(2)} km²` : `${Math.round(a / 100) * 100} m²`;
}

export function linesPanel(ctx) {
  const doc = ctx.doc();
  const node = el('div', { class: 'panel' });
  const drawing = ctx.drawingLine();

  if (drawing) {
    node.appendChild(head('Drawing a line',
      'Tap the map for each point, or press Here to drop one where you are standing.'));
    node.appendChild(chipsRow({
      label: 'What it is',
      value: drawing.kind,
      options: LINE_KINDS.map((k) => ({ id: k.id, label: k.label, hint: k.hint })),
      onChange: (v) => { drawing.kind = v; ctx.rebuild(); },
    }));
    node.appendChild(chipsRow({
      label: 'How well you know it',
      value: drawing.certainty,
      options: LINE_CERTAINTY.map((c) => ({ id: c.id, label: c.label, hint: c.hint })),
      onChange: (v) => { drawing.certainty = v; ctx.rebuild(); },
    }));
    node.appendChild(el('div', { class: 'ctl-hint standalone',
      text: 'A line you walked is certain; one you traced across a covered slope is not. Drawing the difference is most of what makes a map honest, and both of these can be changed afterwards.' }));
    node.appendChild(el('div', { class: 'ctl-hint standalone',
      text: 'Points can be dragged while you draw. Undo takes back the last one.' }));
    return node;
  }

  node.appendChild(head(`Lines · ${doc.lines.length}`,
    'Contacts, faults and traverses drawn on the map.'));

  node.appendChild(el('div', { class: 'ctl' }, [
    el('div', { class: 'ctl-head' }, [el('label', { class: 'ctl-label', text: 'Draw a new one' })]),
    el('div', { class: 'chips' }, LINE_KINDS.map((k) => el('button', {
      class: 'chip', type: 'button', title: k.hint,
      onclick: () => ctx.startLine(k.id),
    }, [el('span', { text: k.label })]))),
  ]));

  if (!doc.lines.length) {
    node.appendChild(el('div', { class: 'empty' }, [
      el('p', { class: 'dim', text: 'Nothing drawn yet. Pick a kind above to start.' }),
    ]));
    return node;
  }

  for (const line of doc.lines) {
    const k = lineKind(line.kind);
    const selected = line.id === ctx.selectedLineId();
    const card = el('div', { class: `card line-card ${selected ? 'selected' : ''}` });

    card.appendChild(el('button', {
      class: 'card-main', type: 'button',
      onclick: () => ctx.selectLine(selected ? null : line.id),
    }, [
      el('span', { class: 'line-swatch', style: { background: k.color } }),
      el('span', { class: 'card-text' }, [
        el('span', { class: 'card-title', text: line.name || k.label }),
        el('span', { class: 'card-sub', text: [
          line.name ? k.label : null,
          lineCertainty(line.certainty).label.toLowerCase(),
          formatDistance(lineLength(line)),
          `${line.points.length} points`,
        ].filter(Boolean).join(' · ') }),
      ]),
    ]));

    if (selected) {
      const box = el('div', { class: 'card-body' });
      box.appendChild(textRow({
        label: 'Name', value: line.name, placeholder: 'e.g. Poleta–Campito contact',
        onChange: (v) => ctx.editLine(line.id, (l) => { l.name = v.trim(); }),
      }));
      box.appendChild(chipsRow({
        label: 'What it is', value: line.kind,
        options: LINE_KINDS.map((x) => ({ id: x.id, label: x.label, hint: x.hint })),
        onChange: (v) => ctx.editLine(line.id, (l) => { l.kind = v; }),
      }));
      box.appendChild(chipsRow({
        label: 'How well you know it', value: line.certainty,
        options: LINE_CERTAINTY.map((c) => ({ id: c.id, label: c.label, hint: c.hint })),
        onChange: (v) => ctx.editLine(line.id, (l) => { l.certainty = v; }),
      }));

      const known = knownUnitNames(doc);
      if (line.kind === 'contact' || line.kind === 'unconformity') {
        // Upper and lower, not one side and the other. A contact's two units
        // are its place in the column, and a pair recorded by which side of
        // the line they fell on says nothing that can be used later: it cannot
        // give a thickness, and it cannot recognise the same contact again
        // across a fault.
        box.appendChild(el('div', { class: 'ctl-pair' }, [
          textRow({
            label: 'Upper unit', value: line.unitUpper, placeholder: 'e.g. Poleta Fm',
            list: known.length ? 'field-unit-names' : null,
            onChange: (v) => ctx.editLine(line.id, (l) => { l.unitUpper = v.trim(); }),
          }),
          textRow({
            label: 'Lower unit', value: line.unitLower, placeholder: 'e.g. Campito Fm',
            list: known.length ? 'field-unit-names' : null,
            onChange: (v) => ctx.editLine(line.id, (l) => { l.unitLower = v.trim(); }),
          }),
        ]));
        box.appendChild(el('div', { class: 'ctl-hint standalone', text:
          'Which unit sits on top of the other in the column — the younger one where the beds are the right way up, whatever the ground does. Naming them this way is what lets a thickness be read between two contacts, and what recognises the same contact again on the far side of a fault.' }));
        if (known.length) {
          box.appendChild(el('datalist', { id: 'field-unit-names' },
            known.map((u) => el('option', { value: u.name }))));
        }
      }

      box.appendChild(noteRow({
        label: 'Note', value: line.note, placeholder: 'What you saw along it.',
        onChange: (v) => ctx.editLine(line.id, (l) => { l.note = v; }),
      }));

      // Dragging is the way a line gets corrected; this only says so, and
      // offers the one thing dragging cannot do.
      const active = ctx.activeVertex(line.id);
      box.appendChild(el('div', { class: 'ctl-hint standalone',
        text: active >= 0
          ? `Point ${active + 1} of ${line.points.length} is in hand. Drag it on the map to move it.`
          : 'Drag any point on the map to move it. Tap one to be able to remove it.' }));

      box.appendChild(el('div', { class: 'row-actions wrap' }, [
        el('button', { class: 'btn small', type: 'button', text: 'Go to', onclick: () => ctx.goToLine(line.id) }),
        el('button', { class: 'btn small', type: 'button', text: 'Keep drawing',
          title: 'Add more points to the end of this line',
          onclick: () => ctx.extendLine(line.id) }),
        el('button', {
          class: 'btn small', type: 'button',
          text: active >= 0 ? `Remove point ${active + 1}` : 'Remove a point',
          disabled: active < 0 || line.points.length <= 2,
          title: line.points.length <= 2
            ? 'A line needs two points' : 'Take the held point out of the line',
          onclick: () => ctx.removeVertex(line.id, active),
        }),
        el('button', { class: 'btn small danger', type: 'button', text: 'Delete',
          onclick: () => ctx.deleteLine(line.id) }),
      ]));
      card.appendChild(box);
    }
    node.appendChild(card);
  }

  node.appendChild(unitsBlock(ctx, doc));
  node.appendChild(exportBlock(ctx, { lines: true }));
  return node;
}

// ---------------------------------------------------------------------------
// Areas
// ---------------------------------------------------------------------------

export function areasPanel(ctx) {
  const doc = ctx.doc();
  const node = el('div', { class: 'panel' });

  node.appendChild(head('Offline areas',
    'Download a map before you leave. This is the only part that needs a connection.'));

  const online = navigator.onLine !== false;
  let sizeStat = null, tilesStat = null, bytesStat = null;
  let newProgress = null;
  const areaProgress = new Map();
  if (!online) {
    node.appendChild(el('div', { class: 'notice warn' }, [
      el('p', { text: 'No connection, so nothing new can be downloaded.' }),
      el('p', { class: 'dim', text: 'Everything already downloaded still works.' }),
    ]));
  }

  // --- new download --------------------------------------------------------
  const sel = ctx.selection();
  if (!sel) {
    node.appendChild(el('button', {
      class: 'btn primary wide', type: 'button', text: 'Choose an area to download',
      disabled: !online,
      onclick: () => ctx.beginSelection(),
    }));
    node.appendChild(el('div', { class: 'ctl-hint standalone',
      text: 'Pan and zoom to your field area first — the box starts on whatever is on screen, and its corners drag.' }));
  } else {
    const area = ctx.draftArea();
    const est = estimateArea(area);
    const [w, h] = bboxSize(sel);

    node.appendChild(el('div', { class: 'sub-head', text: 'New area' }));
    // Held on to rather than printed once: the corners of the box are dragged
    // while these are on screen, and an estimate that does not follow the box
    // is worse than no estimate at all.
    sizeStat = statLine('Size', `${formatDistance(w)} × ${formatDistance(h)}`);
    tilesStat = statLine('Tiles', String(est.tiles));
    bytesStat = statLine('Download', formatBytes(est.bytes));
    node.appendChild(el('div', { class: 'stats' }, [sizeStat, tilesStat, bytesStat]));

    node.appendChild(textRow({
      label: 'Name', value: area.name, placeholder: 'e.g. Comb Ridge day 2',
      onChange: (v) => ctx.setDraftArea({ name: v.trim() }),
    }));

    const layerChoice = el('div', { class: 'ctl' }, [
      el('div', { class: 'ctl-head' }, [el('label', { class: 'ctl-label', text: 'Include' })]),
      el('div', { class: 'chips' }, [...BASE_SOURCES, 'dem'].map((id) => {
        const s = SOURCES[id];
        const on = area.sources.includes(id);
        return el('button', {
          class: `chip ${on ? 'on' : ''}`, type: 'button', title: s.detail,
          onclick: () => {
            const next = on ? area.sources.filter((k) => k !== id) : [...area.sources, id];
            // Something has to be drawable, or the area is a blank screen.
            if (!next.some((k) => SOURCES[k].kind === 'base')) return;
            ctx.setDraftArea({ sources: next });
          },
        }, [el('span', { text: s.label })]);
      })),
      el('div', { class: 'ctl-hint',
        text: 'Elevation is small and it is what draws the hillshade, the contours and every station’s height. Worth taking.' }),
    ]);
    node.appendChild(layerChoice);

    const prog = ctx.downloadProgress();
    if (prog && prog.areaId === area.id) {
      newProgress = progressBlock();
      newProgress.set(prog);
      node.appendChild(newProgress);
      node.appendChild(el('button', {
        class: 'btn wide danger', type: 'button', text: 'Stop',
        onclick: () => ctx.cancelDownload(),
      }));
    } else {
      node.appendChild(el('div', { class: 'row-actions' }, [
        el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => ctx.cancelSelection() }),
        el('button', {
          class: 'btn primary', type: 'button', text: 'Download', disabled: !online,
          onclick: () => ctx.startDownload(),
        }),
      ]));
    }
  }

  // --- saved areas ---------------------------------------------------------
  node.appendChild(el('div', { class: 'sub-head', text: `Downloaded · ${doc.areas.length}` }));

  if (!doc.areas.length) {
    node.appendChild(el('div', { class: 'empty' }, [
      el('p', { class: 'dim', text: 'Nothing downloaded yet.' }),
    ]));
  }

  for (const a of doc.areas) {
    const est = estimateArea(a);
    const check = a.check;
    const [w, h] = bboxSize(a.bbox);
    const busy = ctx.verifying() === a.id;

    let state, klass;
    if (busy) { state = 'checking…'; klass = 'dim'; }
    else if (!check) { state = 'not checked'; klass = 'warn'; }
    else if (check.complete) {
      // Complete means nothing is outstanding, not that every tile exists.
      // Some of them the USGS has never published.
      state = check.absent ? `complete · ${check.absent} not published` : 'complete';
      klass = 'good';
    } else { state = `${check.missing} tiles missing`; klass = 'bad'; }

    const card = el('div', { class: 'card area-card' }, [
      el('div', { class: 'card-main static' }, [
        el('span', { class: 'card-text' }, [
          el('span', { class: 'card-title', text: a.name || 'Unnamed area' }),
          el('span', { class: 'card-sub', text: `${formatDistance(w)} × ${formatDistance(h)} · ${est.tiles} tiles · ${formatBytes(a.bytes || est.bytes)}` }),
        ]),
        el('span', { class: `pill ${klass}`, text: state }),
      ]),
      el('div', { class: 'row-actions wrap' }, [
        el('button', { class: 'btn small', type: 'button', text: 'Go to', onclick: () => ctx.goToArea(a.id) }),
        el('button', { class: 'btn small', type: 'button', text: 'Check', disabled: busy, onclick: () => ctx.verify(a.id) }),
        el('button', {
          class: 'btn small', type: 'button', text: 'Repair',
          disabled: !online || busy || (check ? check.complete : false),
          title: 'Fetch whatever is missing',
          onclick: () => ctx.repair(a.id),
        }),
        el('button', { class: 'btn small danger', type: 'button', text: 'Delete', onclick: () => ctx.deleteArea(a.id) }),
      ]),
    ]);

    const prog = ctx.downloadProgress();
    if (prog && prog.areaId === a.id) {
      const block = progressBlock();
      block.set(prog);
      block.style.padding = '0 12px 12px';
      areaProgress.set(a.id, block);
      card.appendChild(block);
    }

    if (check && check.absent) {
      card.appendChild(el('div', { class: 'ctl-hint card-note',
        text: `${check.absent} tiles are not published by the USGS for this layer here — the map fills those in from the next zoom out. Downloading again cannot produce them. Plain "Aerial" often covers ground the combined layer does not.` }));
    }

    node.appendChild(card);
  }

  // --- storage -------------------------------------------------------------
  node.appendChild(el('div', { class: 'sub-head', text: 'Storage' }));
  const storage = el('div', { class: 'stats' });
  node.appendChild(storage);
  const persistNote = el('div', { class: 'ctl-hint standalone' });
  node.appendChild(persistNote);

  // The box is dragged on the map while this panel is open, so the estimate
  // restates itself rather than the panel being rebuilt under the finger —
  // which would take the half-typed area name with it.
  node.refreshReadings = () => {
    const p = ctx.downloadProgress();
    if (p) {
      if (newProgress && p.areaId === ctx.draftArea()?.id) newProgress.set(p);
      areaProgress.get(p.areaId)?.set(p);
    }
    if (!sizeStat) return;
    const box = ctx.selection();
    if (!box) return;
    const live = estimateArea(ctx.draftArea());
    const [lw, lh] = bboxSize(box);
    sizeStat.set(`${formatDistance(lw)} × ${formatDistance(lh)}`);
    tilesStat.set(String(live.tiles));
    // Worth flagging before the download rather than after: past a few
    // hundred megabytes a phone starts refusing, and the area to shrink is
    // this one, now, while there is still a connection.
    bytesStat.set(formatBytes(live.bytes), live.bytes > 400 * 1024 * 1024 ? 'warn' : '');
  };

  storageReport().then((r) => {
    clear(storage);
    storage.append(
      statLine('Used', r.usage == null ? 'unknown' : formatBytes(r.usage)),
      statLine('Available', r.quota == null ? 'unknown' : formatBytes(r.quota)),
      statLine('Protected', r.persisted ? 'yes' : 'no', r.persisted ? 'good' : 'warn'),
    );
    persistNote.textContent = r.persisted
      ? 'The browser has been asked not to clear this app’s data.'
      : 'Add the app to your home screen and open it from there. A browser tab’s storage can be cleared after a week of not being used; a home-screen app’s is not.';
  });

  return node;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function setupPanel(ctx) {
  const doc = ctx.doc();
  const s = doc.settings;
  const node = el('div', { class: 'panel' });

  node.appendChild(head('Setup', 'Set declination before you take a single reading.'));

  // --- projects ------------------------------------------------------------
  // First, because it decides what everything below applies to. Two field
  // areas have nothing to say to each other, and a notebook that mixes them is
  // one nobody can hand in.
  const projects = ctx.projects();
  const currentId = ctx.currentProjectId();

  node.appendChild(el('div', { class: 'sub-head', text: `Project · ${projects.length}` }));

  for (const pr of projects) {
    const on = pr.id === currentId;
    node.appendChild(el('div', { class: `card project-card ${on ? 'selected' : ''}` }, [
      el('button', {
        class: 'card-main', type: 'button', disabled: on,
        onclick: () => ctx.switchProject(pr.id),
      }, [
        el('span', { class: `project-dot ${on ? 'on' : ''}` }),
        el('span', { class: 'card-text' }, [
          el('span', { class: 'card-title', text: pr.name || 'Untitled' }),
          el('span', { class: 'card-sub', text: [
            `${pr.stations} station${pr.stations === 1 ? '' : 's'}`,
            `${pr.lines} line${pr.lines === 1 ? '' : 's'}`,
            pr.areas ? `${pr.areas} area${pr.areas === 1 ? '' : 's'}` : null,
          ].filter(Boolean).join(' · ') }),
        ]),
        on ? el('span', { class: 'pill good', text: 'open' }) : null,
      ]),
    ]));
  }

  node.appendChild(textRow({
    label: 'Name of this project',
    value: doc.name,
    placeholder: 'e.g. Poleta folds, day 2',
    onChange: (v) => ctx.renameProject(v.trim() || 'Field notes'),
  }));

  node.appendChild(el('div', { class: 'row-actions wrap' }, [
    el('button', {
      class: 'btn', type: 'button', text: 'New project',
      onclick: () => {
        const name = prompt('Name the new project', '');
        if (name != null) ctx.newProject(name.trim() || 'New project');
      },
    }),
    projects.length > 1 ? el('button', {
      class: 'btn danger', type: 'button', text: 'Delete this project',
      onclick: () => ctx.deleteProject(currentId),
    }) : null,
  ]));

  node.appendChild(el('div', { class: 'ctl-hint standalone',
    text: projects.length > 1
      ? 'Each project keeps its own stations, lines, units, downloaded areas and declination. Nothing crosses between them.'
      : 'A project keeps its own stations, lines, units, downloaded areas and declination. Start a second one for a different field area and the two never mix.' }));

  // --- declination ---------------------------------------------------------
  node.appendChild(el('div', { class: 'sub-head', text: 'Magnetic declination' }));

  const declRow = numberRow({
    label: 'Declination', value: s.declination, min: -30, max: 30, step: 0.1, unit: '°',
    ends: ['west', 'east'],
    hint: 'East is positive. This is the same number you would dial into a Brunton.',
    onChange: (v) => ctx.setSetting({ declination: v, declinationSet: true, declinationSource: 'manual' }),
  });
  node.appendChild(declRow);

  const declState = el('div', { class: 'ctl-hint standalone' });
  node.appendChild(declState);

  node.appendChild(el('div', { class: 'row-actions' }, [
    el('button', {
      class: 'btn small', type: 'button', text: 'Look it up',
      disabled: navigator.onLine === false,
      title: 'Ask NOAA for the declination where you are',
      onclick: () => ctx.fetchDeclination(),
    }),
    el('button', {
      class: 'btn small', type: 'button', text: 'Set to zero',
      onclick: () => ctx.setSetting({ declination: 0, declinationSet: true, declinationSource: 'manual' }),
    }),
  ]));

  node.appendChild(el('div', { class: 'about' }, [
    el('p', { text: 'A phone’s magnetometer finds magnetic north. A map is drawn to true north. The gap between them is the declination, and it is up to 20° across the United States — enough to move a strike into the wrong quadrant without ever looking wrong.' }),
    el('p', { text: 'Every phone browser reports a magnetic bearing — iPhones included, despite offering a property that sounds like it means true north. So this correction is applied here, on every platform, and nothing else applies it. If your readings sit a consistent ten or fifteen degrees off a Brunton, this setting is the first thing to check.' }),
    el('p', { text: 'The value is stored with every reading, so a wrong one can be corrected later in a spreadsheet without retaking anything.' }),
  ]));

  // --- accuracy ------------------------------------------------------------
  node.appendChild(el('div', { class: 'sub-head', text: 'Position' }));
  node.appendChild(numberRow({
    label: 'Require a fix better than', value: s.minAccuracy, min: 5, max: 100, step: 1, unit: 'm',
    hint: 'A station cannot be recorded on a fix worse than this. Loosen it under a canopy, tighten it in the open.',
    onChange: (v) => ctx.setSetting({ minAccuracy: v }),
  }));
  node.appendChild(toggleRow({
    label: 'Follow my position',
    value: s.follow,
    hint: 'Keep the map centered on you as you walk. Dragging the map turns this off; the crosshair button turns it back on.',
    onChange: (v) => ctx.setSetting({ follow: v }),
  }));

  // --- map -----------------------------------------------------------------
  node.appendChild(el('div', { class: 'sub-head', text: 'Map' }));
  node.appendChild(selectRow({
    label: 'Base layer', value: s.baseLayer,
    options: BASE_SOURCES.map((id) => ({ value: id, label: SOURCES[id].label })),
    onChange: (v) => ctx.setSetting({ baseLayer: v }),
  }));
  node.appendChild(toggleRow({
    label: 'Hillshade', value: s.showHillshade,
    hint: 'Relief worked out from the cached elevation. Needs the Elevation layer downloaded.',
    onChange: (v) => ctx.setSetting({ showHillshade: v }),
  }));
  node.appendChild(toggleRow({
    label: 'Contours', value: s.showContours,
    hint: 'Drawn from elevation numbers, so they stay sharp past zoom 16 where the photography stops.',
    onChange: (v) => ctx.setSetting({ showContours: v }),
  }));
  node.appendChild(selectRow({
    label: 'Contour interval', value: String(s.contourInterval),
    options: [
      { value: '0', label: 'Automatic' },
      ...[5, 10, 20, 25, 50, 100].map((v) => ({ value: String(v), label: `${v} m` })),
    ],
    onChange: (v) => ctx.setSetting({ contourInterval: Number(v) }),
  }));
  node.appendChild(toggleRow({
    label: 'Station numbers', value: s.labelStations,
    onChange: (v) => ctx.setSetting({ labelStations: v }),
  }));

  // --- units ---------------------------------------------------------------
  node.appendChild(el('div', { class: 'sub-head', text: `Map units · ${doc.units.length}` }));
  node.appendChild(el('div', { class: 'ctl-hint standalone',
    text: 'Set these up before a field course and naming a unit is one tap. Leave it empty and type names as you go — they become taps either way.' }));

  for (const u of doc.units) {
    const rock = rockOf(u.rockId);
    node.appendChild(el('div', { class: 'card unit-card' }, [
      el('div', { class: 'card-main static' }, [
        el('span', { class: 'card-swatch' }, [swatchEl(unitColor(u), rock.pattern, 'swatch small')]),
        el('span', { class: 'card-text' }, [
          el('span', { class: 'card-title', text: u.name || 'Unnamed unit' }),
          el('span', { class: 'card-sub', text: rock.label }),
        ]),
        el('button', {
          class: 'chip-close', type: 'button', text: '×', 'aria-label': 'Delete unit',
          onclick: () => ctx.deleteUnit(u.id),
        }),
      ]),
      el('div', { class: 'card-body' }, [
        textRow({
          label: 'Name', value: u.name, placeholder: 'e.g. Navajo Sandstone',
          onChange: (v) => ctx.editUnit(u.id, (x) => { x.name = v.trim(); }),
        }),
        selectRow({
          label: 'Rock type', value: u.rockId,
          options: ROCKS.map((r) => ({ value: r.id, label: `${r.group} — ${r.label}` })),
          onChange: (v) => ctx.editUnit(u.id, (x) => { x.rockId = v; }),
        }),
      ]),
    ]));
  }

  node.appendChild(el('button', {
    class: 'btn wide', type: 'button', text: 'Add a unit',
    onclick: () => ctx.addUnit(makeUnit()),
  }));

  // --- data ----------------------------------------------------------------
  node.appendChild(el('div', { class: 'sub-head', text: 'This project’s notes' }));
  node.appendChild(el('div', { class: 'row-actions wrap' }, [
    el('button', { class: 'btn', type: 'button', text: 'Backup', onclick: () => ctx.exportBackup() }),
    el('button', { class: 'btn', type: 'button', text: 'Restore', onclick: () => ctx.importBackup() }),
    el('button', { class: 'btn', type: 'button', text: 'Google Earth', onclick: () => ctx.exportKML() }),
  ]));
  node.appendChild(el('button', {
    class: 'btn wide danger', type: 'button', text: 'Empty this project',
    title: 'Delete every station and line here, keeping the project and its map areas',
    onclick: () => ctx.clearAll(),
  }));

  node.refreshReadings = () => {
    const src = doc.settings.declinationSource;
    if (!doc.settings.declinationSet) {
      declState.textContent = 'Not set yet. Until it is, a strike from the phone is a magnetic bearing.';
    } else {
      declState.textContent = `${formatDeclination(doc.settings.declination)} applied to every compass reading`
        + (src === 'noaa' ? ', from NOAA.' : '.');
    }
  };
  node.refreshReadings();

  return node;
}
