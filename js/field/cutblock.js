// Cutting a block out of a field area.
//
// This is the join between the two halves, and it is deliberately one file
// with no DOM in it: everything here is "given these notes and this box, what
// block does the mapping imply", which is a question about the data and not
// about the screen.
//
// The work is in four moves:
//
//   1. sample the real ground over the box            (field/ground.js)
//   2. carry the notes into the block's own metres    (here)
//   3. read a history back out of them                (geo/infer.js)
//   4. read the column off the contacts, and build the document (here)
//
// Step 3 is where the interpretation happens and it is the only step that can
// be wrong in an interesting way, which is why everything it decided is
// carried back out in `report` rather than left implied by the block.

import { georef, georefRecord, georefFromBbox, groundFor, toBlock, inBlock } from './ground.js';
import { inferHistory, columnFrom, misfit, contactGroups } from '../geo/infer.js';
import { defaultDocument, makeLayer, makeMarker, rock, ROCKS } from '../geo/model.js';
import { surfaceHeight, surfaceRange } from '../geo/surfaces.js';
import { hasAttitude, isLinearFeature } from './model.js';

/** Only planar readings of bedding are evidence about the shape of the beds. */
const FITTABLE_FEATURE = 'bedding';

/**
 * Carry the notebook into the block's frame.
 *
 * A station's height comes from the block's own lid rather than from the
 * elevation stored on the station. They are the same DEM, but the lid is what
 * the fit and the block will both be reading, and a reading that sits a few
 * metres off the surface it is supposed to lie on is a reading the fold has to
 * explain. Stations outside the box are dropped rather than clamped to its
 * edge, which would invent a measurement where none was taken.
 */
export function projectNotes(doc, g, ground) {
  const zOf = (x, y) => surfaceHeight(ground, x, y);

  const stations = [];
  const dropped = { outside: 0, noAttitude: 0, notBedding: 0, linear: 0 };
  for (const st of doc.stations || []) {
    const [x, y] = toBlock(g, st.lon, st.lat);
    if (!inBlock(g, x, y)) { dropped.outside++; continue; }
    if (!hasAttitude(st)) { dropped.noAttitude++; continue; }
    if (isLinearFeature(st.feature)) { dropped.linear++; continue; }
    if (st.feature !== FITTABLE_FEATURE) { dropped.notBedding++; continue; }
    stations.push({
      id: st.id, name: st.name, x, y, z: zOf(x, y),
      strike: st.strike, dip: st.dip,
      unitName: st.unitName || '',
    });
  }

  const lines = [];
  for (const ln of doc.lines || []) {
    const pts = [];
    for (const [lon, lat] of ln.points || []) {
      const [x, y] = toBlock(g, lon, lat);
      if (!inBlock(g, x, y)) continue;
      pts.push([x, y, zOf(x, y)]);
    }
    if (pts.length < 2) continue;
    lines.push({
      id: ln.id, name: ln.name || '', kind: ln.kind, pts,
      unitA: ln.unitA || '', unitB: ln.unitB || '',
      certainty: ln.certainty,
      use: ln.kind !== 'traverse',
    });
  }

  return { stations, lines, dropped };
}

/**
 * The stratigraphic column the contacts imply.
 *
 * The contacts give the *spacing* between surfaces and nothing else — they say
 * nothing about what is above the highest one or below the lowest, and nothing
 * about how thick either of those is. So the column gets a unit on each end
 * whose thickness is a guess plainly labelled as one, and the units between
 * them are measured.
 *
 * Names come from the notebook where the student named the units either side
 * of a contact, because a column of "unit 1, unit 2" helps nobody who has just
 * spent two days calling it the Poleta Formation.
 */
export function columnFor(column, fieldDoc) {
  const known = new Map(
    (fieldDoc.units || []).map((u) => [String(u.name || '').trim().toLowerCase(), u]),
  );
  const fallback = ['sandstone', 'shale', 'limestone', 'siltstone', 'dolomite', 'conglomerate'];
  const layers = [];
  const named = [];

  // Walk the contacts youngest first; the unit between two of them is the one
  // both of them touch.
  const cs = column.contacts;
  for (let i = 0; i < cs.length - 1; i++) {
    const thickness = Math.max(5, cs[i + 1].depth - cs[i].depth);
    const name = sharedUnit(cs[i], cs[i + 1]);
    named.push({ name, thickness, measured: true });
  }

  // A roof and a floor, so the measured units are not left hanging in nothing.
  const typical = named.length
    ? named.reduce((a, u) => a + u.thickness, 0) / named.length
    : 200;
  const roof = { name: topUnit(cs[0]), thickness: Math.round(typical), measured: false };
  const floor = {
    name: bottomUnit(cs[cs.length - 1]), thickness: Math.round(typical), measured: false,
  };
  const all = cs.length ? [roof, ...named, floor] : [];

  all.forEach((u, i) => {
    const hit = known.get(String(u.name || '').trim().toLowerCase());
    const rockId = hit && hit.rockId ? hit.rockId : fallback[i % fallback.length];
    const r = rock(rockId);
    layers.push(makeLayer(rockId, Math.round(u.thickness), {
      name: u.name || r.label,
      color: (hit && hit.color) || r.color,
    }));
  });

  return { layers, units: all };
}

