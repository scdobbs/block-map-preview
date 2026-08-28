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
//   3. each fault plane comes from the mapper's own measurement of it, or
//      failing that from its drawn trace against the terrain, by geometry and
//      not by search
//   4. only then is slip fitted, against contacts that cross the faults, the
//      units mapped either side, and any slickenlines measured on the plane
//
// Nothing here consults the answer it is trying to find.
//
// Step 3 and step 4 are where this file is most likely to have nothing to say,
// and it is important that it says so. A fault trace is the intersection of
// the fault plane with the ground: across ground with relief it gives the dip,
// and across flat ground it gives nothing at all — every plane through that
// line fits it equally well. The offset is worse still. The plane is where the
// rock broke and the slip is what happened afterwards, so no amount of staring
// at the trace will produce it; it has to come from something displaced. When
// neither is available the honest output is a vertical fault with no offset
// and a warning saying as much, which is why those are written out rather than
// papered over with a fitted number that would look exactly as confident.

import { compileHistory, stratDepth, beddingAt, rockAt } from './unmake.js';
import { fitBedding, poleOf } from './stereonet.js';
import { makeEvent, makeLayer, faultKindFromRake } from './model.js';
import { surfaceHeight } from './surfaces.js';
import {
  dot, cross, sub, add, scale, normalize, normalToStrikeDip, planeFrame,
  azimuthVec, clamp, RAD, DEG, wrap360,
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
    const d = evidencePts(g, events)
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

  // Shaded units say something the contacts cannot: not where a surface runs,
  // but what crops out over a whole area. A unit lies between the two contacts
  // that bound it, so every point inside its patch must have a stratigraphic
  // depth inside that interval — which pins where the column sits, rather than
  // leaving it to be inferred from a handful of contact depths.
  let area = 0;
  let patches = 0;
  const bounds = unitBounds(h, obs, events);
  for (const p of obs.patches || []) {
    const b = bounds.get(String(p.unit || '').trim().toLowerCase());
    if (!b || !p.pts || !p.pts.length) continue;
    let out = 0;
    for (const q of p.pts) {
      const d = stratDepth(h, q);
      if (!Number.isFinite(d)) continue;
      // Zero anywhere inside the unit. Only being outside it costs, and by how
      // far outside — a point one metre past a contact is nearly right.
      out += Math.max(0, b.top - d, d - b.base);
    }
    area += out / p.pts.length;
    patches++;
  }
  area = patches ? area / patches : 0;

  return {
    angle, spread, n: counted, lines, blind, area, patches,
    // Surfaces that could actually be scored, not merely drawn.
    surfaces: usable,
    total: angle + (spread + area) / METRES_PER_DEGREE,
  };
}

/**
 * The depth interval each named unit occupies, for one candidate history.
 *
 * Read off the contacts: the shallowest contact naming a unit as its lower
 * side is that unit's top, and the deepest naming it as its upper side is its
 * base. A unit with only one of those is open-ended on the other side, which
 * is the honest answer for the youngest and oldest units on any map — nothing
 * mapped says how far they go.
 */
