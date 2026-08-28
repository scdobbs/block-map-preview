// Reading a history back out of a map.
//
// The block runs a geologic history backwards to answer "what rock is at this
// point". Run that same walk over a student's own readings instead of over the
// screen and it stops being an answer and becomes a *misfit* — and a misfit is
// something that can be minimised. So there is no new geology in this file. It
// is the existing engine, pointed the other way.
//
// Two kinds of evidence, and it matters that they are independent:
//
//   the stations say which way the beds lean at a point,
//   the contacts say where one single surface goes across the map.
//
// A model can satisfy either alone and still be wrong. Dips alone cannot tell
// an anticline from the syncline half a wavelength away; contacts alone cannot
// tell a tight fold from a broad one where only part of a limb is exposed.
//
// The order the fitting happens in is not an implementation detail, it is the
// argument:
//
//   1. the stereonet decides the SHAPE of the answer, from the readings alone
//   2. the structure's numbers are fitted to those readings — which a fault
//      cannot disturb, because a fault translates a block without rotating it,
//      so both sides of one read the same attitude
//   3. each fault plane comes out of its own drawn trace against the terrain,
//      by geometry and not by search
//   4. only then is slip fitted, against contacts that cross the faults
//
// Nothing here consults the answer it is trying to find.

import { compileHistory, stratDepth, beddingAt, rockAt } from './unmake.js';
import { fitBedding, poleOf } from './stereonet.js';
import { makeEvent, makeLayer, faultKindFromRake } from './model.js';
import { surfaceHeight } from './surfaces.js';
import {
  dot, cross, sub, normalize, normalToStrikeDip, planeFrame, RAD, wrap360,
} from './math.js';
import { traceContours } from './marching.js';

/**
 * A degree of attitude and ten metres of contact position are treated as
 * equally bad. Ten metres is the DEM's own resolution, so this says: do not
 * chase a contact tighter than the ground beneath it is known.
 */
const METRES_PER_DEGREE = 10;

/** Which drawn lines are evidence about the stratigraphy, and which are faults. */
const CONTACT_KINDS = new Set(['contact', 'unconformity']);

/** A minimal document. compileHistory reads events and layers, never settings. */
function docFor(events) {
  return {
    events,
    layers: [makeLayer('sandstone', 1e6)],
    basementRockId: 'basement',
  };
}

/** Angle in degrees between two attitudes, as poles. Not folded to the acute
 * value: a bed dipping 30 north is not a bed dipping 30 south. */
function poleAngle(a, b) {
  const c = Math.min(1, Math.max(-1, dot(poleOf(a.strike, a.dip), poleOf(b.strike, b.dip))));
  return Math.acos(c) * RAD;
}

// ---------------------------------------------------------------------------
// The misfit
// ---------------------------------------------------------------------------

/**
 * How badly a candidate history contradicts the field.
 *
 * The contact term is the whole trick and is worth stating plainly: a contact
 * is a surface of constant stratigraphic depth, so the *spread* of that depth
 * along a line somebody walked IS the error, in metres, with no fitting and no
 * assumption about which units it separates. That is why the contacts can be
 * used before the column is known — and why, once a fault is in the history,
 * the same single number scores the fault's slip too: undo the fault correctly
 * and the two halves of a displaced contact come back to the same depth.
 */
