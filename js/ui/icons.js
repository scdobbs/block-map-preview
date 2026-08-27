// Small SVG marks for the tab bar and for each event type. Drawn rather than
// borrowed from the unicode block so each one actually depicts the thing it
// stands for — a student should be able to tell a fold from a fault at a
// glance, and a tab from its neighbour.

import { svg } from './widgets.js';
import { FLAT_DIP, VERTICAL_DIP } from '../render/markers.js';

const VB = '0 0 24 24';

// `build` is a factory, not an array: appendChild MOVES nodes, so a shared
// list of children would be stolen by whichever icon rendered last.
function icon(build) {
  return () => svg('svg', { viewBox: VB, class: 'evicon', 'aria-hidden': 'true' }, build());
}

const frame = () => svg('rect', {
  x: 2.5, y: 2.5, width: 19, height: 19, rx: 2.5, class: 'evicon-frame',
});

const path = (d, cls = 'evicon-line') => svg('path', { d, class: cls });

export const EVENT_ICONS = {
  // Tilted beds: three inclined contacts inside the block outline.
  tilt: icon(() => [
    frame(),
    path('M3 16 L21 8'),
    path('M3 20 L21 12'),
    path('M4.5 11.5 L21 4.5'),
  ]),

  // An anticline and a syncline.
  fold: icon(() => [
    frame(),
    path('M3 16 Q 8 6 12 12 Q 16 18 21 9'),
    path('M3 20 Q 8 11 12 16 Q 16 21 21 13'),
  ]),

  // Concentric closure — the bullseye of a dome or basin.
  domebasin: icon(() => [
    frame(),
    svg('ellipse', { cx: 12, cy: 12, rx: 7.5, ry: 5.5, class: 'evicon-line' }),
    svg('ellipse', { cx: 12, cy: 12, rx: 3.5, ry: 2.4, class: 'evicon-line' }),
  ]),

  // Offset beds either side of an inclined break.
  fault: icon(() => [
    frame(),
    path('M8.5 3 L15.5 21', 'evicon-line strong'),
    path('M3 9 L10 9'),
    path('M14.5 14 L21 14'),
    path('M3 14 L8.5 14'),
    path('M16.5 19 L21 19'),
  ]),

  // A steep tabular sheet cutting flat-lying beds.
  dike: icon(() => [
    frame(),
    path('M3 9 L9.5 9'),
    path('M3 15 L8.5 15'),
    path('M15.5 9 L21 9'),
    path('M16.5 15 L21 15'),
    svg('path', { d: 'M11 3 L14 3 L12.5 21 L9.5 21 Z', class: 'evicon-fill' }),
  ]),

  // A rounded body with a domed roof.
  pluton: icon(() => [
    frame(),
    path('M3 8 L21 8'),
    svg('path', {
      d: 'M6.5 21 Q 6.5 10 12 10 Q 17.5 10 17.5 21 Z', class: 'evicon-fill',
    }),
  ]),

  // Wavy erosion surface with flat beds above and truncated beds below.
  unconformity: icon(() => [
    frame(),
    path('M3 7 L21 7'),
    path('M3 12.5 Q 7 9.5 12 12.5 T 21 12.5', 'evicon-line strong'),
    path('M4 21 L9 15'),
    path('M9.5 21 L14.5 14.5'),
    path('M15 21 L20 15'),
  ]),
};