function unitBounds(h, obs, events) {
  const out = new Map();
  const at = [];
  for (const g of contactGroups(obs)) {
    if (!g.named) continue;
    const d = evidencePts(g, events)
      .filter((p) => Number.isFinite(p[2]))
      .map((p) => stratDepth(h, p))
      .filter(Number.isFinite);
    if (!d.length) continue;
    at.push({ depth: d.reduce((a, b) => a + b, 0) / d.length, upper: g.upper, lower: g.lower });
  }
  for (const c of at) {
    for (const [name, side] of [[c.lower, 'top'], [c.upper, 'base']]) {
      const key = String(name || '').trim().toLowerCase();
      if (!key) continue;
      if (!out.has(key)) out.set(key, { top: -Infinity, base: Infinity });
      const b = out.get(key);
      // A unit's top is the shallowest contact that puts it underneath;
      // its base is the deepest contact that puts it on top.
      if (side === 'top') b.top = Math.max(b.top, c.depth);
      else b.base = Math.min(b.base, c.depth);
    }
  }
  // Open-ended sides cost nothing rather than everything.
  for (const b of out.values()) {
    if (!Number.isFinite(b.top)) b.top = -Infinity;
    if (!Number.isFinite(b.base)) b.base = Infinity;
  }
  return out;
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
/**
 * The points of one contact that are actually evidence, given the faults.
 *
 * A contact drawn up to a fault and a metre or two past it has points in both
 * blocks, and the contact term asks every point of one surface to come back to
 * the same stratigraphic depth. So those two stray points quietly forbid the
 * fault from having moved at all: any slip drags them tens of metres away from
 * the fifteen points they were drawn with, and the spread that costs is far
 * larger than anything the offset can win back. The fault is then reported as
 * having barely moved, on the authority of the end of somebody's pencil line.
 *
 * A minority that small is not the contact found again on the other side. It
 * is where the drawing stopped, inside the width of the fault itself. So it is
 * dropped — and only it: a contact genuinely mapped in both blocks keeps every
 * point, because there the two halves coming back together IS the measurement
 * of the throw and the whole reason the contact term can score a fault at all.
 */
function evidencePts(g, events) {
  let pts = g.pts;
  for (const ev of events || []) {
    if (ev.type !== 'fault' || ev.enabled === false) continue;
    if (!Number.isFinite(ev.strike) || !Number.isFinite(ev.dip)) continue;
    const { normal } = planeFrame(ev.strike, ev.dip);
    const c = [ev.centerX, ev.centerY, ev.centerZ];
    const pos = [];
    const neg = [];
    for (const p of pts) (dot(sub(p, c), normal) > 0 ? pos : neg).push(p);
    if (!pos.length || !neg.length) continue;
    const lesser = Math.min(pos.length, neg.length);
    // The same test that decides whether this fault's slip is measurable at
    // all, applied to the same points, so the two can never disagree.
    if (lesser >= 3 && lesser >= pts.length * 0.15) continue;
    pts = pos.length >= neg.length ? pos : neg;
  }
  return pts;
}

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
 *
 * `given` is what the mapper said about the plane, and it outranks both of
 * those. A dip measured on the outcrop, or read off the way the trace crosses
 * the contours, is an observation; a plane fitted to a trace is an inference
 * from one. Where the two disagree the caller is told, because that
 * disagreement is a real result — the trace and the exposure are describing
 * the same surface, and if they part company by twenty degrees one of them is
 * in the wrong place.
 *
 * The strike follows the right-hand rule, so a plane that dips toward some
 * azimuth strikes ninety degrees anticlockwise of it. That is why `given`
 * carries a dip direction rather than a strike: the trace already fixes the
 * line, and the only thing left for anyone to say is which side it leans to.
 */
export function faultFromTrace(pts, given = null) {
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

  // What the trace alone would say, kept even when it is overruled: the
  // caller compares it with the measurement to see whether the two agree.
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
  const traceStrike = strike;
  const traceDip = dip;

  // 'measured' the mapper's own, 'trace' fitted to the topography, 'assumed'
  // vertical because nothing said otherwise. Reported rather than inferred
  // from the numbers, because a measured 90 and an assumed one are the same
  // two digits and completely different claims.
  let source = determined ? 'trace' : 'assumed';
  if (given && Number.isFinite(given.dip)) {
    dip = clamp(given.dip, 0, 90);
    if (Number.isFinite(given.strike)) {
      // A plane read on the outcrop is a whole measurement — strike and dip
      // both — and it is taken whole. It is the only evidence here that came
      // off the fault surface rather than off a line drawn near it.
      strike = wrap360(given.strike);
    } else if (Number.isFinite(given.dipDir)) {
      // A direction picked on the line editor is not a measured azimuth. It is
      // a choice between the two sides of the trace, and the trace is what
      // fixes the strike. Deriving the strike from the stored azimuth instead
      // would freeze it at whatever the line looked like when the choice was
      // made, so dragging a point afterwards would move the trace and leave
      // the fault plane behind it.
      const traceAz = wrap360(traceStrike + 90);
      const flipped = Math.abs(((given.dipDir - traceAz + 540) % 360) - 180) > 90;
      strike = flipped ? wrap360(traceStrike + 180) : traceStrike;
    } else {
      // Vertical: no side to choose, so it keeps the trace's own line.
      strike = traceStrike;
    }
    source = 'measured';
  }

  return {
    strike, dip, determined, relief, source,
    traceStrike, traceDip,
    centerX: cx, centerY: cy, centerZ: cz,
    flatness: l3 / Math.max(1e-12, l2),
  };
}

// ---------------------------------------------------------------------------
// What was measured on the fault itself
// ---------------------------------------------------------------------------

/** A line in space from trend and plunge, pointing down-plunge. */
function trendPlungeVec(trend, plunge) {
  const t = trend * DEG, p = plunge * DEG;
  return [Math.sin(t) * Math.cos(p), Math.cos(t) * Math.cos(p), -Math.sin(p)];
}

/** Distance in map view from a point to a segment. */
function segDist2D(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const wx = p[0] - a[0], wy = p[1] - a[1];
  const len = vx * vx + vy * vy;
  const t = len > 0 ? Math.min(1, Math.max(0, (wx * vx + wy * vy) / len)) : 0;
  return Math.hypot(wx - t * vx, wy - t * vy);
}

function distToTrace(p, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, segDist2D(p, pts[i - 1], pts[i]));
  return best;
}

/**
 * Hand every fault-plane reading and slickenline to the fault it was taken on.
 *
 * Nearest trace wins, and only within reach of one — a reading taken half a
 * map away from any fault is not evidence about that fault, and quietly
 * averaging it in would be worse than having no reading at all. With one fault
 * on the map this is a formality; with two it is the whole question, and it is
 * the kind of thing that is silently wrong for years if it is done by index.
 */
function assignFaultObs(faults, obs, extent) {
  const reach = Math.max(60, extent * 0.12);
  const byLine = new Map(faults.map((ln) => [ln.id, { planes: [], lines: [] }]));
  for (const o of obs.faultObs || []) {
    if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
    let best = null;
    let bestD = Infinity;
    for (const ln of faults) {
      const d = distToTrace([o.x, o.y], ln.pts);
      if (d < bestD) { bestD = d; best = ln; }
    }
    if (!best || bestD > reach) continue;
    const bucket = byLine.get(best.id);
    if (o.feature === 'slickenline') {
      if (Number.isFinite(o.trend) && Number.isFinite(o.plunge)) bucket.lines.push(o);
    } else if (Number.isFinite(o.strike) && Number.isFinite(o.dip)) {
      bucket.planes.push(o);
    }
  }
  return byLine;
}

