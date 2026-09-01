// The cross-section beside the block.
//
// Draw a line on the map, look at the block along it. That is the one drawing
// a geologist makes that a rotatable 3D model does not already give you: a
// block face is wherever the cutaway happens to be, and a section is where the
// structure is. Down a fold axis and the beds look flat; across it and the
// whole fold is there in one picture.
//
// Nothing here models any geology. The raster is `rockAt` asked on a grid over
// the plane (js/geo/section.js), so the section is the same rock the block is
// showing, sampled somewhere else — it cannot drift out of agreement with it.

import { el, clear } from './widgets.js';
import { footprint } from '../render/block.js';
import { surfaceHeight, isDemSurface } from '../geo/surfaces.js';
import { planeFrame, DEG, clamp, quadrantBearing } from '../geo/math.js';
import { unconformityDatums, sliceCut } from '../geo/model.js';
import { rockAt } from '../geo/unmake.js';
import {
  sectionLine, sectionFrame, sectionPalette, sampleSection, groundProfile,
  planeTrace, projectReadings, lidAt, SKY, BASEMENT, INTRUSION,
} from '../geo/section.js';

const FONT = '11px system-ui, -apple-system, sans-serif';
const INK = '#0d1216';
const SKYLINE = '#f0f4f6';
const FAULT = '#ff6b6b';
const UNCONF = '#90e0a0';

/**
 * Exaggerations the pane offers.
 *
 * Stopping at ×5 is deliberate. Past that the pinned scale eats the depth
 * faster than any pane can give it back, and what is left is a shallow ribbon
 * that says less than the fitted drawing it replaced. Fit stays on the list,
 * and stays the default, because it is the right answer while the line is
 * still being moved around.
 */
const VE_STEPS = [
  { v: 0, label: 'Fit' },
  { v: 0.5, label: '×0.5' },
  { v: 1, label: '×1' },
  { v: 1.5, label: '×1.5' },
  { v: 2, label: '×2' },
  { v: 3, label: '×3' },
  { v: 5, label: '×5' },
];

// How much detail the raster is drawn at. Dragging an endpoint redraws on
// every pointer move, and a full-resolution walk of the history per pixel is
// not something to do sixty times a second — so a drag gets the coarse grid
// and the moment the finger lifts it is redrawn properly.
const QUICK = { scale: 0.34, cap: 26000 };
const FULL = { scale: 1, cap: 190000 };

