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

function listNames(rows) {
  const names = rows.map((r) => r.name || 'an unnamed unit');
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Whether the Advanced fold is open. Screen state, not document state. */
let advancedOpen = false;

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
    survey.faultObs ? statLine('On the fault', String(survey.faultObs)) : null,
  ].filter(Boolean)));

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
  // Said before the button rather than as an apology afterwards: this is the
  // one gap the student can still go and close, and it is three taps.
  if (survey.lines.undipped) {
    hints.push(`${plural(survey.lines.undipped, 'fault')} has no dip on it. A trace gives the dip only where the ground has relief under it; across flat ground every plane through that line fits, and the fit has no choice but to call the fault vertical. Set its dip, which way it moved and the unit either side on the Lines tab — that is what turns a drawn fault into a solved one.`);
  }
  // Said because the fit has nothing to fit it to, not because the reading is
  // wrong. Overturning is a way-up, and a way-up leaves no trace in a plane:
  // the fit sees the same strike and dip whichever answer is true, so there is
  // no residual it could reduce by getting it right. Better heard from the
  // panel than discovered as a block that quietly disagrees with the notebook.
  if (survey.overturned) {
    hints.push(`${plural(survey.overturned, 'reading')} is marked overturned. The plane is fitted like any other, but nothing in the fit can read a way-up — the same plane holds either answer, so there is nothing for it to fit to. The limb comes back at the dip you measured, and which way up the block puts it is not something the fit decided. Read the block for the structure and the notebook for the way-up.`);
  }
  if (survey.faultObs) {
    hints.push(`${plural(survey.faultObs, 'reading')} taken on a fault surface will be used for the fault rather than for the beds: a measured plane sets its dip outright, and slickenlines give the rake — the direction of slip, which nothing else in a map can supply.`);
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

  node.appendChild(advanced(ctx));

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

/**
 * The one place the fit is given a choice about how it may answer.
 *
 * Folded shut, because a student building their first block should not have to
 * have an opinion about this, and the default is the behaviour every block
 * before it was built with. Open it and the explanation is the point: this is
 * a real extra freedom handed to the fit, and anybody switching it on should
 * know both what it buys and what it costs.
 */
function advanced(ctx) {
  const doc = ctx.doc();
  const box = el('details', { class: 'advanced' });
  // Ticking the box writes a document setting, which rebuilds the panel — and
  // a rebuilt <details> would spring shut under the finger. Whether it is open
  // is a fact about the screen and not about the survey, so it lives here
  // rather than on the document.
  box.open = advancedOpen;
  box.addEventListener('toggle', () => { advancedOpen = box.open; });
  box.appendChild(el('summary', { text: 'Advanced' }));

  const label = el('label', { class: 'check-row' });
  const input = el('input', { type: 'checkbox' });
  input.checked = doc.settings.localFolds === true;
  input.addEventListener('change', () => ctx.setSetting({ localFolds: input.checked }));
  label.append(input, el('span', { text: 'Let a fold stop where the mapping stops' }));
  box.appendChild(label);

  box.appendChild(el('div', { class: 'ctl-hint standalone', text:
    'A fold here is a wave that runs at full height to every edge of the block. Along its own axis that is an assertion rather than a measurement: a cylindrical fold is identical all the way along, and nothing in your readings argues for it carrying on past the last one. Switch this on and the fit is allowed to fade the fold out at the edge of the ground you actually mapped, starting from how far your stations and contacts reach along the axis and adjusting from there.' }));
  box.appendChild(el('div', { class: 'ctl-hint standalone', text:
    'What it buys is room for a bigger, broader fold in the middle where the evidence is, instead of a tight one stretched to cover ground it was never measured on. What it costs is a parameter: the fit has one more way to make its numbers look better, and a fold that fades is harder to argue with than one that does not. The reach is written on the History tab like any other number, so you can see what it chose and change it.' }));
  box.appendChild(el('div', { class: 'ctl-hint standalone', text:
    'Only along the axis, never across it. Across the axis is where the fold actually bends, and fading it there does not stop the block over-claiming — it deletes the structure.' }));

  return box;
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
        text: `${Math.round(u.thickness)} m${u.measured ? ''
          : (u.fromColumn ? ' (your column)' : ' (guessed)')}` }),
    ]));
    wrap.appendChild(el('div', { class: 'stats' }, rows));
    wrap.appendChild(el('div', { class: 'ctl-hint standalone',
      text: 'Two contacts at a known structure differ by the thickness of what lies between them, so these were read off the map rather than measured with a tape. The top and bottom units are open-ended — nothing in the box says how thick they are.' }));
  }

  // What the build handed back to the stratigraphic column. Said here rather
  // than left to be discovered, because a number changing in another section
  // without anybody being told is exactly the kind of quiet edit that makes an
  // app untrustworthy.
  const note = ctx.columnNote && ctx.columnNote();
  if (note && (note.adopted.length || note.clashed.length || note.noted.length)) {
    wrap.appendChild(el('div', { class: 'sub-head', text: 'Into your column' }));
    const lines = [];
    if (note.adopted.length) {
      lines.push(`${listNames(note.adopted)} had no thickness and `
        + `${note.adopted.length === 1 ? 'has' : 'have'} taken the one this block measured.`);
    }
    if (note.noted.length) {
      lines.push(`${listNames(note.noted)} agreed with what you already had.`);
    }
    for (const c of note.clashed) {
      lines.push(`${c.name}: you have ${Math.round(c.said)} m, this block makes it `
        + `${Math.round(c.model)} m. Both are kept; the Strata section shows the difference.`);
    }
    for (const l of lines) wrap.appendChild(el('div', { class: 'ctl-hint standalone', text: l }));
    wrap.appendChild(el('button', {
      class: 'btn small', type: 'button', text: 'Open the column',
      onclick: () => ctx.showColumn(),
    }));
  }

  const dropped = r.counts && r.counts.dropped;
  if (dropped && (dropped.outside || dropped.noAttitude || dropped.notBedding || dropped.linear)) {
    const parts = [];
    if (dropped.outside) parts.push(`${dropped.outside} outside the box`);
    if (dropped.noAttitude) parts.push(`${dropped.noAttitude} with no reading yet`);
    if (dropped.notBedding) parts.push(`${dropped.notBedding} neither bedding nor on a fault`);
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
