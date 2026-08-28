// The map beside the block.
//
// Not a second view of the block: a view of the *evidence*. It draws the
// ground the block is standing on, the lines somebody walked, and the lines
// the block's own history says should be there — so the question stops being
// "does this block look plausible" and becomes "where exactly does it disagree
// with what I mapped, and why".
//
// That is the whole reason the feature is worth having. A fitted block that
// cannot be argued with has taught nobody anything.

import { el } from './widgets.js';
import { hillshadeImageData, chooseInterval } from '../field/dem.js';
import { traceContours, levelsFor } from '../geo/marching.js';
import { predictedTraces } from '../geo/infer.js';
import { surfaceRange, isDemSurface } from '../geo/surfaces.js';
import { lineKind } from '../field/model.js';

/** Dash patterns, matching the way the Map section draws the same lines. */
const DASH = {
  certain: [], approximate: [7, 4], inferred: [12, 6], concealed: [2, 4],
};

export class GroundMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._shade = null;      // cached hillshade, keyed by the surface's id
    this._doc = null;
    this._traces = null;     // cached predicted traces, keyed by the history
    this.showPredicted = true;
    this.showDrawn = true;
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.draw());
      this._ro.observe(canvas);
    }
  }

  destroy() { this._ro?.disconnect(); }

  update(doc) {
    this._doc = doc;
    this.draw();
  }

  /** Is there anything for this pane to show? */
  static available(doc) {
    return !!doc && isDemSurface(doc.topo);
  }

  draw() {
    const doc = this._doc;
    const c = this.canvas;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!doc || w < 2 || h < 2) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!isDemSurface(doc.topo)) return;

    const G = doc.topo;
    const W = doc.block.width;
    const D = doc.block.depth;

    // Fit the footprint into the pane, north up, with room for the caption.
    const pad = 14;
    const scale = Math.min((w - pad * 2) / W, (h - pad * 2 - 18) / D);
    const bw = W * scale;
    const bh = D * scale;
    const ox = (w - bw) / 2;
    const oy = (h - 18 - bh) / 2;
    const px = (x) => ox + (x / W + 0.5) * bw;
    const py = (y) => oy + (0.5 - y / D) * bh;

    this._drawGround(ctx, G, doc, ox, oy, bw, bh);
    if (this.showPredicted) this._drawPredicted(ctx, doc, px, py);
    if (this.showDrawn) this._drawSurvey(ctx, doc, px, py);

    // Frame and scale.
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      W >= 1000 ? `${(W / 1000).toFixed(1)} km across` : `${Math.round(W)} m across`,
      ox, oy + bh + 13,
    );
    this._drawKey(ctx, doc, ox + bw, oy + bh + 13);
  }

  // --- the ground ---------------------------------------------------------

  _drawGround(ctx, G, doc, ox, oy, bw, bh) {
    if (!this._shade || this._shade.id !== G.id) {
      const off = document.createElement('canvas');
      off.width = G.nx;
      off.height = G.ny;
      // The grid runs south to north; a canvas runs top to bottom.
      const flipped = new Float32Array(G.grid.length);
      for (let j = 0; j < G.ny; j++) {
        flipped.set(G.grid.subarray((G.ny - 1 - j) * G.nx, (G.ny - j) * G.nx), j * G.nx);
      }
      // putImageData does not composite, so the ground tone goes on the page
      // canvas underneath rather than here.
      off.getContext('2d').putImageData(
        hillshadeImageData(flipped, G.nx, G.ny, {
          cellSize: doc.block.width / (G.nx - 1), strength: 0.85,
        }), 0, 0,
      );
      this._shade = { id: G.id, canvas: off, flipped };
    }

    ctx.fillStyle = '#9aa7ae';
    ctx.fillRect(ox, oy, bw, bh);
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this._shade.canvas, ox, oy, bw, bh);
    ctx.restore();

    // Topographic contours, at the same interval and the same real elevations
    // the block itself is drawing them at.
    const r = surfaceRange(G, doc.block.width, doc.block.depth);
    const interval = doc.settings.contourInterval > 0
      ? doc.settings.contourInterval
      : chooseInterval(r.hi - r.lo, 14);
    if (!(interval > 0)) return;
    const datum = G.datum || 0;
    const levels = levelsFor(r.lo + datum, r.hi + datum, interval).map((v) => v - datum);
    const every = 5;
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = 'rgba(70,52,32,.42)';
    ctx.beginPath();
    const heavy = [];
    for (const { level, seg } of traceContours(this._shade.flipped, G.nx, G.ny, levels)) {
      const isIndex = Math.abs(Math.round((level + datum) / interval) % every) < 0.5;
      const into = isIndex ? heavy : null;
      for (let k = 0; k < seg.length; k += 4) {
        const X = (gx) => ox + (gx / (G.nx - 1)) * bw;
        const Y = (gy) => oy + (gy / (G.ny - 1)) * bh;
        if (into) { into.push(X(seg[k]), Y(seg[k + 1]), X(seg[k + 2]), Y(seg[k + 3])); continue; }
        ctx.moveTo(X(seg[k]), Y(seg[k + 1]));
        ctx.lineTo(X(seg[k + 2]), Y(seg[k + 3]));
      }
    }
    ctx.stroke();
    // Every fifth one heavier, the way a map prints it.
    ctx.beginPath();
    for (let k = 0; k < heavy.length; k += 4) {
      ctx.moveTo(heavy[k], heavy[k + 1]);
      ctx.lineTo(heavy[k + 2], heavy[k + 3]);
    }
    ctx.strokeStyle = 'rgba(60,42,24,.62)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // --- what the block predicts --------------------------------------------

  _drawPredicted(ctx, doc, px, py) {
    const survey = doc.survey;
    if (!survey || !survey.levels || !survey.levels.length || !doc.events.length) return;

    // Tracing is real work, so it only reruns when the history or the ground
    // actually changes — not on every repaint, and not while the pane resizes.
    const key = JSON.stringify([doc.events, survey.levels, doc.topo.id]);
    if (!this._traces || this._traces.key !== key) {
      this._traces = {
        key,
        runs: predictedTraces(doc.events, doc.topo, survey.levels.map((l) => l.depth)),
      };
    }

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Wide and soft, with the walked line laid thin on top: where the model
    // agrees the drawn line sits inside a halo, and where it does not there
    // are visibly two lines and the gap between them is the error.
    ctx.strokeStyle = 'rgba(87,182,224,.55)';
    ctx.lineWidth = 7;
    for (const t of this._traces.runs) {
      ctx.beginPath();
      t.pts.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- what was walked ----------------------------------------------------

  _drawSurvey(ctx, doc, px, py) {
    const survey = doc.survey;
    if (!survey) return;

    for (const ln of survey.lines || []) {
      const kind = lineKind(ln.kind);
      const fault = ln.kind === 'fault';
      const neat = ln.kind === 'boundary';
      ctx.save();
      ctx.setLineDash(DASH[ln.certainty] || []);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ln.pts.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
      // A pale halo, not a dark one. These are the map's own colours — a
      // near-black contact, a red fault — and on grey hillshade crossed by
      // brown contours a dark line needs light around it to be found at all.
      if (!neat) {
        ctx.strokeStyle = 'rgba(255,255,255,.75)';
        ctx.lineWidth = fault ? 5 : 3.6;
        ctx.stroke();
      }
      ctx.strokeStyle = kind.color;
      ctx.lineWidth = fault ? 2.4 : neat ? 1.1 : 1.7;
      ctx.stroke();
      ctx.restore();
    }

    for (const s of survey.stations || []) {
      strikeDipMark(ctx, px(s.x), py(s.y), s.strike, s.dip);
    }
  }

  _drawKey(ctx, doc, right, y) {
    const bits = [];
    const lines = (doc.survey && doc.survey.lines) || [];
    // The colour a real mapped line was drawn in, so the key cannot promise
    // one thing while the map shows another — and never the neat line, which
    // is not something anybody walked.
    const first = lines.find((l) => l.kind !== 'boundary');
    if (this.showDrawn && first) bits.push([lineKind(first.kind).color, 'walked']);
    if (this.showPredicted && this._traces && this._traces.runs.length) bits.push(['#57b6e0', 'predicted']);
    if (!bits.length) return;
    ctx.save();
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    let x = right;
    for (const [color, label] of bits.reverse()) {
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.fillText(label, x, y);
      const wLabel = ctx.measureText(label).width;
      ctx.beginPath();
      ctx.moveTo(x - wLabel - 20, y - 4);
      ctx.lineTo(x - wLabel - 6, y - 4);
      ctx.strokeStyle = 'rgba(255,255,255,.6)';
      ctx.lineWidth = 4.5;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      x -= wLabel + 30;
    }
    ctx.restore();
  }
}

/** The ordinary map mark: a bar along strike, a tick down dip, the number. */
function strikeDipMark(ctx, x, y, strike, dip) {
  if (!Number.isFinite(strike)) return;
  const a = (90 - strike) * Math.PI / 180;
  const dx = Math.cos(a);
  const dy = -Math.sin(a);
  const L = 9;
  ctx.save();
  ctx.lineCap = 'round';
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass ? '#f8fafb' : '#0e1418';
    ctx.lineWidth = pass ? 1.4 : 3.2;
    ctx.beginPath();
    ctx.moveTo(x - dx * L, y - dy * L);
    ctx.lineTo(x + dx * L, y + dy * L);
    // The dip tick sits 90 degrees clockwise from strike — the right-hand rule.
    ctx.moveTo(x, y);
    ctx.lineTo(x + dy * -L * 0.5, y + dx * L * 0.5);
    ctx.stroke();
  }
  if (Number.isFinite(dip)) {
    const tx = x + dy * -L * 0.8 + 3;
    const ty = y + dx * L * 0.8 + 4;
    ctx.font = '600 9px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.strokeStyle = '#0e1418';
    ctx.lineWidth = 2.4;
    ctx.strokeText(String(Math.round(dip)), tx, ty);
    ctx.fillStyle = '#f8fafb';
    ctx.fillText(String(Math.round(dip)), tx, ty);
  }
  ctx.restore();
}

