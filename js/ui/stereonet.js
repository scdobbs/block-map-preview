// The stereonet: a lower-hemisphere plot of bedding, and the girdle fit that
// pulls a fold axis out of it.
//
// It is a pane beside the block, not a page over it. A net has to be square
// and big enough to read a pole off, so it cannot live in the bottom sheet —
// but covering the block with it would waste the best thing about having both:
// drag a fold's plunge and the girdle swings while you watch.
//
// There can be two sets of poles on it, and keeping them apart is the whole
// honesty of the thing.
//
// A marker stores only where it stands; its attitude is read back out of the
// geology beneath it. On a block somebody built that is exactly right — the
// block is the ground, and a marker is a student going and looking at it. On a
// block that was FITTED to a notebook it is circular: the poles are the fit's
// own answer handed back to it, and they will lie on a flawless girdle no
// matter what the outcrop did, because the thing they were read off is one
// cylindrical fold by construction.
//
// So when a block carries a survey, the readings that survey was made of are
// plotted too, straight from the notebook and untouched by the fit. Those are
// the only poles on the net that can disagree with the block. Where the two
// sets say different things — and here they usually do — that difference is
// the result, and it is put first.

import { el, svg, clear } from './widgets.js';
import {
  PROJECTIONS, project, poleOf, greatCircle, smallCircle,
  trendPlungeToVec, vecToTrendPlunge, formatLine, formatPlane,
} from '../geo/stereonet.js';
import { quadrantBearing } from '../geo/math.js';

const VB = 360;          // viewBox side
const C = VB / 2;        // net center
const R = 150;           // net radius

const NET = '#8ecae6';   // the whole-map answer, when it is asked for

/**
 * @param {object} ctx  the panel context, plus:
 *   readings()     the marker readings, read out of the model
 *   mapFit()       the same fit run over a dense grid, or null
 *   surveyFit()    { beds, fit } measured in the field, or { beds: [] }
 *   selectMarker(id)
 */
export function stereonet(ctx) {
  // Comparing against the whole map is the answer to the exercise, so it
  // starts off. A student should get to be wrong first.
  let compare = false;

  const face = svg('svg', {
    viewBox: `0 0 ${VB} ${VB}`, class: 'stereo-net', 'aria-label': 'Stereonet',
  });
  const side = el('div', { class: 'stereo-side' });

  // Only meaningful when the panes are stacked — see _bindNetGrip. Side by
  // side there is room for both and the grip is hidden.
  const grip = el('button', {
    class: 'stereo-grip', type: 'button',
    'aria-label': 'Drag to give the net more of the screen',
    title: 'Drag to resize, or tap to cycle',
  });

  const root = el('div', { class: 'stereo-panel hidden' }, [
    grip,
    el('div', { class: 'stereo-head' }, [
      el('h2', { text: 'Stereonet' }),
      el('span', { class: 'stereo-sub', text: 'lower hemisphere' }),
      el('button', {
        class: 'stereo-close', type: 'button', text: '×', 'aria-label': 'Hide the stereonet',
        onclick: () => ctx.setNet(false),
      }),
    ]),
    el('div', { class: 'stereo-body' }, [
      el('div', { class: 'stereo-figure' }, [face]),
      side,
    ]),
  ]);

  // -------------------------------------------------------------------------

  const build = () => {
    const doc = ctx.store.doc;
    const kind = doc.settings.netProjection === 'equalAngle' ? 'equalAngle' : 'equalArea';
    const showPlanes = doc.settings.netPlanes === true;
    const beds = ctx.readings().filter((r) => r.dip != null);
    const fit = ctx.fit();
    const mapFit = compare ? ctx.mapFit() : null;
    // Only a block cut from a field area has one. Everywhere else this is
    // empty and the net behaves exactly as it always did.
    const survey = ctx.surveyFit ? ctx.surveyFit() : { beds: [] };
    const measured = survey.beds && survey.beds.length ? survey : null;

    drawNet(face, kind, beds, fit, mapFit, showPlanes, ctx, measured);
    drawSide(side, doc, kind, beds, fit, mapFit, ctx, {
      compare, setCompare: (v) => { compare = v; build(); }, measured,
    });
  };

  // Rebuilt on every document change while it is showing, which is what makes
  // it live; skipped entirely when it is not, which is what keeps it free.
  root.refresh = () => { if (root.isOpen()) build(); };
  root.setVisible = (on) => {
    root.classList.toggle('hidden', !on);
    if (on) build();
  };
  root.isOpen = () => !root.classList.contains('hidden');
  root.grip = grip;
  return root;
}