export class CrossSection {
  constructor(mapCanvas, plotCanvas, ctx) {
    this.mapCanvas = mapCanvas;
    this.plotCanvas = plotCanvas;
    this.ctx = ctx;
    this.showStations = true;
    this._raster = null;          // { key, cols, rows, canvas }
    this._mapRaster = null;
    this._caption = '';           // what the last tap on the section identified
    this._quick = false;
    this.onCaption = null;
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.draw());
      this._ro.observe(plotCanvas);
    }
  }

  destroy() { this._ro?.disconnect(); }

  /** Draw both canvases. `quick` trades resolution for a redraw under a finger. */
  draw(quick = false) {
    this._quick = quick;
    // The document as the time slider has it, so a rewound block and its
    // section are the same block.
    const doc = this.ctx.doc();
    const h = this.ctx.history();
    const box = footprint(doc.block);
    const line = sectionLine(doc, box);
    const frame = sectionFrame(doc, box, line);
    this.frame = frame;
    this.box = box;
    this._drawLocator(doc, h, box, frame, quick);
    this._drawSection(doc, h, frame, quick);
  }

  // -------------------------------------------------------------------------
  // The locator: where the line runs, over the map the block would print
  // -------------------------------------------------------------------------

  _drawLocator(doc, h, box, frame, quick) {
    const c = this.mapCanvas;
    const w = c.clientWidth;
    const hgt = c.clientHeight;
    if (w < 2 || hgt < 2) return;
    const g = fitCanvas(c, w, hgt);

    const W = box.x1 - box.x0;
    const D = box.y1 - box.y0;
    const pad = 8;
    const scale = Math.min((w - pad * 2) / W, (hgt - pad * 2) / D);
    const bw = W * scale;
    const bh = D * scale;
    const ox = (w - bw) / 2;
    const oy = (hgt - bh) / 2;
    this.mapPlace = { ox, oy, bw, bh, box };
    const px = (x) => ox + ((x - box.x0) / W) * bw;
    const py = (y) => oy + (1 - (y - box.y0) / D) * bh;

    // The geologic map, at the land surface — the same walk the block's lid
    // is coloured by, so choosing where to cut is done by looking at the map
    // pattern rather than by guessing at a blank rectangle.
    const n = quick ? 48 : 128;
    const key = mapKey(doc, n);
    if (!this._mapRaster || this._mapRaster.key !== key) {
      this._mapRaster = { key, canvas: this._bakeMap(doc, h, box, n) };
    }
    g.imageSmoothingEnabled = true;
    g.drawImage(this._mapRaster.canvas, ox, oy, bw, bh);

    g.strokeStyle = 'rgba(255,255,255,.22)';
    g.lineWidth = 1;
    g.strokeRect(ox + 0.5, oy + 0.5, bw - 1, bh - 1);

    // The line, with a halo so it is findable over any lithology colour.
    const a = [px(frame.ax), py(frame.ay)];
    const b = [px(frame.bx), py(frame.by)];
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.strokeStyle = 'rgba(255,255,255,.85)';
    g.lineWidth = 4.5;
    g.stroke();
    g.strokeStyle = INK;
    g.lineWidth = 1.8;
    g.stroke();

    for (const [p, label] of [[a, 'A'], [b, "A′"]]) {
      g.beginPath();
      g.arc(p[0], p[1], 7, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,.92)';
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 1.6;
      g.stroke();
      g.fillStyle = INK;
      g.font = '600 10px system-ui, -apple-system, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, p[0], p[1] + 0.5);
    }
    g.textBaseline = 'alphabetic';
  }

  _bakeMap(doc, h, box, n) {
    const W = box.x1 - box.x0;
    const D = box.y1 - box.y0;
    const cols = n;
    const rows = Math.max(8, Math.round((n * D) / W));
    const off = document.createElement('canvas');
    off.width = cols;
    off.height = rows;
    const g = off.getContext('2d');
    const img = g.createImageData(cols, rows);
    const pal = paletteRGB(sectionPalette(h, doc));
    for (let j = 0; j < rows; j++) {
      // Row 0 of a canvas is the top of the image, which is north.
      const y = box.y1 - ((j + 0.5) / rows) * D;
      for (let i = 0; i < cols; i++) {
        const x = box.x0 + ((i + 0.5) / cols) * W;
        const z = lidAt(doc, x, y) - 0.5;
        const r = rockAt(h, [x, y, z]);
        const code = r.kind === 'layer' ? r.index
          : r.kind === 'intrusion' ? INTRUSION + h.events.indexOf(r.event)
            : BASEMENT;
        const rgbv = pal.get(code) || [90, 90, 90];
        const k = (j * cols + i) * 4;
        img.data[k] = rgbv[0];
        img.data[k + 1] = rgbv[1];
        img.data[k + 2] = rgbv[2];
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return off;
  }

  // -------------------------------------------------------------------------
  // The section
  // -------------------------------------------------------------------------

  _drawSection(doc, h, frame, quick) {
    const c = this.plotCanvas;
    const w = c.clientWidth;
    const hgt = c.clientHeight;
    if (w < 40 || hgt < 40) return;
    const g = fitCanvas(c, w, hgt);

    // On a pane dragged down to a strip the axis furniture would take more of
    // the height than the rock does, so it gets out of the way first.
    const short = hgt < 200;
    const M = { l: 46, r: 10, t: short ? 13 : 17, b: short ? 26 : 34 };
    const availW = w - M.l - M.r;
    const availH = hgt - M.t - M.b;
    if (availW < 20 || availH < 20) return;

    // Scale.
    //
    // Fit is what the pane does when nobody has said otherwise, because a
    // phone-sized pane at true scale is a hairline. But a fitted section
    // changes its exaggeration every time the pane is resized or the line is
    // redrawn, and a drawing whose vertical scale moves under you is one you
    // cannot compare two of. So the exaggeration can be pinned, and when it is
    // it is the width that is kept and the DEPTH that gives: the whole of A–A′
    // stays on the page, and the section shows the ground down as far as the
    // pinned scale reaches. Anything below that is named rather than dropped
    // quietly — see the caption and the dashed bottom edge.
    const setVE = Number(doc.settings.sectionVE) || 0;
    const sx = availW / frame.len;
    let sz;
    let cutOff = null;
    if (setVE > 0) {
      sz = sx * setVE;
      if ((frame.z1 - frame.z0) * sz > availH) {
        cutOff = frame.z1 - availH / sz;
        frame = { ...frame, z0: cutOff };
      }
    } else {
      sz = availH / (frame.z1 - frame.z0);
    }
    const zSpan = frame.z1 - frame.z0;
    const plotW = frame.len * sx;
    const plotH = zSpan * sz;
    const ox = M.l + (availW - plotW) / 2;
    const oy = M.t + (availH - plotH) / 2;
    const ve = sz / sx;
    this.place = { ox, oy, plotW, plotH, sx, sz, frame };

    const PX = (s) => ox + s * sx;
    const PZ = (z) => oy + (frame.z1 - z) * sz;

    // --- the rock ----------------------------------------------------------
    const q = quick ? QUICK : FULL;
    let cols = Math.max(24, Math.round(plotW * q.scale));
    let rows = Math.max(18, Math.round(plotH * q.scale));
    const over = (cols * rows) / q.cap;
    if (over > 1) {
      const k = Math.sqrt(over);
      cols = Math.max(24, Math.round(cols / k));
      rows = Math.max(18, Math.round(rows / k));
    }

    const key = sectionKey(doc, frame, cols, rows);
    if (!this._raster || this._raster.key !== key) {
      this._raster = { key, ...this._bakeSection(doc, h, frame, cols, rows) };
    }
    g.imageSmoothingEnabled = true;
    g.drawImage(this._raster.canvas, ox, oy, plotW, plotH);

    // --- structures the raster cannot say out loud -------------------------
    g.save();
    g.beginPath();
    g.rect(ox, oy, plotW, plotH);
    g.clip();
    this._drawStructures(g, doc, frame, PX, PZ);
    this._drawGroundLine(g, doc, frame, PX, PZ, plotW);
    if (this.showStations) this._drawStations(g, frame, PX, PZ);
    g.restore();

    // --- frame, axes, labels ----------------------------------------------
    g.strokeStyle = 'rgba(255,255,255,.25)';
    g.lineWidth = 1;
    if (cutOff == null) {
      g.strokeRect(ox + 0.5, oy + 0.5, plotW - 1, plotH - 1);
    } else {
      // Three solid sides and a dashed one. The bottom of this drawing is not
      // the bottom of the block, and a solid rule there would say it was.
      g.beginPath();
      g.moveTo(ox + 0.5, oy + plotH - 0.5);
      g.lineTo(ox + 0.5, oy + 0.5);
      g.lineTo(ox + plotW - 0.5, oy + 0.5);
      g.lineTo(ox + plotW - 0.5, oy + plotH - 0.5);
      g.stroke();
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(ox + 0.5, oy + plotH - 0.5);
      g.lineTo(ox + plotW - 0.5, oy + plotH - 0.5);
      g.stroke();
      g.setLineDash([]);
    }
    this._drawAxes(g, doc, frame, PX, PZ, ox, oy, plotW, plotH);

    g.font = '600 12px system-ui, -apple-system, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.textAlign = 'left';
    g.fillText('A', ox, oy - 4);
    g.textAlign = 'right';
    g.fillText('A′', ox + plotW, oy - 4);

    g.font = FONT;
    g.fillStyle = 'rgba(255,255,255,.42)';
    g.textAlign = 'center';
    const veText = ve > 1.05 || ve < 0.95
      ? `vertical exaggeration ×${round1(ve)}`
      : 'no vertical exaggeration';
    const cutText = cutOff == null ? ''
      : ` · below ${Math.round(cutOff + (doc.topo.datum || 0))} m not shown`;
    g.fillText(veText + cutText, ox + plotW / 2, oy + plotH + (short ? 21 : 28));
    this.ve = ve;
    this.cutOff = cutOff;
  }

  _bakeSection(doc, h, frame, cols, rows) {
    const code = sampleSection(h, doc, frame, cols, rows);
    const pal = paletteRGB(sectionPalette(h, doc));
    const off = document.createElement('canvas');
    off.width = cols;
    off.height = rows;
    const g = off.getContext('2d');
    const img = g.createImageData(cols, rows);
    const d = img.data;

    for (let k = 0; k < code.length; k++) {
      const v = code[k];
      const o = k * 4;
      if (v === SKY) { d[o + 3] = 0; continue; }
      const rgbv = pal.get(v) || [90, 90, 90];
      d[o] = rgbv[0]; d[o + 1] = rgbv[1]; d[o + 2] = rgbv[2]; d[o + 3] = 255;
    }

    // Contacts, found rather than drawn: wherever two neighbouring cells are
    // different rock there is a contact between them, and that includes the
    // ones a fault made by putting one unit against another. Inking them from
    // the raster is what makes an offset visible where the same unit sits on
    // both sides of nothing.
    if (doc.settings.showContacts !== false) {
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i;
          const v = code[k];
          if (v === SKY) continue;
          const right = i + 1 < cols ? code[k + 1] : v;
          const down = j + 1 < rows ? code[k + cols] : v;
          if ((right !== v && right !== SKY) || (down !== v && down !== SKY)) {
            const o = k * 4;
            d[o] = d[o] * 0.35; d[o + 1] = d[o + 1] * 0.35; d[o + 2] = d[o + 2] * 0.35;
          }
        }
      }
    }

    g.putImageData(img, 0, 0);
    // What is actually in the picture, for the legend below it.
    const present = [...new Set(code)].filter((v) => v !== SKY).sort((a, b) => a - b);
    return { canvas: off, cols, rows, present };
  }

  /** Faults and erosion surfaces, drawn as the lines they are. */
  _drawStructures(g, doc, frame, PX, PZ) {
    const datums = unconformityDatums(doc);
    for (const e of doc.events) {
      if (e.enabled === false) continue;

      if (e.type === 'fault' || e.type === 'dike') {
        const { normal } = planeFrame(e.strike, e.dip);
        const centers = e.type === 'fault'
          ? [[e.centerX, e.centerY, e.centerZ]]
          : [-1, 1].map((s) => {
            const t = (Math.max(1, e.thickness) * 0.5) * s;
            return [e.centerX + normal[0] * t, e.centerY + normal[1] * t, normal[2] * t];
          });
        for (const c of centers) {
          const seg = planeTrace(frame, normal, c);
          if (!seg) continue;
          g.beginPath();
          g.moveTo(PX(seg[0][0]), PZ(seg[0][1]));
          g.lineTo(PX(seg[1][0]), PZ(seg[1][1]));
          g.setLineDash([]);
          g.strokeStyle = 'rgba(10,14,18,.65)';
          g.lineWidth = e.type === 'fault' ? 3.6 : 2.4;
          g.stroke();
          g.strokeStyle = e.type === 'fault' ? FAULT : '#8ecae6';
          g.lineWidth = e.type === 'fault' ? 1.8 : 1.1;
          g.stroke();
        }
        continue;
      }

      if (e.type === 'unconformity') {
        const d = datums.get(e.id);
        if (!d) continue;
        const surf = { ...e.surface, base: d.base };
        g.beginPath();
        const n = 160;
        for (let i = 0; i <= n; i++) {
          const s = (frame.len * i) / n;
          const [x, y] = frame.at(s);
          const z = surfaceHeight(surf, x, y);
          if (i) g.lineTo(PX(s), PZ(z)); else g.moveTo(PX(s), PZ(z));
        }
        g.setLineDash([]);
        g.strokeStyle = 'rgba(10,14,18,.6)';
        g.lineWidth = 3.2;
        g.stroke();
        g.setLineDash([6, 3]);
        g.strokeStyle = UNCONF;
        g.lineWidth = 1.5;
        g.stroke();
        g.setLineDash([]);
      }
    }
  }

  _drawGroundLine(g, doc, frame, PX, PZ, plotW) {
    const n = Math.max(60, Math.round(plotW));
    const prof = groundProfile(doc, frame, n);
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const s = (frame.len * i) / n;
      if (i) g.lineTo(PX(s), PZ(prof[i])); else g.moveTo(PX(s), PZ(prof[i]));
    }
    g.strokeStyle = 'rgba(10,14,18,.55)';
    g.lineWidth = 3;
    g.stroke();
    g.strokeStyle = SKYLINE;
    g.lineWidth = 1.4;
    g.stroke();
  }

  /**
   * Stations near the line, drawn at the apparent dip.
   *
   * Apparent dip is the point of drawing them at all. A student who lays a
   * 60-degree reading straight on to a section cut oblique to strike has drawn
   * a bed steeper than the rock is, and the number they measured is not the
   * number that belongs in this picture.
   */
  _drawStations(g, frame, PX, PZ) {
    const band = Math.max(40, frame.len * 0.09);
    const readings = projectReadings(this.ctx.readings(), frame, band);
    const L = 11;
    for (const r of readings) {
      const x = PX(r.s);
      const y = PZ(r.z);
      const far = Math.abs(r.offset) > band * 0.4;
      g.save();
      g.globalAlpha = far ? 0.45 : 1;
      if (!r.apparent) {
        g.beginPath();
        g.arc(x, y, 3, 0, Math.PI * 2);
        g.fillStyle = SKYLINE;
        g.fill();
        g.restore();
        continue;
      }
      // The bar lies at the apparent dip, in the plane of the drawing, and
      // therefore carries the same vertical exaggeration the beds do.
      const a = r.apparent.dip * DEG;
      const dx = Math.cos(a) * r.apparent.toward;
      const dz = -Math.sin(a);
      const sxp = this.place.sx;
      const szp = this.place.sz;
      const vx = dx * sxp;
      const vy = -dz * szp;
      const len = Math.hypot(vx, vy) || 1;
      const ux = (vx / len) * L;
      const uy = (vy / len) * L;
      g.lineCap = 'round';
      for (const pass of [0, 1]) {
        g.strokeStyle = pass ? SKYLINE : INK;
        g.lineWidth = pass ? 1.6 : 3.4;
        g.beginPath();
        g.moveTo(x - ux, y - uy);
        g.lineTo(x + ux, y + uy);
        g.stroke();
      }
      g.restore();
    }
  }

  _drawAxes(g, doc, frame, PX, PZ, ox, oy, plotW, plotH) {
    const datum = doc.topo.datum || 0;
    g.font = FONT;
    g.strokeStyle = 'rgba(255,255,255,.16)';
    g.fillStyle = 'rgba(255,255,255,.5)';

    // Elevation, at a round interval chosen for the height of the pane.
    const span = frame.z1 - frame.z0;
    const step = niceStep(span, Math.max(2, Math.floor(plotH / 46)));
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    const first = Math.ceil((frame.z0 + datum) / step) * step;
    for (let v = first; v <= frame.z1 + datum; v += step) {
      const y = PZ(v - datum);
      if (y < oy - 1 || y > oy + plotH + 1) continue;
      g.beginPath();
      g.moveTo(ox - 4, y);
      g.lineTo(ox, y);
      g.stroke();
      g.fillText(`${Math.round(v)}`, ox - 7, y);
    }
    // The axis is named at its head rather than down its side: a rotated word
    // beside five-character elevations is a word sitting on top of them.
    g.textAlign = 'right';
    g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(255,255,255,.38)';
    g.fillText('m', ox - 7, oy - 4);

    // Distance along the line. The end labels are pulled inside the frame
    // rather than centred on their ticks, which is the difference between
    // "2.0 km" and "2.0 k" at the right-hand edge.
    const dStep = niceStep(frame.len, Math.max(2, Math.floor(plotW / 74)));
    g.textBaseline = 'top';
    g.fillStyle = 'rgba(255,255,255,.5)';
    for (let v = 0; v <= frame.len + 1; v += dStep) {
      const x = PX(v);
      g.beginPath();
      g.moveTo(x, oy + plotH);
      g.lineTo(x, oy + plotH + 4);
      g.stroke();
      const near = 16;
      g.textAlign = x - ox < near ? 'left' : ox + plotW - x < near ? 'right' : 'center';
      g.fillText(v >= 1000 ? `${(v / 1000).toFixed(1)} km` : `${Math.round(v)}`, x, oy + plotH + 5);
    }
    g.textBaseline = 'alphabetic';
  }

  /** What the section is made of, in the order it is stacked. */
  legend(doc, h) {
    const present = this._raster?.present || [];
    const pal = sectionPalette(h, doc);
    return present.map((code) => ({ code, ...(pal.get(code) || {}) }))
      .filter((e) => e.label);
  }

  /** The unit at a point on the plot, for a tap. Returns null off the section. */
  identify(clientX, clientY) {
    const p = this.place;
    if (!p) return null;
    const rect = this.plotCanvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < p.ox || x > p.ox + p.plotW || y < p.oy || y > p.oy + p.plotH) return null;
    const s = (x - p.ox) / p.sx;
    const z = p.frame.z1 - (y - p.oy) / p.sz;
    const [wx, wy] = p.frame.at(s);
    const doc = this.ctx.doc();
    if (z > lidAt(doc, wx, wy)) return null;
    const h = this.ctx.history();
    const r = rockAt(h, [wx, wy, z]);
    const datum = doc.topo.datum || 0;
    const where = `${Math.round(s)} m along · ${Math.round(z + datum)} m`;
    if (r.kind === 'basement') return { label: 'Basement', detail: where };
    if (r.kind === 'intrusion') return { label: r.event.name, detail: where };
    return { label: h.layers[r.index]?.name || 'Unit', detail: where };
  }
}

