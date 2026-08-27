// Terrain: heights, hillshade and contour lines, all worked out on the phone
// from cached elevation tiles.
//
// This is the layer that answers the map's worst constraint. The imagery and
// the topo sheets stop at zoom 16, so past that they go soft — but elevation
// is numbers, not a picture, and a contour traced from numbers is a line with
// no resolution at all. Zoom in on an outcrop and the photograph blurs while
// the contours stay exactly as sharp as the screen can draw them.
//
// It is also where a station's elevation comes from. A phone's GPS altitude is
// routinely tens of meters out, and the terrain under a known latitude and
// longitude is not.

import { metersPerPixel, tileOf, tileBounds, lonToWorld, latToWorld } from './geo.js';
import { readTileBitmap, source } from './tiles.js';
// Moved to geo/marching.js when the block started tracing its own predicted
// outcrop pattern with the same code. Re-exported so callers here are unchanged.
import { traceContours, levelsFor } from '../geo/marching.js';

export { traceContours, levelsFor };

export const DEM_TILE = 256;

/**
 * A drawing surface off screen.
 *
 * OffscreenCanvas only arrived in Safari 16.4, and a student's phone is
 * exactly the device most likely to be a few versions behind. A detached
 * <canvas> does the same job here — nothing is being handed to a worker — so
 * fall back to one rather than leaving those phones with no terrain.
 */
function scratchCanvas(w, h) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/**
 * Terrarium encoding: the height is a 24-bit number split across the three
 * color channels, offset so that the sea floor is still positive.
 *
 *   elevation = (R * 256 + G + B / 256) - 32768   meters
 */
export function decodeTerrarium(rgba, w = DEM_TILE, h = DEM_TILE) {
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = rgba[p] * 256 + rgba[p + 1] + rgba[p + 2] / 256 - 32768;
  }
  return out;
}

/** Sample a grid with bilinear interpolation, clamping at the edges. */
export function sampleGrid(grid, w, h, fx, fy) {
  const x = Math.max(0, Math.min(w - 1, fx));
  const y = Math.max(0, Math.min(h - 1, fy));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const tx = x - x0, ty = y - y0;
  const a = grid[y0 * w + x0], b = grid[y0 * w + x1];
  const c = grid[y1 * w + x0], d = grid[y1 * w + x1];
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

/** Bilinear upsample, so contours traced at high zoom come out smooth. */
export function upsample(grid, w, h, scale) {
  if (scale <= 1) return { grid, w, h };
  const W = w * scale, H = h * scale;
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = (y + 0.5) / scale - 0.5;
    for (let x = 0; x < W; x++) {
      out[y * W + x] = sampleGrid(grid, w, h, (x + 0.5) / scale - 0.5, fy);
    }
  }
  return { grid: out, w: W, h: H };
}

// ---------------------------------------------------------------------------
// Reading elevation
// ---------------------------------------------------------------------------

const decoded = new Map();      // "z/x/y" -> Float32Array
const DECODE_LIMIT = 64;

/**
 * The decoded height grid for one elevation tile, or null if it is not cached
 * and cannot be fetched.
 */
export async function demTile(z, x, y, opts = {}) {
  const key = `${z}/${x}/${y}`;
  if (decoded.has(key)) {
    const hit = decoded.get(key);
    // Touch it, so the eviction below drops what is genuinely coldest.
    decoded.delete(key); decoded.set(key, hit);
    return hit;
  }
  const { bitmap } = await readTileBitmap('dem', z, x, y, opts);
  if (!bitmap) return null;

  // Take the dimensions before releasing the bitmap: a closed ImageBitmap
  // reports 0 x 0, and reading them afterwards yields an empty grid and an
  // elevation of null for every point on Earth.
  const w = bitmap.width, h = bitmap.height;
  const c = scratchCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  bitmap.close?.();
  const grid = decodeTerrarium(img.data, w, h);

  decoded.set(key, grid);
  while (decoded.size > DECODE_LIMIT) decoded.delete(decoded.keys().next().value);
  return grid;
}

/**
 * Ground elevation at a point, in meters.
 *
 * Returns null rather than a number when the tile is not held, because a
 * station recorded at "0 m" because the terrain was missing is worse than one
 * recorded with no elevation at all.
 */
export async function elevationAt(lon, lat, opts = {}) {
  const z = Math.min(source('dem').maxZoom, opts.zoom ?? source('dem').maxZoom);
  const t = tileOf(lon, lat, z);
  const grid = await demTile(z, t.x, t.y, opts);
  if (!grid) return null;
  const n = Math.pow(2, z);
  const fx = (lonToWorld(lon) * n - t.x) * DEM_TILE;
  const fy = (latToWorld(lat) * n - t.y) * DEM_TILE;
  const v = sampleGrid(grid, DEM_TILE, DEM_TILE, fx - 0.5, fy - 0.5);
  // Terrarium marks unknown ocean floor at the bottom of its range.
  return v < -11000 ? null : v;
}

// ---------------------------------------------------------------------------
// Hillshade
// ---------------------------------------------------------------------------

/**
 * Horn's slope and aspect, lit from the north-west.
 *
 * North-west is not a preference, it is a convention with a reason: shown lit
 * from below-right most people read the ridges as valleys and the valleys as
 * ridges, and once seen that way a map is very hard to un-see.
 *
 * The result is a transparent overlay — shadow in black, highlight in white —
 * so the same shade can lie over a topo sheet or over a photograph without
 * washing either of them out.
 */
