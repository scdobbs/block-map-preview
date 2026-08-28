// The field document: what was measured, where, in what, and how much to
// believe it.
//
// Kept entirely separate from the block-diagram document. A block is an
// invented thing a student builds to understand a structure; this is a record
// of an actual outcrop, and the two should never be able to overwrite each
// other. They share the rock list and nothing else.

import { ROCKS, ROCK_BY_ID } from '../geo/model.js';

export const FIELD_SCHEMA_VERSION = 1;

export { ROCKS, ROCK_BY_ID };

/** A rock type by id, always something. Named apart from the block's `rock`
 * so a file importing both cannot get them confused. */
export function rockOf(id) { return ROCK_BY_ID[id] || ROCK_BY_ID.sandstone; }

// ---------------------------------------------------------------------------
// What can be measured
// ---------------------------------------------------------------------------
// Typed, because a joint plotted as bedding is worse than a joint not plotted
// at all: it goes on to the stereonet, joins the girdle fit, and moves the
// fold axis. Naming the feature costs one tap and keeps the fit honest.

export const FEATURES = [
  {
    id: 'bedding', label: 'Bedding', short: 'Bd', geometry: 'planar',
    hint: 'The depositional surface. This is what a fold axis is fitted from.',
  },
  {
    id: 'foliation', label: 'Foliation', short: 'Fol', geometry: 'planar',
    hint: 'Cleavage or schistosity.',
  },
  {
    id: 'joint', label: 'Joint', short: 'Jt', geometry: 'planar',
    hint: 'A fracture with no measurable offset.',
  },
  {
    id: 'fault', label: 'Fault plane', short: 'Flt', geometry: 'planar',
    hint: 'A fracture the rock has moved along.',
  },
  {
    id: 'contact', label: 'Contact', short: 'Ct', geometry: 'planar',
    hint: 'The surface between two units.',
  },
  // Lines, not planes. Measured by laying the long edge of the phone along the
  // structure and pointing it down-plunge, and recorded as trend and plunge.
  {
    id: 'lineation', label: 'Lineation', short: 'Ln', geometry: 'linear',
    hint: 'A mineral or stretching lineation on a surface.',
  },
  {
    id: 'hinge', label: 'Fold hinge', short: 'Hng', geometry: 'linear',
    hint: 'A hinge line measured directly, rather than fitted from bedding.',
  },
  {
    id: 'slickenline', label: 'Slickenline', short: 'Slk', geometry: 'linear',
    hint: 'Slip striae on a fault surface. Lay the phone on the fault with its edge along the striae and it records both.',
  },
  {
    id: 'axis', label: 'Other line', short: 'Ln', geometry: 'linear',
    hint: 'Any other linear structure.',
  },
];

export const FEATURE_BY_ID = Object.fromEntries(FEATURES.map((f) => [f.id, f]));

export function feature(id) { return FEATURE_BY_ID[id] || FEATURE_BY_ID.bedding; }

/** 'planar' or 'linear' — which pair of numbers this feature is recorded as. */
export function featureGeometry(id) { return feature(id).geometry; }

export function isLinearFeature(id) { return feature(id).geometry === 'linear'; }

export const PLANAR_FEATURES = FEATURES.filter((f) => f.geometry === 'planar');
export const LINEAR_FEATURES = FEATURES.filter((f) => f.geometry === 'linear');

/** Only bedding is fitted for a fold axis. The rest are recorded, not folded. */
export const FITTABLE = new Set(['bedding']);

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------
// Field mapping has always distinguished what you stood on from what you
// inferred across a covered slope, and the distinction survives into the
// notebook rather than being flattened on the way in.

export const CERTAINTIES = [
  { id: 'measured', label: 'Measured', hint: 'Instrument on the surface.' },
  { id: 'estimated', label: 'Estimated', hint: 'Eyeballed, or read from a distance.' },
];

// ---------------------------------------------------------------------------
// Mapped lines
// ---------------------------------------------------------------------------
// Contacts and faults drawn on the map, as opposed to the linear structures a
// station measures. A geologic map is mostly these: the stations say what the
// rock is doing, and the lines say where one thing stops and another starts.