// ---------------------------------------------------------------------------
// The pane
// ---------------------------------------------------------------------------

export function crossSectionPane(ctx) {
  const mapCanvas = el('canvas', { class: 'xs-map' });
  const plotCanvas = el('canvas', { class: 'xs-plot' });
  const view = new CrossSection(mapCanvas, plotCanvas, ctx);

  const sub = el('span', { class: 'stereo-sub', text: 'A–A′' });
  const legend = el('div', { class: 'xs-legend' });
  const note = el('div', { class: 'xs-note' });

  const grip = el('button', {
    class: 'stereo-grip', type: 'button',
    'aria-label': 'Drag to give the section more of the screen',
    title: 'Drag to resize, or tap to cycle',
  });

  const toggle = (label, key, title) => {
    const b = el('button', {
      class: `ground-toggle ${view[key] ? 'on' : ''}`, type: 'button', text: label, title,
      onclick: () => {
        view[key] = !view[key];
        b.classList.toggle('on', view[key]);
        view.draw();
        paintLegend();
      },
    });
    return b;
  };

  // Vertical exaggeration. A pinned value holds across resizes and across a
  // redrawn line, which is what lets two sections be compared with each other
  // rather than each being drawn to whatever happened to fit.
  const veSelect = el('select', {
    class: 'xs-ve', 'aria-label': 'Vertical exaggeration',
  }, VE_STEPS.map((o) => el('option', { value: o.v, text: o.label })));
  veSelect.addEventListener('change', () => ctx.setSectionVE(Number(veSelect.value)));
  const veControl = el('label', {
    class: 'xs-ve-wrap',
    title: 'Vertical exaggeration. Fit fills the pane; a pinned value keeps the '
      + 'whole line on the page and shows the ground down as far as it reaches.',
  }, [el('span', { class: 'xs-ve-label', text: 'VE' }), veSelect,
    el('span', { class: 'xs-ve-caret', text: '▾' })]);

  const swing = (label, fn, title) => el('button', {
    class: 'ground-toggle', type: 'button', text: label, title,
    onclick: () => {
      const box = footprint(ctx.store.doc.block);
      ctx.setSectionLine(fn(box));
    },
  });

  const root = el('div', { class: 'stereo-panel xs-panel hidden' }, [
    grip,
    el('div', { class: 'stereo-head' }, [
      el('h2', { text: 'Cross section' }),
      sub,
      el('button', {
        class: 'stereo-close', type: 'button', text: '×', 'aria-label': 'Hide the section',
        onclick: () => ctx.setSection(false),
      }),
    ]),
    el('div', { class: 'xs-body' }, [
      el('div', { class: 'xs-locator' }, [mapCanvas]),
      el('div', { class: 'xs-plotwrap' }, [plotCanvas]),
    ]),
    note,
    legend,
    el('div', { class: 'xs-foot' }, [
      swing('W–E', (b) => ({
        ax: b.x0 + (b.x1 - b.x0) * 0.05, ay: (b.y0 + b.y1) / 2,
        bx: b.x1 - (b.x1 - b.x0) * 0.05, by: (b.y0 + b.y1) / 2,
      }), 'Cut west to east through the middle'),
      swing('S–N', (b) => ({
        ax: (b.x0 + b.x1) / 2, ay: b.y0 + (b.y1 - b.y0) * 0.05,
        bx: (b.x0 + b.x1) / 2, by: b.y1 - (b.y1 - b.y0) * 0.05,
      }), 'Cut south to north through the middle'),
      el('button', {
        class: 'ground-toggle', type: 'button', text: 'Flip', title: 'Swap which end is A',
        onclick: () => {
          const ln = sectionLine(ctx.store.doc, footprint(ctx.store.doc.block));
          ctx.setSectionLine({ ax: ln.bx, ay: ln.by, bx: ln.ax, by: ln.ay });
        },
      }),
      veControl,
      toggle('Stations', 'showStations', 'Project nearby readings on to the line, at their apparent dip'),
    ]),
  ]);

  // --- dragging the line on the locator ------------------------------------

  let drag = null;
  const hitTest = (e) => {
    const place = view.mapPlace;
    if (!place) return null;
    const rect = mapCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { ox, oy, bw, bh, box } = place;
    const toMap = (px, py) => [
      box.x0 + ((px - ox) / bw) * (box.x1 - box.x0),
      box.y0 + (1 - (py - oy) / bh) * (box.y1 - box.y0),
    ];
    const ln = sectionLine(ctx.store.doc, box);
    const A = [ox + ((ln.ax - box.x0) / (box.x1 - box.x0)) * bw,
      oy + (1 - (ln.ay - box.y0) / (box.y1 - box.y0)) * bh];
    const B = [ox + ((ln.bx - box.x0) / (box.x1 - box.x0)) * bw,
      oy + (1 - (ln.by - box.y0) / (box.y1 - box.y0)) * bh];
    const near = (p) => Math.hypot(p[0] - x, p[1] - y) < 16;
    if (near(A)) return { what: 'a', toMap, ln };
    if (near(B)) return { what: 'b', toMap, ln };
    // Anywhere else on the map starts a fresh line from that point, which is
    // the fastest way to say "cut it here" and is what a tap on a blank map
    // most plausibly means.
    return { what: 'new', toMap, ln, at: toMap(x, y) };
  };

  mapCanvas.addEventListener('pointerdown', (e) => {
    const hit = hitTest(e);
    if (!hit) return;
    mapCanvas.setPointerCapture(e.pointerId);
    e.preventDefault();
    if (hit.what === 'new') {
      drag = { what: 'b', toMap: hit.toMap, anchor: hit.at };
      ctx.setSectionLine({ ax: hit.at[0], ay: hit.at[1], bx: hit.at[0], by: hit.at[1] }, true);
    } else {
      drag = { what: hit.what, toMap: hit.toMap };
    }
  });

  mapCanvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const rect = mapCanvas.getBoundingClientRect();
    const [x, y] = drag.toMap(e.clientX - rect.left, e.clientY - rect.top);
    const box = footprint(ctx.store.doc.block);
    const cx = clamp(x, box.x0, box.x1);
    const cy = clamp(y, box.y0, box.y1);
    const ln = sectionLine(ctx.store.doc, box);
    const next = drag.what === 'a'
      ? { ax: cx, ay: cy, bx: ln.bx, by: ln.by }
      : { ax: ln.ax, ay: ln.ay, bx: cx, by: cy };
    // A line shorter than a pixel has no azimuth and no section; hold the old
    // one until the finger has actually gone somewhere.
    if (Math.hypot(next.bx - next.ax, next.by - next.ay) < 1) return;
    ctx.setSectionLine(next, true);
  });

  const endDrag = () => {
    if (!drag) return;
    drag = null;
    ctx.endSectionDrag();
    view.draw(false);
    paintLegend();
  };
  mapCanvas.addEventListener('pointerup', endDrag);
  mapCanvas.addEventListener('pointercancel', endDrag);

  // --- tapping the section identifies a unit -------------------------------

  plotCanvas.addEventListener('pointerdown', (e) => {
    const hit = view.identify(e.clientX, e.clientY);
    clear(note);
    if (!hit) return;
    note.append(
      el('strong', { text: hit.label }),
      el('span', { text: ` · ${hit.detail}` }),
    );
  });

  const paintLegend = () => {
    const doc = ctx.doc();
    const h = ctx.history();
    clear(legend);
    for (const e of view.legend(doc, h)) {
      legend.appendChild(el('span', { class: 'xs-key' }, [
        el('span', { class: 'unit-dot', style: { background: e.color } }),
        el('span', { text: e.label }),
      ]));
    }
    veSelect.value = String(Number(doc.settings.sectionVE) || 0);
    const f = view.frame;
    if (f) {
      // Whole degrees. A section line is dragged with a finger, and reporting
      // it to a tenth claims a precision the gesture does not have.
      sub.textContent = `${quadrantBearing(Math.round(f.az) % 360)} · ${
        f.len >= 1000 ? `${(f.len / 1000).toFixed(2)} km` : `${Math.round(f.len)} m`}`;
    }
  };

  root.setVisible = (on) => {
    root.classList.toggle('hidden', !on);
    if (on) requestAnimationFrame(() => { view.draw(); paintLegend(); });
  };
  // A coarse draw is only ever a stand-in, so every one of them books the
  // proper draw that replaces it. Without that, a fold dragged and released
  // would leave the low-resolution version on screen until something else
  // happened to change.
  let settle = null;
  root.refresh = (quick = false) => {
    if (root.classList.contains('hidden')) return;
    clearTimeout(settle);
    view.draw(quick);
    paintLegend();
    if (quick) {
      settle = setTimeout(() => {
        if (root.classList.contains('hidden')) return;
        view.draw(false);
        paintLegend();
      }, 200);
    }
  };
  root.grip = grip;
  root.view = view;
  return root;
}

