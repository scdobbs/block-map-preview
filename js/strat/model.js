// The stratigraphic column: what the rock does going up, before anything is
// asked about where it crops out.
//
// This is the third thing a student has, alongside a map and a block, and it
// is the only one of the three they can write down before leaving the room.
// A column is knowledge about the succession — Poleta over Campito, eight
// members inside the Poleta, this one coarsens up — and most of that is known,
// or claimed, long before a thickness has been measured or a contact walked.
//
// So the column is allowed to be incomplete in a way nothing else here is. A
// unit with no thickness is a perfectly good entry: it says the unit exists
// and where it sits, which is most of what a column is for. The thickness
// arrives later, from a tape or from a block, and until it does the drawing
// says so rather than inventing a number.
//
// The column lives in the field document because that is where units already
// live. Naming a unit in the column is the same act as naming one to log a
// station in, and two lists of unit names in one project would be two lists
// that disagree by Wednesday.

import { ROCK_BY_ID, MAX_LAYERS, makeLayer } from '../geo/model.js';
import { newFieldId } from '../field/model.js';

// ---------------------------------------------------------------------------
// Rank
// ---------------------------------------------------------------------------
// A column is not a flat list. "The Poleta has eight units" is a statement
// about two levels at once, and a drawing that cannot show the bracket beside
// the eight boxes has not drawn what the student meant.
//
// Only the leaves — the entries nothing else is part of — have thickness and
// lithology. A formation with members in it is a label spanning them, and its
// thickness is their sum rather than a number of its own, because those are
// the same quantity and storing it twice means storing it wrong.

export const RANKS = [
  { id: 'group', label: 'Group', holds: true, hint: 'Several formations that belong together.' },
  { id: 'formation', label: 'Formation', holds: true, hint: 'The mappable unit. The usual answer.' },
  { id: 'member', label: 'Member', holds: false, hint: 'A named part of a formation.' },
  { id: 'bed', label: 'Bed', holds: false, hint: 'A single distinctive layer.' },
  { id: 'unit', label: 'Unit', holds: false, hint: 'Informal — "unit 3 of the Poleta".' },
];

export const RANK_BY_ID = Object.fromEntries(RANKS.map((r) => [r.id, r]));
export function rankLabel(id) { return (RANK_BY_ID[id] || RANK_BY_ID.formation).label; }

/** Ranks that can have things inside them, and ranks that cannot. */
export const HOLDING_RANKS = RANKS.filter((r) => r.holds);
export const HELD_RANKS = RANKS.filter((r) => !r.holds);

/**
 * Two tiers, and only two.
 *
 * A member of a member of a member is not stratigraphy, it is a data structure
 * — and the drawing cannot show it either, since the bracket column has room
 * for one nesting and no more. So the rule is enforced where it can be stated
 * once: a unit may hold members if its rank is one that holds things AND it is
 * not itself inside something. Everything else — which ranks the editor
 * offers, whether it offers to add a member at all, what a new child is called
 * — falls out of this rather than being re-decided in the panel.
 */
export function canHoldMembers(doc, unit) {
  if (!unit || unit.parentId) return false;
  return (RANK_BY_ID[unit.rank] || RANK_BY_ID.formation).holds;
}

/** Units a given unit could be moved inside. */
export function possibleParents(doc, unit) {
  // A unit that already has members of its own cannot also be a member: that
  // is the third tier arriving by the back door.
  if (childrenOf(doc, unit).length) return [];
  return (doc.units || []).filter((p) => p.id !== unit.id && canHoldMembers(doc, p));
}

/**
 * What a new child of this unit is called: one step down the ladder, so a
 * group gets formations and a formation gets members.
 */
export function childRankFor(parent) {
  return parent && parent.rank === 'group' ? 'formation' : 'member';
}

/** The ranks this unit is allowed to be, given what it holds and what holds it. */
export function ranksFor(doc, unit) {
  if (childrenOf(doc, unit).length) return HOLDING_RANKS;
  if (unit.parentId) {
    const parent = (doc.units || []).find((p) => p.id === unit.parentId);
    // A formation inside a group is still a holding rank, but it may not be a
    // group itself — nothing sits above a group here.
    return parent && parent.rank === 'group'
      ? RANKS.filter((r) => r.id !== 'group')
      : HELD_RANKS;
  }
  return RANKS;
}

