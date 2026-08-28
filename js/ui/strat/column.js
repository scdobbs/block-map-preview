// The drawing: a measured section, as SVG.
//
// One builder, two audiences. On screen it is the thing the student taps to
// select a unit, drag a grain size or drop a fossil on. On paper it is what
// gets handed in, and the conventions it has to obey there are a century old
// and not negotiable: depth down the page, grain size across it, lithology
// ornamented rather than merely coloured, formations bracketed beside their
// members, and every symbol on the sheet accounted for in a legend.
//
// SVG rather than canvas for three reasons. It is what a section wants to be —
// text, rules and small drawings, no pixels anywhere. It hit-tests itself, so
// tapping a unit is `closest('[data-unit]')` rather than a hand-rolled search
// through boxes. And it exports: the file this writes opens in Illustrator or
// Inkscape at any size, which is what a student needs when the section has to
// go in a report at 1:200.
//
// Colours are passed in rather than taken from CSS classes, because the screen
// wants the app's dark palette and the exported file wants black ink on white
// paper, and those are the same drawing twice rather than two drawings.

import { svg } from '../widgets.js';
import { drawSwatch } from '../swatch.js';
import { ROCK_BY_ID } from '../../geo/model.js';
import { unitColor } from '../../field/model.js';
import {
  layoutColumn, grainProfile, grainAt, grainScale, CONTACT_STYLE_BY_ID, rankLabel, isLeaf,
} from '../../strat/model.js';
import { symbolGroup, symbolLabel, SYMBOL_BY_ID } from './symbols.js';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
// Column widths in drawing units, left to right. These are the columns of a
// log sheet and they are fixed rather than proportional: a reader who has seen
// one of these should find the grain-size axis where it always is.

export const GEOM = {
  padL: 10,
  bracket: 44,      // formation and group brackets, with the name up the side
  scale: 34,        // the metre rule
  lith: 168,        // the lithology box; its right edge IS the grain size
  marks: 62,        // fossils and structures
  name: 104,        // unit names
  desc: 190,        // the description margin, when it is on
  padR: 10,
  head: 52,         // the grain-size axis across the top
  foot: 16,
};

/** Where each column starts, given whether the description margin is showing. */
export function columnsOf({ descriptions = true } = {}) {
  const g = GEOM;
  const x0 = g.padL;
  const x1 = x0 + g.bracket;
  const x2 = x1 + g.scale;
  const x3 = x2 + g.lith;
  const x4 = x3 + g.marks;
  const x5 = x4 + g.name;
  const right = descriptions ? x5 + g.desc : x5;
  return {
    bracket: x0, scale: x1, lith: x2, marks: x3, name: x4, desc: x5,
    right, width: right + g.padR,
  };
}

export const SCREEN_THEME = {
  ink: '#e8eef2',
  dim: '#93a3af',
  faint: '#647585',
  line: '#2b3742',
  rule: '#3d4c58',
  paper: '#0f1418',
  panel: '#161d23',
  accent: '#ffc857',
  warn: '#ffc857',
  model: '#6ee7a5',
};

export const PRINT_THEME = {
  ink: '#101418',
  dim: '#40505c',
  faint: '#68798a',
  line: '#9aa8b4',
  rule: '#7e8d99',
  paper: '#ffffff',
  panel: '#f2f5f7',
  accent: '#b8860b',
  warn: '#8a6d1a',
  model: '#1f7a4d',
};

// ---------------------------------------------------------------------------
// Lithology tiles
// ---------------------------------------------------------------------------
// The same ornament the block draws on its faces and the layer list draws in
// its swatches, so a unit is recognisably one rock across all three. Built as
// a canvas tile and referenced as an SVG pattern: it costs one small data URI
// per rock in the column, it travels inside the exported file, and it means
// the patterns cannot drift apart from the ones on the block.

const TILE = 52;    // four 13px cells, which is where the ornament repeats
const tileCache = new Map();

