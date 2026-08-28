// The marks that go in the margin of a measured section.
//
// A column with no symbols on it is a bar chart of thicknesses. What makes it
// a geological document is the row of little drawings beside each unit saying
// what was in the rock and what the rock was doing — trough cross-beds here,
// burrowed to destruction there, a shelly bed at the top of the shallowing-up
// cycle. That is the interpretation, and it is the part a student is actually
// being taught to record.
//
// Drawn rather than borrowed from a font for the same reason the tab icons
// are: these are conventional marks with conventional meanings, and a symbol
// that merely gestures at a fossil is worse than none, because the reader will
// believe it. Each one here is the shape that appears in a published log, cut
// down to what survives at fourteen pixels on a phone.
//
// Everything draws inside a 20 x 20 box with its origin at the top left, and
// takes its colour from `currentColor`, so one symbol serves the column, the
// palette and the legend without being redrawn at three sizes.

import { svg } from '../widgets.js';

const BOX = 20;

const p = (d, extra = {}) => svg('path', { d, class: 'sym-line', ...extra });
const fill = (d) => svg('path', { d, class: 'sym-fill' });
const c = (cx, cy, r) => svg('circle', { cx, cy, r, class: 'sym-line' });
const dot = (cx, cy, r) => svg('circle', { cx, cy, r, class: 'sym-fill' });
const ell = (cx, cy, rx, ry, rot = 0) =>
  svg('ellipse', { cx, cy, rx, ry, class: 'sym-line', transform: `rotate(${rot} ${cx} ${cy})` });

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------
// Order within a category is roughly the order a sedimentology course meets
// them, which is more use in a palette than alphabetical would be.

