// The map: a slippy raster map drawn by hand on a 2D canvas.
//
// Written rather than borrowed because the whole feature turns on controlling
// exactly what happens when a tile is not there, and every map library's
// answer to that is to ask the network — which is precisely the thing that
// does not work on a ridge. Here a miss is a miss, it is drawn as one, and it
// is counted so the app can say the area is incomplete before the student is
// standing in it.
//
// Three things it does that a general-purpose map would not:
//
//   - falls back to a parent tile rather than a gray square, so a partly
//     downloaded area degrades into a blurry map instead of a broken one
//   - draws terrain from cached elevation numbers, so contours stay sharp
//     past zoom 16 where the photography stops
//   - never silently reaches for the network when the browser says offline

import { TILE, lonToWorld, latToWorld, worldToLon, worldToLat,
  metersPerPixel } from '../../field/geo.js';
import { readTileBitmap, source } from '../../field/tiles.js';
import { renderDemTile } from '../../field/dem.js';
import { drawStation, drawPosition, drawSelection, drawAreaOutline, drawLine,
  distanceToLine } from './symbols.js';
import { unitColor } from '../../field/model.js';

const MIN_ZOOM = 4;
const MAX_ZOOM = 19;          // past the imagery, where the contours carry it
const BITMAP_LIMIT = 220;
const TAP_SLOP = 10;          // px of movement still counted as a tap
const TAP_MS = 450;

export class MapCanvas {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onTap = opts.onTap || (() => {});
    this.onMove = opts.onMove || (() => {});
    // Fired only for a hand on the map, never for a programmatic move. The
    // difference matters: following your position moves the map constantly,
    // and something has to be able to tell that apart from being dragged.
    this.onUserMove = opts.onUserMove || (() => {});
    this.onVertexDrag = opts.onVertexDrag || (() => {});
    this.onVertexDragEnd = opts.onVertexDragEnd || (() => {});
    this.onCoverage = opts.onCoverage || (() => {});

    this.center = { x: lonToWorld(-109.549), y: latToWorld(38.573) };
    this.zoom = 13;
    this.dpr = 1;
    this.width = 0;
    this.height = 0;

    this.baseLayer = 'topo';
    this.showHillshade = false;
    this.showContours = false;
    this.contourInterval = 0;
    this.stations = [];
    this.lines = [];
    this.selectedLineId = null;
    this.draftLine = null;      // the one being drawn right now
    this.activeVertex = null;   // { target, index } — the one last touched
    this.units = [];
    this.patches = [];
    this.areas = [];
    // The flooded shading, rebuilt only when the lines or the seeds change.
    // It is derived from the contacts, so it has no business being stored and
    // every business being cached.
    this._shade = null;
    this.selectedId = null;
    this.labelStations = true;
    this.showStations = true;
    this.fix = null;
    this.fixStale = false;
    this.selection = null;      // bbox being drawn for a download

    this._tiles = new Map();    // "src/z/x/y" -> { bitmap, from }
    this._pending = new Set();
    this._dem = new Map();      // "z/x/y|scale|interval" -> { canvas }
    this._demPending = new Set();
    this._frame = null;
    this._coverage = { wanted: 0, drawn: 0, missing: 0, fromCache: 0, absent: 0 };

    this._pointers = new Map();
    this._gesture = null;
    this._bind();

