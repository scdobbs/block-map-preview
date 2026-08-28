// The Strata section's panels: Column, Marks, Legend, Setup.
//
// Same contract as the other two sections — build an element, hand it back,
// let the section decide when to rebuild.
//
// The organising idea is that the column is allowed to be unfinished. Every
// control here has to work when the answer is "I do not know yet", because
// that is the state a student is in when they sit down to write a column out
// of a field guide, and a form that demands a thickness before it will accept
// a unit would send them away to invent one.

import { el, selectRow, toggleRow, textRow, noteRow, numberRow, chipsRow,
  enableDragReorder } from '../widgets.js';
import { swatchEl } from '../swatch.js';
import { ROCKS, rockOf, unitColor } from '../../field/model.js';
import {
  RANKS, rankLabel, ranksFor, possibleParents, canHoldMembers, childRankFor,
  CONTACT_STYLES, GRAIN_SCALES, grainScale, grainProfile,
  defaultGrainFor, layoutColumn, isLeaf, childrenOf, thicknessOf, disagreement,
} from '../../strat/model.js';
import { SYMBOLS, SYMBOL_CATEGORIES, symbolIcon, symbolLabel } from './symbols.js';
import { legendEntries, lithologyEntries, fmtThickness } from './column.js';

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

export function columnPanel(ctx) {
  const doc = ctx.doc();
  const node = el('div', { class: 'panel' });
  const layout = layoutColumn(doc);
  const selected = doc.units.find((u) => u.id === ctx.selectedId()) || null;

  node.appendChild(el('div', { class: 'section-head' }, [
    el('h2', { text: 'The column' }),
    el('p', { text: layout.rows.length
      ? `${plural(layout.rows.length, 'unit')}, ${fmtThickness(layout.total)} m`
        + (layout.unknown ? ` — ${layout.unknown} not measured` : '')
      : 'What the succession is, before anything is said about where it crops out.' }),
  ]));

  if (!doc.units.length) {
    node.appendChild(el('div', { class: 'empty' }, [
      el('p', { text: 'Nothing in the column yet.' }),
      el('p', { class: 'dim', text: 'Start with what you know — the names, in order, '
        + 'youngest at the top. Thicknesses can wait: an unmeasured unit still draws, '
        + 'and the block will offer you a number for it later.' }),
    ]));
    node.appendChild(el('button', {
      class: 'btn primary wide', type: 'button', text: 'Add the first unit',
      onclick: () => ctx.addUnit(null, 'below'),
    }));
    node.appendChild(el('div', { class: 'ctl-hint standalone', text:
      'Units are shared with the map: whatever you name here is what you can tap when '
      + 'you log a station or name the two sides of a contact.' }));
    return node;
  }

  // The list, top of the column first, which is how the drawing reads.
  node.appendChild(el('div', { class: 'sub-head', text: 'Youngest at the top' }));
  const list = el('div', { class: 'unit-stack' });
  for (const u of doc.units) {
    const row = layout.rows.find((r) => r.unit.id === u.id) || null;
    list.appendChild(unitCard(ctx, doc, u, row, u.id === ctx.selectedId()));
  }
  enableDragReorder(list, {
    rowSel: '.unit-row',
    gripSel: '.unit-grip',
    idKey: 'unitId',
    // The list is already in model order, so what is on screen is what to
    // store. Which unit moved matters as much as the order: it is what decides
    // whether it is still inside the formation it started in.
    commit: (order, movedId) => ctx.reorderUnits(order, movedId),
  });
  node.appendChild(list);
  node.appendChild(el('div', { class: 'ctl-hint standalone', text: doc.units.length > 1
    ? 'Drag a unit by its grip to move it through the column. Pull a member clear of its '
      + 'formation and it comes out as a formation of its own; drop one between two members '
      + 'and it joins them. A formation travels with its members.'
    : 'Drag a unit by its grip to move it through the column.' }));

  node.appendChild(el('div', { class: 'row-actions' }, [
    el('button', {
      class: 'btn', type: 'button', text: 'Add above',
      onclick: () => ctx.addUnit(selected ? selected.id : doc.units[0]?.id, 'above'),
    }),
    el('button', {
      class: 'btn', type: 'button', text: 'Add below',
      onclick: () => ctx.addUnit(selected ? selected.id : doc.units[doc.units.length - 1]?.id, 'below'),
    }),
  ]));

  if (selected) node.appendChild(unitEditor(ctx, doc, selected));
  else {
    node.appendChild(el('div', { class: 'ctl-hint standalone', text:
      'Tap a unit — here or on the section — to give it a thickness, a grain size, '
      + 'or a description.' }));
  }

  return node;
}