function tileURL(color, pattern) {
  const key = `${color}|${pattern}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  drawSwatch(cv, color, pattern, 1, TILE);
  const url = cv.toDataURL('image/png');
  tileCache.set(key, url);
  return url;
}

// ---------------------------------------------------------------------------
// The section
// ---------------------------------------------------------------------------

/**
 * Build the whole drawing.
 *
 * Returns the SVG node plus the layout it was drawn from and the geometry it
 * used, because the section needs all three: the node to show, the layout to
 * answer "which unit is at this height", and the geometry to turn a tap into
 * a grain size.
 */
export function buildColumn(doc, opts = {}) {
  const {
    theme = SCREEN_THEME,
    selectedId = null,
    descriptions = doc.settings?.columnDescriptions !== false,
    marks: showMarks = doc.settings?.columnMarks !== false,
    scaleId = doc.settings?.grainScale || 'clastic',
    interactive = true,
    title = null,
    // Fit the whole sheet inside whatever box it is given, centred. The screen
    // wants the top of the column pinned to the top of the pane and scrolls
    // for the rest; a page has no scroll and wants the lot.
    fit = false,
  } = opts;

  const layout = layoutColumn(doc);
  const cols = columnsOf({ descriptions });
  const scale = grainScale(scaleId);
  const pxPerM = pixelsPerMetre(doc, layout);
  const bodyH = Math.max(120, layout.total * pxPerM);
  const height = GEOM.head + bodyH + GEOM.foot + (title ? 26 : 0);
  const topY = GEOM.head + (title ? 26 : 0);

  const node = svg('svg', {
    class: 'strat-svg',
    viewBox: `0 0 ${round(cols.width)} ${round(height)}`,
    width: cols.width,
    height,
    preserveAspectRatio: fit ? 'xMidYMid meet' : 'xMidYMin meet',
    xmlns: 'http://www.w3.org/2000/svg',
  });

  const defs = svg('defs', {});
  node.appendChild(defs);
  node.appendChild(svg('rect', {
    x: 0, y: 0, width: cols.width, height, fill: theme.paper,
  }));

  if (title) {
    node.appendChild(text(title, cols.bracket, 18, {
      fill: theme.ink, 'font-size': 14, 'font-weight': 700,
    }));
  }

  // --- the grain-size axis -------------------------------------------------
  node.appendChild(grainAxis(scale, cols, topY, theme));

  // --- guide lines down the lithology box ----------------------------------
  const guides = svg('g', {});
  for (let i = 1; i < scale.steps.length; i++) {
    const x = cols.lith + (i / scale.steps.length) * GEOM.lith;
    guides.appendChild(svg('line', {
      x1: round(x), y1: topY, x2: round(x), y2: round(topY + bodyH),
      stroke: theme.line,
      'stroke-width': scale.majors.includes(scale.steps[i].id) ? 0.8 : 0.4,
      'stroke-opacity': 0.55,
    }));
  }
  node.appendChild(guides);

  // --- the metre rule ------------------------------------------------------
  node.appendChild(metreRule(layout, cols, topY, bodyH, pxPerM, theme));

  // --- one group per unit --------------------------------------------------
  const patterns = new Set();
  const body = svg('g', { class: 'strat-body' });
  layout.rows.forEach((row, i) => {
    body.appendChild(unitRow(doc, row, {
      cols, topY, pxPerM, scale, theme, selectedId, descriptions,
      interactive, layout, patterns, defs,
      // The unit beneath, because the contact between them is drawn only as
      // wide as the wider of the two.
      next: layout.rows[i + 1] || null,
    }));
  });
  node.appendChild(body);

  // --- the base of the column ----------------------------------------------
  // As wide as the lowest unit and no wider, for the same reason its contacts
  // are: the sheet should not draw rock where there is none.
  if (layout.rows.length) {
    const last = layout.rows[layout.rows.length - 1].unit;
    node.appendChild(svg('line', {
      x1: cols.lith, y1: round(topY + bodyH),
      x2: round(edgeX(last, scale, cols, 0)), y2: round(topY + bodyH),
      stroke: theme.ink, 'stroke-width': 1.6,
    }));
  }

  // --- formation and group brackets ---------------------------------------
  for (const g of layout.groups) {
    node.appendChild(bracket(g, cols, topY, pxPerM, theme));
  }

  // --- the marks -----------------------------------------------------------
  if (showMarks) node.appendChild(markGutter(doc, layout, cols, topY, pxPerM, theme));

  return {
    node,
    layout,
    geom: { cols, topY, pxPerM, bodyH, height, width: cols.width, scale, descriptions },
  };
}

/**
 * How tall a metre is.
 *
 * A section is drawn at a scale and the scale is the point, so the setting is
 * in metres per 100 px — the number that goes in the caption. Zero means fit
 * the whole column on one screenful, which is what somebody wants the first
 * time they open it and before they have any thicknesses at all.
 */
export function pixelsPerMetre(doc, layout = layoutColumn(doc)) {
  const set = Number(doc.settings?.columnScale) || 0;
  if (set > 0) return clamp(100 / set, 0.05, 60);
  if (!layout.total) return 1;
  return clamp(820 / layout.total, 0.05, 60);
}

// ---------------------------------------------------------------------------

function grainAxis(scale, cols, topY, theme) {
  const g = svg('g', { class: 'strat-axis' });
  const n = scale.steps.length;
  const w = GEOM.lith / n;

  g.appendChild(text(scale.label, cols.lith, topY - 34, {
    fill: theme.faint, 'font-size': 9.5, 'letter-spacing': 0.6,
  }));

  for (let i = 0; i < n; i++) {
    const x = cols.lith + i * w;
    const major = scale.majors.includes(scale.steps[i].id);
    g.appendChild(svg('line', {
      x1: round(x), y1: round(topY - 9), x2: round(x), y2: topY,
      stroke: major ? theme.rule : theme.line, 'stroke-width': major ? 1 : 0.6,
    }));
    g.appendChild(text(scale.steps[i].short, round(x + w / 2), round(topY - 13), {
      fill: theme.dim, 'font-size': 8.5, 'text-anchor': 'middle',
    }));
  }
  g.appendChild(svg('line', {
    x1: cols.lith, y1: topY, x2: round(cols.lith + GEOM.lith), y2: topY,
    stroke: theme.ink, 'stroke-width': 1.2,
  }));

  // The headings for the other columns, so a reader knows what each one is.
  for (const [label, x, anchor] of [
    ['Height m', cols.scale + 2, 'start'],
    ['Marks', cols.marks + 4, 'start'],
    ['Unit', cols.name + 2, 'start'],
    ['Description', cols.desc + 2, 'start'],
  ]) {
    if (x >= cols.right) continue;
    g.appendChild(text(label, round(x), round(topY - 5), {
      fill: theme.faint, 'font-size': 8.5, 'text-anchor': anchor,
      'letter-spacing': 0.5,
    }));
  }
  return g;
}

/**
 * The metre rule down the left of the lithology.
 *
 * Labelled with height above the base of the column rather than depth from the
 * top, because that is how a section is measured — you start at the bottom and
 * walk up — and because the number a student writes in their notebook next to
 * a bed is its height on the tape.
 */
function metreRule(layout, cols, topY, bodyH, pxPerM, theme) {
  const g = svg('g', { class: 'strat-rule' });
  const x = round(cols.lith - 1);
  g.appendChild(svg('line', {
    x1: x, y1: topY, x2: x, y2: round(topY + bodyH), stroke: theme.rule, 'stroke-width': 1,
  }));
  if (!layout.total) return g;

  const step = niceStep(layout.total, bodyH);
  for (let h = 0; h <= layout.total + 1e-6; h += step) {
    const y = round(topY + bodyH - h * pxPerM);
    g.appendChild(svg('line', {
      x1: round(x - 5), y1: y, x2: x, y2: y, stroke: theme.rule, 'stroke-width': 0.8,
    }));
    g.appendChild(text(String(Math.round(h)), round(x - 7), round(y + 3), {
      fill: theme.faint, 'font-size': 8.5, 'text-anchor': 'end',
    }));
  }
  return g;
}

/** A tick spacing that is a round number and lands ticks 34px or more apart. */
function niceStep(total, bodyH) {
  const want = total * (34 / Math.max(1, bodyH));
  const pow = 10 ** Math.floor(Math.log10(Math.max(1e-6, want)));
  for (const m of [1, 2, 5, 10]) if (pow * m >= want) return pow * m;
  return pow * 10;
}

// ---------------------------------------------------------------------------

function unitRow(doc, row, ctx) {
  const {
    cols, topY, pxPerM, scale, theme, selectedId, descriptions, interactive, patterns, defs,
  } = ctx;
  const u = row.unit;
  const y0 = topY + row.top * pxPerM;
  const y1 = topY + row.base * pxPerM;
  const h = Math.max(1, y1 - y0);
  const selected = u.id === selectedId;

  const g = svg('g', {
    class: `strat-unit${selected ? ' selected' : ''}${row.known ? '' : ' unknown'}`,
    'data-unit': u.id,
  });

  // The right edge of the box is the grain size, sampled up the unit. This is
  // the profile — the shape the whole drawing exists to show — so it is built
  // as a real polyline rather than as one width per unit.
  const edge = profileEdge(u, scale, cols, y0, y1);
  const d = `M ${round(cols.lith)} ${round(y0)} ${edge} L ${round(cols.lith)} ${round(y1)} Z`;

  const rk = ROCK_BY_ID[u.rockId] || ROCK_BY_ID.sandstone;
  const fillColor = unitColor(u);
  const patId = `lith-${rk.pattern}-${fillColor.replace(/[^a-z0-9]/gi, '')}`;
  if (!patterns.has(patId)) {
    patterns.add(patId);
    const pat = svg('pattern', {
      id: patId, width: TILE, height: TILE, patternUnits: 'userSpaceOnUse',
    }, [svg('image', { href: tileURL(fillColor, rk.pattern), width: TILE, height: TILE })]);
    // href without the namespace is SVG 2 and every current browser takes it;
    // the xlink form is what older drawing programs read out of a saved file.
    pat.firstChild.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href',
      tileURL(fillColor, rk.pattern));
    defs.appendChild(pat);
  }

  g.appendChild(svg('path', {
    d, fill: `url(#${patId})`,
    stroke: 'none',
    class: 'strat-lith',
  }));
  // The outline goes on separately so a unit whose thickness is a placeholder
  // can be drawn dashed without the ornament inside it going dashed too.
  g.appendChild(svg('path', {
    d, fill: 'none',
    stroke: selected ? theme.accent : theme.ink,
    'stroke-width': selected ? 2 : 0.9,
    'stroke-dasharray': row.known ? null : '4 3',
  }));

  // The base of the unit, drawn the way the student said it sits on the one
  // below. This is the line that carries the sequence stratigraphy, and a
  // column that draws every contact as the same rule has thrown that away.
  //
  // It stops where the rock does. Running every contact to the coarse end of
  // the axis draws a grid across the empty half of the sheet and, worse, makes
  // a mudstone look as though it once extended to boulder grade.
  if (ctx.next) {
    const x1 = Math.max(edgeX(u, scale, cols, 0), edgeX(ctx.next.unit, scale, cols, 1));
    g.appendChild(contactLine(u.contactBelow, cols.lith, x1, y1, theme));
  }

  // --- the name, and the thickness under it -------------------------------
  //
  // Under the name rather than in the height column, which belongs to the
  // rule. Two sets of numbers a few pixels apart, one of them cumulative and
  // one of them not, is how a section gets misread.
  if (h > 9) {
    const lines = wrap(u.name || 'unnamed', 15, 2);
    const showThickness = h > 21;
    const block = lines.length + (showThickness ? 1 : 0);
    let ty = (y0 + y1) / 2 - (block - 1) * 5.5 + 3.5;
    for (const line of lines) {
      g.appendChild(text(line, round(cols.name + 3), round(ty), {
        fill: u.name ? theme.ink : theme.faint,
        'font-size': 10.5, 'font-weight': 600,
      }));
      ty += 11;
    }
    if (showThickness) {
      const parts = [row.known ? `${fmtThickness(row.thickness)} m` : 'thickness?'];
      if (u.rank && u.rank !== 'formation') parts.push(rankLabel(u.rank).toLowerCase());
      const line = text(parts.join(' · '), round(cols.name + 3), round(ty), {
        fill: row.known ? theme.faint : theme.warn, 'font-size': 8.5,
      });
      g.appendChild(line);
      // A number that came from a model rather than from a tape is a different
      // kind of claim, and the person reading the section has to be able to see
      // which is which without opening a panel.
      if (u.thicknessSource === 'block' && row.known) {
        g.appendChild(svg('circle', {
          cx: round(cols.name - 3), cy: round(ty - 3), r: 2.3, fill: theme.model,
        }));
      }
      if (row.disagreement) {
        g.appendChild(svg('circle', {
          cx: round(cols.name - 3), cy: round(ty - 3), r: 2.6,
          fill: 'none', stroke: theme.warn, 'stroke-width': 1.2,
        }));
      }
    }
  }

  if (descriptions && u.description && h > 12) {
    const maxLines = Math.max(1, Math.floor((h - 4) / 10.5));
    const lines = wrap(u.description, 30, maxLines);
    let ty = y0 + 11;
    for (const line of lines) {
      g.appendChild(text(line, round(cols.desc + 3), round(ty), {
        fill: theme.dim, 'font-size': 9,
      }));
      ty += 10.5;
    }
  }

  // A transparent plate over the whole row, so a tap anywhere on it selects
  // the unit — including in the empty part of the lithology box, which is
  // most of it for a mudstone and would otherwise be a dead zone.
  if (interactive) {
    g.appendChild(svg('rect', {
      x: cols.bracket, y: round(y0), width: round(cols.right - cols.bracket), height: round(h),
      fill: 'transparent', class: 'strat-hit',
    }));
  }
  return g;
}