/**
 * The mean of several plane readings, as vectors rather than as numbers.
 *
 * Averaging strikes arithmetically is the classic way to turn 355 and 005 into
 * 180, so the poles are summed instead, each flipped to the same hemisphere
 * first — a plane and the same plane read from the other side are one
 * measurement, not two opposite ones.
 */
function meanPlane(planes) {
  if (!planes.length) return null;
  let acc = [0, 0, 0];
  for (const p of planes) {
    let n = poleOf(p.strike, p.dip);
    if (acc[0] || acc[1] || acc[2]) { if (dot(acc, n) < 0) n = scale(n, -1); }
    acc = add(acc, n);
  }
  const n = normalize(acc);
  const sd = normalToStrikeDip(n[2] < 0 ? scale(n, -1) : n);
  // Scatter about the mean, so a set of readings that disagree with each other
  // cannot pass itself off as one confident number.
  let spread = 0;
  for (const p of planes) {
    const c = Math.min(1, Math.abs(dot(poleOf(p.strike, p.dip), n)));
    spread += Math.acos(c) * RAD;
  }
  return { strike: sd.strike, dip: sd.dip, n: planes.length, spread: spread / planes.length };
}

/**
 * Rake of a measured lineation in a fault plane.
 *
 * Measured from the strike direction toward down-dip, which is the convention
 * `slipVec` reads and the one the model stores. The lineation is projected
 * into the plane first: slickenlines are measured on a rough surface with a
 * phone laid on it, and they never land exactly in the plane that was fitted
 * to the trace.
 *
 * What comes back is a line, not a direction. Striae say which way the rock
 * slid and not which way it went, so the rake is only ever known to within a
 * half turn — the sense is what settles it, and that has to be observed.
 */
function rakeOf(strike, dip, trend, plunge) {
  const { strikeVec, dipVec, normal } = planeFrame(strike, dip);
  const raw = trendPlungeVec(trend, plunge);
  const inPlane = sub(raw, scale(normal, dot(raw, normal)));
  if (Math.hypot(...inPlane) < 1e-9) return null;
  const v = normalize(inPlane);
  return wrap360(Math.atan2(dot(v, dipVec), dot(v, strikeVec)) * RAD);
}

/**
 * The window of rakes a declared sense allows.
 *
 * The same four quadrants `faultKindFromRake` reads the pair back out of, so a
 * search constrained to one of these can only ever report the sense that was
 * asked for. Sinistral straddles zero and is given as a range through it; the
 * search wraps every rake before use.
 *
 * Held a degree inside each boundary on purpose. A rake of exactly 225 is the
 * corner where reverse meets dextral, and which of the two comes back out is
 * decided by the last bit of a sine against a cosine — so a search allowed to
 * sit on the corner can be asked for a thrust and report a strike-slip fault.
 * A degree of inset costs nothing: 44 degrees of obliquity is already as
 * oblique as a fault of one sense gets.
 */
const SENSE_RAKE = {
  normal: [46, 134],
  reverse: [226, 314],
  dextral: [136, 224],
  sinistral: [-44, 44],
};

/**
 * Is any one contact really mapped on both sides of this fault?
 *
 * One surface either side, not merely two lines either side: two unrelated
 * contacts straddling a fault say nothing about its offset. That much was
 * always the test. What it missed is that a contact drawn right up to the
 * fault and a metre past it has points on both sides and measures nothing —
 * the far side is the end of the trace poking over the line, not the contact
 * found again in the other block. Treated as a crossing it hands the slip
 * search a target made of two or three points, which it will duly fit, and the
 * fault comes back with a confident offset of about a metre.
 *
 * So a side has to be mapped rather than merely touched: several points, and a
 * real share of the surface. Where that fails but a trace does straggle across
 * the line, the caller is told which of the two happened, because "you never
 * found this contact again" and "you stopped drawing it at the fault" are
 * different things to go and fix.
 */
function crossesFault(ev, obs) {
  const { normal } = planeFrame(ev.strike, ev.dip);
  const c = [ev.centerX, ev.centerY, ev.centerZ];
  let grazed = false;
  for (const g of contactGroups(obs)) {
    let pos = 0;
    let neg = 0;
    for (const p of g.pts) { if (dot(sub(p, c), normal) > 0) pos++; else neg++; }
    const lesser = Math.min(pos, neg);
    if (!lesser) continue;
    if (lesser >= 3 && lesser >= (pos + neg) * 0.15) return { crosses: true, grazed: false };
    grazed = true;
  }
  return { crosses: false, grazed };
}