/** The unit two neighbouring contacts share — the one that lies between them. */
function sharedUnit(a, b) {
  const A = [a.unitA, a.unitB].filter(Boolean).map((s) => s.trim());
  const B = [b.unitA, b.unitB].filter(Boolean).map((s) => s.trim());
  const both = A.find((n) => B.some((m) => m.toLowerCase() === n.toLowerCase()));
  return both || '';
}

function topUnit(c) {
  if (!c) return '';
  // Of the two units a contact separates, the one that is NOT shared downward.
  return (c.unitA || c.unitB || '').trim();
}

function bottomUnit(c) {
  if (!c) return '';
  return (c.unitB || c.unitA || '').trim();
}

/**
 * Cut a block from a field project.
 *
 * @param {object} fieldDoc   the Map section's document
 * @param {Array}  bbox       the extent box, [w, s, e, n]
 * @param {object} opts       { allowNetwork, onProgress, name }
 * @returns {{doc, report}}   a block document, and everything the fit decided
 */
export async function cutBlock(fieldDoc, bbox, { allowNetwork = true, onProgress, name } = {}) {
  const g = georefFromBbox(bbox);
  const got = await groundFor(g, { allowNetwork, onProgress });
  const ground = got.surface;

  const notes = projectNotes(fieldDoc, g, ground);
  const extent = Math.max(g.width, g.depth);
  const fit = inferHistory(notes, { extent });

  // A box far bigger than the mapping inside it makes a block that is mostly
  // extrapolation. The fit is only as good as the ground it was measured on,
  // and the rest of the block is the model talking to itself — worth saying,
  // because a big empty block looks more authoritative than a small full one.
  const spread = evidenceSpread(notes, g);
  if (spread && spread.frac < 0.25) {
    fit.warnings.push(
      `Everything you mapped sits inside about ${Math.round(spread.w)} × ${Math.round(spread.h)} m of a ${Math.round(g.width)} × ${Math.round(g.depth)} m block, so most of this block is extrapolation rather than evidence. Draw the box closer around your mapping, or read the far corners as a guess.`,
    );
  }
  const column = fit.events.length ? columnFrom(fit.events, notes) : { contacts: [], units: [] };
  const built = columnFor(column, fieldDoc);

  const doc = defaultDocument();
  doc.name = name || fieldDoc.name || 'Field area';
  doc.georef = georefRecord(g);
  doc.topo = ground;

  const relief = surfaceRange(ground, g.width, g.depth);
  doc.block = {
    width: Math.round(g.width),
    depth: Math.round(g.depth),
    // Deep enough to hold the structure that was fitted, not merely the
    // relief: a fold with 200 m of amplitude needs room to close beneath the
    // ground or the block is a lid with nothing under it. Capped against the
    // footprint all the same — a big fitted amplitude would otherwise give a
    // block several kilometres deeper than it is wide, which is a column
    // rather than a block and cannot be read as either a map or a section.
    height: Math.round(Math.min(
      Math.max(1200, Math.min(g.width, g.depth) * 0.9),
      Math.max(800, (relief.hi - relief.lo) * 2, structureDepth(fit.events) * 2.5),
    )),
    cutE: 0, cutN: 0,
  };
  doc.events = fit.events;
  if (built.layers.length) doc.layers = built.layers;

  // The stations go on as the block's own markers, so the readings a student
  // took are standing on the block that claims to explain them. A marker holds
  // only its map position — its attitude is whatever the block says, which is
  // exactly the comparison worth having on screen.
  doc.markers = notes.stations.map((s) => makeMarker(s.x, s.y));

  // The mapping itself travels with the block, in block metres.
  //
  // Not a convenience: it is the evidence. Without it the block is a shape
  // that cannot be argued with, and the one thing worth showing beside it is
  // where the contact the model predicts parts company with the contact
  // somebody walked. Kept on the document rather than fetched back out of the
  // Map section so that a block which is saved, exported and opened on another
  // phone can still be held against the map it came from.
  doc.survey = {
    stations: notes.stations.map((s) => ({
      id: s.id, name: s.name,
      // z travels too. It is derivable from the lid, but `misfit` takes an
      // observation set rather than a document, and a station with no height
      // is a station the inverse walk answers "no bedding here" for — which
      // scores as ninety degrees and makes a good block look hopeless.
      x: r1(s.x), y: r1(s.y), z: r1(s.z),
      strike: r1(s.strike), dip: r1(s.dip),
    })),
    lines: notes.lines.map((l) => ({
      id: l.id, name: l.name, kind: l.kind, certainty: l.certainty,
      unitA: l.unitA, unitB: l.unitB,
      // Thinned. A contact walked with a GPS on every second is a thousand
      // points that draw the same line as eighty. Height travels with each
      // point for the same reason a station's does: a contact is a surface of
      // constant stratigraphic depth, and depth cannot be asked for at a
      // position with no height.
      pts: thin(l.pts, 120).map((p) => [r1(p[0]), r1(p[1]), r1(p[2])]),
    })),
    // The depths the fitted structure puts each mapped surface at, which is
    // what the predicted trace is contoured from.
    levels: column.contacts.map((c) => ({ key: c.id, name: c.name, depth: r1(c.depth) })),
  };

  // The column is hung so that the shallowest contact lands where it was
  // mapped. Get this wrong and the geometry is right while every unit on the
  // map is the wrong one.
  if (column.contacts.length && built.units.length) {
    const top = column.contacts[0].depth;
    doc.layers[0].thickness = Math.max(5, Math.round(doc.layers[0].thickness + top));
  }

  // What the fit decided, on the document itself.
  //
  // It was on the Map section before, which meant it vanished the moment the
  // block opened — the panel that explains a block cannot live in the half you
  // are navigated away from to see it, and a reading of the evidence that does
  // not survive a reload is not a record of anything. Only the verdict travels:
  // the misfit is recomputed live against whatever the history says now, so it
  // stays true while the student edits it.
  doc.fit = {
    at: new Date().toISOString(),
    verdict: {
      kind: fit.verdict.kind,
      n: fit.verdict.n || 0,
      misfit: fit.verdict.misfit ?? null,
      spread: fit.verdict.spread ?? null,
      axis: fit.verdict.axis || null,
      mean: fit.verdict.mean || null,
      cone: fit.verdict.cone ? { angle: fit.verdict.cone.angle } : null,
    },
    notes: fit.notes,
    warnings: fit.warnings,
    units: built.units,
    counts: {
      stations: notes.stations.length,
      dropped: notes.dropped,
      surfaces: contactGroups(notes).length,
      faults: notes.lines.filter((l) => l.kind === 'fault').length,
    },
    ground: { missing: got.missing, tiles: got.tiles, zoom: got.zoom },
    // The misfit as built, to hold "now" against.
    built: (() => { const m = misfit(fit.events, notes); return { angle: m.angle, spread: m.spread }; })(),
  };

  return {
    doc,
    report: {
      ...fit,
      ground: got,
      column,
      units: built.units,
      counts: {
        stations: notes.stations.length,
        dropped: notes.dropped,
        surfaces: contactGroups(notes).length,
        contactLines: notes.lines.filter((l) => l.kind === 'contact' || l.kind === 'unconformity').length,
        faults: notes.lines.filter((l) => l.kind === 'fault').length,
      },
      georef: g,
      notesInBlock: notes,
    },
  };
}