/**
 * The right-hand edge of a unit's box, as a path fragment.
 *
 * Walks the profile from the base of the unit upward and emits a vertex per
 * point, so a coarsening-up unit comes out as a ramp and a sharp-based one as
 * a step. Drawn base-first because that is the direction the profile is stored
 * in and the direction a section is measured in; the path is being built down
 * the page, so the points come out in reverse.
 */
function profileEdge(unit, scale, cols, y0, y1) {
  const prof = grainProfile(unit, scale.id);
  const n = scale.steps.length;
  const xOf = (g) => cols.lith + ((g + 1) / n) * GEOM.lith;
  const yOf = (at) => y1 - at * (y1 - y0);

  const parts = [];
  // Top of the unit first: the topmost profile point governs the top edge.
  const top = prof[prof.length - 1];
  parts.push(`L ${round(xOf(top.g))} ${round(y0)}`);
  for (let i = prof.length - 1; i >= 0; i--) {
    parts.push(`L ${round(xOf(prof[i].g))} ${round(yOf(prof[i].at))}`);
    // A point at the same height as the next one down is a sharp break: step
    // across at that height rather than ramping into it.
    if (i > 0 && Math.abs(prof[i].at - prof[i - 1].at) < 1e-6) {
      parts.push(`L ${round(xOf(prof[i - 1].g))} ${round(yOf(prof[i].at))}`);
    }
  }
  parts.push(`L ${round(xOf(prof[0].g))} ${round(y1)}`);
  return parts.join(' ');
}