/**
 * How badly a candidate slip contradicts the units mapped either side of a
 * fault.
 *
 * This is the thing a thrust needs and the contacts cannot supply. A fault
 * that carries older rock over younger repeats section, and repeated section
 * is only visible to the contact term if the student has mapped the same
 * contact twice — once in each block. Nobody always does. But almost everybody
 * writes down what the rock is on each side of a fault, and that is the same
 * evidence: unit 5 against the Campito across the plane is a statement about
 * the stratigraphic separation, measured in the units of the column, and it
 * has a sign. Younger-on-older and older-on-younger are the difference between
 * a normal fault and a thrust.
 *
 * Scored in metres, like the contact term, so it can be added to the same
 * total: how far outside its own depth interval the block puts each side.
 *
 * The hanging wall is the side the plane dips toward — for any dip under
 * ninety the plane's normal points into it, so the block above the fault is
 * the one that crops out on the down-dip side of the trace. A fault with no
 * dip direction has no hanging wall to name and is skipped rather than
 * guessed at.
 */
function juxtaposition(events, obs, faults, extent) {
  // A vertical fault has no hanging wall, so there is nothing for the two
  // names to be attached to; the plane has to lean before "above the fault"
  // means anything. Where it does lean it does not matter whether the dip was
  // measured or read off the topography — either way the down-dip side is the
  // hanging wall.
  const wanted = faults.filter((f) => f.line && f.plane.dip < 89
    && String(f.line.unitUpper || '').trim() && String(f.line.unitLower || '').trim());
  if (!wanted.length) return 0;

  const h = compileHistory(docFor(events));
  const bounds = unitBounds(h, obs, events);
  const off = Math.max(15, extent * 0.02);

  let cost = 0;
  let counted = 0;
  for (const f of wanted) {
    // Step off the trace along the dip azimuth: one way is the hanging wall,
    // the other the footwall, and which is which is what the dip direction
    // was recorded for.
    const az = azimuthVec(f.plane.strike + 90);
    const pairs = [
      [String(f.line.unitUpper).trim().toLowerCase(), 1],
      [String(f.line.unitLower).trim().toLowerCase(), -1],
    ];
    for (const [name, side] of pairs) {
      const b = bounds.get(name);
      // A unit the contacts never bounded has no interval to be outside of.
      if (!b) continue;
      for (const p of f.line.pts) {
        if (!Number.isFinite(p[2])) continue;
        for (const k of [1, 2]) {
          const q = add(p, scale(az, side * off * k));
          const d = stratDepth(h, q);
          if (!Number.isFinite(d)) continue;
          cost += Math.max(0, b.top - d, d - b.base);
          counted++;
        }
      }
    }
  }
  return counted ? cost / counted : 0;
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
export function inferHistory(obs, { extent = 4000, localFolds = false } = {}) {
  const notes = [];
  const warnings = [];
  const stations = (obs.stations || []).filter(
    (s) => Number.isFinite(s.strike) && Number.isFinite(s.dip),
  );
  const verdict = fitBedding(stations);

  // --- 1 & 2. the structure, from the readings ---------------------------
  const built = fitStructure(verdict, { ...obs, stations }, extent, notes, warnings,
    { localFolds });
  let events = built.events;

  // --- 3. the faults, from what was measured on them ----------------------
  const faults = faultLinesOf(obs);
  const measured = assignFaultObs(faults, obs, extent);
  const fitted = [];
  for (const ln of faults) {
    const seen = measured.get(ln.id) || { planes: [], lines: [] };
    const label = ln.name || 'Fault';

    // A plane measured at an exposure outranks both the trace and anything the
    // mapper typed, being the only one of the three that was read off the
    // fault itself.
    // Two different kinds of claim, and faultFromTrace is told which: a plane
    // read on the outcrop carries its own strike, while the line editor gives
    // a dip and which side of the trace it leans to.
    const onOutcrop = meanPlane(seen.planes);
    const given = onOutcrop
      ? { dip: onOutcrop.dip, strike: onOutcrop.strike }
      : (Number.isFinite(ln.dip) ? { dip: ln.dip, dipDir: ln.dipDir } : null);
    const plane = faultFromTrace(ln.pts, given);

    // The sense is an OBSERVATION and goes on the event from the start, not a
    // conclusion the slip search is allowed to hand back. A fault whose throw
    // nothing measures is a fault of known sense and unknown offset, and it
    // must not come back reported as the opposite of what somebody watched
    // in the field. The ids in FAULT_SENSES are the model's own kinds, so a
    // declared sense is passed straight through; obliquity zero makes it the
    // pure form of that sense, which is what "thrust" on its own means.
    const ev = makeEvent('fault', {
      strike: plane.strike, dip: plane.dip,
      centerX: plane.centerX, centerY: plane.centerY, centerZ: plane.centerZ,
      slip: 0, kind: SENSE_RAKE[ln.sense] ? ln.sense : 'normal', obliquity: 0,
      name: label,
    });
    fitted.push({ ev, plane, line: ln, seen, onOutcrop });
    events = events.concat([ev]);

    // Where the plane came from, said in the terms it came from. A dip is a
    // different claim depending on whether somebody stood on the surface, read
    // it off the contours, or gave up.
    if (plane.source === 'measured') {
      notes.push(onOutcrop
        ? `${label}: ${Math.round(plane.strike)}/${Math.round(plane.dip)}, from ${onOutcrop.n} reading${onOutcrop.n === 1 ? '' : 's'} taken on the fault surface itself.`
        : `${label}: ${Math.round(plane.strike)}/${Math.round(plane.dip)}, as you measured it. The trace was not asked.`);
      if (onOutcrop && onOutcrop.n > 1 && onOutcrop.spread > 12) {
        warnings.push(`The ${onOutcrop.n} readings on ${label} disagree with each other by ${Math.round(onOutcrop.spread)}° on average. Either the surface is not planar or one of them is off it; the mean is used, and it is worth less than the number suggests.`);
      }
      // The trace is independent evidence about the same surface, so when it
      // had something to say it is worth holding the two against each other.
      if (plane.determined) {
        const off = Math.abs(plane.dip - plane.traceDip);
        if (off > 15) {
          warnings.push(`${label} was measured at ${Math.round(plane.dip)}° but its trace across the topography implies ${Math.round(plane.traceDip)}° — ${Math.round(off)}° apart. They are the same surface, so one of them is in the wrong place: check where the trace is drawn against where the exposure is.`);
        } else {
          notes.push(`Its trace across the topography independently implies ${Math.round(plane.traceDip)}°, which agrees.`);
        }
      }
    } else if (plane.determined) {
      notes.push(`${label}: ${Math.round(plane.strike)}/${Math.round(plane.dip)}, from where its trace crosses the topography.`);
    } else {
      warnings.push(`${label} is drawn across ground with too little relief to give a dip — ${Math.round(plane.relief)} m along the whole trace. It is taken as vertical, which is an assumption and not a measurement. Measure the plane at an exposure, or set its dip on the line itself, and the fit will use that instead.`);
    }
  }

  // --- 4. slip, against everything that measures it -----------------------
  if (fitted.length) fitSlip(fitted, events, obs, extent, notes, warnings);

  // A last joint polish of the structure with everything in place. The faults
  // are now undone correctly, so the contacts finally speak about the fold
  // rather than about the offset.
  //
  // Twice, alternating with the slip, because the two are coupled and the
  // header's claim that they are not is only half true. A fault translates
  // without rotating, so the beds it carries keep their attitude — but the
  // attitude you SEE at a station is the fold's attitude at wherever that rock
  // came from, and sliding the hanging wall changes that. So the offset was
  // just fitted against a fold that was fitted assuming no offset. One pass
  // back and forth lets each answer for the other.
  if (built.polish && contactsOf(obs).length) {
    built.polish(events, obs);
    if (fitted.length) {
      // Quiet: this pass exists to move the numbers, and reportSlip below is
      // what describes wherever they came to rest.
      fitSlip(fitted, events, obs, extent, [], []);
      built.polish(events, obs);
    }
  }
  if (fitted.length) reportSlip(fitted, events, obs, extent, notes, warnings);

  // How far the fold was allowed to reach, said after it stopped moving.
  if (built.reachSeed) {
    const fold = events.find((e) => e.type === 'fold');
    if (fold) {
      notes.push(fold.reachAlong
        ? `Fold fades out ${Math.round(fold.reachAlong)} m along its axis — seeded from the ${Math.round(built.reachSeed)} m your mapping spans in that direction, then fitted from there. Beyond it the block carries no fold, because nothing you measured says it should.`
        : 'Asked how far the fold reaches, the fit answered "further than this block", so it is left running to every edge after all.');
    }
  }

  // Do the two sides of a fault even describe the same structure?
  if (fitted.length) domainsAcross(fitted, stations, verdict, notes, warnings);

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

/**
 * Are the readings either side of a fault two structures or one?
 *
 * This is the question a thrust makes unavoidable and nothing else in the fit
 * asks. Everything above builds ONE structure and then slides a piece of it
 * along a plane, which is the right model for a fault that cuts a fold — and
 * the wrong one for a fault that carries a differently folded sheet in over
 * the top of another. In the second case no offset exists that will make the
 * block explain both sets of readings, because the readings are not describing
 * one structure to begin with, and every number the fit reports about that
 * fault will be a number fitted to a contradiction.
 *
 * The test is the stereonet again, run twice: once on each side of the plane.
 * When the whole set is a mess and each half is clean, that is not a fault in
 * the data — it is the fault on the map, and the block is being asked for
 * something it cannot represent. Which is worth knowing before spending an
 * afternoon adjusting a fold to fit readings from the other side of a thrust.
 */
function domainsAcross(fitted, stations, verdict, notes, warnings) {
  for (const f of fitted) {
    const { normal } = planeFrame(f.ev.strike, f.ev.dip);
    const c = [f.ev.centerX, f.ev.centerY, f.ev.centerZ];
    const near = [];
    const far = [];
    for (const st of stations) {
      if (!Number.isFinite(st.x) || !Number.isFinite(st.y) || !Number.isFinite(st.z)) continue;
      (dot(sub([st.x, st.y, st.z], c), normal) > 0 ? near : far).push(st);
    }
    // Three a side is the minimum anything can be fitted to. It is also thin:
    // three poles lie exactly on SOME great circle whatever they are, so a
    // girdle from three readings is arithmetic rather than evidence. The count
    // is quoted in every sentence below and a thin side is called out, because
    // the reader has to be able to weigh this rather than take it.
    if (near.length < 3 || far.length < 3) continue;
    const thin = Math.min(near.length, far.length) < 5;

    const a = fitBedding(near);
    const b = fitBedding(far);
    const side = f.plane.dip < 89 ? ['the hanging wall', 'the footwall'] : ['one side', 'the other'];
    const say = (fit, n) => (fit.kind === 'girdle'
      ? `a fold about ${Math.round(fit.axis.trend)}/${Math.round(fit.axis.plunge)}`
      : fit.kind === 'cluster'
        ? `one attitude, ${Math.round(fit.mean.strike)}/${Math.round(fit.mean.dip)}`
        : fit.kind === 'conical' ? 'a dome or a basin' : 'no single structure')
      + ` from ${n} readings`;

    const bothClean = a.kind !== 'scattered' && b.kind !== 'scattered';
    const apart = a.kind === 'girdle' && b.kind === 'girdle'
      ? angleBetweenAxes(a.axis, b.axis) : null;
    const differ = bothClean && (a.kind !== b.kind || (apart != null && apart > 20));

    if (verdict.kind === 'scattered' && bothClean) {
      warnings.push(
        `Split at ${f.ev.name}, your readings are two clean structures: ${say(a, near.length)} on ${side[0]}, ${say(b, far.length)} on ${side[1]}`
        + (apart != null ? `, ${Math.round(apart)}° apart` : '')
        + '. Together they fit nothing, which is why the stereonet called them scattered. That is the fault doing its job — it has brought two differently deformed pieces of crust together — but this block is one structure with a piece of it slid along a plane, so it cannot hold both. No offset will make it fit. Model one side of the fault at a time, or read the block as the footwall with the sheet on top left out.'
        + (thin ? ` Worth checking before you act on it: one side has only ${Math.min(near.length, far.length)} readings, and that few can be made to look organised whether they are or not.` : ''),
      );
    } else if (differ) {
      notes.push(`Either side of ${f.ev.name} the readings describe ${say(a, near.length)} and ${say(b, far.length)}${apart != null ? `, ${Math.round(apart)}° apart` : ''}. The fault separates two structural domains, and one fold is being asked to serve both.`);
    }
  }
}

/** Angle between two lines, so a hinge and its opposite count as the same. */
function angleBetweenAxes(a, b) {
  const v = (t) => [
    Math.sin(t.trend * DEG) * Math.cos(t.plunge * DEG),
    Math.cos(t.trend * DEG) * Math.cos(t.plunge * DEG),
    -Math.sin(t.plunge * DEG),
  ];
  return Math.acos(Math.min(1, Math.abs(dot(v(a), v(b))))) * RAD;
}

/** The structure itself: whichever of the three the net says it is. */
/**
 * How far the mapping actually reaches, measured along the fold's own axis.
 *
 * This is the honest seed for a fold's reach, and it is worth saying why it is
 * measured along the axis and not across it.
 *
 * ALONG the axis a cylindrical fold is constant — the same crest, the same
 * trough, all the way to the ends of the earth. Nothing in a set of readings
 * argues for that constancy beyond the last reading, so carrying it there at
 * full amplitude is an assertion, not a finding. Fading it at the edge of the
 * evidence removes only the part nobody measured.
 *
 * ACROSS the axis is where the wave lives, and fading it there does not remove
 * an assertion, it removes the fold. Tried on the notebook this was built
 * against, every value of a cross-axis reach made the fit worse than no reach
 * at all — so only the along-axis one is ever seeded, and the other is left
 * for a person to set deliberately if they have a reason to.
 */
function evidenceReach(obs, trend) {
  const az = azimuthVec(trend);
  const along = [];
  for (const s of obs.stations || []) {
    if (Number.isFinite(s.x) && Number.isFinite(s.y)) along.push(s.x * az[0] + s.y * az[1]);
  }
  for (const l of contactsOf(obs)) {
    for (const p of l.pts) along.push(p[0] * az[0] + p[1] * az[1]);
  }
  if (along.length < 4) return null;
  // Half the span, not the furthest point: a fold centred on the block should
  // reach as far as the mapping does on either side of it, and one stray
  // station on the far edge is not a mandate to extend the structure to it.
  return (Math.max(...along) - Math.min(...along)) / 2;
}

function fitStructure(verdict, obs, extent, notes, warnings, { localFolds = false } = {}) {
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

  // --- how far it reaches, when that was asked for -------------------------
  // Seeded rather than searched from nothing. A free reach has a degenerate
  // direction — shrink it and the fold switches off, which "explains" any
  // scatter — so it starts where the evidence stops and is only refined from
  // there, inside bounds that cannot collapse it.
  let reach = null;
  if (localFolds) {
    const seed = evidenceReach(obs, ev.trend);
    if (seed && seed > extent * 0.05) {
      reach = { seed, bounds: [seed * 0.6, Math.max(extent, seed * 2.2)] };
      ev.reachAlong = seed;
    }
  }

  const dipMax = Math.atan((2 * Math.PI * ev.amplitude) / ev.wavelength) * RAD;
  notes.push(`Fold: wavelength ${Math.round(ev.wavelength)} m, amplitude ${Math.round(ev.amplitude)} m — limbs steepest at ${dipMax.toFixed(0)}°.`);
  if (ev.wavelength > extent * 2.5) {
    warnings.push('The fitted wavelength is far wider than the area mapped, so only part of one limb is exposed and the fold is not really constrained. Expect these numbers to move a long way when one more reading is added.');
  }

  const shaped = reach
    ? [...bounds, reach.bounds]
    : bounds;
  const makeShaped = reach
    ? ([lw, a, ph, tr, pl, ra]) => makeEvent('fold', {
      wavelength: Math.exp(lw), amplitude: a, phase: ph, trend: tr, plunge: pl,
      reachAlong: ra, name: 'Fold',
    })
    : make;

  return {
    events: [ev],
    polish: (events, all) => {
      const start = [Math.log(ev.wavelength), ev.amplitude, ev.phase, ev.trend, ev.plunge];
      if (reach) start.push(ev.reachAlong || reach.seed);
      const { x: y } = refine(start, shaped,
        (v) => misfit(withFirst(events, makeShaped(v)), all).total);
      Object.assign(ev, {
        wavelength: Math.exp(y[0]), amplitude: y[1], phase: y[2], trend: y[3], plunge: y[4],
      });
      if (reach) {
        // A reach that ends up wider than the block is not a limit, it is a
        // fold that happens to fill the map. Recorded as no limit at all, so
        // the document reads as the ordinary infinite fold it has become
        // rather than carrying a number that does nothing.
        ev.reachAlong = y[5] >= extent ? 0 : y[5];
      }
    },
    // Reported by inferHistory once everything has settled, because polish
    // only runs when there are contacts and the reach is applied either way.
    reachSeed: reach ? reach.seed : null,
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

  // One score for every candidate, so that the units named across a fault
  // weigh against the contacts and the readings in the same currency. The
  // juxtaposition term is metres, like the contact spread, and is converted
  // the same way.
  const total = () => misfit(events, obs).total
    + juxtaposition(events, obs, fitted, extent) / METRES_PER_DEGREE;

  const put = (f, rake, slip) => {
    const { kind, obliquity } = faultKindFromRake(wrap360(rake));
    f.ev.kind = kind;
    f.ev.obliquity = obliquity;
    f.ev.slip = slip;
  };

  for (const f of fitted) {
    // What the rock itself said about the direction of slip. Worked out before
    // asking whether the DISTANCE is measurable, because these are separate
    // questions: striae and an observed sense fix which way the hanging wall
    // went whether or not anything says how far, and both belong on the event
    // either way.
    const striae = f.seen.lines
      .map((o) => rakeOf(f.plane.strike, f.plane.dip, o.trend, o.plunge))
      .filter((r) => r != null);
    const sense = f.line.sense || '';
    const pinned = striae.length ? meanRakeLine(striae) : null;

    // Striae give the line of slip but not the direction along it, so they
    // leave two candidates half a turn apart; the observed sense is what picks
    // between them. Either one alone narrows the search enormously — together
    // they remove it.
    let candidates = pinned == null ? [] : [pinned, wrap360(pinned + 180)];
    if (candidates.length && sense) {
      const ok = candidates.filter((r) => faultKindFromRake(r).kind === sense);
      if (ok.length) candidates = ok;
      else {
        warnings.push(`The slickenlines on ${f.ev.name} rake at ${Math.round(pinned)}\u00b0 in its plane, which is not a ${sense} fault however it moved along them. One of the two is wrong — most often the plane, because a rake is measured in it. Both directions along the striae were tried.`);
      }
    }
    // A rake measured on the surface outranks the pure form of a declared
    // sense, so it is written on now rather than only if the slip is solved.
    if (candidates.length === 1) put(f, candidates[0], f.ev.slip);

    const cross = crossesFault(f.ev, obs);
    // Units named across a dipping fault measure the separation on their own:
    // it is what "older on younger" means, said in the column's own metres.
    const named = f.plane.dip < 89
      && !!String(f.line.unitUpper || '').trim()
      && !!String(f.line.unitLower || '').trim();

    if (!cross.crosses && !named) {
      f.ev.slip = 0;
      const unnamed = contactGroups(obs).filter((g) => !g.named).length;
      warnings.push(
        (cross.grazed
          ? `No contact is mapped on both sides of ${f.ev.name} — one runs up to it and a point or two past it, which is the end of a trace rather than the same contact found again in the other block.`
          : `No single contact is mapped on both sides of ${f.ev.name}, so nothing measures how far it moved.`)
        + ` Its offset is left at zero${sense || candidates.length
          ? `, though it keeps the ${sense ? `${sense === 'reverse' ? 'thrust' : sense} sense you observed` : 'rake your slickenlines give'} — what is missing is how FAR it moved, not which way`
          : ' — the fault is drawn, not solved'}.`
        + (unnamed
          ? ` ${unnamed} contact${unnamed === 1 ? ' has' : 's have'} no units named on either side, and an unnamed contact cannot be recognised as the same surface where it crops out again across the fault.`
          : '')
        + ' Two things fix this: carry a contact across the fault and map it in both blocks, or name the unit on each side of the fault itself, which measures the separation without needing the same contact twice.',
      );
      continue;
    }

    const sc = (v) => { put(f, v[0], v[1]); return total(); };
    let best = null;
    if (candidates.length) {
      // Only the distance is left to find, which is one number and a scan
      // along a line rather than a search over a surface.
      for (const rake of candidates) {
        const one = (v) => sc([rake, v[0]]);
        const seed = scan([[0, maxSlip]], [30], one);
        const r = refine(seed, [[0, maxSlip]], one, { rounds: 40 });
        if (!best || r.value < best.value) best = { value: r.value, x: [rake, r.x[0]] };
      }
    } else {
      const window = SENSE_RAKE[sense];
      const bounds = [window || [0, 360], [0, maxSlip]];
      const counts = window ? [10, 20] : [24, 14];
      const seed = scan(bounds, counts, sc);
      best = refine(seed, bounds, sc, { rounds: 40 });
      best = { value: best.value, x: best.x };
    }
    put(f, best.x[0], best.x[1]);
    f.solved = true;
    f.evidence = { cross: cross.crosses, named, striae: striae.length, sense, pinned };
  }

  // With several faults each was scanned while the others were wherever the
  // scan left them, so walk them together once before believing any of them.
  const solved = fitted.filter((f) => f.solved);
  if (solved.length > 1) {
    const vec = solved.flatMap((f) => [faultRakeOf(f.ev), f.ev.slip]);
    // Each fault keeps whatever narrowed its own rake. A joint polish is there
    // to let the faults settle against each other, not to quietly undo an
    // observation one of them was pinned by.
    const bounds = solved.flatMap((f) => [
      f.evidence.pinned != null
        ? [faultRakeOf(f.ev), faultRakeOf(f.ev)]
        : (SENSE_RAKE[f.evidence.sense] || [0, 360]),
      [0, maxSlip],
    ]);
    const set = (v) => solved.forEach((f, i) => put(f, v[i * 2], v[i * 2 + 1]));
    const { x } = refine(vec, bounds, (v) => { set(v); return total(); }, { rounds: 30 });
    set(x);
  }
}

/**
 * What the faults ended up saying, written once the answer has stopped moving.
 *
 * Kept apart from the fitting because the fitting runs more than once — the
 * slip and the fold are refitted against each other — and a note written from
 * inside the first pass would describe an offset that was afterwards changed.
 * A report that quotes a number the block does not have is worse than no
 * report: it is the one thing in the panel a reader has no way to check.
 */
function reportSlip(fitted, events, obs, extent, notes, warnings) {
  const maxSlip = extent * 0.45;
  const total = () => misfit(events, obs).total
    + juxtaposition(events, obs, fitted, extent) / METRES_PER_DEGREE;
  const put = (f, rake, slip) => {
    const { kind, obliquity } = faultKindFromRake(wrap360(rake));
    f.ev.kind = kind;
    f.ev.obliquity = obliquity;
    f.ev.slip = slip;
  };

  for (const f of fitted) {
    if (!f.solved) continue;
    const oblique = Math.abs(f.ev.obliquity) > 8
      ? ` with ${Math.round(Math.abs(f.ev.obliquity))}\u00b0 of oblique` : '';
    const from = [];
    if (f.evidence.cross) from.push('a contact mapped on both sides of it');
    if (f.evidence.named) from.push('the units you named either side');
    if (f.evidence.striae) from.push(`${f.evidence.striae} slickenline${f.evidence.striae === 1 ? '' : 's'}`);
    if (f.evidence.sense && !f.evidence.striae) from.push('the sense you observed');
    notes.push(`${f.ev.name}: ${Math.round(f.ev.slip)} m of slip, ${f.ev.kind}${oblique}`
      + (from.length ? `, from ${joinList(from)}.` : '.'));

    // Whether that number is an answer at all. A minimum the data barely
    // prefers is not a measurement, and it prints identically to one that is —
    // which is exactly how a fault ends up reported as having moved a metre.
    const rake = faultRakeOf(f.ev);
    const keep = f.ev.slip;
    const at = total();
    let worst = at;
    for (let k = 1; k <= 8; k++) {
      put(f, rake, (k / 8) * maxSlip);
      worst = Math.max(worst, total());
    }
    put(f, rake, keep);
    if (worst - at < 0.5) {
      warnings.push(`Nothing in your mapping really decides how far ${f.ev.name} moved: across its whole range of possible offsets the fit changes by less than half a degree, so ${Math.round(f.ev.slip)} m is where the search stopped rather than what the evidence says. Treat it as undetermined and set it yourself on the History tab.`);
    }
  }
}

/**
 * The mean of several rakes measured as lines rather than directions.
 *
 * Striae at 5\u00b0 and 175\u00b0 are two readings of nearly the same line, and
 * averaging them gives 90 — the one answer that is perpendicular to both. So
 * the angles are doubled, averaged as vectors, and halved: the standard way to
 * take a mean of something defined only to within a half turn.
 */
function meanRakeLine(rakes) {
  let sx = 0, sy = 0;
  for (const r of rakes) {
    sx += Math.cos(2 * r * DEG);
    sy += Math.sin(2 * r * DEG);
  }
  if (Math.hypot(sx, sy) < 1e-9) return rakes[0];
  return wrap360(Math.atan2(sy, sx) * RAD / 2);
}

/** "a, b and c" — a list a person would read out. */
function joinList(parts) {
  if (parts.length <= 1) return parts[0] || '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
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
    // Same trimming as the misfit: a couple of points that strayed over a
    // fault would otherwise be averaged into this surface's depth and shift
    // the thickness of every unit below it.
    const d = evidencePts(g, events).map((p) => stratDepth(h, p));
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