// ---------------------------------------------------------------------------
// Grain size — the x axis
// ---------------------------------------------------------------------------
// The horizontal axis of a measured section is grain size, and the ragged
// right-hand edge that produces is the whole reason a column is drawn rather
// than tabulated: a coarsening-up cycle is a shape you see across a metre of
// paper and never see in a list of numbers.
//
// Two scales, because two kinds of rock are logged two different ways and
// forcing carbonates onto a Wentworth axis is how you get a limestone plotted
// as a siltstone. Which one is in use is a project setting; the profile stores
// an index into whichever scale it was drawn against.

export const GRAIN_SCALES = {
  clastic: {
    id: 'clastic',
    label: 'Grain size (Wentworth)',
    // Short labels are what fits under a phone-width axis; `long` is for the
    // panel, where there is room to say which "c" is meant.
    steps: [
      { id: 'clay', short: 'cl', long: 'Clay' },
      { id: 'silt', short: 'si', long: 'Silt' },
      { id: 'vfs', short: 'vf', long: 'Very fine sand' },
      { id: 'fs', short: 'f', long: 'Fine sand' },
      { id: 'ms', short: 'm', long: 'Medium sand' },
      { id: 'cs', short: 'c', long: 'Coarse sand' },
      { id: 'vcs', short: 'vc', long: 'Very coarse sand' },
      { id: 'gran', short: 'gr', long: 'Granule' },
      { id: 'pebb', short: 'pb', long: 'Pebble' },
      { id: 'cobb', short: 'cb', long: 'Cobble' },
      { id: 'boul', short: 'bo', long: 'Boulder' },
    ],
    // Where the axis is divided with a heavier tick, because sand is the part
    // of the scale a section spends most of its time in.
    majors: ['silt', 'vfs', 'cs', 'gran', 'pebb'],
  },
  carbonate: {
    id: 'carbonate',
    label: 'Texture (Dunham)',
    steps: [
      { id: 'mudstone', short: 'M', long: 'Mudstone' },
      { id: 'wackestone', short: 'W', long: 'Wackestone' },
      { id: 'packstone', short: 'P', long: 'Packstone' },
      { id: 'grainstone', short: 'G', long: 'Grainstone' },
      { id: 'floatstone', short: 'F', long: 'Floatstone' },
      { id: 'rudstone', short: 'R', long: 'Rudstone' },
      { id: 'boundstone', short: 'B', long: 'Boundstone' },
    ],
    majors: ['packstone', 'floatstone'],
  },
};

export function grainScale(id) { return GRAIN_SCALES[id] || GRAIN_SCALES.clastic; }

/**
 * Where a rock sits on the axis when nobody has said.
 *
 * A guess, and a deliberately unambitious one: it puts a sandstone in the sand
 * and a shale in the mud so a column drawn in thirty seconds already has the
 * right shape, and the student moves the edge where they disagree. Anything
 * off the scale — a granite, a schist — is parked mid-axis, since the axis
 * does not mean anything for those and a box has to be some width.
 */
const CLASTIC_DEFAULT = {
  shale: 'clay', mudstone: 'clay', siltstone: 'silt',
  sandstone: 'ms', conglomerate: 'pebb', quartzite: 'ms',
  limestone: 'silt', dolostone: 'silt', marble: 'silt',
  evaporite: 'silt', coal: 'clay', tuff: 'vfs',
};
const CARBONATE_DEFAULT = {
  limestone: 'packstone', dolostone: 'packstone', marble: 'packstone',
  shale: 'mudstone', mudstone: 'mudstone', siltstone: 'mudstone',
  sandstone: 'grainstone', conglomerate: 'rudstone',
};

export function defaultGrainFor(rockId, scaleId = 'clastic') {
  const scale = grainScale(scaleId);
  const want = (scaleId === 'carbonate' ? CARBONATE_DEFAULT : CLASTIC_DEFAULT)[rockId];
  const i = scale.steps.findIndex((s) => s.id === want);
  return i >= 0 ? i : Math.floor((scale.steps.length - 1) / 2);
}

/**
 * The grain profile as a list of {at, g} up the unit, always at least one
 * point, always sorted, always inside the scale.
 *
 * `at` is a fraction of the unit's own height from its base, not a depth in
 * metres — so a unit whose thickness is later corrected keeps the shape the
 * student drew instead of having its profile stretched off the end of it.
 * Two points at the same height are a sharp break, which is what the base of
 * a channel looks like and what a ramp between them could never say.
 */