/** Where a unit's right-hand edge sits at a height in it, in drawing units. */
function edgeX(unit, scale, cols, at) {
  const n = scale.steps.length;
  const g = grainAt(grainProfile(unit, scale.id), at);
  return cols.lith + ((g + 1) / n) * GEOM.lith;
}

/** The line at the base of a unit, drawn as the kind of contact it is. */
function contactLine(style, x0, x1, y, theme) {
  const def = CONTACT_STYLE_BY_ID[style] ? style : 'conformable';
  const w = x1 - x0;
  const common = { stroke: theme.ink, fill: 'none' };

  if (def === 'gradational') {
    return svg('line', { x1: round(x0), y1: round(y), x2: round(x1), y2: round(y),
      ...common, 'stroke-width': 0.9, 'stroke-dasharray': '5 4' });
  }
  if (def === 'covered') {
    return svg('line', { x1: round(x0), y1: round(y), x2: round(x1), y2: round(y),
      ...common, stroke: theme.faint, 'stroke-width': 1, 'stroke-dasharray': '1.5 3.5' });
  }
  if (def === 'sharp') {
    return svg('line', { x1: round(x0), y1: round(y), x2: round(x1), y2: round(y),
      ...common, 'stroke-width': 1.8 });
  }
  if (def === 'fault') {
    const g = svg('g', {});
    g.appendChild(svg('line', { x1: round(x0), y1: round(y), x2: round(x1), y2: round(y),
      ...common, 'stroke-width': 2.2 }));
    // Two short ticks, the way a fault is marked on a section.
    for (const t of [0.34, 0.66]) {
      const x = x0 + w * t;
      g.appendChild(svg('line', { x1: round(x), y1: round(y - 3.5), x2: round(x), y2: round(y + 3.5),
        ...common, 'stroke-width': 1.4 }));
    }
    return g;
  }
  if (def === 'conformable') {
    return svg('line', { x1: round(x0), y1: round(y), x2: round(x1), y2: round(y),
      ...common, 'stroke-width': 0.9 });
  }
  // Erosional and unconformable are both cut surfaces; the unconformity is
  // drawn with a longer wavelength and a heavier line, which is the difference
  // between "a channel scoured this" and "time is missing here".
  const amp = def === 'unconformity' ? 3.2 : 1.9;
  const len = def === 'unconformity' ? 15 : 9;
  const parts = [`M ${round(x0)} ${round(y)}`];
  for (let x = x0; x < x1 - 0.1; x += len) {
    const nx = Math.min(x1, x + len);
    parts.push(`Q ${round((x + nx) / 2)} ${round(y - amp)} ${round(nx)} ${round(y)}`);
  }
  return svg('path', {
    d: parts.join(' '), ...common,
    'stroke-width': def === 'unconformity' ? 1.8 : 1.1,
  });
}