function unitCard(ctx, doc, u, row, selected) {
  const leaf = isLeaf(doc, u);
  const kids = childrenOf(doc, u);
  const rk = rockOf(u.rockId);
  const said = thicknessOf(u);
  const clash = disagreement(u);

  const sub = [];
  if (!leaf) sub.push(`${plural(kids.length, 'member')}`);
  else if (said == null) sub.push('no thickness yet');
  else sub.push(`${fmtThickness(said)} m${u.thicknessSource === 'block' ? ' · from the block' : ''}`);
  if (u.rank !== 'formation') sub.push(rankLabel(u.rank).toLowerCase());
  if (u.parentId) {
    const parent = doc.units.find((p) => p.id === u.parentId);
    if (parent) sub.push(`in ${parent.name || 'a formation'}`);
  }

  // The grip sits outside the body so grabbing it never opens the editor —
  // the same arrangement the block's layer list uses, for the same reason.
  const grip = el('button', {
    class: 'unit-grip', type: 'button',
    'aria-label': leaf ? 'Drag to move this unit through the column'
      : 'Drag to move this formation and its members through the column',
    title: leaf ? 'Drag to move this unit through the column'
      : 'Drag to move this formation and its members through the column',
  }, [el('span', { text: '⠿' })]);

  const card = el('div', {
    class: `card unit-row split${leaf ? '' : ' group'}${selected ? ' selected' : ''}`,
  }, [
    grip,
    el('div', { class: 'card-main', onclick: () => ctx.select(selected ? null : u.id) }, [
      el('div', { class: 'card-swatch' },
        [leaf ? swatchEl(unitColor(u), rk.pattern, 'swatch small') : bracketMark()]),
      el('div', { class: 'card-text' }, [
        el('div', { class: 'card-title', text: u.name || 'unnamed unit' }),
        el('div', { class: 'card-sub', text: sub.join(' · ') }),
      ]),
      clash ? el('span', { class: 'flag warn', text: '≠', title:
        `You have ${fmtThickness(clash.said)} m; the block measured ${fmtThickness(clash.model)} m.` }) : null,
    ]),
  ]);
  card.dataset.unitId = u.id;
  return card;
}

function bracketMark() {
  const s = el('span', { class: 'group-mark', text: '⟦' });
  return s;
}

// ---------------------------------------------------------------------------