export function eventIcon(type) {
  const make = EVENT_ICONS[type];
  return make ? make() : svg('svg', { viewBox: VB, class: 'evicon' }, [frame()]);
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------
// These are read at a glance while holding the phone, so they stay far
// simpler than the event marks: no frames, few strokes, distinct silhouettes.

const tab = (build) => () =>
  svg('svg', { viewBox: VB, class: 'tabicon', 'aria-hidden': 'true' }, build());

const bar = (y) => svg('rect', {
  x: 3, y, width: 18, height: 3.6, rx: 1.2, class: 'tabicon-fill',
});

export const TAB_ICONS = {
  // Three units, not a barcode: enough to read as a stratigraphic column.
  layers: tab(() => [bar(5), bar(10.2), bar(15.4)]),

  // Hourglass — deep time.
  history: tab(() => [
    svg('path', {
      d: 'M6 3 H18 M6 21 H18 M7.5 3 V7 L12 12 L16.5 7 V3 M7.5 21 V17 L12 12 L16.5 17 V21',
      class: 'tabicon-line',
    }),
  ]),

  // A skyline.
  terrain: tab(() => [
    svg('path', { d: 'M2 19 L9 8 L13.5 14 L17 9.5 L22 19 Z', class: 'tabicon-fill' }),
  ]),

  // The strike-and-dip symbol itself — a geologist reads this tab at a glance.
  field: tab(() => [
    svg('path', { d: 'M3 8.5 H21 M12 8.5 V17', class: 'tabicon-line' }),
    svg('circle', { cx: 18, cy: 16.5, r: 1.6, class: 'tabicon-fill' }),
  ]),

  // A compass needle — the instrument the reading is taken with.
  measure: tab(() => [
    svg('circle', { cx: 12, cy: 12, r: 8.5, class: 'tabicon-line' }),
    svg('path', { d: 'M15.5 8.5 L10.5 10.5 L8.5 15.5 L13.5 13.5 Z', class: 'tabicon-fill' }),
  ]),

  // Three readings scattered on a sheet — a page of stations, not a list.
  stations: tab(() => [
    svg('path', { d: 'M4 6.5 H11 M7.5 6.5 V10', class: 'tabicon-line' }),
    svg('path', { d: 'M13 13 H20 M16.5 13 V16.5', class: 'tabicon-line' }),
    svg('path', { d: 'M4 17 H9.5 M6.7 17 V20', class: 'tabicon-line' }),
    svg('circle', { cx: 16.5, cy: 6, r: 1.5, class: 'tabicon-fill' }),
  ]),

  // A contact and a fault crossing it — the two marks a geologic map is made of.
  lines: tab(() => [
    svg('path', { d: 'M3 17 Q 8 8 13 12 T 21 6', class: 'tabicon-line' }),
    svg('path', { d: 'M7 3 L15 21', class: 'tabicon-line', 'stroke-dasharray': '4 3' }),
  ]),

  // A folded map sheet.
  areas: tab(() => [
    svg('path', { d: 'M3 6.5 L9 4 L15 6.5 L21 4 V17.5 L15 20 L9 17.5 L3 20 Z', class: 'tabicon-line' }),
    svg('path', { d: 'M9 4 V17.5 M15 6.5 V20', class: 'tabicon-line' }),
  ]),

  // Sliders.
  setup: tab(() => [
    svg('path', { d: 'M4 8 H20 M4 16 H20', class: 'tabicon-line' }),
    svg('circle', { cx: 9.5, cy: 8, r: 2.4, class: 'tabicon-fill' }),
    svg('circle', { cx: 15, cy: 16, r: 2.4, class: 'tabicon-fill' }),
  ]),

  // An eye. Distinct from the dome/basin mark, which has no lid.
  view: tab(() => [
    svg('path', { d: 'M2.5 12 Q 12 4 21.5 12 Q 12 20 2.5 12 Z', class: 'tabicon-line' }),
    svg('circle', { cx: 12, cy: 12, r: 3, class: 'tabicon-fill' }),
  ]),
};

export function tabIcon(id) {
  const make = TAB_ICONS[id];
  return make ? make() : svg('svg', { viewBox: VB, class: 'tabicon' }, []);
}

// ---------------------------------------------------------------------------
// Strike and dip
// ---------------------------------------------------------------------------

/**
 * The map symbol for one reading, drawn north-up so a list of them can be read
 * like a map. Mirrors what the 3D marker draws: an inclined bed gets a strike
 * line with a dip tick, horizontal beds a cross in a circle, vertical beds a
 * tick to either side, and a station with no bedding beneath it just a ring.
 */
export function strikeDipMark(strike, dip, cls = 'sd-mark') {
  const node = svg('svg', { viewBox: '0 0 28 28', class: cls, 'aria-hidden': 'true' });
  const g = svg('g', { transform: `rotate(${strike || 0} 14 14)` });

  if (dip == null) {
    node.appendChild(svg('circle', { cx: 14, cy: 14, r: 4.5, class: 'sd-line' }));
    return node;
  }
  if (dip < FLAT_DIP) {
    g.appendChild(svg('path', { d: 'M4 14 H24 M14 4 V24', class: 'sd-line' }));
    g.appendChild(svg('circle', { cx: 14, cy: 14, r: 3.2, class: 'sd-line' }));
  } else if (dip > VERTICAL_DIP) {
    g.appendChild(svg('path', { d: 'M14 3 V25 M8 14 H20', class: 'sd-line' }));
  } else {
    // Strike runs along the symbol; the tick hangs off it to the dip side,
    // which is 90 degrees clockwise from strike — to the right after rotating.
    g.appendChild(svg('path', { d: 'M14 3 V25 M14 14 H23', class: 'sd-line' }));
  }
  node.appendChild(g);
  return node;
}