/**
 * The pane the block sits beside, built to the same shape as the stereonet's
 * so it inherits the split, the grip and the responsive rules rather than
 * growing a second set that drift apart.
 */
export function groundMapPane(ctx) {
  const canvas = document.createElement('canvas');
  canvas.className = 'ground-canvas';
  const map = new GroundMap(canvas);

  const toggle = (label, key, title) => el('button', {
    class: 'ground-toggle on', type: 'button', text: label, title,
    onclick: (e) => {
      map[key] = !map[key];
      e.currentTarget.classList.toggle('on', map[key]);
      map.draw();
    },
  });

  const root = el('div', { class: 'stereo-panel ground-panel hidden' }, [
    el('button', {
      class: 'stereo-grip', type: 'button',
      'aria-label': 'Drag to give the map more of the screen',
      title: 'Drag to resize, or tap to cycle',
    }),
    el('div', { class: 'stereo-head' }, [
      el('h2', { text: 'Ground map' }),
      el('span', { class: 'stereo-sub', text: 'walked vs predicted' }),
      el('button', {
        class: 'stereo-close', type: 'button', text: '×', 'aria-label': 'Hide the map',
        onclick: () => ctx.setGroundMap(false),
      }),
    ]),
    el('div', { class: 'ground-body' }, [canvas]),
    el('div', { class: 'ground-legend' }, [
      toggle('Walked', 'showDrawn', 'The contacts and faults you mapped'),
      toggle('Predicted', 'showPredicted', 'Where this block says those contacts should crop out'),
    ]),
  ]);

  // The element itself, with its methods on it — the same shape stereonet()
  // returns, so the stage can treat the two panes identically.
  root.setVisible = (on) => {
    root.classList.toggle('hidden', !on);
    if (on) requestAnimationFrame(() => map.draw());
  };
  root.refresh = () => map.update(ctx.store.doc);
  root.map = map;
  root.grip = root.querySelector('.stereo-grip');
  return root;
}