/** The footprint the evidence actually covers, against the block's own. */
function evidenceSpread(notes, g) {
  const pts = [
    ...notes.stations.map((s) => [s.x, s.y]),
    ...notes.lines.filter((l) => l.use).flatMap((l) => l.pts),
  ];
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  // Compared per axis and the better of the two taken, so a long traverse
  // across a narrow box is not called empty.
  return { w, h, frac: Math.max(w / g.width, h / g.depth) };
}

const r1 = (v) => Math.round(v * 10) / 10;

/** Keep at most `max` points, evenly spaced, always including both ends. */
function thin(pts, max) {
  if (pts.length <= max) return pts;
  const out = [];
  for (let i = 0; i < max - 1; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (max - 1))]);
  out.push(pts[pts.length - 1]);
  return out;
}

/** How deep the fitted structure reaches, so the block can be cut to hold it. */
function structureDepth(events) {
  let d = 400;
  for (const e of events) {
    if (e.type === 'fold') d = Math.max(d, (e.amplitude || 0) * 2 + 300);
    if (e.type === 'domebasin') d = Math.max(d, Math.abs(e.amplitude || 0) * 2 + 300);
    if (e.type === 'fault') d = Math.max(d, (e.slip || 0) * 1.5 + 300);
    if (e.type === 'tilt') d = Math.max(d, 600);
  }
  return d;
}

/**
 * What can be answered before anything is downloaded — so the panel can say
 * what a box holds, and why it is not yet enough, while it is being dragged.
 */
export function surveyExtent(fieldDoc, bbox) {
  const g = georefFromBbox(bbox);
  let bedding = 0;
  let other = 0;
  for (const st of fieldDoc.stations || []) {
    const [x, y] = toBlock(g, st.lon, st.lat);
    if (!inBlock(g, x, y)) continue;
    if (hasAttitude(st) && !isLinearFeature(st.feature) && st.feature === FITTABLE_FEATURE) bedding++;
    else other++;
  }
  const lines = { contact: 0, fault: 0, other: 0, unnamed: 0 };
  for (const ln of fieldDoc.lines || []) {
    const inside = (ln.points || []).some(([lon, lat]) => {
      const [x, y] = toBlock(g, lon, lat);
      return inBlock(g, x, y);
    });
    if (!inside) continue;
    if (ln.kind === 'contact' || ln.kind === 'unconformity') {
      lines.contact++;
      if (!String(ln.unitA || '').trim() || !String(ln.unitB || '').trim()) lines.unnamed++;
    } else if (ln.kind === 'fault') lines.fault++;
    else lines.other++;
  }
  return { georef: g, bedding, other, lines };
}
