// The frame the two halves share.
//
// A block is metres, X east, Y north, origin in the middle. A map is longitude
// and latitude. Nothing in the app converted between them until a block could
// be cut from a mapped field area, and this is the conversion — plus the
// sampled ground that gives such a block its lid.
//
// No DOM and no three.js here, the same rule as the rest of field/.

import {
  lonToWorld, latToWorld, worldToLon, worldToLat, worldPerMeter,
  tileRange, rangeTiles, clampLat, distance,
} from './geo.js';
import { demTile, DEM_TILE, sampleGrid } from './dem.js';
import { source } from './tiles.js';
import { demSurface } from '../geo/surfaces.js';

/**
 * A block's frame, pinned to a place.
 *
 * Web Mercator rather than a local tangent plane, deliberately: the map canvas
 * already draws in Mercator, so a station converted this way lands on exactly
 * the pixel the map drew it on, and a predicted contact traced in block metres
 * can be drawn back over the map without a second projection to disagree with.
 * Across a few kilometres the scale error against true ground distance is under
 * a tenth of a percent, which is far inside the DEM's own ten metres.
 */
export function georef(lon0, lat0, width, depth) {
  return {
    lon0, lat0, width, depth,
    wpm: worldPerMeter(lat0),
    wx0: lonToWorld(lon0),
    wy0: latToWorld(clampLat(lat0)),
  };
}

/** The georeference a block document carries, rebuilt into working form. */
export function georefOf(doc) {
  const g = doc && doc.georef;
  return g ? georef(g.lon0, g.lat0, g.width, g.depth) : null;
}

/** What a block document stores: four numbers, and no derived ones. */
export function georefRecord(g) {
  return { lon0: g.lon0, lat0: g.lat0, width: g.width, depth: g.depth };
}

/** Real coordinates -> block metres. */
export function toBlock(g, lon, lat) {
  return [
    (lonToWorld(lon) - g.wx0) / g.wpm,
    -(latToWorld(clampLat(lat)) - g.wy0) / g.wpm,
  ];
}

/** Block metres -> real coordinates. */
export function toLonLat(g, x, y) {
  return [
    worldToLon(g.wx0 + x * g.wpm),
    worldToLat(g.wy0 - y * g.wpm),
  ];
}

/** Is this map position inside the block's footprint? */
export function inBlock(g, x, y) {
  return Math.abs(x) <= g.width / 2 && Math.abs(y) <= g.depth / 2;
}

/** The lon/lat bounding box of a block's footprint. */
export function georefBbox(g) {
  const [wLon, sLat] = toLonLat(g, -g.width / 2, g.depth / 2);
  const [eLon, nLat] = toLonLat(g, g.width / 2, -g.depth / 2);
  return [wLon, sLat, eLon, nLat];
}

/** A georeference from a dragged box, centred on it and square in metres. */
export function georefFromBbox(bbox) {
  const lon0 = (bbox[0] + bbox[2]) / 2;
  const lat0 = (bbox[1] + bbox[3]) / 2;
  const width = distance(bbox[0], lat0, bbox[2], lat0);
  const depth = distance(lon0, bbox[1], lon0, bbox[3]);
  return georef(lon0, lat0, Math.round(width), Math.round(depth));
}

// ---------------------------------------------------------------------------
// The ground itself
// ---------------------------------------------------------------------------

/**
 * How many samples across the block's lid. The renderer meshes the lid at 96
 * squares a side, so sampling much finer than that buys nothing you can see,
 * and a heightfield has to be small enough to sit inside a saved document.
 */
export const GROUND_RES = 193;

/**
 * Sample the real ground over a block footprint and hand it back as a surface
 * the block renderer already knows how to cap a block with.
 *
 * Cache-first, through the same reader the map draws with, so a block can be
 * cut from a downloaded area on a ridge with no signal — which is the only
 * reason any of this is offline in the first place. `allowNetwork: false`
 * makes a missing tile a miss rather than a silent fetch.
 *
 * Rows run south to north, which is the block's Y and is upside down from the
 * way a tile is stored.
 */