// ---------------------------------------------------------------------------
// The plot
// ---------------------------------------------------------------------------

const sx = (p) => C + p.x * R;
const sy = (p) => C - p.y * R;

function pathOf(points) {
  return points.map((p, i) => `${i ? 'L' : 'M'} ${sx(p).toFixed(2)} ${sy(p).toFixed(2)}`).join(' ');
}

function drawNet(face, kind, beds, fit, mapFit, showPlanes, ctx, measured) {
  clear(face);

  face.appendChild(svg('circle', { cx: C, cy: C, r: R, class: 'net-face' }));

  // --- the net's own graticule -------------------------------------------
  // Both families share one horizontal north-south axis, which is what makes
  // it a net rather than two unrelated sets of curves: the great circles are
  // the planes that contain that axis, and the small circles are the cones
  // around it.
  const grid = svg('g', { class: 'net-grid' });
  for (let d = 10; d < 90; d += 10) {
    for (const strike of [0, 180]) {
      grid.appendChild(svg('path', { d: pathOf(greatCircle(strike, d, kind)) }));
    }
  }
  for (let a = 10; a < 180; a += 10) {
    if (a === 90) continue;                       // that one is the east-west line
    for (const seg of smallCircle([0, 1, 0], a, kind)) {
      if (seg.length > 1) grid.appendChild(svg('path', { d: pathOf(seg) }));
    }
  }
  grid.appendChild(svg('path', { d: `M ${C} ${C - R} L ${C} ${C + R}` }));
  grid.appendChild(svg('path', { d: `M ${C - R} ${C} L ${C + R} ${C}` }));
  face.appendChild(grid);

  // --- ticks and cardinals ------------------------------------------------
  const ticks = svg('g', { class: 'net-ticks' });
  for (let a = 0; a < 360; a += 10) {
    const major = a % 90 === 0;
    const r0 = R - (major ? 10 : 5);
    const t = a * Math.PI / 180;
    ticks.appendChild(svg('line', {
      x1: C + Math.sin(t) * r0, y1: C - Math.cos(t) * r0,
      x2: C + Math.sin(t) * R, y2: C - Math.cos(t) * R,
      class: major ? 'major' : '',
    }));
  }
  face.appendChild(ticks);
  face.appendChild(svg('circle', { cx: C, cy: C, r: R, class: 'net-rim' }));

  for (const [a, label] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
    const t = a * Math.PI / 180;
    face.appendChild(svg('text', {
      x: C + Math.sin(t) * (R + 15), y: C - Math.cos(t) * (R + 15) + 5,
      'text-anchor': 'middle', class: 'net-card', text: label,
    }));
  }

  // --- the readings -------------------------------------------------------
  if (showPlanes) {
    const g = svg('g', { class: 'net-planes' });
    for (const b of beds) {
      g.appendChild(svg('path', {
        d: pathOf(greatCircle(b.strike, b.dip, kind)),
        class: b.id === ctx.selectedMarkerId() ? 'selected' : '',
      }));
    }
    face.appendChild(g);
  }

  // The fitted girdle goes under the poles: it is a conclusion drawn through
  // them, not another datum sitting on top.
  if (fit.kind === 'girdle') {
    face.appendChild(svg('path', {
      d: pathOf(greatCircle(fit.girdle.strike, fit.girdle.dip, kind)),
      class: 'net-girdle',
    }));
  }
  if (mapFit && mapFit.kind === 'girdle') {
    face.appendChild(svg('path', {
      d: pathOf(greatCircle(mapFit.girdle.strike, mapFit.girdle.dip, kind)),
      class: 'net-girdle map',
    }));
  }
  if (measured && measured.fit && measured.fit.kind === 'girdle') {
    face.appendChild(svg('path', {
      d: pathOf(greatCircle(measured.fit.girdle.strike, measured.fit.girdle.dip, kind)),
      class: 'net-girdle measured',
    }));
  }

  const poles = svg('g', { class: 'net-poles' });
  for (const b of beds) {
    const p = project(poleOf(b.strike, b.dip), kind);
    const selected = b.id === ctx.selectedMarkerId();
    poles.appendChild(svg('circle', {
      cx: sx(p), cy: sy(p), r: selected ? 6 : 4.5,
      class: `net-pole ${selected ? 'selected' : ''}`,
    }));
    // A fat invisible disc over each pole, because a 4-pixel dot is not a
    // touch target on a phone.
    const hit = svg('circle', { cx: sx(p), cy: sy(p), r: 14, class: 'net-hit' });
    hit.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      ctx.selectMarker(ctx.selectedMarkerId() === b.id ? null : b.id);
    });
    poles.appendChild(hit);
  }
  face.appendChild(poles);

  // The measured poles go on last and are drawn as crosses, not dots: two
  // sets of round marks in two colours is a legend problem, and the shape has
  // to carry the difference for anyone who cannot rely on the colour. They
  // take no clicks — there is no marker under them to select.
  if (measured) {
    const g = svg('g', { class: 'net-measured' });
    for (const b of measured.beds) {
      const p = project(poleOf(b.strike, b.dip), kind);
      const x = sx(p), y = sy(p), s = 4.5;
      g.appendChild(svg('path', {
        d: `M ${x - s} ${y - s} L ${x + s} ${y + s} M ${x - s} ${y + s} L ${x + s} ${y - s}`,
      }));
    }
    face.appendChild(g);
    if (measured.fit && measured.fit.kind === 'girdle') {
      face.appendChild(axisMark(measured.fit.axis, kind, 'net-axis measured', 8));
    }
  }

  // --- the answers --------------------------------------------------------
  // The map's answer goes on first and a size larger, so that when the two
  // agree — which is the whole point — it rings the student's mark instead of
  // covering it up.
  if (mapFit && mapFit.kind === 'girdle') {
    face.appendChild(axisMark(mapFit.axis, kind, 'net-axis map', 12));
  }
  if (fit.kind === 'girdle') {
    face.appendChild(axisMark(fit.axis, kind, 'net-axis', 8));
    // The number goes on the plot as well as in the readout: a mark on a net
    // that you have to look somewhere else to read is half an answer.
    face.appendChild(label(formatLine(fit.axis), project(
      trendPlungeToVec(fit.axis.trend, fit.axis.plunge), kind,
    ), 'net-label'));
  }
  if (fit.kind === 'cluster') {
    const p = project(poleOf(fit.mean.strike, fit.mean.dip), kind);
    face.appendChild(svg('circle', { cx: sx(p), cy: sy(p), r: 9, class: 'net-mean' }));
    face.appendChild(label(formatPlane(fit.mean), p, 'net-label'));
  }
  if (fit.kind === 'conical') {
    // The small circle the poles actually lie on, and the axis it turns about.
    for (const seg of smallCircle(fit.cone.axis, fit.cone.angle, kind)) {
      if (seg.length > 1) face.appendChild(svg('path', { d: pathOf(seg), class: 'net-cone' }));
    }
    const p = project(fit.cone.axis, kind);
    face.appendChild(svg('circle', { cx: sx(p), cy: sy(p), r: 5, class: 'net-mean' }));
    face.appendChild(label(formatLine(vecToTrendPlunge(fit.cone.axis)), p, 'net-label'));
  }
}