function unitEditor(ctx, doc, u) {
  const box = el('div', { class: 'editor' });
  const set = (fn, coalesce) => ctx.editUnit(u.id, fn, coalesce);
  const leaf = isLeaf(doc, u);

  box.appendChild(el('div', { class: 'sub-head', text: u.name || 'This unit' }));

  box.appendChild(textRow({
    label: 'Name', value: u.name, placeholder: 'e.g. Poleta Formation',
    onChange: (v) => set((x) => { x.name = v.trim(); }),
    hint: 'The same name you will tap when you log a station in it.',
  }));

  // Only the ranks this unit is allowed to be. A unit with members in it can
  // only be something that holds members; a unit inside one can only be
  // something that does not.
  const ranks = ranksFor(doc, u);
  box.appendChild(selectRow({
    label: 'Rank', value: u.rank,
    options: ranks.map((r) => ({ value: r.id, label: r.label })),
    onChange: (v) => set((x) => { x.rank = v; }),
  }));
  box.appendChild(el('div', { class: 'ctl-hint standalone',
    text: (RANKS.find((r) => r.id === u.rank) || RANKS[1]).hint
      + (ranks.length < RANKS.length
        ? (childrenOf(doc, u).length
          ? ' Only ranks that can hold members are offered, because this one has members in it.'
          : ' Only ranks that sit inside something are offered, because this one does.')
        : '') }));

  // Which formation this is a member of. Never itself, never something already
  // inside it, and never anything that would make a third tier.
  const parents = possibleParents(doc, u);
  if (parents.length) {
    box.appendChild(selectRow({
      label: 'Part of', value: u.parentId || '',
      options: [{ value: '', label: 'On its own' },
        ...parents.map((p) => ({ value: p.id, label: p.name || 'unnamed unit' }))],
      onChange: (v) => ctx.setParent(u.id, v || null),
    }));
    box.appendChild(el('div', { class: 'ctl-hint standalone', text:
      'A member sits inside a formation. The formation stops drawing a box of its own '
      + 'and becomes the bracket down the side of its members, with their total on it.' }));
  }

  if (!leaf) {
    const kids = childrenOf(doc, u);
    const known = kids.every((k) => thicknessOf(k) != null);
    const total = kids.reduce((a, k) => a + (thicknessOf(k) || 0), 0);
    box.appendChild(el('div', { class: 'notice' }, [
      el('p', { text: `${plural(kids.length, 'member')}, ${fmtThickness(total)} m`
        + (known ? '.' : ' so far.') }),
      el('p', { class: 'dim', text: 'A formation with members in it has no thickness of '
        + 'its own — it is the sum of theirs, and storing that twice means storing it wrong. '
        + 'Its lithology and colour are not drawn either.' }),
    ]));
  }

  if (leaf) {
    box.appendChild(thicknessBlock(ctx, u));
    box.appendChild(rockBlock(ctx, u, set));
    box.appendChild(grainBlock(ctx, doc, u));
  }

  box.appendChild(selectRow({
    label: 'Its base', value: u.contactBelow || 'conformable',
    options: CONTACT_STYLES.map((c) => ({ value: c.id, label: c.label })),
    onChange: (v) => set((x) => { x.contactBelow = v; }),
  }));
  box.appendChild(el('div', { class: 'ctl-hint standalone', text:
    (CONTACT_STYLES.find((c) => c.id === (u.contactBelow || 'conformable')) || CONTACT_STYLES[0]).hint
    + ' Drawn as the line between this unit and the one beneath it.' }));

  box.appendChild(noteRow({
    label: 'Description', value: u.description,
    placeholder: 'Thin-bedded, ripple cross-laminated, sharp erosive bases…',
    onChange: (v) => set((x) => { x.description = v; }),
    rows: 4,
  }));
  box.appendChild(el('div', { class: 'ctl-hint standalone',
    text: 'Goes in the right-hand margin of the section.' }));

  // Offered only where it means something. A member of a member is not a
  // deeper stratigraphy, it is a mess with no way to draw it: the bracket
  // column has room for one nesting and the column has room for one idea.
  const holds = canHoldMembers(doc, u);
  box.appendChild(el('div', { class: 'row-actions' }, [
    holds ? el('button', {
      class: 'btn', type: 'button',
      text: `Add a ${childRankFor(u)}`,
      onclick: () => ctx.addMember(u.id),
    }) : null,
    el('button', { class: 'btn danger', type: 'button', text: 'Delete',
      onclick: () => ctx.deleteUnit(u.id) }),
  ]));
  if (!holds && u.parentId) {
    box.appendChild(el('div', { class: 'ctl-hint standalone', text:
      'A member cannot hold members of its own. The column is two tiers — formations, '
      + 'and what is inside them — because that is what the bracket beside the boxes can '
      + 'show, and a third tier would have nowhere to be drawn.' }));
  }
  return box;
}

/**
 * The thickness, and the argument about it.
 *
 * Three states, and the control has to make all three legible: nothing said,
 * a number the student stands behind, and a number a block measured. When the
 * last two exist and disagree, that is the interesting case and it is given
 * the most room — a student who mapped a formation at 240 m and whose block
 * reads 310 m has found something, and the app's job is to put both numbers in
 * front of them, not to pick one.
 */