// ---------------------------------------------------------------------------

/**
 * A formation's bracket beside its members.
 *
 * The whole reason the column knows about rank. "The Poleta has eight units"
 * is one line and eight boxes, and a drawing that can only show a flat list of
 * nine things has quietly answered a different question.
 */
function bracket(group, cols, topY, pxPerM, theme) {
  const y0 = topY + group.top * pxPerM;
  const y1 = topY + group.base * pxPerM;
  const x = cols.bracket + GEOM.bracket - 10;
  const g = svg('g', { class: 'strat-bracket', 'data-unit': group.unit.id });

  g.appendChild(svg('path', {
    d: `M ${round(x + 4)} ${round(y0)} H ${round(x)} V ${round(y1)} H ${round(x + 4)}`,
    fill: 'none', stroke: group.broken ? theme.warn : theme.dim,
    'stroke-width': 1.2,
    'stroke-dasharray': group.broken ? '4 3' : null,
  }));

  // Up the side, reading bottom to top, which is how a spine is read and how
  // every published log sets a formation name.
  const cy = (y0 + y1) / 2;
  const room = Math.max(0, y1 - y0 - 8);
  const name = group.unit.name || 'unnamed';
  const label = room < name.length * 6 ? clip(name, Math.floor(room / 6)) : name;
  if (room > 24) {
    g.appendChild(text(label, 0, 0, {
      fill: theme.ink, 'font-size': 10.5, 'font-weight': 650, 'text-anchor': 'middle',
      transform: `translate(${round(x - 4)} ${round(cy)}) rotate(-90)`,
    }));
  }

  // The bracket carries the total, since a formation's thickness is the sum of
  // its members and nobody should be adding eight numbers by hand.
  if (room > 60) {
    g.appendChild(text(`${fmtThickness(group.thickness)} m${group.allKnown ? '' : '+'}`, 0, 0, {
      fill: theme.faint, 'font-size': 8.5, 'text-anchor': 'middle',
      transform: `translate(${round(x + 9)} ${round(cy)}) rotate(-90)`,
    }));
  }
  return g;
}