export function hillshadeImageData(grid, w, h, {
  cellSize = 30, azimuth = 315, altitude = 45, zFactor = 1, strength = 0.55,
} = {}) {
  const out = new ImageData(w, h);
  const px = out.data;
  const azRad = (360 - azimuth + 90) * Math.PI / 180;
  const zenRad = (90 - altitude) * Math.PI / 180;
  const cosZen = Math.cos(zenRad), sinZen = Math.sin(zenRad);
  const at = (x, y) => grid[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = at(x - 1, y - 1), b = at(x, y - 1), c = at(x + 1, y - 1);
      const d = at(x - 1, y),                        f = at(x + 1, y);
      const g = at(x - 1, y + 1), hh = at(x, y + 1), i = at(x + 1, y + 1);

      const dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * cellSize) * zFactor;
      const dzdy = ((g + 2 * hh + i) - (a + 2 * b + c)) / (8 * cellSize) * zFactor;

      const slope = Math.atan(Math.hypot(dzdx, dzdy));
      let aspect = Math.atan2(dzdy, -dzdx);
      if (aspect < 0) aspect += 2 * Math.PI;

      let shade = cosZen * Math.cos(slope) + sinZen * Math.sin(slope) * Math.cos(azRad - aspect);
      shade = Math.max(0, Math.min(1, shade));

      const p = (y * w + x) * 4;
      // Flat ground must come out completely transparent, or the shade lays a
      // veil over every plain and washes out the sheet underneath. Level
      // ground does not shade to a half — it shades to cos(zenith), which
      // moves whenever the light angle does. So that value is the neutral
      // point, and everything is painted as its departure from it.
      if (shade >= cosZen) {
        px[p] = 255; px[p + 1] = 255; px[p + 2] = 255;
        px[p + 3] = Math.round(((shade - cosZen) / Math.max(1e-6, 1 - cosZen)) * strength * 190);
      } else {
        px[p] = 0; px[p + 1] = 0; px[p + 2] = 0;
        px[p + 3] = Math.round(((cosZen - shade) / Math.max(1e-6, cosZen)) * strength * 255);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contours
// ---------------------------------------------------------------------------

/**
 * An interval that gives roughly a dozen lines for the relief in view — the
 * same rule the block diagram's contours use, and for the same reason: a fixed
 * interval is either a solid wash in the mountains or a blank sheet on a
 * plain. Rounded to intervals a geologist actually sees on a map.
 */
const NICE_INTERVALS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500];

export function chooseInterval(relief, want = 12) {
  if (!Number.isFinite(relief) || relief <= 0) return 20;
  const raw = relief / want;
  for (const v of NICE_INTERVALS) if (v >= raw) return v;
  return NICE_INTERVALS[NICE_INTERVALS.length - 1];
}

export function gridRange(grid) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i];
    if (v < -11000) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return Number.isFinite(lo) ? { lo, hi } : { lo: 0, hi: 0 };
}

// ---------------------------------------------------------------------------
// Rendering one terrain tile
// ---------------------------------------------------------------------------

const rendered = new Map();
const RENDER_LIMIT = 48;

/**
 * Hillshade and contours for one elevation tile, drawn once and kept.
 *
 * `scale` is how many screen pixels the tile is being stretched to per source
 * pixel. Past the elevation data's own zoom the grid is interpolated up before
 * the contours are traced, so the lines stay smooth and thin instead of
 * turning into the staircase that scaling a finished image would give.
 */
export async function renderDemTile(z, x, y, opts = {}) {
  const {
    scale = 1, interval = 0, hillshade = true, contours = true,
    allowNetwork = true,
  } = opts;
  const key = `${z}/${x}/${y}|${scale}|${interval}|${hillshade ? 1 : 0}|${contours ? 1 : 0}`;
  if (rendered.has(key)) {
    const hit = rendered.get(key);
    rendered.delete(key); rendered.set(key, hit);
    return hit;
  }

  const base = await demTile(z, x, y, { allowNetwork });
  if (!base) return null;

  const up = upsample(base, DEM_TILE, DEM_TILE, scale);
  const bounds = tileBounds(z, x, y);
  const midLat = (bounds[1] + bounds[3]) / 2;
  const cellSize = metersPerPixel(midLat, z);
  const { lo, hi } = gridRange(base);
  const step = interval > 0 ? interval : chooseInterval(hi - lo);

  const canvas = scratchCanvas(up.w, up.h);
  const ctx = canvas.getContext('2d');

  if (hillshade) {
    ctx.putImageData(hillshadeImageData(up.grid, up.w, up.h, { cellSize: cellSize / scale }), 0, 0);
  }

  if (contours && hi > lo) {
    const levels = levelsFor(lo, hi, step);
    const lines = traceContours(up.grid, up.w, up.h, levels);
    ctx.lineCap = 'round';
    for (const { level, seg } of lines) {
      // Every fifth line heavier, the way a map prints index contours.
      const index = Math.abs(level / step) % 5 < 0.001;
      ctx.strokeStyle = index ? 'rgba(60, 40, 20, .78)' : 'rgba(70, 50, 30, .45)';
      ctx.lineWidth = (index ? 1.6 : 0.9) * Math.min(2, scale);
      ctx.beginPath();
      for (let i = 0; i < seg.length; i += 4) {
        ctx.moveTo(seg[i], seg[i + 1]);
        ctx.lineTo(seg[i + 2], seg[i + 3]);
      }
      ctx.stroke();
    }
  }

  const result = { canvas, interval: step, lo, hi };
  rendered.set(key, result);
  while (rendered.size > RENDER_LIMIT) rendered.delete(rendered.keys().next().value);
  return result;
}

/** Drop the caches — after clearing tiles, or when settings change wholesale. */
export function clearDemCaches() {
  decoded.clear();
  rendered.clear();
}