// ---------------------------------------------------------------------------

function fitCanvas(c, w, h) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return g;
}

/** Hex colours, parsed once, so the per-pixel loop is array reads. */
function paletteRGB(pal) {
  const out = new Map();
  for (const [code, v] of pal) out.set(code, hexRGB(v.color));
  return out;
}

function hexRGB(hex) {
  const s = String(hex || '#888').replace('#', '');
  const n = s.length === 3
    ? parseInt(s.split('').map((c) => c + c).join(''), 16)
    : parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Everything the raster depends on, and nothing that it does not. */
function sectionKey(doc, frame, cols, rows) {
  return JSON.stringify([
    doc.events, doc.layers.map((l) => [l.rockId, l.thickness, l.color]),
    doc.basementRockId, topoKey(doc.topo), doc.settings.showContacts !== false,
    sliceCut(doc), [frame.ax, frame.ay, frame.bx, frame.by, frame.z0, frame.z1],
    cols, rows,
  ]);
}

function mapKey(doc, n) {
  return JSON.stringify([
    doc.events, doc.layers.map((l) => [l.rockId, l.thickness, l.color]),
    doc.basementRockId, topoKey(doc.topo), doc.block, sliceCut(doc), n,
  ]);
}

function topoKey(t) { return isDemSurface(t) ? `dem:${t.id}` : t; }

/** One decimal at most, and no trailing zero: 2, not 2.0. */
function round1(v) {
  return String(v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
}

/** A tick interval a map would use, giving about `target` ticks over `span`. */
function niceStep(span, target) {
  const raw = span / Math.max(1, target);
  const pow = 10 ** Math.floor(Math.log10(Math.max(1e-6, raw)));
  const n = raw / pow;
  const step = n <= 1.5 ? 1 : n <= 3.5 ? 2 : n <= 7.5 ? 5 : 10;
  return step * pow;
}
