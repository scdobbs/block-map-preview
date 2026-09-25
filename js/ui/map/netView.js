// The map's stereonet: the stations inside an area, as poles to bedding.
//
// The block has a net beside it that reads attitudes out of a model. This
// one reads them out of the notebook, for whatever ground was boxed or drawn
// round on the map, and lets the set be narrowed by what was measured, in
// which unit, how confidently, and station by station. It reuses the block's
// drawing and its verdict, so the same fold reads the same way in both.
//
// Full screen, like the compass: a phone has no room for a legible net and
// the map at once, and the map is what the area was chosen on.

import { el, svg, clear } from '../widgets.js';
import { drawNet, verdict, numbers } from '../stereonet.js';
import { fitBedding, PROJECTIONS } from '../../geo/stereonet.js';
import { PLANAR_FEATURES, CERTAINTIES, feature, formatAttitude, isLinearFeature,
  isOverturned } from '../../field/model.js';

const VB = 360;

export function netView(ctx) {
  const node = el('div', { class: 'measure-full net-full' });
  let selected = ctx.selectedStationId();

  const count = el('span', { class: 'stereo-sub' });
  node.appendChild(el('div', { class: 'mf-head' }, [
    el('h2', { class: 'net-title', text: 'Stereonet' }),
    count,
    el('button', {
      class: 'mf-close', type: 'button', 'aria-label': 'Close',
      onclick: () => ctx.close(),
    }, [el('span', { text: '×' })]),
  ]));

  const body = el('div', { class: 'mf-scroll' });
  node.appendChild(body);
  const face = svg('svg', { viewBox: `0 0 ${VB} ${VB}`, class: 'stereo-net', 'aria-label': 'Stereonet' });
  const figure = el('div', { class: 'stereo-figure net-figure' }, [face]);
  const side = el('div', { class: 'net-side' });
  body.append(figure, side);

  // -------------------------------------------------------------------------

  const unitOf = (doc, st) => {
    if (st.unitId) { const u = doc.units.find((x) => x.id === st.unitId); if (u) return u; }
    const key = String(st.unitName || '').trim().toLowerCase();
    return key ? doc.units.find((x) => String(x.name || '').trim().toLowerCase() === key) || null : null;
  };
  const unitName = (doc, st) => unitOf(doc, st)?.name || String(st.unitName || '').trim() || '';
  const formationOf = (doc, st) => {
    const u = unitOf(doc, st);
    if (!u) return null;
    if (u.parentId) return doc.units.find((x) => x.id === u.parentId) || null;
    return u.rank === 'formation' ? u : null;
  };

  /** What survives the filters, and why the rest did not. */
  const select = () => {
    const doc = ctx.doc();
    const f = ctx.filters;
    const inside = ctx.inside();
    // Only planes with a reading can go on as poles.
    const planar = inside.filter((st) => !isLinearFeature(st.feature)
      && Number.isFinite(st.strike) && Number.isFinite(st.dip));
    const rows = planar.map((st) => {
      const unit = unitName(doc, st);
      const fm = formationOf(doc, st);
      const why = f.featuresOff.has(st.feature) ? 'feature'
        : f.certaintyOff.has(st.certainty || 'measured') ? 'confidence'
        : (!f.overturned && isOverturned(st)) ? 'overturned'
        : (unit && f.unitsOff.has(unit)) ? 'unit'
        : (fm && f.formationsOff.has(fm.id)) ? 'formation'
        : ctx.excluded.has(st.id) ? 'excluded' : null;
      return { st, unit, fm, why };
    });
    return { inside, planar, rows, plotted: rows.filter((r) => !r.why).map((r) => r.st) };
  };

  const build = () => {
    const doc = ctx.doc();
    const f = ctx.filters;
    const kind = doc.settings.netProjection === 'equalAngle' ? 'equalAngle' : 'equalArea';
    const { inside, planar, rows, plotted } = select();
    const beds = plotted.map((st) => ({ id: st.id, strike: st.strike, dip: st.dip }));
    const fit = fitBedding(beds);
    const area = ctx.area();

    count.textContent = `${beds.length} of ${inside.length} in the ${area?.kind === 'polygon' ? 'polygon' : 'box'}`;

    drawNet(face, kind, beds, fit, null, doc.settings.netPlanes === true, {
      selectedMarkerId: () => selected,
      selectMarker: (id) => { selected = id; ctx.selectStation(id); build(); },
    }, null);

    clear(side);
    side.appendChild(verdict(fit, null));
    if (fit.n >= 3) side.appendChild(numbers(fit));

    // --- plot ---------------------------------------------------------------
    side.appendChild(el('div', { class: 'sub-head', text: 'Plot' }));
    side.appendChild(el('div', { class: 'chip-row' }, [
      ...PROJECTIONS.map((p) => el('button', {
        class: `chip ${kind === p.id ? 'on' : ''}`, type: 'button', text: p.label, title: p.hint,
        onclick: () => { ctx.setSetting({ netProjection: p.id }); build(); },
      })),
      el('button', {
        class: `chip ${doc.settings.netPlanes ? 'on' : ''}`, type: 'button', text: 'Great circles',
        onclick: () => { ctx.setSetting({ netPlanes: !doc.settings.netPlanes }); build(); },
      }),
    ]));

    // --- filters ------------------------------------------------------------
    // Each row is the values present in the area; a chip that is off keeps
    // its stations off the net. Rows with one value are not worth a row.
    side.appendChild(el('div', { class: 'sub-head', text: 'Include' }));
    const toggleRow = (label, items, offSet, key) => {
      if (items.length < 2) return;
      side.appendChild(el('div', { class: 'ctl' }, [
        el('div', { class: 'ctl-head' }, [el('label', { class: 'ctl-label', text: label })]),
        el('div', { class: 'chips' }, items.map((it) => el('button', {
          class: `chip ${offSet.has(it[key]) ? '' : 'on'}`, type: 'button',
          onclick: () => { if (offSet.has(it[key])) offSet.delete(it[key]); else offSet.add(it[key]); build(); },
        }, [el('span', { text: `${it.label} · ${it.n}` })]))),
      ]));
    };
    const tally = (list, keyOf, labelOf) => {
      const m = new Map();
      for (const x of list) { const k = keyOf(x); if (k == null || k === '') continue; if (!m.has(k)) m.set(k, { id: k, label: labelOf(x), n: 0 }); m.get(k).n++; }
      return [...m.values()];
    };
    toggleRow('Feature',
      PLANAR_FEATURES.map((fe) => ({ id: fe.id, label: fe.label, n: planar.filter((s) => s.feature === fe.id).length })).filter((x) => x.n),
      f.featuresOff, 'id');
    toggleRow('Confidence',
      CERTAINTIES.map((c) => ({ id: c.id, label: c.label, n: planar.filter((s) => (s.certainty || 'measured') === c.id).length })).filter((x) => x.n),
      f.certaintyOff, 'id');
    toggleRow('Formation', tally(rows.filter((r) => r.fm), (r) => r.fm.id, (r) => r.fm.name || 'unnamed'), f.formationsOff, 'id');
    toggleRow('Unit', tally(rows.filter((r) => r.unit), (r) => r.unit, (r) => r.unit), f.unitsOff, 'id');
    const ot = planar.filter((s) => isOverturned(s)).length;
    if (ot) {
      side.appendChild(el('div', { class: 'chip-row' }, [el('button', {
        class: `chip ${f.overturned ? 'on' : ''}`, type: 'button',
        text: `Overturned · ${ot}`,
        onclick: () => { f.overturned = !f.overturned; build(); },
      })]));
    }

    // --- the stations, one by one ------------------------------------------
    // Tap a row to take a station out or put it back. A pole tapped on the
    // net highlights its row here and selects the station on the map.
    side.appendChild(el('div', { class: 'sub-head', text: `Stations · ${planar.length}` }));
    if (inside.length > planar.length) {
      side.appendChild(el('div', { class: 'ctl-hint standalone',
        text: `${inside.length - planar.length} in the area without a planar reading are not shown.` }));
    }
    const list = el('div', { class: 'net-rows' });
    for (const r of rows) {
      const st = r.st;
      const off = !!r.why;
      const byHand = r.why === 'excluded';
      list.appendChild(el('button', {
        class: `net-row ${off ? 'off' : ''} ${st.id === selected ? 'selected' : ''}`, type: 'button',
        title: off && !byHand ? `Off by the ${r.why} filter` : (off ? 'Tap to put back' : 'Tap to take out'),
        disabled: off && !byHand,
        onclick: () => {
          if (ctx.excluded.has(st.id)) ctx.excluded.delete(st.id); else ctx.excluded.add(st.id);
          build();
        },
      }, [
        el('span', { class: 'net-row-mark', text: off ? '○' : '●' }),
        el('span', { class: 'net-row-name', text: st.name || '—' }),
        el('span', { class: 'net-row-att', text: formatAttitude(st) }),
        el('span', { class: 'net-row-sub', text: [r.unit, st.feature !== 'bedding' ? feature(st.feature).label : null]
          .filter(Boolean).join(' · ') }),
      ]));
    }
    side.appendChild(list);
    if (ctx.excluded.size || f.unitsOff.size || f.formationsOff.size || f.certaintyOff.size || !f.overturned) {
      side.appendChild(el('button', {
        class: 'btn small', type: 'button', text: 'Put everything back',
        onclick: () => { ctx.resetFilters(); build(); },
      }));
    }
  };

  node.refresh = build;
  build();
  return node;
}