function thicknessBlock(ctx, u) {
  const box = el('div', {});
  const said = thicknessOf(u);
  const model = Number.isFinite(u.modelThickness) ? u.modelThickness : null;
  const clash = disagreement(u);

  const input = el('input', {
    class: 'num num-wide', type: 'number', min: 0, step: 1, inputmode: 'decimal',
    placeholder: '—',
  });
  input.value = said == null ? '' : String(said);
  input.addEventListener('change', () => {
    const v = input.value.trim();
    const n = Number(v);
    ctx.editUnit(u.id, (x) => {
      if (!v || !Number.isFinite(n) || n <= 0) { x.thickness = null; x.thicknessSource = null; }
      else { x.thickness = n; x.thicknessSource = 'student'; }
    });
  });

  box.appendChild(el('div', { class: 'ctl' }, [
    el('div', { class: 'ctl-head' }, [
      el('label', { class: 'ctl-label', text: 'Thickness' }),
      el('div', { class: 'ctl-value' }, [input, el('span', { class: 'unit', text: 'm' })]),
    ]),
    el('div', { class: 'ctl-hint', text: said == null
      ? 'Leave it empty until you have measured it. The section draws the unit anyway, '
        + 'dashed, at the middle of the ones you do know.'
      : u.thicknessSource === 'block'
        ? 'This came from a block cut from your map, not from a tape. Type over it whenever '
          + 'you measure it for real.'
        : 'What you measured.' }),
  ]));

  if (clash) {
    box.appendChild(el('div', { class: 'notice warn' }, [
      el('p', {}, [
        el('strong', { text: 'These do not agree. ' }),
        el('span', { text: `You have ${fmtThickness(clash.said)} m. The block, fitted to your `
          + `map, makes it ${fmtThickness(clash.model)} m — `
          + `${fmtThickness(Math.abs(clash.diff))} m ${clash.thicker ? 'thinner' : 'thicker'}.` }),
      ]),
      el('p', { class: 'dim', text: 'Both are kept. A disagreement here is a real finding: '
        + 'either the contacts are drawn in the wrong place, or the structure the block fitted '
        + 'is repeating or cutting out section, or the thickness you were given is not the '
        + 'thickness here. Nothing will decide it for you.' }),
      el('div', { class: 'row-actions' }, [
        el('button', { class: 'btn small', type: 'button', text: "Take the block's",
          onclick: () => ctx.editUnit(u.id, (x) => {
            x.thickness = x.modelThickness; x.thicknessSource = 'block';
          }) }),
        el('button', { class: 'btn small', type: 'button', text: 'Keep mine',
          onclick: () => ctx.editUnit(u.id, (x) => { x.modelThickness = null; x.modelAt = null; }) }),
      ]),
    ]));
  } else if (model != null && u.thicknessSource === 'block') {
    box.appendChild(el('div', { class: 'ctl-hint standalone', text:
      `Measured from a block on ${shortDate(u.modelAt)}.` }));
  }
  return box;
}

function rockBlock(ctx, u, set) {
  const box = el('div', {});
  const rk = rockOf(u.rockId);
  box.appendChild(selectRow({
    label: 'Rock', value: u.rockId,
    options: ROCKS.map((r) => ({ value: r.id, label: `${r.group} · ${r.label}` })),
    onChange: (v) => set((x) => {
      x.rockId = v;
      // A grain profile drawn against the old rock is still the student's
      // drawing and is left alone; only a unit that never had one takes the
      // new rock's default, which is what the drawing was showing anyway.
      if (!(x.grains || []).length) x.grains = [];
    }),
  }));

  const color = el('input', {
    class: 'unit-swatch', type: 'color', value: toHex(unitColor(u)),
    title: 'Colour for this unit, on the section and on the map',
  });
  color.addEventListener('change', () => ctx.setUnitColor(u.name, color.value, u.id));

  box.appendChild(el('div', { class: 'ctl ctl-inline' }, [
    el('div', {}, [
      el('label', { class: 'ctl-label', text: 'Colour' }),
      el('div', { class: 'ctl-hint', text: 'Every outcrop of it, here and on the map.' }),
    ]),
    el('div', { class: 'swatch-pair' }, [swatchEl(unitColor(u), rk.pattern, 'swatch small'), color]),
  ]));
  return box;
}

/**
 * The grain-size profile: the ragged right edge of the section.
 *
 * Editable two ways on purpose. Dragging on the drawing is how the shape gets
 * made — a coarsening-up unit is one stroke — and it is also imprecise, so the
 * same points are listed here with a height and a grain size that can be typed.
 */