export const SYMBOLS = [
  // --- body fossils -------------------------------------------------------
  {
    id: 'shelly', label: 'Shelly / bioclasts', category: 'fossil',
    draw: () => [
      p('M2 13 Q 5 8 8 13'), p('M11 8 Q 14 3 17 8'), p('M9 17 Q 12 12 15 17'),
    ],
  },
  {
    id: 'brachiopod', label: 'Brachiopod', category: 'fossil',
    draw: () => [
      p('M4 12 Q 10 4 16 12'), p('M4 12 Q 10 16 16 12'), p('M10 4 V6'),
    ],
  },
  {
    id: 'bivalve', label: 'Bivalve', category: 'fossil',
    draw: () => [
      p('M3 14 Q 10 3 17 14 Q 10 17 3 14 Z'),
      p('M10 4 L6.5 14 M10 4 L10 15 M10 4 L13.5 14'),
    ],
  },
  {
    id: 'gastropod', label: 'Gastropod', category: 'fossil',
    draw: () => [
      p('M14 12 A 5 5 0 1 1 9.6 7.1 A 3.2 3.2 0 1 1 11.4 12.6 A 1.6 1.6 0 1 1 11 10.6'),
    ],
  },
  {
    id: 'ammonite', label: 'Ammonite / cephalopod', category: 'fossil',
    draw: () => [
      p('M16 10 A 6 6 0 1 1 10 4 A 4 4 0 1 1 13.5 10 A 2 2 0 1 1 11 8.4'),
      p('M10 4 V6.2 M16 10 H13.8'),
    ],
  },
  {
    id: 'trilobite', label: 'Trilobite', category: 'fossil',
    draw: () => [
      p('M10 3 Q 16 6 15 12 Q 13 17 10 17 Q 7 17 5 12 Q 4 6 10 3 Z'),
      p('M7.6 5.4 V15.4 M12.4 5.4 V15.4'), p('M5.2 8 H14.8 M5 11 H15'),
    ],
  },
  {
    id: 'crinoid', label: 'Crinoid', category: 'fossil',
    draw: () => [
      c(10, 6.5, 3), p('M10 9.5 V17'),
      p('M7.4 11.5 H12.6 M7.4 14 H12.6'), p('M8 5 H12 M10 4 V9'),
    ],
  },
  {
    id: 'coral', label: 'Coral', category: 'fossil',
    draw: () => [
      p('M5 17 Q 5 7 10 4 Q 15 7 15 17'),
      p('M10 4 V17 M7.2 9 V17 M12.8 9 V17'),
    ],
  },
  {
    id: 'bryozoan', label: 'Bryozoan', category: 'fossil',
    draw: () => [
      p('M4 16 Q 6 10 5 4 M10 17 Q 12 10 11 3 M15 16 Q 17 11 16 6'),
      p('M4.6 10 H10.6 M5 13.5 H11'),
    ],
  },
  {
    id: 'foram', label: 'Foraminifera', category: 'fossil',
    draw: () => [c(7, 12, 3.4), c(12.6, 9.4, 2.4), c(15.6, 6.4, 1.6)],
  },
  {
    id: 'plant', label: 'Plant debris', category: 'fossil',
    draw: () => [
      p('M10 17 Q 9 9 12 3'),
      p('M10.6 13 Q 6 12 5 8.5 M11 9.5 Q 15.5 8 16 4.5'),
    ],
  },
  {
    id: 'wood', label: 'Wood / lignite', category: 'fossil',
    draw: () => [
      p('M3 8 H17 L15 12 H5 Z'), p('M6 8 V12 M9 8 V12 M12 8 V12'),
    ],
  },
  {
    id: 'root', label: 'Root traces', category: 'fossil',
    draw: () => [
      p('M10 3 V9 Q 10 13 7 17 M10 9 Q 11 13 14 16 M10 6 Q 12.5 7.5 13.5 6'),
    ],
  },
  {
    id: 'stromatolite', label: 'Stromatolite', category: 'fossil',
    draw: () => [
      p('M3 16 Q 6.5 6 10 16 Q 13.5 6 17 16'),
      p('M4.6 16 Q 6.5 10 8.4 16 M11.6 16 Q 13.5 10 15.4 16'),
    ],
  },
  {
    id: 'ooid', label: 'Ooids', category: 'fossil',
    draw: () => [c(6.5, 8, 2.6), c(13, 7, 2.2), c(9.5, 13.5, 2.4),
      dot(6.5, 8, 0.8), dot(13, 7, 0.7), dot(9.5, 13.5, 0.8)],
  },
  {
    id: 'intraclast', label: 'Intraclasts / rip-ups', category: 'fossil',
    draw: () => [
      ell(6.5, 8, 3.6, 1.7, -14), ell(13.5, 12, 3.4, 1.6, 12), ell(11, 6, 2.6, 1.3, 8),
    ],
  },
  {
    id: 'vertebrate', label: 'Bone / vertebrate', category: 'fossil',
    draw: () => [
      p('M5 13 Q 3 13 3 11 Q 3 9 5 9.4 L15 6.6 Q 17 6 17 8 Q 17 10 15 10 Z'),
    ],
  },

  // --- trace fossils ------------------------------------------------------
  {
    id: 'burrow', label: 'Burrows (undifferentiated)', category: 'trace',
    draw: () => [p('M6 4 V16 M10 6 V16 M14 3 V13')],
  },
  {
    id: 'skolithos', label: 'Skolithos', category: 'trace',
    draw: () => [
      p('M6 3 V17 M10 3 V17 M14 3 V17'),
      p('M4.6 3 H7.4 M8.6 3 H11.4 M12.6 3 H15.4'),
    ],
  },
  {
    id: 'planolites', label: 'Planolites', category: 'trace',
    draw: () => [
      p('M3 7 Q 8 4 13 8 Q 16 10 17 8'),
      p('M3 14 Q 7 11 11 14 Q 15 17 17 13'),
    ],
  },
  {
    id: 'thalassinoides', label: 'Thalassinoides', category: 'trace',
    draw: () => [
      p('M3 6 H9 Q 12 6 12 9 V17'),
      p('M12 9 H17'), p('M7 6 V13 H3'),
    ],
  },
  {
    id: 'ophiomorpha', label: 'Ophiomorpha', category: 'trace',
    draw: () => [
      p('M8 3 V17'),
      dot(6.4, 5, 0.9), dot(9.6, 6.6, 0.9), dot(6.4, 9, 0.9),
      dot(9.6, 11, 0.9), dot(6.4, 13.4, 0.9), dot(9.6, 15.2, 0.9),
      p('M14 6 V15'), dot(12.7, 8, 0.8), dot(15.3, 11, 0.8),
    ],
  },
  {
    id: 'chondrites', label: 'Chondrites', category: 'trace',
    draw: () => [
      p('M10 3 V9'),
      p('M10 9 L5 16 M10 9 L10 17 M10 9 L15 16'),
      p('M7.5 12.5 L5.5 12 M12.5 12.5 L14.5 12'),
    ],
  },
  {
    id: 'zoophycos', label: 'Zoophycos', category: 'trace',
    draw: () => [
      p('M3 12 Q 10 4 17 12'),
      p('M4.6 12.6 Q 10 6.4 15.4 12.6'), p('M6.4 13.4 Q 10 9 13.6 13.4'),
    ],
  },
  {
    id: 'diplocraterion', label: 'Diplocraterion', category: 'trace',
    draw: () => [
      p('M6 4 V13 Q 6 16 10 16 Q 14 16 14 13 V4'),
      p('M8 6 Q 10 8 12 6 M8 9 Q 10 11 12 9'),
    ],
  },
  {
    id: 'escape', label: 'Escape trace', category: 'trace',
    draw: () => [
      p('M10 17 V4'),
      p('M7 14 Q 10 12 13 14 M7 11 Q 10 9 13 11 M7 8 Q 10 6 13 8'),
    ],
  },
  {
    id: 'bioturbation', label: 'Bioturbated', category: 'trace',
    draw: () => [
      p('M3 8 Q 6 4 9 8 Q 12 12 15 8 Q 16.5 6 17 7'),
      p('M3 14 Q 6 10 9 14 Q 12 18 15 14'),
      p('M7 3 Q 8 6 6 8'), p('M13 17 Q 12 14 14 12'),
    ],
  },
  {
    id: 'trackway', label: 'Tracks / trails', category: 'trace',
    draw: () => [
      ell(6, 6, 1.7, 1.1, 20), ell(12, 8.5, 1.7, 1.1, 20),
      ell(6.6, 12, 1.7, 1.1, 20), ell(12.6, 14.5, 1.7, 1.1, 20),
    ],
  },

  // --- sedimentary structures ---------------------------------------------
  {
    id: 'lamination', label: 'Planar lamination', category: 'structure',
    draw: () => [p('M3 6 H17 M3 9 H17 M3 12 H17 M3 15 H17')],
  },
  {
    id: 'massive', label: 'Massive / structureless', category: 'structure',
    draw: () => [p('M4 4 H16 V16 H4 Z'), p('M4 4 L16 16 M16 4 L4 16')],
  },
  {
    id: 'trough', label: 'Trough cross-beds', category: 'structure',
    draw: () => [
      p('M3 7 Q 6.5 13 10 7'), p('M4.6 7 Q 6.5 10.6 8.4 7'),
      p('M10 12 Q 13.5 18 17 12'), p('M11.6 12 Q 13.5 15.6 15.4 12'),
      p('M10 7 Q 13.5 13 17 7'),
    ],
  },
  {
    id: 'planarxbed', label: 'Planar cross-beds', category: 'structure',
    draw: () => [
      p('M3 6 H17 M3 11 H17 M3 16 H17'),
      p('M5 11 L8.5 6 M8 11 L11.5 6 M11 11 L14.5 6'),
      p('M5 16 L8.5 11 M8 16 L11.5 11 M11 16 L14.5 11'),
    ],
  },
  {
    id: 'ripplexlam', label: 'Ripple cross-lamination', category: 'structure',
    draw: () => [
      p('M3 8 Q 6 4 9 8 Q 12 12 15 8 Q 16 6.6 17 7'),
      p('M3 14 Q 6 10 9 14 Q 12 18 15 14 Q 16 12.6 17 13'),
      p('M5.4 8 L7 5.6 M11.4 10 L13 7.6'),
    ],
  },
  {
    id: 'currentripple', label: 'Current ripples', category: 'structure',
    draw: () => [
      p('M3 13 L7 8 L9 13 L13 8 L15 13 L17 10'),
    ],
  },
  {
    id: 'waveripple', label: 'Wave ripples', category: 'structure',
    draw: () => [
      p('M3 13 Q 5.5 6 8 13 Q 10.5 6 13 13 Q 15.5 6 17 11'),
    ],
  },
  {
    id: 'hcs', label: 'Hummocky cross-strat', category: 'structure',
    draw: () => [
      p('M3 12 Q 7 6 11 11 Q 14 15 17 9'),
      p('M3 15 Q 7 9.5 11 14 Q 14 17.5 17 12'),
      p('M3 8.5 Q 7 3 11 7.5'),
    ],
  },
  {
    id: 'graded', label: 'Normal grading', category: 'structure',
    draw: () => [
      dot(6, 14.5, 1.5), dot(11, 15, 1.3), dot(15, 14, 1.1),
      dot(6.5, 10.5, 0.95), dot(11.5, 11, 0.85), dot(15.5, 10, 0.8),
      dot(5.5, 7, 0.6), dot(9, 7.4, 0.55), dot(12.5, 6.6, 0.5), dot(15.5, 7.2, 0.5),
      dot(7, 4.4, 0.4), dot(11, 4.6, 0.4), dot(14.5, 4.2, 0.4),
    ],
  },
  {
    id: 'reversegraded', label: 'Reverse grading', category: 'structure',
    draw: () => [
      dot(6, 5.5, 1.5), dot(11, 5, 1.3), dot(15, 6, 1.1),
      dot(6.5, 9.5, 0.95), dot(11.5, 9, 0.85), dot(15.5, 10, 0.8),
      dot(5.5, 13, 0.6), dot(9, 12.6, 0.55), dot(12.5, 13.4, 0.5), dot(15.5, 12.8, 0.5),
      dot(7, 15.6, 0.4), dot(11, 15.4, 0.4), dot(14.5, 15.8, 0.4),
    ],
  },
  {
    id: 'convolute', label: 'Convolute / soft-sediment', category: 'structure',
    draw: () => [
      p('M3 13 Q 5 5 8 12 Q 10 17 12 10 Q 14 4 17 12'),
      p('M3 16 Q 5 9 8 15.5 Q 10 19 12 13.5 Q 14 8 17 15'),
    ],
  },
  {
    id: 'flame', label: 'Flame / load casts', category: 'structure',
    draw: () => [
      p('M3 12 Q 5 12 6 7 Q 7 12 9 12 Q 11 12 12 6 Q 13 12 17 12'),
      p('M3 15.5 H17'),
    ],
  },
  {
    id: 'scour', label: 'Scour / erosive base', category: 'structure',
    draw: () => [
      p('M2 8 Q 6 14 10 8 Q 14 14 18 8'),
      p('M2 11.5 Q 6 17.5 10 11.5 Q 14 17.5 18 11.5'),
    ],
  },
  {
    id: 'mudcrack', label: 'Desiccation cracks', category: 'structure',
    draw: () => [
      p('M10 4 V10 M10 10 L4.5 15 M10 10 L16 14.5 M10 10 L10.5 17'),
      p('M3 6 L6.5 8.5 M17 6.5 L13.5 8.5'),
    ],
  },
  {
    id: 'nodule', label: 'Nodules / concretions', category: 'structure',
    draw: () => [
      ell(6.5, 8, 3.4, 2.2, -10), ell(13.5, 12.5, 3, 2, 12),
      svg('path', { d: 'M6.5 8 m -3.4 0 a 3.4 2.2 0 1 0 6.8 0 a 3.4 2.2 0 1 0 -6.8 0',
        class: 'sym-fill soft', transform: 'rotate(-10 6.5 8)' }),
    ],
  },
  {
    id: 'chert', label: 'Chert', category: 'structure',
    draw: () => [
      fill('M4 9 L7.5 6 L10 9.5 L6.6 12 Z'), fill('M11 12 L14.5 9.5 L16.5 13 L13 15 Z'),
    ],
  },
  {
    id: 'pyrite', label: 'Pyrite', category: 'structure',
    draw: () => [
      fill('M10 4 L13 7 L10 10 L7 7 Z'), fill('M6 12 L8 14 L6 16 L4 14 Z'),
      fill('M14.5 11.5 L16.5 13.5 L14.5 15.5 L12.5 13.5 Z'),
    ],
  },
  {
    id: 'glauconite', label: 'Glauconite', category: 'structure',
    draw: () => [dot(6, 7, 1.5), dot(12, 6, 1.2), dot(9, 12, 1.5), dot(14.5, 12.5, 1.3),
      dot(5, 14, 1.1)],
  },
  {
    id: 'gypsum', label: 'Gypsum / anhydrite', category: 'structure',
    draw: () => [
      p('M4 15 L7 5 L10 15 Z'), p('M11 15 L14 7 L17 15 Z'),
    ],
  },
  {
    id: 'stylolite', label: 'Stylolite', category: 'structure',
    draw: () => [
      p('M2 10 H4 V7 H7 V12 H10 V8 H13 V11.5 H16 V9 H18'),
    ],
  },
  {
    id: 'imbrication', label: 'Imbrication', category: 'structure',
    draw: () => [
      ell(6, 11, 3.2, 1.5, -35), ell(11, 11, 3.2, 1.5, -35), ell(15.5, 11, 3.2, 1.5, -35),
      p('M2 15 H18'),
    ],
  },
  {
    id: 'hardground', label: 'Hardground', category: 'structure',
    draw: () => [
      p('M2 11 H18', { 'stroke-width': 2.2 }),
      p('M4 11 V7 M7.5 11 V6 M11 11 V7.5 M14.5 11 V6.5 M17 11 V8'),
    ],
  },
  {
    id: 'paleosol', label: 'Paleosol', category: 'structure',
    draw: () => [
      p('M2 7 H18'),
      p('M6 7 V12 Q 6 15 4 17 M11 7 V11 Q 11 14 13 16 M15.5 7 V10'),
      dot(8.5, 13, 0.8), dot(16, 13.5, 0.8),
    ],
  },
  {
    id: 'tepee', label: 'Tepee / evaporite polygon', category: 'structure',
    draw: () => [
      p('M2 14 L6 8 L10 14 L14 8 L18 14'),
      p('M2 17 L6 11 L10 17 L14 11 L18 17'),
    ],
  },
  {
    id: 'slump', label: 'Slump', category: 'structure',
    draw: () => [
      p('M3 8 Q 8 4 11 9 Q 13 13 9 14 Q 5 15 4 11'),
      p('M12 15 Q 16 14 17 9'),
    ],
  },
  {
    id: 'covered', label: 'Covered interval', category: 'structure',
    draw: () => [
      p('M3 4 L17 4 M3 8 L17 8 M3 12 L17 12 M3 16 L17 16', { 'stroke-dasharray': '2 3' }),
    ],
  },
];