/**
 * Text beside a mark on the net. It sits on whichever side has room — against
 * the eastern rim there is none to the right, so the label flips and anchors
 * from its other end rather than running off the sheet.
 */
function label(text, p, cls) {
  const x = sx(p), y = sy(p);
  const left = x > C;
  return svg('text', {
    x: x + (left ? -15 : 15), y: y + 5,
    'text-anchor': left ? 'end' : 'start',
    class: cls, text,
  });
}

/** A fold axis: a diamond, so it can never be mistaken for one of the poles. */
function axisMark({ trend, plunge }, kind, cls, s) {
  const p = project(trendPlungeToVec(trend, plunge), kind);
  const x = sx(p), y = sy(p);
  const g = svg('g', { class: cls });
  g.appendChild(svg('path', {
    d: `M ${x} ${y - s} L ${x + s} ${y} L ${x} ${y + s} L ${x - s} ${y} Z`,
  }));
  g.appendChild(svg('circle', { cx: x, cy: y, r: 2, class: 'dot' }));
  return g;
}

// ---------------------------------------------------------------------------
// The readout
// ---------------------------------------------------------------------------

function drawSide(side, doc, kind, beds, fit, mapFit, ctx, opts) {
  clear(side);

  const total = ctx.readings().length;
  const dropped = total - beds.length;
  const measured = opts.measured;

  if (measured) {
    // The measurements come first because they are the evidence and the block
    // is the claim. Reading only the top box should leave a student with the
    // right answer, not with the model's opinion of itself.
    side.appendChild(el('div', { class: 'stereo-band', text: 'What you measured' }));
    side.appendChild(measured.fit
      ? verdict(measured.fit, null)
      : el('div', { class: 'stereo-verdict few' }, [
        el('div', { class: 'stereo-title', text: 'Not enough yet' }),
        el('p', { text: `${measured.beds.length} bedding reading${measured.beds.length === 1 ? '' : 's'} came onto this block. Three is the minimum for a girdle.` }),
      ]));
    side.appendChild(el('div', { class: 'stereo-band', text: 'What this block does there' }));
  }

  side.appendChild(verdict(fit, mapFit, !!measured));

  if (measured) side.appendChild(disagreement(measured, fit));

  if (measured) {
    side.appendChild(el('p', { class: 'stereo-count' }, [
      `${measured.beds.length} measured · ${beds.length} read off the block`,
    ]));
  } else {
    side.appendChild(el('p', { class: 'stereo-count' }, [
      `${beds.length} of ${total} reading${total === 1 ? '' : 's'} plotted`,
      dropped ? el('span', { text: ` · ${dropped} with no bedding left off` }) : null,
    ]));
  }

  side.appendChild(el('div', { class: 'stereo-legend' }, [
    measured ? legendRow('measured', 'Pole to bedding you measured — from the notebook') : null,
    legendRow('pole', measured
      ? 'Pole to bedding this block puts at the same place'
      : 'Pole to bedding — the normal, plotted downward'),
    measured && measured.fit && measured.fit.kind === 'girdle'
      ? legendRow('girdle-measured', 'Girdle and axis through the measured poles') : null,
    fit.kind === 'girdle' ? legendRow('girdle', `Best-fit girdle through the ${measured ? "block's" : ''} poles`.replace('  ', ' ')) : null,
    fit.kind === 'girdle' ? legendRow('axis', 'Fold axis — the pole of that girdle') : null,
    fit.kind === 'cluster' ? legendRow('mean', 'Mean pole to bedding') : null,
    fit.kind === 'conical' ? legendRow('cone', 'Small circle the poles fall on') : null,
    fit.kind === 'conical' ? legendRow('mean', 'Axis of that cone') : null,
    mapFit && mapFit.kind === 'girdle' ? legendRow('map', 'Answer from the whole map') : null,
  ]));

  // --- controls -----------------------------------------------------------
  side.appendChild(el('div', { class: 'sub-head', text: 'Plot' }));

  side.appendChild(el('div', { class: 'chip-row' }, PROJECTIONS.map((p) => el('button', {
    class: `chip ${kind === p.id ? 'on' : ''}`, type: 'button', text: p.label,
    title: p.hint,
    onclick: () => ctx.store.edit((d) => { d.settings.netProjection = p.id; },
      { structural: true }),
  }))));
  side.appendChild(el('p', {
    class: 'ctl-hint', text: PROJECTIONS.find((p) => p.id === kind).hint,
  }));

  side.appendChild(el('div', { class: 'chip-row' }, [
    el('button', {
      class: `chip ${doc.settings.netPlanes ? 'on' : ''}`, type: 'button',
      text: 'Great circles',
      title: 'Draw each bed as its own great circle. They all cross at the fold axis — the same answer the poles give, arrived at the other way round.',
      onclick: () => ctx.store.edit((d) => { d.settings.netPlanes = !d.settings.netPlanes; },
        { structural: true }),
    }),
    el('button', {
      class: `chip ${opts.compare ? 'on' : ''}`, type: 'button',
      text: 'Check the whole map',
      title: opts.measured
        ? 'Read bedding on a grid across the block and fit the same girdle to it. Both sides of that comparison come out of this block, so it says whether your stations sampled it fairly — not whether the block is right.'
        : 'Read bedding on a grid across the block and fit the same girdle to it.',
      onclick: () => opts.setCompare(!opts.compare),
    }),
  ]));

  if (fit.n >= 3) side.appendChild(numbers(fit));
}

