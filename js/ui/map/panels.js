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
import { FEATURES, CERTAINTIES, ROCKS, rockOf, unitColor, knownUnitNames,
  makeUnit, hasAttitude } from '../../field/model.js';
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

function head(title, sub) {
  return el('div', { class: 'section-head' }, [
    el('h2', { text: title }),
    sub ? el('p', { text: sub }) : null,
  ]);
}

const pad3 = (v) => String(Math.round(v)).padStart(3, '0');

/** Strike and dip the way it is written in a notebook. */
export function formatAttitude(st) {
  if (!hasAttitude(st)) return 'no attitude';
  return `${pad3(st.strike)}/${Math.round(st.dip)}`;
}

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

  const sourceChips = chipsRow({
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

  let compassBits = null;
  if (draft.source === 'compass') {
    compassBits = buildCompass(ctx, draft, liveWrap);
  } else {
    const dial = compassDial({
      value: draft.strike ?? 0, dip: draft.dip ?? 0, label: 'Strike',
      onChange: (v) => { draft.strike = v; ctx.touchDraft(); },
    });
    const prot = protractor({
      value: draft.dip ?? 0, label: 'Dip', max: 90,
      onChange: (v) => { draft.dip = v; dial.setDip(v); ctx.touchDraft(); },
    });
    // A reading typed in has no attitude until it is typed, so seed it.
    if (draft.strike == null) draft.strike = 0;
    if (draft.dip == null) draft.dip = 0;
    liveWrap.append(dial, prot);
  }

  const noAttitude = toggleRow({
    label: 'No attitude here',
    value: draft.noAttitude,
    hint: 'Record the rock and the place without a strike and dip — scree, float, a covered contact.',
    onChange: (v) => { draft.noAttitude = v; ctx.rebuild(); },
  });
  node.appendChild(noAttitude);

  // --- which rock ---------------------------------------------------------
  node.appendChild(el('div', { class: 'sub-head', text: 'What it is' }));

  node.appendChild(chipsRow({
    label: 'Feature',
    value: draft.feature,
    options: FEATURES.map((f) => ({ id: f.id, label: f.label, hint: f.hint })),
    onChange: (v) => { draft.feature = v; ctx.touchDraft(); },
  }));

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

    compassBits?.refresh();

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

/** The live compass block, including its permission gate. */
function buildCompass(ctx, draft, wrap) {
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
  if (!ctx.clinoStarted()) {
    wrap.appendChild(el('button', {
      class: 'btn primary wide', type: 'button', text: 'Turn on the compass',
      onclick: () => ctx.startClino(),
    }));
    wrap.appendChild(el('div', { class: 'ctl-hint standalone',
      text: 'iOS asks permission before any app can read the compass.' }));
    return null;
  }

  const big = el('div', { class: 'reading-big', text: '—' });
  const sub = el('div', { class: 'reading-sub', text: '' });
  const scatter = el('div', { class: 'reading-scatter' });
  const bar = el('div', { class: 'steady' }, [el('span', { class: 'steady-fill' })]);
  const warn = el('div', { class: 'ctl-hint standalone' });

  const capture = el('button', {
    class: 'btn wide', type: 'button', text: 'Hold the reading',
    onclick: () => ctx.captureCompass(),
  });

  wrap.append(el('div', { class: 'reading' }, [big, sub, scatter, bar]), warn, capture);

  const refresh = () => {
    const s = ctx.clinoState();
    if (draft.held) {
      big.textContent = `${pad3(draft.strike)}/${Math.round(draft.dip)}`;
      sub.textContent = `${quadrantBearing(draft.strike)} · held`;
      scatter.textContent = draft.scatter != null
        ? `captured with ${draft.scatter.toFixed(1)}° of scatter` : '';
      bar.querySelector('.steady-fill').style.width = '100%';
      capture.textContent = 'Take a new reading';
      warn.textContent = '';
      return;
    }
    capture.textContent = 'Hold the reading';

    if (!s.ready) {
      big.textContent = '—';
      sub.textContent = s.settling ? 'settling…' : 'waiting for the sensor…';
      scatter.textContent = '';
      bar.querySelector('.steady-fill').style.width = '0%';
      return;
    }

    big.textContent = s.strike == null
      ? `dip ${Math.round(s.dip)}` : `${pad3(s.strike)}/${Math.round(s.dip)}`;
    sub.textContent = s.strike == null
      ? 'no compass reference — dip only' : quadrantBearing(s.strike);
    scatter.textContent = `${s.scatter.toFixed(1)}° scatter`;
    scatter.className = `reading-scatter ${s.still ? 'good' : 'warn'}`;
    // The bar fills as the phone settles, so "hold still" is something the
    // student can watch happen rather than a word on a screen.
    const fill = Math.max(0, Math.min(1, 1 - (s.scatter / 6)));
    bar.querySelector('.steady-fill').style.width = `${fill * 100}%`;
    bar.classList.toggle('ready', s.still);

    const bits = [];
    if (s.needsCalibration) bits.push('The magnetometer wants calibrating — wave the phone in a figure of eight.');
    if (!s.absolute) bits.push('This browser is not giving a compass heading, so only the dip is real.');
    if (!ctx.declinationSet()) {
      bits.push('Declination is not set, so every strike is a magnetic bearing. Set it on the Setup tab.');
    }
    if (!s.still) bits.push('Still moving. Rest the phone on the rock and wait for the bar to fill.');
    warn.textContent = bits.join(' ');
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

  node.appendChild(el('div', { class: 'sub-head', text: 'Take it with you' }));
  node.appendChild(el('div', { class: 'row-actions wrap' }, [
    el('button', { class: 'btn', type: 'button', text: 'GeoJSON', onclick: () => ctx.exportGeoJSON() }),
    el('button', { class: 'btn', type: 'button', text: 'CSV', onclick: () => ctx.exportCSV() }),
    el('button', { class: 'btn', type: 'button', text: 'Backup', onclick: () => ctx.exportBackup() }),
  ]));
  node.appendChild(el('div', { class: 'ctl-hint standalone',
    text: 'GeoJSON opens in QGIS or ArcGIS and carries strike, dip and dip direction as fields. Backup is the whole notebook, and it is what restores it.' }));

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

  if (hasAttitude(st)) {
    const dial = compassDial({
      value: st.strike, dip: st.dip, label: 'Strike',
      onChange: (v) => edit((s) => { s.strike = v; }, `st-strike:${st.id}`),
    });
    const prot = protractor({
      value: st.dip, label: 'Dip', max: 90,
      onChange: (v) => { dial.setDip(v); edit((s) => { s.dip = v; }, `st-dip:${st.id}`); },
    });
    box.append(dial, prot);
  }

  box.appendChild(chipsRow({
    label: 'Feature', value: st.feature,
    options: FEATURES.map((f) => ({ id: f.id, label: f.label, hint: f.hint })),
    onChange: (v) => edit((s) => { s.feature = v; }),
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
    el('button', { class: 'btn small danger', type: 'button', text: 'Delete', onclick: () => ctx.deleteStation(st.id) }),
  ]));

  return box;
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
    if (prog) {
      const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
      node.appendChild(el('div', { class: 'progress' }, [
        el('div', { class: 'progress-bar' }, [
          el('span', { style: { width: `${pct}%` } }),
        ]),
        el('div', { class: 'progress-text',
          text: `${prog.done} of ${prog.total} tiles · ${formatBytes(prog.bytes)}${prog.failed ? ` · ${prog.failed} failed` : ''}` }),
      ]));
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
    else if (check.complete) { state = 'complete'; klass = 'good'; }
    else { state = `${check.missing} tiles missing`; klass = 'bad'; }

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
    hint: 'Keep the map centered on you as you walk.',
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
  node.appendChild(el('div', { class: 'sub-head', text: 'Field notes' }));
  node.appendChild(textRow({
    label: 'Name', value: doc.name, placeholder: 'Field notes',
    onChange: (v) => ctx.setDocName(v.trim() || 'Field notes'),
  }));
  node.appendChild(el('div', { class: 'row-actions wrap' }, [
    el('button', { class: 'btn', type: 'button', text: 'Backup', onclick: () => ctx.exportBackup() }),
    el('button', { class: 'btn', type: 'button', text: 'Restore', onclick: () => ctx.importBackup() }),
  ]));
  node.appendChild(el('button', {
    class: 'btn wide danger', type: 'button', text: 'Delete all field notes',
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