export const SYMBOL_BY_ID = Object.fromEntries(SYMBOLS.map((s) => [s.id, s]));

export const SYMBOL_CATEGORIES = [
  { id: 'fossil', label: 'Fossils' },
  { id: 'trace', label: 'Trace fossils' },
  { id: 'structure', label: 'Sedimentary structures' },
];

export function symbolDef(id) { return SYMBOL_BY_ID[id] || null; }

export function symbolLabel(id) {
  const s = SYMBOL_BY_ID[id];
  return s ? s.label : id;
}

/**
 * One symbol as an SVG group, scaled to `size` and centred on (x, y).
 *
 * A group with a transform rather than a nested `<svg>`, so the whole column
 * stays one coordinate system and can be serialised straight out to a file
 * that any drawing program will open.
 */
export function symbolGroup(id, x, y, size = 14, cls = 'strat-sym') {
  const def = SYMBOL_BY_ID[id];
  if (!def) return null;
  const k = size / BOX;
  return svg('g', {
    class: cls,
    transform: `translate(${round(x - size / 2)} ${round(y - size / 2)}) scale(${round(k, 4)})`,
  }, def.draw());
}

/** A standalone swatch of one symbol, for the palette and the legend. */
export function symbolIcon(id, cls = 'sym-icon') {
  const def = SYMBOL_BY_ID[id];
  return svg('svg', { viewBox: `0 0 ${BOX} ${BOX}`, class: cls, 'aria-hidden': 'true' },
    def ? def.draw() : []);
}

function round(v, dp = 2) {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