/**
 * What one set of poles amounts to, in words.
 *
 * `modelled` says these poles were read out of the block rather than off an
 * outcrop, which changes what several of these verdicts mean. A modelled set
 * that lands on a perfect girdle has demonstrated nothing: a block built as
 * one cylindrical fold has bedding that wraps around one axis everywhere,
 * necessarily, and sampling it cannot fail to find that out. Saying so is not
 * a disclaimer — it is the difference between a measurement and a tautology,
 * and a student who cannot tell those apart will believe any model they build.
 */
function verdict(fit, mapFit, modelled = false) {
  const box = el('div', { class: `stereo-verdict ${fit.kind}` });

  if (fit.kind === 'few') {
    box.append(
      el('div', { class: 'stereo-title', text: 'Not enough yet' }),
      el('p', { text: 'Three readings is the minimum, and they have to come from different parts of the structure. Two limbs of a fold beats twenty stations on one of them.' }),
    );
    return box;
  }

  if (fit.kind === 'cluster') {
    box.append(
      el('div', { class: 'stereo-title', text: 'One attitude' }),
      el('div', { class: 'stereo-answer' }, [
        el('strong', { text: formatPlane(fit.mean) }),
        el('span', { text: ` ${quadrantBearing(fit.mean.strike)}` }),
      ]),
      el('p', { text: `The poles fall in one spot, spanning only ${Math.round(fit.spread)}° of a girdle. Every reading is telling you the same thing, so there is no fold axis to find — go and measure somewhere the beds are doing something else.` }),
    );
    return box;
  }

  if (fit.kind === 'conical') {
    const ax = vecToTrendPlunge(fit.cone.axis);
    box.append(
      el('div', { class: 'stereo-title', text: 'A cone, not a cylinder' }),
      el('div', { class: 'stereo-answer' }, [
        el('strong', { text: `${Math.round(fit.cone.angle)}°` }),
        el('span', { text: `half-angle about ${formatLine(ax)}` }),
      ]),
      el('p', { text: `The poles lie on a small circle, not a great one — every bed is tilted the same amount but in a different direction. That is a dome or a basin, and it has no hinge line: there is no direction the beds fail to bend in, so no fold axis to report.` }),
      el('p', { text: ax.plunge > 80
        ? 'The cone is about the vertical, so the structure closes on itself in map view — look for the bullseye outcrop pattern.'
        : 'The cone leans, so the structure has been tilted since it formed.' }),
    );
    return box;
  }

  if (fit.kind === 'scattered') {
    box.append(
      el('div', { class: 'stereo-title', text: 'Not one cylinder' }),
      el('p', { text: `The poles miss any single girdle by ${Math.round(fit.misfit)}° on average. Something other than one cylindrical fold is going on — a dome or basin, two generations of folding, or readings from either side of a fault.` }),
    );
    return box;
  }

  box.append(
    el('div', { class: 'stereo-title', text: 'Cylindrical fold' }),
    el('div', { class: 'stereo-answer' }, [
      el('strong', { text: formatLine(fit.axis) }),
      el('span', { text: ' trend / plunge' }),
    ]),
    el('p', { text: modelled
      ? `${howWell(fit.misfit)}, covering ${Math.round(fit.spread)}° of it — as it was bound to. These poles were read out of a block whose one structural event is a cylindrical fold, so they can only ever wrap around its axis. It is a description of the model, not a finding about the ground.`
      : `${howWell(fit.misfit)}, covering ${Math.round(fit.spread)}° of it. The pole of that girdle is the hinge line: bedding wraps around it, so it is the one direction the fold does not bend.` }),
  );

  if (mapFit) {
    if (mapFit.kind !== 'girdle') {
      box.appendChild(el('p', {
        class: 'stereo-check',
        text: 'Across the whole map the poles do not make a single girdle, so the block is not one cylindrical fold even though your readings are.',
      }));
    } else {
      const off = angleBetween(fit.axis, mapFit.axis);
      box.appendChild(el('p', { class: 'stereo-check' }, [
        el('strong', { text: formatLine(mapFit.axis) }),
        el('span', { text: ` from ${mapFit.n} readings across the map — ${off < 0.5 ? 'the same answer' : `${off.toFixed(1)}° from yours`}.` }),
      ]));
    }
  }
  return box;
}

