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
import { floodPatches, samplePatches, extentOf, BARRIER_KINDS } from './patches.js';

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
      unitUpper: ln.unitUpper || '', unitLower: ln.unitLower || '',
      certainty: ln.certainty,
      use: ln.kind !== 'traverse',
    });
  }

  // Shaded units, flooded again in block metres.
  //
  // Re-flooded rather than carried over from the map, because the block's
  // frame is the one the fit works in and a region is only as good as the
  // lines it was bounded by — the same lines, in the same coordinates, or the
  // patch and the contacts would be describing slightly different places.
  const patches = [];
  const seeds = [];
  for (const p of doc.patches || []) {
    const [x, y] = toBlock(g, p.lon, p.lat);
    seeds.push({ id: p.id, x, y, unit: p.unitName || '' });
  }
  if (seeds.length) {
    const barriers = lines.filter((l) => BARRIER_KINDS.has(l.kind));
    // The block's own footprint is the sheet, so a unit running off the side
    // of it closes against the edge exactly as it does on the map.
    const box = { x0: -g.width / 2, y0: -g.depth / 2, x1: g.width / 2, y1: g.depth / 2 };
    const flood = floodPatches({ lines: barriers, seeds, box, res: 320 });
    const sampled = samplePatches(flood, seeds, 140);
    seeds.forEach((seed, i) => {
      if (!seed.unit.trim()) return;
      // A fill with no boundary round it covers the sheet and constrains
      // nothing, so it is left out rather than allowed to dominate the fit.
      if (flood.wide.has(seed.id)) return;
      const pts = sampled[i].map(([x, y]) => [x, y, zOf(x, y)]);
      if (pts.length >= 4) patches.push({ id: seed.id, unit: seed.unit, pts });
    });
  }

  return { stations, lines, patches, dropped };
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
export function columnFor(column, fieldDoc, warnings = []) {
  const known = new Map(
    (fieldDoc.units || []).map((u) => [String(u.name || '').trim().toLowerCase(), u]),
  );
  const fallback = ['sandstone', 'shale', 'limestone', 'siltstone', 'dolomite', 'conglomerate'];
  const layers = [];
  const named = [];

  // Contacts come in shallowest first, which is youngest first. The unit
  // between two of them is the one below the upper contact — and it is also
  // the one above the lower contact, so the two names have to agree. When they
  // do not, the column the student recorded does not join up, and that is a
  // mapping error worth surfacing rather than papering over.
  const cs = column.contacts;
  const disagree = [];
  // Junctions where both sides actually carry a name. A contact with its units
  // left blank says nothing about the one above it, and must neither count as
  // an error nor dilute the test below.
  let comparable = 0;
  for (let i = 0; i < cs.length - 1; i++) {
    const above = cs[i];
    const below = cs[i + 1];
    const fromAbove = (above.lower || '').trim();
    const fromBelow = (below.upper || '').trim();
    if (fromAbove && fromBelow) {
      comparable++;
      if (fromAbove.toLowerCase() !== fromBelow.toLowerCase()) {
        disagree.push({ above, below, fromAbove, fromBelow });
      }
    }
    named.push({
      name: fromAbove || fromBelow,
      thickness: Math.max(5, below.depth - above.depth),
      measured: true,
    });
  }

  // Every junction disagreeing is not many errors, it is one: the pairs are
  // all the right way round relative to each other and the wrong way round
  // relative to the ground. Testing whether swapping them all would fix it
  // turns a hunt through every contact into a single answerable question.
  const swapFixes = comparable > 0 && disagree.length === comparable
    && cs.slice(0, -1).every((c, i) => {
      const a = (c.upper || '').trim().toLowerCase();
      const b = (cs[i + 1].lower || '').trim().toLowerCase();
      return !a || !b || a === b;
    });

  if (swapFixes) {
    warnings.push(
      `Every contact whose units can be checked has them the other way up from the order they crop out in, and swapping upper and lower on all of them would make the column join up. That is what a notebook looks like when the pair was recorded as "one side and the other": the names are right, the order is not.`,
    );
  } else {
    for (const d of disagree) {
      warnings.push(
        `Your contacts do not join up: "${d.above.name}" has ${d.fromAbove} beneath it, but the next contact down, "${d.below.name}", has ${d.fromBelow} above it. One of the two pairs is the wrong way round, or a contact between them has not been mapped.`,
      );
    }
  }

  // A roof and a floor, so the measured units are not left hanging in nothing.
  const typical = named.length
    ? named.reduce((a, u) => a + u.thickness, 0) / named.length
    : 200;
  const all = cs.length
    ? [
      { name: (cs[0].upper || '').trim(), thickness: Math.round(typical), measured: false },
      ...named,
      { name: (cs[cs.length - 1].lower || '').trim(), thickness: Math.round(typical), measured: false },
    ]
    : [];

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


/**
 * Put the ground at the right height in the column.
 *
 * Stratigraphic depth is measured down from the top of the column, which sits
 * at the block's own zero — so a contact can perfectly well come out at a
 * NEGATIVE depth, meaning it crops out above that zero. There is no way to
 * express that by adjusting the top unit's thickness, because a thickness
 * cannot be negative; trying squashes the roof to nothing and shifts every
 * unit on the map to something too young.
 *
 * The free parameter is not a thickness, it is how deep in the column the
 * ground has been eroded to — so the ground is what moves. Lowering the
 * heightfield by a constant raises every stratigraphic depth by the same
 * constant, which is exactly the shift needed, and adding that constant back
 * to the datum leaves every reported elevation untouched.
 *
 * The stations and the mapped lines move with the ground, or the misfit would
 * afterwards be scoring readings against a surface they are no longer on.
 */
function hangColumn(ground, notes, column) {
  const cs = column.contacts;
  if (!cs.length) return 0;

  // A roof thick enough to read, and in proportion to the units beneath it.
  const gaps = [];
  for (let i = 0; i < cs.length - 1; i++) gaps.push(cs[i + 1].depth - cs[i].depth);
  const typical = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 200;
  const roof = Math.max(20, Math.round(typical));

  const shift = roof - cs[0].depth;
  if (Math.abs(shift) < 0.5) return 0;

  for (let k = 0; k < ground.grid.length; k++) ground.grid[k] -= shift;
  ground.datum += shift;
  // The cached min/max belongs to the old samples.
  delete ground._range;
  // The lid is a different lid now, so anything keyed on its identity has to
  // know — the renderer caches its geometry against exactly this.
  ground.id = `${ground.id}+${Math.round(shift)}`;

  for (const st of notes.stations) st.z -= shift;
  for (const ln of notes.lines) for (const p of ln.pts) p[2] -= shift;
  for (const pt of notes.patches || []) for (const p of pt.pts) p[2] -= shift;
  for (const c of cs) c.depth += shift;
  return shift;
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
  // Hang the column before anything is built from it. See hangColumn().
  hangColumn(ground, notes, column);
  const built = columnFor(column, fieldDoc, fit.warnings);

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
      // What the student said the rock was, so the block can be asked whether
      // it agrees. Without this the column is built from the contacts alone
      // and never once checked against the unit somebody actually stood on.
      unit: s.unitName || '',
    })),
    lines: notes.lines.map((l) => ({
      id: l.id, name: l.name, kind: l.kind, certainty: l.certainty,
      unitUpper: l.unitUpper, unitLower: l.unitLower,
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
    // Shaded units, thinned again, so the live misfit can keep scoring them
    // against whatever the history says now.
    patches: notes.patches.map((p) => ({
      id: p.id, unit: p.unit,
      pts: thin(p.pts, 60).map((q) => [r1(q[0]), r1(q[1]), r1(q[2])]),
    })),
  };

  // The roof unit reaches exactly down to the shallowest contact, which
  // hangColumn() has already put at a positive depth. Anything else and the
  // geometry is right while every unit on the map is the wrong one.
  if (column.contacts.length && doc.layers.length) {
    doc.layers[0].thickness = Math.max(5, Math.round(column.contacts[0].depth));
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
      patches: notes.patches.length,
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
        patches: notes.patches.length,
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
      if (!String(ln.unitUpper || '').trim() || !String(ln.unitLower || '').trim()) lines.unnamed++;
    } else if (ln.kind === 'fault') lines.fault++;
    else lines.other++;
  }
  return { georef: g, bedding, other, lines };
}