export function grainProfile(unit, scaleId = 'clastic') {
  const scale = grainScale(scaleId);
  const max = scale.steps.length - 1;
  const pts = (unit.grains || [])
    .filter((p) => p && Number.isFinite(p.at) && Number.isFinite(p.g))
    .map((p) => ({ at: clamp01(p.at), g: Math.max(0, Math.min(max, Math.round(p.g))) }))
    .sort((a, b) => a.at - b.at);
  if (!pts.length) return [{ at: 0, g: defaultGrainFor(unit.rockId, scaleId) }];
  return pts;
}

/** The grain index at a height in the unit, ramping between profile points. */
export function grainAt(profile, at) {
  if (!profile.length) return 0;
  if (at <= profile[0].at) return profile[0].g;
  const last = profile[profile.length - 1];
  if (at >= last.at) return last.g;
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1], b = profile[i];
    if (at > b.at) continue;
    if (b.at - a.at < 1e-6) return b.g;
    return a.g + (b.g - a.g) * ((at - a.at) / (b.at - a.at));
  }
  return last.g;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// ---------------------------------------------------------------------------
// Marks — fossils, traces, structures
// ---------------------------------------------------------------------------

export function makeMark(over = {}) {
  return {
    id: newFieldId('mk'),
    unitId: null,
    at: 0.5,          // fraction of the unit's height, base to top
    symbol: 'burrow',
    note: '',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// How a unit sits on the one beneath it
// ---------------------------------------------------------------------------
// Drawn, not merely recorded: the line between two boxes is the one place a
// column can say something a list of thicknesses cannot, and an unconformity
// drawn as a straight rule has thrown that away.

export const CONTACT_STYLES = [
  { id: 'conformable', label: 'Conformable', hint: 'Deposition carried on without a break.' },
  { id: 'sharp', label: 'Sharp', hint: 'An abrupt change, still conformable.' },
  { id: 'gradational', label: 'Gradational', hint: 'One passes up into the other.' },
  { id: 'erosional', label: 'Erosional', hint: 'Scoured. Drawn as a cut surface.' },
  { id: 'unconformity', label: 'Unconformity', hint: 'Time missing. Drawn wavy.' },
  { id: 'fault', label: 'Fault', hint: 'The succession is cut, not deposited.' },
  { id: 'covered', label: 'Covered', hint: 'Not exposed — you did not see this one.' },
];

export const CONTACT_STYLE_BY_ID = Object.fromEntries(CONTACT_STYLES.map((c) => [c.id, c]));

// ---------------------------------------------------------------------------
// Reading the column out of the document
// ---------------------------------------------------------------------------

/** Units nothing else is part of — the ones that own a thickness and a box. */
export function isLeaf(doc, unit) {
  return !(doc.units || []).some((u) => u.parentId === unit.id);
}

export function childrenOf(doc, unit) {
  return (doc.units || []).filter((u) => u.parentId === unit.id);
}

/**
 * What the student has actually said the thickness is.
 *
 * Null means not known, which is a state the whole drawing is built to be able
 * to show. It is never quietly replaced by a nominal value here — that
 * substitution happens once, in the layout, and is labelled where it happens.
 */
export function thicknessOf(unit) {
  return Number.isFinite(unit.thickness) && unit.thickness > 0 ? unit.thickness : null;
}

/**
 * A unit whose measured thickness and modelled thickness do not agree.
 *
 * Both numbers are kept because both are real: one was measured with a tape or
 * asserted from a memoir, the other was read off a block fitted to the map.
 * When they part company that is a finding, not an error to be resolved by
 * overwriting one with the other, and the column says so where it happens.
 *
 * The tolerance is deliberately loose. A block's thickness comes from contacts
 * traced across ten-metre elevation data, so agreeing to within a tenth is as
 * close as the two can be expected to get.
 */
export function disagreement(unit) {
  const said = thicknessOf(unit);
  const model = Number.isFinite(unit.modelThickness) ? unit.modelThickness : null;
  if (said == null || model == null) return null;
  if (unit.thicknessSource === 'block') return null;   // the same number twice
  const diff = said - model;
  const tol = Math.max(5, said * 0.1);
  if (Math.abs(diff) <= tol) return null;
  return { said, model, diff, thicker: diff > 0 };
}

/**
 * The column, laid out: every leaf with a top and a base in metres, every
 * group as a bracket spanning its children, and an honest count of what is
 * still unknown.
 *
 * Depth runs down from the top of the column, matching the block's own
 * convention and the order `doc.units` is stored in — index 0 is youngest.
 * Heights for drawing run the other way and are computed from `total`, which
 * is where the flip happens and the only place it does.
 *
 * A unit with no thickness is given a nominal one so it still gets a box, and
 * flagged so the drawing can put a ragged edge on it and the panel can count
 * how many are outstanding. The nominal value is the median of what IS known,
 * so an unmeasured member sits among its neighbours at a believable size
 * rather than towering over them or vanishing.
 */
export function layoutColumn(doc) {
  const units = doc.units || [];
  const leaves = units.filter((u) => isLeaf(doc, u));
  const known = leaves.map(thicknessOf).filter((t) => t != null).sort((a, b) => a - b);
  const nominal = known.length
    ? Math.max(5, Math.round(known[Math.floor(known.length / 2)]))
    : 50;

  const rows = [];
  let depth = 0;
  for (const u of leaves) {
    const said = thicknessOf(u);
    const t = said == null ? nominal : said;
    rows.push({
      unit: u,
      thickness: t,
      known: said != null,
      top: depth,
      base: depth + t,
      disagreement: disagreement(u),
    });
    depth += t;
  }
  const total = depth;

  // Groups span their children. Nothing requires the children to be adjacent
  // in the list — a student can reorder freely — so the span is taken from the
  // extremes and a gap in it is reported rather than silently closed.
  const groups = [];
  for (const g of units) {
    const kids = childrenOf(doc, g);
    if (!kids.length) continue;
    const idx = kids.map((k) => rows.findIndex((r) => r.unit.id === k.id)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const from = Math.min(...idx);
    const to = Math.max(...idx);
    const broken = (to - from + 1) !== idx.length;
    groups.push({
      unit: g,
      from,
      to,
      broken,
      top: rows[from].top,
      base: rows[to].base,
      thickness: rows[to].base - rows[from].top,
      allKnown: rows.slice(from, to + 1).every((r) => r.known),
    });
  }

  return {
    rows,
    groups,
    total,
    nominal,
    unknown: rows.filter((r) => !r.known).length,
    disagreements: rows.filter((r) => r.disagreement).length,
  };
}

/** The height of a point above the base of the column, from a depth. */
export function heightOf(layout, depth) { return layout.total - depth; }

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/**
 * Put a unit inside a formation, or take it out, rank and all.
 *
 * The rank is not a separate decision: a thing inside a group is a formation,
 * a thing inside a formation is a member, and a thing taken back out is a
 * formation again. Keeping the two in step here is what stops a unit dragged
 * out of the Poleta from still calling itself a member of nothing.
 */
export function setUnitParent(doc, unit, parentId) {
  const parent = parentId ? (doc.units || []).find((p) => p.id === parentId) : null;
  unit.parentId = parent ? parent.id : null;
  if (parent) unit.rank = childRankFor(parent);
  else if (unit.rank === 'member') unit.rank = 'formation';
}

/**
 * Which formation a unit belongs to after being dropped somewhere.
 *
 * Decided from its new neighbours in the column, because that is what the
 * person dragging it was looking at. Landing between two members of the same
 * formation puts it in that formation; landing with one of them on one side
 * and open ground on the other keeps it where it was, so nudging the top or
 * bottom member of a formation does not eject it; landing anywhere else takes
 * it out. Pulling a member clear of its formation is therefore the same
 * gesture as promoting it, which is what it means on the outcrop too.
 *
 * `leaves` is the column as it now reads, top to bottom.
 */
export function ownerAfterDrop(doc, leaves, unit) {
  const i = leaves.indexOf(unit);
  if (i < 0) return unit.parentId || null;
  const owner = (u) => (u && u.parentId) || null;
  const above = owner(leaves[i - 1]);
  const below = owner(leaves[i + 1]);

  let parent = null;
  if (above && above === below) parent = above;
  else if (unit.parentId && (above === unit.parentId || below === unit.parentId)) {
    parent = unit.parentId;
  }
  // Nothing may adopt itself, and a unit that holds members of its own cannot
  // also be held — that is the third tier arriving by drag instead of by
  // dropdown.
  if (parent === unit.id) parent = null;
  if (parent && childrenOf(doc, unit).length) parent = null;
  return parent;
}

/**
 * The list with every formation sitting immediately above its own members.
 *
 * A formation's card is a label for a bracket, not a box in the column — its
 * place in the array means nothing to the drawing, which reads only the
 * leaves. But it means a great deal to the person reading the list, and a
 * bracket label stranded six rows above the units it brackets is a list nobody
 * can follow. So after anything moves, the labels are gathered back to their
 * members.
 */
export function normaliseOrder(units) {
  const holds = new Set(units.filter((u) => u.parentId).map((u) => u.parentId));
  const byId = new Map(units.map((u) => [u.id, u]));
  const out = [];
  const done = new Set();
  for (const u of units) {
    if (holds.has(u.id)) continue;            // wait for its first member
    if (u.parentId && holds.has(u.parentId) && !done.has(u.parentId)) {
      const h = byId.get(u.parentId);
      if (h) { out.push(h); done.add(h.id); }
    }
    out.push(u);
    done.add(u.id);
  }
  for (const u of units) if (!done.has(u.id)) out.push(u);
  return out;
}

/**
 * Where a new unit goes when it is added next to another.
 * `side` is 'above' (younger, earlier in the array) or 'below'.
 */
export function insertIndex(doc, neighbourId, side) {
  const i = (doc.units || []).findIndex((u) => u.id === neighbourId);
  if (i < 0) return (doc.units || []).length;
  return side === 'above' ? i : i + 1;
}

// ---------------------------------------------------------------------------
// Handing the column to the block
// ---------------------------------------------------------------------------

/**
 * The column as block layers.
 *
 * The block's stratigraphy is an array of layers youngest first with a
 * thickness each, which is exactly what a column is, so this is close to a
 * rename. Two things it does have to decide: what to do about a unit with no
 * thickness, and what to do when there are more units than the shader has
 * registers for.
 *
 * An unknown thickness becomes the nominal one, because a block cannot draw a
 * layer of unknown height and refusing to build at all would be worse than
 * building something the student can then correct. It is reported, not hidden.
 *
 * Over the cap, the DEEPEST units are merged rather than dropped: the top of
 * the column is what crops out and what a map is drawn on, and losing the
 * youngest units to make room for basement nobody will see is the wrong trade.
 */
export function toBlockLayers(doc, { max = MAX_LAYERS } = {}) {
  const layout = layoutColumn(doc);
  const notes = [];
  if (!layout.rows.length) return { layers: [], notes: ['The column is empty.'] };

  if (layout.unknown) {
    notes.push(`${layout.unknown} unit${layout.unknown === 1 ? '' : 's'} with no thickness `
      + `went in at ${layout.nominal} m, the middle of the ones you have measured. `
      + 'Change them on the Layers tab or measure them and build again.');
  }

  let rows = layout.rows;
  if (rows.length > max) {
    const keep = rows.slice(0, max - 1);
    const merged = rows.slice(max - 1);
    const thickness = merged.reduce((a, r) => a + r.thickness, 0);
    notes.push(`The block holds ${max} units and the column has ${rows.length}. `
      + `The lowest ${merged.length} were merged into one ${Math.round(thickness)} m unit, `
      + 'since the top of a column is what a map is drawn on.');
    rows = [...keep, {
      ...merged[0],
      thickness,
      unit: { ...merged[0].unit, name: `${merged[0].unit.name || 'Lower'} and below` },
    }];
  }

  // Through the block's own constructor rather than assembled here, so a layer
  // made from a column is the same shape as a layer made any other way — the
  // shader reads `pattern` off it, and a hand-built object that forgot to carry
  // one draws the rock plain.
  const layers = rows.map((r) => {
    const rk = ROCK_BY_ID[r.unit.rockId] || ROCK_BY_ID.sandstone;
    return makeLayer(rk.id, Math.max(5, Math.round(r.thickness)), {
      name: r.unit.name || rk.label,
      color: r.unit.color || rk.color,
    });
  });
  return { layers, notes };
}

// ---------------------------------------------------------------------------
// Taking a thickness back from the block
// ---------------------------------------------------------------------------

/**
 * Write what a block build measured onto the column.
 *
 * This is the one place anything derived is allowed to touch the record, and
 * it is kept to the narrowest thing that can be true: the modelled thickness
 * goes into its own field, next to and never over the one the student wrote.
 *
 * The exception is a unit with no thickness at all. There, the model's number
 * is adopted outright — because "I do not know" and "the block says 180 m" are
 * not in conflict, and a column that stays blank when the answer is sitting
 * next to it is being precious rather than careful. It is stamped as having
 * come from a block, said so in the drawing, and can be typed over.
 *
 * Nothing is matched except by name, and names are matched loosely, because
 * "Poleta Fm" and "Poleta Formation" are the same rock.
 *
 * Returns a summary so the caller can say what happened rather than leaving
 * the student to notice a number changed.
 */
export function recordModelThicknesses(doc, reported, at = new Date().toISOString()) {
  const plan = planModelThicknesses(doc, reported);
  for (const step of plan.steps) {
    const u = doc.units.find((x) => x.id === step.unitId);
    if (!u) continue;
    u.modelThickness = step.thickness;
    u.modelAt = at;
    if (step.kind === 'adopted' || step.kind === 'refreshed') {
      u.thickness = step.thickness;
      u.thicknessSource = 'block';
    }
  }
  return plan;
}

/**
 * What `recordModelThicknesses` would do, without doing it.
 *
 * Split out so a caller can find out whether a build has anything to tell the
 * column BEFORE opening an undo step. A build that measured nothing the column
 * did not already know should not leave a step on the stack for a student to
 * undo and then wonder what they just undid.
 */
export function planModelThicknesses(doc, reported) {
  const byName = new Map();
  for (const u of doc.units || []) {
    const key = normaliseName(u.name);
    if (key && !byName.has(key)) byName.set(key, u);
  }

  const steps = [];
  const adopted = [];
  const noted = [];
  const clashed = [];
  for (const r of reported || []) {
    // Only measured thicknesses. The roof and the floor of a cut block are
    // open-ended by construction — the map says nothing about how thick the
    // youngest and oldest units are — and writing those in as measurements
    // would be recording a guess as a reading.
    if (!r.measured) continue;
    const u = byName.get(normaliseName(r.name));
    if (!u) continue;
    const t = Math.round(r.thickness);
    if (!Number.isFinite(t) || t <= 0) continue;
    if (u.modelThickness === t && (thicknessOf(u) != null)) {
      // The same answer as last time, and the column already has a thickness.
      // Nothing to say.
      continue;
    }

    let kind;
    if (thicknessOf(u) == null) { kind = 'adopted'; adopted.push({ name: u.name, thickness: t }); }
    else if (u.thicknessSource === 'block') {
      kind = 'refreshed'; noted.push({ name: u.name, thickness: t });
    } else if (Math.abs(u.thickness - t) > Math.max(5, u.thickness * 0.1)) {
      kind = 'clashed'; clashed.push({ name: u.name, said: u.thickness, model: t });
    } else {
      kind = 'agreed'; noted.push({ name: u.name, thickness: t });
    }
    steps.push({ unitId: u.id, name: u.name, thickness: t, kind });
  }
  return { steps, adopted, noted, clashed };
}

/** "Poleta Fm", "poleta formation" and "Poleta  Fm." are one unit. */
export function normaliseName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\bformations?\b/g, 'fm')
    .replace(/\bmembers?\b/g, 'mbr')
    .replace(/\bgroups?\b/g, 'gp')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pairs of units that touch in the column, youngest first.
 *
 * A contact drawn on the map has an upper and a lower unit, and if the column
 * is right then the only pairs that can occur are these. Offering them saves
 * typing two names into a phone, and — more to the point — it is what stops a
 * pair being entered upside down, which is the error the block fit has to
 * spend a paragraph explaining afterwards.
 */
export function contactPairs(doc) {
  const layout = layoutColumn(doc);
  const out = [];
  for (let i = 0; i < layout.rows.length - 1; i++) {
    const upper = layout.rows[i].unit;
    const lower = layout.rows[i + 1].unit;
    if (!upper.name || !lower.name) continue;
    // The line between them is the BASE of the upper unit, which is where
    // the style is recorded — a contact is a property of one surface, and
    // storing it on both units either side is storing it twice.
    out.push({ upper: upper.name, lower: lower.name, style: upper.contactBelow || 'conformable' });
  }
  return out;
}