// ---------------------------------------------------------------------------

/**
 * Fossils, traces and structures, in their own gutter.
 *
 * Laid out in lanes rather than at their exact height alone: a shelly bed with
 * four things recorded in it would otherwise be four symbols on top of each
 * other. The lane assignment is greedy from the left and the height is kept —
 * a symbol never moves up or down the section to make room, because its height
 * is the observation.
 */
function markGutter(doc, layout, cols, topY, pxPerM, theme) {
  const g = svg('g', { class: 'strat-marks' });
  const rowFor = new Map(layout.rows.map((r) => [r.unit.id, r]));
  const size = 14;
  const lanes = [];      // last y used in each lane

  const placed = (doc.marks || [])
    .map((m) => {
      const row = rowFor.get(m.unitId);
      if (!row) return null;
      const y = topY + (row.base - m.at * row.thickness) * pxPerM;
      return { mark: m, y };
    })
    .filter(Boolean)
    .sort((a, b) => a.y - b.y);

  const maxLanes = Math.max(1, Math.floor(GEOM.marks / (size + 3)));
  for (const { mark, y } of placed) {
    if (!SYMBOL_BY_ID[mark.symbol]) continue;
    let lane = 0;
    while (lane < maxLanes && lanes[lane] != null && y - lanes[lane] < size) lane++;
    if (lane >= maxLanes) lane = maxLanes - 1;
    lanes[lane] = y;
    const x = cols.marks + 6 + lane * (size + 3) + size / 2;
    const node = symbolGroup(mark.symbol, x, y, size);
    if (!node) continue;
    node.setAttribute('data-mark', mark.id);
    node.setAttribute('stroke', theme.ink);
    node.setAttribute('fill', theme.ink);
    g.appendChild(node);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

/**
 * Every symbol actually on the sheet, and nothing else.
 *
 * A legend listing forty symbols of which six are used is not a legend, it is
 * a catalogue, and it teaches a student that a legend is boilerplate rather
 * than a promise that everything drawn has been named.
 */
export function legendEntries(doc) {
  const counts = new Map();
  for (const m of doc.marks || []) {
    if (!SYMBOL_BY_ID[m.symbol]) continue;
    counts.set(m.symbol, (counts.get(m.symbol) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, n]) => ({ id, label: symbolLabel(id), count: n }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The rocks in the column, for the lithology half of the legend.
 *
 * Leaves only. A formation with members in it has a rock type on it like every
 * other unit, but it does not draw a box, so putting it in the legend would
 * explain an ornament that appears nowhere on the sheet.
 */
export function lithologyEntries(doc) {
  const seen = new Map();
  for (const u of (doc.units || []).filter((u) => isLeaf(doc, u))) {
    const rk = ROCK_BY_ID[u.rockId] || ROCK_BY_ID.sandstone;
    const key = `${rk.id}|${unitColor(u)}`;
    if (!seen.has(key)) seen.set(key, { rock: rk, color: unitColor(u), count: 0 });
    seen.get(key).count++;
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * The section as a file.
 *
 * Redrawn in the print palette rather than recoloured afterwards, and with the
 * symbol styling written into the file: on screen those rules come from the
 * stylesheet, and a stylesheet is exactly what an exported drawing does not
 * take with it. The legend goes underneath, because a section handed in
 * without one is not finished.
 */
export function columnSVGText(doc, opts = {}) {
  const built = buildColumn(doc, {
    ...opts,
    theme: PRINT_THEME,
    interactive: false,
    selectedId: null,
    title: doc.name || 'Stratigraphic section',
  });
  const { node, geom } = built;

  const legend = legendEntries(doc);
  const liths = lithologyEntries(doc);
  const rows = Math.max(legend.length, liths.length);
  const legendH = rows ? 34 + rows * 17 : 0;
  const totalH = geom.height + legendH;

  node.setAttribute('height', totalH);
  node.setAttribute('viewBox', `0 0 ${round(geom.width)} ${round(totalH)}`);
  const bg = node.querySelector('rect');
  if (bg) bg.setAttribute('height', totalH);

  if (rows) {
    node.appendChild(legendBlock(doc, legend, liths, geom, PRINT_THEME));
  }

  // A caption, because a section with no scale on it cannot be read off the
  // page and a printed one has no slider to check.
  //
  // The ratio is worth stating alongside the metres because that is the number
  // a figure caption wants, and it is derivable: an SVG user unit is 1/96 inch,
  // so the printed length of the column is fixed as soon as the file is placed
  // at actual size. Stated with that condition on it rather than as a bare
  // ratio, since scaling the figure to fit a page changes it.
  const mPer100 = 100 / geom.pxPerM;
  const ratio = Math.round(mPer100 * 1000 / (100 / 96 * 25.4));
  const n = built.layout.unknown;
  node.appendChild(text(
    `Vertical scale ${fmtThickness(mPer100)} m per 100 units — about 1:${ratio} printed at `
    + `actual size. Total ${fmtThickness(built.layout.total)} m in `
    + `${built.layout.rows.length} unit${built.layout.rows.length === 1 ? '' : 's'}.`
    + (n ? `  ${n} thickness${n === 1 ? '' : 'es'} not measured.` : ''),
    GEOM.padL, round(totalH - 5), { fill: PRINT_THEME.faint, 'font-size': 8.5 },
  ));

  const style = svg('style', {});
  style.textContent = `.sym-line{fill:none;stroke:${PRINT_THEME.ink};stroke-width:1.3;`
    + 'stroke-linecap:round;stroke-linejoin:round}'
    + `.sym-fill{fill:${PRINT_THEME.ink};stroke:none}`
    + `.sym-fill.soft{fill:${PRINT_THEME.ink};fill-opacity:.12}`
    + 'text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}';
  node.insertBefore(style, node.firstChild);

  const out = new XMLSerializer().serializeToString(node);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${out}`;
}

function legendBlock(doc, legend, liths, geom, theme) {
  const g = svg('g', {});
  const y0 = geom.height + 8;
  g.appendChild(svg('line', {
    x1: GEOM.padL, y1: round(y0 - 6), x2: round(geom.width - GEOM.padR), y2: round(y0 - 6),
    stroke: theme.line, 'stroke-width': 0.8,
  }));
  g.appendChild(text('Explanation', GEOM.padL, round(y0 + 8), {
    fill: theme.ink, 'font-size': 11, 'font-weight': 700,
  }));

  const colW = (geom.width - GEOM.padL - GEOM.padR) / 2;
  liths.forEach((l, i) => {
    const y = y0 + 26 + i * 17;
    g.appendChild(svg('rect', {
      x: GEOM.padL, y: round(y - 8), width: 20, height: 12,
      fill: `url(#lith-${l.rock.pattern}-${l.color.replace(/[^a-z0-9]/gi, '')})`,
      stroke: theme.ink, 'stroke-width': 0.7,
    }));
    g.appendChild(text(l.rock.label, GEOM.padL + 26, round(y + 1),
      { fill: theme.dim, 'font-size': 9.5 }));
  });
  legend.forEach((e, i) => {
    const y = y0 + 26 + i * 17;
    const x = GEOM.padL + colW;
    const sym = symbolGroup(e.id, x + 10, y - 2, 15);
    if (sym) g.appendChild(sym);
    g.appendChild(text(`${e.label}${e.count > 1 ? ` (${e.count})` : ''}`, round(x + 24), round(y + 1),
      { fill: theme.dim, 'font-size': 9.5 }));
  });
  return g;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function text(str, x, y, attrs = {}) {
  return svg('text', { x, y, 'font-family': 'inherit', ...attrs, text: str });
}

/** Break a string into at most `max` lines of about `per` characters. */
function wrap(str, per, max) {
  const words = String(str).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (!line) { line = w; continue; }
    if (line.length + 1 + w.length <= per) line += ` ${w}`;
    else { lines.push(line); line = w; if (lines.length === max) break; }
  }
  if (line && lines.length < max) lines.push(line);
  if (lines.length === max) {
    const used = lines.join(' ').split(/\s+/).length;
    if (used < words.length) lines[max - 1] = clip(lines[max - 1], per);
  }
  return lines.length ? lines : [''];
}

function clip(s, n) {
  if (n <= 1) return '';
  return s.length <= n ? s : `${s.slice(0, Math.max(1, n - 1))}…`;
}

/** Thicknesses are read off a tape, not a micrometer. */
export function fmtThickness(v) {
  if (!Number.isFinite(v)) return '?';
  if (v >= 100) return String(Math.round(v));
  if (v >= 10) return String(Math.round(v * 10) / 10);
  return String(Math.round(v * 100) / 100);
}

function round(v, dp = 2) {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