export async function groundFor(g, { res = GROUND_RES, zoom, allowNetwork = true, onProgress } = {}) {
  const src = source('dem');
  const z = Math.min(src.maxZoom, zoom ?? src.maxZoom - 1);
  const tiles = [...rangeTiles(tileRange(georefBbox(g), z))];

  const grids = new Map();
  let fetched = 0;
  for (const t of tiles) {
    grids.set(`${t.x}/${t.y}`, await demTile(z, t.x, t.y, { allowNetwork }));
    if (onProgress) onProgress(++fetched, tiles.length);
  }

  const n = Math.pow(2, z);
  const out = new Float32Array(res * res);
  let missing = 0;
  for (let j = 0; j < res; j++) {
    const y = -g.depth / 2 + (j / (res - 1)) * g.depth;
    for (let i = 0; i < res; i++) {
      const x = -g.width / 2 + (i / (res - 1)) * g.width;
      const px = (g.wx0 + x * g.wpm) * n * DEM_TILE;
      const py = (g.wy0 - y * g.wpm) * n * DEM_TILE;
      const tx = Math.floor(px / DEM_TILE);
      const ty = Math.floor(py / DEM_TILE);
      const grid = grids.get(`${tx}/${ty}`);
      if (!grid) { out[j * res + i] = NaN; missing++; continue; }
      out[j * res + i] = sampleGrid(
        grid, DEM_TILE, DEM_TILE,
        px - tx * DEM_TILE - 0.5, py - ty * DEM_TILE - 0.5,
      );
    }
  }
  if (missing) fillHoles(out, res);

  // A block's Z is metres about its own datum, and a landscape two kilometres
  // above the sea is not two kilometres of block. So the mean ground becomes
  // zero and the real elevation is carried alongside — a station's height has
  // to be reported as metres above sea level, not metres above the middle of
  // somebody's model.
  let lo = Infinity, hi = -Infinity;
  for (const v of out) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const datum = Math.round((lo + hi) / 2);
  for (let k = 0; k < out.length; k++) out[k] -= datum;

  return {
    surface: demSurface(out, res, res, g.width, g.depth, {
      datum,
      id: groundId(g, res, z),
      lon0: g.lon0, lat0: g.lat0,
    }),
    datum,
    zoom: z,
    tiles: tiles.length,
    // Counted, not assumed. An area short of elevation tiles gives a block
    // with invented ground in it, and that has to be sayable.
    missing,
    complete: missing === 0,
  };
}

function groundId(g, res, z) {
  return `${g.lon0.toFixed(5)},${g.lat0.toFixed(5)}@${Math.round(g.width)}x${Math.round(g.depth)}/${res}/${z}`;
}

/**
 * A tile the source does not publish leaves NaN, and one NaN in the lid
 * poisons every normal that touches it. Fill from the nearest real neighbours
 * rather than from zero: a hole at sea level in the middle of a mountain reads
 * as a sinkhole and drags the whole block's base down with it.
 */
function fillHoles(grid, res) {
  const near = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let pass = 0; pass < 60; pass++) {
    let left = 0;
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const k = j * res + i;
        if (!Number.isNaN(grid[k])) continue;
        let sum = 0, cnt = 0;
        for (const [di, dj] of near) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= res || b >= res) continue;
          const v = grid[b * res + a];
          if (!Number.isNaN(v)) { sum += v; cnt++; }
        }
        if (cnt) grid[k] = sum / cnt; else left++;
      }
    }
    if (!left) return;
  }
  for (let k = 0; k < grid.length; k++) if (Number.isNaN(grid[k])) grid[k] = 0;
}

// ---------------------------------------------------------------------------
// Serialising a heightfield
// ---------------------------------------------------------------------------
// A block cut from real ground has to survive being saved, exported and opened
// again on a phone that has never downloaded that area. So the samples travel
// with the document rather than being re-fetched.
//
// Decimetres as 16-bit integers about the block's own datum: the DEM is good
// to about ten metres, so a tenth of a metre is already far more precision
// than the numbers deserve, and it makes a 193 x 193 lid 74 kB before base64
// rather than 149 kB of float.

export function packGround(surface) {
  const n = surface.grid.length;
  const q = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    q[i] = Math.max(-32767, Math.min(32767, Math.round(surface.grid[i] * 10)));
  }
  const bytes = new Uint8Array(q.buffer);
  let s = '';
  // Chunked: String.fromCharCode spread over 75k arguments overflows the
  // argument stack on Safari.
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return {
    kind: 'dem',
    nx: surface.nx, ny: surface.ny,
    width: surface.width, depth: surface.depth,
    datum: surface.datum, id: surface.id,
    lon0: surface.lon0, lat0: surface.lat0,
    encoding: 'i16dm',
    samples: btoa(s),
  };
}

export function unpackGround(rec) {
  if (!rec || rec.encoding !== 'i16dm' || typeof rec.samples !== 'string') return null;
  const bin = atob(rec.samples);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const q = new Int16Array(bytes.buffer);
  const grid = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) grid[i] = q[i] / 10;
  return demSurface(grid, rec.nx, rec.ny, rec.width, rec.depth, {
    datum: rec.datum, id: rec.id, lon0: rec.lon0, lat0: rec.lat0,
  });
}