/**
 * The two sets of poles, held against each other.
 *
 * This is the point of plotting both, and it is deliberately blunt. The
 * commonest way for a fitted block to mislead is not to look wrong — it is to
 * look like a clean answer while the readings it was built from say something
 * else entirely, with nothing on the screen putting the two side by side.
 */
function disagreement(measured, fit) {
  const box = el('div', { class: 'stereo-check-box' });
  box.appendChild(el('div', { class: 'stereo-title', text: 'Held against each other' }));

  const mf = measured.fit;
  if (!mf) {
    box.appendChild(el('p', { text: 'Too few readings came onto this block to fit anything to them, so there is nothing to hold the block against here. The Field tab still scores it reading by reading.' }));
    return box;
  }

  if (mf.kind === 'girdle' && fit.kind === 'girdle') {
    const off = angleBetween(mf.axis, fit.axis);
    box.appendChild(el('p', {}, [
      el('span', { text: 'Your readings give a hinge at ' }),
      el('strong', { text: formatLine(mf.axis) }),
      el('span', { text: `, the block ${formatLine(fit.axis)} — ${off < 0.5 ? 'the same line' : `${off.toFixed(1)}° apart`}.` }),
    ]));
  } else if (mf.kind === 'scattered') {
    box.appendChild(el('p', { text: `Your readings do not lie on one girdle — they miss any single one by ${Math.round(mf.misfit)}° — and the block is a single ${fit.kind === 'girdle' ? 'cylindrical fold' : 'structure'}. A block of one structure cannot reproduce readings that are not of one structure, so some of the difference between it and your notebook is not an error to be tuned away: it is a structure the block does not contain.` }));
  } else if (mf.kind === 'conical') {
    box.appendChild(el('p', { text: 'Your readings lie on a small circle — a dome or a basin, which has no hinge line at all. Check that the block was fitted as one, because a cylindrical fold cannot reproduce it.' }));
  } else if (mf.kind !== fit.kind) {
    box.appendChild(el('p', { text: `Your readings say ${nameOf(mf.kind)}; the block is ${nameOf(fit.kind)}. Those are different structures, not a difference of degree.` }));
  } else {
    box.appendChild(el('p', { text: 'The two agree on what kind of structure this is.' }));
  }

  box.appendChild(el('p', { class: 'dim', text: 'The Field tab carries the number this is worth: how far the block sits from each reading, in degrees, live as you edit the history.' }));
  return box;
}