    // Sizing follows the element rather than a moment.
    //
    // Doing it once on a requestAnimationFrame looks like it works and then
    // does not: the frame never arrives if the app was opened straight into
    // the map with the screen off, and nothing at all re-runs when the bottom
    // sheet is dragged from peek to full — which changes the map's height by
    // half the screen. An observer catches the sheet, the rotation and the
    // cold start with one mechanism, and it repairs itself if any of them is
    // missed.
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(canvas);
    }
    // Nothing paints while the tab is hidden, so anything asked for in the
    // meantime is owed on the way back.
    this._onVisible = () => { if (!document.hidden) this.invalidate(); };
    document.addEventListener('visibilitychange', this._onVisible);

    this.resize();
  }

  // -------------------------------------------------------------------------
  // Camera
  // -------------------------------------------------------------------------

  /** World pixels across the whole planet at the current zoom. */
  get worldSize() { return TILE * Math.pow(2, this.zoom); }

  get lon() { return worldToLon(this.center.x); }
  get lat() { return worldToLat(this.center.y); }

  get metersPerPixel() { return metersPerPixel(this.lat, this.zoom); }

  setView(lon, lat, zoom) {
    this.center.x = lonToWorld(lon);
    this.center.y = latToWorld(lat);
    if (zoom != null) this.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    this.invalidate();
    this.onMove();
  }

  panBy(dxPx, dyPx) {
    const w = this.worldSize;
    this.center.x = wrapX(this.center.x - dxPx / w);
    this.center.y = clamp(this.center.y - dyPx / w, 0, 1);
    this.invalidate();
    this.onMove();
  }

  /** Zoom about a screen point, so a pinch keeps its focus under the fingers. */
  zoomAround(nextZoom, px, py) {
    const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    if (z === this.zoom) return;
    const before = this.screenToWorld(px, py);
    this.zoom = z;
    const after = this.screenToWorld(px, py);
    this.center.x = wrapX(this.center.x + (before.x - after.x));
    this.center.y = clamp(this.center.y + (before.y - after.y), 0, 1);
    this.invalidate();
    this.onMove();
  }

  fitBounds(bbox, padding = 0.12) {
    const [w, s, e, n] = bbox;
    const x0 = lonToWorld(w), x1 = lonToWorld(e);
    const y0 = latToWorld(n), y1 = latToWorld(s);
    const dx = Math.max(1e-9, x1 - x0), dy = Math.max(1e-9, y1 - y0);
    const zx = Math.log2(this.width / (TILE * dx * (1 + padding)));
    const zy = Math.log2(this.height / (TILE * dy * (1 + padding)));
    this.center.x = (x0 + x1) / 2;
    this.center.y = (y0 + y1) / 2;
    this.zoom = clamp(Math.min(zx, zy), MIN_ZOOM, MAX_ZOOM);
    this.invalidate();
    this.onMove();
  }

  // -------------------------------------------------------------------------
  // Coordinates
  // -------------------------------------------------------------------------

  screenToWorld(px, py) {
    const w = this.worldSize;
    return {
      x: this.center.x + (px - this.width / 2) / w,
      y: this.center.y + (py - this.height / 2) / w,
    };
  }

  worldToScreen(x, y) {
    const w = this.worldSize;
    return {
      x: (x - this.center.x) * w + this.width / 2,
      y: (y - this.center.y) * w + this.height / 2,
    };
  }

  screenToLonLat(px, py) {
    const p = this.screenToWorld(px, py);
    return { lon: worldToLon(p.x), lat: worldToLat(p.y) };
  }

  lonLatToScreen(lon, lat) {
    return this.worldToScreen(lonToWorld(lon), latToWorld(lat));
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  resize() {
    const r = this.canvas.getBoundingClientRect();
    // Hidden, or not laid out yet. Keep the last real size rather than
    // collapsing to a pixel — setting canvas.width also wipes what is drawn,
    // so a stray call while the section is switched away would blank the map
    // and then have nothing to redraw it at.
    if (r.width < 2 || r.height < 2) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = Math.round(r.width), h = Math.round(r.height);
    if (w === this.width && h === this.height && dpr === this.dpr) return;
    this.dpr = dpr;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.invalidate();
  }

  invalidate() {
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      this.render();
    });
  }

  render() {
    const ctx = this.ctx;
    if (!this.width || !this.height) return;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#10161b';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const cov = { wanted: 0, drawn: 0, missing: 0, fromCache: 0, absent: 0 };
    this._drawBase(ctx, cov);
    if (this.showHillshade || this.showContours) this._drawTerrain(ctx);
    this._drawAreas(ctx);
    // Unit shading goes under the lines it was flooded to, the way a printed
    // map lays colour under its contacts rather than over them.
    this._drawUnits(ctx);
    // Lines go under the stations: a contact is context for a reading, and a
    // reading should never be hidden by the line it helped place.
    this._drawLines(ctx);
    if (this.showStations) this._drawStations(ctx);
    if (this.fix) this._drawFix(ctx);
    if (this.selection) this._drawSelection(ctx);

    ctx.restore();

    if (cov.wanted !== this._coverage.wanted || cov.missing !== this._coverage.missing) {
      this._coverage = cov;
      this.onCoverage(cov);
    }
  }

  /** Which tile grid to draw, given a source cannot go as deep as the view. */
  _tileZoomFor(sourceId) {
    const s = source(sourceId);
    return Math.max(s.minZoom, Math.min(s.maxZoom, Math.floor(this.zoom)));
  }

  _visibleRange(tileZ) {
    const n = Math.pow(2, tileZ);
    const w = this.worldSize;
    const left = this.center.x - (this.width / 2) / w;
    const right = this.center.x + (this.width / 2) / w;
    const top = this.center.y - (this.height / 2) / w;
    const bottom = this.center.y + (this.height / 2) / w;
    return {
      x0: Math.floor(left * n), x1: Math.floor(right * n),
      y0: Math.max(0, Math.floor(top * n)), y1: Math.min(n - 1, Math.floor(bottom * n)),
      n,
    };
  }

  _drawBase(ctx, cov) {
    const sourceId = this.baseLayer;
    const z = this._tileZoomFor(sourceId);
    const r = this._visibleRange(z);
    const w = this.worldSize;
    const size = w / r.n;

    for (let x = r.x0; x <= r.x1; x++) {
      for (let y = r.y0; y <= r.y1; y++) {
        const tx = ((x % r.n) + r.n) % r.n;
        const sx = (x / r.n - this.center.x) * w + this.width / 2;
        const sy = (y / r.n - this.center.y) * w + this.height / 2;
        cov.wanted++;
        const how = this._blit(ctx, sourceId, z, tx, y, sx, sy, size);
        if (how === 'ok' || how === 'parent' || how === 'absent') cov.drawn++;
        else cov.missing++;
        if (how === 'ok') cov.fromCache++;
        if (how === 'absent') cov.absent++;
      }
    }
  }

  /**
   * Draw one tile, or the best ancestor of it that is already held.
   *
   * The fallback is what makes a partly downloaded area usable rather than
   * alarming: zooming in past what was cached gives a soft map, not a hole,
   * and the student can still see where they are on it.
   */
  _blit(ctx, sourceId, z, x, y, sx, sy, size) {
    const t = this._tiles.get(tk(sourceId, z, x, y));
    if (t && t.bitmap) {
      ctx.drawImage(t.bitmap, sx, sy, size + 0.5, size + 0.5);
      return 'ok';
    }
    this._want(sourceId, z, x, y);
    // A tile the source does not publish is drawn from its parent and is not
    // reported as a gap in the download — nothing is going to fill it in.
    const absent = t && t.from === 'absent';

    const min = source(sourceId).minZoom;
    for (let up = 1; up <= 5 && z - up >= min; up++) {
      const f = 1 << up;
      const px = Math.floor(x / f), py = Math.floor(y / f);
      const p = this._tiles.get(tk(sourceId, z - up, px, py));
      if (!p || !p.bitmap) continue;
      const sub = TILE / f;
      ctx.drawImage(p.bitmap, (x - px * f) * sub, (y - py * f) * sub, sub, sub,
        sx, sy, size + 0.5, size + 0.5);
      return absent ? 'absent' : 'parent';
    }

    // Nothing to show. A flat dark square rather than a guess, with a hatch so
    // it never gets mistaken for a lake or a shadow.
    ctx.save();
    ctx.fillStyle = '#151c22';
    ctx.fillRect(sx, sy, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -size; i < size; i += 14) {
      ctx.moveTo(sx + i, sy); ctx.lineTo(sx + i + size, sy + size);
    }
    ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, size, size); ctx.clip();
    ctx.stroke(); ctx.restore();
    ctx.restore();
    return absent ? 'absent' : t ? 'missing' : 'loading';
  }

  _want(sourceId, z, x, y) {
    const key = tk(sourceId, z, x, y);
    if (this._pending.has(key) || this._tiles.has(key)) return;
    this._pending.add(key);
    // Offline, a fetch cannot help and would only stall the queue behind a
    // timeout. Ask the cache and take the answer.
    readTileBitmap(sourceId, z, x, y, { allowNetwork: navigator.onLine !== false })
      .then(({ bitmap, from }) => {
        this._pending.delete(key);
        this._tiles.set(key, { bitmap, from });
        this._trim();
        if (bitmap) this.invalidate();
        else this.invalidate();
      })
      .catch(() => {
        this._pending.delete(key);
        this._tiles.set(key, { bitmap: null, from: 'error' });
      });
  }

  _trim() {
    while (this._tiles.size > BITMAP_LIMIT) {
      const k = this._tiles.keys().next().value;
      const v = this._tiles.get(k);
      v?.bitmap?.close?.();
      this._tiles.delete(k);
    }
  }

  _drawTerrain(ctx) {
    const s = source('dem');
    const z = Math.max(s.minZoom, Math.min(s.maxZoom, Math.floor(this.zoom)));
    // How far the elevation grid is being stretched. Past its own zoom the
    // grid is interpolated up before the contours are traced, which is what
    // keeps them thin instead of turning into a staircase.
    const scale = clamp(Math.pow(2, Math.round(this.zoom) - z), 1, 4);
    const r = this._visibleRange(z);
    const w = this.worldSize;
    const size = w / r.n;

    for (let x = r.x0; x <= r.x1; x++) {
      for (let y = r.y0; y <= r.y1; y++) {
        const tx = ((x % r.n) + r.n) % r.n;
        const key = `${z}/${tx}/${y}|${scale}|${this.contourInterval}|${this.showHillshade ? 1 : 0}${this.showContours ? 1 : 0}`;
        const hit = this._dem.get(key);
        if (hit && hit.canvas) {
          const sx = (x / r.n - this.center.x) * w + this.width / 2;
          const sy = (y / r.n - this.center.y) * w + this.height / 2;
          ctx.drawImage(hit.canvas, sx, sy, size + 0.5, size + 0.5);
        } else if (!this._demPending.has(key)) {
          this._demPending.add(key);
          renderDemTile(z, tx, y, {
            scale,
            interval: this.contourInterval,
            hillshade: this.showHillshade,
            contours: this.showContours,
            allowNetwork: navigator.onLine !== false,
          }).then((res) => {
            this._demPending.delete(key);
            this._dem.set(key, res || { canvas: null });
            while (this._dem.size > 60) this._dem.delete(this._dem.keys().next().value);
            if (res) this.invalidate();
          }).catch(() => this._demPending.delete(key));
        }
      }
    }
  }

  /**
   * Translucent unit colour, the way a geologic map is printed over its base:
   * the topo sheet or the photograph has to read through it, or the map stops
   * being a map of anywhere.
   *
   * Drawn from a grid in world coordinates, which is linear in screen space,
   * so the whole thing is one drawImage however far it is panned or zoomed.
   */
  _drawUnits(ctx) {
    const shade = this._shade;
    if (!shade || !shade.canvas) return;
    const a = this.worldToScreen(shade.box.x0, shade.box.y0);
    const b = this.worldToScreen(shade.box.x1, shade.box.y1);
    ctx.save();
    ctx.globalAlpha = 0.46;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(shade.canvas, a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.restore();
  }

  /** Hand in a rendered shading grid, or null to clear it. */
  setUnitShading(shade) {
    this._shade = shade;
    this.invalidate();
  }

  _drawAreas(ctx) {
    for (const a of this.areas) {
      const p0 = this.lonLatToScreen(a.bbox[0], a.bbox[3]);
      const p1 = this.lonLatToScreen(a.bbox[2], a.bbox[1]);
      if (p1.x < -40 || p0.x > this.width + 40 || p1.y < -40 || p0.y > this.height + 40) continue;
      drawAreaOutline(ctx, p0.x, p0.y, p1.x, p1.y, { complete: !!a.check?.complete });
    }
  }

  _drawLines(ctx) {
    const project = (line) => line.points.map((p) => this.lonLatToScreen(p[0], p[1]));
    for (const line of this.lines) {
      if (!line.points || line.points.length < 2) continue;
      const selected = line.id === this.selectedLineId;
      drawLine(ctx, project(line), line, {
        selected,
        active: selected && this.activeVertex?.target === line.id
          ? this.activeVertex.index : -1,
      });
    }
    if (this.draftLine && this.draftLine.points.length) {
      const pts = project(this.draftLine);
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffc857';
        ctx.fill();
        ctx.strokeStyle = 'rgba(8,12,15,.75)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        drawLine(ctx, pts, this.draftLine, {
          drawing: true,
          active: this.activeVertex?.target === 'draft' ? this.activeVertex.index : -1,
        });
      }
    }
  }

  /**
   * The vertex nearest a touch, on whichever line is currently editable.
   *
   * Only the line being drawn and the selected line offer handles. Every line
   * on the map offering them would make it impossible to pan across a busy
   * sheet without grabbing something.
   */
  _vertexAt(px, py, slop = 22) {
    let best = null;
    const scan = (line, target) => {
      if (!line || !line.points) return;
      for (let i = 0; i < line.points.length; i++) {
        const p = this.lonLatToScreen(line.points[i][0], line.points[i][1]);
        const d = Math.hypot(px - p.x, py - p.y);
        if (d < slop && (!best || d < best.d)) best = { target, index: i, d };
      }
    };
    scan(this.draftLine, 'draft');
    if (this.selectedLineId) {
      scan(this.lines.find((l) => l.id === this.selectedLineId), this.selectedLineId);
    }
    return best;
  }

  /** The line nearest a tap, within a finger's width. */
  lineAt(px, py, slop = 18) {
    let best = null, bestD = slop;
    for (const line of this.lines) {
      if (!line.points || line.points.length < 2) continue;
      const d = distanceToLine(line.points.map((p) => this.lonLatToScreen(p[0], p[1])), px, py);
      if (d < bestD) { bestD = d; best = line; }
    }
    return best;
  }

  _drawStations(ctx) {
    const byId = new Map(this.units.map((u) => [u.id, u]));
    // The selected one is drawn last so it is never buried under a neighbour.
    const list = this.stations.filter((s) => s.id !== this.selectedId);
    const sel = this.stations.find((s) => s.id === this.selectedId);
    const draw = (st) => {
      const p = this.lonLatToScreen(st.lon, st.lat);
      if (p.x < -60 || p.x > this.width + 60 || p.y < -60 || p.y > this.height + 60) return;
      const unit = st.unitId ? byId.get(st.unitId) : null;
      drawStation(ctx, p.x, p.y, st, {
        color: unit ? unitColor(unit) : '#ffc857',
        selected: st.id === this.selectedId,
        label: this.labelStations && st.name ? st.name : null,
      });
    };
    for (const st of list) draw(st);
    if (sel) draw(sel);
  }

  _drawFix(ctx) {
    const p = this.lonLatToScreen(this.fix.lon, this.fix.lat);
    const perM = 1 / this.metersPerPixel;
    drawPosition(ctx, p.x, p.y, {
      accuracyPx: (this.fix.accuracy || 0) * perM,
      heading: this.fix.heading,
      good: this.fix.good,
      stale: this.fixStale,
    });
  }

  _drawSelection(ctx) {
    const p0 = this.lonLatToScreen(this.selection[0], this.selection[3]);
    const p1 = this.lonLatToScreen(this.selection[2], this.selection[1]);
    drawSelection(ctx, p0.x, p0.y, p1.x, p1.y);
  }

  // -------------------------------------------------------------------------
  // Gestures
  // -------------------------------------------------------------------------

  _bind() {
    const c = this.canvas;
    c.style.touchAction = 'none';

    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 });
      if (this._pointers.size === 1) {
        const local = this._local(e);
        let kind = this.selection ? this._handleAt(local.x, local.y) || 'pan' : 'pan';
        if (kind === 'pan') {
          const v = this._vertexAt(local.x, local.y);
          if (v) {
            kind = `vertex:${v.target}:${v.index}`;
            this.activeVertex = { target: v.target, index: v.index };
            this.invalidate();
          }
        }
        this._gesture = { kind, startX: e.clientX, startY: e.clientY };
      } else if (this._pointers.size === 2) {
        this._gesture = { kind: 'pinch', ...this._pinchState() };
      }
    });

    c.addEventListener('pointermove', (e) => {
      const p = this._pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.moved += Math.hypot(dx, dy);
      p.x = e.clientX; p.y = e.clientY;

      if (this._pointers.size === 2 && this._gesture?.kind === 'pinch') {
        const now = this._pinchState();
        const g = this._gesture;
        if (g.dist > 0 && now.dist > 0) {
          this.zoomAround(g.zoom + Math.log2(now.dist / g.dist), now.mx, now.my);
          this.onUserMove();
        }
        return;
      }
      if (this._pointers.size !== 1) return;

      if (this._gesture?.kind === 'pan') {
        this.panBy(dx, dy);
        this.onUserMove();
      } else if (this._gesture?.kind?.startsWith('corner:')) {
        this._dragCorner(this._gesture.kind.slice(7), e);
      } else if (this._gesture?.kind?.startsWith('vertex:')) {
        const [, target, idx] = this._gesture.kind.split(':');
        const local = this._local(e);
        this.onVertexDrag(target, Number(idx), this.screenToLonLat(local.x, local.y));
      }
    });

    const release = (e) => {
      const p = this._pointers.get(e.pointerId);
      this._pointers.delete(e.pointerId);
      if (this._pointers.size === 1) {
        // Coming out of a pinch with a finger still down would otherwise
        // fling the map by the whole distance between the two fingers.
        this._gesture = { kind: 'pan' };
        const [only] = [...this._pointers.values()];
        if (only) { only.x = only.x; only.y = only.y; }
      } else if (this._pointers.size === 0) {
        const wasPinch = this._gesture?.kind === 'pinch';
        const wasVertex = !!this._gesture?.kind?.startsWith('vertex:');
        this._gesture = null;
        if (wasVertex) this.onVertexDragEnd();
        // A touch that started on a vertex is never a tap, or picking one up
        // while drawing would drop a new point on top of it.
        if (p && !wasPinch && !wasVertex && p.moved < TAP_SLOP && performance.now() - p.t < TAP_MS) {
          const local = this._local(e);
          this.onTap(this.screenToLonLat(local.x, local.y), local);
        }
      }
    };
    c.addEventListener('pointerup', release);
    c.addEventListener('pointercancel', (e) => { this._pointers.delete(e.pointerId); this._gesture = null; });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const local = this._local(e);
      this.zoomAround(this.zoom - e.deltaY * 0.0022, local.x, local.y);
      this.onUserMove();
    }, { passive: false });
  }

  _local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _pinchState() {
    const [a, b] = [...this._pointers.values()];
    const r = this.canvas.getBoundingClientRect();
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mx: (a.x + b.x) / 2 - r.left,
      my: (a.y + b.y) / 2 - r.top,
      zoom: this.zoom,
    };
  }

  /** Which corner of the download box a finger landed on, if any. */
  _handleAt(px, py) {
    if (!this.selection) return null;
    const [w, s, e, n] = this.selection;
    const corners = {
      nw: this.lonLatToScreen(w, n), ne: this.lonLatToScreen(e, n),
      sw: this.lonLatToScreen(w, s), se: this.lonLatToScreen(e, s),
    };
    for (const [name, p] of Object.entries(corners)) {
      if (Math.hypot(px - p.x, py - p.y) < 28) return `corner:${name}`;
    }
    return null;
  }

  _dragCorner(corner, e) {
    const local = this._local(e);
    const { lon, lat } = this.screenToLonLat(local.x, local.y);
    const b = [...this.selection];
    if (corner.includes('w')) b[0] = lon; else b[2] = lon;
    if (corner.includes('s')) b[1] = lat; else b[3] = lat;
    this.selection = [Math.min(b[0], b[2]), Math.min(b[1], b[3]),
      Math.max(b[0], b[2]), Math.max(b[1], b[3])];
    this.invalidate();
    this.onMove();
  }

  /** Start a download box framed on what is currently in view. */
  beginSelection(inset = 0.14) {
    const a = this.screenToLonLat(this.width * inset, this.height * (1 - inset));
    const b = this.screenToLonLat(this.width * (1 - inset), this.height * inset);
    this.selection = [Math.min(a.lon, b.lon), Math.min(a.lat, b.lat),
      Math.max(a.lon, b.lon), Math.max(a.lat, b.lat)];
    this.invalidate();
    return this.selection;
  }

  clearSelection() { this.selection = null; this.invalidate(); }

  destroy() {
    this._ro?.disconnect();
    document.removeEventListener('visibilitychange', this._onVisible);
    this.purge();
  }

  /** Forget every decoded tile — after clearing the cache, or changing layer. */
  purge() {
    for (const v of this._tiles.values()) v?.bitmap?.close?.();
    this._tiles.clear();
    this._dem.clear();
    this.invalidate();
  }
}

function tk(src, z, x, y) { return `${src}/${z}/${x}/${y}`; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function wrapX(x) { return x - Math.floor(x); }

export { MIN_ZOOM, MAX_ZOOM };