function grainBlock(ctx, doc, u) {
  const box = el('div', {});
  const scaleId = doc.settings.grainScale || 'clastic';
  const scale = grainScale(scaleId);
  const prof = grainProfile(u, scaleId);
  const own = (u.grains || []).length > 0;

  box.appendChild(el('div', { class: 'sub-head', text: 'Grain size' }));
  box.appendChild(el('div', { class: 'ctl-hint standalone', text: own
    ? 'Height is a percentage up the unit, so the shape survives if the thickness changes. '
      + 'Two points at the same height make a sharp break rather than a ramp.'
    : `Nothing drawn yet, so the box is flat at ${scale.steps[defaultGrainFor(u.rockId, scaleId)].long.toLowerCase()}`
      + ' — what the rock type implies. Drag on the right-hand edge of the unit in the section, '
      + 'or add a point here.' }));

  if (own) {
    const rows = el('div', { class: 'grain-list' });
    prof.forEach((pt, i) => {
      const hgt = el('input', {
        class: 'num', type: 'number', min: 0, max: 100, step: 1, inputmode: 'numeric',
      });
      hgt.value = String(Math.round(pt.at * 100));
      hgt.addEventListener('change', () => ctx.setGrainPoint(u.id, i,
        { at: clamp01(Number(hgt.value) / 100) }));

      const sel = el('select', { class: 'select grain-select' },
        scale.steps.map((s, k) => el('option', { value: k, text: s.long, selected: k === pt.g })));
      sel.addEventListener('change', () => ctx.setGrainPoint(u.id, i, { g: Number(sel.value) }));

      rows.appendChild(el('div', { class: 'grain-row' }, [
        el('div', { class: 'ctl-value' }, [hgt, el('span', { class: 'unit', text: '%' })]),
        sel,
        el('button', { class: 'mini', type: 'button', text: '×', title: 'Remove this point',
          onclick: () => ctx.removeGrainPoint(u.id, i) }),
      ]));
    });
    box.appendChild(rows);
  }

  const drawing = ctx.grainMode();
  box.appendChild(el('div', { class: 'row-actions wrap' }, [
    el('button', {
      class: `btn small${drawing ? ' armed' : ''}`, type: 'button',
      text: drawing ? 'Stop drawing' : 'Draw on the section',
      onclick: () => ctx.setGrainMode(!drawing),
    }),
    el('button', { class: 'btn small', type: 'button', text: 'Add a point',
      onclick: () => ctx.addGrainPoint(u.id) }),
    own ? el('button', { class: 'btn small', type: 'button', text: 'Back to flat',
      onclick: () => ctx.editUnit(u.id, (x) => { x.grains = []; }) }) : null,
  ]));
  box.appendChild(el('div', { class: 'ctl-hint standalone', text: drawing
    ? 'Drag inside a unit on the section. Left is fine, right is coarse. Until you stop, '
      + 'a drag draws instead of scrolling.'
    : 'Armed rather than always on, because the section is taller than the screen and '
      + 'dragging it is normally how you scroll.' }));
  return box;
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

export function marksPanel(ctx) {
  const doc = ctx.doc();
  const node = el('div', { class: 'panel' });
  const armed = ctx.markSymbol();

  node.appendChild(el('div', { class: 'section-head' }, [
    el('h2', { text: 'Fossils and structures' }),
    el('p', { text: 'What was in the rock, and what the rock was doing.' }),
  ]));

  if (!doc.units.length) {
    node.appendChild(el('div', { class: 'empty' }, [
      el('p', { text: 'Add a unit first.' }),
      el('p', { class: 'dim', text: 'A symbol is placed at a height in a unit, so there has '
        + 'to be a unit for it to be at a height in.' }),
    ]));
    return node;
  }

  node.appendChild(el('div', { class: `notice${armed ? ' warn' : ''}` }, [
    el('p', { text: armed
      ? `Tap the section where you saw ${symbolLabel(armed).toLowerCase()}.`
      : 'Pick a symbol, then tap the section at the height you saw it.' }),
    armed ? el('button', { class: 'btn small', type: 'button', text: 'Stop placing',
      onclick: () => ctx.setMarkSymbol(null) }) : null,
  ]));

  for (const cat of SYMBOL_CATEGORIES) {
    node.appendChild(el('div', { class: 'sub-head', text: cat.label }));
    const grid = el('div', { class: 'sym-grid' });
    for (const s of SYMBOLS.filter((x) => x.category === cat.id)) {
      grid.appendChild(el('button', {
        class: `sym-btn${armed === s.id ? ' on' : ''}`, type: 'button', title: s.label,
        'aria-label': s.label, 'aria-pressed': armed === s.id ? 'true' : 'false',
        onclick: () => ctx.setMarkSymbol(armed === s.id ? null : s.id),
      }, [symbolIcon(s.id), el('span', { class: 'sym-name', text: s.label })]));
    }
    node.appendChild(grid);
  }

  const marks = doc.marks || [];
  node.appendChild(el('div', { class: 'sub-head', text: `Placed (${marks.length})` }));
  if (!marks.length) {
    node.appendChild(el('div', { class: 'empty-note', text: 'Nothing placed yet.' }));
    return node;
  }

  const layout = layoutColumn(doc);
  const byUnit = new Map(layout.rows.map((r) => [r.unit.id, r]));
  const sorted = [...marks].sort((a, b) => {
    const ra = byUnit.get(a.unitId), rb = byUnit.get(b.unitId);
    if (!ra || !rb) return 0;
    return (ra.base - a.at * ra.thickness) - (rb.base - b.at * rb.thickness);
  });

  for (const m of sorted) {
    const row = byUnit.get(m.unitId);
    const unit = doc.units.find((u) => u.id === m.unitId);
    const height = row ? layout.total - (row.base - m.at * row.thickness) : null;
    node.appendChild(el('div', { class: 'card split' }, [
      el('div', { class: 'card-main', onclick: () => ctx.selectMark(m.id) }, [
        el('div', { class: 'card-swatch' }, [symbolIcon(m.symbol, 'sym-icon card-sym')]),
        el('div', { class: 'card-text' }, [
          el('div', { class: 'card-title', text: symbolLabel(m.symbol) }),
          el('div', { class: 'card-sub', text: `${unit?.name || 'unnamed'}`
            + (height != null ? ` · ${fmtThickness(height)} m above the base` : '') }),
        ]),
      ]),
      el('div', { class: 'card-side' }, [
        el('button', { class: 'mini', type: 'button', text: '×', title: 'Remove',
          onclick: () => ctx.deleteMark(m.id) }),
      ]),
    ]));
  }
  return node;
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

export function legendPanel(ctx) {
  const doc = ctx.doc();
  const node = el('div', { class: 'panel' });
  const layout = layoutColumn(doc);

  node.appendChild(el('div', { class: 'section-head' }, [
    el('h2', { text: 'Explanation' }),
    el('p', { text: 'Everything on the sheet, and nothing that is not.' }),
  ]));

  node.appendChild(el('div', { class: 'sub-head', text: 'The column' }));
  node.appendChild(el('div', { class: 'stats' }, [
    statLine('Units', String(layout.rows.length)),
    statLine('Thickness', `${fmtThickness(layout.total)} m`,
      layout.unknown ? 'warn' : 'good'),
    layout.unknown ? statLine('Unmeasured', String(layout.unknown), 'warn') : null,
    layout.disagreements ? statLine('Disagreements', String(layout.disagreements), 'warn') : null,
    layout.groups.length ? statLine('Bracketed', String(layout.groups.length)) : null,
  ].filter(Boolean)));

  if (layout.unknown) {
    node.appendChild(el('div', { class: 'ctl-hint standalone', text:
      `Unmeasured units are drawn dashed at ${layout.nominal} m — the middle of the ones you `
      + 'have measured — so the section has a shape before it has numbers. The total above '
      + 'includes them, which is why it is not a measurement either.' }));
  }

  const broken = layout.groups.filter((g) => g.broken);
  for (const g of broken) {
    node.appendChild(el('div', { class: 'notice warn' }, [el('p', { text:
      `The members of ${g.unit.name || 'a formation'} are not next to each other in the column. `
      + 'The bracket spans from the first to the last, which means it also spans something '
      + 'that is not part of it. Move them together, or the formation is claiming rock it '
      + 'does not have.' })]));
  }

  const liths = lithologyEntries(doc);
  if (liths.length) {
    node.appendChild(el('div', { class: 'sub-head', text: 'Lithology' }));
    const list = el('div', { class: 'legend-list' });
    for (const l of liths) {
      list.appendChild(el('div', { class: 'legend-row' }, [
        swatchEl(l.color, l.rock.pattern, 'swatch small'),
        el('span', { class: 'legend-label', text: l.rock.label }),
        el('span', { class: 'legend-count', text: plural(l.count, 'unit') }),
      ]));
    }
    node.appendChild(list);
  }

  const marks = legendEntries(doc);
  node.appendChild(el('div', { class: 'sub-head', text: 'Symbols' }));
  if (!marks.length) {
    node.appendChild(el('div', { class: 'empty-note', text:
      'No symbols on the section yet, so there is nothing to explain.' }));
  } else {
    const list = el('div', { class: 'legend-list' });
    for (const m of marks) {
      list.appendChild(el('div', { class: 'legend-row' }, [
        symbolIcon(m.id, 'sym-icon legend-sym'),
        el('span', { class: 'legend-label', text: m.label }),
        el('span', { class: 'legend-count', text: String(m.count) }),
      ]));
    }
    node.appendChild(list);
  }

  node.appendChild(el('div', { class: 'ctl-hint standalone', text:
    'This is what goes under the section when you save it, drawn from what is actually on '
    + 'the sheet. A legend that lists symbols nobody used teaches that a legend is '
    + 'boilerplate rather than a promise.' }));
  return node;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function stratSetupPanel(ctx) {
  const doc = ctx.doc();
  const node = el('div', { class: 'panel' });
  const s = doc.settings;
  const layout = layoutColumn(doc);

  node.appendChild(el('div', { class: 'section-head' }, [
    el('h2', { text: 'The sheet' }),
    el('p', { text: 'How the section is drawn, and where it goes next.' }),
  ]));

  node.appendChild(selectRow({
    label: 'Grain-size axis', value: s.grainScale || 'clastic',
    options: Object.values(GRAIN_SCALES).map((g) => ({ value: g.id, label: g.label })),
    onChange: (v) => ctx.setSetting({ grainScale: v }),
  }));
  node.appendChild(el('div', { class: 'ctl-hint standalone', text:
    'Wentworth for siliciclastics, Dunham for carbonates. One axis per section — a drawing '
    + 'with two x axes on it is not a section. Profiles you have already drawn keep their '
    + 'step numbers, so switching and switching back loses nothing.' }));

  node.appendChild(numberRow({
    label: 'Vertical scale', value: Number(s.columnScale) || 0,
    min: 0, max: 500, step: 5, unit: 'm',
    onChange: (v) => ctx.setSetting({ columnScale: v }),
    hint: (Number(s.columnScale) || 0) === 0
      ? 'Zero fits the whole column on the screen. Set a number and it is metres per 100 '
        + 'pixels — a real scale, the one that goes in the caption.'
      : `${s.columnScale} m per 100 px. Everything is drawn to it, so a thin bed among thick `
        + 'ones is genuinely thin.',
  }));

  const room = ctx.roomForText();
  node.appendChild(toggleRow({
    label: 'Description margin', value: s.columnDescriptions !== false,
    onChange: (v) => ctx.setSetting({ columnDescriptions: v }),
    hint: room
      ? 'The text down the right-hand side of the sheet.'
      : 'On, but there is no room for it on this screen, so the sheet is drawn without it. '
        + 'Turn the screen, or pull the panel down. It always goes in the saved file.',
  }));
  node.appendChild(toggleRow({
    label: 'Symbols', value: s.columnMarks !== false,
    onChange: (v) => ctx.setSetting({ columnMarks: v }),
    hint: 'The fossils and structures gutter.',
  }));

  // --- taking the column somewhere ----------------------------------------
  node.appendChild(el('div', { class: 'sub-head', text: 'Into the block' }));
  node.appendChild(el('div', { class: 'ctl-hint standalone', text:
    'The block’s stratigraphy is this column: units youngest first, a thickness each. '
    + 'Sending it over replaces the block’s layers and leaves its history — the folds, '
    + 'the faults — exactly as they are, so you can deform your own succession rather than '
    + 'the default one.' }));
  node.appendChild(el('button', {
    class: 'btn primary wide', type: 'button',
    text: `Send ${plural(layout.rows.length, 'unit')} to the block`,
    disabled: !layout.rows.length,
    onclick: () => ctx.sendToBlock(),
  }));

  const sent = ctx.sentReport();
  if (sent) {
    node.appendChild(el('div', { class: 'notice' }, [
      el('p', {}, [
        el('strong', { text: 'Sent. ' }),
        el('span', { text: `The block now has your ${plural(sent.count, 'unit')} in it.` }),
      ]),
      ...sent.notes.map((n) => el('p', { class: 'dim', text: n })),
      el('div', { class: 'row-actions' }, [
        el('button', { class: 'btn small primary', type: 'button', text: 'Open the block',
          onclick: () => ctx.showBlock() }),
        el('button', { class: 'btn small', type: 'button', text: 'Dismiss',
          onclick: () => ctx.clearSent() }),
      ]),
    ]));
  }

  node.appendChild(el('div', { class: 'sub-head', text: 'From the map' }));
  node.appendChild(el('div', { class: 'ctl-hint standalone', text:
    'Every unit here is a unit on the map, so there is nothing to import — name it once and '
    + 'it is in both. What the map gives back is thicknesses: build a block from your mapped '
    + 'area on the Map section’s Block tab, and the contacts it traced become measured '
    + 'thicknesses here, marked as having come from a model.' }));
  const stamped = doc.units.filter((u) => u.modelThickness != null).length;
  node.appendChild(el('div', { class: 'stats' }, [
    statLine('Modelled', String(stamped), stamped ? 'good' : 'dim'),
    statLine('Disagreeing', String(layout.disagreements),
      layout.disagreements ? 'warn' : 'dim'),
  ]));

  node.appendChild(el('div', { class: 'sub-head', text: 'Save section' }));
  node.appendChild(saveBlock(ctx, layout));
  return node;
}

/**
 * Pick a format, then save.
 *
 * Four buttons that each fire the moment they are touched read as four
 * choices, but they behave as four triggers — there is no way to look at them,
 * decide, and then commit. Choosing and doing are separated here: the chips
 * say what you would get, and one button does it.
 *
 * The chips repaint themselves and only the sentence beneath them changes, so
 * choosing a format does not rebuild the panel under the finger.
 */
const FORMATS = [
  {
    id: 'pdf', label: 'PDF',
    blurb: 'The sheet as it is meant to be handed in: the section with its explanation '
      + 'under it, on a page as tall as the column needs, in vector. It opens the print '
      + 'dialog — choose Save as PDF there.',
  },
  {
    id: 'svg', label: 'SVG',
    blurb: 'The same drawing as a file to edit, in Illustrator or Inkscape, at whatever '
      + 'size a report wants.',
  },
  {
    id: 'png', label: 'PNG',
    blurb: 'A bitmap at three times size, for a document that will not take vector.',
  },
  {
    id: 'csv', label: 'CSV',
    blurb: 'The numbers rather than the drawing: one row per unit, with both thicknesses, '
      + 'the grain-size range, the contact style and everything placed in it.',
  },
];

function saveBlock(ctx, layout) {
  const box = el('div', {});
  const hint = el('div', { class: 'ctl-hint standalone' });
  const describe = () => {
    const f = FORMATS.find((x) => x.id === ctx.saveFormat()) || FORMATS[0];
    hint.textContent = f.blurb;
  };

  box.appendChild(chipsRow({
    label: 'Format',
    value: ctx.saveFormat(),
    options: FORMATS.map((f) => ({ id: f.id, label: f.label, hint: f.blurb })),
    onChange: (v) => { ctx.setSaveFormat(v); describe(); },
  }));
  describe();
  box.appendChild(hint);
  box.appendChild(el('button', {
    class: 'btn primary wide', type: 'button', text: 'Save section',
    disabled: !layout.rows.length,
    onclick: () => ctx.save(),
  }));
  if (!layout.rows.length) {
    box.appendChild(el('div', { class: 'ctl-hint standalone',
      text: 'Nothing to save yet — the column is empty.' }));
  }
  return box;
}

// ---------------------------------------------------------------------------

function statLine(label, value, cls = '') {
  return el('div', { class: 'stat' }, [
    el('span', { class: 'stat-label', text: label }),
    el('span', { class: `stat-value ${cls}`, text: value }),
  ]);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function clamp01(v) { return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; }

function shortDate(iso) {
  if (!iso) return 'an earlier build';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'an earlier build'
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** A colour input needs #rrggbb, and a unit's colour may arrive as rgb(). */
function toHex(css) {
  if (/^#[0-9a-f]{6}$/i.test(css)) return css;
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/i.exec(css || '');
  if (!m) return '#9aa7b2';
  return `#${[1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('')}`;
}