export const LINE_KINDS = [
  {
    id: 'contact', label: 'Contact', color: '#16232b', weight: 2.2,
    hint: 'Where one unit gives way to another.',
  },
  {
    id: 'fault', label: 'Fault', color: '#c0392b', weight: 3.4,
    hint: 'A surface the rock has moved along. Drawn heavier, the way a map prints it.',
  },
  {
    id: 'unconformity', label: 'Unconformity', color: '#b5651d', weight: 2.8,
    hint: 'A contact with time missing across it.',
  },
  {
    id: 'dike', label: 'Dike', color: '#7d3c98', weight: 2.4,
    hint: 'An intrusive sheet cutting the units it crosses.',
  },
  {
    id: 'traverse', label: 'Traverse', color: '#1f7a8c', weight: 1.8,
    hint: 'Where you walked. Not a geologic boundary.',
  },
  {
    id: 'other', label: 'Other', color: '#2f3a42', weight: 2.2,
    hint: 'Anything else worth a line.',
  },
];

export const LINE_KIND_BY_ID = Object.fromEntries(LINE_KINDS.map((k) => [k.id, k]));
export function lineKind(id) { return LINE_KIND_BY_ID[id] || LINE_KIND_BY_ID.contact; }

/**
 * How well the line is known, drawn the way a published map draws it: solid
 * where it was walked, dashed where it was approximated, long-dashed where it
 * was inferred between exposures, dotted where it is under cover.
 *
 * This distinction is the whole honesty of a geologic map — a student who
 * cannot draw an inferred contact will either not draw it or draw it as fact,
 * and both are worse.
 */
export const LINE_CERTAINTY = [
  { id: 'certain', label: 'Certain', dash: [], hint: 'Walked, or clearly exposed.' },
  { id: 'approximate', label: 'Approximate', dash: [9, 6], hint: 'Located to within a stride or two.' },
  { id: 'inferred', label: 'Inferred', dash: [18, 7], hint: 'Interpolated between exposures.' },
  { id: 'concealed', label: 'Concealed', dash: [2.5, 5], hint: 'Under cover — soil, scree, alluvium.' },
];

export const LINE_CERTAINTY_BY_ID = Object.fromEntries(LINE_CERTAINTY.map((c) => [c.id, c]));
export function lineCertainty(id) {
  return LINE_CERTAINTY_BY_ID[id] || LINE_CERTAINTY_BY_ID.certain;
}