export function misfit(events, obs) {
  const h = compileHistory(docFor(events));

  let angle = 0;
  let counted = 0;
  let blind = 0;
  for (const st of obs.stations || []) {
    if (!Number.isFinite(st.strike) || !Number.isFinite(st.dip)) continue;
    // A station with no usable position is a broken observation, not a place
    // where the rock has no bedding, and must not be scored as either.
    if (!Number.isFinite(st.x) || !Number.isFinite(st.y) || !Number.isFinite(st.z)) {
      blind++;
      continue;
    }
    const b = beddingAt(h, [st.x, st.y, st.z - 0.5]);
    // No bedding to read is not a free pass. Score it as a right angle, so the
    // search cannot buy a good number by burying the stations in a pluton.
    // Counted separately as well: ninety degrees is also what a data fault
    // looks like, and "your block is hopeless" and "these readings never
    // reached it" must never print the same number with no way to tell them
    // apart.
    if (b) angle += poleAngle(b, st); else { angle += 90; blind++; }
    counted++;
  }
  angle = counted ? angle / counted : 0;

  // Spread is taken across each whole surface, not each drawn line, so the two
  // halves of a faulted contact only agree when the slip is right.
  let spread = 0;
  let lines = 0;
  const groups = contactGroups(obs);
  let usable = 0;
  for (const g of groups) {
    // A point with no height cannot be asked for a depth, and one NaN would
    // otherwise carry through the mean and print the whole misfit as NaN — a
    // number that looks like a verdict and is a bug.
    const d = g.pts
      .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]))
      .map((p) => stratDepth(h, p))
      .filter(Number.isFinite);
    if (d.length < 2) continue;
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    let v = 0;
    for (const x of d) v += (x - mean) * (x - mean);
    spread += Math.sqrt(v / d.length);
    lines += g.lines.length;
    usable++;
  }
  spread = usable ? spread / usable : 0;

  return {
    angle, spread, n: counted, lines, blind,
    // Surfaces that could actually be scored, not merely drawn.
    surfaces: usable,
    total: angle + spread / METRES_PER_DEGREE,
  };
}

export function contactsOf(obs) {
  return (obs.lines || []).filter(
    (l) => l.use !== false && CONTACT_KINDS.has(l.kind) && l.pts && l.pts.length >= 2,
  );
}

/**
 * Which drawn lines are pieces of the same surface.
 *
 * This is the question a fault forces, and it is a geological question rather
 * than a bookkeeping one. A contact that a fault has cut is mapped as two
 * traces with a gap between them, and unless something says those two traces
 * are the same contact, each of them is internally consistent whatever the
 * fault did — so the offset is unconstrained and the fit will happily report a
 * confident wrong number.
 *
 * What says so is already in the notebook: the units on either side. A contact
 * with sandstone above and shale below is the sandstone–shale contact wherever
 * it crops out, on either side of any fault. So naming the two units is not
 * paperwork, it is the measurement that makes the offset solvable — which is
 * worth telling a student who has not bothered.
 *
 * A contact with no units named stands alone, because nothing has said it does
 * not.
 */
