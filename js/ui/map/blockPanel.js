// The Block tab: cutting a 3D block out of the area you have mapped.
//
// Written to say what it is about to do, then what it did and how well, in
// that order — because the block is a claim about the ground and a student has
// to be able to argue with it. A block that merely appears, looking plausible,
// has taught nobody anything.

import { el } from '../widgets.js';

/** Reused from the Areas tab: the same box, dragged the same way. */
function extentIntro(ctx) {
  return [
    el('button', {
      class: 'btn primary wide', type: 'button', text: 'Choose the area to model',
      onclick: () => ctx.beginSelection(),
    }),
    el('div', { class: 'ctl-hint standalone',
      text: 'The box starts on whatever is on screen and its corners drag — the same box the Areas tab downloads with. Everything inside it goes into the block.' }),
  ];
}

function statLine(label, value, cls = '') {
  return el('div', { class: 'stat' }, [
    el('span', { class: 'stat-label', text: label }),
    el('span', { class: `stat-value ${cls}`, text: value }),
  ]);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "4.3 × 6.1 km" — one unit, not two, so it fits a stats column. */
function compactSize(g) {
  const km = (m) => (m / 1000).toFixed(m < 10000 ? 1 : 0);
  return g.width < 1000 && g.depth < 1000
    ? `${Math.round(g.width)} × ${Math.round(g.depth)} m`
    : `${km(g.width)} × ${km(g.depth)} km`;
}

export function blockPanel(ctx) {
  const node = el('div', { class: 'panel' });
  node.appendChild(el('div', { class: 'section-head' }, [
    el('h2', { text: 'Build a block' }),
    el('p', { text: 'Turn what you have mapped into a 3D block, on the real ground, and find out whether it explains your readings.' }),
  ]));

  const sel = ctx.selection();
  const busy = ctx.blockBuilding();
  const report = ctx.blockReport();

  // --- while it is running -------------------------------------------------
  if (busy) {
    node.appendChild(el('div', { class: 'progress' }, [
      el('div', { class: 'progress-text', text: busy.label }),
    ]));
    return node;
  }

  // --- no box yet ----------------------------------------------------------
  if (!sel) {
    for (const n of extentIntro(ctx)) node.appendChild(n);
    if (report) node.appendChild(reportBlock(ctx, report));
    return node;
  }

  // --- a box, and what is in it -------------------------------------------
  const survey = ctx.surveyExtent();
  const g = survey.georef;
  node.appendChild(el('div', { class: 'sub-head', text: 'The block' }));
  // Size on its own row: the stats grid is four columns on a wide screen, and
  // "4.34 km × 6.07 km" in a quarter of one wraps into an unreadable stack.
  node.appendChild(el('div', { class: 'stats' }, [statLine('Size', compactSize(g))]));
  node.appendChild(el('div', { class: 'stats' }, [
    statLine('Bedding', String(survey.bedding), survey.bedding >= 3 ? '' : 'warn'),
    statLine('Contacts', String(survey.lines.contact)),
    statLine('Faults', String(survey.lines.fault)),
  ]));

  // What is missing, said before the button rather than after it.
  const blockers = [];
  if (survey.bedding < 3) {
    blockers.push(`${plural(survey.bedding, 'bedding reading')} inside the box. Three is the minimum the stereonet will fit anything to — and three on one limb still only give one attitude.`);
  }
  const hints = [];
  if (survey.other) {
    hints.push(`${plural(survey.other, 'other station')} in the box will not be used: only bedding says what the beds are doing. Joints and lineations are recorded, not folded.`);
  }
  if (survey.lines.fault && survey.lines.unnamed) {
    hints.push(`${plural(survey.lines.unnamed, 'contact')} has no units named on either side. A fault's offset is measured by finding the same contact again across it, so an unnamed contact cannot help — naming the two units is what makes the throw solvable.`);
  }
  if (!survey.lines.contact) {
    hints.push('No contacts in the box. The readings alone can still give the shape of the structure, but the contacts are what pin its size and give the unit thicknesses.');
  }

  for (const b of blockers) {
    node.appendChild(el('div', { class: 'notice warn' }, [el('p', { text: b })]));
  }
  for (const h of hints) {
    node.appendChild(el('div', { class: 'ctl-hint standalone', text: h }));
  }

  node.appendChild(el('div', { class: 'row-actions' }, [
    el('button', {
      class: 'btn primary', type: 'button', text: 'Build the block',
      disabled: blockers.length > 0,
      onclick: () => ctx.buildBlock(),
    }),
    el('button', {
      class: 'btn', type: 'button', text: 'Cancel',
      onclick: () => ctx.cancelSelection(),
    }),
  ]));
  node.appendChild(el('div', { class: 'ctl-hint standalone',
    text: 'Elevation for this box has to be downloaded already, or you have to be online. It is what the block is draped over.' }));

  if (report) node.appendChild(reportBlock(ctx, report));
  return node;
}

// ---------------------------------------------------------------------------
// What the fit decided
// ---------------------------------------------------------------------------

/**
 * The report is the point of the feature, not a receipt for it.
 *
 * It is ordered the way the fitting happened, because that order is the
 * argument: what the stereonet decided from the readings alone, then what was
 * fitted to the map, then what could not be answered at all. A student who
 * reads only the first line has still learned the most important thing.
 */
function reportBlock(ctx, r) {
  const wrap = el('div', {});
  wrap.appendChild(el('div', { class: 'sub-head', text: 'What it made of your mapping' }));

  const v = r.verdict || {};
  const said = {
    girdle: 'a cylindrical fold',
    cluster: 'one attitude — a homocline',
    conical: 'a dome or a basin',
    scattered: 'not one structure',
    few: 'too few readings to fit anything',
  }[v.kind] || 'nothing it could name';

  wrap.appendChild(el('div', { class: 'notice' }, [
    el('p', {}, [
      el('strong', { text: 'The stereonet says: ' }),
      el('span', { text: said }),
    ]),
    v.n ? el('p', { class: 'dim', text:
      `${plural(v.n, 'pole')}, ${v.misfit != null ? `${v.misfit.toFixed(1)}° off the fitted circle` : ''}${v.spread != null ? `, spanning ${Math.round(v.spread)}° of it` : ''}.` }) : null,
  ]));

  for (const n of r.notes || []) {
    wrap.appendChild(el('div', { class: 'ctl-hint standalone', text: n }));
  }
  for (const w of r.warnings || []) {
    wrap.appendChild(el('div', { class: 'notice warn' }, [el('p', { text: w })]));
  }

  // How badly the block contradicts the notebook. This is the number to argue
  // with, so it is stated plainly and in the units it was measured in.
  const m = r.misfit;
  if (m) {
    wrap.appendChild(el('div', { class: 'sub-head', text: 'How well it fits' }));
    wrap.appendChild(el('div', { class: 'stats' }, [
      statLine('Readings off by', `${m.angle.toFixed(1)}°`, m.angle < 6 ? 'good' : 'warn'),
      m.surfaces
        ? statLine('Contacts held to', `±${Math.round(m.spread)} m`, m.spread < 40 ? 'good' : 'warn')
        : statLine('Contacts', 'none used', 'warn'),
    ]));
    wrap.appendChild(el('div', { class: 'ctl-hint standalone', text: m.surfaces
      ? 'A contact is one surface, so the spread of its stratigraphic depth along the line you walked is the error, in metres. Ten metres is the elevation data’s own resolution — there is no sense chasing it tighter than the ground is known.'
      : 'With no contacts the readings are carrying this alone. They give the shape of the structure but not its size.' }));
  }

  if (r.units && r.units.length) {
    wrap.appendChild(el('div', { class: 'sub-head', text: 'Column, read off the map' }));
    const rows = r.units.map((u) => el('div', { class: 'stat' }, [
      el('span', { class: 'stat-label', text: u.name || 'unnamed' }),
      el('span', { class: `stat-value ${u.measured ? '' : 'dim'}`,
        text: `${Math.round(u.thickness)} m${u.measured ? '' : ' (guessed)'}` }),
    ]));
    wrap.appendChild(el('div', { class: 'stats' }, rows));
    wrap.appendChild(el('div', { class: 'ctl-hint standalone',
      text: 'Two contacts at a known structure differ by the thickness of what lies between them, so these were read off the map rather than measured with a tape. The top and bottom units are open-ended — nothing in the box says how thick they are.' }));
  }

  const dropped = r.counts && r.counts.dropped;
  if (dropped && (dropped.outside || dropped.noAttitude || dropped.notBedding || dropped.linear)) {
    const parts = [];
    if (dropped.outside) parts.push(`${dropped.outside} outside the box`);
    if (dropped.noAttitude) parts.push(`${dropped.noAttitude} with no reading yet`);
    if (dropped.notBedding) parts.push(`${dropped.notBedding} not bedding`);
    if (dropped.linear) parts.push(`${dropped.linear} linear`);
    wrap.appendChild(el('div', { class: 'ctl-hint standalone',
      text: `Stations not used: ${parts.join(', ')}.` }));
  }

  if (r.ground && r.ground.missing) {
    wrap.appendChild(el('div', { class: 'notice warn' }, [el('p', { text:
      `${r.ground.missing} elevation samples were missing and have been filled in from their neighbours. Download this area’s elevation on the Areas tab and build it again for ground that is measured rather than guessed.` })]));
  }

  wrap.appendChild(el('div', { class: 'row-actions' }, [
    el('button', { class: 'btn primary', type: 'button', text: 'Open the block',
      onclick: () => ctx.showBlock() }),
    el('button', { class: 'btn', type: 'button', text: 'Build it again',
      onclick: () => ctx.beginSelection() }),
  ]));
  wrap.appendChild(el('div', { class: 'ctl-hint standalone',
    text: 'The block opens in the Block half, where the fitted history is on the History tab as ordinary events. Change them — that is the point. The map keeps your notes as they were.' }));

  return wrap;
}