let counter = 0;
export function newFieldId(prefix = 'st') {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------

/**
 * One reading at one place.
 *
 * `strike` and `dip` are allowed to be null. A station with a rock description
 * and no attitude is a perfectly ordinary field observation, and forcing a
 * number into it would be inventing data.
 *
 * The provenance fields are not decoration. `scatter` and `gpsAccuracy` are
 * what let a student look back at a reading that disagrees with its
 * neighbours and find out whether it was the rock or the phone.
 */
export function makeStation(over = {}) {
  return {
    id: newFieldId('st'),
    name: '',
    lon: 0,
    lat: 0,
    elev: null,             // meters, from the cached terrain
    gpsAccuracy: null,      // meters, the radius the browser reported
    gpsAltitude: null,      // meters, kept but not trusted over the terrain
    at: new Date().toISOString(),

    feature: 'bedding',
    // A station carries one pair or the other, never both: `feature` says
    // which, and the unused pair stays null rather than holding a stale
    // number from before the mode was switched.
    strike: null,
    dip: null,
    trend: null,
    plunge: null,
    certainty: 'measured',
    source: 'manual',       // 'compass' | 'manual'
    scatter: null,          // degrees of disagreement within the compass window
    declination: null,      // what was applied, so a wrong one can be undone

    unitId: null,
    unitName: '',
    rockId: null,
    note: '',
    ...over,
  };
}

/**
 * Stations are numbered in the order they were taken, which is how a field
 * notebook is numbered and how a student will refer to them out loud.
 */
export function nextStationName(stations) {
  let max = 0;
  for (const s of stations) {
    const n = parseInt(String(s.name || '').replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

export function hasAttitude(st) {
  return isLinearFeature(st.feature)
    ? Number.isFinite(st.trend) && Number.isFinite(st.plunge)
    : Number.isFinite(st.strike) && Number.isFinite(st.dip);
}

/**
 * The reading as written in a notebook.
 *
 * A line is labelled and a plane is not, because `020/15` on its own reads
 * exactly like the strike and dip of a plane — the same rule the stereonet
 * readout follows.
 */
export function formatAttitude(st) {
  if (!hasAttitude(st)) return 'no attitude';
  if (isLinearFeature(st.feature)) {
    return `${pad3(st.trend)}/${Math.round(st.plunge)} t/p`;
  }
  return `${pad3(st.strike)}/${Math.round(st.dip)}`;
}

function pad3(v) { return String(Math.round(v) % 360).padStart(3, '0'); }

// ---------------------------------------------------------------------------
// Map units
// ---------------------------------------------------------------------------
// Two ways in, because both happen. On a taught field course the units are
// known before anyone leaves the van, and picking from a list beats typing
// "Wingate Sandstone" with cold hands. On a reconnaissance day the whole point
// is that you do not know yet, so a name typed once becomes available to tap
// thereafter and can be promoted into the list later.

export function makeUnit(over = {}) {
  return {
    id: newFieldId('un'),
    name: '',
    rockId: 'sandstone',
    color: null,            // null means take the rock's own color
    note: '',
    ...over,
  };
}

export function unitColor(unit) {
  if (!unit) return '#9aa7b2';
  if (unit.color) return unit.color;
  return (ROCK_BY_ID[unit.rockId] || ROCK_BY_ID.sandstone).color;
}

/** Names already used, list or free text, for the autocomplete. */
export function knownUnitNames(doc) {
  const names = new Map();
  for (const u of doc.units || []) {
    if (u.name) names.set(u.name.toLowerCase(), { name: u.name, unit: u, count: 0 });
  }
  for (const s of doc.stations || []) {
    const n = (s.unitName || '').trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (names.has(key)) names.get(key).count++;
    else names.set(key, { name: n, unit: null, count: 1 });
  }
  return [...names.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function makeLine(over = {}) {
  return {
    id: newFieldId('ln'),
    name: '',
    kind: 'contact',
    certainty: 'certain',
    // [[lon, lat], ...] — a line only, never a ring. Closing an area is a
    // different job and would need a fill and a unit to fill it with.
    points: [],
    // Named by where they sit in the column, not by which side of the line
    // they happen to fall on. "One side and the other" is unanswerable from a
    // map alone and means the pair cannot be used for anything: the whole
    // point of naming them is that a contact with the same unit above and the
    // same unit below is the same contact wherever it crops out, and that is
    // what makes a fault's throw solvable. Upper is the younger of the two
    // where the beds are the right way up.
    unitUpper: '',
    unitLower: '',
    note: '',
    at: new Date().toISOString(),
    ...over,
  };
}

/**
 * A shaded map unit: a name, and a point inside the area it covers.
 *
 * The area itself is never stored. It is flooded out to the surrounding
 * contacts whenever it is drawn, so it cannot disagree with the lines — there
 * is only one copy of that geometry and it belongs to the contacts. Drag a
 * contact and every patch touching it follows.
 *
 * One unit crops out in many places: both limbs of a fold, either side of a
 * fault. So a patch carries a unit name rather than a unit owning a polygon,
 * and a unit may have as many patches as it has outcrops.
 */
export function makePatch(over = {}) {
  return {
    id: newFieldId('pt'),
    unitName: '',
    lon: 0,
    lat: 0,
    note: '',
    at: new Date().toISOString(),
    ...over,
  };
}

/** Ground length of a line, in meters. */
export function lineLength(line) {
  const p = line.points || [];
  let m = 0;
  for (let i = 1; i < p.length; i++) {
    m += haversine(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]);
  }
  return m;
}

// Kept here rather than imported from field/geo.js so the model stays free of
// anything but itself. Same formula, same mean radius.
function haversine(lon1, lat1, lon2, lat2) {
  const d = Math.PI / 180;
  const a1 = lat1 * d, a2 = lat2 * d;
  const h = Math.sin((lat2 - lat1) * d / 2) ** 2
    + Math.cos(a1) * Math.cos(a2) * Math.sin((lon2 - lon1) * d / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A line worth keeping has somewhere to go. */
export function lineIsDrawable(line) {
  return !!line && Array.isArray(line.points) && line.points.length >= 2;
}

// ---------------------------------------------------------------------------
// Cached areas
// ---------------------------------------------------------------------------

export function makeArea(over = {}) {
  return {
    id: newFieldId('ar'),
    name: '',
    bbox: [0, 0, 0, 0],     // west, south, east, north
    sources: ['topo', 'dem'],
    minZoom: 10,
    maxZoom: 16,
    savedAt: null,
    // Filled in by the verify pass, never by the download returning.
    check: null,            // { total, present, missing, complete, at }
    bytes: 0,
    declination: null,      // fetched for this area's center while online
    declinationInfo: null,
    ...over,
  };
}

export function areaComplete(area) {
  return !!area.check?.complete;
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export function defaultFieldDocument() {
  return {
    version: FIELD_SCHEMA_VERSION,
    name: 'Field notes',
    createdAt: new Date().toISOString(),
    stations: [],
    lines: [],
    patches: [],
    units: [],
    areas: [],
    settings: {
      baseLayer: 'topo',
      showHillshade: false,
      showContours: false,
      contourInterval: 0,     // 0 means choose one from the relief on screen
      showStations: true,
      labelStations: true,
      mapFull: false,
      follow: true,
      // Declination is the student's to set. Zero is not a guess at their
      // location, it is the honest statement that nothing has been applied
      // yet — and the UI says so rather than letting it pass for a reading.
      declination: 0,
      declinationSet: false,
      declinationSource: null,   // 'manual' | 'noaa' | 'ios'
      // A station placed on a fix worse than this is placed on a guess.
      minAccuracy: 15,
      units: 'metric',
    },
    view: { lon: -109.549, lat: 38.573, zoom: 13 },
  };
}

/** Fill in anything an older saved document predates. */
export function migrateFieldDoc(doc) {
  const base = defaultFieldDocument();
  if (!doc || typeof doc !== 'object') return base;
  const out = {
    ...base,
    ...doc,
    settings: { ...base.settings, ...(doc.settings || {}) },
    view: { ...base.view, ...(doc.view || {}) },
  };
  // A hand-edited or truncated file must not be able to hand the map
  // something that is not a station.
  out.stations = (Array.isArray(doc.stations) ? doc.stations : [])
    .filter((s) => s && Number.isFinite(s.lon) && Number.isFinite(s.lat))
    .map((s) => ({ ...makeStation(), ...s }));
  out.lines = (Array.isArray(doc.lines) ? doc.lines : [])
    .filter((l) => l && Array.isArray(l.points))
    .map((l) => {
      const line = {
        ...makeLine(),
        ...l,
        points: l.points
          .filter((pt) => Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
          .map((pt) => [pt[0], pt[1]]),
      };
      // The two units used to be recorded as "one side" and "the other", which
      // carries no order at all. They are carried across in the order they were
      // typed because that is the only thing the old field held — it is not a
      // claim that the first one is the upper. Nothing here can know which way
      // up they were meant, and guessing quietly would be worse than being
      // wrong loudly: building a block checks whether the column joins up and
      // says so when a whole notebook comes across inverted.
      if (line.unitUpper === '' && typeof l.unitA === 'string') line.unitUpper = l.unitA;
      if (line.unitLower === '' && typeof l.unitB === 'string') line.unitLower = l.unitB;
      delete line.unitA;
      delete line.unitB;
      return line;
    });
  out.patches = (Array.isArray(doc.patches) ? doc.patches : [])
    .filter((p) => p && Number.isFinite(p.lon) && Number.isFinite(p.lat))
    .map((p) => ({ ...makePatch(), ...p }));
  out.units = (Array.isArray(doc.units) ? doc.units : [])
    .filter((u) => u && typeof u === 'object')
    .map((u) => ({ ...makeUnit(), ...u }));
  out.areas = (Array.isArray(doc.areas) ? doc.areas : [])
    .filter((a) => a && Array.isArray(a.bbox) && a.bbox.length === 4)
    .map((a) => ({ ...makeArea(), ...a }));
  out.version = FIELD_SCHEMA_VERSION;
  return out;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * GeoJSON, because field data that cannot leave the app is field data waiting
 * to be lost. Strike and dip go in as plain properties so the file opens in
 * QGIS or ArcGIS and can be symbolised on `strike` directly.
 */
// The terrain grid is about ten meters across a cell, so a station's height is
// good to a meter at best. Writing it out to thirteen decimal places states a
// precision the data does not have.
function elevOut(v) { return v == null ? null : Math.round(v * 10) / 10; }

export function toGeoJSON(doc) {
  return {
    type: 'FeatureCollection',
    properties: {
      name: doc.name,
      exportedAt: new Date().toISOString(),
      declination: doc.settings.declination,
    },
    features: [...(doc.stations || []).map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: s.elev != null ? [s.lon, s.lat, elevOut(s.elev)] : [s.lon, s.lat] },
      properties: {
        id: s.id,
        station: s.name,
        feature: s.feature,
        structure: featureGeometry(s.feature),
        strike: s.strike,
        dip: s.dip,
        dip_direction: Number.isFinite(s.strike) ? (s.strike + 90) % 360 : null,
        trend: s.trend,
        plunge: s.plunge,
        certainty: s.certainty,
        source: s.source,
        scatter_deg: s.scatter,
        declination: s.declination,
        unit: s.unitName || null,
        rock: s.rockId || null,
        note: s.note || null,
        elevation_m: elevOut(s.elev),
        gps_accuracy_m: s.gpsAccuracy,
        time: s.at,
      },
    })), ...(doc.lines || []).filter(lineIsDrawable).map((l) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: l.points.map((p) => [p[0], p[1]]) },
      properties: {
        id: l.id,
        name: l.name || null,
        kind: l.kind,
        certainty: l.certainty,
        unit_upper: l.unitUpper || null,
        unit_lower: l.unitLower || null,
        length_m: Math.round(lineLength(l)),
        vertices: l.points.length,
        note: l.note || null,
        time: l.at,
      },
    }))],
  };
}

/**
 * KML, which is what opens in Google Earth by double-clicking it.
 *
 * GeoJSON is the better interchange format and QGIS prefers it, but Google
 * Earth is the program most students already have and already know how to fly
 * around in, and seeing your own contacts draped over the terrain you walked
 * is worth a second exporter.
 *
 * Attributes go in ExtendedData rather than only in the description, so QGIS
 * reads them as real fields if the same file is opened there instead.
 */
export function toKML(doc) {
  const lines = [];
  const push = (t) => lines.push(t);

  push('<?xml version="1.0" encoding="UTF-8"?>');
  push('<kml xmlns="http://www.opengis.net/kml/2.2"><Document>');
  push(`<name>${xml(doc.name || 'Field notes')}</name>`);

  // One style per line kind, coloured to match the map.
  for (const k of LINE_KINDS) {
    push(`<Style id="line-${k.id}"><LineStyle>`
      + `<color>${kmlColor(k.color)}</color>`
      + `<width>${Math.round(k.weight + 1)}</width>`
      + '</LineStyle></Style>');
  }
  push('<Style id="station"><IconStyle><scale>0.9</scale>'
    + '<Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>'
    + '</IconStyle></Style>');

  push('<Folder><name>Stations</name>');
  for (const st of doc.stations || []) {
    const attitude = formatAttitude(st);
    const rows = [
      ['Feature', feature(st.feature).label],
      [isLinearFeature(st.feature) ? 'Trend / plunge' : 'Strike / dip',
        attitude === 'no attitude' ? '—' : attitude],
      ['Unit', st.unitName || '—'],
      ['Rock', st.rockId || '—'],
      ['Elevation', st.elev == null ? '—' : `${elevOut(st.elev)} m`],
      ['GPS accuracy', st.gpsAccuracy == null ? '—' : `± ${Math.round(st.gpsAccuracy)} m`],
      ['Read with', st.source === 'compass' ? 'the phone' : 'by hand'],
      ['Scatter', st.scatter == null ? '—' : `${st.scatter.toFixed(1)}°`],
      ['Declination', st.declination == null ? '—' : `${st.declination}°`],
      ['Time', st.at],
      ['Note', st.note || '—'],
    ];
    push('<Placemark>');
    push(`<name>${xml(`${st.name || ''} ${attitude === 'no attitude' ? '' : attitude}`.trim() || 'station')}</name>`);
    push('<styleUrl>#station</styleUrl>');
    push(`<description><![CDATA[<table>${rows
      .map(([k, v]) => `<tr><td><b>${k}</b></td><td>${String(v)}</td></tr>`).join('')}</table>]]></description>`);
    push('<ExtendedData>');
    for (const [k, v] of [['station', st.name], ['feature', st.feature],
      ['strike', st.strike], ['dip', st.dip], ['trend', st.trend], ['plunge', st.plunge],
      ['unit', st.unitName], ['rock', st.rockId], ['certainty', st.certainty],
      ['source', st.source], ['scatter_deg', st.scatter], ['declination', st.declination],
      ['elevation_m', elevOut(st.elev)], ['gps_accuracy_m', st.gpsAccuracy], ['note', st.note]]) {
      if (v == null || v === '') continue;
      push(`<Data name="${k}"><value>${xml(String(v))}</value></Data>`);
    }
    push('</ExtendedData>');
    push(`<Point><coordinates>${st.lon},${st.lat},${elevOut(st.elev) ?? 0}</coordinates></Point>`);
    push('</Placemark>');
  }
  push('</Folder>');

  push('<Folder><name>Lines</name>');
  for (const l of (doc.lines || []).filter(lineIsDrawable)) {
    const k = lineKind(l.kind);
    push('<Placemark>');
    push(`<name>${xml(l.name || k.label)}</name>`);
    push(`<styleUrl>#line-${l.kind}</styleUrl>`);
    push(`<description><![CDATA[${xml(k.label)}, ${xml(lineCertainty(l.certainty).label.toLowerCase())}`
      + `${l.unitUpper || l.unitLower ? `<br>${xml(l.unitUpper || '?')} over ${xml(l.unitLower || '?')}` : ''}`
      + `<br>${Math.round(lineLength(l))} m`
      + `${l.note ? `<br>${xml(l.note)}` : ''}]]></description>`);
    push('<ExtendedData>');
    for (const [key, v] of [['kind', l.kind], ['certainty', l.certainty],
      ['unit_upper', l.unitUpper], ['unit_lower', l.unitLower],
      ['length_m', Math.round(lineLength(l))],
      ['note', l.note]]) {
      if (v == null || v === '') continue;
      push(`<Data name="${key}"><value>${xml(String(v))}</value></Data>`);
    }
    push('</ExtendedData>');
    // clampToGround with tessellate, so a contact follows the terrain in
    // Google Earth instead of cutting a straight chord through a ridge.
    push('<LineString><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode>'
      + `<coordinates>${l.points.map((pt) => `${pt[0]},${pt[1]},0`).join(' ')}</coordinates>`
      + '</LineString>');
    push('</Placemark>');
  }
  push('</Folder>');
  push('</Document></kml>');
  return lines.join('\n');
}

/** KML wants aabbggrr, which is the other way round from the web. */
function kmlColor(hex) {
  const h = hex.replace('#', '');
  return `ff${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toLowerCase();
}

function xml(s) {
  return String(s).replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

/**
 * Lines as a spreadsheet.
 *
 * One row per line, with the geometry as WKT — which is what QGIS's delimited
 * text importer reads, so a CSV of contacts comes in as real lines rather than
 * as a table nobody can map.
 */
export function toLinesCSV(doc) {
  const cols = ['name', 'kind', 'certainty', 'unit_upper', 'unit_lower', 'length_m',
    'vertices', 'note', 'time', 'wkt'];
  const rows = (doc.lines || []).filter(lineIsDrawable).map((l) => [
    l.name || '', l.kind, l.certainty, l.unitUpper || '', l.unitLower || '',
    Math.round(lineLength(l)), l.points.length, l.note || '', l.at,
    `LINESTRING (${l.points.map((p) => `${p[0].toFixed(6)} ${p[1].toFixed(6)}`).join(', ')})`,
  ].map(csvCell).join(','));
  return [cols.join(','), ...rows].join('\n');
}

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Comma-separated, for a spreadsheet — which is where marks get entered. */
export function toCSV(doc) {
  const cols = ['station', 'latitude', 'longitude', 'elevation_m', 'feature', 'structure',
    'strike', 'dip', 'trend', 'plunge', 'certainty', 'source', 'scatter_deg', 'unit',
    'rock', 'gps_accuracy_m', 'declination', 'time', 'note'];
  const esc = csvCell;
  const rows = (doc.stations || []).map((s) => [
    s.name, s.lat.toFixed(6), s.lon.toFixed(6), elevOut(s.elev) ?? '', s.feature,
    featureGeometry(s.feature),
    s.strike ?? '', s.dip ?? '', s.trend ?? '', s.plunge ?? '',
    s.certainty, s.source, s.scatter != null ? s.scatter.toFixed(1) : '',
    s.unitName || '', s.rockId || '', s.gpsAccuracy != null ? Math.round(s.gpsAccuracy) : '',
    s.declination ?? '', s.at, s.note || '',
  ].map(esc).join(','));
  return [cols.join(','), ...rows].join('\n');
}