const KIND_NAMES = {
  girdle: 'one cylindrical fold', cluster: 'one attitude, unfolded',
  conical: 'a dome or a basin', scattered: 'not one structure',
  few: 'too little to say',
};
function nameOf(kind) { return KIND_NAMES[kind] || 'something it could not name'; }

/** How closely the poles sit on the fitted circle, said in words. */
function howWell(misfit) {
  if (misfit < 0.05) return 'The poles lie exactly on one girdle';
  return `The poles lie on one girdle to within ${misfit.toFixed(1)}°`;
}

function numbers(fit) {
  const box = el('details', { class: 'stereo-numbers' });
  box.appendChild(el('summary', { text: 'Eigenvalues' }));
  const [l1, l2, l3] = fit.values;
  box.appendChild(el('p', {
    text: `λ₁ ${l1.toFixed(3)} · λ₂ ${l2.toFixed(3)} · λ₃ ${l3.toFixed(3)}`,
  }));
  box.appendChild(el('p', {
    text: `Woodcock K ${Number.isFinite(fit.K) ? fit.K.toFixed(2) : '∞'} · C ${fit.C.toFixed(2)}`,
  }));
  box.appendChild(el('p', {
    class: 'dim',
    text: 'K below 1 is a girdle, above 1 a cluster; C is how strongly the poles are organized at all. The verdict above is read off the spread and the misfit instead, which say the same thing in degrees.',
  }));
  return box;
}

function legendRow(kind, text) {
  return el('div', { class: 'legend-row' }, [
    el('span', { class: `legend-mark ${kind}` }),
    el('span', { text }),
  ]);
}

/** Angle between two lines, so a hinge and its opposite read as identical. */
function angleBetween(a, b) {
  const va = trendPlungeToVec(a.trend, a.plunge);
  const vb = trendPlungeToVec(b.trend, b.plunge);
  const d = Math.abs(va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]);
  return Math.acos(Math.min(1, d)) * 180 / Math.PI;
}