export function contactGroups(obs) {
  const groups = new Map();
  for (const ln of contactsOf(obs)) {
    const upper = String(ln.unitUpper || '').trim();
    const lower = String(ln.unitLower || '').trim();
    // Ordered, not sorted. "A over B" and "B over A" are two different
    // contacts, and on an overturned limb telling them apart is the whole
    // question — so the pair is keyed the way it was recorded.
    const key = upper && lower
      ? `pair:${upper.toLowerCase()}|${lower.toLowerCase()}`
      : `line:${ln.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key, named: !!(upper && lower), upper, lower,
        lines: [], pts: [], name: ln.name || (upper && lower ? `${upper} / ${lower}` : 'Contact'),
      });
    }
    const g = groups.get(key);
    g.lines.push(ln);
    g.pts.push(...ln.pts);
  }
  return [...groups.values()];
}

export function faultLinesOf(obs) {
  return (obs.lines || []).filter(
    (l) => l.use !== false && l.kind === 'fault' && l.pts && l.pts.length >= 2,
  );
}

// ---------------------------------------------------------------------------
// Searching
// ---------------------------------------------------------------------------

/** Coarse scan over a box. `fixed` pins any parameter already known. */
function scan(bounds, counts, score, fixed = []) {
  const axes = bounds.map((b, i) => {
    if (fixed[i] != null) return [fixed[i]];
    const n = counts[i];
    if (n <= 1) return [(b[0] + b[1]) / 2];
    return Array.from({ length: n }, (_, k) => b[0] + ((b[1] - b[0]) * k) / (n - 1));
  });
  let best = null;
  let bestV = Infinity;
  const walk = (i, acc) => {
    if (i === axes.length) {
      const v = score(acc);
      if (v < bestV) { bestV = v; best = acc.slice(); }
      return;
    }
    for (const val of axes[i]) walk(i + 1, [...acc, val]);
  };
  walk(0, []);
  return best;
}

/**
 * Coordinate descent with a shrinking step. Chosen over anything cleverer
 * because this objective has long flat valleys and several local minima, and
 * this behaves predictably in both. The coarse scan that seeds it is what
 * actually finds the right basin; this only walks to the bottom of it.
 */
function refine(x0, bounds, score, { rounds = 60 } = {}) {
  const x = x0.slice();
  let best = score(x);
  const step = bounds.map((b) => (b[1] - b[0]) / 8);
  for (let it = 0; it < rounds; it++) {
    let moved = false;
    for (let i = 0; i < x.length; i++) {
      for (const s of [step[i], -step[i]]) {
        const t = x.slice();
        t[i] = Math.min(bounds[i][1], Math.max(bounds[i][0], x[i] + s));
        if (t[i] === x[i]) continue;
        const v = score(t);
        if (v < best) { best = v; x[i] = t[i]; moved = true; }
      }
    }
    if (!moved) {
      for (let i = 0; i < step.length; i++) step[i] /= 2;
      if (step.every((s, i) => s < (bounds[i][1] - bounds[i][0]) / 4000)) break;
    }
  }
  return { x, value: best };
}

// ---------------------------------------------------------------------------
// Faults, from their traces
// ---------------------------------------------------------------------------

/**
 * A fault plane, from the line somebody walked along it.
 *
 * A fault trace on the map is the intersection of the fault plane with the
 * ground, so the traced points lie in the plane and the plane is the one that
 * best contains them — the eigenvector of the smallest eigenvalue of their
 * scatter, which is the same tool the stereonet fits a girdle with.
 *
 * The catch is honest and worth saying out loud: a fault trace that runs
 * straight across flat ground constrains no dip at all. Every plane containing
 * that line fits equally well, and the numbers will happily report one. So the
 * determinacy is tested rather than assumed, and an undetermined fault is
 * called vertical — which is the assumption a mapper makes and knows they are
 * making, rather than a fabricated dip that looks measured.
 */
export function faultFromTrace(pts) {
  const n = pts.length;
  let cx = 0, cy = 0, cz = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
  cx /= n; cy /= n; cz /= n;

  // Scatter matrix of the mean-centred points.
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) {
    const v = [p[0] - cx, p[1] - cy, p[2] - cz];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += v[i] * v[j];
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] /= n;

  const { values, vectors } = eig3(M);
  const [l1, l2, l3] = values;
  const relief = Math.max(...pts.map((p) => p[2])) - Math.min(...pts.map((p) => p[2]));

  // The plane is determined only when the points genuinely spread in two
  // directions and are genuinely flat in the third.
  const determined = l2 > 1e-9 && l3 / Math.max(1e-12, l2) < 0.02 && relief > 25;

  let strike;
  let dip;
  if (determined) {
    const sd = normalToStrikeDip(vectors[2][2] > 0 ? vectors[2] : vectors[2].map((v) => -v));
    strike = sd.strike;
    dip = sd.dip;
  } else {
    // Vertical through the trace's own direction in map view.
    const dir = normalize([vectors[0][0], vectors[0][1], 0]);
    strike = wrap360(Math.atan2(dir[0], dir[1]) * RAD);
    dip = 90;
  }

  return {
    strike, dip, determined, relief,
    centerX: cx, centerY: cy, centerZ: cz,
    flatness: l3 / Math.max(1e-12, l2),
  };
}

/** Does any contact actually cross this fault? Slip is unconstrained if not. */
function crossesFault(ev, obs) {
  const { normal } = planeFrame(ev.strike, ev.dip);
  const c = [ev.centerX, ev.centerY, ev.centerZ];
  // One surface either side of the fault, not merely two lines either side:
  // two unrelated contacts straddling a fault say nothing about its offset.
  for (const g of contactGroups(obs)) {
    let pos = false;
    let neg = false;
    for (const p of g.pts) {
      if (dot(sub(p, c), normal) > 0) pos = true; else neg = true;
      if (pos && neg) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// The fit
// ---------------------------------------------------------------------------

/**
 * Fit a history to a field area.
 *
 * @param {object} obs     { stations, lines } in block metres
 * @param {object} opts    { extent } the block's footprint, metres
 * @returns {object} { verdict, events, misfit, notes, warnings }
 */
export function inferHistory(obs, { extent = 4000 } = {}) {
  const notes = [];
  const warnings = [];
  const stations = (obs.stations || []).filter(
    (s) => Number.isFinite(s.strike) && Number.isFinite(s.dip),
  );
  const verdict = fitBedding(stations);

  // --- 1 & 2. the structure, from the readings ---------------------------
  const built = fitStructure(verdict, { ...obs, stations }, extent, notes, warnings);
  let events = built.events;

  // --- 3. the faults, from their traces ----------------------------------
  const faults = faultLinesOf(obs);
  const fitted = [];
  for (const ln of faults) {
    const plane = faultFromTrace(ln.pts);
    const ev = makeEvent('fault', {
      strike: plane.strike, dip: plane.dip,
      centerX: plane.centerX, centerY: plane.centerY, centerZ: plane.centerZ,
      slip: 0, kind: 'normal', obliquity: 0,
      name: ln.name || 'Fault',
    });
    fitted.push({ ev, plane, line: ln });
    events = events.concat([ev]);
    if (!plane.determined) {
      warnings.push(`${ln.name || 'A fault'} is drawn across ground with too little relief to give a dip — ${Math.round(plane.relief)} m along the whole trace. It is taken as vertical, which is an assumption and not a measurement.`);
    } else {
      notes.push(`${ln.name || 'Fault'}: ${Math.round(plane.strike)}/${Math.round(plane.dip)}, from where its trace crosses the topography.`);
    }
  }

  // --- 4. slip, against the contacts that cross them ----------------------
  if (fitted.length) fitSlip(fitted, events, obs, extent, notes, warnings);

  // A last joint polish of the structure with everything in place. The faults
  // are now undone correctly, so the contacts finally speak about the fold
  // rather than about the offset.
  if (built.polish && contactsOf(obs).length) built.polish(events, obs);

  const m = misfit(events, obs);

  // The fit reports how well it did; it also has to say when that is badly.
  // A block quietly 12 degrees away from every reading it was built from looks
  // exactly as convincing as one that fits, and is the single most misleading
  // thing this whole feature could produce.
  if (events.length && m.n >= 3 && m.angle > 8) {
    warnings.push(
      `This history is ${m.angle.toFixed(0)}° away from your readings on average, which is too far to call it an explanation of them — a good fit sits within a few degrees. One structure of this kind does not account for what you measured. The usual reasons are a fault between the readings, two structures overprinting, or a reading filed as bedding that is not.`,
    );
  }

  return { verdict, events, misfit: m, notes, warnings };
}

/** The structure itself: whichever of the three the net says it is. */
function fitStructure(verdict, obs, extent, notes, warnings) {
  const attitudeOnly = { stations: obs.stations, lines: [] };
  const none = { events: [], polish: null };

  if (verdict.kind === 'few') {
    warnings.push(`${verdict.n} bedding reading${verdict.n === 1 ? '' : 's'} is not enough to fit anything. Three is the minimum, and three on one limb still only give one attitude.`);
    return none;
  }

  if (verdict.kind === 'cluster') {
    notes.push('Poles cluster: one attitude across the whole area. That is a homocline, and there is no fold here to find.');
    const { strike, dip } = verdict.mean;
    const bounds = [[strike - 40, strike + 40], [Math.max(0, dip - 30), Math.min(89, dip + 30)]];
    const make = ([s, d]) => makeEvent('tilt', { strike: s, dip: d, name: 'Tilt' });
    const { x } = refine([strike, dip], bounds, (v) => misfit([make(v)], attitudeOnly).total);
    const ev = make(x);
    return {
      events: [ev],
      polish: (events, all) => {
        const { x: y } = refine([ev.strike, ev.dip], bounds,
          (v) => misfit(withFirst(events, make(v)), all).total);
        ev.strike = y[0]; ev.dip = y[1];
      },
    };
  }

  if (verdict.kind === 'conical') {
    notes.push(`Poles lie on a small circle at ${verdict.cone.angle.toFixed(0)}° — a dome or a basin, which has no hinge line at all. Fitted as a dome.`);
    const bounds = [
      [-1500, 1500], [extent * 0.15, extent * 1.25],
      [-extent / 2, extent / 2], [-extent / 2, extent / 2],
    ];
    const make = ([a, r, cx, cy]) => makeEvent('domebasin', {
      amplitude: a, radiusA: r, radiusB: r, centerX: cx, centerY: cy, name: 'Dome / basin',
    });
    const seed = scan(bounds, [7, 6, 5, 5], (v) => misfit([make(v)], attitudeOnly).total);
    const { x } = refine(seed, bounds, (v) => misfit([make(v)], attitudeOnly).total);
    const ev = make(x);
    return {
      events: [ev],
      polish: (events, all) => {
        const { x: y } = refine([ev.amplitude, ev.radiusA, ev.centerX, ev.centerY], bounds,
          (v) => misfit(withFirst(events, make(v)), all).total);
        Object.assign(ev, {
          amplitude: y[0], radiusA: y[1], radiusB: y[1], centerX: y[2], centerY: y[3],
        });
      },
    };
  }

  if (verdict.kind === 'scattered') {
    warnings.push('The poles lie on neither a great circle nor a small one, so these readings are not one structure. Look for a fault between them, or for a joint filed as bedding, before believing anything below.');
  }

  const trend = verdict.axis ? verdict.axis.trend : verdict.mean.strike;
  const plunge = verdict.axis ? verdict.axis.plunge : 0;
  if (verdict.axis) {
    notes.push(`Girdle fit gives a hinge at ${Math.round(trend)}/${Math.round(plunge)}. Trend and plunge come from the readings alone — the map is not consulted for them.`);
  }

  // Wavelength is searched in log space: the difference between 400 m and
  // 800 m matters, and the difference between 6 km and 6.4 km does not.
  const bounds = [
    [Math.log(extent * 0.15), Math.log(extent * 6)],
    [0, extent * 0.35],
    [0, 360],
    [trend - 20, trend + 20],
    [Math.max(0, plunge - 15), Math.min(80, plunge + 15)],
  ];
  const make = ([lw, a, ph, tr, pl]) => makeEvent('fold', {
    wavelength: Math.exp(lw), amplitude: a, phase: ph, trend: tr, plunge: pl, name: 'Fold',
  });
  const score = (v) => misfit([make(v)], attitudeOnly).total;
  // Trend and plunge are held at the net's answer through the coarse scan.
  // They are the one part already measured, and letting them float here only
  // buys noise.
  const seed = scan(bounds, [16, 14, 18, 1, 1], score, [null, null, null, trend, plunge]);
  const { x } = refine(seed, bounds, score);
  const ev = make(x);

  const dipMax = Math.atan((2 * Math.PI * ev.amplitude) / ev.wavelength) * RAD;
  notes.push(`Fold: wavelength ${Math.round(ev.wavelength)} m, amplitude ${Math.round(ev.amplitude)} m — limbs steepest at ${dipMax.toFixed(0)}°.`);
  if (ev.wavelength > extent * 2.5) {
    warnings.push('The fitted wavelength is far wider than the area mapped, so only part of one limb is exposed and the fold is not really constrained. Expect these numbers to move a long way when one more reading is added.');
  }

  return {
    events: [ev],
    polish: (events, all) => {
      const { x: y } = refine(
        [Math.log(ev.wavelength), ev.amplitude, ev.phase, ev.trend, ev.plunge],
        bounds, (v) => misfit(withFirst(events, make(v)), all).total,
      );
      Object.assign(ev, {
        wavelength: Math.exp(y[0]), amplitude: y[1], phase: y[2], trend: y[3], plunge: y[4],
      });
    },
  };
}

/** The same event list with its first (structural) event swapped out. */
function withFirst(events, ev) {
  return [ev, ...events.slice(1)];
}

/**
 * How far each fault moved, and in which direction.
 *
 * Slip is the one fault parameter the trace cannot give: the plane is where
 * the rock broke, and the offset is what happened afterwards. It comes from
 * the contacts instead — a contact displaced across a fault comes back to one
 * stratigraphic depth only when the slip is undone correctly, which is exactly
 * the number `misfit` already reports.
 *
 * Rake is searched rather than the kind and obliquity the model stores,
 * because rake is one continuous circle and the pair is four overlapping
 * ranges. It is converted back afterwards, which is the same conversion older
 * saved files go through.
 */
function fitSlip(fitted, events, obs, extent, notes, warnings) {
  const maxSlip = extent * 0.45;

  for (const f of fitted) {
    if (!crossesFault(f.ev, obs)) {
      f.ev.slip = 0;
      const unnamed = contactGroups(obs).filter((g) => !g.named).length;
      warnings.push(
        `No single contact is mapped on both sides of ${f.ev.name}, so nothing measures how far it moved. Its offset is left at zero — the fault is drawn, not solved.`
        + (unnamed
          ? ` ${unnamed} contact${unnamed === 1 ? ' has' : 's have'} no units named on either side, and an unnamed contact cannot be recognised as the same surface where it crops out again across the fault. Naming the units is what makes the offset solvable.`
          : ''),
      );
      continue;
    }
    const set = ([rake, slip]) => {
      const { kind, obliquity } = faultKindFromRake(rake);
      f.ev.kind = kind;
      f.ev.obliquity = obliquity;
      f.ev.slip = slip;
    };
    const score = (v) => { set(v); return misfit(events, obs).total; };
    const bounds = [[0, 360], [0, maxSlip]];
    const seed = scan(bounds, [24, 14], score);
    const { x } = refine(seed, bounds, score, { rounds: 40 });
    set(x);
    f.solved = true;
  }

  // With several faults each was scanned while the others were wherever the
  // scan left them, so walk them together once before believing any of them.
  const solved = fitted.filter((f) => f.solved);
  if (solved.length > 1) {
    const vec = solved.flatMap((f) => [faultRakeOf(f.ev), f.ev.slip]);
    const bounds = solved.flatMap(() => [[0, 360], [0, maxSlip]]);
    const set = (v) => solved.forEach((f, i) => {
      const { kind, obliquity } = faultKindFromRake(v[i * 2]);
      f.ev.kind = kind; f.ev.obliquity = obliquity; f.ev.slip = v[i * 2 + 1];
    });
    const { x } = refine(vec, bounds, (v) => { set(v); return misfit(events, obs).total; },
      { rounds: 30 });
    set(x);
  }

  for (const f of solved) {
    notes.push(`${f.ev.name}: ${Math.round(f.ev.slip)} m of slip, ${f.ev.kind}${Math.abs(f.ev.obliquity) > 8 ? ` with ${Math.round(Math.abs(f.ev.obliquity))}° of oblique` : ''}.`);
  }
}

function faultRakeOf(ev) {
  // The stored pair, back as the single number the search works in.
  const base = { normal: 90, reverse: 270, dextral: 180, sinistral: 0 }[ev.kind] ?? 90;
  const sign = { normal: 1, reverse: -1, dextral: -1, sinistral: 1 }[ev.kind] ?? 1;
  return wrap360(base + sign * (ev.obliquity || 0));
}

// ---------------------------------------------------------------------------
// Stratigraphy
// ---------------------------------------------------------------------------

/**
 * Once the structure is known, the column falls out of the contacts for free.
 *
 * A contact sits at a constant stratigraphic depth; two contacts differ by the
 * thickness of everything between them. So the thicknesses are never measured
 * with a tape — they are read off the map, which is exactly what a student is
 * otherwise asked to do by hand off a structure section.
 */
export function columnFrom(events, obs) {
  const h = compileHistory(docFor(events));
  const seen = [];
  for (const g of contactGroups(obs)) {
    const d = g.pts.map((p) => stratDepth(h, p));
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    let v = 0;
    for (const x of d) v += (x - mean) * (x - mean);
    // One entry per surface. A contact mapped in three pieces is one contact
    // and must contribute one thickness, not three.
    seen.push({
      id: g.key, name: g.name, depth: mean, sd: Math.sqrt(v / d.length),
      pieces: g.lines.length, named: g.named,
      upper: g.upper || '', lower: g.lower || '',
    });
  }
  // Shallowest depth is the youngest contact: the top of the column.
  seen.sort((a, b) => a.depth - b.depth);
  const units = [];
  for (let i = 0; i < seen.length - 1; i++) {
    units.push({
      top: seen[i], base: seen[i + 1],
      thickness: seen[i + 1].depth - seen[i].depth,
    });
  }
  return { contacts: seen, units };
}

/**
 * Does the block agree with the unit the student wrote down?
 *
 * The column is built from the contacts, and the contacts alone say only how
 * far apart the surfaces are — nothing in that chain ever consults the unit
 * somebody named while standing on the outcrop. So this asks the block, at
 * every station that carries a unit name, which unit it thinks crops out
 * there, and counts the agreements.
 *
 * It is a check and never a correction. A disagreement can mean the column is
 * hung wrong, or that a station was logged in the wrong unit, and only the
 * person who walked it can say which.
 */
export function unitCheck(doc) {
  const survey = doc.survey;
  if (!survey || !doc.layers) return null;
  const named = (survey.stations || []).filter((s) => String(s.unit || '').trim());
  if (!named.length) return null;

  const h = compileHistory({
    events: doc.events,
    layers: doc.layers,
    basementRockId: doc.basementRockId,
  });
  const norm = (v) => String(v || '').trim().toLowerCase();

  const rows = [];
  let agree = 0;
  for (const s of named) {
    const r = rockAt(h, [s.x, s.y, s.z - 0.5]);
    const says = r.kind === 'layer' ? (doc.layers[r.index] || {}).name || '' : r.kind;
    const ok = norm(says) === norm(s.unit);
    if (ok) agree++;
    rows.push({ id: s.id, name: s.name, mapped: s.unit, block: says, ok });
  }
  return { n: named.length, agree, rows };
}

// ---------------------------------------------------------------------------
// The map the model predicts
// ---------------------------------------------------------------------------

/**
 * Where the model says each contact crops out, as polylines in block metres.
 *
 * This is the falsifiable half of the whole feature. A block that merely looks
 * plausible has told the student nothing; a block that draws its own geologic
 * map next to the one they walked has made a claim they can check step by step,
 * and the places the two lines part company are the places to go back to.
 */
export function predictedTraces(events, ground, depths, res = 161) {
  const { width: W, depth: D } = ground;
  const grid = new Float32Array(res * res);
  const h = compileHistory(docFor(events));
  for (let j = 0; j < res; j++) {
    const y = -D / 2 + (j / (res - 1)) * D;
    for (let i = 0; i < res; i++) {
      const x = -W / 2 + (i / (res - 1)) * W;
      grid[j * res + i] = stratDepth(h, [x, y, surfaceHeight(ground, x, y)]);
    }
  }
  const out = [];
  for (const { level, seg } of traceContours(grid, res, res, depths)) {
    for (const run of chainSegments(seg)) {
      if (run.length < 3) continue;
      out.push({
        level,
        pts: run.map(([gx, gy]) => [
          -W / 2 + (gx / (res - 1)) * W,
          -D / 2 + (gy / (res - 1)) * D,
        ]),
      });
    }
  }
  return out;
}

/**
 * Marching squares emits its segments in raster order, not along the line, so
 * they have to be chained before anything can be drawn or walked as a trace.
 * Adjacent cells compute their shared endpoint from the same two samples at the
 * same level, so the coordinates match exactly and the join is a lookup rather
 * than a nearest-neighbour search.
 */
export function chainSegments(seg) {
  const K = (x, y) => `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`;
  const n = seg.length / 4;
  const at = new Map();
  for (let i = 0; i < n; i++) {
    for (const k of [K(seg[i * 4], seg[i * 4 + 1]), K(seg[i * 4 + 2], seg[i * 4 + 3])]) {
      if (!at.has(k)) at.set(k, []);
      at.get(k).push(i);
    }
  }
  const used = new Uint8Array(n);
  const runs = [];
  for (let s = 0; s < n; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const pts = [[seg[s * 4], seg[s * 4 + 1]], [seg[s * 4 + 2], seg[s * 4 + 3]]];
    for (const fromHead of [false, true]) {
      for (;;) {
        const p = fromHead ? pts[0] : pts[pts.length - 1];
        const next = (at.get(K(p[0], p[1])) || []).find((c) => !used[c]);
        if (next == null) break;
        used[next] = 1;
        const a = [seg[next * 4], seg[next * 4 + 1]];
        const b = [seg[next * 4 + 2], seg[next * 4 + 3]];
        const other = K(a[0], a[1]) === K(p[0], p[1]) ? b : a;
        if (fromHead) pts.unshift(other); else pts.push(other);
      }
    }
    runs.push(pts);
  }
  return runs;
}

// ---------------------------------------------------------------------------

/**
 * Eigen-decomposition of a symmetric 3x3, largest first. The stereonet has one
 * of these for the orientation tensor; this one takes a plain array so a
 * scatter matrix of points can use it too.
 */
function eig3(M) {
  // Jacobi rotations. Three by three and symmetric, so this converges in a
  // handful of sweeps and needs no library.
  const a = [M[0].slice(), M[1].slice(), M[2].slice()];
  let V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 24; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q];
    if (off < 1e-24) break;
    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-30) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const idx = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  return {
    values: idx.map((i) => a[i][i]),
    vectors: idx.map((i) => normalize([V[0][i], V[1][i], V[2][i]])),
  };
}
